#!/usr/bin/env python3
import argparse
import os
import json
import random


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
    # Encode to latin-1, replacing any unencodable chars with '?'
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


def render_with_blender(path: str) -> None:
    import bpy

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))

    bpy.context.scene.render.image_settings.file_format = "PNG"
    bpy.context.scene.render.filepath = path
    bpy.context.scene.render.resolution_x = 800
    bpy.context.scene.render.resolution_y = 600
    bpy.ops.render.render(write_still=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Render a minimal room artifact")
    parser.add_argument("--output", required=True, help="Output image path")
    parser.add_argument("--render-id", default="", help="Render job ID (for labeling)")
    parser.add_argument("--items", default="[]", help="JSON array of room items")
    args = parser.parse_args()

    os.makedirs(os.path.dirname(args.output), exist_ok=True)

    try:
        items = json.loads(args.items)
    except json.JSONDecodeError:
        items = []

    try:
        render_with_blender(args.output)
        print(f"Rendered image with bpy to {args.output}")
    except Exception as exc:
        print(f"bpy render unavailable ({exc}), writing fallback PNG instead")
        write_fallback_png(args.output, render_id=args.render_id, items=items)


if __name__ == "__main__":
    main()
