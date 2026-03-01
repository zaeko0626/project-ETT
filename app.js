// =========================
// ETT PPE System - app.js
// Changes:
// 1) Sidebar-аас "дахин ачаалах" устгасан -> Tab бүрийн дээд талд Refresh товч
// 2) Logout button sidebar bottom (red box) -> index+css дээр
// 3) Items add icon өөрчилсөн; Item history -> тусдаа popup window (window.open)
// 4) Orders filter layout 3 rows -> index+css дээр
// 5) Employees tab (Admin) -> Users CRUD (Apps Script backend хэрэгтэй)
// =========================

const API_URL = "https://script.google.com/macros/s/AKfycbxBHHml8zicq4mX7GcNqsTjMXYaD-kOAZ4WZWjgdA60sdsus6LrsGonzubMKahhCPTm/exec";

let allOrders = [];
let allItems = [];
let allEmployees = []; // admin only
let currentUser = null;

// ---- VH fix ----
function setVH() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty("--vh", `${vh}px`);
}
window.addEventListener("resize", setVH);
window.addEventListener("orientationchange", () => setTimeout(setVH, 200));

// ---- Helpers ----
function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}
function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function showLoading(show) {
  const el = document.getElementById("loading-overlay");
  if (!el) return;
  el.classList.toggle("hidden", !show);
}
function popupError(title, msg) {
  alert(`${title}\n\n${msg}`);
}
function uiStatus(status) {
  if (status === "Зөвшөөрсөн") return "Олгосон";
  return status || "";
}
function fmtDateTime(v) {
  try {
    const d = new Date(v);
    return isNaN(d) ? "" : d.toLocaleString();
  } catch { return ""; }
}

// -------------------------
// ✅ API POST (CORS-safe, no preflight)
// -------------------------
async function apiPost(payload) {
  const body = new URLSearchParams();
  Object.entries(payload || {}).forEach(([k, v]) => body.append(k, v == null ? "" : String(v)));

  let res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      body,
      redirect: "follow",
      cache: "no-store",
    });
  } catch (err) {
    throw new Error("FETCH_ERROR: " + (err?.message || String(err)));
  }

  let text = "";
  try {
    text = await res.text();
  } catch (err) {
    throw new Error("READ_ERROR: " + (err?.message || String(err)));
  }

  if (!res.ok) {
    throw new Error(`HTTP_${res.status}: ${text.slice(0, 250)}`);
  }

  const json = safeJsonParse(text);
  if (!json) {
    console.error("API non-JSON:", text);
    throw new Error("JSON_PARSE_ERROR: " + text.slice(0, 250));
  }
  return json;
}

// -------------------------
// Sidebar
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
  document.querySelectorAll(".tab-content").forEach(t => t.classList.add("hidden"));
  document.getElementById("tab-" + tabName)?.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");

  setTimeout(setVH, 0);
  if (window.innerWidth < 1024) window.closeSidebar();

  if (tabName === "items") renderItemsList();
  if (tabName === "employees") renderEmployeesList();
};

// -------------------------
// Modal
// -------------------------
window.openModal = (title, html) => {
  document.getElementById("modal-title").innerText = title || "";
  document.getElementById("modal-body").innerHTML = html || "";
  document.getElementById("modal-overlay").classList.remove("hidden");
};
window.closeModal = () => {
  document.getElementById("modal-overlay").classList.add("hidden");
  document.getElementById("modal-body").innerHTML = "";
};

// -------------------------
// User card
// -------------------------
function updateHeaderSubtitle() {
  const el = document.getElementById("user-display-name");
  if (!el) return;
  if (currentUser && currentUser.type === "admin") {
    el.classList.remove("hidden");
    el.innerText = "АДМИНИСТРАТОР";
  } else {
    el.classList.add("hidden");
    el.innerText = "";
  }
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

  const parts = [];
  if (currentUser.place) parts.push(`Газар: ${currentUser.place}`);
  if (currentUser.department) parts.push(`Хэлтэс: ${currentUser.department}`);
  if (currentUser.shift) parts.push(`Ээлж: ${currentUser.shift}`);
  extraEl.innerText = parts.join(" • ");
}

// -------------------------
// Login
// -------------------------
window.handleLogin = async () => {
  const code = document.getElementById("login-user")?.value?.trim() || "";
  const pass = document.getElementById("login-pass")?.value?.trim() || "";
  if (!code || !pass) return popupError("Алдаа", "Код, нууц үгээ оруулна уу!");

  showLoading(true);
  try {
    const result = await apiPost({ action: "login", code, pass });
    if (result.success) {
      currentUser = result.user;
      localStorage.setItem("ett_user", JSON.stringify(currentUser));
      initApp();
    } else {
      popupError("Нэвтрэх боломжгүй", result.msg || "Код эсвэл нууц үг буруу");
    }
  } catch (e) {
    console.error(e);
    popupError("Login error", e.message || String(e));
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
  document.getElementById("nav-employees")?.classList.toggle("hidden", !isAdmin);
  document.getElementById("nav-profile")?.classList.toggle("hidden", isAdmin);

  refreshData();
  setTimeout(setVH, 0);
}

window.logout = () => {
  localStorage.clear();
  location.reload();
};

// -------------------------
// Populate selects (correct <option>)
// -------------------------
function setOptions(selectEl, optionsHtml) {
  if (!selectEl) return;
  selectEl.innerHTML = optionsHtml;
}

function populateOrderItemFilter() {
  const el = document.getElementById("filter-item");
  setOptions(
    el,
    `<option value="">Бүгд</option>` +
      allItems.map(it => `<option value="${esc(it.name)}">${esc(it.name)}</option>`).join("")
  );
}

function populateRequestItemSelect() {
  const el = document.getElementById("req-item");
  setOptions(
    el,
    `<option value="">Сонгох...</option>` +
      allItems.map(it => `<option value="${esc(it.name)}">${esc(it.name)}</option>`).join("")
  );
}

function setupItemsNameFilter() {
  const sel = document.getElementById("items-filter-name");
  if (!sel) return;
  const names = allItems.map(i => i.name).filter(Boolean).sort((a,b)=>a.localeCompare(b));
  setOptions(
    sel,
    `<option value="">Бүгд</option>` +
      names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("")
  );
}

window.clearItemsFilter = () => {
  const sel = document.getElementById("items-filter-name");
  if (sel) sel.value = "";
  renderItemsList();
};

// -------------------------
// Order date filters
// -------------------------
function setupOrderFilters() {
  const yearSel = document.getElementById("filter-year");
  const monthSel = document.getElementById("filter-month");
  if (!yearSel || !monthSel) return;

  const years = new Set();
  allOrders.forEach(o => {
    const d = new Date(o.requestedDate);
    if (!isNaN(d)) years.add(d.getFullYear());
  });
  const sortedYears = [...years].sort((a,b)=>a-b);

  setOptions(
    yearSel,
    `<option value="">Бүгд</option>` +
      (sortedYears.length ? sortedYears : [new Date().getFullYear()])
        .map(y => `<option value="${y}">${y}</option>`).join("")
  );

  setOptions(
    monthSel,
    `<option value="">Бүгд</option>` +
      Array.from({length:12}, (_,i)=>i+1).map(m=>{
        const mm = String(m).padStart(2,"0");
        return `<option value="${mm}">${m} сар</option>`;
      }).join("")
  );
}

// -------------------------
// Employee filters (from orders data)
// -------------------------
const SHIFT_OPTIONS = ["А ээлж","Б ээлж","В ээлж","Г ээлж","Төв оффис","Бусад"];

function setupEmployeeFilters() {
  const placeSel = document.getElementById("filter-place");
  const deptSel = document.getElementById("filter-dept");
  const shiftSel = document.getElementById("filter-shift");
  if (!placeSel || !deptSel || !shiftSel) return;

  const places = new Set();
  const depts = new Set();
  allOrders.forEach(o => {
    if (o.place) places.add(o.place);
    if (o.department) depts.add(o.department);
  });

  setOptions(
    placeSel,
    `<option value="">Бүгд</option>` + [...places].sort((a,b)=>a.localeCompare(b))
      .map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join("")
  );
  setOptions(
    deptSel,
    `<option value="">Бүгд</option>` + [...depts].sort((a,b)=>a.localeCompare(b))
      .map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join("")
  );
  setOptions(
    shiftSel,
    `<option value="">Бүгд</option>` + SHIFT_OPTIONS.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("")
  );
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

  setOptions(
    deptSel,
    `<option value="">Бүгд</option>` + [...depts].sort((a,b)=>a.localeCompare(b))
      .map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join("")
  );
  applyFilters();
};

// -------------------------
// Request size options
// -------------------------
window.updateSizeOptions = () => {
  const name = document.getElementById("req-item")?.value || "";
  const select = document.getElementById("req-size");
  if (!select) return;

  if (!name) {
    setOptions(select, `<option value="">Сонгох...</option>`);
    return;
  }

  const item = allItems.find(i => i.name === name);
  const sizes = (item?.sizes || "").split(",").map(s=>s.trim()).filter(Boolean);

  setOptions(
    select,
    sizes.length
      ? sizes.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("")
      : `<option value="Стандарт">Стандарт</option>`
  );
};

// -------------------------
// Data refresh
// -------------------------
window.refreshData = async () => {
  showLoading(true);
  try {
    // orders + items
    const data = await apiPost({ action: "get_all_data" });
    if (data.success === false) {
      popupError("Өгөгдөл татахад алдаа гарлаа.", data.msg || "Unknown");
      return;
    }

    allOrders = data.orders || [];
    allItems = data.items || [];

    populateOrderItemFilter();
    populateRequestItemSelect();
    window.updateSizeOptions();

    setupOrderFilters();
    setupEmployeeFilters();
    setupItemsNameFilter();

    const cnt = document.getElementById("items-count");
    if (cnt) cnt.innerText = `${allItems.length} бараа`;

    // employees (admin only)
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
    popupError("Өгөгдөл татахад алдаа гарлаа.", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// -------------------------
// Orders filter + render
// -------------------------
window.clearOrderFilters = () => {
  const ids = [
    "filter-status","filter-item","filter-year","filter-month",
    "filter-place","filter-dept","filter-shift",
    "search-name","search-code","search-role"
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === "SELECT") el.value = "";
    else el.value = "";
  });
  // place change -> dept reset
  setupEmployeeFilters();
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
    container.innerHTML = `<div class="card muted animate-fade-in">Мэдээлэл олдсонгүй</div>`;
    return;
  }

  container.innerHTML = orders.slice().reverse().map(o => {
    const canAct = (currentUser?.type === "admin" && o.status === "Хүлээгдэж буй");
    const actions = canAct ? `
      <div class="items-actions" style="justify-content:flex-start;margin-top:10px">
        <button class="btn-mini edit" onclick="updateStatus('${esc(o.id)}','Зөвшөөрсөн')">Олгох</button>
        <button class="btn-mini del" onclick="updateStatus('${esc(o.id)}','Татгалзсан')">Татгалзах</button>
      </div>` : "";

    return `
      <div class="card animate-fade-in">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
          <div style="min-width:0">
            <div style="font-weight:900;color:#0f172a">${esc(o.ovog)} ${esc(o.ner)}</div>
            <div style="margin-top:6px;font-size:11px;font-weight:800;color:#64748b">
              ${esc(o.code)} • ${esc(o.role || "")}
            </div>
            <div style="margin-top:6px;font-size:10px;font-weight:800;color:#94a3b8">
              ${esc(o.place || "")} • ${esc(o.department || "")} • ${esc(o.shift || "")}
            </div>
          </div>
          <span class="badge" style="background:#e2e8f0;color:#0f172a">${esc(uiStatus(o.status))}</span>
        </div>

        <div style="margin-top:12px;font-weight:900;color:#0f172a">${esc(o.item)}</div>
        <div style="margin-top:6px;font-size:11px;font-weight:800;color:#64748b">
          Размер: ${esc(o.size || "ST")} • Тоо: ${esc(o.quantity ?? 1)} • ${esc(fmtDateTime(o.requestedDate))}
        </div>

        ${actions}
      </div>
    `;
  }).join("");
}

// -------------------------
// Admin status update
// -------------------------
window.updateStatus = async (id, status) => {
  showLoading(true);
  try {
    const r = await apiPost({ action: "update_status", id, status });
    if (!r.success) popupError("Алдаа", r.msg || "Status update error");
    await window.refreshData();
  } catch (e) {
    console.error(e);
    popupError("update_status error", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// -------------------------
// Submit request
// -------------------------
window.submitRequest = async () => {
  const item = document.getElementById("req-item")?.value || "";
  const size = document.getElementById("req-size")?.value || "";
  const qty = document.getElementById("req-qty")?.value || 1;

  if (!item || !size) return popupError("Алдаа", "Бараа/Размер сонгоно уу!");

  showLoading(true);
  try {
    const r = await apiPost({ action: "add_order", code: currentUser.code, item, size, qty });
    if (r.success) {
      alert("Хүсэлт илгээгдлээ!");
      await window.refreshData();
    } else {
      popupError("Алдаа", r.msg || "Request error");
    }
  } catch (e) {
    console.error(e);
    popupError("add_order error", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// -------------------------
// Items (Admin) CRUD + History (popup window)
// -------------------------
window.renderItemsList = renderItemsList;
function renderItemsList() {
  const container = document.getElementById("items-list-container");
  if (!container) return;

  const selName = document.getElementById("items-filter-name")?.value || "";
  const list = allItems.filter(it => !selName || it.name === selName);

  if (!list.length) {
    container.innerHTML = `<div class="card animate-fade-in">Бараа олдсонгүй</div>`;
    return;
  }

  const head = `
    <div class="items-head animate-fade-in">
      <div>#</div>
      <div>Бараа</div>
      <div>Размер</div>
      <div style="text-align:right">Үйлдэл</div>
    </div>
  `;

  const rows = list.map((it, idx) => {
    const sizes = (it.sizes || "").split(",").map(s=>s.trim()).filter(Boolean);
    const sizeHtml = sizes.length
      ? sizes.map(s => `<span class="sz">${esc(s)}</span>`).join("")
      : `<span class="sz">ST</span>`;

    const locked = !!it.locked;
    const lockTitle = "Энэ бараагаар хүсэлт/олголт бүртгэгдсэн тул засах/устгах боломжгүй.";

    const editBtn = locked
      ? `<button class="btn-mini edit disabled" disabled title="${esc(lockTitle)}">Засах</button>`
      : `<button class="btn-mini edit" onclick="openEditItem('${esc(it.name)}','${esc(it.sizes || "")}')">Засах</button>`;

    const delBtn = locked
      ? `<button class="btn-mini del disabled" disabled title="${esc(lockTitle)}">Устгах</button>`
      : `<button class="btn-mini del" onclick="deleteItem('${esc(it.name)}')">Устгах</button>`;

    const histBtn = `<button class="btn-mini hist" onclick="openItemHistoryPopup('${esc(it.name)}')">Түүх</button>`;

    return `
      <div class="items-row animate-fade-in">
        <div class="items-no">${idx + 1}</div>
        <div class="items-name">${esc(it.name)}</div>
        <div class="items-sizes">${sizeHtml}</div>
        <div class="items-actions">${editBtn}${histBtn}${delBtn}</div>
      </div>
    `;
  }).join("");

  container.innerHTML = head + rows;
}

window.addItem = async () => {
  const name = document.getElementById("new-item-name")?.value?.trim() || "";
  const sizes = document.getElementById("new-item-sizes")?.value?.trim() || "";
  if (!name) return popupError("Алдаа", "Нэр оруулна уу!");

  showLoading(true);
  try {
    const r = await apiPost({ action: "add_item", name, sizes });
    if (!r.success) return popupError("Алдаа", r.msg || "Бараа нэмэхэд алдаа");

    document.getElementById("new-item-name").value = "";
    document.getElementById("new-item-sizes").value = "";
    await window.refreshData();
  } catch (e) {
    console.error(e);
    popupError("add_item error", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.openEditItem = (oldName, sizes) => {
  const html = `
    <div class="card" style="border:none;box-shadow:none;padding:0">
      <div class="filter-label">Барааны нэр</div>
      <input id="edit-item-name" value="${esc(oldName)}" />
      <div style="height:10px"></div>
      <div class="filter-label">Размерууд (таслалаар)</div>
      <input id="edit-item-sizes" value="${esc(sizes || "")}" />
      <div style="height:12px"></div>
      <button class="btn-primary" onclick="saveEditItem('${esc(oldName)}')">Хадгалах</button>
    </div>
  `;
  window.openModal("Бараа засах", html);
};

window.saveEditItem = async (oldName) => {
  const newName = document.getElementById("edit-item-name")?.value?.trim() || "";
  const sizes = document.getElementById("edit-item-sizes")?.value?.trim() || "";
  if (!newName) return popupError("Алдаа", "Нэр хоосон байна!");

  showLoading(true);
  try {
    const r = await apiPost({ action: "update_item", oldName, newName, sizes });
    if (!r.success) return popupError("Алдаа", r.msg || "Бараа засахад алдаа");

    window.closeModal();
    await window.refreshData();
  } catch (e) {
    console.error(e);
    popupError("update_item error", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.deleteItem = async (name) => {
  if (!confirm(`"${name}" барааг устгах уу?`)) return;

  showLoading(true);
  try {
    const r = await apiPost({ action: "delete_item", name });
    if (!r.success) return popupError("Алдаа", r.msg || "Устгахад алдаа");

    await window.refreshData();
  } catch (e) {
    console.error(e);
    popupError("delete_item error", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ✅ History -> тусдаа popup window
window.openItemHistoryPopup = async (itemName) => {
  showLoading(true);
  try {
    const r = await apiPost({ action: "get_item_history", item: itemName });
    if (!r.success) return popupError("Алдаа", r.msg || "Түүх татахад алдаа");

    const rows = (r.history || []).slice().reverse();

    const w = window.open("", "_blank", "width=900,height=650,scrollbars=yes");
    if (!w) return popupError("Popup хаагдсан байна", "Browser popup blocker-оо allow хийнэ үү.");

    const table = rows.length ? `
      <table style="width:100%;border-collapse:collapse;font-family:Manrope,Arial,sans-serif;font-size:12px">
        <thead>
          <tr>
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
              <td style="padding:10px;border-bottom:1px solid #f1f5f9">${esc(fmtDateTime(h.date))}</td>
              <td style="padding:10px;border-bottom:1px solid #f1f5f9">${esc(h.code)}</td>
              <td style="padding:10px;border-bottom:1px solid #f1f5f9">${esc(h.ovog)} ${esc(h.ner)}</td>
              <td style="padding:10px;border-bottom:1px solid #f1f5f9">${esc(h.size || "ST")}</td>
              <td style="padding:10px;border-bottom:1px solid #f1f5f9">${esc(h.qty)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    ` : `<div style="font-weight:800;color:#64748b">Олголтын түүх байхгүй</div>`;

    w.document.open();
    w.document.write(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Олголтын түүх • ${esc(itemName)}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body style="margin:0;background:#f1f5f9">
        <div style="padding:18px;background:#0f172a;color:#fff;font-family:Manrope,Arial,sans-serif">
          <div style="font-weight:900;letter-spacing:.04em">Олголтын түүх</div>
          <div style="opacity:.85;margin-top:6px">${esc(itemName)}</div>
        </div>
        <div style="padding:18px">
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:14px">
            ${table}
          </div>
        </div>
      </body>
      </html>
    `);
    w.document.close();

  } catch (e) {
    console.error(e);
    popupError("History error", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// -------------------------
// Employees (Admin) CRUD
// -------------------------
window.clearEmployeeFilter = () => {
  ["emp-search-name","emp-search-code","emp-search-dept"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  renderEmployeesList();
};

window.renderEmployeesList = renderEmployeesList;
function renderEmployeesList() {
  const container = document.getElementById("employees-list-container");
  if (!container) return;

  if (currentUser?.type !== "admin") {
    container.innerHTML = `<div class="card animate-fade-in">Admin эрх шаардлагатай.</div>`;
    return;
  }

  const nS = (document.getElementById("emp-search-name")?.value || "").toLowerCase();
  const cS = (document.getElementById("emp-search-code")?.value || "").trim();
  const dS = (document.getElementById("emp-search-dept")?.value || "").toLowerCase();

  const list = (allEmployees || []).filter(u => {
    const full = `${u.ovog || ""} ${u.ner || ""}`.toLowerCase();
    const mN = !nS || full.includes(nS);
    const mC = !cS || String(u.code || "").includes(cS);
    const mD = !dS || String(u.department || "").toLowerCase().includes(dS);
    return mN && mC && mD;
  });

  if (!list.length) {
    container.innerHTML = `<div class="card animate-fade-in">Ажилтан олдсонгүй</div>`;
    return;
  }

  const head = `
    <div class="items-head animate-fade-in" style="grid-template-columns:56px minmax(220px,1fr) minmax(260px,360px) 280px">
      <div>#</div>
      <div>Ажилтан</div>
      <div>Дэлгэрэнгүй</div>
      <div style="text-align:right">Үйлдэл</div>
    </div>
  `;

  const rows = list.map((u, idx) => {
    const locked = !!u.locked;
    const lockTitle = "Энэ ажилтан дээр захиалга/олголт бүртгэгдсэн тул устгах боломжгүй.";

    const info = [
      `Код: ${esc(u.code)}`,
      u.role ? `Role: ${esc(u.role)}` : "",
      u.place ? `Газар: ${esc(u.place)}` : "",
      u.department ? `Хэлтэс: ${esc(u.department)}` : "",
      u.shift ? `Ээлж: ${esc(u.shift)}` : ""
    ].filter(Boolean).join(" • ");

    const editBtn = `<button class="btn-mini edit" onclick="openEditEmployee('${esc(u.code)}')">Засах</button>`;
    const delBtn = locked
      ? `<button class="btn-mini del disabled" disabled title="${esc(lockTitle)}">Устгах</button>`
      : `<button class="btn-mini del" onclick="deleteEmployee('${esc(u.code)}')">Устгах</button>`;

    return `
      <div class="items-row animate-fade-in" style="grid-template-columns:56px minmax(220px,1fr) minmax(260px,360px) 280px">
        <div class="items-no">${idx + 1}</div>
        <div style="min-width:0">
          <div class="items-name" style="font-size:13px">${esc(u.ovog || "")} ${esc(u.ner || "")}</div>
          <div style="margin-top:6px;font-size:11px;font-weight:800;color:#64748b">${esc(info)}</div>
        </div>
        <div style="font-size:11px;font-weight:800;color:#0f172a">
          ${esc(u.date || "")}
        </div>
        <div class="items-actions">${editBtn}${delBtn}</div>
      </div>
    `;
  }).join("");

  container.innerHTML = head + rows;
}

window.addEmployee = async () => {
  if (currentUser?.type !== "admin") return;

  const code = document.getElementById("emp-code")?.value?.trim() || "";
  const pass = document.getElementById("emp-pass")?.value?.trim() || "12345";
  const ovog = document.getElementById("emp-ovog")?.value?.trim() || "";
  const ner = document.getElementById("emp-ner")?.value?.trim() || "";
  const role = document.getElementById("emp-role")?.value?.trim() || "";
  const place = document.getElementById("emp-place")?.value?.trim() || "";
  const department = document.getElementById("emp-dept")?.value?.trim() || "";
  const shift = document.getElementById("emp-shift")?.value?.trim() || "";

  if (!code || !ner) return popupError("Алдаа", "Код (ID) болон Нэр заавал!");

  showLoading(true);
  try {
    const r = await apiPost({ action: "add_user", code, pass, ovog, ner, role, place, department, shift });
    if (!r.success) return popupError("Алдаа", r.msg || "Ажилтан нэмэхэд алдаа");

    ["emp-code","emp-pass","emp-ovog","emp-ner","emp-role","emp-place","emp-dept","emp-shift"].forEach(id=>{
      const el = document.getElementById(id);
      if (el) el.value = "";
    });

    await window.refreshData();
  } catch (e) {
    console.error(e);
    popupError("add_user error", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.openEditEmployee = (code) => {
  const u = (allEmployees || []).find(x => String(x.code) === String(code));
  if (!u) return popupError("Алдаа", "Ажилтан олдсонгүй");

  const html = `
    <div class="card" style="border:none;box-shadow:none;padding:0">
      <div class="filter-label">Код (ID)</div>
      <input id="edit-emp-code" value="${esc(u.code)}" disabled />
      <div style="height:10px"></div>

      <div class="form-grid">
        <div>
          <div class="filter-label">Нууц үг (шинээр)</div>
          <input id="edit-emp-pass" placeholder="Хэрэв солих бол" />
        </div>
        <div>
          <div class="filter-label">Овог</div>
          <input id="edit-emp-ovog" value="${esc(u.ovog || "")}" />
        </div>
        <div>
          <div class="filter-label">Нэр</div>
          <input id="edit-emp-ner" value="${esc(u.ner || "")}" />
        </div>
        <div>
          <div class="filter-label">Role</div>
          <input id="edit-emp-role" value="${esc(u.role || "")}" />
        </div>
        <div>
          <div class="filter-label">Газар</div>
          <input id="edit-emp-place" value="${esc(u.place || "")}" />
        </div>
        <div>
          <div class="filter-label">Хэлтэс</div>
          <input id="edit-emp-dept" value="${esc(u.department || "")}" />
        </div>
        <div>
          <div class="filter-label">Ээлж</div>
          <input id="edit-emp-shift" value="${esc(u.shift || "")}" />
        </div>
      </div>

      <div style="height:12px"></div>
      <button class="btn-primary" onclick="saveEditEmployee('${esc(u.code)}')">Хадгалах</button>
    </div>
  `;
  window.openModal("Ажилтан засах", html);
};

window.saveEditEmployee = async (code) => {
  const pass = document.getElementById("edit-emp-pass")?.value?.trim() || "";
  const ovog = document.getElementById("edit-emp-ovog")?.value?.trim() || "";
  const ner = document.getElementById("edit-emp-ner")?.value?.trim() || "";
  const role = document.getElementById("edit-emp-role")?.value?.trim() || "";
  const place = document.getElementById("edit-emp-place")?.value?.trim() || "";
  const department = document.getElementById("edit-emp-dept")?.value?.trim() || "";
  const shift = document.getElementById("edit-emp-shift")?.value?.trim() || "";

  if (!ner) return popupError("Алдаа", "Нэр хоосон байж болохгүй");

  showLoading(true);
  try {
    const r = await apiPost({ action: "update_user", code, pass, ovog, ner, role, place, department, shift });
    if (!r.success) return popupError("Алдаа", r.msg || "Ажилтан засахад алдаа");

    window.closeModal();
    await window.refreshData();
  } catch (e) {
    console.error(e);
    popupError("update_user error", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.deleteEmployee = async (code) => {
  if (!confirm(`"${code}" ажилтныг устгах уу?`)) return;

  showLoading(true);
  try {
    const r = await apiPost({ action: "delete_user", code });
    if (!r.success) return popupError("Алдаа", r.msg || "Устгахад алдаа");

    await window.refreshData();
  } catch (e) {
    console.error(e);
    popupError("delete_user error", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// -------------------------
// Password
// -------------------------
window.changePassword = async () => {
  const code = currentUser?.code || "";
  const oldP = document.getElementById("old-pass")?.value?.trim() || "";
  const newP = document.getElementById("new-pass")?.value?.trim() || "";
  const conP = document.getElementById("confirm-pass")?.value?.trim() || "";
  if (!code || !oldP || !newP || !conP) return popupError("Алдаа", "Мэдээлэл дутуу");
  if (newP !== conP) return popupError("Алдаа", "Шинэ нууц үг давхцахгүй");

  showLoading(true);
  try {
    const r = await apiPost({ action: "change_pass", code, oldP, newP });
    if (!r.success) return popupError("Алдаа", r.msg || "Нууц үг солиход алдаа");
    alert("Нууц үг солигдлоо!");
    document.getElementById("old-pass").value = "";
    document.getElementById("new-pass").value = "";
    document.getElementById("confirm-pass").value = "";
  } catch (e) {
    console.error(e);
    popupError("change_pass error", e.message || String(e));
  } finally {
    showLoading(false);
  }
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
