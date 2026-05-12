import cors from "cors";
import express from "express";
import multer from "multer";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "@repo/db";
import { createRenderQueue } from "@repo/queue";
import { RenderStatus } from "@repo/types";

const app = express();
const renderQueue = createRenderQueue();

const outputDir = process.env.OUTPUT_DIR ?? resolve(process.cwd(), "../../services/renderer/output");
const modelsDir = process.env.MODELS_DIR ?? resolve(process.cwd(), "../../services/renderer/models");
const chairBlendSrc = process.env.CHAIR_BLEND_SRC ?? resolve(process.cwd(), "../../services/renderer/chair.blend");
const chairThumbSrc = process.env.CHAIR_THUMB_SRC ?? resolve(process.cwd(), "../../services/renderer/chair-thumb.png");

const ALLOWED_BLEND_EXT = ".blend";
const ALLOWED_THUMBNAIL_EXTS = new Set([".png", ".jpg", ".jpeg"]);
const MAX_BLEND_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024; // 5 MB

// Multer: store files in a temp staging area; we move them per-model after DB record created
const upload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, cb) => {
      const dir = resolve(modelsDir, "_tmp");
      await mkdir(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: MAX_BLEND_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    if (file.fieldname === "blendFile" && ext === ALLOWED_BLEND_EXT) {
      cb(null, true);
    } else if (file.fieldname === "thumbnail" && ALLOWED_THUMBNAIL_EXTS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type for field "${file.fieldname}": ${ext}`));
    }
  },
});

app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

app.post("/models", upload.fields([
  { name: "blendFile", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 },
]), async (req, res) => {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const blendFile = files?.["blendFile"]?.[0];
  const thumbnailFile = files?.["thumbnail"]?.[0];

  const name = (req.body?.name as string | undefined)?.trim();
  const description = (req.body?.description as string | undefined)?.trim() || null;

  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }
  if (!blendFile) {
    return res.status(400).json({ error: "blendFile (.blend) is required" });
  }
  if (blendFile.size > MAX_BLEND_BYTES) {
    return res.status(400).json({ error: "blendFile exceeds 100 MB limit" });
  }
  if (thumbnailFile && thumbnailFile.size > MAX_THUMBNAIL_BYTES) {
    return res.status(400).json({ error: "thumbnail exceeds 5 MB limit" });
  }

  const modelId = randomUUID();
  const modelDir = resolve(modelsDir, modelId);
  await mkdir(modelDir, { recursive: true });

  const blendDest = resolve(modelDir, "model.blend");
  await copyFile(blendFile.path, blendDest);

  let thumbnailDest: string | null = null;
  if (thumbnailFile) {
    const ext = extname(thumbnailFile.originalname).toLowerCase();
    thumbnailDest = resolve(modelDir, `thumbnail${ext}`);
    await copyFile(thumbnailFile.path, thumbnailDest);
  }

  const model = await prisma.model3D.create({
    data: {
      id: modelId,
      name,
      description,
      blendFilePath: blendDest,
      thumbnailPath: thumbnailDest,
    },
  });

  console.log(JSON.stringify({ event: "model_created", modelId: model.id, name: model.name }));

  return res.status(201).json({
    id: model.id,
    name: model.name,
    description: model.description,
    thumbnailPath: model.thumbnailPath ? `/models/${model.id}/thumbnail` : null,
    createdAt: model.createdAt.toISOString(),
  });
});

app.get("/models", async (_req, res) => {
  const models = await prisma.model3D.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, description: true, thumbnailPath: true, createdAt: true },
  });

  type ModelRow = (typeof models)[number];
  return res.json(models.map((m: ModelRow) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    thumbnailUrl: m.thumbnailPath ? `/models/${m.id}/thumbnail` : null,
    createdAt: m.createdAt.toISOString(),
  })));
});

app.get("/models/:id", async (req, res) => {
  const model = await prisma.model3D.findUnique({ where: { id: req.params.id } });
  if (!model) return res.status(404).json({ error: "model not found" });

  return res.json({
    id: model.id,
    name: model.name,
    description: model.description,
    thumbnailUrl: model.thumbnailPath ? `/models/${model.id}/thumbnail` : null,
    createdAt: model.createdAt.toISOString(),
  });
});

app.get("/models/:id/thumbnail", async (req, res) => {
  const model = await prisma.model3D.findUnique({ where: { id: req.params.id } });
  if (!model || !model.thumbnailPath) {
    return res.status(404).json({ error: "thumbnail not found" });
  }

  try {
    const data = await readFile(model.thumbnailPath);
    const ext = extname(model.thumbnailPath).toLowerCase();
    const contentType = ext === ".png" ? "image/png" : "image/jpeg";
    res.setHeader("Content-Type", contentType);
    return res.send(data);
  } catch {
    return res.status(404).json({ error: "thumbnail file not found on disk" });
  }
});

// ---------------------------------------------------------------------------
// Renders
// ---------------------------------------------------------------------------

app.post("/render", async (req, res) => {
  const { modelId, items, aiEnhance } = req.body ?? {};

  if (!modelId || typeof modelId !== "string") {
    return res.status(400).json({ error: "modelId is required" });
  }

  const model = await prisma.model3D.findUnique({ where: { id: modelId } });
  if (!model) {
    return res.status(404).json({ error: "model not found" });
  }

  const render = await prisma.render.create({
    data: {
      status: RenderStatus.pending,
      modelId,
      items: items ?? null,
      aiEnhance: aiEnhance === true,
    },
  });

  console.log(JSON.stringify({
    event: "render_created",
    renderId: render.id,
    modelId,
    aiEnhance: render.aiEnhance,
  }));

  await renderQueue.add("render-room", { renderId: render.id }, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  });

  return res.status(202).json({ id: render.id, status: render.status, aiEnhance: render.aiEnhance });
});

app.get("/render/:id", async (req, res) => {
  const render = await prisma.render.findUnique({ where: { id: req.params.id } });
  if (!render) return res.status(404).json({ error: "render not found" });

  return res.json({
    id: render.id,
    status: render.status,
    modelId: render.modelId,
    items: render.items,
    imageUrl: render.imageUrl,
    aiEnhance: render.aiEnhance,
    createdAt: render.createdAt.toISOString(),
  });
});

app.get("/renders", async (_req, res) => {
  const renders = await prisma.render.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { model: { select: { name: true } } },
  });
  return res.json(
    renders.map((r) => ({
      id: r.id,
      status: r.status,
      modelId: r.modelId,
      modelName: r.model.name,
      imageUrl: r.imageUrl,
      createdAt: r.createdAt.toISOString(),
    }))
  );
});

app.get("/render/:id/image", async (req, res) => {
  const renderId = req.params.id;

  try {
    const imagePath = resolve(outputDir, `${renderId}.png`);
    const { size: fileSizeBytes } = await stat(imagePath);
    const imageData = await readFile(imagePath);

    console.log(JSON.stringify({ event: "image_served", renderId, fileSizeBytes }));
    res.setHeader("Content-Type", "image/png");
    return res.send(imageData);
  } catch {
    return res.status(404).json({ error: "image not found" });
  }
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function seedChairModel() {
  const count = await prisma.model3D.count();
  if (count > 0) return;

  try {
    await stat(chairBlendSrc);
  } catch {
    console.log(JSON.stringify({ event: "seed_skip", reason: "chair.blend not found", path: chairBlendSrc }));
    return;
  }

  const modelId = randomUUID();
  const modelDir = resolve(modelsDir, modelId);
  await mkdir(modelDir, { recursive: true });

  const blendDest = resolve(modelDir, "model.blend");
  await copyFile(chairBlendSrc, blendDest);

  let thumbDest: string | null = null;
  try {
    await stat(chairThumbSrc);
    thumbDest = resolve(modelDir, "thumbnail.png");
    await copyFile(chairThumbSrc, thumbDest);
  } catch {
    // thumbnail optional
  }

  await prisma.model3D.create({
    data: {
      id: modelId,
      name: "Chair",
      description: "Default chair scene",
      blendFilePath: blendDest,
      thumbnailPath: thumbDest,
    },
  });

  console.log(JSON.stringify({ event: "model_seeded", modelId, name: "Chair", blendFilePath: blendDest, thumbnailPath: thumbDest }));
}

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
app.listen(port, async () => {
  await mkdir(outputDir, { recursive: true });
  await mkdir(modelsDir, { recursive: true });

  console.log(JSON.stringify({ event: "api_started", port, outputDir, modelsDir }));

  try {
    await seedChairModel();
  } catch (err) {
    console.error(JSON.stringify({ event: "seed_error", error: String(err) }));
  }
});

