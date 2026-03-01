// ===============================
// ETT PPE System - app.js (v20260305)
// ===============================

const API_URL = "https://script.google.com/macros/s/AKfycbw3NGQayHJsX6fDlhm8Arh-EVzOwQAowRJpokEMoArkhElY08xl-wre1mCuYvow01hF/exec";

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
    .replace(/'/g, "&#39;");
}

function showLoading(show) {
  const el = document.getElementById("loading-overlay");
  if (!el) return;
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
    <div class="card" style="margin:0;background:#fff">
      <div style="font-weight:900;color:#0f172a">${esc(msg || "")}</div>
    </div>
  `);
}

function fmtDateTime(v) {
  try {
    const d = new Date(v);
    if (isNaN(d)) return "";
    return d.toLocaleString();
  } catch {
    return "";
  }
}

// ---------- API (CORS-safe, preflightгүй) ----------
function safeJsonParse(str) { try { return JSON.parse(str); } catch { return null; } }

async function apiPost(payload) {
  const body = new URLSearchParams();
  Object.entries(payload || {}).forEach(([k, v]) => body.append(k, v == null ? "" : String(v)));

  let res;
  try {
    res = await fetch(API_URL, { method: "POST", body, redirect: "follow", cache: "no-store" });
  } catch (err) {
    throw new Error("Failed to fetch");
  }

  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 250)}`);

  const json = safeJsonParse(text);
  if (!json) throw new Error("JSON_PARSE_ERROR: " + text.slice(0, 200));
  return json;
}

// ---------- Sidebar ----------
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

// ---------- Tabs (давхардахгүй) ----------
window.showTab = (tabName, btn) => {
  document.querySelectorAll("[id^='tab-']").forEach(el => el.classList.add("hidden"));
  document.querySelectorAll(".tab-content").forEach(el => el.classList.add("hidden"));

  document.getElementById("tab-" + tabName)?.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");

  setTimeout(setVH, 0);
  if (window.innerWidth < 1024) window.closeSidebar();

  if (tabName === "orders") applyFilters();
  if (tabName === "items") renderItemsList();
  if (tabName === "employees") renderEmployeesList();
};

// ---------- User card ----------
function updateSidebarUserCard() {
  const nameEl = document.getElementById("sb-name");
  const idEl = document.getElementById("sb-id");
  const roleEl = document.getElementById("sb-role");
  const extraEl = document.getElementById("sb-extra");
  if (!nameEl || !idEl || !roleEl || !extraEl) return;
  if (!currentUser) return;

  if (currentUser.type === "admin") {
    nameEl.innerText = "АДМИНИСТРАТОР";
    idEl.innerText = "";
    roleEl.innerText = "";
    extraEl.innerText = "";
    return;
  }

  nameEl.innerText = `${currentUser.code || ""} • ${currentUser.ovog || ""} ${currentUser.ner || ""}`.trim();
  idEl.innerText = "";
  roleEl.innerText = currentUser.role || "";

  const parts = [];
  if (currentUser.place) parts.push(currentUser.place);
  if (currentUser.department) parts.push(currentUser.department);
  if (currentUser.shift) parts.push(currentUser.shift);
  extraEl.innerText = parts.join(" • ");
}

// ---------- Select helpers ----------
function setSelectOptions(el, labels, values, withAllLabel) {
  if (!el) return;
  const cur = el.value;

  let html = "";
  if (withAllLabel) html += `<option value="">${esc(withAllLabel)}</option>`;
  for (let i = 0; i < labels.length; i++) {
    const lab = labels[i];
    const val = values ? values[i] : labels[i];
    html += `<option value="${esc(val)}">${esc(lab)}</option>`;
  }
  el.innerHTML = html;

  if (cur && [...el.options].some(o => o.value === cur)) el.value = cur;
}

function uniq(arr) {
  return [...new Set(arr.filter(x => String(x ?? "").trim() !== ""))];
}

// ---------- Init shift selects ----------
function initShiftSelects() {
  const addSel = document.getElementById("emp-shift");
  if (addSel) setSelectOptions(addSel, ["Сонгох..."].concat(SHIFT_OPTIONS), ["", ...SHIFT_OPTIONS], null);

  const fSel = document.getElementById("emp-search-shift");
  if (fSel) setSelectOptions(fSel, SHIFT_OPTIONS, SHIFT_OPTIONS, "Бүгд");

  const ordShift = document.getElementById("filter-shift");
  if (ordShift) setSelectOptions(ordShift, uniq(allOrders.map(o => o.shift)).sort(), null, "Бүгд");
}

// ---------- Login / Logout ----------
window.handleLogin = async () => {
  const code = document.getElementById("login-user")?.value?.trim() || "";
  const pass = document.getElementById("login-pass")?.value?.trim() || "";
  if (!code || !pass) return popupError("Алдаа", "Код, нууц үгээ оруулна уу!");

  showLoading(true);
  try {
    const result = await apiPost({ action: "login", code, pass });
    if (!result.success) return popupError("Нэвтрэх боломжгүй", result.msg || "Код эсвэл нууц үг буруу");

    currentUser = result.user;
    localStorage.setItem("ett_user", JSON.stringify(currentUser));
    initApp();
  } catch (e) {
    popupError("Login error", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.logout = () => {
  localStorage.clear();
  location.reload();
};

// ---------- App init ----------
function initApp() {
  document.getElementById("login-page")?.classList.add("hidden");
  document.getElementById("main-page")?.classList.remove("hidden");

  updateSidebarUserCard();

  const isAdmin = currentUser?.type === "admin";

  // ✅ Админ дээр Request/Profile харагдахгүй
  document.getElementById("nav-request")?.classList.toggle("hidden", isAdmin);
  document.getElementById("nav-profile")?.classList.toggle("hidden", isAdmin);

  // ✅ User дээр Items/Employees харагдахгүй
  document.getElementById("nav-items")?.classList.toggle("hidden", !isAdmin);
  document.getElementById("nav-employees")?.classList.toggle("hidden", !isAdmin);

  refreshData();
  showTab(isAdmin ? "items" : "orders", document.getElementById(isAdmin ? "nav-items" : "nav-orders"));
}

// ---------- Populate filters ----------
function populateOrderItemFilter() {
  const el = document.getElementById("filter-item");
  if (!el) return;
  const names = uniq(allItems.map(it => it.name)).sort((a, b) => a.localeCompare(b));
  setSelectOptions(el, names, names, "Бүгд");
}

function populateStatusFilter() {
  const el = document.getElementById("filter-status");
  if (!el) return;
  const sts = uniq(allOrders.map(o => o.status)).sort((a, b) => a.localeCompare(b));
  setSelectOptions(el, sts, sts, "Бүгд");
}

function setupYearMonthFilters() {
  const yearSel = document.getElementById("filter-year");
  const monthSel = document.getElementById("filter-month");
  if (!yearSel || !monthSel) return;

  const years = new Set();
  allOrders.forEach(o => {
    const d = new Date(o.requestedDate);
    if (!isNaN(d)) years.add(d.getFullYear());
  });
  const ys = [...years].sort((a, b) => a - b).map(String);
  setSelectOptions(yearSel, ys, ys, "Бүгд");

  const ms = Array.from({ length: 12 }, (_, i) => i + 1);
  setSelectOptions(monthSel, ms.map(m => `${m} сар`), ms.map(m => String(m).padStart(2, "0")), "Бүгд");
}

function setupPlaceDeptFiltersFromOrders() {
  const placeSel = document.getElementById("filter-place");
  const deptSel = document.getElementById("filter-dept");
  if (!placeSel || !deptSel) return;

  const places = uniq(allOrders.map(o => o.place)).sort((a, b) => a.localeCompare(b));
  const depts = uniq(allOrders.map(o => o.department)).sort((a, b) => a.localeCompare(b));

  setSelectOptions(placeSel, places, places, "Бүгд");
  setSelectOptions(deptSel, depts, depts, "Бүгд");
}

window.onPlaceChange = () => {
  const placeSel = document.getElementById("filter-place");
  const deptSel = document.getElementById("filter-dept");
  if (!placeSel || !deptSel) return;

  const place = placeSel.value || "";
  const depts = new Set();
  allOrders.forEach(o => {
    if (!o.department) return;
    if (!place || (o.place || "") === place) depts.add(o.department);
  });

  const list = [...depts].sort((a, b) => a.localeCompare(b));
  setSelectOptions(deptSel, list, list, "Бүгд");
  applyFilters();
};

// ---------- Request selects ----------
function populateRequestItemSelect() {
  const el = document.getElementById("req-item");
  if (!el) return;
  const names = uniq(allItems.map(it => it.name)).sort((a, b) => a.localeCompare(b));
  setSelectOptions(el, names, names, "Сонгох...");
}

window.updateSizeOptions = () => {
  const name = document.getElementById("req-item")?.value || "";
  const select = document.getElementById("req-size");
  if (!select) return;

  if (!name) {
    select.innerHTML = `<option value="">Сонгох...</option>`;
    return;
  }
  const item = allItems.find(i => i.name === name);
  const sizes = String(item?.sizes || "").split(",").map(s => s.trim()).filter(Boolean);

  if (!sizes.length) {
    select.innerHTML = `<option value="ST">Стандарт</option>`;
    return;
  }
  select.innerHTML = sizes.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
};

// ---------- Items filter ----------
function setupItemsNameFilter() {
  const sel = document.getElementById("items-filter-name");
  if (!sel) return;
  const names = uniq(allItems.map(i => i.name)).sort((a, b) => a.localeCompare(b));
  setSelectOptions(sel, names, names, "Бүгд");
}

window.clearItemsFilter = () => {
  const sel = document.getElementById("items-filter-name");
  if (sel) sel.value = "";
  renderItemsList();
};

// ---------- Refresh ----------
window.refreshData = async () => {
  showLoading(true);
  try {
    const data = await apiPost({ action: "get_all_data" });
    if (data.success === false) return popupError("Өгөгдөл татахад алдаа", data.msg || "Unknown");

    allOrders = data.orders || [];
    allItems = data.items || [];

    populateOrderItemFilter();
    populateStatusFilter();
    populateRequestItemSelect();
    updateSizeOptions();
    setupYearMonthFilters();
    setupPlaceDeptFiltersFromOrders();
    setupItemsNameFilter();

    initShiftSelects();

    const cnt = document.getElementById("items-count");
    if (cnt) cnt.innerText = `${allItems.length} бараа`;

    if (currentUser?.type === "admin") {
      const u = await apiPost({ action: "get_users" });
      if (u.success) {
        allEmployees = u.users || [];
        const ec = document.getElementById("emp-count");
        if (ec) ec.innerText = `${allEmployees.length} ажилтан`;
      } else {
        allEmployees = [];
      }
    }

    applyFilters();
    renderItemsList();
    renderEmployeesList();
  } catch (e) {
    popupError("Өгөгдөл татахад алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------- Orders ----------
window.clearOrderFilters = () => {
  const ids = ["filter-status","filter-item","filter-year","filter-month","filter-place","filter-dept","filter-shift","search-name","search-code","search-role"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  setupPlaceDeptFiltersFromOrders();
  initShiftSelects();
  applyFilters();
};

window.applyFilters = () => {
  const nS = (document.getElementById("search-name")?.value || "").toLowerCase();
  const cS = (document.getElementById("search-code")?.value || "").trim();
  const rS = (document.getElementById("search-role")?.value || "").toLowerCase();

  const iF = document.getElementById("filter-item")?.value || "";
  const sF = document.getElementById("filter-status")?.value || "";
  const yF = document.getElementById("filter-year")?.value || "";
  const mF = document.getElementById("filter-month")?.value || "";
  const pF = document.getElementById("filter-place")?.value || "";
  const dF = document.getElementById("filter-dept")?.value || "";
  const shF = document.getElementById("filter-shift")?.value || "";

  const filtered = allOrders.filter(o => {
    const d = new Date(o.requestedDate);
    const mN = !nS || (o.ner && o.ner.toLowerCase().includes(nS)) || (o.ovog && o.ovog.toLowerCase().includes(nS));
    const mC = !cS || (o.code && String(o.code).includes(cS));
    const mR = !rS || (o.role && o.role.toLowerCase().includes(rS));
    const mI = !iF || o.item === iF;
    const mS = !sF || o.status === sF;
    const mY = !yF || (!isNaN(d) && String(d.getFullYear()) === yF);
    const mM = !mF || (!isNaN(d) && String(d.getMonth() + 1).padStart(2, "0") === mF);
    const mP = !pF || (o.place || "") === pF;
    const mD = !dF || (o.department || "") === dF;
    const mSh = !shF || (o.shift || "") === shF;
    return mN && mC && mR && mI && mS && mY && mM && mP && mD && mSh;
  });

  renderOrders(filtered);
};

function renderOrders(orders) {
  const container = document.getElementById("orders-list-container");
  if (!container) return;

  if (!orders.length) {
    container.innerHTML = `<div class="card"><div style="font-weight:900;color:#0f172a">Мэдээлэл олдсонгүй</div></div>`;
    return;
  }

  container.innerHTML = orders.slice().reverse().map(o => {
    const canAct = (currentUser?.type === "admin" && o.status === "Хүлээгдэж буй");
    const actions = canAct ? `
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-mini hist" onclick="setOrderStatus('${esc(o.id)}','Зөвшөөрсөн')">ОЛГОХ</button>
        <button class="btn-mini del" onclick="setOrderStatus('${esc(o.id)}','Татгалзсан')">ТАТГАЛЗАХ</button>
      </div>
    ` : "";

    return `
      <div class="card">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div style="font-weight:900;color:#0f172a">${esc(o.ovog)} ${esc(o.ner)}</div>
          <div class="badge" style="background:#0f172a;color:#fff">${esc(o.status || "")}</div>
        </div>

        <div style="margin-top:8px;font-size:11px;font-weight:800;color:#64748b;line-height:1.4">
          ${esc(o.code)} • ${esc(o.role || "")}<br/>
          ${esc(o.place || "")} • ${esc(o.department || "")} • ${esc(o.shift || "")}<br/>
          ${esc(o.item)} • Размер: ${esc(o.size || "ST")} • Тоо: ${esc(o.quantity ?? 1)} • ${esc(fmtDateTime(o.requestedDate))}
        </div>

        ${actions}
      </div>
    `;
  }).join("");
}

window.setOrderStatus = async (id, status) => {
  showLoading(true);
  try {
    const r = await apiPost({ action: "update_status", id, status });
    if (!r.success) return popupError("Төлөв", r.msg || "Амжилтгүй");
    await refreshData();
  } finally {
    showLoading(false);
  }
};

// ---------- (3) ITEMS: Засах / Устгах / Түүх ----------
function renderItemsList() {
  const container = document.getElementById("items-list-container");
  if (!container) return;

  const sel = document.getElementById("items-filter-name");
  const filterName = sel ? (sel.value || "") : "";

  const rows = filterName ? allItems.filter(x => x.name === filterName) : allItems;
  if (!rows.length) {
    container.innerHTML = `<div class="card"><div style="font-weight:900;color:#0f172a">Бараа олдсонгүй</div></div>`;
    return;
  }

  container.innerHTML = rows.map((it, idx) => {
    const sizes = String(it.sizes || "").split(",").map(s => s.trim()).filter(Boolean);
    const lockedNote = it.locked ? `<div style="font-size:10px;font-weight:900;color:#ef4444;margin-top:4px">LOCKED</div>` : "";

    return `
      <div class="items-row">
        <div class="items-no">${idx + 1}</div>
        <div class="items-name">${esc(it.name)} ${lockedNote}</div>
        <div class="items-sizes">${sizes.map(s => `<span class="sz">${esc(s)}</span>`).join("") || "-"}</div>

        <div class="items-actions">
          <button class="btn-mini edit" onclick="openItemEdit('${esc(it.name)}','${esc(it.sizes || "")}', ${it.locked ? "true" : "false"})">ЗАСАХ</button>
          <button class="btn-mini hist" onclick="openItemHistory('${esc(it.name)}')">ТҮҮХ</button>
          <button class="btn-mini del" onclick="deleteItem('${esc(it.name)}', ${it.locked ? "true" : "false"})">УСТГАХ</button>
        </div>
      </div>
    `;
  }).join("");
}

window.addItem = async () => {
  const name = document.getElementById("new-item-name")?.value?.trim() || "";
  const sizes = document.getElementById("new-item-sizes")?.value?.trim() || "";
  if (!name) return popupError("Алдаа", "Барааны нэр оруулна уу!");

  showLoading(true);
  try {
    const r = await apiPost({ action: "add_item", name, sizes });
    if (!r.success) return popupError("Алдаа", r.msg || "Амжилтгүй");
    document.getElementById("new-item-name").value = "";
    document.getElementById("new-item-sizes").value = "";
    await refreshData();
  } finally {
    showLoading(false);
  }
};

window.openItemEdit = (oldName, oldSizes, locked) => {
  if (locked) return popupError("LOCKED", "Энэ бараагаар хүсэлт/олголт бүртгэгдсэн тул засах боломжгүй.");

  window.openModal("Бараа засах", `
    <div class="card" style="margin:0;background:#fff">
      <div class="form-grid" style="grid-template-columns:1fr 1fr 180px">
        <div>
          <span class="filter-label">Нэр</span>
          <input id="edit-item-name" value="${esc(oldName)}"/>
        </div>
        <div>
          <span class="filter-label">Размер (таслалаар)</span>
          <input id="edit-item-sizes" value="${esc(oldSizes)}"/>
        </div>
        <div style="display:flex;align-items:flex-end">
          <button class="btn-mini edit" onclick="saveItemEdit('${esc(oldName)}')">ХАДГАЛАХ</button>
        </div>
      </div>
    </div>
  `);
};

window.saveItemEdit = async (oldName) => {
  const newName = document.getElementById("edit-item-name")?.value?.trim() || "";
  const sizes = document.getElementById("edit-item-sizes")?.value?.trim() || "";
  if (!newName) return popupError("Алдаа", "Нэр хоосон байж болохгүй");

  showLoading(true);
  try {
    const r = await apiPost({ action: "update_item", oldName, newName, sizes });
    if (!r.success) return popupError("Алдаа", r.msg || "Амжилтгүй");
    closeModal();
    await refreshData();
  } finally {
    showLoading(false);
  }
};

window.deleteItem = async (name, locked) => {
  if (locked) return popupError("LOCKED", "Энэ бараагаар хүсэлт/олголт бүртгэгдсэн тул устгах боломжгүй.");
  if (!confirm(`"${name}" барааг устгах уу?`)) return;

  showLoading(true);
  try {
    const r = await apiPost({ action: "delete_item", name });
    if (!r.success) return popupError("Алдаа", r.msg || "Амжилтгүй");
    await refreshData();
  } finally {
    showLoading(false);
  }
};

window.openItemHistory = async (itemName) => {
  showLoading(true);
  try {
    const r = await apiPost({ action: "get_item_history", item: itemName });
    if (!r.success) return popupError("Түүх", r.msg || "Алдаа");

    const rows = (r.history || []).slice().reverse();
    const html = rows.length ? `
      <div class="card" style="margin:0;background:#fff">
        <div style="overflow:auto;border-radius:16px">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="background:#f8fafc">
                <th style="text-align:left;padding:10px;border-bottom:1px solid #e2e8f0">Огноо</th>
                <th style="text-align:left;padding:10px;border-bottom:1px solid #e2e8f0">Код</th>
                <th style="text-align:left;padding:10px;border-bottom:1px solid #e2e8f0">Нэр</th>
                <th style="text-align:left;padding:10px;border-bottom:1px solid #e2e8f0">Хэмжээ</th>
                <th style="text-align:left;padding:10px;border-bottom:1px solid #e2e8f0">Тоо</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(h => `
                <tr>
                  <td style="padding:10px;border-bottom:1px solid #f1f5f9;white-space:nowrap">${esc(fmtDateTime(h.date))}</td>
                  <td style="padding:10px;border-bottom:1px solid #f1f5f9">${esc(h.code)}</td>
                  <td style="padding:10px;border-bottom:1px solid #f1f5f9">${esc(h.ovog)} ${esc(h.ner)}</td>
                  <td style="padding:10px;border-bottom:1px solid #f1f5f9">${esc(h.size || "ST")}</td>
                  <td style="padding:10px;border-bottom:1px solid #f1f5f9">${esc(h.qty)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    ` : `
      <div class="card" style="margin:0;background:#fff">
        <div style="font-weight:900;color:#0f172a">Олголтын түүх байхгүй</div>
      </div>
    `;
    window.openModal(`Олголтын түүх • ${itemName}`, html);
  } catch (e) {
    popupError("Түүх", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------- Orders submit (user) ----------
window.submitOrder = async () => {
  if (!currentUser || currentUser.type === "admin") return popupError("Алдаа", "Зөвхөн ажилтан хүсэлт гаргана.");

  const item = document.getElementById("req-item")?.value || "";
  const size = document.getElementById("req-size")?.value || "";
  const qty = parseInt(document.getElementById("req-qty")?.value || "1", 10) || 1;

  if (!item) return popupError("Алдаа", "Бараа сонгоно уу!");
  showLoading(true);
  try {
    const r = await apiPost({ action: "add_order", code: currentUser.code, item, size, qty });
    if (!r.success) return popupError("Алдаа", r.msg || "Амжилтгүй");
    await refreshData();
    showTab("orders", document.getElementById("nav-orders"));
  } finally {
    showLoading(false);
  }
};

// ---------- (4) Employees list + Edit + History ----------
function matches(v, q) {
  const s = String(v ?? "").toLowerCase();
  const t = String(q ?? "").toLowerCase().trim();
  return !t || s.includes(t);
}

function renderEmployeesList() {
  const container = document.getElementById("employees-list-container");
  if (!container) return;

  if (currentUser?.type !== "admin") {
    container.innerHTML = `<div class="card"><div style="font-weight:900;color:#0f172a">Зөвхөн админ харна.</div></div>`;
    return;
  }

  const qRole = document.getElementById("emp-search-role")?.value || "";
  const qPlace = document.getElementById("emp-search-place")?.value || "";
  const qDept = document.getElementById("emp-search-dept")?.value || "";
  const qShift = document.getElementById("emp-search-shift")?.value || "";

  const list = (allEmployees || []).filter(u => {
    const okRole = matches(u.role, qRole);
    const okPlace = matches(u.place, qPlace);
    const okDept = matches(u.department, qDept);
    const okShift = !qShift || String(u.shift || "") === qShift;
    return okRole && okPlace && okDept && okShift;
  });

  if (!list.length) {
    container.innerHTML = `<div class="card"><div style="font-weight:900;color:#0f172a">Ажилтан олдсонгүй</div></div>`;
    return;
  }

  // ✅ (1) Role box-гүй: role-ийг жирийн текст болгож,
  // Place/Dept/Shift-ийг 3 жижиг badge болгож гаргана
  container.innerHTML = list.map(u => `
    <div class="card">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
        <div style="font-weight:900;color:#0f172a">${esc(u.code)} • ${esc(u.ovog)} ${esc(u.ner)}</div>
        <div style="font-weight:900;color:#0f172a;font-size:12px">${esc(u.role || "")}</div>
      </div>

      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
        <span class="mini-pill">${esc(u.place || "-")}</span>
        <span class="mini-pill">${esc(u.department || "-")}</span>
        <span class="mini-pill">${esc(u.shift || "-")}</span>
      </div>

      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-mini edit" onclick="openEmployeeEdit('${esc(u.code)}')">ЗАСАХ</button>
        <button class="btn-mini hist" onclick="openEmployeeHistory('${esc(u.code)}','${esc(u.ovog)}','${esc(u.ner)}')">ТҮҮХ</button>
        <button class="btn-mini del" onclick="deleteEmployee('${esc(u.code)}', ${u.locked ? "true" : "false"})">УСТГАХ</button>
      </div>
    </div>
  `).join("");
}

// ✅ (2) Icon дээр дарж нэмдэг болсон
window.addEmployee = async () => {
  const code = document.getElementById("emp-code")?.value?.trim() || "";
  const pass = document.getElementById("emp-pass")?.value?.trim() || "12345";
  const ovog = document.getElementById("emp-ovog")?.value?.trim() || "";
  const ner = document.getElementById("emp-ner")?.value?.trim() || "";
  const role = document.getElementById("emp-role")?.value?.trim() || "";
  const place = document.getElementById("emp-place")?.value?.trim() || "";
  const department = document.getElementById("emp-dept")?.value?.trim() || "";
  const shift = document.getElementById("emp-shift")?.value?.trim() || "";

  if (!code || !ner) return popupError("Алдаа", "Код болон Нэр заавал!");

  showLoading(true);
  try {
    const r = await apiPost({ action: "add_user", code, pass, ovog, ner, role, place, department, shift });
    if (!r.success) return popupError("Алдаа", r.msg || "Амжилтгүй");

    // clear
    ["emp-code","emp-pass","emp-ovog","emp-ner","emp-role","emp-place","emp-dept"].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = "";
    });
    const sh = document.getElementById("emp-shift"); if (sh) sh.value = "";

    await refreshData();
  } finally {
    showLoading(false);
  }
};

window.openEmployeeEdit = (code) => {
  const u = allEmployees.find(x => String(x.code) === String(code));
  if (!u) return popupError("Алдаа", "Ажилтан олдсонгүй");

  if (u.locked) {
    return popupError("LOCKED", "Энэ ажилтнаар хүсэлт/олголт бүртгэгдсэн тул устгах боломжгүй (засах боломжтой).");
  }

  window.openModal("Ажилтан засах", `
    <div class="card" style="margin:0;background:#fff">
      <div class="form-grid">
        <input id="e-ovog" value="${esc(u.ovog)}" placeholder="Овог"/>
        <input id="e-ner" value="${esc(u.ner)}" placeholder="Нэр"/>
        <input id="e-role" value="${esc(u.role)}" placeholder="Албан тушаал"/>
        <input id="e-place" value="${esc(u.place)}" placeholder="Газар"/>
        <input id="e-dept" value="${esc(u.department)}" placeholder="Хэлтэс"/>
        <input id="e-shift" value="${esc(u.shift)}" placeholder="Ээлж"/>
        <div style="grid-column:1/-1;display:flex;justify-content:flex-end">
          <button class="btn-mini edit" onclick="saveEmployeeEdit('${esc(u.code)}')">ХАДГАЛАХ</button>
        </div>
      </div>
    </div>
  `);
};

window.saveEmployeeEdit = async (code) => {
  const ovog = document.getElementById("e-ovog")?.value?.trim() || "";
  const ner = document.getElementById("e-ner")?.value?.trim() || "";
  const role = document.getElementById("e-role")?.value?.trim() || "";
  const place = document.getElementById("e-place")?.value?.trim() || "";
  const department = document.getElementById("e-dept")?.value?.trim() || "";
  const shift = document.getElementById("e-shift")?.value?.trim() || "";
  if (!ner) return popupError("Алдаа", "Нэр хоосон байж болохгүй");

  showLoading(true);
  try {
    const r = await apiPost({ action: "update_user", code, ovog, ner, role, place, department, shift });
    if (!r.success) return popupError("Алдаа", r.msg || "Амжилтгүй");
    closeModal();
    await refreshData();
  } finally {
    showLoading(false);
  }
};

window.deleteEmployee = async (code, locked) => {
  if (locked) return popupError("LOCKED", "Энэ ажилтнаар хүсэлт/олголт бүртгэгдсэн тул устгах боломжгүй.");
  if (!confirm(`"${code}" ажилтныг устгах уу?`)) return;

  showLoading(true);
  try {
    const r = await apiPost({ action: "delete_user", code });
    if (!r.success) return popupError("Алдаа", r.msg || "Амжилтгүй");
    await refreshData();
  } finally {
    showLoading(false);
  }
};

// ✅ (4) Employee history (backend action: get_user_history хэрэгтэй)
window.openEmployeeHistory = async (code, ovog, ner) => {
  showLoading(true);
  try {
    const r = await apiPost({ action: "get_user_history", code });
    if (!r.success) return popupError("Түүх", r.msg || "Алдаа");

    const rows = (r.history || []).slice().reverse();
    const html = rows.length ? `
      <div class="card" style="margin:0;background:#fff">
        <div style="overflow:auto;border-radius:16px">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="background:#f8fafc">
                <th style="text-align:left;padding:10px;border-bottom:1px solid #e2e8f0">Огноо</th>
                <th style="text-align:left;padding:10px;border-bottom:1px solid #e2e8f0">Бараа</th>
                <th style="text-align:left;padding:10px;border-bottom:1px solid #e2e8f0">Хэмжээ</th>
                <th style="text-align:left;padding:10px;border-bottom:1px solid #e2e8f0">Тоо</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(h => `
                <tr>
                  <td style="padding:10px;border-bottom:1px solid #f1f5f9;white-space:nowrap">${esc(fmtDateTime(h.date))}</td>
                  <td style="padding:10px;border-bottom:1px solid #f1f5f9">${esc(h.item)}</td>
                  <td style="padding:10px;border-bottom:1px solid #f1f5f9">${esc(h.size || "ST")}</td>
                  <td style="padding:10px;border-bottom:1px solid #f1f5f9">${esc(h.qty)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    ` : `
      <div class="card" style="margin:0;background:#fff">
        <div style="font-weight:900;color:#0f172a">Олголтын түүх байхгүй</div>
      </div>
    `;

    window.openModal(`Олголтын түүх • ${code} • ${ovog} ${ner}`, html);
  } catch (e) {
    popupError("Түүх", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------- Password (user) ----------
window.changePassword = async () => {
  if (!currentUser || currentUser.type === "admin") return popupError("Алдаа", "Зөвхөн ажилтан нууц үг солино.");

  const oldP = document.getElementById("old-pass")?.value?.trim() || "";
  const newP = document.getElementById("new-pass")?.value?.trim() || "";
  const newP2 = document.getElementById("new-pass2")?.value?.trim() || "";
  if (!oldP || !newP || !newP2) return popupError("Алдаа", "Мэдээлэл дутуу");
  if (newP !== newP2) return popupError("Алдаа", "Шинэ нууц үг таарахгүй байна");

  showLoading(true);
  try {
    const r = await apiPost({ action: "change_pass", code: currentUser.code, oldP, newP });
    if (!r.success) return popupError("Алдаа", r.msg || "Амжилтгүй");
    popupError("Амжилттай", "Нууц үг солигдлоо");
    document.getElementById("old-pass").value = "";
    document.getElementById("new-pass").value = "";
    document.getElementById("new-pass2").value = "";
  } finally {
    showLoading(false);
  }
};

// ---------- Boot ----------
window.onload = () => {
  const saved = localStorage.getItem("ett_user");
  if (saved) {
    try { currentUser = JSON.parse(saved); } catch { currentUser = null; }
  }
  if (currentUser) initApp();
  initShiftSelects();
};
