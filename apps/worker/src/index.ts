import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { Worker } from "bullmq";
import { prisma } from "@repo/db";
import {
  RENDER_QUEUE_NAME,
  queueConnection,
  type RenderJobPayload
} from "@repo/queue";
import { RenderStatus } from "@repo/types";

const rootDir = resolve(process.cwd(), "../..");
const outputDir = resolve(rootDir, "services/renderer/output");
const rendererScript = resolve(rootDir, "services/renderer/render.py");

mkdirSync(outputDir, { recursive: true });

function runRenderer(renderId: string): Promise<string> {
  return new Promise((resolveImage, reject) => {
    const outputPath = resolve(outputDir, `${renderId}.png`);

    const child = spawn(
      process.env.PYTHON_BIN ?? "python3",
      [rendererScript, "--output", outputPath],
      { stdio: "inherit" }
    );

    child.on("exit", (code) => {
      if (code === 0) {
        resolveImage(outputPath);
      } else {
        reject(new Error(`Renderer exited with code ${code}`));
      }
    });

    child.on("error", reject);
  });
}

// Worker is isolated so render throughput can scale independently of API replicas.
const worker = new Worker<RenderJobPayload>(
  RENDER_QUEUE_NAME,
  async (job) => {
    const { renderId } = job.data;

    await prisma.render.update({
      where: { id: renderId },
      data: { status: RenderStatus.processing }
    });

    const imagePath = await runRenderer(renderId);

    await prisma.render.update({
      where: { id: renderId },
      data: {
        status: RenderStatus.done,
        imageUrl: imagePath
      }
    });
  },
  {
    connection: queueConnection,
    concurrency: 2
  }
);

worker.on("failed", async (job, err) => {
  if (!job) return;

  console.error(`Job ${job.id} failed:`, err.message);
  await prisma.render.update({
    where: { id: job.data.renderId },
    data: { status: RenderStatus.pending }
  });
});

console.log("Worker started and waiting for render jobs...");
