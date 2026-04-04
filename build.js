/**
 * Build script: reads individual JSON files and generates a single data.json
 * for static deployment.
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const JSONS_DIR = path.join(DATA_DIR, "captions_gemini_3.1_pro_preview");
const IMAGES_DIR = path.join(DATA_DIR, "jpg");
const OUTPUT = path.join(__dirname, "data.json");

const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp"];

function build() {
  const jsonFiles = fs
    .readdirSync(JSONS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  const items = [];

  for (const file of jsonFiles) {
    try {
      const raw = fs.readFileSync(path.join(JSONS_DIR, file), "utf-8");
      const data = JSON.parse(raw);
      const stem = path.parse(file).name;
      const imageId = data.image_id || stem;

      // Find matching image
      let imageFile = null;
      for (const ext of IMAGE_EXTS) {
        const candidate = path.join(IMAGES_DIR, stem + ext);
        if (fs.existsSync(candidate)) {
          imageFile = stem + ext;
          break;
        }
      }

      items.push({
        image_id: imageId,
        image_file: imageFile,
        selected_labels: data.selected_labels || {},
        captions: data.captions_tagged || {},
        captions_untagged: data.captions_untagged || {},
        model_stage1: data.model_stage1 || "",
        model_stage2: data.model_stage2 || "",
      });
    } catch (err) {
      console.error(`Error reading ${file}:`, err.message);
    }
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(items, null, 2));
  console.log(`✅ Built data.json with ${items.length} items`);
}

build();
