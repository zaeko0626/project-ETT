// ===============================
// ETT PPE System - app.js (fixed)
// ===============================

const API_URL = "https://script.google.com/macros/s/AKfycbw3NGQayHJsX6fDlhm8Arh-EVzOwQAowRJpokEMoArkhElY08xl-wre1mCuYvow01hF/exec";
// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
// ЭНЭ URL-ээ зөв deploy хийсэн /exec байгаа эсэхээ шалгаарай (Web app deployment)

let allOrders = [];
let allItems = [];
let allEmployees = [];
let currentUser = null;

// Хэрвээ танайд өөр ээлжүүд байвал энэ жагсаалтыг өөрчилж болно
const SHIFT_OPTIONS = ["А ээлж", "Б ээлж", "В ээлж", "Г ээлж", "Төв оффис", "Бусад"];

// ---------- VH ----------
function setVH() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty("--vh", `${vh}px`);
}
window.addEventListener("resize", setVH);
window.addEventListener("orientationchange", () => setTimeout(setVH, 150));
setVH();

// ---------- Safe JSON ----------
function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

// ---------- Escape HTML (FIXED) ----------
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

// ---------- Modal (байхгүй бол alert fallback) ----------
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

// ---------- Status label ----------
function uiStatus(status) {
  if (status === "Зөвшөөрсөн") return "Олгосон";
  return status || "";
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

// ---------- API (CORS-safe: no JSON header, no preflight) ----------
async function apiPost(payload) {
  const body = new URLSearchParams();
  Object.entries(payload || {}).forEach(([k, v]) => body.append(k, v == null ? "" : String(v)));

  let res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      body,
      redirect: "follow",
      cache: "no-store"
    });
  } catch (err) {
    throw new Error("FETCH_ERROR: " + (err?.message || String(err)));
  }

  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP_${res.status}: ${text.slice(0, 250)}`);

  const json = safeJsonParse(text);
  if (!json) throw new Error("JSON_PARSE_ERROR: " + text.slice(0, 250));
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

// ---------- Tabs ----------
window.showTab = (tabName, btn) => {
  document.querySelectorAll(".tab-content").forEach(t => t.classList.add("hidden"));
  document.getElementById("tab-" + tabName)?.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");

  setTimeout(setVH, 0);
  if (window.innerWidth < 1024) window.closeSidebar();

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

  nameEl.innerText = `${currentUser.ovog || ""} ${currentUser.ner || ""}`.trim();
  idEl.innerText = `ID# ${currentUser.code || ""}`;
  roleEl.innerText = currentUser.role || "";
  const parts = [];
  if (currentUser.place) parts.push(`Газар: ${currentUser.place}`);
  if (currentUser.department) parts.push(`Хэлтэс: ${currentUser.department}`);
  if (currentUser.shift) parts.push(`Ээлж: ${currentUser.shift}`);
  extraEl.innerText = parts.join(" • ");
}

// ---------- Select helpers (FIXED: option tags) ----------
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
  // restore selection if possible
  if (cur && [...el.options].some(o => o.value === cur)) el.value = cur;
}

function uniq(arr) {
  return [...new Set(arr.filter(x => String(x ?? "").trim() !== ""))];
}

// ---------- Shift selects ----------
function initShiftSelects() {
  // add employee shift select
  const addSel = document.getElementById("emp-shift");
  if (addSel) setSelectOptions(addSel, ["Сонгох..."].concat(SHIFT_OPTIONS), ["", ...SHIFT_OPTIONS], null);

  // employee filter shift select
  const fSel = document.getElementById("emp-search-shift");
  if (fSel) setSelectOptions(fSel, SHIFT_OPTIONS, SHIFT_OPTIONS, "Бүгд");

  // orders filter shift select (if exists)
  const ordShift = document.getElementById("filter-shift");
  if (ordShift) setSelectOptions(ordShift, uniq(allOrders.map(o => o.shift)).sort(), null, "Бүгд");
}

// ---------- Login ----------
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
    console.error(e);
    popupError("Login error", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.logout = () => {
  localStorage.clear();
  location.reload();
};

// ---------- Init app ----------
function initApp() {
  document.getElementById("login-page")?.classList.add("hidden");
  document.getElementById("main-page")?.classList.remove("hidden");

  updateSidebarUserCard();

  const isAdmin = currentUser?.type === "admin";
  document.getElementById("nav-request")?.classList.toggle("hidden", isAdmin);
  document.getElementById("nav-items")?.classList.toggle("hidden", !isAdmin);
  document.getElementById("nav-employees")?.classList.toggle("hidden", !isAdmin);
  document.getElementById("nav-profile")?.classList.toggle("hidden", isAdmin);

  refreshData();
  setTimeout(setVH, 0);
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
    initShiftSelects();
    setupItemsNameFilter();

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
    if (!document.getElementById("tab-items")?.classList.contains("hidden")) renderItemsList();
    if (!document.getElementById("tab-employees")?.classList.contains("hidden")) renderEmployeesList();
  } catch (e) {
    console.error(e);
    popupError("Өгөгдөл татахад алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------- Orders filters ----------
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

// ---------- Orders render ----------
function renderOrders(orders) {
  const container = document.getElementById("orders-list-container");
  if (!container) return;

  if (!orders.length) {
    container.innerHTML = `
      <div class="card"><div style="font-weight:900;color:#0f172a">Мэдээлэл олдсонгүй</div></div>
    `;
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
          <div class="badge" style="background:#0f172a;color:#fff">${esc(uiStatus(o.status))}</div>
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

// ---------- Items render (таны одоогийн UI дээр байвал ажиллана) ----------
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

    return `
      <div class="items-row">
        <div class="items-no">${idx + 1}</div>
        <div class="items-name">${esc(it.name)}</div>
        <div class="items-sizes">${sizes.map(s => `<span class="sz">${esc(s)}</span>`).join("") || "-"}</div>
        <div class="items-actions">
          <button class="btn-mini hist" onclick="openItemHistory('${esc(it.name)}')">ТҮҮХ</button>
        </div>
      </div>
    `;
  }).join("");
}

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

// ---------- Employees render (admin) ----------
function renderEmployeesList() {
  const container = document.getElementById("employees-list-container");
  if (!container) return;

  if (currentUser?.type !== "admin") {
    container.innerHTML = `<div class="card"><div style="font-weight:900;color:#0f172a">Зөвхөн админ харна.</div></div>`;
    return;
  }

  if (!allEmployees.length) {
    container.innerHTML = `<div class="card"><div style="font-weight:900;color:#0f172a">Ажилтан олдсонгүй</div></div>`;
    return;
  }

  container.innerHTML = allEmployees.map(u => `
    <div class="card">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div style="font-weight:900;color:#0f172a">${esc(u.code)} • ${esc(u.ovog)} ${esc(u.ner)}</div>
        <div class="badge" style="background:#0f172a;color:#fff">${esc(u.role || "")}</div>
      </div>
      <div style="margin-top:8px;font-size:11px;font-weight:800;color:#64748b;line-height:1.4">
        ${esc(u.place || "")} • ${esc(u.department || "")} • ${esc(u.shift || "")}
      </div>
    </div>
  `).join("");
}

// ---------- Boot ----------
window.onload = () => {
  const saved = localStorage.getItem("ett_user");
  if (saved) {
    try { currentUser = JSON.parse(saved); } catch { currentUser = null; }
  }
  if (currentUser) initApp();
};
