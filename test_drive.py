"""Quick test: fetch one JSON from Drive and print its structure."""
import json, os, base64
from pathlib import Path

# Load .env
for line in Path(".env").read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip())

from google.oauth2 import service_account
from googleapiclient.discovery import build

creds_json = json.loads(base64.b64decode(os.environ["GOOGLE_SERVICE_ACCOUNT_KEY"]).decode())
creds = service_account.Credentials.from_service_account_info(
    creds_json, scopes=["https://www.googleapis.com/auth/drive.readonly"]
)
drive = build("drive", "v3", credentials=creds)

jsons_folder = os.environ["DRIVE_JSONS_FOLDER_ID"]
images_folder = os.environ["DRIVE_IMAGES_FOLDER_ID"]

# List first 2 JSONs
print("=== JSON FILES ===")
resp = drive.files().list(
    q=f"'{jsons_folder}' in parents and trashed = false and mimeType = 'application/json'",
    fields="files(id, name)",
    pageSize=2,
    orderBy="name",
).execute()
files = resp.get("files", [])
print(f"Found files (first 2): {[f['name'] for f in files]}")

for f in files:
    content = drive.files().get_media(fileId=f["id"]).execute()
    data = json.loads(content.decode())
    print(f"\n--- {f['name']} ---")
    print(f"Top-level keys: {list(data.keys())}")
    for key in data:
        val = data[key]
        if isinstance(val, dict):
            print(f"  {key}: dict with keys {list(val.keys())}")
        elif isinstance(val, str) and len(val) > 80:
            print(f"  {key}: '{val[:80]}...'")
        else:
            print(f"  {key}: {val}")

# Check images folder
print("\n=== IMAGE FILES ===")
try:
    resp2 = drive.files().list(
        q=f"'{images_folder}' in parents and trashed = false",
        fields="files(id, name, mimeType)",
        pageSize=3,
        orderBy="name",
    ).execute()
    img_files = resp2.get("files", [])
    print(f"Found images (first 3): {[(f['name'], f['id'][:10]+'...') for f in img_files]}")
except Exception as e:
    print(f"ERROR listing images folder: {e}")
