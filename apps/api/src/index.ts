import cors from "cors";
import express from "express";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { prisma } from "@repo/db";
import { createRenderQueue } from "@repo/queue";
import { RenderStatus } from "@repo/types";

const app = express();
const renderQueue = createRenderQueue();
const outputDir = process.env.OUTPUT_DIR ?? resolve(process.cwd(), "../../services/renderer/output");

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/render", async (req, res) => {
  const items = req.body?.items;

  if (!Array.isArray(items)) {
    return res.status(400).json({ error: "items must be an array" });
  }

  const render = await prisma.render.create({
    data: {
      status: RenderStatus.pending,
      items
    }
  });

  console.log(JSON.stringify({
    event: "render_created",
    renderId: render.id,
    status: render.status,
    itemCount: items.length
  }));

  // The API only enqueues work; heavy rendering is delegated to workers.
  await renderQueue.add("render-room", { renderId: render.id }, {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000
    }
  });

  return res.status(202).json({
    id: render.id,
    status: render.status
  });
});

app.get("/render/:id", async (req, res) => {
  const render = await prisma.render.findUnique({
    where: { id: req.params.id }
  });

  if (!render) {
    console.log(JSON.stringify({
      event: "render_not_found",
      renderId: req.params.id
    }));
    return res.status(404).json({ error: "render not found" });
  }

  console.log(JSON.stringify({
    event: "render_status_queried",
    renderId: render.id,
    status: render.status
  }));

  return res.json({
    id: render.id,
    status: render.status,
    items: render.items,
    imageUrl: render.imageUrl,
    createdAt: render.createdAt.toISOString()
  });
});

app.get("/render/:id/image", async (req, res) => {
  const renderId = req.params.id;

  try {
    const imagePath = resolve(outputDir, `${renderId}.png`);
    const { size: fileSizeBytes } = await stat(imagePath);
    const imageData = await readFile(imagePath);

    console.log(JSON.stringify({
      event: "image_served",
      renderId,
      filePath: imagePath,
      fileSizeBytes
    }));

    res.setHeader("Content-Type", "image/png");
    res.send(imageData);
  } catch (err) {
    console.log(JSON.stringify({
      event: "image_not_found",
      renderId,
      filePath: resolve(outputDir, `${renderId}.png`),
      error: err instanceof Error ? err.message : "unknown error"
    }));
    res.status(404).json({ error: "image not found" });
  }
});

const port = Number(process.env.API_PORT ?? 4000);
app.listen(port, () => {
  console.log(JSON.stringify({
    event: "api_started",
    port,
    outputDir
  }));
});
