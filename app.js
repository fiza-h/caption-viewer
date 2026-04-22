// ── State ────────────────────────────────────────────
let items = [];
let filteredItems = [];
let currentIndex = 0;
let showUntagged = false;

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
const imagePath   = $("#image-path");
const labelsContent = $("#labels-content");
const capExplicit = $("#caption-explicit");
const capModerate = $("#caption-moderate");
const capNoleak   = $("#caption-noleak");
const btnPrev     = $("#btn-prev");
const btnNext     = $("#btn-next");

const searchInput   = $("#search-input");
const untaggedToggle= $("#untagged-toggle");
const btnToggleRaw  = $("#btn-toggle-raw");
const rawDataContainer = $("#raw-data-container");
const rawStage1     = $("#raw-stage1");
const rawStage2     = $("#raw-stage2");

// Action Elements
const btnAccept   = $("#btn-accept");
const btnReject   = $("#btn-reject");
const actionBadge = $("#action-badge");

// ── Init ─────────────────────────────────────────────
async function fetchStatus() {
  try {
    const res = await fetch("/api/status");
    if (!res.ok) throw new Error("Status API returned " + res.status);
    const statusMap = await res.json();
    for (let item of items) {
      if (statusMap[item.image_id]) {
        item.action_status = statusMap[item.image_id];
      }
    }
    // Update active badge immediately if currently viewing
    if (filteredItems.length > 0) {
      renderStateBadge(filteredItems[currentIndex]);
    }
  } catch (e) {
    console.error("Failed to fetch live status:", e);
  }
}

async function init() {
  try {
    const res = await fetch("/api/data");
    items = await res.json();
    filteredItems = [...items];
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
  
  // Parallel async fetch for live Google Sheets states
  fetchStatus();
}

// ── Event Listeners ──────────────────────────────────
searchInput.addEventListener("input", (e) => {
  const query = e.target.value.toLowerCase();
  filteredItems = items.filter(item => {
    if (item.image_id && item.image_id.toLowerCase().includes(query)) return true;
    
    // Check labels
    const labels = item.selected_labels || {};
    for (const val of Object.values(labels)) {
      const arr = Array.isArray(val) ? val : [val];
      if (arr.some(l => l.toLowerCase().includes(query))) return true;
    }

    // Check current captions (tagged or untagged based on state)
    const captions = showUntagged ? (item.captions_untagged || {}) : (item.captions || {});
    for (const text of Object.values(captions)) {
      if (text && text.toLowerCase().includes(query)) return true;
    }
    
    return false;
  });
  
  currentIndex = 0;
  render();
});

untaggedToggle.addEventListener("change", (e) => {
  showUntagged = e.target.checked;
  // Re-run search if there's a query so count updates
  searchInput.dispatchEvent(new Event('input'));
});

btnToggleRaw.addEventListener("click", () => {
  rawDataContainer.classList.toggle("hidden");
  if (rawDataContainer.classList.contains("hidden")) {
    btnToggleRaw.textContent = "View Raw Model Output ▼";
  } else {
    btnToggleRaw.textContent = "Hide Raw Model Output ▲";
  }
});

// Send POST to /api/action
async function handleAction(action) {
  if (filteredItems.length === 0) return;
  const item = filteredItems[currentIndex];
  
  // Optimistic UI Update
  item.action_status = action;
  renderStateBadge(item);
  
  // Sync to Backend
  try {
    const response = await fetch("/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_id: item.image_id, action: action })
    });
    
    if (!response.ok) {
      const err = await response.text();
      alert("Failed to save to Google Sheets: " + err);
      // Revert optimistic update
      item.action_status = null;
      renderStateBadge(item);
    }
  } catch(e) {
    console.error("Failed to sync action", e);
    alert("Network error: Failed to save to Google Sheets.");
    // Revert
    item.action_status = null;
    renderStateBadge(item);
  }
}

btnAccept.addEventListener("click", () => handleAction("accept"));
btnReject.addEventListener("click", () => handleAction("reject"));


function renderStateBadge(item) {
  if (!item.action_status) {
    actionBadge.classList.add("hidden");
    actionBadge.className = "action-badge hidden";
    return;
  }
  
  actionBadge.classList.remove("hidden");
  if (item.action_status === "accept") {
    actionBadge.textContent = "ACCEPTED";
    actionBadge.className = "action-badge accepted";
  } else if (item.action_status === "reject") {
    actionBadge.textContent = "REJECTED";
    actionBadge.className = "action-badge rejected";
  }
}

// ── Render current item ──────────────────────────────
function render() {
  if (filteredItems.length === 0) {
    counter.textContent = `0 / 0`;
    // clear UI
    mainImage.classList.add("hidden");
    noImagePlac.classList.remove("hidden");
    imageId.textContent = "No match";
    modelInfo.textContent = "";
    imagePath.textContent = "";
    labelsContent.innerHTML = "";
    capExplicit.innerHTML = "—";
    capModerate.innerHTML = "—";
    capNoleak.innerHTML   = "—";
    rawStage1.textContent = "";
    rawStage2.textContent = "";
    actionBadge.className = "action-badge hidden";
    return;
  }
  
  const item = filteredItems[currentIndex];

  // Counter
  counter.textContent = `${currentIndex + 1} / ${filteredItems.length}`;

  // Image — served via /api/image/ (works for both Drive-proxied and local)
  if (item.image_file) {
    mainImage.src = `/api/image/${encodeURIComponent(item.image_file)}`;
    mainImage.classList.remove("hidden");
    noImagePlac.classList.add("hidden");
  } else {
    mainImage.classList.add("hidden");
    noImagePlac.classList.remove("hidden");
  }

  // Meta
  imageId.textContent = item.image_id;
  imagePath.textContent = item.image_path || "N/A";
  imagePath.title = item.image_path || "N/A"; // tooltip for long paths
  
  const models = [item.model_stage1, item.model_stage2].filter(Boolean);
  modelInfo.textContent = models.length ? models.join(" → ") : "Unknown model";

  // Action Badge Update
  renderStateBadge(item);

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

  // Captions
  const caps = showUntagged ? (item.captions_untagged || {}) : (item.captions || {});
  
  // If showing untagged, don't execute highlightTags to avoid any accidental XML matching, 
  // though there shouldn't be any.
  if (showUntagged) {
    // Just safely inject as text or escape
    capExplicit.textContent = caps.explicit || "—";
    capModerate.textContent = caps.moderate || "—";
    capNoleak.textContent   = caps.no_leak  || "—";
  } else {
    capExplicit.innerHTML = highlightTags(caps.explicit || "—");
    capModerate.innerHTML = highlightTags(caps.moderate || "—");
    capNoleak.innerHTML   = highlightTags(caps.no_leak  || "—");
  }

  // Raw Model Data
  rawStage1.textContent = item.raw_model_output_stage1 || "No Stage 1 output available";
  rawStage2.textContent = item.raw_model_output_stage2 || "No Stage 2 output available";

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
    "criminal", "sexual", "substance", "name_first", "rel_professional", "education_history"];
  const moderateTags = ["landmark", "location_city", "location_country",
    "event", "organization", "occupation", "hobby"];

  if (explicitTags.includes(tag)) return "explicit";
  if (moderateTags.includes(tag)) return "moderate";
  return "explicit"; // default
}

// ── Navigation ───────────────────────────────────────
function navigate(dir) {
  if (filteredItems.length === 0) return;
  currentIndex = (currentIndex + dir + filteredItems.length) % filteredItems.length;
  render();
}

btnPrev.addEventListener("click", () => navigate(-1));
btnNext.addEventListener("click", () => navigate(1));

// Keyboard navigation
document.addEventListener("keydown", (e) => {
  // Do not navigate if user is typing in search input
  if (document.activeElement === searchInput) return;
  
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
