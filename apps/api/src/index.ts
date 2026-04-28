import cors from "cors";
import express from "express";
import { prisma } from "@repo/db";
import { createRenderQueue } from "@repo/queue";
import { RenderStatus } from "@repo/types";

const app = express();
const renderQueue = createRenderQueue();

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

  // The API only enqueues work; heavy rendering is delegated to workers.
  await renderQueue.add("render-room", { renderId: render.id });

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
    return res.status(404).json({ error: "render not found" });
  }

  return res.json({
    id: render.id,
    status: render.status,
    items: render.items,
    imageUrl: render.imageUrl,
    createdAt: render.createdAt.toISOString()
  });
});

const port = Number(process.env.API_PORT ?? 4000);
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
