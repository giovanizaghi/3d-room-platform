import { Queue } from "bullmq";
import { Redis } from "ioredis";

export const RENDER_QUEUE_NAME = "render-jobs";

export const queueConnection = new Redis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  {
    maxRetriesPerRequest: null
  }
);

export type RenderJobPayload = {
  renderId: string;
};

export const createRenderQueue = () =>
  new Queue<RenderJobPayload>(RENDER_QUEUE_NAME, {
    connection: queueConnection
  });
