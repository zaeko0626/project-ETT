// ===============================
// ETT PPE System - app.js (v20260306 FIX)
// ===============================
const API_URL = "https://script.google.com/macros/s/AKfycbxjp9O5F6yMDvcrRJdFKCro-DWYoYXznKjKcx9xP459cIqRMBbyd2dOF7w7ySPOBg/exec";

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

// ---------- Escape HTML (FIXED) ----------
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  window.openModal(title || "Алдаа", `<div style="white-space:pre-wrap;font-weight:700">${esc(msg || "")}</div>`);
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

// ---------- Tabs ----------
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

  const fullName = `${currentUser.ovog || ""} ${currentUser.ner || ""}`.trim();
  if (nameEl) nameEl.textContent = fullName || "";
  if (idEl) idEl.textContent = `${currentUser.code || ""}`;
  if (roleEl) roleEl.textContent = (currentUser.type === "admin") ? "АДМИН" : (currentUser.role || "");
  if (extraEl) extraEl.textContent = `${currentUser.place || ""} • ${currentUser.department || ""} • ${currentUser.shift || ""}`.replace(/^ • | • $/g, "");
}

// ---------- API (no CORS preflight: x-www-form-urlencoded) ----------
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

function setSelectOptions(sel, values, allLabel = "Бүгд") {
  if (!sel) return;
  const v = values || [];
  let html = "";
  if (allLabel != null) html += `<option value="">${esc(allLabel)}</option>`;
  v.forEach(val => html += `<option value="${esc(val)}">${esc(val)}</option>`);
  sel.innerHTML = html;
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

  // close sidebar
  window.closeSidebar();
};

// ---------- Refresh ----------
window.refreshData = async () => {
  showLoading(true, "Өгөгдөл татаж байна...");
  try {
    const r = await apiPost({ action: "get_all_data" });
    if (!r.success) throw new Error(r.msg || "Өгөгдөл татахад алдаа гарлаа.");

    allOrders = r.orders || [];
    allItems = r.items || [];

    if (currentUser?.type === "admin") {
      const u = await apiPost({ action: "get_users" });
      if (!u.success) throw new Error(u.msg || "Users татахад алдаа");
      allEmployees = u.users || [];
    } else {
      allEmployees = [];
    }

    populateOrderItemFilter();
    populateStatusFilter();
    setupYearMonthFilters();
    setupPlaceDeptShiftFilters();
    populateRequestItemSize();
    populateItemsFilter();
    setupEmployeeShiftOptions();

    const ic = document.getElementById("items-count");
    const ec = document.getElementById("emp-count");
    if (ic) ic.textContent = `${allItems.length} items`;
    if (ec) ec.textContent = `${allEmployees.length} employees`;

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
  setSelectOptions(el, names, "Бүгд");
}

function populateStatusFilter() {
  const el = document.getElementById("filter-status");
  if (!el) return;
  // Always show 3 statuses
  const base = ["Хүлээгдэж буй", "Зөвшөөрсөн", "Татгалзсан"];
  const sts = uniq(base.concat(allOrders.map(o => o.status).filter(Boolean))).filter(Boolean);
  setSelectOptions(el, sts, "Бүгд");
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
  setSelectOptions(yearSel, yearsArr, "Бүгд");

  const monthsArr = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
  setSelectOptions(monthSel, monthsArr, "Бүгд");
}

function setupPlaceDeptShiftFilters() {
  const placeSel = document.getElementById("filter-place");
  const deptSel = document.getElementById("filter-dept");
  const shiftSel = document.getElementById("filter-shift");

  if (placeSel) setSelectOptions(placeSel, uniq(allOrders.map(o => o.place)).sort((a,b)=>String(a).localeCompare(String(b))), "Бүгд");
  if (deptSel) setSelectOptions(deptSel, uniq(allOrders.map(o => o.department)).sort((a,b)=>String(a).localeCompare(String(b))), "Бүгд");

  const shifts = uniq(SHIFT_OPTIONS.concat(allOrders.map(o => o.shift))).filter(Boolean);
  if (shiftSel) setSelectOptions(shiftSel, shifts, "Бүгд");
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

    const fullName = `${o.ovog || ""} ${o.ner || ""}`.toLowerCase();
    const mN = !nS || fullName.includes(String(nS).toLowerCase());
    const mC = !cS || String(o.code || "").includes(String(cS));
    const mR = !rS || String(o.role || "").toLowerCase().includes(String(rS).toLowerCase());

    const mI = !iF || o.item === iF;
    const mS = !sF || o.status === sF;

    const mY = !yF || (!isNaN(d) && String(d.getFullYear()) === yF);
    const mM = !mF || (!isNaN(d) && String(d.getMonth() + 1).padStart(2, "0") === mF);

    const mP = !pF || String(o.place || "") === pF;
    const mD = !dF || String(o.department || "") === dF;
    const mSh = !shF || String(o.shift || "") === shF;

    return mN && mC && mR && mI && mS && mY && mM && mP && mD && mSh;
  });

  renderOrders(filtered);
};

function renderOrders(orders) {
  const container = document.getElementById("orders-list-container");
  if (!container) return;

  if (!orders.length) {
    container.innerHTML = `<div class="card"><b>Мэдээлэл олдсонгүй</b></div>`;
    return;
  }

  container.innerHTML = orders.slice().reverse().map(o => {
    const st = statusMeta(o.status);
    const canAct = (currentUser?.type === "admin" && String(o.status || "") === "Хүлээгдэж буй");

    const empLine = `${esc(o.code)} • ${esc(o.ovog)} ${esc(o.ner)}`;
    const empSub = `${esc(o.role || "")} • ${esc(o.place || "")} • ${esc(o.department || "")} • ${esc(o.shift || "")}`.replace(/^ • | • $/g, "");

    const itemHtml = `<div class="cell-item">${esc(o.item || "")}<div class="sub">Размер: ${esc(o.size || "")}</div></div>`;
    const qtyHtml = `<div><b>${esc(o.quantity ?? 1)}</b></div>`;
    const dateHtml = `<div><b>${esc(fmtDateOnly(o.requestedDate))}</b></div>`;
    const statusHtml = `<span class="badge ${st.cls}">${st.label}</span>`;

    const actions = canAct
      ? `<div class="actions">
           <button class="pill pill-blue" onclick="setStatus('${esc(o.id)}','Зөвшөөрсөн')">ОЛГОХ</button>
           <button class="pill pill-red" onclick="setStatus('${esc(o.id)}','Татгалзсан')">ТАТГАЛЗАХ</button>
         </div>`
      : `<div class="actions"><button class="pill pill-gray" disabled>ШИЙДВЭРЛЭСЭН</button></div>`;

    return `
      <div class="row orders">
        <div class="cell-emp">${empLine}<span class="sub">${empSub}</span></div>
        <div>${itemHtml}</div>
        <div>${qtyHtml}</div>
        <div>${dateHtml}</div>
        <div>${statusHtml}</div>
        <div>${actions}</div>
      </div>
    `;
  }).join("");
}

window.setStatus = async (id, status) => {
  if (!id || !status) return;
  showLoading(true, "Төлөв шинэчилж байна...");
  try {
    const r = await apiPost({ action: "update_status", id, status });
    if (!r.success) throw new Error(r.msg || "Шинэчилж чадсангүй");
    await refreshData();
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------- Request (user) ----------
function populateRequestItemSize() {
  const itemSel = document.getElementById("req-item");
  const sizeSel = document.getElementById("req-size");
  if (!itemSel || !sizeSel) return;

  const names = uniq(allItems.map(it => it.name)).sort((a,b)=>a.localeCompare(b));
  itemSel.innerHTML = names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("");

  const updateSizes = () => {
    const chosen = itemSel.value;
    const found = allItems.find(x => x.name === chosen);
    const sizes = String(found?.sizes || "").split(",").map(s => s.trim()).filter(Boolean);
    sizeSel.innerHTML = sizes.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  };
  itemSel.onchange = updateSizes;
  updateSizes();
}

window.submitRequest = async () => {
  if (!currentUser || currentUser.type === "admin") return;
  const item = document.getElementById("req-item")?.value || "";
  const size = document.getElementById("req-size")?.value || "";
  const qty = parseInt(document.getElementById("req-qty")?.value || "1", 10) || 1;

  if (!item || !size) return popupError("Алдаа", "Бараа болон хэмжээ сонгоно уу.");

  showLoading(true, "Хүсэлт илгээж байна...");
  try {
    const r = await apiPost({ action: "add_order", code: currentUser.code, item, size, qty });
    if (!r.success) throw new Error(r.msg || "Илгээж чадсангүй");
    window.openModal("Амжилттай", `<b>Хүсэлт илгээгдлээ.</b>`);
    document.getElementById("req-qty").value = "1";
    await refreshData();
    showTab("orders", document.getElementById("nav-orders"));
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------- Items (admin) ----------
function populateItemsFilter() {
  const el = document.getElementById("items-filter");
  if (!el) return;
  const names = uniq(allItems.map(i => i.name)).sort((a,b)=>a.localeCompare(b));
  setSelectOptions(el, names, "Бүгд");
  el.onchange = () => renderItemsList();
}
window.clearItemsFilter = () => {
  const el = document.getElementById("items-filter");
  if (el) el.value = "";
  renderItemsList();
};

window.addItem = async () => {
  const name = document.getElementById("item-name")?.value?.trim() || "";
  const sizes = document.getElementById("item-sizes")?.value?.trim() || "";
  if (!name) return popupError("Алдаа", "Нэр оруулна уу!");

  showLoading(true, "Нэмэж байна...");
  try {
    const r = await apiPost({ action: "add_item", name, sizes });
    if (!r.success) throw new Error(r.msg || "Нэмэхэд алдаа");
    document.getElementById("item-name").value = "";
    document.getElementById("item-sizes").value = "";
    await refreshData();
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

function renderItemsList() {
  const list = document.getElementById("items-list");
  if (!list) return;

  const f = document.getElementById("items-filter")?.value || "";
  const items = (!f ? allItems : allItems.filter(x => x.name === f));

  if (!items.length) {
    list.innerHTML = `<div class="card"><b>Бараа байхгүй</b></div>`;
    return;
  }

  list.innerHTML = items.map((it, idx) => {
    const locked = !!it.locked;
    return `
      <div class="row items">
        <div><b>${idx + 1}</b></div>
        <div><b>${esc(it.name)}</b></div>
        <div>${esc(it.sizes || "")}</div>
        <div class="actions">
          <button class="pill pill-gray" ${locked ? "disabled" : ""} onclick="editItemPrompt('${esc(it.name)}','${esc(it.sizes || "")}',${locked})">ЗАСАХ</button>
          <button class="pill pill-blue" onclick="viewItemHistory('${esc(it.name)}')">ТҮҮХ</button>
          <button class="pill pill-red" ${locked ? "disabled" : ""} onclick="deleteItem('${esc(it.name)}',${locked})">УСТГАХ</button>
        </div>
      </div>
    `;
  }).join("");
}

window.editItemPrompt = (name, sizes, locked) => {
  if (locked) return popupError("Анхаар", "Энэ бараагаар хүсэлт бүртгэгдсэн тул засах боломжгүй.");
  const html = `
    <div class="field">
      <div class="filter-label">Бараа</div>
      <input id="edit-item-name" class="input" value="${esc(name)}" />
    </div>
    <div class="field" style="margin-top:10px">
      <div class="filter-label">Размерууд</div>
      <input id="edit-item-sizes" class="input" value="${esc(sizes)}" />
    </div>
    <div style="margin-top:12px;display:flex;justify-content:flex-end">
      <button class="btn btn-primary" onclick="saveItemEdit('${esc(name)}')">ХАДГАЛАХ</button>
    </div>
  `;
  openModal("Бараа засах", html);
};

window.saveItemEdit = async (oldName) => {
  const newName = document.getElementById("edit-item-name")?.value?.trim() || "";
  const sizes = document.getElementById("edit-item-sizes")?.value?.trim() || "";
  if (!newName) return popupError("Алдаа", "Нэр хоосон байж болохгүй");

  showLoading(true, "Хадгалж байна...");
  try {
    const r = await apiPost({ action: "update_item", oldName, newName, sizes });
    if (!r.success) throw new Error(r.msg || "Хадгалж чадсангүй");
    closeModal();
    await refreshData();
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.deleteItem = async (name, locked) => {
  if (locked) return popupError("Анхаар", "Энэ бараагаар хүсэлт/олголт бүртгэгдсэн тул устгах боломжгүй.");
  if (!confirm(`"${name}" барааг устгах уу?`)) return;

  showLoading(true, "Устгаж байна...");
  try {
    const r = await apiPost({ action: "delete_item", name });
    if (!r.success) throw new Error(r.msg || "Устгаж чадсангүй");
    await refreshData();
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.viewItemHistory = async (item) => {
  showLoading(true, "Түүх татаж байна...");
  try {
    const r = await apiPost({ action: "get_item_history", item });
    if (!r.success) throw new Error(r.msg || "Түүх татахад алдаа");

    const rows = (r.history || []);
    const html = rows.length
      ? `<div class="card">${rows.map(h => `
          <div style="padding:10px;border-bottom:1px solid #e2e8f0">
            <b>${esc(h.code)} • ${esc(h.ovog)} ${esc(h.ner)}</b><br/>
            ${esc(h.item || item)} • Размер: <b>${esc(h.size)}</b> • Тоо: <b>${esc(h.qty)}</b><br/>
            <span style="color:#64748b;font-weight:700">${esc(fmtDateOnly(h.date))}</span>
          </div>
        `).join("")}</div>`
      : `<div class="card"><b>Түүх байхгүй</b></div>`;

    openModal("Олголтын түүх", html);
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------- Employees (admin) ----------
function setupEmployeeShiftOptions() {
  const sel = document.getElementById("emp-shift");
  if (!sel) return;
  sel.innerHTML = SHIFT_OPTIONS.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
}

window.addEmployee = async () => {
  const code = document.getElementById("emp-code")?.value?.trim() || "";
  const pass = document.getElementById("emp-pass")?.value?.trim() || "";
  const ovog = document.getElementById("emp-ovog")?.value?.trim() || "";
  const ner  = document.getElementById("emp-ner")?.value?.trim() || "";
  const role = document.getElementById("emp-role")?.value?.trim() || "";
  const place= document.getElementById("emp-place")?.value?.trim() || "";
  const department = document.getElementById("emp-dept")?.value?.trim() || "";
  const shift = document.getElementById("emp-shift")?.value?.trim() || "";

  if (!code || !ner) return popupError("Алдаа", "Код болон нэр заавал.");

  showLoading(true, "Ажилтан нэмэж байна...");
  try {
    const r = await apiPost({ action: "add_user", code, pass, ner, ovog, role, place, department, shift });
    if (!r.success) throw new Error(r.msg || "Нэмэхэд алдаа");

    ["emp-code","emp-pass","emp-ovog","emp-ner","emp-role","emp-place","emp-dept"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    await refreshData();
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

function renderEmployeesList() {
  const list = document.getElementById("employees-list");
  if (!list) return;

  if (!allEmployees.length) {
    list.innerHTML = `<div class="card"><b>Ажилтан байхгүй</b></div>`;
    return;
  }

  list.innerHTML = allEmployees.map((u, idx) => {
    const left = `
      <b>${esc(u.code)}</b> • ${esc(u.ovog)} ${esc(u.ner)}<br/>
      <span style="color:#64748b;font-weight:800">
        ${esc(u.role || "")} • ${esc(u.place || "")} • ${esc(u.department || "")} • ${esc(u.shift || "")}
      </span>
    `;

    return `
      <div class="row" style="grid-template-columns: 60px 1fr 1fr; align-items:center">
        <div><b>${idx + 1}</b></div>
        <div>${left}</div>
        <div class="actions">
          <button class="pill pill-gray" ${u.locked ? "disabled" : ""} onclick="editEmployeePrompt('${esc(u.code)}', ${JSON.stringify(u).replace(/</g,"\\u003c")})">ЗАСАХ</button>
          <button class="pill pill-blue" onclick="viewUserHistory('${esc(u.code)}')">ТҮҮХ</button>
          <button class="pill pill-red" ${u.locked ? "disabled" : ""} onclick="deleteEmployee('${esc(u.code)}', ${u.locked ? "true":"false"})">УСТГАХ</button>
        </div>
      </div>
    `;
  }).join("");
}

window.editEmployeePrompt = (code, u) => {
  if (!u) return;
  if (u.locked) return popupError("Анхаар", "Энэ ажилтнаар хүсэлт/олголт бүртгэгдсэн тул засах боломжгүй гэж тохируулсан.");

  const html = `
    <div class="field"><div class="filter-label">Код</div><input class="input" value="${esc(code)}" disabled /></div>

    <div class="form-grid" style="margin-top:10px">
      <div class="field"><div class="filter-label">Нууц үг (хоосон бол өөрчлөхгүй)</div><input id="e-pass" class="input" placeholder="(хоосон)" /></div>
      <div class="field"><div class="filter-label">Овог</div><input id="e-ovog" class="input" value="${esc(u.ovog||"")}" /></div>
      <div class="field"><div class="filter-label">Нэр</div><input id="e-ner" class="input" value="${esc(u.ner||"")}" /></div>
      <div class="field"><div class="filter-label">Албан тушаал</div><input id="e-role" class="input" value="${esc(u.role||"")}" /></div>
      <div class="field"><div class="filter-label">Газар</div><input id="e-place" class="input" value="${esc(u.place||"")}" /></div>
      <div class="field"><div class="filter-label">Хэлтэс</div><input id="e-dept" class="input" value="${esc(u.department||"")}" /></div>
      <div class="field"><div class="filter-label">Ээлж</div>
        <select id="e-shift" class="select">
          ${SHIFT_OPTIONS.map(s => `<option value="${esc(s)}" ${String(u.shift||"")===s?"selected":""}>${esc(s)}</option>`).join("")}
        </select>
      </div>
    </div>

    <div style="margin-top:12px;display:flex;justify-content:flex-end">
      <button class="btn btn-primary" onclick="saveEmployeeEdit('${esc(code)}')">ХАДГАЛАХ</button>
    </div>
  `;
  openModal("Ажилтан засах", html);
};

window.saveEmployeeEdit = async (code) => {
  const pass = document.getElementById("e-pass")?.value?.trim() || "";
  const ovog = document.getElementById("e-ovog")?.value?.trim() || "";
  const ner  = document.getElementById("e-ner")?.value?.trim() || "";
  const role = document.getElementById("e-role")?.value?.trim() || "";
  const place= document.getElementById("e-place")?.value?.trim() || "";
  const department = document.getElementById("e-dept")?.value?.trim() || "";
  const shift = document.getElementById("e-shift")?.value?.trim() || "";

  if (!ner) return popupError("Алдаа", "Нэр хоосон байж болохгүй");

  showLoading(true, "Хадгалж байна...");
  try {
    const r = await apiPost({ action: "update_user", code, pass, ner, ovog, role, place, department, shift });
    if (!r.success) throw new Error(r.msg || "Хадгалж чадсангүй");
    closeModal();
    await refreshData();
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.deleteEmployee = async (code, locked) => {
  if (locked) return popupError("Анхаар", "Энэ ажилтнаар хүсэлт/олголт бүртгэгдсэн тул устгах боломжгүй.");
  if (!confirm(`"${code}" ажилтныг устгах уу?`)) return;

  showLoading(true, "Устгаж байна...");
  try {
    const r = await apiPost({ action: "delete_user", code });
    if (!r.success) throw new Error(r.msg || "Устгаж чадсангүй");
    await refreshData();
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// NOTE: Backend-д "get_user_history" байхгүй бол Unknown action гарна.
// Энэ үед Code.gs дээр action нэмэх хэрэгтэй.
window.viewUserHistory = async (code) => {
  showLoading(true, "Түүх татаж байна...");
  try {
    const r = await apiPost({ action: "get_user_history", code });
    if (!r.success) throw new Error(r.msg || "Түүх татахад алдаа");

    const rows = (r.history || []);
    const html = rows.length
      ? `<div class="card">${rows.map(h => `
          <div style="padding:10px;border-bottom:1px solid #e2e8f0">
            <b>${esc(h.item)} • Размер: ${esc(h.size)} • Тоо: ${esc(h.qty)}</b><br/>
            <span style="color:#64748b;font-weight:800">${esc(fmtDateOnly(h.date))}</span>
          </div>
        `).join("")}</div>`
      : `<div class="card"><b>Түүх байхгүй</b></div>`;

    openModal("Ажилтны олголтын түүх", html);
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------- Password ----------
window.changePassword = async () => {
  if (!currentUser) return;
  const oldP = document.getElementById("pass-old")?.value?.trim() || "";
  const newP = document.getElementById("pass-new")?.value?.trim() || "";
  if (!oldP || !newP) return popupError("Алдаа", "Хоёуланг нь бөглөнө үү.");

  showLoading(true, "Хадгалж байна...");
  try {
    const r = await apiPost({ action: "change_pass", code: currentUser.code, oldP, newP });
    if (!r.success) throw new Error(r.msg || "Хадгалж чадсангүй");
    window.openModal("Амжилттай", `<b>Нууц үг шинэчлэгдлээ.</b>`);
    document.getElementById("pass-old").value = "";
    document.getElementById("pass-new").value = "";
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------- Init ----------
window.onload = () => {
  // ALWAYS start at login screen
  document.getElementById("login-screen")?.classList.remove("hidden");
  document.getElementById("main-screen")?.classList.add("hidden");
  document.getElementById("sidebar")?.classList.remove("open");
  document.getElementById("sidebar-overlay")?.classList.remove("show");

  document.getElementById("login-pass")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") window.login();
  });

  setupEmployeeShiftOptions();

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
};
  // Enter to login
  document.getElementById("login-pass")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") window.login();
  });

  // Default select options
  setupEmployeeShiftOptions();

  // Close modal with Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
};
