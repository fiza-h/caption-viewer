"""
Build script: reads individual JSON files and generates a single data.json
for static deployment.

Run:  python build.py
"""

import json
import os
from pathlib import Path

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
JSONS_DIR = DATA_DIR / "jsons"
IMAGES_DIR = DATA_DIR / "images"
OUTPUT = BASE_DIR / "data.json"

IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp")


def build():
    json_files = sorted(JSONS_DIR.glob("*.json"))
    items = []

    for jf in json_files:
        try:
            with open(jf, "r", encoding="utf-8") as f:
                data = json.load(f)

            stem = jf.stem
            image_id = data.get("image_id", stem)

            # Find matching image
            image_file = None
            for ext in IMAGE_EXTS:
                candidate = IMAGES_DIR / (stem + ext)
                if candidate.exists():
                    image_file = stem + ext
                    break

            items.append({
                "image_id": image_id,
                "image_file": image_file,
                "selected_labels": data.get("selected_labels", {}),
                "captions": data.get("captions_tagged", {}),
                "captions_untagged": data.get("captions_untagged", {}),
                "model_stage1": data.get("model_stage1", ""),
                "model_stage2": data.get("model_stage2", ""),
            })
        except Exception as e:
            print(f"Error reading {jf}: {e}")

    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(items, f)

    print(f"Built data.json with {len(items)} items")


if __name__ == "__main__":
    build()
