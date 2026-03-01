// =========================
// ETT PPE System - app.js (FULL, CORS-safe)
// IMPORTANT: Uses x-www-form-urlencoded (NO preflight)
// =========================

const API_URL =
  "https://script.google.com/macros/s/AKfycbwKtUSt5NLStZ0OCkwspBehi8PoUbV_NRKYrBE48Ehu3MmxzrGsq-kMGhORI_bX-i5O/exec";

let allOrders = [];
let allItems = [];
let currentUser = null;

// ---- VH fix (mobile safe area) ----
function setVH() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty("--vh", `${vh}px`);
}
window.addEventListener("resize", setVH);
window.addEventListener("orientationchange", () => setTimeout(setVH, 200));

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function showLoading(show) {
  const el = document.getElementById("loading-overlay");
  if (!el) return;
  el.classList.toggle("hidden", !show);
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(dt) {
  try {
    const d = new Date(dt);
    if (isNaN(d)) return "";
    return d.toLocaleDateString();
  } catch { return ""; }
}

function uiStatus(status) {
  if (status === "Зөвшөөрсөн") return "Олгосон";
  return status || "";
}

/**
 * ✅ CORS-SAFE call:
 * Uses x-www-form-urlencoded => browser will NOT send OPTIONS preflight
 */
async function apiPost(payload) {
  const params = new URLSearchParams();
  Object.entries(payload || {}).forEach(([k, v]) => {
    params.append(k, v == null ? "" : String(v));
  });

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: params.toString(),
  });

  const text = await res.text();

  if (!res.ok) {
    console.error("API HTTP ERROR", res.status, text);
    throw new Error(`API HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = safeJsonParse(text);
  if (!json) {
    console.error("API NON-JSON:", text);
    throw new Error("API JSON биш буцаалаа. Deploy/Access шалга.");
  }

  return json;
}

// -------------------------
// Sidebar UI
// -------------------------
window.openSidebar = () => {
  document.getElementById("sidebar")?.classList.add("open");
  document.getElementById("sidebar-overlay")?.classList.add("show");
};
window.closeSidebar = () => {
  document.getElementById("sidebar")?.classList.remove("open");
  document.getElementById("sidebar-overlay")?.classList.remove("show");
};
window.toggleSidebar = () => {
  const sb = document.getElementById("sidebar");
  if (!sb) return;
  sb.classList.contains("open") ? window.closeSidebar() : window.openSidebar();
};

window.showTab = (tabName, btn) => {
  document.querySelectorAll(".tab-content").forEach((t) => t.classList.add("hidden"));
  document.getElementById("tab-" + tabName)?.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");

  setTimeout(setVH, 0);
  if (window.innerWidth < 1024) window.closeSidebar();

  if (tabName === "items") window.renderItemsList();
};

// -------------------------
// Modal
// -------------------------
window.openModal = (title, html) => {
  document.getElementById("modal-title").innerText = title;
  document.getElementById("modal-body").innerHTML = html;
  document.getElementById("modal-overlay").classList.remove("hidden");
};
window.closeModal = () => {
  document.getElementById("modal-overlay").classList.add("hidden");
  document.getElementById("modal-body").innerHTML = "";
};

// -------------------------
// User cards
// -------------------------
function updateHeaderSubtitle() {
  const el = document.getElementById("user-display-name");
  if (!el) return;

  if (currentUser && currentUser.type !== "admin") {
    el.innerText = "";
    el.classList.add("hidden");
    return;
  }
  if (currentUser && currentUser.type === "admin") {
    el.classList.remove("hidden");
    el.innerText = "АДМИНИСТРАТОР";
    return;
  }
  el.innerText = "";
  el.classList.add("hidden");
}

function updateSidebarUserCard() {
  const nameEl = document.getElementById("sb-name");
  const idEl = document.getElementById("sb-id");
  const roleEl = document.getElementById("sb-role");
  const extraEl = document.getElementById("sb-extra");
  if (!nameEl || !idEl || !roleEl || !extraEl) return;

  if (!currentUser) {
    nameEl.innerText = "";
    idEl.innerText = "";
    roleEl.innerText = "";
    extraEl.innerText = "";
    return;
  }

  if (currentUser.type === "admin") {
    nameEl.innerText = "АДМИНИСТРАТОР";
    idEl.innerText = "";
    roleEl.innerText = "";
    extraEl.innerText = "";
    return;
  }

  const fullName = `${currentUser.ovog || ""} ${currentUser.ner || ""}`.trim();
  nameEl.innerText = fullName;
  idEl.innerText = `ID# ${currentUser.code || ""}`;
  roleEl.innerText = currentUser.role || "";

  const place = currentUser.place || "";
  const dept = currentUser.department || "";
  const shift = currentUser.shift || "";
  const parts = [];
  if (place) parts.push(`Газар: ${place}`);
  if (dept) parts.push(`Хэлтэс: ${dept}`);
  if (shift) parts.push(`Ээлж: ${shift}`);
  extraEl.innerText = parts.join(" • ");
}

// -------------------------
// Login
// -------------------------
window.handleLogin = async () => {
  const code = document.getElementById("login-user")?.value?.trim() || "";
  const pass = document.getElementById("login-pass")?.value?.trim() || "";
  if (!code || !pass) return alert("Код, нууц үгээ оруулна уу!");

  showLoading(true);
  try {
    const result = await apiPost({ action: "login", code, pass });
    if (result.success) {
      currentUser = result.user;
      localStorage.setItem("ett_user", JSON.stringify(currentUser));
      initApp();
    } else {
      alert(result.msg || "Код эсвэл нууц үг буруу байна");
    }
  } catch (e) {
    console.error(e);
    alert(String(e.message || e));
  } finally {
    showLoading(false);
  }
};

function initApp() {
  document.getElementById("login-page")?.classList.add("hidden");
  document.getElementById("main-page")?.classList.remove("hidden");

  updateHeaderSubtitle();
  updateSidebarUserCard();

  const isAdmin = currentUser?.type === "admin";
  document.getElementById("nav-request")?.classList.toggle("hidden", isAdmin);
  document.getElementById("nav-items")?.classList.toggle("hidden", !isAdmin);

  window.refreshData();
  setTimeout(setVH, 0);
}

// -------------------------
// Data refresh
// -------------------------
window.refreshData = async () => {
  showLoading(true);
  try {
    const data = await apiPost({ action: "get_all_data" });

    if (data.success === false) {
      alert(data.msg || "Дата татахад алдаа");
      return;
    }

    allOrders = data.orders || [];
    allItems = data.items || [];

    populateOrderItemFilter();
    populateRequestItemSelect();

    window.updateSizeOptions?.();
    setupOrderFilters?.();
    setupEmployeeFilters?.();
    setupItemsNameFilter?.();

    window.applyFilters?.();

    const cnt = document.getElementById("items-count");
    if (cnt) cnt.innerText = `${allItems.length} бараа`;

    if (!document.getElementById("tab-items")?.classList.contains("hidden")) {
      window.renderItemsList();
    }
    setTimeout(setVH, 0);
  } catch (e) {
    console.error(e);
    alert("Өгөгдөл татахад алдаа гарлаа.\n\n" + String(e.message || e));
  } finally {
    showLoading(false);
  }
};

// -------------------------
// Populate selects
// -------------------------
function populateOrderItemFilter() {
  const filterItem = document.getElementById("filter-item");
  if (!filterItem) return;
  let html = `<option value="">Бүх бараа</option>`;
  allItems.forEach((it) => (html += `<option value="${esc(it.name)}">${esc(it.name)}</option>`));
  filterItem.innerHTML = html;
}

function populateRequestItemSelect() {
  const reqItem = document.getElementById("req-item");
  if (!reqItem) return;
  let html = `<option value="">Сонгох...</option>`;
  allItems.forEach((it) => (html += `<option value="${esc(it.name)}">${esc(it.name)}</option>`));
  reqItem.innerHTML = html;
}

// -------------------------
// The rest of functions depend on your existing HTML IDs.
// If you already had these in your old app.js, KEEP THEM.
// -------------------------

window.logout = () => {
  localStorage.clear();
  location.reload();
};

// -------------------------
// Bootstrap
// -------------------------
window.onload = () => {
  setVH();
  currentUser = safeJsonParse(localStorage.getItem("ett_user"));
  if (currentUser) initApp();
  else document.getElementById("login-page")?.classList.remove("hidden");
};
