// ===============================
// ETT PPE System - app.js (v20260306)
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
    .replace(/'/g, "&#39;");
}

// ---------- Loading ----------
function showLoading(isShow, subText = "") {
  const ov = document.getElementById("loading-overlay");
  if (!ov) return;

  const sub = ov.querySelector(".loading-sub");
  if (sub) sub.textContent = subText || "";

  if (isShow) ov.classList.remove("hidden");
  else ov.classList.add("hidden");
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
  window.openModal(title || "Алдаа", `<div style="font-weight:900;color:#ef4444">${esc(msg || "")}</div>`);
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

  if (!currentUser) return;

  if (nameEl) nameEl.innerText = `${currentUser.ovog || ""} ${currentUser.ner || ""}`.trim();
  if (idEl) idEl.innerText = `${currentUser.code || ""}`;
  if (roleEl) roleEl.innerText = (currentUser.type === "admin") ? "АДМИН" : (currentUser.role || "");
  if (extraEl) extraEl.innerText = `${currentUser.place || ""} • ${currentUser.department || ""} • ${currentUser.shift || ""}`.replace(/^ • | • $/g, "");
}

// ---------- API ----------
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
  if (!res.ok) throw new Error(text || "Network error");

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error("Invalid JSON: " + text);
  }
}

// ---------- Helpers ----------
function uniq(arr) {
  return Array.from(new Set((arr || []).filter(x => x != null && x !== "")));
}
function setSelectOptions(sel, values, labels, allLabel) {
  if (!sel) return;
  const v = values || [];
  const l = labels || v;

  let html = "";
  if (allLabel) html += `<option value="">${esc(allLabel)}</option>`;
  v.forEach((val, i) => {
    html += `<option value="${esc(val)}">${esc(l[i] ?? val)}</option>`;
  });
  sel.innerHTML = html;
}
function matches(value, query) {
  const v = String(value || "").toLowerCase();
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  return v.includes(q);
}
function fmtDateTime(v) {
  const d = new Date(v);
  if (isNaN(d)) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}
function fmtDateOnly(v){
  const d = new Date(v);
  if (isNaN(d)) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function statusMeta(raw){
  const s = String(raw||"").trim();
  if (s === "Зөвшөөрсөн") return {label:"ОЛГОСОН", cls:"st-approved"};
  if (s === "Татгалзсан") return {label:"ТАТГАЛЗСАН", cls:"st-rejected"};
  return {label:"ХҮЛЭЭГДЭЖ БУЙ", cls:"st-pending"};
}

// ---------- Login / Logout ----------
window.login = async () => {
  const code = document.getElementById("login-code")?.value?.trim() || "";
  const pass = document.getElementById("login-pass")?.value?.trim() || "";
  if (!code || !pass) return popupError("Алдаа", "Код, нууц үг оруулна уу");

  showLoading(true);
  try {
    const r = await apiPost({ action: "login", code, pass });
    if (!r.success) return popupError("Алдаа", r.msg || "Нэвтрэх амжилтгүй");

    currentUser = r.user;
    updateSidebarUserCard();

    document.getElementById("login-screen")?.classList.add("hidden");
    document.getElementById("main-screen")?.classList.remove("hidden");

    // Role-based menu
    const isAdmin = currentUser?.type === "admin";
    document.getElementById("nav-request")?.classList.toggle("hidden", isAdmin);
    document.getElementById("nav-items")?.classList.toggle("hidden", !isAdmin);
    document.getElementById("nav-employees")?.classList.toggle("hidden", !isAdmin);

    await refreshData();

    // Default tab
    if (isAdmin) showTab("orders", document.querySelector(".nav-btn"));
    else showTab("request", document.getElementById("nav-request"));
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
};

// ---------- Refresh ----------
window.refreshData = async () => {
  showLoading(true);
  try {
    const r = await apiPost({ action: "get_all_data" });
    if (!r.success) return popupError("Алдаа", r.msg || "Өгөгдөл татахад алдаа гарлаа.");

    allOrders = r.orders || [];
    allItems = r.items || [];

    // employees data is separate action
    if (currentUser?.type === "admin") {
      const u = await apiPost({ action: "get_users" });
      if (!u.success) return popupError("Алдаа", u.msg || "Users татахад алдаа");
      allEmployees = u.users || [];
    } else {
      allEmployees = [];
    }

    populateOrderItemFilter();
    populateStatusFilter();
    setupYearMonthFilters();
    setupPlaceDeptShiftFilters();
    populateItemsFilter();
    setupEmployeeShiftOptions();
    setupEmployeeSearchShiftOptions();

    // counts
    document.getElementById("items-count") && (document.getElementById("items-count").innerText = `${allItems.length} items`);
    document.getElementById("emp-count") && (document.getElementById("emp-count").innerText = `${allEmployees.length} employees`);

    // render current tab
    const visibleTab = document.querySelector(".tab-content:not(.hidden)")?.id || "";
    if (visibleTab === "tab-orders") applyFilters();
    if (visibleTab === "tab-items") renderItemsList();
    if (visibleTab === "tab-employees") renderEmployeesList();
  } catch (e) {
    popupError("Өгөгдөл татахад алдаа гарлаа.", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------- Orders filters ----------
function populateOrderItemFilter() {
  const el = document.getElementById("filter-item");
  if (!el) return;
  const names = uniq(allItems.map(it => it.name)).sort((a, b) => a.localeCompare(b));
  setSelectOptions(el, names, names, "Бүгд");
}

function populateStatusFilter() {
  const el = document.getElementById("filter-status");
  if (!el) return;

  // Always show 3 main statuses
  const base = ["Хүлээгдэж буй", "Зөвшөөрсөн", "Татгалзсан"];
  const sts = uniq(base.concat(allOrders.map(o => o.status).filter(Boolean)))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  setSelectOptions(el, sts, sts, "Бүгд");
}

function setupYearMonthFilters() {
  const yearSel = document.getElementById("filter-year");
  const monthSel = document.getElementById("filter-month");
  if (!yearSel || !monthSel) return;

  const years = new Set();
  allOrders.forEach(o => {
    const d = new Date(o.requestedDate);
    if (!isNaN(d)) years.add(String(d.getFullYear()));
  });
  const yearsArr = Array.from(years).sort((a, b) => b.localeCompare(a));
  setSelectOptions(yearSel, yearsArr, yearsArr, "Бүгд");

  const monthsArr = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
  setSelectOptions(monthSel, monthsArr, monthsArr, "Бүгд");
}

function setupPlaceDeptShiftFilters() {
  const placeSel = document.getElementById("filter-place");
  const deptSel = document.getElementById("filter-dept");
  const shiftSel = document.getElementById("filter-shift");

  if (placeSel) setSelectOptions(placeSel, uniq(allOrders.map(o => o.place)).sort((a,b)=>String(a).localeCompare(String(b))), null, "Бүгд");
  if (deptSel) setSelectOptions(deptSel, uniq(allOrders.map(o => o.department)).sort((a,b)=>String(a).localeCompare(String(b))), null, "Бүгд");

  const shifts = uniq(["А","Б","Өдөр","Шөнө"].concat(allOrders.map(o => o.shift))).filter(Boolean);
  if (shiftSel) setSelectOptions(shiftSel, shifts, shifts, "Бүгд");
}

window.clearOrderFilters = () => {
  ["filter-status","filter-item","filter-year","filter-month","filter-place","filter-dept","filter-shift","search-name","search-code","search-role"]
    .forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = "";
    });
  applyFilters();
};

window.applyFilters = () => {
  const nS = document.getElementById("search-name")?.value || "";
  const cS = document.getElementById("search-code")?.value || "";
  const rS = document.getElementById("search-role")?.value || "";

  const iF = document.getElementById("filter-item")?.value || "";
  const sF = document.getElementById("filter-status")?.value || "";
  const yF = document.getElementById("filter-year")?.value || "";
  const mF = document.getElementById("filter-month")?.value || "";
  const pF = document.getElementById("filter-place")?.value || "";
  const dF = document.getElementById("filter-dept")?.value || "";
  const shF = document.getElementById("filter-shift")?.value || "";

  const filtered = (allOrders || []).filter(o => {
    const d = new Date(o.requestedDate);
    const mN = !nS || (`${o.ovog||""} ${o.ner||""}`.toLowerCase().includes(nS.toLowerCase()));
    const mC = !cS || (String(o.code).includes(cS));
    const mR = !rS || (o.role && o.role.toLowerCase().includes(rS.toLowerCase()));
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
    const st = statusMeta(o.status);
    const emp = `${esc(o.code)} • ${esc(o.ovog)} ${esc(o.ner)}<br/><span style="font-size:11px;font-weight:800;color:#64748b">${esc(o.role||"")} • ${esc(o.place||"")} • ${esc(o.department||"")} • ${esc(o.shift||"")}</span>`;
    const item = `<div style="font-weight:900;color:#0f172a">${esc(o.item||"")}</div><div style="font-size:11px;font-weight:800;color:#64748b">Размер: ${esc(o.size||"")}</div>`;
    const qty = `<div style="font-weight:900;color:#0f172a;text-align:center">${esc(o.quantity ?? 1)}</div>`;
    const dt = `<div style="font-weight:900;color:#0f172a;text-align:center">${esc(fmtDateOnly(o.requestedDate))}</div>`;
    const status = `<span class="badge-status ${st.cls}">${st.label}</span>`;

    const canAct = (currentUser?.type === "admin" && String(o.status||"") === "Хүлээгдэж буй");
    const actions = canAct ? `
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
        <button class="btn-mini hist" onclick="setOrderStatus('${esc(o.id)}','Зөвшөөрсөн')">ОЛГОХ</button>
        <button class="btn-mini del" onclick="setOrderStatus('${esc(o.id)}','Татгалзсан')">ТАТГАЛЗАХ</button>
      </div>
    ` : `<div style="text-align:right;color:#94a3b8;font-weight:900">ШИЙДВЭРЛЭСЭН</div>`;

    return `
      <div class="order-row">
        <div>${emp}</div>
        <div>${item}</div>
        <div style="text-align:center">${qty}</div>
        <div style="text-align:center">${dt}</div>
        <div style="text-align:center">${status}</div>
        <div>${actions}</div>
      </div>
    `;
  }).join("");
}

window.setOrderStatus = async (id, status) => {
  showLoading(true);
  try {
    const r = await apiPost({ action: "update_status", id, status });
    if (!r.success) return popupError("Алдаа", r.msg || "Амжилтгүй");
    await refreshData();
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------- Request (user) ----------
window.onRequestItemChange = () => {
  const itemName = document.getElementById("req-item")?.value || "";
  const item = allItems.find(x => x.name === itemName);
  const sizeSel = document.getElementById("req-size");
  if (!sizeSel) return;

  const sizes = item ? String(item.sizes || "").split(",").map(s => s.trim()).filter(Boolean) : [];
  setSelectOptions(sizeSel, sizes, sizes, "Сонгох...");
};

window.submitRequest = async () => {
  if (!currentUser) return;
  const item = document.getElementById("req-item")?.value || "";
  const size = document.getElementById("req-size")?.value || "";
  const qty = document.getElementById("req-qty")?.value || "1";
  if (!item) return popupError("Алдаа", "Бараа сонгоно уу");

  showLoading(true);
  try {
    const r = await apiPost({ action: "add_order", code: currentUser.code, item, size, qty });
    if (!r.success) return popupError("Алдаа", r.msg || "Амжилтгүй");

    document.getElementById("req-qty").value = "1";
    await refreshData();
    window.openModal("Амжилттай", `<div style="font-weight:900;color:#16a34a">Хүсэлт илгээгдлээ</div>`);
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------- Items ----------
function populateItemsFilter() {
  const el = document.getElementById("items-filter-name");
  if (!el) return;
  const names = uniq(allItems.map(it => it.name)).sort((a, b) => a.localeCompare(b));
  setSelectOptions(el, names, names, "Бүгд");
}
window.clearItemsFilter = () => {
  const el = document.getElementById("items-filter-name");
  if (el) el.value = "";
  renderItemsList();
};
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

window.openItemEdit = (name, sizes, locked) => {
  if (locked) return popupError("LOCKED", "Энэ бараагаар хүсэлт/олголт бүртгэгдсэн тул засах боломжгүй.");
  window.openModal("Бараа засах", `
    <div class="form-grid" style="grid-template-columns:1fr 1fr 220px">
      <div>
        <span class="filter-label">Бараа</span>
        <input id="edit-item-name" value="${esc(name)}" />
      </div>
      <div>
        <span class="filter-label">Размер</span>
        <input id="edit-item-sizes" value="${esc(sizes)}" />
      </div>
      <div style="display:flex;align-items:flex-end">
        <button class="btn-primary" onclick="saveItemEdit('${esc(name)}')">ХАДГАЛАХ</button>
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
  if (!confirm(`"${name}" устгах уу?`)) return;
  showLoading(true);
  try {
    const r = await apiPost({ action: "delete_item", name });
    if (!r.success) return popupError("Алдаа", r.msg || "Амжилтгүй");
    await refreshData();
  } finally {
    showLoading(false);
  }
};
window.openItemHistory = async (name) => {
  showLoading(true);
  try {
    const r = await apiPost({ action: "get_item_history", item: name });
    if (!r.success) return popupError("Алдаа", r.msg || "Амжилтгүй");

    const hist = r.history || [];
    const rows = hist.length ? hist.map(h => `
      <div class="card" style="margin-bottom:10px">
        <div style="font-weight:900;color:#0f172a">${esc(h.ovog)} ${esc(h.ner)} (${esc(h.code)})</div>
        <div style="margin-top:6px;color:#64748b;font-weight:800;font-size:11px">
          ${esc(fmtDateOnly(h.date))} • Размер: ${esc(h.size)} • Тоо: ${esc(h.qty)}
        </div>
      </div>
    `).join("") : `<div class="card"><div style="font-weight:900;color:#0f172a">Олголтын түүх байхгүй</div></div>`;

    window.openModal("Олголтын ТҮҮХ", rows);
  } finally {
    showLoading(false);
  }
};

// ---------- Employees ----------
function setupEmployeeShiftOptions() {
  const sel = document.getElementById("emp-shift");
  if (!sel) return;
  const opts = ["", ...SHIFT_OPTIONS];
  setSelectOptions(sel, opts, opts.map(x => x || "Сонгох..."), null);
}
function setupEmployeeSearchShiftOptions() {
  const sel = document.getElementById("emp-search-shift");
  if (!sel) return;
  const opts = ["", ...SHIFT_OPTIONS];
  setSelectOptions(sel, opts, opts.map(x => x || "Бүгд"), null);
}

function renderEmployeesList() {
  const container = document.getElementById("employees-list-container");
  if (!container) return;

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

  container.innerHTML = list.map(u => {
    const leftCols = `
      <div style="font-weight:900;color:#0f172a">${esc(u.place || "-")}</div>
      <div style="font-weight:900;color:#0f172a">${esc(u.department || "-")}</div>
      <div style="font-weight:900;color:#0f172a">${esc(u.role || "-")}</div>
      <div style="font-weight:900;color:#0f172a;text-align:center">${esc(u.shift || "-")}</div>
      <div style="font-weight:900;color:#0f172a">${esc(u.code)}</div>
      <div style="font-weight:900;color:#0f172a">${esc(u.ovog)} ${esc(u.ner)}</div>
    `;

    const actions = `
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
        <button class="btn-mini edit" onclick="openEmployeeEdit('${esc(u.code)}')">ЗАСАХ</button>
        <button class="btn-mini hist" onclick="openEmployeeHistory('${esc(u.code)}','${esc(u.ovog)}','${esc(u.ner)}')">ТҮҮХ</button>
        <button class="btn-mini del" onclick="deleteEmployee('${esc(u.code)}', ${u.locked ? "true" : "false"})">УСТГАХ</button>
      </div>
    `;

    return `<div class="emp-row">${leftCols}<div>${actions}</div></div>`;
  }).join("");
}

window.addEmployee = async () => {
  const code = document.getElementById("emp-code")?.value?.trim() || "";
  const pass = document.getElementById("emp-pass")?.value?.trim() || "12345";
  const ovog = document.getElementById("emp-ovog")?.value?.trim() || "";
  const ner = document.getElementById("emp-ner")?.value?.trim() || "";
  const place = document.getElementById("emp-place")?.value?.trim() || "";
  const department = document.getElementById("emp-dept")?.value?.trim() || "";
  const role = document.getElementById("emp-role")?.value?.trim() || "";
  const shift = document.getElementById("emp-shift")?.value?.trim() || "";

  if (!code || !ner) return popupError("Алдаа", "Код болон Нэр заавал!");

  showLoading(true);
  try {
    const r = await apiPost({ action: "add_user", code, pass, ovog, ner, role, place, department, shift });
    if (!r.success) return popupError("Алдаа", r.msg || "Амжилтгүй");

    ["emp-code","emp-pass","emp-ovog","emp-ner","emp-role","emp-place","emp-dept"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    const sh = document.getElementById("emp-shift");
    if (sh) sh.value = "";

    await refreshData();
  } finally {
    showLoading(false);
  }
};

window.openEmployeeEdit = (code) => {
  const u = allEmployees.find(x => String(x.code) === String(code));
  if (!u) return popupError("Алдаа", "Ажилтан олдсонгүй");

  window.openModal("Ажилтан засах", `
    <div class="form-grid" style="grid-template-columns:1fr 1fr 1fr 1fr">
      <div><span class="filter-label">Код</span><input id="edit-emp-code" value="${esc(u.code)}" disabled /></div>
      <div><span class="filter-label">Нууц үг (хоосон байвал солихгүй)</span><input id="edit-emp-pass" placeholder="шинэ нууц үг" /></div>
      <div><span class="filter-label">Овог</span><input id="edit-emp-ovog" value="${esc(u.ovog)}" /></div>
      <div><span class="filter-label">Нэр</span><input id="edit-emp-ner" value="${esc(u.ner)}" /></div>

      <div><span class="filter-label">Газар</span><input id="edit-emp-place" value="${esc(u.place)}" /></div>
      <div><span class="filter-label">Хэлтэс</span><input id="edit-emp-dept" value="${esc(u.department)}" /></div>
      <div><span class="filter-label">Албан тушаал</span><input id="edit-emp-role" value="${esc(u.role)}" /></div>
      <div><span class="filter-label">Ээлж</span>
        <select id="edit-emp-shift">
          <option value="">Сонгох...</option>
          ${SHIFT_OPTIONS.map(s => `<option value="${esc(s)}" ${String(u.shift)===String(s)?"selected":""}>${esc(s)}</option>`).join("")}
        </select>
      </div>

      <div style="grid-column:1/-1;display:flex;justify-content:flex-end">
        <button class="btn-primary" onclick="saveEmployeeEdit('${esc(u.code)}')">ХАДГАЛАХ</button>
      </div>
    </div>
  `);
};

window.saveEmployeeEdit = async (code) => {
  const pass = document.getElementById("edit-emp-pass")?.value?.trim() || "";
  const ovog = document.getElementById("edit-emp-ovog")?.value?.trim() || "";
  const ner = document.getElementById("edit-emp-ner")?.value?.trim() || "";
  const place = document.getElementById("edit-emp-place")?.value?.trim() || "";
  const department = document.getElementById("edit-emp-dept")?.value?.trim() || "";
  const role = document.getElementById("edit-emp-role")?.value?.trim() || "";
  const shift = document.getElementById("edit-emp-shift")?.value?.trim() || "";

  if (!ner) return popupError("Алдаа", "Нэр хоосон байж болохгүй");

  showLoading(true);
  try {
    const r = await apiPost({ action: "update_user", code, pass, ovog, ner, role, place, department, shift });
    if (!r.success) return popupError("Алдаа", r.msg || "Амжилтгүй");
    closeModal();
    await refreshData();
  } finally {
    showLoading(false);
  }
};

window.deleteEmployee = async (code, locked) => {
  if (locked) return popupError("LOCKED", "Энэ ажилтнаар хүсэлт/олголт бүртгэгдсэн тул устгах боломжгүй.");
  if (!confirm(`${code} ажилтан устгах уу?`)) return;

  showLoading(true);
  try {
    const r = await apiPost({ action: "delete_user", code });
    if (!r.success) return popupError("Алдаа", r.msg || "Амжилтгүй");
    await refreshData();
  } finally {
    showLoading(false);
  }
};

// Employee history
window.openEmployeeHistory = async (code, ovog, ner) => {
  showLoading(true);
  try {
    const r = await apiPost({ action: "get_user_history", code });
    if (!r.success) return popupError("Алдаа", r.msg || "Амжилтгүй");

    const hist = r.history || [];
    const rows = hist.length ? hist.map(h => `
      <div class="card" style="margin-bottom:10px">
        <div style="font-weight:900;color:#0f172a">${esc(h.item)} • Размер: ${esc(h.size)} • Тоо: ${esc(h.qty)}</div>
        <div style="margin-top:6px;color:#64748b;font-weight:800;font-size:11px">${esc(fmtDateOnly(h.date))}</div>
      </div>
    `).join("") : `<div class="card"><div style="font-weight:900;color:#0f172a">Түүх байхгүй</div></div>`;

    window.openModal(`Ажилтны ТҮҮХ • ${esc(code)} • ${esc(ovog||"")} ${esc(ner||"")}`, rows);
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------- Password ----------
window.changePassword = async () => {
  if (!currentUser) return;
  const oldP = document.getElementById("old-pass")?.value?.trim() || "";
  const newP = document.getElementById("new-pass")?.value?.trim() || "";
  const newP2 = document.getElementById("new-pass2")?.value?.trim() || "";

  if (!oldP || !newP || !newP2) return popupError("Алдаа", "Мэдээлэл дутуу");
  if (newP !== newP2) return popupError("Алдаа", "Шинэ нууц үг таарахгүй байна");

  showLoading(true);
  try {
    const r = await apiPost({ action: "change_pass", code: currentUser.code, oldP, newP });
    if (!r.success) return popupError("Алдаа", r.msg || "Амжилтгүй");

    document.getElementById("old-pass").value = "";
    document.getElementById("new-pass").value = "";
    document.getElementById("new-pass2").value = "";
    window.openModal("Амжилттай", `<div style="font-weight:900;color:#16a34a">Нууц үг солигдлоо</div>`);
  } finally {
    showLoading(false);
  }
};

// ---------- Init ----------
window.onload = async () => {
  // default shift selects
  setupEmployeeShiftOptions();
  setupEmployeeSearchShiftOptions();
};
