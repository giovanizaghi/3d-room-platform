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


def render_scene(output_path: str) -> None:
    scene = bpy.context.scene
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = output_path
    scene.render.resolution_x = 800
    scene.render.resolution_y = 600
    scene.render.resolution_percentage = 100

    # Disable denoising — OpenImageDenoiser is not available in the apt-packaged
    # Blender build. Without this, render.render() raises an error and aborts.
    if hasattr(scene, "cycles"):
        scene.cycles.use_denoising = False
        # 32 samples is sufficient for a visible result on CPU without long render times.
        scene.cycles.samples = 32

    print(f"[render.py] Rendering scene to {output_path} ...")
    bpy.ops.render.render(write_still=True)
    print(f"[render.py] Render complete: {output_path}")


def parse_args() -> argparse.Namespace:
    # Blender passes its own args before '--'; only parse what follows '--'.
    script_argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]

    parser = argparse.ArgumentParser(description="Blender headless render")
    parser.add_argument("--output", required=True, help="Absolute output image path")
    parser.add_argument("--render-id", default="", help="Render job ID (for logging)")
    parser.add_argument("--items", default="[]", help="JSON array of room items")
    parser.add_argument("--blend-file", default="", help="Path to the .blend file (informational; loaded via -b)")
    return parser.parse_args(script_argv)


def main() -> None:
    args = parse_args()

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)

    blend_file = args.blend_file or "(loaded via -b flag)"
    print(f"[render.py] blend_file={blend_file}  render_id={args.render_id}  output={args.output}")

    render_scene(args.output)


if __name__ == "__main__":
    main()
