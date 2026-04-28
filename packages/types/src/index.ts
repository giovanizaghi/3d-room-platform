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

export interface RenderJob {
  id: string;
  status: RenderStatus;
  items: RenderItem[];
  imageUrl: string | null;
  createdAt: string;
}

export interface CreateRenderRequest {
  items: RenderItem[];
}
