export enum RenderStatus {
  queued = "queued",
  processing = "processing",
  done = "done",
  failed = "failed",
  stalled = "stalled",
}

export const ACTIVE_RENDER_STATUSES: RenderStatus[] = [
  RenderStatus.queued,
  RenderStatus.processing,
];

export const TERMINAL_RENDER_STATUSES: RenderStatus[] = [
  RenderStatus.done,
  RenderStatus.failed,
  RenderStatus.stalled,
];

export interface RenderItem {
  sku: string;
  quantity: number;
  color?: string;
}

export interface Model3D {
  id: string;
  name: string;
  description: string | null;
  blendFilePath: string;
  thumbnailPath: string | null;
  gltfFilePath: string | null;
  createdAt: string;
}

export interface RenderJob {
  id: string;
  status: RenderStatus;
  items: RenderItem[] | null;
  imageUrl: string | null;
  aiEnhance: boolean;
  modelId: string;
  createdAt: string;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  lastHeartbeatAt: string | null;
  progress: number;
  progressLabel: string | null;
  lastLogLine: string | null;
  errorMessage: string | null;
  attempts: number;
  retriedFromId: string | null;
}

export interface CreateRenderRequest {
  modelId: string;
  items?: RenderItem[];
  aiEnhance?: boolean;
}

export interface RenderQueueItem {
  id: string;
  status: RenderStatus;
  modelId: string;
  modelName: string;
  imageUrl: string | null;
  createdAt: string;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  lastHeartbeatAt: string | null;
  progress: number;
  progressLabel: string | null;
  lastLogLine: string | null;
  errorMessage: string | null;
  attempts: number;
  retriedFromId: string | null;
}
