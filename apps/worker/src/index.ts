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
const outputDir = process.env.OUTPUT_DIR ?? resolve(rootDir, "services/renderer/output");
const rendererScript = process.env.RENDERER_SCRIPT ?? resolve(rootDir, "services/renderer/render.py");

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

    console.log(JSON.stringify({
      event: "job_started",
      renderId,
      attempt: job.attemptsMade + 1
    }));

    await prisma.render.update({
      where: { id: renderId },
      data: { status: RenderStatus.processing }
    });

    const imagePath = await runRenderer(renderId);

    await prisma.render.update({
      where: { id: renderId },
      data: {
        status: RenderStatus.done,
        imageUrl: `/renders/${renderId}.png`
      }
    });

    console.log(JSON.stringify({
      event: "job_completed",
      renderId,
      outputPath: imagePath
    }));
  },
  {
    connection: queueConnection,
    concurrency: 2
  }
);

worker.on("failed", async (job, err) => {
  if (!job) return;

  console.log(JSON.stringify({
    event: "job_failed",
    renderId: job.data.renderId,
    jobId: job.id,
    error: err.message,
    attempt: job.attemptsMade + 1
  }));

  if (job.attemptsMade >= 2) {
    await prisma.render.update({
      where: { id: job.data.renderId },
      data: { status: RenderStatus.pending }
    });
  }
});

console.log(JSON.stringify({
  event: "worker_started",
  rendererScript,
  outputDir
}));
