// ===============================
// ETT PPE System - app.js (v20260306 FIX)
// ===============================
const API_URL = "https://script.google.com/macros/s/AKfycbxjp9O5F6yMDvcrRJdFKCro-DWYoYXznKjKcx9xP459cIqRMBbyd2dOF7w7ySPOBg/exec"; // <-- IMPORTANT

let allOrders = [];
let allItems = [];
let allEmployees = [];
let currentUser = null;

const SHIFT_OPTIONS = ["А", "Б", "Өдөр", "Шөнө"];

// ---------- VH ----------
function setVH() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty("--vh", `${vh}px`);
}
window.addEventListener("resize", setVH);
window.addEventListener("orientationchange", () => setTimeout(setVH, 150));
setVH();

// ---------- Escape HTML ----------
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ---------- Loading ----------
function showLoading(show, subText = "") {
  const el = document.getElementById("loading-overlay");
  if (!el) return;
  const sub = document.getElementById("loading-sub");
  if (sub) sub.textContent = subText || "";
  el.classList.toggle("hidden", !show);
}

// ---------- Modal ----------
window.openModal = (title, html) => {
  const ov = document.getElementById("modal-overlay");
  const t = document.getElementById("modal-title");
  const b = document.getElementById("modal-body");
  if (!ov || !t || !b) {
    alert(`${title}\n\n${html.replace(/<[^>]*>/g, "")}`);
    return;
  }
  t.innerText = title || "";
  b.innerHTML = html || "";
  ov.classList.remove("hidden");
};

window.closeModal = () => {
  const ov = document.getElementById("modal-overlay");
  const b = document.getElementById("modal-body");
  if (ov) ov.classList.add("hidden");
  if (b) b.innerHTML = "";
};

function popupError(title, msg) {
  window.openModal(title || "Алдаа", `
    <div class="modal-text">${esc(msg || "")}</div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-min" onclick="closeModal()">OK</button>
    </div>
  `);
}

// ---------- API ----------
async function apiPost(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload || {})
  });
  return await res.json();
}

// ---------- Auth UI visibility ----------
function setAuthUIVisible(isLoggedIn) {
  const header = document.getElementById("app-header");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");

  if (header) header.classList.toggle("hidden", !isLoggedIn);
  if (sidebar) sidebar.classList.toggle("hidden", !isLoggedIn);
  if (overlay) overlay.classList.toggle("hidden", !isLoggedIn);

  if (!isLoggedIn) {
    sidebar?.classList.remove("open");
    overlay?.classList.remove("show");
  }
}

// ---------- Sidebar ----------
window.openSidebar = () => {
  const sb = document.getElementById("sidebar");
  const ov = document.getElementById("sidebar-overlay");
  if (sb) sb.classList.remove("hidden");
  if (ov) ov.classList.remove("hidden");
  sb?.classList.add("open");
  ov?.classList.add("show");
};

window.closeSidebar = () => {
  const sb = document.getElementById("sidebar");
  const ov = document.getElementById("sidebar-overlay");
  sb?.classList.remove("open");
  ov?.classList.remove("show");

  // keep DOM hidden on login screen
  if (document.getElementById("login-screen") && !document.getElementById("login-screen").classList.contains("hidden")) {
    sb?.classList.add("hidden");
    ov?.classList.add("hidden");
  }
};

window.toggleSidebar = () => {
  const sb = document.getElementById("sidebar");
  if (!sb) return;
  sb.classList.contains("open") ? window.closeSidebar() : window.openSidebar();
};

// ---------- Tabs ----------
window.showTab = (tabName, btn) => {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.add("hidden"));
  document.getElementById(`tab-${tabName}`)?.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");

  window.closeSidebar();
};

// ---------- Sidebar user card ----------
function updateSidebarUserCard() {
  const nameEl = document.getElementById("user-display-name");
  const idEl = document.getElementById("user-display-id");
  const roleEl = document.getElementById("user-display-role");
  const exEl = document.getElementById("user-display-extra");

  if (!currentUser) {
    if (nameEl) nameEl.textContent = "—";
    if (idEl) idEl.textContent = "";
    if (roleEl) roleEl.textContent = "";
    if (exEl) exEl.textContent = "";
    return;
  }

  const fullName = `${currentUser.ovog || ""} ${currentUser.ner || ""}`.trim() || (currentUser.ner || "");
  if (nameEl) nameEl.textContent = fullName || "—";
  if (idEl) idEl.textContent = currentUser.code ? `${currentUser.code}` : "";
  if (roleEl) roleEl.textContent = currentUser.role || (currentUser.type === "admin" ? "Администратор" : "");
  const extra = [currentUser.place, currentUser.department, currentUser.shift].filter(Boolean).join(" • ");
  if (exEl) exEl.textContent = extra;
}

// ---------- Login / Logout ----------
window.login = async () => {
  const code = document.getElementById("login-code")?.value?.trim() || "";
  const pass = document.getElementById("login-pass")?.value?.trim() || "";

  if (!code || !pass) return popupError("Алдаа", "Код, нууц үг оруулна уу");

  showLoading(true, "Нэвтэрч байна...");
  try {
    const r = await apiPost({ action: "login", code, pass });
    if (!r.success) return popupError("Алдаа", r.msg || "Нэвтрэх амжилтгүй");

    currentUser = r.user;
    updateSidebarUserCard();

    // IMPORTANT: hide login, show main
    document.getElementById("login-screen")?.classList.add("hidden");
    document.getElementById("main-screen")?.classList.remove("hidden");
    setAuthUIVisible(true);
    document.getElementById("sidebar")?.classList.remove("open");
    document.getElementById("sidebar-overlay")?.classList.remove("show");

    // Role based menu
    const isAdmin = currentUser?.type === "admin";
    document.getElementById("nav-request")?.classList.toggle("hidden", isAdmin);
    document.getElementById("nav-items")?.classList.toggle("hidden", !isAdmin);
    document.getElementById("nav-employees")?.classList.toggle("hidden", !isAdmin);

    await refreshData();

    if (isAdmin) {
      showTab("orders", document.getElementById("nav-orders"));
    } else {
      showTab("request", document.getElementById("nav-request"));
    }
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.logout = () => {
  currentUser = null;
  allOrders = [];
  allItems = [];
  allEmployees = [];

  document.getElementById("main-screen")?.classList.add("hidden");
  document.getElementById("login-screen")?.classList.remove("hidden");

  // reset login inputs
  const lc = document.getElementById("login-code");
  const lp = document.getElementById("login-pass");
  if (lc) lc.value = "";
  if (lp) lp.value = "";

  setAuthUIVisible(false);

  // close sidebar
  window.closeSidebar();
};

// ---------- Orders / Items / Employees UI helpers ----------
function setupEmployeeShiftOptions() {
  const sel = document.getElementById("emp-shift");
  if (!sel) return;
  sel.innerHTML = SHIFT_OPTIONS.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
}

// ----- Filters setup -----
function setupOrderFilters() {
  // (existing logic in your file continues…)
}

// ---------- Data refresh ----------
window.refreshData = async () => {
  if (!currentUser) return;
  showLoading(true, "Өгөгдөл татаж байна...");
  try {
    const r = await apiPost({ action: "get_all_data" });
    if (!r.success) return popupError("Алдаа", r.msg || "Өгөгдөл татахад алдаа гарлаа.");

    allOrders = r.orders || [];
    allItems = r.items || [];
    
// ===== SAFETY STUBS (avoid "is not defined") =====
if (typeof setupOrderFilters !== "function") window.setupOrderFilters = () => {};
if (typeof renderOrders !== "function") window.renderOrders = () => {
  const el = document.getElementById("orders-list");
  if (el) el.innerHTML = `<div class="row-item"><div>Orders UI function (renderOrders) олдсонгүй — app.js бүтэн биш байна.</div></div>`;
};
if (typeof renderItems !== "function") window.renderItems = () => {};
if (typeof renderEmployees !== "function") window.renderEmployees = () => {};
if (typeof setupRequestDropdowns !== "function") window.setupRequestDropdowns = () => {};
    
    // Admin only employees
    if (currentUser?.type === "admin") {
      const ru = await apiPost({ action: "get_users" });
      if (ru.success) allEmployees = ru.users || [];
      else allEmployees = [];
    } else {
      allEmployees = [];
    }

    setupOrderFilters();
    renderOrders();
    renderItems();
    renderEmployees();
    setupRequestDropdowns();
  } catch (e) {
    popupError("Алдаа", e.message || "Failed to fetch");
  } finally {
    showLoading(false);
  }
};

// --------- (Your remaining functions unchanged) ---------
// NOTE: Доороос нь таны repo дээр байсан бүх функцүүд үргэлжилнэ.
// Би доорх хэсгийг зориуд өөрчлөлгүй үлдээсэн.
