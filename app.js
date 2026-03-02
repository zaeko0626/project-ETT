// ===============================
// ETT PPE System - app.js
// ONLY FIX: filters not working (bind events) + esc() syntax fix
// ===============================

const API_URL =
  "https://script.google.com/macros/s/AKfycbwXEsHgL33if-Q_Uym4yaW4I-xika2GgSUY5ZxglEAC8v-wDcPfpw-GxOGFvRlCoLa1/exec";

let allOrders = [];
let allItems = [];
let allEmployees = [];
let currentUser = null;

const SHIFT_OPTIONS = ["А", "Б", "Өдөр", "Шөнө"];

// ---------- VH (mobile safe area) ----------
function setVH() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty("--vh", `${vh}px`);
}
window.addEventListener("resize", setVH);
window.addEventListener("orientationchange", () => setTimeout(setVH, 150));
setVH();

// ✅ FIX 1: Escape HTML (broken байсан)
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------- Loading overlay ----------
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

// ---------- API ----------
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
  } catch (e) {
    throw new Error("Invalid JSON: " + text);
  }
  return json;
}

// ---------- Helpers ----------
function uniq(arr) {
  return Array.from(new Set((arr || []).filter((x) => x != null && x !== "")));
}

function setSelectOptions(sel, values, allLabel = "Бүгд") {
  if (!sel) return;
  const v = (values || []).filter((x) => x != null && x !== "");
  const html = [];
  if (allLabel != null) html.push(`<option value="">${esc(allLabel)}</option>`);
  v.forEach((val) => {
    const vv = String(val);
    html.push(`<option value="${esc(vv)}">${esc(vv)}</option>`);
  });
  sel.innerHTML = html.join("");
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

function isLoggedIn() {
  return !!currentUser;
}

// ---------- Auth UI visibility ----------
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

// ---------- Sidebar ----------
window.openSidebar = () => {
  if (!isLoggedIn()) return;
  document.getElementById("sidebar")?.classList.remove("hidden");
  document.getElementById("sidebar-overlay")?.classList.remove("hidden");
  document.getElementById("sidebar")?.classList.add("open");
  document.getElementById("sidebar-overlay")?.classList.add("show");
};
window.closeSidebar = () => {
  const sb = document.getElementById("sidebar");
  const ov = document.getElementById("sidebar-overlay");
  sb?.classList.remove("open");
  ov?.classList.remove("show");
};
window.toggleSidebar = () => {
  if (!isLoggedIn()) return;
  const sb = document.getElementById("sidebar");
  if (!sb) return;
  sb.classList.contains("open") ? window.closeSidebar() : window.openSidebar();
};

// ---------- Tabs ----------
window.showTab = (tabName, btn) => {
  if (!isLoggedIn()) return;

  document
    .querySelectorAll(".tab-content")
    .forEach((el) => el.classList.add("hidden"));
  document.getElementById(`tab-${tabName}`)?.classList.remove("hidden");

  document
    .querySelectorAll(".nav-btn")
    .forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");

  if (window.innerWidth < 1024) window.closeSidebar();

  if (tabName === "orders") applyFilters();
  if (tabName === "items") renderItemsList();
  if (tabName === "employees") renderEmployeesList();
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

  const fullName =
    `${currentUser.ovog || ""} ${currentUser.ner || ""}`.trim() ||
    currentUser.ner ||
    "";
  if (nameEl) nameEl.textContent = fullName || "—";
  if (idEl) idEl.textContent = currentUser.code ? `${currentUser.code}` : "";
  if (roleEl)
    roleEl.textContent =
      currentUser.type === "admin" ? "АДМИН" : currentUser.role || "";
  const extra = [currentUser.place, currentUser.department, currentUser.shift]
    .filter(Boolean)
    .join(" • ");
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

    document.getElementById("login-screen")?.classList.add("hidden");
    document.getElementById("main-screen")?.classList.remove("hidden");
    setAuthUIVisible(true);

    const isAdmin = currentUser?.type === "admin";
    document.getElementById("nav-items")?.classList.toggle("hidden", !isAdmin);
    document.getElementById("nav-employees")?.classList.toggle("hidden", !isAdmin);
    document.getElementById("nav-request")?.classList.toggle("hidden", isAdmin);

    if (isAdmin) {
      showTab("orders", document.getElementById("nav-orders"));
    } else {
      showTab("request", document.getElementById("nav-request"));
    }

    await refreshData();
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

  const lc = document.getElementById("login-code");
  const lp = document.getElementById("login-pass");
  if (lc) lc.value = "";
  if (lp) lp.value = "";

  setAuthUIVisible(false);
  window.closeSidebar();
};

// ---------- Request dropdowns ----------
function populateRequestItemSize() {
  const itemSel = document.getElementById("req-item");
  const sizeSel = document.getElementById("req-size");
  if (!itemSel || !sizeSel) return;

  const names = uniq(allItems.map((it) => it.name)).sort((a, b) =>
    String(a).localeCompare(String(b))
  );
  setSelectOptions(itemSel, names, "Сонгох...");

  function fillSizesForItem(name) {
    const found = allItems.find((x) => String(x.name) === String(name));
    const sizes = String(found?.sizes || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    setSelectOptions(sizeSel, sizes, "Сонгох...");
  }

  fillSizesForItem(itemSel.value);
  itemSel.onchange = () => fillSizesForItem(itemSel.value);
}

// ---------- Orders filters ----------
function populateOrderItemFilter() {
  const el = document.getElementById("filter-item");
  if (!el) return;
  const names = uniq(allItems.map((it) => it.name)).sort((a, b) =>
    String(a).localeCompare(String(b))
  );
  setSelectOptions(el, names, "Бүгд");
}
function populateStatusFilter() {
  const el = document.getElementById("filter-status");
  if (!el) return;
  const base = ["Хүлээгдэж буй", "Зөвшөөрсөн", "Татгалзсан"];
  const sts = uniq(base.concat(allOrders.map((o) => o.status).filter(Boolean))).filter(Boolean);
  setSelectOptions(el, sts, "Бүгд");
}
function setupYearMonthFilters() {
  const yearSel = document.getElementById("filter-year");
  const monthSel = document.getElementById("filter-month");
  if (!yearSel || !monthSel) return;

  const years = new Set();
  allOrders.forEach((o) => {
    const d = new Date(o.requestedDate);
    if (!isNaN(d)) years.add(String(d.getFullYear()));
  });
  const yearsArr = Array.from(years).sort((a, b) => b.localeCompare(a));
  setSelectOptions(yearSel, yearsArr, "Бүгд");

  const monthsArr = Array.from({ length: 12 }, (_, i) =>
    String(i + 1).padStart(2, "0")
  );
  setSelectOptions(monthSel, monthsArr, "Бүгд");
}
function setupPlaceDeptShiftFilters() {
  const placeSel = document.getElementById("filter-place");
  const deptSel = document.getElementById("filter-dept");
  const shiftSel = document.getElementById("filter-shift");

  if (placeSel) {
    const places = uniq(allOrders.map((o) => o.place)).sort((a, b) =>
      String(a).localeCompare(String(b))
    );
    setSelectOptions(placeSel, places, "Бүгд");
  }
  if (deptSel) {
    const depts = uniq(allOrders.map((o) => o.department)).sort((a, b) =>
      String(a).localeCompare(String(b))
    );
    setSelectOptions(deptSel, depts, "Бүгд");
  }
  if (shiftSel) {
    const shifts = uniq(SHIFT_OPTIONS.concat(allOrders.map((o) => o.shift))).filter(Boolean);
    setSelectOptions(shiftSel, shifts, "Бүгд");
  }
}

window.clearOrderFilters = () => {
  [
    "filter-status",
    "filter-item",
    "filter-year",
    "filter-month",
    "filter-place",
    "filter-dept",
    "filter-shift",
    "search-name",
    "search-code",
    "search-role",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = ""; // бүгдийг цэвэрлэнэ
  });
  applyFilters();
};

window.applyFilters = () => {
  const nS = document.getElementById("search-name")?.value?.trim() || "";
  const cS = document.getElementById("search-code")?.value?.trim() || "";
  const rS = document.getElementById("search-role")?.value?.trim() || "";

  const iF = document.getElementById("filter-item")?.value || "";
  const sF = document.getElementById("filter-status")?.value || "";
  const yF = document.getElementById("filter-year")?.value || "";
  const mF = document.getElementById("filter-month")?.value || "";
  const pF = document.getElementById("filter-place")?.value || "";
  const dF = document.getElementById("filter-dept")?.value || "";
  const shF = document.getElementById("filter-shift")?.value || "";

  const filtered = (allOrders || []).filter((o) => {
    const d = new Date(o.requestedDate);
    const fullName = `${o.ovog || ""} ${o.ner || ""}`.toLowerCase();

    const mN = !nS || fullName.includes(nS.toLowerCase());
    const mC = !cS || String(o.code || "").includes(cS);
    const mR = !rS || String(o.role || "").toLowerCase().includes(rS.toLowerCase());

    const mI = !iF || String(o.item || "") === String(iF);
    const mS = !sF || String(o.status || "") === String(sF);

    const mY = !yF || (!isNaN(d) && String(d.getFullYear()) === String(yF));
    const mM = !mF || (!isNaN(d) && String(d.getMonth() + 1).padStart(2, "0") === String(mF));

    const mP = !pF || String(o.place || "") === String(pF);
    const mD = !dF || String(o.department || "") === String(dF);
    const mSh = !shF || String(o.shift || "") === String(shF);

    return mN && mC && mR && mI && mS && mY && mM && mP && mD && mSh;
  });

  renderOrders(filtered);
};

// ✅ FIX 2: Filters дээр эвент bind (сонголт өөрчлөгдөхөд applyFilters ажиллана)
function bindOrderFilterEvents_() {
  const changeIds = [
    "filter-status",
    "filter-item",
    "filter-year",
    "filter-month",
    "filter-place",
    "filter-dept",
    "filter-shift",
  ];
  const inputIds = ["search-name", "search-code", "search-role"];

  changeIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.onchange = () => applyFilters();
  });

  inputIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.oninput = () => applyFilters();
  });
}

// ---------- Orders render ----------
function renderOrders(orders) {
  const list = document.getElementById("orders-list");
  if (!list) return;

  let rows = orders || [];

  if (currentUser && currentUser.type !== "admin") {
    const myCode = String(currentUser.code || "").trim();
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

      const empName = `${esc(o.ovog || "")} ${esc(o.ner || "")}`.trim();
      const empId = esc(o.code || "");

      const placeDept = [o.place, o.department].filter(Boolean).join(" • ");
      const role = o.role || "";
      const left2 = `${esc(placeDept)}${placeDept && role ? " • " : ""}${esc(role)}`;

      const item = esc(o.item || "—");
      const size = esc(o.size || "—");
      const qty = esc(o.quantity || o.qty || "—");
      const date = esc(fmtDateOnly(o.requestedDate));

      const actions =
        currentUser?.type === "admin"
          ? `
            <button class="btn sm success" onclick="approveOrder('${esc(o.id)}')">ЗӨВШӨӨРӨХ</button>
            <button class="btn sm danger" onclick="rejectOrder('${esc(o.id)}')">ТАТГАЛЗАХ</button>
          `
          : `—`;

      return `
        <div class="order-row">
          <div class="order-col">
            <div class="cell-emp">
              <div class="emp-name">${empName || "—"}</div>
              <div class="emp-id">ID:${empId}</div>
              <div class="subline">${left2}</div>
            </div>
            <div class="item">${item}</div>
            <div class="subline">${size} • ${qty}</div>
            <div class="date">${date}</div>
            <span class="status ${st.cls}">${esc(st.label)}</span>
            <div class="actions">${actions}</div>
          </div>
        </div>
      `;
    })
    .join("");
}

// ---------- Orders actions ----------
window.approveOrder = async (id) => {
  if (!id) return;
  showLoading(true, "Шинэчилж байна...");
  try {
    const r = await apiPost({ action: "update_status", id, status: "Зөвшөөрсөн" });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    await refreshData();
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.rejectOrder = async (id) => {
  if (!id) return;
  showLoading(true, "Шинэчилж байна...");
  try {
    const r = await apiPost({ action: "update_status", id, status: "Татгалзсан" });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    await refreshData();
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------- Refresh ----------
window.refreshData = async () => {
  if (!currentUser) return;
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

    // ✅ шүүлтийн эвентүүд
    bindOrderFilterEvents_();

    applyFilters();
  } catch (e) {
    popupError("Өгөгдөл татахад алдаа гарлаа.", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------- Init ----------
function initApp() {
  setAuthUIVisible(false);
  document.getElementById("main-screen")?.classList.add("hidden");
  document.getElementById("login-screen")?.classList.remove("hidden");

  // ✅ page дээр байгаа үед ч шүүлт ажиллуулахын тулд нэг удаа bind хийнэ
  bindOrderFilterEvents_();

  const pass = document.getElementById("login-pass");
  pass?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") window.login();
  });
}

window.onload = function () {
  initApp();
};
