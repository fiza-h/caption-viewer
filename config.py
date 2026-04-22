"""
Configuration for Caption Viewer
=================================
Update JSONS_FOLDER and IMAGES_FOLDER below to point to your
Google Drive (or any other) folder where your data lives.

Examples:
  JSONS_FOLDER  = r"G:\My Drive\project\jsons"
  IMAGES_FOLDER = r"G:\My Drive\project\images"
"""

from pathlib import Path

# ─── UPDATE THESE PATHS ─────────────────────────────────────
# Point these to the folders containing your JSON and image files.
# Use raw strings (r"...") to avoid issues with backslashes on Windows.

JSONS_FOLDER = r"C:\Users\hibah\.gemini\antigravity\scratch\caption-viewer\data\jsons"
IMAGES_FOLDER = r"C:\Users\hibah\.gemini\antigravity\scratch\caption-viewer\data\images"

# ─────────────────────────────────────────────────────────────
# No need to edit below this line
JSONS_DIR = Path(JSONS_FOLDER)
IMAGES_DIR = Path(IMAGES_FOLDER)
