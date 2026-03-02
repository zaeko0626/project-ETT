// ===============================
// ETT PPE System - app.js
// FIX: main menu visible + filters by label + orders grid + "ЭЭЛЖ" + formatting
// ===============================

const API_URL =
  "https://script.google.com/macros/s/AKfycbzrFXNS4aOBTKeSjxEpkKAshZDDriNcKt39e4qnHg-saVaDjmnIXsilfMxUn2PPUVEr/exec";

let allOrders = [];
let allItems = [];
let currentUser = null;

const SHIFT_OPTIONS = ["А", "Б", "Өдөр", "Шөнө"];

/* ---------------- Mobile VH ---------------- */
function setVH() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty("--vh", `${vh}px`);
}
window.addEventListener("resize", setVH);
window.addEventListener("orientationchange", () => setTimeout(setVH, 150));
setVH();

/* ---------------- HTML escape ---------------- */
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ---------------- Loading overlay ---------------- */
function showLoading(show, subText = "") {
  const el = document.getElementById("loading-overlay");
  if (!el) return;
  const sub = document.getElementById("loading-sub");
  if (sub) sub.textContent = subText || "";
  el.classList.toggle("hidden", !show);
}

/* ---------------- Modal ---------------- */
window.openModal = (title, html) => {
  const ov = document.getElementById("modal-overlay");
  const t = document.getElementById("modal-title");
  const b = document.getElementById("modal-body");
  if (!ov || !t || !b) {
    alert(`${title}\n\n${String(html || "").replace(/<[^>]*>/g, "")}`);
    return;
  }
  t.textContent = title || "";
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
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON: " + text);
  }
  return json;
}

/* ---------------- Helpers ---------------- */
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
function statusMeta(raw) {
  const s = String(raw || "").trim();
  if (s === "Зөвшөөрсөн") return { label: "ОЛГОСОН", cls: "st-approved" };
  if (s === "Татгалзсан") return { label: "ТАТГАЛЗСАН", cls: "st-rejected" };
  return { label: "ХҮЛЭЭГДЭЖ БУЙ", cls: "st-pending" };
}
function isAdmin() {
  return currentUser?.type === "admin";
}

/* =========================================================
   ✅ MAIN MENU / SIDEBAR VISIBILITY (restored)
   ========================================================= */
function setAuthUIVisible(isLoggedInNow) {
  const header = document.getElementById("app-header");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");

  if (header) header.classList.toggle("hidden", !isLoggedInNow);
  if (sidebar) sidebar.classList.toggle("hidden", !isLoggedInNow);
  if (overlay) overlay.classList.toggle("hidden", !isLoggedInNow);

  if (!isLoggedInNow) {
    sidebar?.classList.remove("open");
    overlay?.classList.remove("show");
  }
}

window.openSidebar = () => {
  const sb = document.getElementById("sidebar");
  const ov = document.getElementById("sidebar-overlay");
  sb?.classList.remove("hidden");
  ov?.classList.remove("hidden");
  sb?.classList.add("open");
  ov?.classList.add("show");
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
  document.querySelectorAll(".tab-content").forEach((el) => el.classList.add("hidden"));
  document.getElementById(`tab-${tabName}`)?.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");

  if (window.innerWidth < 1024) window.closeSidebar();

  if (tabName === "orders") applyFilters();
};

/* =========================================================
   ✅ Orders Grid + Employee hide columns + "ЭЭЛЖ"
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

    /* Admin: 9 columns
       Ажилтан | Газар/Хэлтэс | Албан тушаал | Ээлж | Бараа | Тоо | Огноо | Төлөв | Үйлдэл */
    body.admin-mode .orders-header,
    body.admin-mode .order-row {
      grid-template-columns: 2.1fr 2.6fr 1.6fr 1fr 2.2fr 1fr 1.2fr 1.2fr 1.7fr !important;
    }

    /* Employee: show only Ажилтан | Ээлж | Бараа | Тоо | Огноо | Төлөв  */
    body.employee-mode .orders-header,
    body.employee-mode .order-row {
      grid-template-columns: 2.2fr 1fr 2.6fr 1.1fr 1.3fr 1.2fr !important;
    }

    .orders-header > *, .order-row > * { min-width: 0 !important; }
    .orders-header > * { white-space: nowrap !important; }

    /* Employee: hide place/dept, role, actions */
    body.employee-mode .col-place,
    body.employee-mode .col-role,
    body.employee-mode .col-actions { display:none !important; }

    .place-wrap .place-main { font-weight: 600; }
    .place-wrap .place-sub { opacity: .75; font-size: 12px; margin-top: 2px; }
  `;
  document.head.appendChild(st);
}

function setRoleMode_() {
  injectOrdersGridCSS_();
  document.body.classList.toggle("admin-mode", isAdmin());
  document.body.classList.toggle("employee-mode", !isAdmin());
}

function normalizeOrdersHeader_() {
  const tab = document.getElementById("tab-orders");
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
      "col-emp",
      "col-place",
      "col-role",
      "col-shift",
      "col-item",
      "col-qty",
      "col-date",
      "col-status",
      "col-actions"
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
   ✅ FILTER ENGINE (Label-based) 100% working
   ========================================================= */
function getOrdersTab_() {
  return document.getElementById("tab-orders");
}

function getLabelForControl_(control) {
  // nearest label-like text (usually previous sibling / parent)
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

  const controls = Array.from(tab.querySelectorAll("select, input")).filter((el) => {
    const id = (el.id || "").toLowerCase();
    if (id.includes("login")) return false;
    return true;
  });

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

function setSelectOptions_(sel, values, allLabel = "Бүгд") {
  if (!sel) return;
  const uniqVals = uniq(values).filter(Boolean);
  const opts = [`<option value="">${esc(allLabel)}</option>`];
  uniqVals.forEach((v) => opts.push(`<option value="${esc(v)}">${esc(v)}</option>`));
  sel.innerHTML = opts.join("");
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

  if (statusEl?.tagName === "SELECT")
    setSelectOptions_(statusEl, ["Хүлээгдэж буй", "Зөвшөөрсөн", "Татгалзсан"], "Бүгд");

  if (itemEl?.tagName === "SELECT") setSelectOptions_(itemEl, allItems.map((x) => x.name), "Бүгд");

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

  if (placeEl?.tagName === "SELECT") setSelectOptions_(placeEl, allOrders.map((o) => o.place), "Бүгд");
  if (deptEl?.tagName === "SELECT") setSelectOptions_(deptEl, allOrders.map((o) => o.department), "Бүгд");

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
      okName &&
      okCode &&
      okRole &&
      okItem &&
      okStatus &&
      okYear &&
      okMonth &&
      okPlace &&
      okDept &&
      okShift
    );
  });

  renderOrders(filtered);
};

/* ---------------- Orders render (ЭЭЛЖ + Dept under Place + labels) ---------------- */
function renderOrders(listData) {
  const list = document.getElementById("orders-list");
  if (!list) return;

  setRoleMode_();
  normalizeOrdersHeader_();

  let rows = listData || [];

  if (!isAdmin()) {
    const myCode = String(currentUser?.code || "").trim();
    rows = rows.filter((o) => String(o.code || "").trim() === myCode);
  }

  if (!rows.length) {
    list.innerHTML = `<div class="empty">Мэдээлэл олдсонгүй</div>`;
    return;
  }

  const sorted = rows.slice().sort((a, b) => new Date(b.requestedDate) - new Date(a.requestedDate));

  list.innerHTML = sorted
    .map((o) => {
      const st = statusMeta(o.status);

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

      let actions = `—`;
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
    })
    .join("");
}

/* ---------------- Decide order ---------------- */
window.decideOrder = async (id, status) => {
  if (!id || !status) return;

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

/* ---------------- Refresh ---------------- */
window.refreshData = async () => {
  if (!currentUser) return;
  showLoading(true, "Өгөгдөл татаж байна...");
  try {
    const r = await apiPost({ action: "get_all_data" });
    if (!r.success) throw new Error(r.msg || "Өгөгдөл татахад алдаа гарлаа.");

    allOrders = r.orders || [];
    allItems = r.items || [];

    populateFilters_();
    bindFilterEvents_();
    applyFilters();
  } catch (e) {
    popupError("Өгөгдөл татахад алдаа гарлаа.", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

/* ---------------- Init & Login/Logout ---------------- */
function initApp() {
  injectOrdersGridCSS_();
  setAuthUIVisible(false);

  document.getElementById("main-screen")?.classList.add("hidden");
  document.getElementById("login-screen")?.classList.remove("hidden");

  const pass = document.getElementById("login-pass");
  pass?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") window.login();
  });
}
window.onload = function () {
  initApp();
};

window.login = async () => {
  const code = document.getElementById("login-code")?.value?.trim() || "";
  const pass = document.getElementById("login-pass")?.value?.trim() || "";
  if (!code || !pass) return popupError("Алдаа", "Код, нууц үг оруулна уу");

  showLoading(true, "Нэвтэрч байна...");
  try {
    const r = await apiPost({ action: "login", code, pass });
    if (!r.success) return popupError("Алдаа", r.msg || "Нэвтрэх амжилтгүй");

    currentUser = r.user;

    document.getElementById("login-screen")?.classList.add("hidden");
    document.getElementById("main-screen")?.classList.remove("hidden");
    setAuthUIVisible(true);

    setRoleMode_();
    await refreshData();

    // default tab: admin -> orders, employee -> request (if exists), else orders
    const admin = isAdmin();
    const navOrders = document.getElementById("nav-orders");
    const navRequest = document.getElementById("nav-request");

    if (admin && navOrders) showTab("orders", navOrders);
    else if (!admin && navRequest) showTab("request", navRequest);
    else showTab("orders", navOrders);
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
  setAuthUIVisible(false);

  document.getElementById("main-screen")?.classList.add("hidden");
  document.getElementById("login-screen")?.classList.remove("hidden");

  document.getElementById("login-code") && (document.getElementById("login-code").value = "");
  document.getElementById("login-pass") && (document.getElementById("login-pass").value = "");

  window.closeSidebar();
};
