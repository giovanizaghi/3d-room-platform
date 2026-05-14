import { Queue } from "bullmq";
import { Redis } from "ioredis";

export const RENDER_QUEUE_NAME = "render-jobs";
export const CONVERT_QUEUE_NAME = "convert-jobs";

export const queueConnection = new Redis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  {
    maxRetriesPerRequest: null
  }
);

queueConnection.on("error", (err) => {
  console.error(JSON.stringify({ event: "redis_error", error: String(err) }));
});

export type RenderJobPayload = {
  renderId: string;
};

export type ConvertJobPayload = {
  modelId: string;
};

export const createRenderQueue = () =>
  new Queue<RenderJobPayload>(RENDER_QUEUE_NAME, {
    connection: queueConnection
  });

export const createConvertQueue = () =>
  new Queue<ConvertJobPayload>(CONVERT_QUEUE_NAME, {
    connection: queueConnection
  });
