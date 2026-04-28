import { spawn } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
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
const rendererDir = resolve(rootDir, "services/renderer");
const rendererScript = process.env.RENDERER_SCRIPT ?? resolve(rendererDir, "render.py");
const blendFile = process.env.BLEND_FILE ?? resolve(rendererDir, "chair.blend");
const blenderBin = process.env.BLENDER_BIN ?? "blender";
const useBlender = (process.env.USE_BLENDER ?? "true") === "true";

mkdirSync(outputDir, { recursive: true });

function buildCommand(renderId: string, items: unknown[]): { bin: string; args: string[] } {
  const outputPath = resolve(outputDir, `${renderId}.png`);
  const itemsJson = JSON.stringify(items);

  if (useBlender) {
    return {
      bin: blenderBin,
      args: [
        "-b", blendFile,
        "-P", rendererScript,
        "--",
        "--output", outputPath,
        "--render-id", renderId,
        "--items", itemsJson,
      ],
    };
  }

  return {
    bin: process.env.PYTHON_BIN ?? "python3",
    args: [rendererScript, "--output", outputPath, "--render-id", renderId, "--items", itemsJson],
  };
}

function runRenderer(renderId: string, items: unknown[]): Promise<string> {
  return new Promise((resolveImage, reject) => {
    const outputPath = resolve(outputDir, `${renderId}.png`);
    const { bin, args } = buildCommand(renderId, items);

    console.log(JSON.stringify({
      event: "render_started",
      renderId,
      mode: useBlender ? "blender" : "python",
      command: [bin, ...args].join(" "),
    }));

    const child = spawn(bin, args, { stdio: "inherit" });

    child.on("exit", (code) => {
      if (code === 0) {
        console.log(JSON.stringify({
          event: "render_completed",
          renderId,
          outputPath,
        }));
        resolveImage(outputPath);
      } else {
        console.log(JSON.stringify({
          event: "render_failed",
          renderId,
          exitCode: code,
          command: bin,
        }));
        reject(new Error(`Renderer exited with code ${code}`));
      }
    });

    child.on("error", (err) => {
      console.log(JSON.stringify({
        event: "render_spawn_error",
        renderId,
        error: err.message,
        command: bin,
      }));
      reject(err);
    });
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

    const renderRecord = await prisma.render.findUnique({ where: { id: renderId } });
    const items = (renderRecord?.items ?? []) as unknown[];

    const imagePath = await runRenderer(renderId, items);
    const { size: fileSizeBytes } = statSync(imagePath);

    await prisma.render.update({
      where: { id: renderId },
      data: {
        status: RenderStatus.done,
        imageUrl: `/renders/${renderId}.png`
      }
    });

    console.log(JSON.stringify({
      event: "render_file_created",
      renderId,
      outputPath: imagePath,
      fileSizeBytes
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
  mode: useBlender ? "blender" : "python",
  blenderBin: useBlender ? blenderBin : null,
  blendFile: useBlender ? blendFile : null,
  rendererScript,
  outputDir
}));
