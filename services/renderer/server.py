"""
Renderer HTTP service
=====================
A thin Flask wrapper around Blender headless. Accepts jobs via HTTP so that
the Node worker and API can delegate all Blender work without needing Blender
installed locally.

Endpoints:
  GET  /health
  POST /render            — render a .blend model file
  POST /convert           — convert .blend → .glb
  POST /render-from-glb   — render a room scene from a Three.js GLB export
  GET  /jobs/<jobId>      — poll job status
  GET  /jobs/<jobId>/output — download the output file (PNG or GLB)
"""

import json
import os
import subprocess
import threading
import uuid
from pathlib import Path

from flask import Flask, jsonify, request, send_file

app = Flask(__name__)

BLENDER_BIN   = os.environ.get("BLENDER_BIN", "blender")
OUTPUT_DIR    = os.environ.get("OUTPUT_DIR", "/tmp/renderer_output")
RENDERER_DIR  = os.path.dirname(os.path.abspath(__file__))

Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Job store — in-memory with disk backing so container restarts don't lose jobs
# ---------------------------------------------------------------------------

_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()


def _job_file(job_id: str) -> Path:
    return Path(OUTPUT_DIR) / f"{job_id}.json"


def _set_job(job_id: str, **kwargs) -> None:
    with _jobs_lock:
        if job_id in _jobs:
            _jobs[job_id].update(kwargs)
            try:
                with open(_job_file(job_id), "w") as f:
                    json.dump(_jobs[job_id], f)
            except Exception:
                pass


def _load_job_from_disk(job_id: str) -> dict | None:
    """Try to restore a job from its on-disk status file."""
    jf = _job_file(job_id)
    if not jf.exists():
        return None
    try:
        with open(jf) as f:
            data = json.load(f)
        # If the process was mid-render when the container restarted, mark as error.
        if data.get("status") == "rendering":
            data["status"] = "error"
            data["error"] = "Render interrupted by service restart. Please try again."
            with open(jf, "w") as f:
                json.dump(data, f)
        with _jobs_lock:
            _jobs[job_id] = data
        return data
    except Exception:
        return None


def _run_job(job_id: str, blender_args: list[str], output_path: str) -> None:
    """Execute Blender in a background daemon thread; parse PROGRESS/STATUS lines."""
    try:
        proc = subprocess.Popen(
            blender_args,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,  # merge so we see Python tracebacks
            text=True,
        )
        assert proc.stdout is not None
        for line in proc.stdout:
            line = line.rstrip()
            if line.startswith("RENDER_SCENE_STATUS:"):
                try:
                    payload = json.loads(line[len("RENDER_SCENE_STATUS:"):])
                    _set_job(job_id, status=payload.get("status", "rendering"))
                except Exception:
                    pass
            elif line.startswith("PROGRESS:"):
                try:
                    payload = json.loads(line[len("PROGRESS:"):])
                    _set_job(
                        job_id,
                        progress=payload.get("progress", 0),
                        stage=payload.get("stage"),
                        message=payload.get("message"),
                    )
                except Exception:
                    pass
        proc.wait()
        if proc.returncode == 0 and Path(output_path).exists():
            _set_job(job_id, status="done", output_path=output_path)
        else:
            with _jobs_lock:
                # Don't overwrite a "done" status that render_from_glb.py may have emitted
                if _jobs.get(job_id, {}).get("status") not in ("done",):
                    _set_job(job_id, status="error", error=f"Blender exited with code {proc.returncode}")
    except Exception as exc:
        _set_job(job_id, status="error", error=str(exc))


def _start_job(blender_args: list[str], output_path: str) -> str:
    job_id = str(uuid.uuid4())
    data = {
        "status": "rendering",
        "progress": 0,
        "stage": None,
        "message": None,
        "error": None,
        "output_path": None,
    }
    with _jobs_lock:
        _jobs[job_id] = data
        try:
            with open(_job_file(job_id), "w") as f:
                json.dump(data, f)
        except Exception:
            pass
    thread = threading.Thread(
        target=_run_job,
        args=(job_id, blender_args, output_path),
        daemon=True,
    )
    thread.start()
    return job_id


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/health")
def health():
    return jsonify({"ok": True})


@app.route("/render", methods=["POST"])
def render():
    """
    Render an existing .blend model.

    Form fields (multipart/form-data):
      blend      — the .blend file
      renderId   — string ID used for output filename
      items      — JSON-encoded array of scene items (passed to render.py)
      aiEnhance  — "true" / "false"
    """
    blend_file = request.files.get("blend")
    render_id  = request.form.get("renderId")
    items_json = request.form.get("items", "[]")
    ai_enhance = request.form.get("aiEnhance", "false").lower() == "true"

    if not blend_file or not render_id:
        return jsonify({"error": "blend and renderId are required"}), 400

    job_dir     = Path(OUTPUT_DIR) / str(uuid.uuid4())
    job_dir.mkdir(parents=True, exist_ok=True)
    blend_path  = str(job_dir / "model.blend")
    output_path = str(job_dir / "render.png")
    blend_file.save(blend_path)

    script = os.path.join(RENDERER_DIR, "render.py")
    extra  = ["--ai-enhance"] if ai_enhance else []
    args   = [
        BLENDER_BIN, "-b", blend_path, "-P", script, "--",
        "--output",    output_path,
        "--render-id", render_id,
        "--items",     items_json,
        "--blend-file", blend_path,
        *extra,
    ]

    job_id = _start_job(args, output_path)
    return jsonify({"jobId": job_id}), 202


@app.route("/convert", methods=["POST"])
def convert():
    """
    Convert a .blend to .glb.

    Form fields (multipart/form-data):
      blend    — the .blend file
      modelId  — string label (logged only)
    """
    blend_file = request.files.get("blend")
    if not blend_file:
        return jsonify({"error": "blend is required"}), 400

    job_dir     = Path(OUTPUT_DIR) / str(uuid.uuid4())
    job_dir.mkdir(parents=True, exist_ok=True)
    blend_path  = str(job_dir / "model.blend")
    output_path = str(job_dir / "model.glb")
    blend_file.save(blend_path)

    script = os.path.join(RENDERER_DIR, "convert_gltf.py")
    args   = [BLENDER_BIN, "-b", blend_path, "-P", script, "--", "--output", output_path]

    job_id = _start_job(args, output_path)
    return jsonify({"jobId": job_id}), 202


@app.route("/render-from-glb", methods=["POST"])
def render_from_glb():
    """
    Render a room scene exported from the Three.js editor.

    Form fields (multipart/form-data):
      scene    — the .glb file
      metadata — JSON string (SceneMetadata: camera, lights, hiddenWalls, etc.)
      aiEnhance — optional "true" to run AI enhancement after Blender
    """
    scene_file   = request.files.get("scene")
    metadata_str = request.form.get("metadata")
    if not metadata_str and "metadata" in request.files:
        metadata_str = request.files["metadata"].read().decode()

    if not scene_file or not metadata_str:
        return jsonify({"error": "scene and metadata are required"}), 400

    try:
        metadata = json.loads(metadata_str)
    except Exception:
        return jsonify({"error": "metadata must be valid JSON"}), 400

    ai_enhance = request.form.get("aiEnhance", "false").lower() == "true" or bool(metadata.get("aiEnhance"))

    job_dir       = Path(OUTPUT_DIR) / str(uuid.uuid4())
    job_dir.mkdir(parents=True, exist_ok=True)
    glb_path      = str(job_dir / "scene.glb")
    metadata_path = str(job_dir / "metadata.json")
    output_path   = str(job_dir / "render.png")

    scene_file.save(glb_path)
    with open(metadata_path, "w") as f:
        json.dump(metadata, f)

    script = os.path.join(RENDERER_DIR, "render_from_glb.py")
    extra  = ["--ai-enhance"] if ai_enhance else []
    args   = [
        BLENDER_BIN, "-b", "-P", script, "--",
        "--glb",      glb_path,
        "--metadata", metadata_path,
        "--output",   output_path,
        *extra,
    ]

    job_id = _start_job(args, output_path)
    return jsonify({"jobId": job_id}), 202


@app.route("/jobs/<job_id>")
def get_job(job_id: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
    # Fall back to disk if not in memory (e.g. service restarted)
    if not job:
        job = _load_job_from_disk(job_id)
    if not job:
        return jsonify({"error": "job not found"}), 404
    return jsonify({
        "jobId":    job_id,
        "status":   job["status"],
        "progress": job["progress"],
        "stage":    job["stage"],
        "message":  job["message"],
        "error":    job.get("error"),
    })


@app.route("/jobs/<job_id>/output")
def get_job_output(job_id: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job:
        return jsonify({"error": "job not found"}), 404

    output_path = job.get("output_path")
    if not output_path or not Path(output_path).exists():
        return jsonify({"error": "output not ready"}), 404

    ext  = Path(output_path).suffix.lower()
    mime = "image/png" if ext == ".png" else "model/gltf-binary"
    return send_file(output_path, mimetype=mime)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"[renderer] Starting on port {port}, Blender: {BLENDER_BIN}")
    # Use gunicorn in production for stability; fall back to Flask dev server if unavailable.
    try:
        import gunicorn  # noqa: F401 — check it is installed
        import subprocess as _sp
        import sys as _sys
        _sp.run([
            _sys.executable, "-m", "gunicorn",
            "server:app",
            "--bind", f"0.0.0.0:{port}",
            "--workers", "1",   # 1 worker = shared in-memory job store
            "--threads", "4",   # thread concurrency for polling
            "--timeout", "120", # long timeout for large file uploads
            "--access-logfile", "-",
        ], check=True)
    except (ImportError, Exception):
        app.run(host="0.0.0.0", port=port, threaded=True)
