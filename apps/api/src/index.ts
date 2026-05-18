import cors from "cors";
import express from "express";
import multer from "multer";
import { copyFile, mkdir, readFile, rm, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { prisma, RenderStatus } from "@repo/db";
import { createRenderQueue, createConvertQueue } from "@repo/queue";
import { isConfigured as storageConfigured, isStorageKey, upload as storageUpload } from "@repo/storage";

const app = express();
const renderQueue = createRenderQueue();
const convertQueue = createConvertQueue();

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
// Prevent browsers and proxies from caching render status poll responses.
app.use("/render", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
app.use("/renders", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
app.use("/models", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });

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

  // Always write locally first (multer temp → model dir), then optionally upload to S3.
  const blendLocal = resolve(modelDir, "model.blend");
  await copyFile(blendFile.path, blendLocal);

  let thumbnailLocal: string | null = null;
  if (thumbnailFile) {
    const ext = extname(thumbnailFile.originalname).toLowerCase();
    thumbnailLocal = resolve(modelDir, `thumbnail${ext}`);
    await copyFile(thumbnailFile.path, thumbnailLocal);
  }

  let blendFilePath = blendLocal;
  let thumbnailPath = thumbnailLocal;

  if (storageConfigured()) {
    const blendKey = `models/${modelId}/model.blend`;
    blendFilePath = blendKey; // Store S3 key in DB
    await storageUpload(blendKey, blendLocal, "application/octet-stream");
    await rm(blendLocal).catch(() => {});

    if (thumbnailLocal) {
      const ext = extname(thumbnailLocal);
      const thumbKey = `models/${modelId}/thumbnail${ext}`;
      thumbnailPath = await storageUpload(thumbKey, thumbnailLocal, ext === ".png" ? "image/png" : "image/jpeg");
      await rm(thumbnailLocal).catch(() => {});
    }
  }

  const model = await prisma.model3D.create({
    data: { id: modelId, name, description, blendFilePath, thumbnailPath },
  });

  console.log(JSON.stringify({ event: "model_created", modelId: model.id, name: model.name, storage: storageConfigured() ? "s3" : "local" }));

  // Queue background GLB conversion — fire-and-forget, does not block the response.
  await convertQueue.add("convert-gltf", { modelId }, {
    attempts: 2,
    backoff: { type: "exponential", delay: 3000 },
  });

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
    gltfReady: model.gltfFilePath != null,
    gltfConversionError: model.gltfConversionError ?? null,
    createdAt: model.createdAt.toISOString(),
  });
});

app.put("/models/:id", upload.fields([
  { name: "blendFile", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 },
]), async (req, res) => {
  const modelId = req.params.id as string;
  const model = await prisma.model3D.findUnique({ where: { id: modelId } });
  if (!model) return res.status(404).json({ error: "model not found" });

  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const blendFile = files?.["blendFile"]?.[0];
  const thumbnailFile = files?.["thumbnail"]?.[0];

  // Collect prisma update data — only include fields that were provided.
  const updateData: Partial<{
    name: string;
    description: string | null;
    blendFilePath: string;
    thumbnailPath: string | null;
    gltfFilePath: string | null;
    gltfConversionError: string | null;
  }> = {};

  const rawName = (req.body?.name as string | undefined)?.trim();
  if (rawName) updateData.name = rawName;

  if ("description" in (req.body ?? {})) {
    updateData.description = (req.body.description as string | undefined)?.trim() || null;
  }

  const modelDir = resolve(modelsDir, modelId);
  await mkdir(modelDir, { recursive: true });

  let newBlendUploaded = false;

  if (blendFile) {
    if (blendFile.size > MAX_BLEND_BYTES) {
      return res.status(400).json({ error: "blendFile exceeds 100 MB limit" });
    }

    // Remove old local blend file (best-effort).
    if (model.blendFilePath && !model.blendFilePath.startsWith("http") && !isStorageKey(model.blendFilePath)) {
      await rm(model.blendFilePath).catch(() => {});
    }
    // Remove old local GLB file (best-effort).
    if (model.gltfFilePath && !model.gltfFilePath.startsWith("http") && !isStorageKey(model.gltfFilePath)) {
      await rm(model.gltfFilePath).catch(() => {});
    }

    const blendLocal = resolve(modelDir, "model.blend");
    await copyFile(blendFile.path, blendLocal);

    if (storageConfigured()) {
      const blendKey = `models/${modelId}/model.blend`;
      await storageUpload(blendKey, blendLocal, "application/octet-stream");
      await rm(blendLocal).catch(() => {});
      updateData.blendFilePath = blendKey;
    } else {
      updateData.blendFilePath = blendLocal;
    }

    // Null out the GLB — will be regenerated by the conversion job.
    updateData.gltfFilePath = null;
    updateData.gltfConversionError = null;
    newBlendUploaded = true;
  }

  if (thumbnailFile) {
    if (thumbnailFile.size > MAX_THUMBNAIL_BYTES) {
      return res.status(400).json({ error: "thumbnail exceeds 5 MB limit" });
    }

    // Remove old local thumbnail (best-effort).
    if (model.thumbnailPath && !model.thumbnailPath.startsWith("http") && !isStorageKey(model.thumbnailPath)) {
      await rm(model.thumbnailPath).catch(() => {});
    }

    const ext = extname(thumbnailFile.originalname).toLowerCase();
    const thumbnailLocal = resolve(modelDir, `thumbnail${ext}`);
    await copyFile(thumbnailFile.path, thumbnailLocal);

    if (storageConfigured()) {
      const thumbKey = `models/${modelId}/thumbnail${ext}`;
      const thumbUrl = await storageUpload(thumbKey, thumbnailLocal, ext === ".png" ? "image/png" : "image/jpeg");
      await rm(thumbnailLocal).catch(() => {});
      updateData.thumbnailPath = thumbUrl;
    } else {
      updateData.thumbnailPath = thumbnailLocal;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ error: "No fields provided to update" });
  }

  const updated = await prisma.model3D.update({
    where: { id: modelId },
    data: updateData,
  });

  console.log(JSON.stringify({ event: "model_updated", modelId, fields: Object.keys(updateData), newBlend: newBlendUploaded }));

  if (newBlendUploaded) {
    await convertQueue.add("convert-gltf", { modelId }, {
      attempts: 2,
      backoff: { type: "exponential", delay: 3000 },
    });
    console.log(JSON.stringify({ event: "convert_queued", modelId, reason: "blend_replaced" }));
  }

  return res.json({
    id: updated.id,
    name: updated.name,
    description: updated.description,
    thumbnailUrl: updated.thumbnailPath ? `/models/${updated.id}/thumbnail` : null,
    gltfReady: updated.gltfFilePath != null,
    gltfConversionError: updated.gltfConversionError ?? null,
    createdAt: updated.createdAt.toISOString(),
  });
});

app.get("/models/:id/thumbnail", async (req, res) => {
  const model = await prisma.model3D.findUnique({ where: { id: req.params.id } });
  if (!model || !model.thumbnailPath) {
    return res.status(404).json({ error: "thumbnail not found" });
  }

  // If thumbnail is a full URL (stored in S3), redirect to it.
  if (model.thumbnailPath.startsWith("http")) {
    return res.redirect(302, model.thumbnailPath);
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

type PrismaRenderWithModel = {
  id: string;
  status: string;
  modelId: string;
  items: unknown;
  imageUrl: string | null;
  aiEnhance: boolean;
  createdAt: Date;
  queuedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  lastHeartbeatAt: Date | null;
  progress: number;
  progressLabel: string | null;
  lastLogLine: string | null;
  errorMessage: string | null;
  attempts: number;
  retriedFromId: string | null;
  model?: { name: string };
};

function serializeRender(r: PrismaRenderWithModel) {
  return {
    id: r.id,
    status: r.status,
    modelId: r.modelId,
    modelName: r.model?.name ?? null,
    items: r.items,
    imageUrl: r.imageUrl,
    aiEnhance: r.aiEnhance,
    createdAt: r.createdAt.toISOString(),
    queuedAt: r.queuedAt.toISOString(),
    startedAt: r.startedAt?.toISOString() ?? null,
    completedAt: r.completedAt?.toISOString() ?? null,
    lastHeartbeatAt: r.lastHeartbeatAt?.toISOString() ?? null,
    progress: r.progress,
    progressLabel: r.progressLabel,
    lastLogLine: r.lastLogLine,
    errorMessage: r.errorMessage,
    attempts: r.attempts,
    retriedFromId: r.retriedFromId,
  };
}

const ACTIVE_STATUSES: RenderStatus[] = [RenderStatus.queued, RenderStatus.processing];

app.post("/render", async (req, res) => {
  const { modelId, items, aiEnhance } = req.body ?? {};

  if (!modelId || typeof modelId !== "string") {
    return res.status(400).json({ error: "modelId is required" });
  }

  const model = await prisma.model3D.findUnique({ where: { id: modelId } });
  if (!model) {
    return res.status(404).json({ error: "model not found" });
  }

  // Prevent duplicate: one active render per model at a time.
  const existing = await prisma.render.findFirst({
    where: { modelId, status: { in: ACTIVE_STATUSES } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true },
  });
  if (existing) {
    return res.status(409).json({
      error: "ACTIVE_RENDER_EXISTS",
      existingRenderId: existing.id,
      status: existing.status,
    });
  }

  const now = new Date();
  const render = await prisma.render.create({
    data: {
      status: RenderStatus.queued,
      modelId,
      items: items ?? null,
      aiEnhance: aiEnhance === true,
      queuedAt: now,
    },
  });

  console.log(JSON.stringify({ event: "render_created", renderId: render.id, modelId, aiEnhance: render.aiEnhance }));

  await renderQueue.add("render-room", { renderId: render.id }, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  });

  return res.status(202).json({ id: render.id, status: render.status, aiEnhance: render.aiEnhance });
});

// GET /models/:id/renders — filterable render history for a model.
app.get("/models/:id/renders", async (req, res) => {
  const modelId = req.params.id;
  const model = await prisma.model3D.findUnique({ where: { id: modelId }, select: { id: true } });
  if (!model) return res.status(404).json({ error: "model not found" });

  const rawStatus = typeof req.query.status === "string" ? req.query.status : null;
  const statusFilter = rawStatus
    ? rawStatus.split(",").filter((s) => Object.values(RenderStatus).includes(s as RenderStatus)) as RenderStatus[]
    : null;

  const limit = Math.min(Number(req.query.limit ?? 10), 100);
  const offset = Number(req.query.offset ?? 0);

  const [renders, total] = await prisma.$transaction([
    prisma.render.findMany({
      where: { modelId, ...(statusFilter ? { status: { in: statusFilter } } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: { model: { select: { name: true } } },
    }),
    prisma.render.count({
      where: { modelId, ...(statusFilter ? { status: { in: statusFilter } } : {}) },
    }),
  ]);

  return res.json({ renders: renders.map(serializeRender), total });
});

// POST /render/:id/retry — creates a new render from a failed/stalled one.
app.post("/render/:id/retry", async (req, res) => {
  const original = await prisma.render.findUnique({ where: { id: req.params.id } });
  if (!original) return res.status(404).json({ error: "render not found" });

  if (original.status !== RenderStatus.failed && original.status !== RenderStatus.stalled) {
    return res.status(409).json({
      error: "RENDER_NOT_RETRYABLE",
      message: `Cannot retry a render with status '${original.status}'. Only failed or stalled renders can be retried.`,
    });
  }

  // Block if the model already has another active render (e.g. concurrent retry clicks).
  const activeRender = await prisma.render.findFirst({
    where: { modelId: original.modelId, status: { in: ACTIVE_STATUSES } },
    select: { id: true, status: true },
  });
  if (activeRender) {
    return res.status(409).json({
      error: "ACTIVE_RENDER_EXISTS",
      existingRenderId: activeRender.id,
      status: activeRender.status,
    });
  }

  const now = new Date();
  const newRender = await prisma.render.create({
    data: {
      status: RenderStatus.queued,
      modelId: original.modelId,
      // Prisma JsonValue includes null; cast to InputJsonValue to satisfy the create type.
      items: original.items as Parameters<typeof prisma.render.create>[0]["data"]["items"],
      aiEnhance: original.aiEnhance,
      queuedAt: now,
      retriedFromId: original.id,
    },
    include: { model: { select: { name: true } } },
  });

  console.log(JSON.stringify({ event: "render_retry", newRenderId: newRender.id, originalRenderId: original.id }));

  await renderQueue.add("render-room", { renderId: newRender.id }, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  });

  return res.status(201).json(serializeRender(newRender));
});

app.get("/render/:id", async (req, res) => {
  const render = await prisma.render.findUnique({
    where: { id: req.params.id },
    include: { model: { select: { name: true } } },
  });
  if (!render) return res.status(404).json({ error: "render not found" });

  return res.json(serializeRender(render));
});

app.get("/renders", async (req, res) => {
  const rawModelId = typeof req.query.modelId === "string" ? req.query.modelId : null;

  const renders = await prisma.render.findMany({
    where: rawModelId ? { modelId: rawModelId } : {},
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { model: { select: { name: true } } },
  });
  return res.json(renders.map(serializeRender));
});

app.get("/models/:id/gltf", async (req, res) => {
  const model = await prisma.model3D.findUnique({ where: { id: req.params.id }, select: { gltfFilePath: true } });
  if (!model) return res.status(404).json({ error: "model not found" });
  if (!model.gltfFilePath) return res.status(404).json({ error: "GLB not ready yet" });

  // Always proxy the file through the API so the browser never hits the storage
  // origin directly — avoids CORS issues when the bucket has no CORS headers set.
  if (model.gltfFilePath.startsWith("http") || isStorageKey(model.gltfFilePath)) {
    // Resolve S3 key to a public URL if needed (rare: worker normally stores the URL).
    const url = model.gltfFilePath.startsWith("http")
      ? model.gltfFilePath
      : `${process.env.STORAGE_PUBLIC_URL ?? ""}/${model.gltfFilePath}`;
    try {
      const upstream = await fetch(url);
      if (!upstream.ok) {
        return res.status(502).json({ error: "Failed to fetch GLB from storage" });
      }
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.setHeader("Content-Type", "model/gltf-binary");
      res.setHeader("Content-Disposition", `inline; filename="model.glb"`);
      return res.send(buffer);
    } catch {
      return res.status(502).json({ error: "Storage fetch failed" });
    }
  }

  try {
    const data = await readFile(model.gltfFilePath);
    res.setHeader("Content-Type", "model/gltf-binary");
    res.setHeader("Content-Disposition", `inline; filename="model.glb"`);
    return res.send(data);
  } catch {
    return res.status(404).json({ error: "GLB file not found on disk" });
  }
});

// POST /models/:id/convert — re-queues a GLB conversion job for an existing model.
// Useful when the automatic conversion failed or the GLB is missing.
app.post("/models/:id/convert", async (req, res) => {
  const model = await prisma.model3D.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!model) return res.status(404).json({ error: "model not found" });

  await convertQueue.add("convert-gltf", { modelId: model.id }, {
    attempts: 2,
    backoff: { type: "exponential", delay: 3000 },
  });

  return res.status(202).json({ queued: true });
});

app.get("/render/:id/image", async (req, res) => {
  const renderId = req.params.id;

  // If the render has an S3 imageUrl, redirect there directly.
  const render = await prisma.render.findUnique({ where: { id: renderId }, select: { imageUrl: true } });
  if (render?.imageUrl?.startsWith("http")) {
    return res.redirect(302, render.imageUrl);
  }

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

  const blendLocal = resolve(modelDir, "model.blend");
  await copyFile(chairBlendSrc, blendLocal);

  let thumbLocal: string | null = null;
  try {
    await stat(chairThumbSrc);
    thumbLocal = resolve(modelDir, "thumbnail.png");
    await copyFile(chairThumbSrc, thumbLocal);
  } catch {
    // thumbnail optional
  }

  let blendFilePath = blendLocal;
  let thumbnailPath = thumbLocal;

  if (storageConfigured()) {
    const blendKey = `models/${modelId}/model.blend`;
    blendFilePath = blendKey;
    await storageUpload(blendKey, blendLocal, "application/octet-stream");
    await rm(blendLocal).catch(() => {});

    if (thumbLocal) {
      const thumbKey = `models/${modelId}/thumbnail.png`;
      thumbnailPath = await storageUpload(thumbKey, thumbLocal, "image/png");
      await rm(thumbLocal).catch(() => {});
    }
  }

  await prisma.model3D.create({
    data: { id: modelId, name: "Chair", description: "Default chair scene", blendFilePath, thumbnailPath },
  });

  console.log(JSON.stringify({ event: "model_seeded", modelId, name: "Chair", storage: storageConfigured() ? "s3" : "local" }));
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

