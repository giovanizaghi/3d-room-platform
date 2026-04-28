#!/usr/bin/env python3
"""
Render script supporting two invocation modes:

  1. Blender headless (primary):
       blender -b chair.blend -P render.py -- --output /path/out.png --render-id <id> --items <json>
     The .blend scene is already loaded by Blender when this script runs.
     bpy is available in the interpreter.

  2. Direct Python (fallback / local dev without Blender):
       python3 render.py --output /path/out.png --render-id <id> --items <json>
     bpy is not available; a mock PNG is generated via Pillow instead.
"""
import argparse
import json
import os
import random
import sys


PALETTE = [
    (229, 200, 174),  # sand
    (174, 198, 207),  # sky blue
    (193, 225, 193),  # sage
    (247, 202, 201),  # blush
    (230, 230, 250),  # lavender
    (255, 238, 173),  # butter
]


def _t(draw, xy, text, fill):
    """Draw text using only ASCII-safe characters and the built-in bitmap font."""
    from PIL import ImageFont
    font = ImageFont.load_default()
    safe = text.encode("latin-1", errors="replace").decode("latin-1")
    draw.text(xy, safe, fill=fill, font=font)


def write_fallback_png(path: str, render_id: str = "", items: list = None) -> None:
    """Generate a visible 400x300 PNG with metadata - works without Blender."""
    from PIL import Image, ImageDraw

    if items is None:
        items = []

    bg = random.choice(PALETTE)
    img = Image.new("RGB", (400, 300), bg)
    draw = ImageDraw.Draw(img)

    # Header bar
    draw.rectangle([0, 0, 400, 48], fill=(50, 50, 50))
    _t(draw, (16, 14), "3D Room Platform", fill=(255, 255, 255))

    # Render ID
    short_id = render_id[:8] if render_id else "unknown"
    _t(draw, (16, 64), "Render: " + short_id, fill=(60, 60, 60))

    # Items list
    y = 104
    if items:
        _t(draw, (16, y), "Items:", fill=(80, 80, 80))
        y += 24
        for item in items[:6]:
            if isinstance(item, dict):
                qty = item.get("quantity", 1)
                label = "  - " + str(item.get("sku", "?")) + "  x" + str(qty)
            else:
                label = "  - " + str(item)
            _t(draw, (16, y), label, fill=(80, 80, 80))
            y += 22
    else:
        _t(draw, (16, y), "No items specified", fill=(140, 140, 140))

    # Footer
    draw.rectangle([0, 272, 400, 300], fill=(50, 50, 50))
    _t(draw, (16, 278), "mock renderer | fallback PNG", fill=(160, 160, 160))

    img.save(path, "PNG")
    print("Fallback PNG written to " + path + " (" + str(os.path.getsize(path)) + " bytes)")


def render_with_blender(output_path: str) -> None:
    """
    Render the currently loaded .blend scene to output_path.

    This function is only called when the script is running inside Blender
    (bpy is available). The scene has already been loaded via the -b flag.
    We only configure render settings and trigger the render.
    """
    import bpy  # type: ignore  # only available inside Blender

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
        # Reduce sample count for fast CPU rendering (MVP).
        # 32 samples is sufficient to produce a visible, non-noisy result
        # without the multi-minute render times of the default 512 samples.
        scene.cycles.samples = 32

    print(f"[render.py] Rendering scene to {output_path} ...")
    bpy.ops.render.render(write_still=True)
    print(f"[render.py] Render complete: {output_path}")


def parse_args() -> argparse.Namespace:
    """
    Parse arguments whether invoked directly (python3) or via Blender CLI.

    When Blender runs the script, sys.argv contains Blender's own args followed
    by '--' and then the script's args. Extract only the script-specific portion.
    """
    if "--" in sys.argv:
        # Blender invocation: blender -b file.blend -P script.py -- <script args>
        script_argv = sys.argv[sys.argv.index("--") + 1:]
    else:
        # Direct invocation: python3 render.py <args>
        script_argv = sys.argv[1:]

    parser = argparse.ArgumentParser(description="Render a room artifact")
    parser.add_argument("--output", required=True, help="Absolute output image path")
    parser.add_argument("--render-id", default="", help="Render job ID (for labeling)")
    parser.add_argument("--items", default="[]", help="JSON array of room items")
    return parser.parse_args(script_argv)


def main() -> None:
    args = parse_args()

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)

    try:
        items = json.loads(args.items)
    except json.JSONDecodeError:
        items = []

    # Try Blender render first (bpy available when running inside Blender)
    try:
        render_with_blender(args.output)
    except ImportError:
        # bpy not available — running outside Blender (local dev / CI)
        print("[render.py] bpy unavailable, using fallback PNG renderer")
        write_fallback_png(args.output, render_id=args.render_id, items=items)
    except Exception as exc:
        # Blender render failed unexpectedly — fallback so the job isn't lost
        print(f"[render.py] Blender render failed ({exc}), using fallback PNG renderer")
        write_fallback_png(args.output, render_id=args.render_id, items=items)


if __name__ == "__main__":
    main()
