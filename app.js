// ===============================
// ETT PPE System - app.js
// Restore header/sidebar/menu + Fix Orders list layout + Filters + "ЭЭЛЖ" + formatting
// ===============================

const API_URL =
  "https://script.google.com/macros/s/AKfycbzrFXNS4aOBTKeSjxEpkKAshZDDriNcKt39e4qnHg-saVaDjmnIXsilfMxUn2PPUVEr/exec";

let allOrders = [];
let allItems = [];
let allUsers = [];
let currentUser = null;

const SHIFT_OPTIONS = ["А", "Б", "Өдөр", "Шөнө"];

/* ---------------- Safe helpers ---------------- */
function $(id) { return document.getElementById(id); }

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function uniq(arr) {
  return Array.from(new Set((arr || []).filter((x) => x != null && x !== "")));
}

function fmtDateOnly(v) {
  const d = new Date(v);
  if (isNaN(d)) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isAdmin() {
  return currentUser?.type === "admin";
}

/* ---------------- Loading overlay ---------------- */
function showLoading(show, subText = "") {
  const el = $("loading-overlay");
  if (!el) return;
  const sub = $("loading-sub");
  if (sub) sub.textContent = subText || "";
  el.classList.toggle("hidden", !show);
}

/* ---------------- Modal ---------------- */
window.openModal = (title, html) => {
  const ov = $("modal-overlay");
  const t = $("modal-title");
  const b = $("modal-body");
  if (!ov || !t || !b) {
    alert(`${title}\n\n${String(html || "").replace(/<[^>]*>/g, "")}`);
    return;
  }
  t.textContent = title || "";
  b.innerHTML = html || "";
  ov.classList.remove("hidden");
};

window.closeModal = () => {
  const ov = $("modal-overlay");
  const b = $("modal-body");
  if (ov) ov.classList.add("hidden");
  if (b) b.innerHTML = "";
};

function popupError(title, msg) {
  window.openModal(
    title || "Алдаа",
    `
      <div class="modal-msg">${esc(msg || "")}</div>
      <div class="modal-actions">
        <button class="btn" onclick="closeModal()">OK</button>
      </div>
    `
  );
}

function popupOk(title, msg) {
  window.openModal(
    title || "Амжилттай",
    `
      <div class="modal-msg">${esc(msg || "")}</div>
      <div class="modal-actions">
        <button class="btn" onclick="closeModal()">OK</button>
      </div>
    `
  );
}

/* ---------------- API ---------------- */
async function apiPost(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload || {}),
    cache: "no-store",
    redirect: "follow",
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch { throw new Error("Invalid JSON: " + text); }
  return json;
}

/* =========================================================
   ✅ HARD RESTORE HEADER / SIDEBAR (no ID dependency)
   ========================================================= */
function unhideByText_(texts) {
  const hiddenNodes = Array.from(document.querySelectorAll(".hidden"));
  hiddenNodes.forEach((el) => {
    const t = (el.textContent || "").trim();
    if (!t) return;
    const ok = texts.some((k) => t.includes(k));
    if (ok) el.classList.remove("hidden");
  });
}

function revealMainChrome_() {
  // Nothing here.
  // Chrome (header/sidebar) will only be shown after login.
}
  // Try common IDs first
  ["app-header", "header", "topbar", "sidebar", "sidebar-overlay"].forEach((id) => {
    const el = $(id);
    if (el) el.classList.remove("hidden");
  });

  // Fallback: unhide blocks that contain these texts (your index shows these exist)
  unhideByText_(["ETT PPE SYSTEM", "СЭРГЭЭХ", "Хүсэлтийн жагсаалт", "ГАРАХ"]);
}

function setAuthScreens_(loggedIn) {
  const login = $("login-screen");
  const main = $("main-screen");

  if (login) login.classList.toggle("hidden", loggedIn);
  if (main) main.classList.toggle("hidden", !loggedIn);

  if (loggedIn) revealMainChrome_();
}

/* ---------------- Sidebar actions (if your HTML uses these IDs/classes) ---------------- */
window.openSidebar = () => {
  const sb = $("sidebar") || document.querySelector(".sidebar");
  const ov = $("sidebar-overlay") || document.querySelector(".sidebar-overlay");
  sb?.classList.remove("hidden");
  ov?.classList.remove("hidden");
  sb?.classList.add("open");
  ov?.classList.add("show");
};

window.closeSidebar = () => {
  const sb = $("sidebar") || document.querySelector(".sidebar");
  const ov = $("sidebar-overlay") || document.querySelector(".sidebar-overlay");
  sb?.classList.remove("open");
  ov?.classList.remove("show");
};

window.toggleSidebar = () => {
  const sb = $("sidebar") || document.querySelector(".sidebar");
  if (!sb) return;
  sb.classList.contains("open") ? window.closeSidebar() : window.openSidebar();
};

/* ---------------- Tabs ---------------- */
window.showTab = (tabName, btn) => {
  document.querySelectorAll(".tab-content").forEach((el) => el.classList.add("hidden"));
  $(`tab-${tabName}`)?.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");

  if (window.innerWidth < 1024) window.closeSidebar();

  if (tabName === "orders") applyFilters();
  if (tabName === "items") renderItemsTable_();
  if (tabName === "employees") renderUsersTable_();
};

/* =========================================================
   ✅ Orders grid (Admin 9 col, Employee 6 col) + hide columns for employee
   ========================================================= */
function injectOrdersGridCSS_() {
  if (document.getElementById("orders-grid-fix-style")) return;

  const st = document.createElement("style");
  st.id = "orders-grid-fix-style";
  st.textContent = `
    .orders-header, .order-row {
      display: grid !important;
      width: 100% !important;
      column-gap: 18px !important;
      align-items: start !important;
    }

    body.admin-mode .orders-header,
    body.admin-mode .order-row {
      grid-template-columns: 2.1fr 2.6fr 1.6fr 1fr 2.2fr 1fr 1.2fr 1.2fr 1.7fr !important;
    }

    body.employee-mode .orders-header,
    body.employee-mode .order-row {
      grid-template-columns: 2.2fr 1fr 2.6fr 1.1fr 1.3fr 1.2fr !important;
    }

    .orders-header > *, .order-row > * { min-width: 0 !important; }
    .orders-header > * { white-space: nowrap !important; }

    body.employee-mode .col-place,
    body.employee-mode .col-role,
    body.employee-mode .col-actions { display:none !important; }

    .place-wrap .place-main { font-weight: 600; }
    .place-wrap .place-sub { opacity: .75; font-size: 12px; margin-top: 2px; }
  `;
  document.head.appendChild(st);
}

function applyRoleMode_() {
  injectOrdersGridCSS_();
  document.body.classList.toggle("admin-mode", isAdmin());
  document.body.classList.toggle("employee-mode", !isAdmin());
}

/* ---------------- Header normalize by text ---------------- */
function normalizeOrdersHeader_() {
  const tab = $("tab-orders");
  if (!tab) return;

  const candidates = Array.from(tab.querySelectorAll("*")).filter((el) => {
    const t = (el.textContent || "").trim().toUpperCase();
    return t === "АЖИЛТАН";
  });
  if (!candidates.length) return;

  const row = candidates[0].parentElement;
  if (!row) return;

  row.classList.add("orders-header");

  Array.from(row.children).forEach((c) => {
    c.classList.remove(
      "col-emp","col-place","col-role","col-shift","col-item",
      "col-qty","col-date","col-status","col-actions"
    );

    const t = (c.textContent || "").trim().toUpperCase();
    if (t.includes("АЖИЛТАН")) c.classList.add("col-emp");
    else if (t.includes("ГАЗАР") || t.includes("ХЭЛТЭС")) c.classList.add("col-place");
    else if (t.includes("АЛБАН")) c.classList.add("col-role");
    else if (t.includes("ЭЭЛЖ")) c.classList.add("col-shift");
    else if (t === "БАРАА") c.classList.add("col-item");
    else if (t.includes("ТОО")) c.classList.add("col-qty");
    else if (t.includes("ОГНОО")) c.classList.add("col-date");
    else if (t.includes("ТӨЛӨВ")) c.classList.add("col-status");
    else if (t.includes("ҮЙЛДЭЛ")) c.classList.add("col-actions");
  });
}

/* =========================================================
   ✅ Filters (Label-based) - no ID mismatch issue
   ========================================================= */
function getOrdersTab_() { return $("tab-orders"); }

function getLabelForControl_(control) {
  let el = control;
  for (let step = 0; step < 10; step++) {
    if (!el) break;
    const prev = el.previousElementSibling;
    if (prev) {
      const t = (prev.textContent || "").trim();
      if (t && t.length <= 40) return t;
    }
    el = el.parentElement;
  }
  return "";
}

function collectFilterControls_() {
  const tab = getOrdersTab_();
  if (!tab) return {};

  const controls = Array.from(tab.querySelectorAll("select, input"));
  const map = {};
  for (const c of controls) {
    const tag = c.tagName;
    const type = (c.getAttribute("type") || "").toLowerCase();
    if (tag === "INPUT" && type && !["text", "search", ""].includes(type)) continue;

    const placeholder = (c.getAttribute("placeholder") || "").trim();
    let label = getLabelForControl_(c).toUpperCase().trim();
    if (!label && placeholder) label = placeholder.toUpperCase();
    map[label + "__" + tag] = c;
  }
  return map;
}

function findControlByKeyword_(controlsMap, keywords) {
  const keys = Object.keys(controlsMap);
  for (const k of keys) {
    const upper = k.toUpperCase();
    if (keywords.some((kw) => upper.includes(kw))) return controlsMap[k];
  }
  return null;
}

function readControlValue_(el) {
  if (!el) return "";
  const v = (el.value ?? "").toString().trim();
  if (v.toUpperCase() === "БҮГД") return "";
  return v;
}

function setSelectOptions_(sel, values, allLabel = "Бүгд") {
  if (!sel) return;
  const uniqVals = uniq(values).filter(Boolean);
  sel.innerHTML =
    [`<option value="">${esc(allLabel)}</option>`]
      .concat(uniqVals.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`))
      .join("");
}

function populateFilters_() {
  const m = collectFilterControls_();

  const statusEl = findControlByKeyword_(m, ["ТӨЛӨВ"]);
  const itemEl = findControlByKeyword_(m, ["БАРАА"]);
  const yearEl = findControlByKeyword_(m, ["ОН"]);
  const monthEl = findControlByKeyword_(m, ["САР"]);
  const placeEl = findControlByKeyword_(m, ["ГАЗАР"]);
  const deptEl = findControlByKeyword_(m, ["ХЭЛТЭС"]);
  const shiftEl = findControlByKeyword_(m, ["ЭЭЛЖ"]);

  if (statusEl?.tagName === "SELECT") {
    setSelectOptions_(statusEl, ["Хүлээгдэж буй", "Зөвшөөрсөн", "Татгалзсан"], "Бүгд");
  }
  if (itemEl?.tagName === "SELECT") {
    setSelectOptions_(itemEl, allItems.map((x) => x.name), "Бүгд");
  }
  if (yearEl?.tagName === "SELECT") {
    const years = allOrders
      .map((o) => {
        const d = new Date(o.requestedDate);
        return isNaN(d) ? "" : String(d.getFullYear());
      })
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a));
    setSelectOptions_(yearEl, years, "Бүгд");
  }
  if (monthEl?.tagName === "SELECT") {
    const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
    setSelectOptions_(monthEl, months, "Бүгд");
  }
  if (placeEl?.tagName === "SELECT") {
    setSelectOptions_(placeEl, allOrders.map((o) => o.place), "Бүгд");
  }
  if (deptEl?.tagName === "SELECT") {
    setSelectOptions_(deptEl, allOrders.map((o) => o.department), "Бүгд");
  }
  if (shiftEl?.tagName === "SELECT") {
    setSelectOptions_(shiftEl, uniq(SHIFT_OPTIONS.concat(allOrders.map((o) => o.shift))), "Бүгд");
  }
}

function bindFilterEvents_() {
  const tab = getOrdersTab_();
  if (!tab) return;
  if (tab.dataset.filtersBound === "1") return;
  tab.dataset.filtersBound = "1";

  tab.querySelectorAll("select").forEach((s) => s.addEventListener("change", () => applyFilters()));
  tab.querySelectorAll("input").forEach((i) => i.addEventListener("input", () => applyFilters()));
}

function getFilters_() {
  const m = collectFilterControls_();
  return {
    status: readControlValue_(findControlByKeyword_(m, ["ТӨЛӨВ"])),
    item: readControlValue_(findControlByKeyword_(m, ["БАРАА"])),
    year: readControlValue_(findControlByKeyword_(m, ["ОН"])),
    month: readControlValue_(findControlByKeyword_(m, ["САР"])),
    place: readControlValue_(findControlByKeyword_(m, ["ГАЗАР"])),
    dept: readControlValue_(findControlByKeyword_(m, ["ХЭЛТЭС"])),
    shift: readControlValue_(findControlByKeyword_(m, ["ЭЭЛЖ"])),
    name: readControlValue_(findControlByKeyword_(m, ["НЭР"])),
    code: readControlValue_(findControlByKeyword_(m, ["КОД"])),
    role: readControlValue_(findControlByKeyword_(m, ["АЛБАН"])),
  };
}

window.applyFilters = () => {
  const f = getFilters_();

  const filtered = (allOrders || []).filter((o) => {
    const d = new Date(o.requestedDate);
    const fullName = `${o.ovog || ""} ${o.ner || ""}`.toLowerCase();

    const okName = !f.name || fullName.includes(f.name.toLowerCase());
    const okCode = !f.code || String(o.code || "").includes(f.code);
    const okRole = !f.role || String(o.role || "").toLowerCase().includes(f.role.toLowerCase());

    const okItem = !f.item || String(o.item || "") === f.item;
    const okStatus = !f.status || String(o.status || "") === f.status;

    const okYear = !f.year || (!isNaN(d) && String(d.getFullYear()) === f.year);
    const okMonth =
      !f.month || (!isNaN(d) && String(d.getMonth() + 1).padStart(2, "0") === f.month);

    const okPlace = !f.place || String(o.place || "") === f.place;
    const okDept = !f.dept || String(o.department || "") === f.dept;
    const okShift = !f.shift || String(o.shift || "") === f.shift;

    return (
      okName && okCode && okRole &&
      okItem && okStatus &&
      okYear && okMonth &&
      okPlace && okDept && okShift
    );
  });

  renderOrders_(filtered);
};

/* =========================================================
   ✅ Orders render (ЭЭЛЖ + Dept under Place + "Размер:" + "ширхэг" + decision status)
   ========================================================= */
function statusMeta_(raw) {
  const s = String(raw || "").trim();
  if (s === "Зөвшөөрсөн") return { label: "ОЛГОСОН", cls: "st-approved" };
  if (s === "Татгалзсан") return { label: "ТАТГАЛЗСАН", cls: "st-rejected" };
  return { label: "ХҮЛЭЭГДЭЖ БУЙ", cls: "st-pending" };
}

function renderOrders_(rows) {
  const list = $("orders-list");
  if (!list) return;

  applyRoleMode_();
  normalizeOrdersHeader_();

  let data = rows || [];

  // employee: show only own orders
  if (!isAdmin()) {
    const myCode = String(currentUser?.code || "").trim();
    data = data.filter((o) => String(o.code || "").trim() === myCode);
  }

  if (!data.length) {
    list.innerHTML = `<div class="empty">Мэдээлэл олдсонгүй</div>`;
    return;
  }

  const sorted = data.slice().sort((a, b) => new Date(b.requestedDate) - new Date(a.requestedDate));

  list.innerHTML = sorted.map((o) => {
    const st = statusMeta_(o.status);

    const empName = `${esc(o.ovog || "")} ${esc(o.ner || "")}`.trim() || "—";
    const empId = esc(o.code || "—");

    const place = esc(o.place || "—");
    const dept = esc(o.department || "—");

    const role = esc(o.role || "—");
    const shift = esc(o.shift || "—");

    const item = esc(o.item || "—");
    const size = esc(o.size || "—");
    const sizeLine = `Размер: ${size}`;

    const qtyVal = o.quantity ?? o.qty ?? "—";
    const qty = `${esc(qtyVal)} ширхэг`;

    const date = esc(fmtDateOnly(o.requestedDate));

    const isPending = String(o.status || "") === "Хүлээгдэж буй";

    let actions = "—";
    if (isAdmin()) {
      actions = isPending
        ? `
          <button class="btn sm success" onclick="decideOrder('${esc(o.id)}','Зөвшөөрсөн')">ЗӨВШӨӨРӨХ</button>
          <button class="btn sm danger" onclick="decideOrder('${esc(o.id)}','Татгалзсан')">ТАТГАЛЗАХ</button>
        `
        : `<span class="tag">ШИЙДВЭРЛЭСЭН</span>`;
    }

    return `
      <div class="order-row">
        <div class="order-col col-emp">
          <div class="emp-name">${empName}</div>
          <div class="emp-id">ID:${empId}</div>
        </div>

        <div class="order-col col-place">
          <div class="place-wrap">
            <div class="place-main">${place}</div>
            <div class="place-sub">Хэлтэс: ${dept}</div>
          </div>
        </div>

        <div class="order-col col-role">${role}</div>
        <div class="order-col col-shift">${shift}</div>

        <div class="order-col col-item">
          <div class="item">${item}</div>
          <div class="subline">${esc(sizeLine)}</div>
        </div>

        <div class="order-col col-qty">${qty}</div>
        <div class="order-col col-date">${date}</div>

        <div class="order-col col-status">
          <span class="status ${st.cls}">${esc(st.label)}</span>
        </div>

        <div class="order-col col-actions">${actions}</div>
      </div>
    `;
  }).join("");
}

window.decideOrder = async (id, status) => {
  if (!id || !status) return;

  // Optimistic UI
  const idx = allOrders.findIndex((x) => String(x.id) === String(id));
  if (idx >= 0) allOrders[idx].status = status;
  applyFilters();

  try {
    const r = await apiPost({ action: "update_status", id, status });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    await refreshData();
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
    await refreshData();
  }
};

/* =========================================================
   Minimal stubs for other pages (so menu won't break)
   ========================================================= */
function renderItemsTable_() {
  // optional – keeps menu working even if items UI exists
}
function renderUsersTable_() {
  // optional – keeps menu working even if employees UI exists
}

/* ---------------- Refresh (Header button "СЭРГЭЭХ" uses this) ---------------- */
window.refreshData = async () => {
  if (!currentUser) return;
  showLoading(true, "Өгөгдөл татаж байна...");
  try {
    const r = await apiPost({ action: "get_all_data" });
    if (!r.success) throw new Error(r.msg || "Өгөгдөл татахад алдаа гарлаа.");

    allOrders = r.orders || [];
    allItems = r.items || [];

    // If admin has employees page it may need this
    if (isAdmin()) {
      const u = await apiPost({ action: "get_users" });
      if (u?.success) allUsers = u.users || [];
    }

    populateFilters_();
    bindFilterEvents_();
    applyFilters();
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// Hard reload (optional)
window.hardReload = () => location.reload();

/* ---------------- Login / Logout ---------------- */
window.login = async () => {
  const code = ($("login-code")?.value || "").trim();
  const pass = ($("login-pass")?.value || "").trim();
  if (!code || !pass) return popupError("Алдаа", "Код, нууц үг оруулна уу");

  showLoading(true, "Нэвтэрч байна...");
  try {
    const r = await apiPost({ action: "login", code, pass });
    if (!r.success) return popupError("Алдаа", r.msg || "Нэвтрэх амжилтгүй");

    currentUser = r.user;

    setAuthScreens_(true);
    applyRoleMode_();

    await refreshData();

    // Default tab
    const navOrdersBtn = $("nav-orders") || document.querySelector('[onclick*="showTab(\'orders\'"]');
    const navRequestBtn = $("nav-request") || document.querySelector('[onclick*="showTab(\'request\'"]');

    if (isAdmin()) window.showTab("orders", navOrdersBtn || null);
    else window.showTab("request", navRequestBtn || null);

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
  allUsers = [];

  setAuthScreens_(false);
  window.closeSidebar?.();

  if ($("login-code")) $("login-code").value = "";
  if ($("login-pass")) $("login-pass").value = "";
};

/* ---------------- Init ---------------- */
function initApp() {
  // Always keep chrome ready (some templates keep it hidden until login)
  injectOrdersGridCSS_();
  setAuthScreens_(false);
  revealMainChrome_(); // makes sure header/sidebar texts exist (won't hurt)

  const pass = $("login-pass");
  pass?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") window.login();
  });
}

window.addEventListener("load", initApp);
