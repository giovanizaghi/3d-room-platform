#!/usr/bin/env python3
"""
Blender headless render script.

Invocation:
    blender -b <model.blend> -P render.py -- --output /path/out.png --render-id <id> --items <json>

The .blend scene is loaded by Blender via the -b flag before this script runs.
bpy is available in the interpreter. The script configures render settings and
triggers the render using the scene's native camera.
"""
import argparse
import json
import os
import sys

import bpy  # type: ignore  # provided by Blender's embedded Python

from ai_enhance import enhance_image


def progress(pct: int, stage: str, message: str) -> None:
    """Emit a structured progress line that the Node worker parses for heartbeats."""
    print(f'PROGRESS:{json.dumps({"progress": pct, "stage": stage, "message": message})}', flush=True)


def render_scene(output_path: str, use_eevee: bool = False) -> None:
    scene = bpy.context.scene
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = output_path
    scene.render.resolution_x = 800
    scene.render.resolution_y = 600
    scene.render.resolution_percentage = 100

    if use_eevee:
        # EEVEE_NEXT is the engine name in Blender 4.x (renamed from BLENDER_EEVEE in 3.x).
        engine = "BLENDER_EEVEE_NEXT" if bpy.app.version >= (4, 0, 0) else "BLENDER_EEVEE"
        scene.render.engine = engine
        print(f"[render.py] Render engine: {engine} (fast mode for AI enhancement)")
    else:
        # Force Cycles with CPU — headless containers have no GPU.
        scene.render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        scene.cycles.use_denoising = False
        scene.cycles.samples = 32
        print("[render.py] Render engine: Cycles (CPU, 32 samples, no denoising)")

    progress(30, "rendering", "Rendering scene...")
    print(f"[render.py] Rendering scene to {output_path} ...")
    try:
        bpy.ops.render.render(write_still=True)
    except Exception as exc:
        print(f"[render.py] ERROR during bpy.ops.render.render: {exc}", file=sys.stderr)
        raise
    progress(70, "render_complete", "Render saved")
    print(f"[render.py] Render complete: {output_path}")


def parse_args() -> argparse.Namespace:
    # Blender passes its own args before '--'; only parse what follows '--'.
    script_argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]

    parser = argparse.ArgumentParser(description="Blender headless render")
    parser.add_argument("--output", required=True, help="Absolute output image path")
    parser.add_argument("--render-id", default="", help="Render job ID (for logging)")
    parser.add_argument("--items", default="[]", help="JSON array of room items")
    parser.add_argument("--blend-file", default="", help="Path to the .blend file (informational; loaded via -b)")
    parser.add_argument("--ai-enhance", action="store_true", help="Send rendered image to OpenAI for AI enhancement")
    return parser.parse_args(script_argv)


def main() -> None:
    args = parse_args()

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)

    blend_file = args.blend_file or "(loaded via -b flag)"
    print(f"[render.py] blend_file={blend_file}  render_id={args.render_id}  output={args.output}  ai_enhance={args.ai_enhance}")
    progress(10, "setup", "Scene loaded, starting render")

    render_scene(args.output, use_eevee=args.ai_enhance)

    if args.ai_enhance:
        progress(75, "ai_enhance_start", "Starting AI enhancement...")
        enhance_image(args.output)
        progress(95, "ai_enhance_complete", "AI enhancement complete")

    progress(100, "done", "All steps complete")


if __name__ == "__main__":
    main()
