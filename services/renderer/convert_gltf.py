"""
convert_gltf.py — Blender headless script that exports the loaded scene as a GLB file.

Usage (via the worker):
    blender -b model.blend -P convert_gltf.py -- --output /path/to/model.glb

The script is driven by sys.argv so it works in both Blender headless mode (-b)
and plain Python mode (for testing without Blender). In plain Python mode only
argument parsing is exercised (no bpy calls are made).
"""

import argparse
import os
import sys

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    # Blender passes everything after '--' as script arguments.
    try:
        separator = sys.argv.index("--")
        script_args = sys.argv[separator + 1:]
    except ValueError:
        script_args = sys.argv[1:]

    parser = argparse.ArgumentParser(description="Export a Blender scene to GLB")
    parser.add_argument("--output", required=True, help="Absolute path for the output .glb file")
    return parser.parse_args(script_args)


# ---------------------------------------------------------------------------
# PROGRESS helper — parsed by the worker for heartbeat / progress updates
# ---------------------------------------------------------------------------

def progress(pct: int, stage: str, message: str) -> None:
    import json
    print(f"PROGRESS:{json.dumps({'progress': pct, 'stage': stage, 'message': message})}", flush=True)


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

def export_glb(output_path: str) -> None:
    import bpy  # Only available inside Blender

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    progress(10, "export_start", "Starting GLB export…")

    # GLB (binary glTF 2.0) — single self-contained file; embeds meshes,
    # materials, and textures. export_format='GLB' is available in Blender
    # 3.x and 4.x via the built-in glTF exporter.
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        use_selection=False,
        export_apply=True,       # Apply modifiers
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
    )

    progress(90, "export_complete", "GLB written to disk")

    if not os.path.exists(output_path):
        raise FileNotFoundError(f"GLB export produced no file at {output_path}")

    size_kb = os.path.getsize(output_path) / 1024
    progress(100, "done", f"Export complete ({size_kb:.1f} KB)")
    print(f"[convert_gltf] Exported: {output_path} ({size_kb:.1f} KB)", flush=True)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    args = parse_args()
    export_glb(args.output)
