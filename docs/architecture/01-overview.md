# System Architecture Overview

## Description

This system implements a distributed asynchronous pipeline for 3D model management and rendering. Users upload `.blend` files via the Next.js frontend; the API stores the file in object storage (S3/R2/local volume) and persists metadata to PostgreSQL. Two independent background workers consume from separate Redis-backed queues:

1. **Conversion worker** — exports the uploaded `.blend` to a binary glTF file (`.glb`) using Blender headless, enabling an in-browser Three.js preview.
2. **Render worker** — produces a high-quality PNG using Blender (Cycles or EEVEE), with an optional AI enhancement step via the OpenAI image editing API.

The frontend displays a live rotating 3D preview of each model and a full render history with progress tracking.

---

## High-Level Architecture

```mermaid
flowchart TD
    FE["Frontend\n(Next.js + Three.js)"]
    API["API\n(Node.js / Express)"]
    DB["PostgreSQL"]
    Redis["Redis\n(BullMQ)"]
    RenderQ["render-jobs queue"]
    ConvertQ["convert-jobs queue"]
    RenderW["Render Worker\n(Node.js / BullMQ)"]
    ConvertW["Convert Worker\n(Node.js / BullMQ)"]
    Blender["Blender\n(headless)"]
    AI["AI Enhancement\n(OpenAI gpt-image-1)"]
    Storage["Object Storage\n(S3 / R2 / local volume)"]

    FE -->|"POST /models (blend upload)"| API
    FE -->|"POST /render"| API
    FE -->|"GET /models/:id/gltf"| API
    FE -->|"GET /render/:id/image"| API

    API --> DB
    API --> RenderQ
    API --> ConvertQ
    RenderQ --> Redis
    ConvertQ --> Redis

    Redis --> RenderW
    Redis --> ConvertW

    RenderW -->|"render.py"| Blender
    Blender -->|"PNG"| RenderW
    RenderW -->|"aiEnhance=true"| AI
    AI -->|"enhanced PNG"| RenderW
    RenderW --> Storage
    RenderW --> DB

    ConvertW -->|"convert_gltf.py"| Blender
    Blender -->|"GLB"| ConvertW
    ConvertW --> Storage
    ConvertW --> DB

    API -->|proxy file bytes| Storage
```

---

## Request Lifecycle — Model Upload & 3D Preview

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant API as API
    participant DB as PostgreSQL
    participant CQ as convert-jobs
    participant CW as Convert Worker
    participant B as Blender

    User->>FE: Upload .blend file
    FE->>API: POST /models (multipart)
    API->>DB: INSERT Model3D (blendFilePath, thumbnailPath)
    API->>CQ: Enqueue convert-gltf job { modelId }
    API-->>FE: 201 { id, name, gltfReady: false }

    CQ->>CW: Dequeue job
    CW->>B: blender -b model.blend -P convert_gltf.py
    B-->>CW: model.glb written
    CW->>DB: UPDATE Model3D SET gltfFilePath = ...
    FE->>API: GET /models/:id/gltf
    API-->>FE: GLB bytes (proxied, CORS-safe)
    FE->>FE: Three.js renders rotating 3D preview
```

---

## Request Lifecycle — Render Job

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant API as API
    participant DB as PostgreSQL
    participant RQ as render-jobs
    participant RW as Render Worker
    participant B as Blender
    participant AI as OpenAI API

    User->>FE: Click "Generate Render"
    FE->>API: POST /render { modelId, aiEnhance }
    API->>DB: INSERT Render (status: queued)
    API->>RQ: Enqueue render-room job { renderId }
    API-->>FE: 202 { id, status: queued }

    RQ->>RW: Dequeue job
    RW->>DB: UPDATE status = processing, startedAt
    RW->>B: blender -b model.blend -P render.py -- --output ...
    B-->>RW: PROGRESS:{...} lines (heartbeat)
    B-->>RW: PNG written, exit 0

    alt aiEnhance = true
        RW->>AI: POST images/edit (PNG + prompt)
        AI-->>RW: Enhanced PNG
    end

    RW->>DB: UPDATE status = done, imageUrl, completedAt

    loop Frontend polling
        FE->>API: GET /render/:id
        API-->>FE: { status, progress, progressLabel }
    end

    FE->>API: GET /render/:id/image
    API-->>FE: PNG bytes (proxied)
```

---

## Key Architectural Decisions

### Two Independent Queues
GLB conversion (`convert-jobs`) and PNG rendering (`render-jobs`) are handled by separate workers with separate concurrency limits. This ensures heavy renders don't starve the lightweight conversion jobs and vice versa.

### Object Storage with Local Fallback
All assets (`.blend`, `.glb`, `.png`, thumbnails) are stored in S3-compatible object storage (Cloudflare R2, AWS S3, MinIO) when configured. If no storage environment variables are set, the system falls back to a local Docker volume — useful for development.

### API as Proxy for Storage
The API never redirects clients directly to storage URLs. It fetches bytes server-side and forwards them, ensuring CORS headers are always correct regardless of the storage backend's CORS configuration.

### Heartbeat & Stall Detection
The render worker emits a DB heartbeat every 15 seconds while a child process is running. A stall monitor sweeps every 30 seconds and marks any `processing` render with no heartbeat in the last 90 seconds as `stalled`, making it retriable.

### Optional AI Enhancement
When `aiEnhance: true` is set on a render and `OPENAI_API_KEY` is configured, the worker pipes the Blender output PNG through the OpenAI image editing API (`gpt-image-1`) before storing it. The enhancement step is entirely optional — the pipeline functions identically without it.

### Retry Lineage
Failed or stalled renders can be retried via `POST /render/:id/retry`. A new `Render` record is created with `retriedFromId` pointing to the original, preserving full history.
