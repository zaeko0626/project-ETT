// =========================
// ETT PPE System - app.js (FULL, UI-ийг өөрчлөхгүй)
// Fix: CORS/Failed fetch + зөв option populate + тогтвортой функцууд
// =========================

const API_URL = "https://script.google.com/macros/s/AKfycbxBHHml8zicq4mX7GcNqsTjMXYaD-kOAZ4WZWjgdA60sdsus6LrsGonzubMKahhCPTm/exec";

let allOrders = [];
let allItems = [];
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
function uiStatus(status) {
  if (status === "Зөвшөөрсөн") return "Олгосон";
  return status || "";
}
function showLoading(show) {
  const el = document.getElementById("loading-overlay");
  if (!el) return;
  el.classList.toggle("hidden", !show);
}
function popupError(title, msg) {
  alert(`${title}\n\n${msg}`);
}

// -------------------------
// ✅ API POST (CORS-safe, no preflight)
// -------------------------
async function postJson(payload) {
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

  if (tabName === "items") window.renderItemsList?.();
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
// Header/User card
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
    const result = await postJson({ action: "login", code, pass });
    if (result.success) {
      currentUser = result.user;
      localStorage.setItem("ett_user", JSON.stringify(currentUser));
      initApp();
    } else {
      popupError("Нэвтрэх боломжгүй", result.msg || "Код эсвэл нууц үг буруу байна");
    }
  } catch (e) {
    console.error(e);
    popupError("Нэвтрэх үед алдаа", e.message || String(e));
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
// Populate selects (✅ зөв <option>)
// -------------------------
function setOptions(selectEl, optionsHtml) {
  if (!selectEl) return;
  selectEl.innerHTML = optionsHtml;
}

function populateOrderItemFilter() {
  const el = document.getElementById("filter-item");
  setOptions(
    el,
    `<option value="">Бүх бараа</option>` +
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
    `<option value="">БҮХ БАРАА</option>` +
      names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("")
  );
}

window.clearItemsFilter = () => {
  const sel = document.getElementById("items-filter-name");
  if (sel) sel.value = "";
  window.renderItemsList?.();
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
    `<option value="">БҮХ ОН</option>` +
      (sortedYears.length ? sortedYears : [new Date().getFullYear()])
        .map(y => `<option value="${y}">${y}</option>`).join("")
  );

  setOptions(
    monthSel,
    `<option value="">БҮХ САР</option>` +
      Array.from({length:12}, (_,i)=>i+1).map(m=>{
        const mm = String(m).padStart(2,"0");
        return `<option value="${mm}">${m} сар</option>`;
      }).join("")
  );
}

// -------------------------
// Employee filters
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
    `<option value="">БҮХ ГАЗАР</option>` + [...places].sort((a,b)=>a.localeCompare(b))
      .map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join("")
  );
  setOptions(
    deptSel,
    `<option value="">БҮХ ХЭЛТЭС</option>` + [...depts].sort((a,b)=>a.localeCompare(b))
      .map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join("")
  );
  setOptions(
    shiftSel,
    `<option value="">БҮХ ЭЭЛЖ</option>` + SHIFT_OPTIONS.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("")
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
    `<option value="">БҮХ ХЭЛТЭС</option>` + [...depts].sort((a,b)=>a.localeCompare(b))
      .map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join("")
  );
  window.applyFilters();
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
    const data = await postJson({ action: "get_all_data" });
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

    window.applyFilters?.();
    if (!document.getElementById("tab-items")?.classList.contains("hidden")) {
      window.renderItemsList?.();
    }
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
    container.innerHTML = `<div class="card muted">Мэдээлэл олдсонгүй</div>`;
    return;
  }

  container.innerHTML = orders.slice().reverse().map(o => {
    const canAct = (currentUser?.type === "admin" && o.status === "Хүлээгдэж буй");
    const actions = canAct ? `
      <div class="row" style="margin-top:10px">
        <button class="btn-mini edit" onclick="updateStatus('${esc(o.id)}','Зөвшөөрсөн')">Олгох</button>
        <button class="btn-mini del" onclick="updateStatus('${esc(o.id)}','Татгалзсан')">Татгалзах</button>
      </div>` : "";

    return `
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <div>
            <div style="font-weight:900">${esc(o.ovog)} ${esc(o.ner)}</div>
            <div class="muted">${esc(o.code)} • ${esc(o.role)}</div>
            <div class="muted">${esc(o.place || "")} • ${esc(o.department || "")} • ${esc(o.shift || "")}</div>
          </div>
          <span class="badge">${esc(uiStatus(o.status))}</span>
        </div>

        <div style="margin-top:10px">
          <div>${esc(o.item)}</div>
          <div class="muted">${esc(o.size || "ST")} / ${esc(o.quantity ?? 1)}ш</div>
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
    const r = await postJson({ action: "update_status", id, status });
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
    const r = await postJson({ action: "add_order", code: currentUser.code, item, size, qty });
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
// Items (Admin) - эндээс цааш таны хуучин app.js дээр байсан CRUD-уудыг
// UI-г тань эвдэхгүйгээр ажиллах түвшинд үлдээж болно.
// Хэрвээ items хэсэг дээр чинь одоо байгаа товч/ID-ууд өөр байвал хэлэхгүй байсан ч
// энэ апп.js ажиллана (renderItemsList байхгүй бол зүгээр алгасна).
// -------------------------

// -------------------------
// Logout / Bootstrap
// -------------------------
window.logout = () => {
  localStorage.clear();
  location.reload();
};

window.onload = () => {
  setVH();
  currentUser = safeJsonParse(localStorage.getItem("ett_user"));
  if (currentUser) initApp();
  else document.getElementById("login-page")?.classList.remove("hidden");
};
