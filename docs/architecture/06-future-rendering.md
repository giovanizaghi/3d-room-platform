# Rendering Pipeline (Current State & Future Directions)

## Current Pipeline

The rendering pipeline is fully implemented end-to-end. Two parallel paths run after a model is uploaded:

```mermaid
flowchart LR
    Upload[Model Upload\n.blend file]
    Worker[Worker Service]

    subgraph ConversionPath ["GLB Conversion (convert-jobs)"]
        Blender1["Blender headless\nconvert_gltf.py"]
        GLB[".glb file\n(binary glTF)"]
        ThreeJS["Three.js viewer\n(in-browser)"]
        Blender1 --> GLB --> ThreeJS
    end

    subgraph RenderPath ["PNG Render (render-jobs)"]
        Blender2["Blender headless\nrender.py\n(Cycles / EEVEE)"]
        PNG["PNG 800×600"]
        AI["AI Enhancement\n(OpenAI gpt-image-1)"]
        Output["Stored render\n(S3 / local)"]
        Blender2 --> PNG -->|"aiEnhance = true"| AI --> Output
        PNG -->|"aiEnhance = false"| Output
    end

    Upload --> Worker
    Worker --> ConversionPath
    Worker --> RenderPath
```

---

## Conversion Path — `.blend` → `.glb`

- Triggered automatically on every model upload via the `convert-jobs` queue
- Can be re-triggered manually via `POST /models/:id/convert`
- Uses `bpy.ops.export_scene.gltf(export_format='GLB')` — available in Blender 3.x and 4.x
- Output: a single binary `.glb` file with geometry, materials, and textures embedded
- Stored in the same directory as the `.blend` (S3: `models/{id}/model.glb`)
- `Model3D.gltfFilePath` is set on completion; the frontend reads `gltfReady` from `GET /models/:id`
- The frontend Three.js viewer uses `GLTFLoader` with a slow auto-rotation; no user interaction

---

## Render Path — `.blend` → PNG

- Triggered on demand via `POST /render`
- Uses Blender headless mode (`-b`) with `render.py` as the Python script
- Default engine: **Cycles** (CPU, 32 samples, no denoising)
- When `aiEnhance = true`: switches to **EEVEE** for the base render, then calls `ai_enhance.py`
- Output: PNG at 800×600px, stored in `services/renderer/output/` or uploaded to S3

### Render engines

| Engine  | Used when                | Characteristics                        |
| ------- | ------------------------ | -------------------------------------- |
| Cycles  | `aiEnhance = false`      | Path-tracing, accurate lighting, slower |
| EEVEE   | `aiEnhance = true`       | Rasterisation, faster, fed to OpenAI   |

### AI Enhancement (`ai_enhance.py`)

- Sends the EEVEE-rendered PNG to `openai.images.edit()` with model `gpt-image-1`
- Prompt instructs the model to improve lighting, add photorealistic textures, and enhance visual quality
- The enhanced image **overwrites** the original PNG before storage upload
- Requires `OPENAI_API_KEY` in the worker environment; skipped silently if absent
- Configurable model via `OPENAI_IMAGE_MODEL` env var (default: `gpt-image-1`)

---

## Progress Reporting

`render.py` emits `PROGRESS:` JSON lines to stdout at key milestones:

```
PROGRESS:{"progress": 10, "stage": "setup",          "message": "Configuring render..."}
PROGRESS:{"progress": 30, "stage": "rendering",       "message": "Rendering scene..."}
PROGRESS:{"progress": 70, "stage": "render_complete", "message": "Render saved"}
PROGRESS:{"progress": 90, "stage": "ai_enhance",      "message": "Applying AI enhancement..."}
PROGRESS:{"progress": 100,"stage": "done",            "message": "All steps complete"}
```

The worker parses these and updates `Render.progress`, `Render.progressLabel`, and `Render.lastHeartbeatAt` in real time. The frontend progress bar reflects these values.

---

## Future Directions

The current architecture was designed to be extensible. Possible next steps:

### Multi-angle renders
Queue multiple render jobs per model with different camera positions. No schema changes needed — `items` already carries arbitrary scene config. The frontend could display a gallery of angles.

### WebGL real-time preview improvements
The Three.js viewer currently does a basic auto-rotate with no interaction. Possible improvements:
- Add `OrbitControls` for user interaction
- Add environment maps (HDRI) for reflections
- Support animated models (glTF animation clips)

### Batch rendering
Accept a list of `modelId`s in a single API call and fan out one render job per model. The queue naturally handles the fan-out; only the API endpoint and optional progress aggregation are new.

### Background-less / transparent renders
Expose a render option to use a transparent background (EXR/PNG with alpha) for compositing into custom environments on the frontend.

### Progressive quality
A "fast preview" job (EEVEE, low samples) followed by a "final quality" job (Cycles, high samples) could improve perceived responsiveness. The `retriedFromId` lineage pattern could be reused to link the two jobs.

