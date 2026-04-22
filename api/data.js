/**
 * Vercel Serverless Function: /api/data
 *
 * Fetches caption JSON files and image metadata from Google Drive.
 * Returns merged data identical to the old static data.json format,
 * but with Google Drive image URLs instead of local paths.
 *
 * Required environment variables:
 *   GOOGLE_SERVICE_ACCOUNT_KEY  – base64-encoded JSON key
 *   DRIVE_JSONS_FOLDER_ID      – Google Drive folder ID for caption JSONs
 *   DRIVE_IMAGES_FOLDER_ID     – Google Drive folder ID for images
 */

const { google } = require("googleapis");

// ── Auth ────────────────────────────────────────────
function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY env var is not set");

  const credentials = JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
}

// ── Drive helpers ───────────────────────────────────
async function listFiles(drive, folderId, mimeFilter) {
  const allFiles = [];
  let pageToken = null;

  do {
    const q = `'${folderId}' in parents and trashed = false${
      mimeFilter ? ` and ${mimeFilter}` : ""
    }`;
    const res = await drive.files.list({
      q,
      fields: "nextPageToken, files(id, name, mimeType)",
      pageSize: 1000,
      orderBy: "name",
      pageToken: pageToken || undefined,
    });
    allFiles.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return allFiles;
}

async function downloadJson(drive, fileId) {
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "json" }
  );
  return res.data;
}

// ── Main handler ────────────────────────────────────
module.exports = async function handler(req, res) {
  // Only allow GET
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const jsonsFolderId = process.env.DRIVE_JSONS_FOLDER_ID;
    const imagesFolderId = process.env.DRIVE_IMAGES_FOLDER_ID;

    if (!jsonsFolderId || !imagesFolderId) {
      return res.status(500).json({
        error: "DRIVE_JSONS_FOLDER_ID and DRIVE_IMAGES_FOLDER_ID must be set",
      });
    }

    const auth = getAuth();
    const drive = google.drive({ version: "v3", auth });

    // Fetch JSON file list and image file list in parallel
    const [jsonFiles, imageFiles] = await Promise.all([
      listFiles(drive, jsonsFolderId, "mimeType = 'application/json'"),
      listFiles(drive, imagesFolderId, "mimeType contains 'image/'"),
    ]);

    // Build a lookup: stem → { id, name } for images
    const imageMap = new Map();
    for (const img of imageFiles) {
      const stem = img.name.replace(/\.[^.]+$/, "");
      imageMap.set(stem, { id: img.id, name: img.name });
    }

    // Download all JSONs in parallel (batches of 10 to avoid rate limits)
    const items = [];
    const batchSize = 10;

    for (let i = 0; i < jsonFiles.length; i += batchSize) {
      const batch = jsonFiles.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (jf) => {
          try {
            const data = await downloadJson(drive, jf.id);
            const stem = jf.name.replace(/\.json$/, "");
            const imageId = data.image_id || stem;
            const img = imageMap.get(stem);

            return {
              image_id: imageId,
              image_file: img ? img.name : null,
              image_drive_id: img ? img.id : null,
              selected_labels: data.selected_labels || {},
              captions: data.captions_tagged || data.captions || {},
              captions_untagged: data.captions_untagged || {},
              model_stage1: data.model_stage1 || "",
              model_stage2: data.model_stage2 || "",
            };
          } catch (err) {
            console.error(`Error reading ${jf.name}:`, err.message);
            return null;
          }
        })
      );
      items.push(...results.filter(Boolean));
    }

    // Cache for 5 minutes, stale-while-revalidate for 10 minutes
    res.setHeader(
      "Cache-Control",
      "s-maxage=300, stale-while-revalidate=600"
    );
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json(items);
  } catch (err) {
    console.error("API error:", err);
    return res.status(500).json({ error: err.message });
  }
};
