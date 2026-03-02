// ===============================
// ETT PPE System - app.js
// FIX: Filters work by LABEL (no ID dependency) + keep previous UI fixes
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

/* ---------------- CSS inject: Orders Grid (9 columns with ЭЭЛЖ) ---------------- */
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

    /* Admin: 9 columns */
    body.admin-mode .orders-header,
    body.admin-mode .order-row {
      grid-template-columns: 2.1fr 2.6fr 1.6fr 1fr 2.2fr 1fr 1.2fr 1.2fr 1.7fr !important;
    }

    /* Employee: show only Ажилтан | Ээлж | Бараа | Тоо | Огноо | Төлөв (6 columns) */
    body.employee-mode .orders-header,
    body.employee-mode .order-row {
      grid-template-columns: 2.2fr 1fr 2.6fr 1.1fr 1.3fr 1.2fr !important;
    }

    .orders-header > *, .order-row > * { min-width: 0 !important; }
    body.employee-mode .col-place,
    body.employee-mode .col-role,
    body.employee-mode .col-actions { display:none !important; }

    .orders-header > * { white-space: nowrap !important; }

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

/* ---------------- Header normalize (including ЭЭЛЖ) ---------------- */
function normalizeOrdersHeader_() {
  const tab = document.getElementById("tab-orders");
  if (!tab) return;

  const candidates = Array.from(tab.querySelectorAll("*")).filter((el) => {
    const t = (el.textContent || "").trim().toUpperCase();
    return t === "АЖИЛТАН";
  });
  if (!candidates.length) return;

  const headerCell = candidates[0];
  const row = headerCell.parentElement;
  if (!row) return;

  row.classList.add("orders-header");

  const children = Array.from(row.children);
  children.forEach((c) => {
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

/* =======================================================================
   ✅ FILTER ENGINE (Label-based, no ID dependency)
   ======================================================================= */

function getOrdersTab_() {
  return document.getElementById("tab-orders");
}

function getLabelForControl_(control) {
  // Heuristic: find nearest previous sibling that contains label-like text
  let el = control;
  for (let step = 0; step < 8; step++) {
    if (!el) break;
    const prev = el.previousElementSibling;
    if (prev) {
      const t = (prev.textContent || "").trim();
      if (t && t.length <= 30) return t;
    }
    el = el.parentElement;
    if (!el) break;
    const t2 = (el.textContent || "").trim();
    // not reliable, skip
  }
  return "";
}

function collectFilterControls_() {
  const tab = getOrdersTab_();
  if (!tab) return {};

  const controls = Array.from(tab.querySelectorAll("select, input")).filter((el) => {
    // exclude login fields if they exist in DOM (but usually not inside tab-orders)
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

    // Some UIs use placeholder rather than label for text fields
    if (!label && placeholder) label = placeholder.toUpperCase();

    // store by label keywords (we keep best match later)
    map[`${label}__${tag}`] = c;
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
  // treat "Бүгд" as empty
  if (v === "Бүгд" || v === "БҮГД") return "";
  return v;
}

function getFilters_() {
  const m = collectFilterControls_();

  const statusEl = findControlByKeyword_(m, ["ТӨЛӨВ"]);
  const itemEl = findControlByKeyword_(m, ["БАРАА"]);
  const yearEl = findControlByKeyword_(m, ["ОН"]);
  const monthEl = findControlByKeyword_(m, ["САР"]);
  const placeEl = findControlByKeyword_(m, ["ГАЗАР"]);
  const deptEl = findControlByKeyword_(m, ["ХЭЛТЭС"]);
  const shiftEl = findControlByKeyword_(m, ["ЭЭЛЖ"]);
  const nameEl = findControlByKeyword_(m, ["НЭР"]);
  const codeEl = findControlByKeyword_(m, ["КОД"]);
  const roleEl = findControlByKeyword_(m, ["АЛБАН"]);

  return {
    status: readControlValue_(statusEl),
    item: readControlValue_(itemEl),
    year: readControlValue_(yearEl),
    month: readControlValue_(monthEl),
    place: readControlValue_(placeEl),
    dept: readControlValue_(deptEl),
    shift: readControlValue_(shiftEl),
    name: readControlValue_(nameEl),
    code: readControlValue_(codeEl),
    role: readControlValue_(roleEl),
  };
}

function setSelectOptions_(sel, values, allLabel = "Бүгд") {
  if (!sel) return;
  const uniqVals = uniq(values).filter(Boolean);
  const opts = [];
  opts.push(`<option value="">${esc(allLabel)}</option>`);
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

  if (statusEl && statusEl.tagName === "SELECT") {
    setSelectOptions_(statusEl, ["Хүлээгдэж буй", "Зөвшөөрсөн", "Татгалзсан"], "Бүгд");
  }
  if (itemEl && itemEl.tagName === "SELECT") {
    setSelectOptions_(itemEl, allItems.map((x) => x.name), "Бүгд");
  }
  if (yearEl && yearEl.tagName === "SELECT") {
    const years = allOrders
      .map((o) => {
        const d = new Date(o.requestedDate);
        return isNaN(d) ? "" : String(d.getFullYear());
      })
      .filter(Boolean);
    setSelectOptions_(yearEl, years.sort((a, b) => b.localeCompare(a)), "Бүгд");
  }
  if (monthEl && monthEl.tagName === "SELECT") {
    const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
    setSelectOptions_(monthEl, months, "Бүгд");
  }
  if (placeEl && placeEl.tagName === "SELECT") {
    setSelectOptions_(placeEl, allOrders.map((o) => o.place), "Бүгд");
  }
  if (deptEl && deptEl.tagName === "SELECT") {
    setSelectOptions_(deptEl, allOrders.map((o) => o.department), "Бүгд");
  }
  if (shiftEl && shiftEl.tagName === "SELECT") {
    setSelectOptions_(shiftEl, uniq(SHIFT_OPTIONS.concat(allOrders.map((o) => o.shift))), "Бүгд");
  }
}

function bindFilterEvents_() {
  const tab = getOrdersTab_();
  if (!tab) return;

  // Remove double binding by using once flag
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

/* ---------------- Refresh ---------------- */
window.refreshData = async () => {
  if (!currentUser) return;
  showLoading(true, "Өгөгдөл татаж байна...");
  try {
    const r = await apiPost({ action: "get_all_data" });
    if (!r.success) throw new Error(r.msg || "Өгөгдөл татахад алдаа гарлаа.");

    allOrders = r.orders || [];
    allItems = r.items || [];

    // ✅ filters: populate + bind + apply
    populateFilters_();
    bindFilterEvents_();

    applyFilters();
  } catch (e) {
    popupError("Өгөгдөл татахад алдаа гарлаа.", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

/* ---------------- Init & Login ---------------- */
function initApp() {
  injectOrdersGridCSS_();
  // filters bind may run after login, but safe
  bindFilterEvents_();

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

    setRoleMode_();
    await refreshData();
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};
