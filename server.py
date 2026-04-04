"""
Caption Viewer Server
Run: python server.py
Then open http://localhost:8500 in your browser.
"""

import http.server
import json
import os
import socketserver
from pathlib import Path
from urllib.parse import unquote

PORT = 8500
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
JSONS_DIR = DATA_DIR / "jsons"
IMAGES_DIR = DATA_DIR / "images"


class ViewerHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def do_GET(self):
        if self.path == "/api/data":
            self.send_data()
        elif self.path.startswith("/api/image/"):
            self.send_image()
        else:
            super().do_GET()

    def send_data(self):
        """Return all JSON data merged with image availability."""
        items = []
        json_files = sorted(JSONS_DIR.glob("*.json"))

        for jf in json_files:
            try:
                with open(jf, "r", encoding="utf-8") as f:
                    data = json.load(f)

                image_id = data.get("image_id", jf.stem)
                # Try to find matching image
                img_file = None
                for ext in (".jpg", ".jpeg", ".png", ".webp"):
                    candidate = IMAGES_DIR / (jf.stem + ext)
                    if candidate.exists():
                        img_file = candidate.name
                        break

                items.append({
                    "image_id": image_id,
                    "image_file": img_file,
                    "selected_labels": data.get("selected_labels", {}),
                    "captions": data.get("captions_tagged", {}),
                    "captions_untagged": data.get("captions_untagged", {}),
                    "model_stage1": data.get("model_stage1", ""),
                    "model_stage2": data.get("model_stage2", ""),
                })
            except Exception as e:
                print(f"Error reading {jf}: {e}")

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(items).encode())

    def send_image(self):
        """Serve an image from the images folder."""
        filename = unquote(self.path[len("/api/image/"):])
        filepath = IMAGES_DIR / filename

        if not filepath.exists() or not filepath.is_file():
            self.send_error(404, "Image not found")
            return

        ext = filepath.suffix.lower()
        content_types = {
            ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".png": "image/png", ".webp": "image/webp",
        }

        self.send_response(200)
        self.send_header("Content-Type", content_types.get(ext, "application/octet-stream"))
        self.end_headers()
        with open(filepath, "rb") as f:
            self.wfile.write(f.read())


if __name__ == "__main__":
    print(f"Starting Caption Viewer on http://localhost:{PORT}")
    print(f"JSON folder:   {JSONS_DIR}")
    print(f"Images folder: {IMAGES_DIR}")
    print(f"JSONs found:   {len(list(JSONS_DIR.glob('*.json')))}")
    print(f"Images found:  {len(list(IMAGES_DIR.glob('*.*'))) - 1}")  # minus README
    with socketserver.TCPServer(("", PORT), ViewerHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down.")
