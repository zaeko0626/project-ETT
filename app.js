// ===============================
// ETT PPE System - app.js (FULL FIX)
// Works with your current index.html IDs
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

// ---------- Escape HTML ----------
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
    <div class="modal-text">${esc(msg || "")}</div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-min" onclick="closeModal()">OK</button>
    </div>
  `
  );
}

function popupOk(title, msg) {
  window.openModal(
    title || "Амжилттай",
    `
    <div class="modal-text">${esc(msg || "")}</div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-min" onclick="closeModal()">OK</button>
    </div>
  `
  );
}

// ---------- API (no CORS preflight: text/plain JSON) ----------
async function apiPost(payload) {
  let res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload || {}),
      cache: "no-store",
      redirect: "follow",
    });
  } catch (e) {
    throw new Error("Failed to fetch");
  }

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
  const opts = [];
  if (allLabel != null) opts.push(`<option value="">${esc(allLabel)}</option>`);
  v.forEach((val) => opts.push(`<option value="${esc(val)}">${esc(val)}</option>`));
  sel.innerHTML = opts.join("");
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

// ---------- Auth UI visibility (IMPORTANT) ----------
function setAuthUIVisible(isLoggedInNow) {
  const header = document.getElementById("app-header");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");

  // header/sidebar should NOT show on login screen
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

  document.querySelectorAll(".tab-content").forEach((el) => el.classList.add("hidden"));
  document.getElementById(`tab-${tabName}`)?.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");

  if (window.innerWidth < 1024) window.closeSidebar();

  // re-render per tab
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

  const fullName = `${currentUser.ovog || ""} ${currentUser.ner || ""}`.trim() || (currentUser.ner || "");
  if (nameEl) nameEl.textContent = fullName || "—";
  if (idEl) idEl.textContent = currentUser.code ? `${currentUser.code}` : "";
  if (roleEl) roleEl.textContent = currentUser.type === "admin" ? "АДМИН" : (currentUser.role || "");
  const extra = [currentUser.place, currentUser.department, currentUser.shift].filter(Boolean).join(" • ");
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

    // IMPORTANT: hide login, show main + auth UI
    document.getElementById("login-screen")?.classList.add("hidden");
    document.getElementById("main-screen")?.classList.remove("hidden");
    setAuthUIVisible(true);

    // Role based menu
    const isAdmin = currentUser?.type === "admin";
    document.getElementById("nav-items")?.classList.toggle("hidden", !isAdmin);
    document.getElementById("nav-employees")?.classList.toggle("hidden", !isAdmin);

    // request tab should be hidden for admin (your earlier requirement)
    document.getElementById("nav-request")?.classList.toggle("hidden", isAdmin);

    // default tab
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

  // reset login inputs
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

  const names = uniq(allItems.map((it) => it.name)).sort((a, b) => String(a).localeCompare(String(b)));
  setSelectOptions(itemSel, names, "Сонгох...");

  function fillSizesForItem(name) {
    const found = allItems.find((x) => String(x.name) === String(name));
    const sizes = String(found?.sizes || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    setSelectOptions(sizeSel, sizes, "Сонгох...");
  }

  // initial sizes
  fillSizesForItem(itemSel.value);

  itemSel.onchange = () => {
    fillSizesForItem(itemSel.value);
  };
}

// ---------- Orders filters ----------
function populateOrderItemFilter() {
  const el = document.getElementById("filter-item");
  if (!el) return;
  const names = uniq(allItems.map((it) => it.name)).sort((a, b) => String(a).localeCompare(String(b)));
  setSelectOptions(el, names, "Бүгд");
}

function populateStatusFilter() {
  const el = document.getElementById("filter-status");
  if (!el) return;
  // Always show 3 statuses
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

  const monthsArr = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
  setSelectOptions(monthSel, monthsArr, "Бүгд");
}

function setupPlaceDeptShiftFilters() {
  const placeSel = document.getElementById("filter-place");
  const deptSel = document.getElementById("filter-dept");
  const shiftSel = document.getElementById("filter-shift");

  if (placeSel) {
    const places = uniq(allOrders.map((o) => o.place)).sort((a, b) => String(a).localeCompare(String(b)));
    setSelectOptions(placeSel, places, "Бүгд");
  }
  if (deptSel) {
    const depts = uniq(allOrders.map((o) => o.department)).sort((a, b) => String(a).localeCompare(String(b)));
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
    el.value = "";
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

// ---------- Orders render ----------
function renderOrders(orders) {
  const list = document.getElementById("orders-list");
  if (!list) return;

  let rows = orders || [];

  // ✅ Зөвхөн өөрийн хүсэлтийг харуулах
  if (currentUser && currentUser.type !== "admin") {
    const myCode = String(currentUser.code || "").trim();
    rows = rows.filter(o => String(o.code || "").trim() === myCode);
  }

  if (!rows.length) {
    list.innerHTML = `
      <div class="row-item">
        <div class="muted">Мэдээлэл олдсонгүй</div>
      </div>
    `;
    return;
  }

  // newest first
  const sorted = rows.slice().sort((a, b) => new Date(b.requestedDate) - new Date(a.requestedDate));

  list.innerHTML = sorted
    .map((o) => {
      const st = statusMeta(o.status);

      // --- Columns content ---
      // 1) Ажилтан
      const empName = `${esc(o.ovog || "")} ${esc(o.ner || "")}`.trim();
      const empId = esc(o.code || "");

      const empCell = `
        <div class="cell">
          <div class="cell-title">${empName || "—"}</div>
          <div class="cell-sub">ID•${empId}</div>
        </div>
      `;

      // 2) Газар, хэлтэс
      const placeDeptCell = `
        <div class="cell">
          <div class="cell-title">${esc(o.place || "—")}</div>
          <div class="cell-sub">${esc(o.department || "—")}</div>
        </div>
      `;

      // 3) Албан тушаал
      const roleCell = `
        <div class="cell">
          <div class="cell-title">${esc(o.role || "—")}</div>
        </div>
      `;

      // 4) Бараа
      const itemCell = `
        <div class="cell">
          <div class="cell-title">${esc(o.item || "—")}</div>
          <div class="cell-sub">Размер: ${esc(o.size || "—")}</div>
        </div>
      `;

      // 5) Тоо хэмжээ
      const qtyCell = `
        <div class="cell">
          <div class="cell-title">${esc(o.quantity ?? 1)} ш</div>
        </div>
      `;

      // 6) Огноо (он-сар-өдөр)
      const dateCell = `
        <div class="cell">
          <div class="cell-title">${esc(fmtDateOnly(o.requestedDate) || "—")}</div>
        </div>
      `;

      // 7) Төлөв
      const statusCell = `
        <div class="cell">
          <span class="badge ${esc(st.cls)}">${esc(st.label)}</span>
        </div>
      `;

      // 8) Үйлдэл (admin + pending үед л)
      const isPending = String(o.status || "") === "Хүлээгдэж буй";
      const canAct = currentUser?.type === "admin" && isPending;

      const actionCell = canAct
        ? `
          <div class="cell">
            <div class="actions">
              <button class="btn btn-success btn-min" onclick="approveOrder('${esc(o.id)}')">ОЛГОХ</button>
              <button class="btn btn-danger btn-min" onclick="rejectOrder('${esc(o.id)}')">ТАТГАЛЗАХ</button>
            </div>
          </div>
        `
        : `
          <div class="cell">
            <span class="badge st-decided">ШИЙДВЭРЛЭСЭН</span>
          </div>
        `;

      return `
        <div class="row-item row-orders-8">
          ${empCell}
          ${placeDeptCell}
          ${roleCell}
          ${itemCell}
          ${qtyCell}
          ${dateCell}
          ${statusCell}
          ${actionCell}
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

// ---------- Request submit ----------
window.submitRequest = async () => {
  if (!currentUser) return;

  const item = document.getElementById("req-item")?.value || "";
  const size = document.getElementById("req-size")?.value || "";
  const qty = parseInt(document.getElementById("req-qty")?.value || "1", 10) || 1;

  if (!item) return popupError("Алдаа", "Бараа сонгоно уу");
  if (!size) return popupError("Алдаа", "Хэмжээ сонгоно уу");

  showLoading(true, "Хүсэлт илгээж байна...");
  try {
    const r = await apiPost({ action: "add_order", code: currentUser.code, item, size, qty });
    if (!r.success) throw new Error(r.msg || "Хүсэлт илгээхэд алдаа гарлаа");
    popupOk("Амжилттай", "Хүсэлт амжилттай илгээгдлээ");
    await refreshData();
    // keep user on request tab
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------- Items (Admin) ----------
function populateItemsFilter() {
  const sel = document.getElementById("items-filter");
  if (!sel) return;
  const names = uniq(allItems.map((it) => it.name)).sort((a, b) => String(a).localeCompare(String(b)));
  setSelectOptions(sel, names, "Бүгд");
  sel.onchange = () => renderItemsList();
}

window.clearItemsFilter = () => {
  const sel = document.getElementById("items-filter");
  if (sel) sel.value = "";
  renderItemsList();
};

function renderItemsList() {
  const list = document.getElementById("items-list");
  if (!list) return;

  const filterVal = document.getElementById("items-filter")?.value || "";
  const rows = (allItems || []).filter((x) => !filterVal || String(x.name) === String(filterVal));

  if (!rows.length) {
    list.innerHTML = `
      <div class="row-item">
        <div class="muted">Бараа олдсонгүй</div>
      </div>
    `;
    return;
  }

  list.innerHTML = rows
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map((it, idx) => {
      const locked = !!it.locked;
      const actions = `
        <div class="actions">
          <button class="btn btn-gray btn-min" ${locked ? "disabled" : ""} onclick="editItemPrompt('${esc(it.name)}')">ЗАСАХ</button>
          <button class="btn btn-primary btn-min" onclick="showItemHistory('${esc(it.name)}')">ТҮҮХ</button>
          <button class="btn btn-danger btn-min" ${locked ? "disabled" : ""} onclick="deleteItemConfirm('${esc(it.name)}')">УСТГАХ</button>
        </div>
      `;

      return `
        <div class="row-item">
          <div class="cell"><div class="cell-title">${idx + 1}</div></div>
          <div class="cell">
            <div class="cell-title">${esc(it.name)}</div>
            ${locked ? `<div class="cell-sub">Locked</div>` : ``}
          </div>
          <div class="cell"><div class="cell-title">${esc(it.sizes || "")}</div></div>
          <div class="cell">${actions}</div>
        </div>
      `;
    })
    .join("");
}

window.addItem = async () => {
  const name = document.getElementById("new-item-name")?.value?.trim() || "";
  const sizes = document.getElementById("new-item-sizes")?.value?.trim() || "";
  if (!name) return popupError("Алдаа", "Нэр оруулна уу");

  showLoading(true, "Нэмэж байна...");
  try {
    const r = await apiPost({ action: "add_item", name, sizes });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    document.getElementById("new-item-name").value = "";
    document.getElementById("new-item-sizes").value = "";
    await refreshData();
    showTab("items", document.getElementById("nav-items"));
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.editItemPrompt = (oldName) => {
  const it = allItems.find((x) => String(x.name) === String(oldName));
  if (!it) return;

  if (it.locked) return popupError("Анхаар", "Энэ бараагаар бүртгэл орсон тул засах боломжгүй.");

  const html = `
    <div class="modal-text">Бараа засах</div>
    <div class="form-grid-2">
      <input id="edit-item-name" class="input" value="${esc(it.name)}"/>
      <input id="edit-item-sizes" class="input" value="${esc(it.sizes || "")}"/>
      <button class="btn btn-primary btn-min" onclick="saveItemEdit('${esc(it.name)}')">ХАДГАЛАХ</button>
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
    if (!r.success) throw new Error(r.msg || "Алдаа");
    closeModal();
    await refreshData();
    showTab("items", document.getElementById("nav-items"));
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.deleteItemConfirm = (name) => {
  const it = allItems.find((x) => String(x.name) === String(name));
  if (!it) return;
  if (it.locked) return popupError("Анхаар", "Энэ бараагаар бүртгэл орсон тул устгах боломжгүй.");

  openModal(
    "Устгах уу?",
    `
    <div class="modal-text"><b>${esc(name)}</b> барааг устгах уу?</div>
    <div class="modal-actions">
      <button class="btn btn-dark btn-min" onclick="closeModal()">Буцах</button>
      <button class="btn btn-danger btn-min" onclick="deleteItem('${esc(name)}')">УСТГАХ</button>
    </div>
  `
  );
};

window.deleteItem = async (name) => {
  showLoading(true, "Устгаж байна...");
  try {
    const r = await apiPost({ action: "delete_item", name });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    closeModal();
    await refreshData();
    showTab("items", document.getElementById("nav-items"));
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.showItemHistory = async (itemName) => {
  showLoading(true, "Түүх татаж байна...");
  try {
    const r = await apiPost({ action: "get_item_history", item: itemName });
    if (!r.success) throw new Error(r.msg || "Алдаа");

    const rows = r.history || [];
    const body =
      rows.length === 0
        ? `<div class="modal-text">Олголтын түүх байхгүй</div>`
        : `
          <div class="hist-list">
            ${rows
              .slice()
              .reverse()
              .map(
                (h) => `
                <div class="hist-row">
                  <div class="hist-top">${esc(h.code)} • ${esc(h.ovog)} ${esc(h.ner)}</div>
                  <div class="hist-sub">${esc(fmtDateOnly(h.date))} • ${esc(h.size)} • ${esc(h.qty)}</div>
                </div>
              `
              )
              .join("")}
          </div>
        `;

    openModal("Олголтын түүх", body);
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------- Employees (Admin) ----------
function setupEmployeeShiftOptions() {
  const sel = document.getElementById("emp-shift");
  if (!sel) return;
  sel.innerHTML = SHIFT_OPTIONS.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
}

function renderEmployeesList() {
  const list = document.getElementById("employees-list");
  if (!list) return;

  const rows = allEmployees || [];
  if (!rows.length) {
    list.innerHTML = `
      <div class="row-item">
        <div class="muted">Ажилтан олдсонгүй</div>
      </div>
    `;
    return;
  }

  // requirement: place, dept, role, shift should appear before name in a continuous line
  list.innerHTML = rows
    .slice()
    .sort((a, b) => String(a.code).localeCompare(String(b.code)))
    .map((u, idx) => {
      const locked = !!u.locked;
      const infoLeft = `${esc(u.place || "")} • ${esc(u.department || "")} • ${esc(u.role || "")} • ${esc(
        u.shift || ""
      )}`.replace(/^ • | • $/g, "");

      const nameLine = `${esc(u.code)} • ${esc(u.ovog || "")} ${esc(u.ner || "")}`.trim();

      const actions = `
        <div class="actions">
          <button class="btn btn-gray btn-min" ${locked ? "disabled" : ""} onclick="editEmployeePrompt('${esc(
        u.code
      )}')">ЗАСАХ</button>
          <button class="btn btn-primary btn-min" onclick="showEmployeeHistory('${esc(u.code)}')">ТҮҮХ</button>
          <button class="btn btn-danger btn-min" ${locked ? "disabled" : ""} onclick="deleteEmployeeConfirm('${esc(
        u.code
      )}')">УСТГАХ</button>
        </div>
      `;

      return `
        <div class="row-item">
          <div class="cell"><div class="cell-title">${idx + 1}</div></div>
          <div class="cell">
            <div class="cell-sub">${infoLeft}</div>
            <div class="cell-title">${nameLine}</div>
          </div>
          <div class="cell">${actions}</div>
        </div>
      `;
    })
    .join("");
}

window.addEmployee = async () => {
  const code = document.getElementById("emp-code")?.value?.trim() || "";
  const pass = document.getElementById("emp-pass")?.value?.trim() || "12345";
  const ovog = document.getElementById("emp-ovog")?.value?.trim() || "";
  const ner = document.getElementById("emp-ner")?.value?.trim() || "";
  const role = document.getElementById("emp-role")?.value?.trim() || "";
  const place = document.getElementById("emp-place")?.value?.trim() || "";
  const department = document.getElementById("emp-dept")?.value?.trim() || "";
  const shift = document.getElementById("emp-shift")?.value?.trim() || "";

  if (!code || !ner) return popupError("Алдаа", "Код болон Нэр заавал");

  showLoading(true, "Нэмэж байна...");
  try {
    const r = await apiPost({
      action: "add_user",
      code,
      pass,
      ner,
      ovog,
      role,
      place,
      department,
      shift,
    });
    if (!r.success) throw new Error(r.msg || "Алдаа");

    // clear fields
    ["emp-code", "emp-pass", "emp-ovog", "emp-ner", "emp-role", "emp-place", "emp-dept"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });

    await refreshData();
    showTab("employees", document.getElementById("nav-employees"));
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.editEmployeePrompt = (code) => {
  const u = (allEmployees || []).find((x) => String(x.code) === String(code));
  if (!u) return;
  if (u.locked) return popupError("Анхаар", "Энэ ажилтнаар бүртгэл орсон тул засах боломжгүй.");

  const html = `
    <div class="form-grid-2">
      <input id="edit-emp-pass" class="input" placeholder="Нууц үг (хоосон бол өөрчлөхгүй)"/>
      <input id="edit-emp-ovog" class="input" value="${esc(u.ovog || "")}" placeholder="Овог"/>
      <input id="edit-emp-ner" class="input" value="${esc(u.ner || "")}" placeholder="Нэр"/>
      <input id="edit-emp-role" class="input" value="${esc(u.role || "")}" placeholder="Албан тушаал"/>
      <input id="edit-emp-place" class="input" value="${esc(u.place || "")}" placeholder="Газар"/>
      <input id="edit-emp-dept" class="input" value="${esc(u.department || "")}" placeholder="Хэлтэс"/>
      <select id="edit-emp-shift" class="select">
        ${SHIFT_OPTIONS.map((s) => `<option value="${esc(s)}" ${u.shift === s ? "selected" : ""}>${esc(s)}</option>`).join("")}
      </select>
      <button class="btn btn-primary btn-min" onclick="saveEmployeeEdit('${esc(u.code)}')">ХАДГАЛАХ</button>
    </div>
  `;
  openModal(`Ажилтан засах (${esc(u.code)})`, html);
};

window.saveEmployeeEdit = async (code) => {
  const pass = document.getElementById("edit-emp-pass")?.value?.trim() || "";
  const ovog = document.getElementById("edit-emp-ovog")?.value?.trim() || "";
  const ner = document.getElementById("edit-emp-ner")?.value?.trim() || "";
  const role = document.getElementById("edit-emp-role")?.value?.trim() || "";
  const place = document.getElementById("edit-emp-place")?.value?.trim() || "";
  const department = document.getElementById("edit-emp-dept")?.value?.trim() || "";
  const shift = document.getElementById("edit-emp-shift")?.value?.trim() || "";

  if (!ner) return popupError("Алдаа", "Нэр хоосон байж болохгүй");

  showLoading(true, "Хадгалж байна...");
  try {
    const r = await apiPost({
      action: "update_user",
      code,
      pass,
      ner,
      ovog,
      role,
      place,
      department,
      shift,
    });
    if (!r.success) throw new Error(r.msg || "Алдаа");

    closeModal();
    await refreshData();
    showTab("employees", document.getElementById("nav-employees"));
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.deleteEmployeeConfirm = (code) => {
  const u = (allEmployees || []).find((x) => String(x.code) === String(code));
  if (!u) return;
  if (u.locked) return popupError("Анхаар", "Энэ ажилтнаар бүртгэл орсон тул устгах боломжгүй.");

  openModal(
    "Устгах уу?",
    `
    <div class="modal-text"><b>${esc(u.code)}</b> ажилтныг устгах уу?</div>
    <div class="modal-actions">
      <button class="btn btn-dark btn-min" onclick="closeModal()">Буцах</button>
      <button class="btn btn-danger btn-min" onclick="deleteEmployee('${esc(u.code)}')">УСТГАХ</button>
    </div>
  `
  );
};

window.deleteEmployee = async (code) => {
  showLoading(true, "Устгаж байна...");
  try {
    const r = await apiPost({ action: "delete_user", code });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    closeModal();
    await refreshData();
    showTab("employees", document.getElementById("nav-employees"));
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// Employee history (needs backend action get_user_history)
window.showEmployeeHistory = async (code) => {
  showLoading(true, "Түүх татаж байна...");
  try {
    const r = await apiPost({ action: "get_user_history", code });
    if (!r.success) throw new Error(r.msg || "Алдаа");

    const rows = r.history || [];
    const body =
      rows.length === 0
        ? `<div class="modal-text">Олголтын түүх байхгүй</div>`
        : `
          <div class="hist-list">
            ${rows
              .slice()
              .reverse()
              .map(
                (h) => `
                <div class="hist-row">
                  <div class="hist-top">${esc(fmtDateOnly(h.date))}</div>
                  <div class="hist-sub">${esc(h.item)} • ${esc(h.size)} • ${esc(h.qty)}</div>
                </div>
              `
              )
              .join("")}
          </div>
        `;

    openModal("Ажилтны олголтын түүх", body);
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------- Password change ----------
window.changePassword = async () => {
  if (!currentUser) return;

  const oldP = document.getElementById("old-pass")?.value?.trim() || "";
  const newP = document.getElementById("new-pass")?.value?.trim() || "";
  const newP2 = document.getElementById("new-pass-2")?.value?.trim() || "";

  if (!oldP || !newP || !newP2) return popupError("Алдаа", "Мэдээлэл дутуу");
  if (newP !== newP2) return popupError("Алдаа", "Шинэ нууц үг давталт таарахгүй");

  showLoading(true, "Хадгалж байна...");
  try {
    const r = await apiPost({ action: "change_pass", code: currentUser.code, oldP, newP });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    popupOk("Амжилттай", "Нууц үг солигдлоо");
    document.getElementById("old-pass").value = "";
    document.getElementById("new-pass").value = "";
    document.getElementById("new-pass-2").value = "";
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

    // populate filters + dropdowns
    populateOrderItemFilter();
    populateStatusFilter();
    setupYearMonthFilters();
    setupPlaceDeptShiftFilters();
    populateRequestItemSize();
    populateItemsFilter();
    setupEmployeeShiftOptions();

    // render current tab
    const visibleTabId = document.querySelector(".tab-content:not(.hidden)")?.id || "tab-orders";
    if (visibleTabId === "tab-orders") applyFilters();
    if (visibleTabId === "tab-items") renderItemsList();
    if (visibleTabId === "tab-employees") renderEmployeesList();
  } catch (e) {
    popupError("Өгөгдөл татахад алдаа гарлаа.", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------- Init ----------
function initApp() {
  // always start at login state
  setAuthUIVisible(false);
  document.getElementById("main-screen")?.classList.add("hidden");
  document.getElementById("login-screen")?.classList.remove("hidden");

  setupEmployeeShiftOptions();

  // Enter key on login
  const pass = document.getElementById("login-pass");
  pass?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") window.login();
  });
}
window.onload = function () {
  initApp();
  setupOrderFilters();    // ✅ шүүлтүүрийн event-үүдийг холбож өгнө
  applyOrderFilters();    // ✅ эхний удаа шүүгээд render хийнэ
};
function setupOrderFilters() {
  // Эдгээр ID-ууд чинь index.html дээр байвал шууд ажиллана
  const ids = [
    "f_status","f_item","f_year","f_month",
    "f_place","f_department","f_shift",
    "f_name","f_code","f_role"
  ];

  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", applyOrderFilters);
    el.addEventListener("change", applyOrderFilters);
  });

  const clearBtn = document.getElementById("btn-clear-filters");
  if (clearBtn) clearBtn.addEventListener("click", () => {
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.tagName === "SELECT") el.value = "Бүгд";
      else el.value = "";
    });
    applyOrderFilters();
  });
}

function applyOrderFilters() {
  // эх дата: allOrders гэж үзье (чи өөр нэртэй бол хэлээрэй)
  let filtered = allOrders ? allOrders.slice() : [];

  // user бол зөвхөн өөрийн
  if (currentUser && currentUser.type !== "admin") {
    const myCode = String(currentUser.code || "").trim();
    filtered = filtered.filter(o => String(o.code || "").trim() === myCode);
  }

  // Helper
  const v = (id) => {
    const el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  };
  const contains = (a,b) => String(a||"").toLowerCase().includes(String(b||"").toLowerCase());

  const st = v("f_status");
  if (st && st !== "Бүгд") filtered = filtered.filter(o => String(o.status||"") === st);

  const it = v("f_item");
  if (it && it !== "Бүгд") filtered = filtered.filter(o => String(o.item||"") === it);

  const yr = v("f_year");
  if (yr && yr !== "Бүгд") filtered = filtered.filter(o => (new Date(o.requestedDate)).getFullYear() === Number(yr));

  const mo = v("f_month");
  if (mo && mo !== "Бүгд") filtered = filtered.filter(o => ((new Date(o.requestedDate)).getMonth()+1) === Number(mo));

  const pl = v("f_place");
  if (pl && pl !== "Бүгд") filtered = filtered.filter(o => String(o.place||"") === pl);

  const dp = v("f_department");
  if (dp && dp !== "Бүгд") filtered = filtered.filter(o => String(o.department||"") === dp);

  const sh = v("f_shift");
  if (sh && sh !== "Бүгд") filtered = filtered.filter(o => String(o.shift||"") === sh);

  const nameQ = v("f_name");
  if (nameQ) filtered = filtered.filter(o => contains(`${o.ovog||""} ${o.ner||""}`, nameQ));

  const codeQ = v("f_code");
  if (codeQ) filtered = filtered.filter(o => contains(o.code, codeQ));

  const roleQ = v("f_role");
  if (roleQ) filtered = filtered.filter(o => contains(o.role, roleQ));

  // ✅ энд renderOrders чинь параметр авдаг бол: renderOrders(filtered)
  // хэрэв renderOrders allOrders ашигладаг бол түр хадгалаад:
  renderOrders(filtered);
}
