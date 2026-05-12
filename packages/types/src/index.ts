export enum RenderStatus {
  pending = "pending",
  processing = "processing",
  done = "done"
}

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
}
