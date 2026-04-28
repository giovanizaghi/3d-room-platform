#!/usr/bin/env python3
import argparse
import os
import struct
import zlib


def write_tiny_png(path: str) -> None:
    """Write a 1x1 PNG so local development still works without Blender."""
    width, height = 1, 1
    raw_data = b"\x00\x2d\x63\x8f"

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack("!I", len(data))
            + tag
            + data
            + struct.pack("!I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack("!IIBBBBB", width, height, 8, 2, 0, 0, 0)
    idat = zlib.compress(raw_data)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")

    with open(path, "wb") as f:
        f.write(png)


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
    args = parser.parse_args()

    os.makedirs(os.path.dirname(args.output), exist_ok=True)

    try:
        render_with_blender(args.output)
        print(f"Rendered image with bpy to {args.output}")
    except Exception as exc:
        print(f"bpy render unavailable ({exc}), writing fallback PNG instead")
        write_tiny_png(args.output)
        print(f"Fallback image written to {args.output}")


if __name__ == "__main__":
    main()
