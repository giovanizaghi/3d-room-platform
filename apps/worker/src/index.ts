// updated: 2026-05-13b
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdirSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { Worker } from "bullmq";
import { prisma, RenderStatus } from "@repo/db";
import { isConfigured as storageConfigured, isStorageKey, upload as storageUpload, download as storageDownload } from "@repo/storage";
import {
  RENDER_QUEUE_NAME,
  CONVERT_QUEUE_NAME,
  queueConnection,
  type RenderJobPayload,
  type ConvertJobPayload,
} from "@repo/queue";

const rootDir = resolve(process.cwd(), "../..");
const outputDir = process.env.OUTPUT_DIR ?? resolve(rootDir, "services/renderer/output");
const rendererDir = resolve(rootDir, "services/renderer");
const rendererScript = process.env.RENDERER_SCRIPT ?? resolve(rendererDir, "render.py");
const convertScript = process.env.CONVERT_SCRIPT ?? resolve(rendererDir, "convert_gltf.py");
const fallbackBlendFile = process.env.BLEND_FILE ?? resolve(rendererDir, "chair.blend");
const blenderBin = process.env.BLENDER_BIN ?? "blender";
const useBlender = (process.env.USE_BLENDER ?? "true") === "true";

/** How long without a heartbeat before the stall monitor acts (ms). */
const STALL_THRESHOLD_MS = 90_000;
/** How often the stall monitor sweeps for stalled renders (ms). */
const STALL_MONITOR_INTERVAL_MS = 30_000;
/** How often the fallback heartbeat timer updates the DB while child is alive (ms). */
const HEARTBEAT_INTERVAL_MS = 15_000;

mkdirSync(outputDir, { recursive: true });

function buildCommand(renderId: string, items: unknown[], modelBlendFile: string, aiEnhance: boolean): { bin: string; args: string[] } {
  const outputPath = resolve(outputDir, `${renderId}.png`);
  const itemsJson = JSON.stringify(items);
  const extraArgs = aiEnhance ? ["--ai-enhance"] : [];

  if (useBlender) {
    return {
      bin: blenderBin,
      args: [
        "-b", modelBlendFile,
        "-P", rendererScript,
        "--",
        "--output", outputPath,
        "--render-id", renderId,
        "--items", itemsJson,
        "--blend-file", modelBlendFile,
        ...extraArgs,
      ],
    };
  }

  return {
    bin: process.env.PYTHON_BIN ?? "python3",
    args: [rendererScript, "--output", outputPath, "--render-id", renderId, "--items", itemsJson, "--blend-file", modelBlendFile, ...extraArgs],
  };
}

interface ProgressPayload {
  progress: number;
  stage: string;
  message: string;
}

function runRenderer(renderId: string, items: unknown[], modelBlendFile: string, aiEnhance: boolean): Promise<string> {
  return new Promise((resolveImage, reject) => {
    const outputPath = resolve(outputDir, `${renderId}.png`);
    const { bin, args } = buildCommand(renderId, items, modelBlendFile, aiEnhance);

    console.log(JSON.stringify({
      event: "render_started",
      renderId,
      mode: useBlender ? "blender" : "python",
      aiEnhance,
      command: [bin, ...args].join(" "),
    }));

    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });

    // Blender sends Python tracebacks to stdout (not stderr), so we buffer both.
    // On failure we pick the most informative buffer to surface the real error.
    const stdoutBuffer: string[] = [];
    const stderrBuffer: string[] = [];
    const MAX_LOG_LINES = 20;

    // Fallback heartbeat: keeps lastHeartbeatAt fresh even between PROGRESS lines.
    const heartbeatTimer = setInterval(async () => {
      try {
        await prisma.render.update({
          where: { id: renderId },
          data: { lastHeartbeatAt: new Date() },
        });
      } catch {
        // Non-fatal — stall monitor is the authoritative cleanup path.
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Parse stdout line-by-line; extract PROGRESS: lines for structured updates.
    const rl = createInterface({ input: child.stdout! });
    rl.on("line", (line) => {
      // Echo all stdout to worker logs for observability.
      console.log(`[renderer:${renderId}] ${line}`);

      if (line.startsWith("PROGRESS:")) {
        try {
          const payload = JSON.parse(line.slice("PROGRESS:".length)) as ProgressPayload;
          // Fire-and-forget: heartbeat + progress update from structured line.
          prisma.render.update({
            where: { id: renderId },
            data: {
              lastHeartbeatAt: new Date(),
              progress: payload.progress,
              progressLabel: payload.message,
              lastLogLine: payload.message,
            },
          }).catch(() => {});
        } catch {
          // Malformed PROGRESS line — treat as plain log.
        }
      } else if (line.trim()) {
        // Buffer all meaningful stdout lines (Blender puts tracebacks here, not stderr).
        // Exclude the uninformative "Blender quit" termination line.
        if (!line.startsWith("Blender quit")) {
          stdoutBuffer.push(line);
          if (stdoutBuffer.length > MAX_LOG_LINES) stdoutBuffer.shift();
          prisma.render.update({
            where: { id: renderId },
            data: { lastLogLine: line.slice(0, 500) },
          }).catch(() => {});
        }
      }
    });

    // Echo stderr to worker logs too.
    const rlErr = createInterface({ input: child.stderr! });
    rlErr.on("line", (line) => {
      if (line.trim()) {
        console.error(`[renderer:${renderId}:stderr] ${line}`);
        stderrBuffer.push(line);
        if (stderrBuffer.length > MAX_LOG_LINES) stderrBuffer.shift();
        prisma.render.update({
          where: { id: renderId },
          data: { lastLogLine: `[stderr] ${line}`.slice(0, 500) },
        }).catch(() => {});
      }
    });

    child.on("exit", (code) => {
      clearInterval(heartbeatTimer);
      rl.close();
      rlErr.close();

      if (code === 0) {
        console.log(JSON.stringify({ event: "render_completed", renderId, outputPath }));
        resolveImage(outputPath);
      } else {
        // Prefer stderr for the error summary; fall back to buffered stdout (where Blender
        // prints Python tracebacks). Filter out the useless "Blender quit" terminal line.
        const errorSource = stderrBuffer.length > 0 ? stderrBuffer : stdoutBuffer;
        const errorSummary = errorSource.length > 0
          ? errorSource.join("\n").slice(-1000)
          : `Renderer exited with code ${code}`;
        // Persist the real error to the DB so the UI can show it.
        prisma.render.update({
          where: { id: renderId },
          data: { lastLogLine: errorSummary.split("\n").at(-1)?.slice(0, 500) ?? errorSummary.slice(0, 500) },
        }).catch(() => {});
        console.log(JSON.stringify({ event: "render_failed", renderId, exitCode: code, command: bin, errorSummary }));
        reject(new Error(errorSummary));
      }
    });

    child.on("error", (err) => {
      clearInterval(heartbeatTimer);
      rl.close();
      rlErr.close();
      console.log(JSON.stringify({ event: "render_spawn_error", renderId, error: err.message, command: bin }));
      reject(err);
    });
  });
}

// Worker is isolated so render throughput can scale independently of API replicas.
const worker = new Worker<RenderJobPayload>(
  RENDER_QUEUE_NAME,
  async (job) => {
    const { renderId } = job.data;
    const now = new Date();

    console.log(JSON.stringify({ event: "job_started", renderId, attempt: job.attemptsMade + 1 }));

    await prisma.render.update({
      where: { id: renderId },
      data: {
        status: RenderStatus.processing,
        startedAt: now,
        lastHeartbeatAt: now,
        attempts: { increment: 1 },
      },
    });

    const renderRecord = await prisma.render.findUnique({
      where: { id: renderId },
      include: { model: true },
    });
    const items = (renderRecord?.items ?? []) as unknown[];
    const storedBlendPath = renderRecord?.model?.blendFilePath ?? fallbackBlendFile;
    const aiEnhance = renderRecord?.aiEnhance ?? false;

    // If blendFilePath is an S3 key (no leading slash), download it to a temp dir first.
    let modelBlendFile = storedBlendPath;
    let tempDir: string | null = null;
    if (isStorageKey(storedBlendPath)) {
      tempDir = await mkdtemp(join(tmpdir(), `render-${renderId}-`));
      modelBlendFile = join(tempDir, "model.blend");
      await storageDownload(storedBlendPath, modelBlendFile);
      console.log(JSON.stringify({ event: "blend_downloaded", renderId, key: storedBlendPath, dest: modelBlendFile }));
    }

    let imagePath: string;
    try {
      imagePath = await runRenderer(renderId, items, modelBlendFile, aiEnhance);
    } finally {
      // Always clean up the temp blend file regardless of render outcome.
      if (tempDir) await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }

    const { size: fileSizeBytes } = statSync(imagePath);

    // Upload rendered PNG to S3 if configured; otherwise keep it on local disk.
    let imageUrl = `/renders/${renderId}.png`;
    if (storageConfigured()) {
      const pngKey = `renders/${renderId}.png`;
      imageUrl = await storageUpload(pngKey, imagePath, "image/png");
      console.log(JSON.stringify({ event: "render_uploaded", renderId, key: pngKey, url: imageUrl }));
    }

    await prisma.render.update({
      where: { id: renderId },
      data: {
        status: RenderStatus.done,
        completedAt: new Date(),
        imageUrl,
        progress: 100,
      },
    });

    console.log(JSON.stringify({ event: "render_file_created", renderId, outputPath: imagePath, fileSizeBytes }));
  },
  {
    connection: queueConnection,
    concurrency: 2,
    // Increase lock duration well beyond the longest expected render so BullMQ doesn't
    // falsely stall the job while it is legitimately running. Lock auto-renews every
    // lockDuration/2 = 150s, which is fine since the renderer runs as a child process
    // and the Node event loop stays responsive.
    lockDuration: 300_000,
  }
);

worker.on("failed", async (job, err) => {
  if (!job) return;

  const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1) - 1;

  console.log(JSON.stringify({
    event: "job_failed",
    renderId: job.data.renderId,
    jobId: job.id,
    error: err.message,
    attempt: job.attemptsMade + 1,
    isLastAttempt,
  }));

  if (isLastAttempt) {
    await prisma.render.update({
      where: { id: job.data.renderId },
      data: {
        status: RenderStatus.failed,
        completedAt: new Date(),
        errorMessage: err.message.slice(0, 1000),
      },
    });
  }
});

// ---------------------------------------------------------------------------
// Stall monitor: detects renders stuck in `processing` with no heartbeat.
// Uses an atomic WHERE clause so running on multiple worker instances is safe
// (once a render is stalled it no longer matches and won't be updated again).
// ---------------------------------------------------------------------------

async function sweepStalledRenders(): Promise<void> {
  const threshold = new Date(Date.now() - STALL_THRESHOLD_MS);
  const result = await prisma.render.updateMany({
    where: {
      status: RenderStatus.processing,
      OR: [
        { lastHeartbeatAt: { lt: threshold } },
        { lastHeartbeatAt: null },
      ],
    },
    data: {
      status: RenderStatus.stalled,
      completedAt: new Date(),
      errorMessage: "Render stalled: no heartbeat received for 90 seconds",
    },
  });

  if (result.count > 0) {
    console.log(JSON.stringify({ event: "stall_sweep", stalledCount: result.count }));
  }
}

// Startup sweep: catch renders orphaned by a previous worker crash.
sweepStalledRenders().catch(console.error);

// Periodic sweep every 30s.
setInterval(() => sweepStalledRenders().catch(console.error), STALL_MONITOR_INTERVAL_MS);

console.log(JSON.stringify({
  event: "worker_started",
  mode: useBlender ? "blender" : "python",
  blenderBin: useBlender ? blenderBin : null,
  fallbackBlendFile: useBlender ? fallbackBlendFile : null,
  rendererScript,
  convertScript,
  outputDir,
  stallThresholdMs: STALL_THRESHOLD_MS,
}));

// ---------------------------------------------------------------------------
// Convert worker: exports .blend → .glb using Blender headless.
// Runs on a separate queue (convert-jobs) so conversion throughput is
// independent of render throughput.
// ---------------------------------------------------------------------------

const convertWorker = new Worker<ConvertJobPayload>(
  CONVERT_QUEUE_NAME,
  async (job) => {
    const { modelId } = job.data;

    console.log(JSON.stringify({ event: "convert_job_started", modelId, attempt: job.attemptsMade + 1 }));

    const model = await prisma.model3D.findUnique({ where: { id: modelId } });
    if (!model) throw new Error(`Model ${modelId} not found`);

    // Clear any previous conversion error now that we're retrying.
    await prisma.model3D.update({
      where: { id: modelId },
      data: { gltfConversionError: null },
    });

    const storedBlendPath = model.blendFilePath;

    // Download from S3 to a temp dir if the path is an S3 key.
    let blendFile = storedBlendPath;
    let tempDir: string | null = null;
    if (isStorageKey(storedBlendPath)) {
      tempDir = await mkdtemp(join(tmpdir(), `convert-${modelId}-`));
      blendFile = join(tempDir, "model.blend");
      await storageDownload(storedBlendPath, blendFile);
      console.log(JSON.stringify({ event: "blend_downloaded_for_convert", modelId, dest: blendFile }));
    }

    // Output: same directory as blend file, always named model.glb.
    const glbLocal = join(resolve(blendFile, ".."), "model.glb");

    try {
      await new Promise<void>((res, rej) => {
        const { bin, args } = useBlender
          ? {
              bin: blenderBin,
              args: ["-b", blendFile, "-P", convertScript, "--", "--output", glbLocal],
            }
          : {
              bin: process.env.PYTHON_BIN ?? "python3",
              args: [convertScript, "--output", glbLocal],
            };

        console.log(JSON.stringify({ event: "convert_spawn", modelId, command: [bin, ...args].join(" ") }));

        const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
        const stdoutLines: string[] = [];
        const stderrLines: string[] = [];

        createInterface({ input: child.stdout! }).on("line", (line) => {
          console.log(`[convert:${modelId}] ${line}`);
          if (!line.startsWith("PROGRESS:") && !line.startsWith("Blender quit") && line.trim()) {
            stdoutLines.push(line);
            if (stdoutLines.length > 20) stdoutLines.shift();
          }
        });

        createInterface({ input: child.stderr! }).on("line", (line) => {
          if (line.trim()) {
            console.error(`[convert:${modelId}:stderr] ${line}`);
            stderrLines.push(line);
            if (stderrLines.length > 20) stderrLines.shift();
          }
        });

        child.on("exit", (code) => {
          if (code === 0) {
            res();
          } else {
            const src = stderrLines.length > 0 ? stderrLines : stdoutLines;
            rej(new Error(src.join("\n").slice(-1000) || `Blender exited with code ${code}`));
          }
        });

        child.on("error", rej);
      });

      // Upload .glb to S3 if configured, otherwise keep local.
      let gltfFilePath: string = glbLocal;
      if (storageConfigured()) {
        const glbKey = `models/${modelId}/model.glb`;
        gltfFilePath = await storageUpload(glbKey, glbLocal, "model/gltf-binary");
        await rm(glbLocal).catch(() => {});
        console.log(JSON.stringify({ event: "glb_uploaded", modelId, url: gltfFilePath }));
      }

      await prisma.model3D.update({
        where: { id: modelId },
        data: { gltfFilePath },
      });

      console.log(JSON.stringify({ event: "convert_complete", modelId, gltfFilePath }));
    } finally {
      if (tempDir) await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  },
  {
    connection: queueConnection,
    concurrency: 1,
    lockDuration: 300_000,
  }
);

convertWorker.on("failed", async (job, err) => {
  if (!job) return;

  const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1) - 1;

  console.log(JSON.stringify({
    event: "convert_job_failed",
    modelId: job.data.modelId,
    error: err.message,
    attempt: job.attemptsMade + 1,
    isLastAttempt,
  }));

  if (isLastAttempt) {
    await prisma.model3D.update({
      where: { id: job.data.modelId },
      data: { gltfConversionError: err.message.slice(0, 500) },
    }).catch(() => {});
  }
});

