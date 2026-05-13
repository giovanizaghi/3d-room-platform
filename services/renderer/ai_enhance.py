#!/usr/bin/env python3
"""
AI image enhancement using OpenAI's image editing API.

This module is intentionally isolated from Blender/render logic so it can
be swapped for a different provider in the future without touching render.py.

Usage:
    from ai_enhance import enhance_image
    enhance_image("/path/to/render.png")

The function overwrites the original image with the enhanced version.
On any failure it logs the error and leaves the original image intact.
"""

import base64
import json
import os
import time


def _progress(pct: int, stage: str, message: str) -> None:
    print(f'PROGRESS:{json.dumps({"progress": pct, "stage": stage, "message": message})}', flush=True)


def enhance_image(image_path: str) -> None:
    """Send *image_path* to OpenAI for enhancement and overwrite it with the result.

    Environment variables consumed:
        OPENAI_API_KEY          — required; enhancement is skipped when absent.
        OPENAI_IMAGE_MODEL      — optional; defaults to "gpt-image-1".
    """
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        print("[ai_enhance] OPENAI_API_KEY is not set; skipping AI enhancement.")
        return

    try:
        from openai import OpenAI  # type: ignore  # installed via requirements.txt
    except ImportError:
        print("[ai_enhance] 'openai' package is not installed; skipping AI enhancement.")
        return

    model = os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-1").strip()

    print(f"[ai_enhance] Starting AI enhancement  image={image_path}  model={model}")
    _progress(78, "ai_enhance_calling", "Calling OpenAI image API...")
    start = time.monotonic()

    try:
        client = OpenAI(api_key=api_key)

        with open(image_path, "rb") as f:
            response = client.images.edit(
                model=model,
                image=f,
                prompt=(
                    "Enhance this 3D room render with realistic lighting, photorealistic textures, "
                    "and high-quality visual details. Preserve the original scene composition and layout."
                ),
                n=1,
                size="1024x1024",
            )

        image_data = response.data[0]

        if hasattr(image_data, "b64_json") and image_data.b64_json:
            enhanced_bytes = base64.b64decode(image_data.b64_json)
        elif hasattr(image_data, "url") and image_data.url:
            import urllib.request
            with urllib.request.urlopen(image_data.url) as resp:  # noqa: S310
                enhanced_bytes = resp.read()
        else:
            raise ValueError("OpenAI response contained no image data (neither b64_json nor url).")

        with open(image_path, "wb") as f:
            f.write(enhanced_bytes)

        elapsed = time.monotonic() - start
        print(f"[ai_enhance] Enhancement complete in {elapsed:.1f}s  image={image_path}")

    except Exception as exc:  # noqa: BLE001
        elapsed = time.monotonic() - start
        print(
            f"[ai_enhance] Enhancement failed after {elapsed:.1f}s: {exc}. "
            "Keeping original render."
        )
