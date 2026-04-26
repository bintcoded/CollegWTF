const API_BASE = "https://collegwtf.onrender.com/api/stories";

let majors = [];
let categories = [];
let activeMajorSlug = "";
let activeCatSlug = "";
let isLoggedIn = false;

const REACTIONS = [
  { key: "insane", emoji: "💀", label: "insane", field: "react_insane" },
  { key: "nah", emoji: "🤡", label: "nah what", field: "react_nah" },
  { key: "respect", emoji: "🫡", label: "respect", field: "react_respect" },
  { key: "downfall", emoji: "📉", label: "downfall", field: "react_downfall" },
];

document.addEventListener("DOMContentLoaded", async () => {
  await loadMeta();
  await renderFeed();
});

async function loadMeta() {
  const res = await fetch(`${API_BASE}/meta`);
  const data = await res.json();

  majors = data.majors || [];
  categories = data.categories || [];

  buildChips();
  fillModalDropdowns();
}

function buildChips() {
  const majorBox = document.getElementById("major-chips");
  const catBox = document.getElementById("cat-chips");

  majorBox.innerHTML = "";
  catBox.innerHTML = "";

  majorBox.appendChild(makeChip("All Majors", activeMajorSlug === "", () => {
    activeMajorSlug = "";
    buildChips();
    renderFeed();
  }));

  majors.forEach(m => {
    majorBox.appendChild(makeChip(m.name, activeMajorSlug === m.slug, () => {
      activeMajorSlug = activeMajorSlug === m.slug ? "" : m.slug;
      buildChips();
      renderFeed();
    }));
  });

  catBox.appendChild(makeChip("All", activeCatSlug === "", () => {
    activeCatSlug = "";
    buildChips();
    renderFeed();
  }));

  categories.forEach(c => {
    catBox.appendChild(makeChip(c.name, activeCatSlug === c.slug, () => {
      activeCatSlug = activeCatSlug === c.slug ? "" : c.slug;
      buildChips();
      renderFeed();
    }));
  });
}

function makeChip(label, active, onClick) {
  const btn = document.createElement("button");
  btn.className = "chip" + (active ? " active" : "");
  btn.textContent = label;
  btn.onclick = onClick;
  return btn;
}

function fillModalDropdowns() {
  const majorSelect = document.getElementById("submit-major");
  const catSelect = document.getElementById("submit-cat");

  if (!majorSelect || !catSelect) return;

  majorSelect.innerHTML = `<option value="">Select major...</option>`;
  catSelect.innerHTML = `<option value="">Select category...</option>`;

  majors.forEach(m => {
    majorSelect.innerHTML += `<option value="${m.major_id}">${m.name}</option>`;
  });

  categories.forEach(c => {
    catSelect.innerHTML += `<option value="${c.category_id}">${c.name}</option>`;
  });
}

async function renderFeed() {
  const sort = document.getElementById("sort-select").value;
  let url = `${API_BASE}?sort=${sort}`;

  if (activeMajorSlug) url += `&major=${activeMajorSlug}`;
  if (activeCatSlug) url += `&category=${activeCatSlug}`;

  const res = await fetch(url);
  const stories = await res.json();

  const feed = document.getElementById("story-feed");
  const count = document.getElementById("feed-count");

  count.textContent = `${stories.length} stor${stories.length === 1 ? "y" : "ies"}`;

  if (!stories.length) {
    feed.innerHTML = `<div class="empty-state"><div class="empty-icon">🤷</div><div>No stories here yet.</div></div>`;
    return;
  }

  feed.innerHTML = stories.map(buildStoryCard).join("");
}

function buildStoryCard(story) {
  const reactions = REACTIONS.map(r => `
    <button class="rx-btn" onclick="reactToStory(${story.story_id}, '${r.key}')">
      <span class="rx-emoji">${r.emoji}</span>
      <span>${story[r.field] || 0}</span>
    </button>
  `).join("");

  return `
    <div class="story-card">
      <div class="story-tags">
        <span class="tag">${story.major_name || "Unknown"}</span>
        <span class="tag tag-cat">${story.category_name || "Unknown"}</span>
      </div>
      <div class="story-title">${escapeHTML(story.title || "Untitled")}</div>
      <p class="story-text">${escapeHTML(story.content)}</p>
      <div class="story-footer">
        <span class="story-meta">${story.published_at ? new Date(story.published_at).toLocaleDateString() : ""}</span>
        <div class="rx-bar">${reactions}</div>
      </div>
    </div>
  `;
}

async function reactToStory(storyId, reaction) {
  await fetch(`${API_BASE}/${storyId}/react`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reaction })
  });

  renderFeed();
}

function openModal() {
  document.getElementById("modal").classList.add("open");
  fillModalDropdowns();
  updateSubmitForm();
}

function closeModal() {
  document.getElementById("modal").classList.remove("open");
}

function updateSubmitForm() {
  const text = document.getElementById("story-text");
  const count = document.getElementById("char-count");
  const major = document.getElementById("submit-major");
  const cat = document.getElementById("submit-cat");
  const btn = document.getElementById("submit-btn");

  if (!text || !btn) return;

  count.textContent = `${text.value.length} / 500`;
  btn.disabled = !(text.value.trim().length >= 20 && major.value && cat.value);
}

async function submitStory() {
  const content = document.getElementById("story-text").value.trim();
  // FIX: Parse as integers so backend receives numbers, not strings
  const major_id = parseInt(document.getElementById("submit-major").value);
  const category_id = parseInt(document.getElementById("submit-cat").value);

  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, major_id, category_id })
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.error || "Could not submit story");
    return;
  }

  closeModal();
  document.getElementById("story-text").value = "";
  showToast("Story submitted!");
  renderFeed();
}

function showPage(pageId) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));

  document.getElementById("page-" + pageId).classList.add("active");

  const nav = document.getElementById("nav-" + (pageId === "login" ? "admin" : pageId));
  if (nav) nav.classList.add("active");

  if (pageId === "feed") renderFeed();
  if (pageId === "admin") renderAdmin();
}

function handleAdminNav() {
  if (isLoggedIn) showPage("admin");
  else showPage("login");
}

function doLogin() {
  const user = document.getElementById("login-user").value.trim();
  const pass = document.getElementById("login-pass").value;
  const error = document.getElementById("login-error");

  if (user === "admin" && pass === "wtf2026") {
    isLoggedIn = true;
    error.textContent = "";
    showPage("admin");
  } else {
    error.textContent = "Invalid credentials. Try admin / wtf2026";
  }
}

function doLogout() {
  isLoggedIn = false;
  showPage("feed");
}

// FIX: Removed duplicate stub renderAdmin(). Single correct version below.
async function renderAdmin() {
  const approvedRes = await fetch(API_BASE);
  const approvedStories = await approvedRes.json();

  const pendingRes = await fetch(`${API_BASE}/pending/all`);
  const pendingStories = await pendingRes.json();

  document.getElementById("pending-badge").textContent =
    `● ${pendingStories.length} pending`;

  document.getElementById("stats-grid").innerHTML = `
    <div class="stat-card"><div class="stat-label">Total Stories</div><div class="stat-value">${approvedStories.length + pendingStories.length}</div></div>
    <div class="stat-card"><div class="stat-label">Pending</div><div class="stat-value orange">${pendingStories.length}</div></div>
    <div class="stat-card"><div class="stat-label">Approved</div><div class="stat-value green">${approvedStories.length}</div></div>
    <div class="stat-card"><div class="stat-label">Categories</div><div class="stat-value">${categories.length}</div></div>
  `;

  const queue = document.getElementById("pending-queue");

  if (!pendingStories.length) {
    queue.innerHTML = `<div class="empty-queue"><div class="big">✅</div>No pending stories.</div>`;
    return;
  }

  // FIX: Added Reject button to pending queue cards
  queue.innerHTML = pendingStories.map(s => `
    <div class="pending-card">
      <div class="pending-top">
        <div class="pending-text">
          <strong>${escapeHTML(s.title || "Untitled")}</strong>
          <p>${escapeHTML(s.content)}</p>
          <small>${s.major_name} · ${s.category_name}</small>
        </div>
      </div>
      <div class="pending-actions">
        <button class="btn-approve" onclick="approveStory(${s.story_id})">Approve</button>
        <button class="btn-reject" onclick="rejectStory(${s.story_id})">Reject</button>
      </div>
    </div>
  `).join("");
}

async function approveStory(id) {
  await fetch(`${API_BASE}/${id}/approve`, {
    method: "POST"
  });

  renderAdmin();
  renderFeed();
}

// FIX: Added missing rejectStory function
async function rejectStory(id) {
  await fetch(`${API_BASE}/${id}/reject`, {
    method: "POST"
  });

  renderAdmin();
}

function switchTab(tab) {
  document.getElementById("tab-content-queue").style.display = tab === "queue" ? "block" : "none";
  document.getElementById("tab-content-log").style.display = tab === "log" ? "block" : "none";
  document.getElementById("tab-content-stats").style.display = tab === "stats" ? "block" : "none";

  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  document.getElementById("tab-" + tab).classList.add("active");
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
