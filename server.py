"""
Caption Viewer Server (with Google Drive support)
===================================================
Run: python server.py
Then open http://localhost:8500 in your browser.

Data source priority:
  1. Google Drive API  — if .env has DRIVE_JSONS_FOLDER_ID etc.
  2. Local folders     — from config.py (JSONS_DIR / IMAGES_DIR)

Configure Google Drive in a .env file (see .env.example).
Configure local folders in config.py.
"""

import base64
import http.server
import io
import json
import os
import socketserver
import concurrent.futures
import time
from pathlib import Path
from urllib.parse import unquote

PORT = 8500
BASE_DIR = Path(__file__).parent

# ── Load .env file ───────────────────────────────────
def load_dotenv():
    env_file = BASE_DIR / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())

load_dotenv()

# ── Determine data source ───────────────────────────
USE_DRIVE = bool(
    os.environ.get("DRIVE_JSONS_FOLDER_ID")
    and os.environ.get("DRIVE_IMAGES_FOLDER_ID")
    and os.environ.get("GOOGLE_SERVICE_ACCOUNT_KEY")
)

GOOGLE_SHEET_ID = os.environ.get("GOOGLE_SHEET_ID", "")
drive_service = None
sheets_service = None
DRIVE_JSONS_FOLDER_ID = os.environ.get("DRIVE_JSONS_FOLDER_ID", "")
DRIVE_IMAGES_FOLDER_ID = os.environ.get("DRIVE_IMAGES_FOLDER_ID", "")

if USE_DRIVE:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    raw_key = os.environ["GOOGLE_SERVICE_ACCOUNT_KEY"]
    creds_json = json.loads(base64.b64decode(raw_key).decode("utf-8"))
    creds = service_account.Credentials.from_service_account_info(
        creds_json,
        scopes=[
            "https://www.googleapis.com/auth/drive.readonly",
            "https://www.googleapis.com/auth/spreadsheets"
        ],
    )
    drive_service = build("drive", "v3", credentials=creds)
    if GOOGLE_SHEET_ID:
        sheets_service = build("sheets", "v4", credentials=creds)
    print("[OK] Google APIs connected")
else:
    from config import JSONS_DIR, IMAGES_DIR
    print("[OK] Using local folders (no Drive credentials found)")


# ── Drive helpers ────────────────────────────────────
def drive_list_files(folder_id, mime_filter=None):
    """List all files in a Drive folder."""
    all_files = []
    page_token = None
    q = f"'{folder_id}' in parents and trashed = false"
    if mime_filter:
        q += f" and {mime_filter}"

    while True:
        resp = drive_service.files().list(
            q=q,
            fields="nextPageToken, files(id, name, mimeType)",
            pageSize=1000,
            orderBy="name",
            pageToken=page_token,
        ).execute()
        all_files.extend(resp.get("files", []))
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return all_files


_DRIVE_CACHE = None
_DRIVE_CACHE_TIME = 0
CACHE_TTL = 300  # 5 minutes

def drive_download_json(file_id):
    """Download and parse a JSON file from Drive."""
    content = drive_service.files().get_media(fileId=file_id).execute()
    return json.loads(content.decode("utf-8"))

def get_sheets_state():
    """Fetch user action state from Google Sheets by overriding dupes with last row."""
    if not sheets_service or not GOOGLE_SHEET_ID:
        return {}
    try:
        # Assuming sheet has data in cols A:B (image_id, action)
        # Using 'A:B' omits the sheet name, defaulting to the first visible sheet.
        result = sheets_service.spreadsheets().values().get(
            spreadsheetId=GOOGLE_SHEET_ID, range="A:B"
        ).execute()
        rows = result.get('values', [])
        state = {}
        for row in rows:
            if len(row) >= 2:
                state[row[0]] = row[1]
        return state
    except Exception as e:
        print(f"Error fetching sheets state: {e}")
        return {}


# ── Data building ────────────────────────────────────
def build_data_from_drive():
    """Fetch all data from Google Drive in parallel with caching."""
    global _DRIVE_CACHE, _DRIVE_CACHE_TIME

    if _DRIVE_CACHE is not None and (time.time() - _DRIVE_CACHE_TIME) < CACHE_TTL:
        print("[CACHE] Returning Drive data from memory cache")
        return _DRIVE_CACHE

    json_files = drive_list_files(
        DRIVE_JSONS_FOLDER_ID, "mimeType = 'application/json'"
    )
    image_files = drive_list_files(
        DRIVE_IMAGES_FOLDER_ID, "mimeType contains 'image/'"
    )

    # Build stem → {id, name} lookup for images
    image_map = {}
    for img in image_files:
        stem = os.path.splitext(img["name"])[0]
        image_map[stem] = {"id": img["id"], "name": img["name"]}

    sheet_state = get_sheets_state()

    items = []
    print(f"Downloading {len(json_files)} JSON files concurrently...")

    def fetch_one(jf):
        # Create a thread-local service object to avoid concurrency issues
        local_service = build("drive", "v3", credentials=creds)
        content = local_service.files().get_media(fileId=jf["id"]).execute()
        data = json.loads(content.decode("utf-8"))
        
        stem = os.path.splitext(jf["name"])[0]
        image_id = data.get("image_id", stem)
        img = image_map.get(stem)

        return {
            "image_id": image_id,
            "action_status": sheet_state.get(image_id, ""),
            "image_file": img["name"] if img else None,
            "image_path": data.get("image_path", ""),
            "image_drive_id": img["id"] if img else None,
            "selected_labels": data.get("selected_labels", {}),
            "captions": data.get("captions_tagged", data.get("captions", {})),
            "captions_untagged": data.get("captions_untagged", {}),
            "model_stage1": data.get("model_stage1", ""),
            "model_stage2": data.get("model_stage2", ""),
            "raw_model_output_stage1": data.get("raw_model_output_stage1", ""),
            "raw_model_output_stage2": data.get("raw_model_output_stage2", ""),
        }
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        future_to_jf = {executor.submit(fetch_one, jf): jf for jf in json_files}
        for future in concurrent.futures.as_completed(future_to_jf):
            jf = future_to_jf[future]
            try:
                items.append(future.result())
            except Exception as e:
                print(f"Error reading {jf['name']}: {e}")

    _DRIVE_CACHE = items
    _DRIVE_CACHE_TIME = time.time()
    return items


def build_data_from_local():
    """Load data from local folders (original behavior)."""
    items = []
    json_files = sorted(JSONS_DIR.glob("*.json"))

    for jf in json_files:
        try:
            with open(jf, "r", encoding="utf-8") as f:
                data = json.load(f)

            image_id = data.get("image_id", jf.stem)
            img_file = None
            for ext in (".jpg", ".jpeg", ".png", ".webp"):
                candidate = IMAGES_DIR / (jf.stem + ext)
                if candidate.exists():
                    img_file = candidate.name
                    break

            items.append({
                "image_id": image_id,
                "image_file": img_file,
                "image_path": data.get("image_path", ""),
                "image_drive_id": None,
                "selected_labels": data.get("selected_labels", {}),
                "captions": data.get("captions_tagged", data.get("captions", {})),
                "captions_untagged": data.get("captions_untagged", {}),
                "model_stage1": data.get("model_stage1", ""),
                "model_stage2": data.get("model_stage2", ""),
                "raw_model_output_stage1": data.get("raw_model_output_stage1", ""),
                "raw_model_output_stage2": data.get("raw_model_output_stage2", ""),
            })
        except Exception as e:
            print(f"Error reading {jf}: {e}")

    return items


# ── HTTP Handler ─────────────────────────────────────
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

    def do_POST(self):
        if self.path == "/api/action":
            self.handle_action()
        else:
            self.send_error(404, "Not Found")

    def handle_action(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            image_id = data.get("image_id")
            action = data.get("action")
            
            if not sheets_service or not GOOGLE_SHEET_ID:
                self.send_error(500, "Sheets integration not configured properly in .env")
                return
                
            body = {
                "values": [[image_id, action, time.strftime("%Y-%m-%d %H:%M:%S")]]
            }
            sheets_service.spreadsheets().values().append(
                spreadsheetId=GOOGLE_SHEET_ID,
                range="A:C",
                valueInputOption="USER_ENTERED",
                insertDataOption="INSERT_ROWS",
                body=body
            ).execute()
            
            # Note: We update caching logic client-side, avoiding a heavy drive refresh here.
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok"}).encode())
        except Exception as e:
            print(f"Error handling action: {e}")
            self.send_error(500, str(e))


    def send_data(self):
        """Return all JSON data."""
        if USE_DRIVE:
            items = build_data_from_drive()
        else:
            items = build_data_from_local()

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(items).encode())

    def send_image(self):
        """Serve an image — from Drive or local folder."""
        filename = unquote(self.path[len("/api/image/"):])

        if USE_DRIVE:
            # Proxy the image from Google Drive to avoid ORB blocking
            try:
                # Find the image in Drive by name
                stem = os.path.splitext(filename)[0]
                q = f"'{DRIVE_IMAGES_FOLDER_ID}' in parents and trashed = false and name contains '{stem}'"
                resp = drive_service.files().list(q=q, fields="files(id, name, mimeType)", pageSize=1).execute()
                files = resp.get("files", [])
                if not files:
                    self.send_error(404, "Image not found on Drive")
                    return
                img = files[0]
                content = drive_service.files().get_media(fileId=img["id"]).execute()
                self.send_response(200)
                self.send_header("Content-Type", img.get("mimeType", "image/jpeg"))
                self.send_header("Cache-Control", "public, max-age=3600")
                self.end_headers()
                self.wfile.write(content)
            except Exception as e:
                print(f"Error proxying image {filename}: {e}")
                self.send_error(500, str(e))
            return

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
    source = "Google Drive" if USE_DRIVE else "Local folders"
    print(f"\nStarting Caption Viewer on http://localhost:{PORT}")
    print(f"Data source: {source}")

    if USE_DRIVE:
        print(f"  JSONs folder ID:  {DRIVE_JSONS_FOLDER_ID}")
        print(f"  Images folder ID: {DRIVE_IMAGES_FOLDER_ID}")
    else:
        print(f"  JSON folder:   {JSONS_DIR}")
        print(f"  Images folder: {IMAGES_DIR}")
        if not JSONS_DIR.exists():
            print(f"  WARNING: JSON folder does not exist: {JSONS_DIR}")
        else:
            print(f"  JSONs found:   {len(list(JSONS_DIR.glob('*.json')))}")
        if not IMAGES_DIR.exists():
            print(f"  WARNING: Images folder does not exist: {IMAGES_DIR}")
        else:
            print(f"  Images found:  {len(list(IMAGES_DIR.glob('*.*')))}")

    print()
    with socketserver.TCPServer(("", PORT), ViewerHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down.")
