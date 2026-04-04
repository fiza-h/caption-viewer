// ── State ────────────────────────────────────────────
let items = [];
let currentIndex = 0;

// ── DOM ──────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const loading     = $("#loading");
const emptyState  = $("#empty-state");
const viewer      = $("#viewer");
const counter     = $("#counter");
const mainImage   = $("#main-image");
const noImagePlac = $("#no-image-placeholder");
const imageId     = $("#image-id");
const modelInfo   = $("#model-info");
const labelsContent = $("#labels-content");
const capExplicit = $("#caption-explicit");
const capModerate = $("#caption-moderate");
const capNoleak   = $("#caption-noleak");
const btnPrev     = $("#btn-prev");
const btnNext     = $("#btn-next");

// ── Init ─────────────────────────────────────────────
async function init() {
  try {
    const res = await fetch("/data.json");
    items = await res.json();
  } catch (e) {
    console.error("Failed to load data:", e);
  }

  loading.classList.add("hidden");

  if (items.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }

  viewer.classList.remove("hidden");
  render();
}

// ── Render current item ──────────────────────────────
function render() {
  const item = items[currentIndex];

  // Counter
  counter.textContent = `${currentIndex + 1} / ${items.length}`;

  // Image
  if (item.image_file) {
    mainImage.src = `/data/images/${encodeURIComponent(item.image_file)}`;
    mainImage.classList.remove("hidden");
    noImagePlac.classList.add("hidden");
  } else {
    mainImage.classList.add("hidden");
    noImagePlac.classList.remove("hidden");
  }

  // Meta
  imageId.textContent = item.image_id;
  const models = [item.model_stage1, item.model_stage2].filter(Boolean);
  modelInfo.textContent = models.length ? models.join(" → ") : "";

  // Labels
  labelsContent.innerHTML = "";
  const labels = item.selected_labels || {};
  for (const [level, val] of Object.entries(labels)) {
    const arr = Array.isArray(val) ? val : [val];
    arr.forEach(label => {
      const chip = document.createElement("span");
      chip.className = `label-chip chip-${level}`;
      chip.textContent = label;
      labelsContent.appendChild(chip);
    });
  }

  // Captions (tagged versions with highlighted tags)
  const captions = item.captions || {};
  capExplicit.innerHTML = highlightTags(captions.explicit || "—");
  capModerate.innerHTML = highlightTags(captions.moderate || "—");
  capNoleak.innerHTML   = highlightTags(captions.no_leak  || "—");

  // Animate
  const content = $("#content");
  content.style.animation = "none";
  content.offsetHeight; // trigger reflow
  content.style.animation = "fadeIn 0.25s ease";
}

// ── Highlight XML-style tags in captions ─────────────
function highlightTags(text) {
  // Escape HTML first
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Now highlight our tags: &lt;tag_name&gt;...&lt;/tag_name&gt;
  return escaped.replace(
    /&lt;(\w+)&gt;(.*?)&lt;\/\1&gt;/g,
    (_, tag, content) => {
      const level = getTagLevel(tag);
      return `<span class="tag tag-${level}" title="${tag}">${content}</span>`;
    }
  );
}

function getTagLevel(tag) {
  // Map known tags to their risk level for coloring
  const explicitTags = ["date_time", "rel_personal", "name", "email", "phone",
    "address", "location_gps", "employer", "school", "id_number", "age",
    "gender", "ethnicity", "religion", "political", "health", "financial",
    "criminal", "sexual", "substance"];
  const moderateTags = ["landmark", "location_city", "location_country",
    "event", "organization", "occupation", "hobby"];

  if (explicitTags.includes(tag)) return "explicit";
  if (moderateTags.includes(tag)) return "moderate";
  return "explicit"; // default
}

// ── Navigation ───────────────────────────────────────
function navigate(dir) {
  if (items.length === 0) return;
  currentIndex = (currentIndex + dir + items.length) % items.length;
  render();
}

btnPrev.addEventListener("click", () => navigate(-1));
btnNext.addEventListener("click", () => navigate(1));

// Keyboard navigation
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft")  navigate(-1);
  if (e.key === "ArrowRight") navigate(1);
});

// Touch swipe support
let touchStartX = 0;
let touchEndX = 0;

document.addEventListener("touchstart", (e) => {
  touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

document.addEventListener("touchend", (e) => {
  touchEndX = e.changedTouches[0].screenX;
  const diff = touchStartX - touchEndX;
  if (Math.abs(diff) > 60) {
    navigate(diff > 0 ? 1 : -1);
  }
}, { passive: true });

// ── Go ───────────────────────────────────────────────
init();
