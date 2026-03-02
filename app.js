// ===============================
// ETT PPE System - app.js
// FIX: Orders table columns + decision buttons + employee column hide + filters working
// ===============================

const API_URL =
  "https://script.google.com/macros/s/AKfycbzrFXNS4aOBTKeSjxEpkKAshZDDriNcKt39e4qnHg-saVaDjmnIXsilfMxUn2PPUVEr/exec";

let allOrders = [];
let allItems = [];
let allEmployees = [];
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
  } catch (e) {
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

/* ---------------- Select options ---------------- */
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

/* ---------------- Employee column hide (no CSS edit, injected) ---------------- */
function applyRoleViewCSS_() {
  // нэг л удаа style нэмнэ
  if (document.getElementById("role-view-style")) return;

  const st = document.createElement("style");
  st.id = "role-view-style";
  st.textContent = `
    /* employee mode: hide Place/Dept + Role + Actions */
    body.employee-mode .orders-header .col-place,
    body.employee-mode .orders-header .col-role,
    body.employee-mode .orders-header .col-actions { display:none !important; }

    body.employee-mode .order-row .col-place,
    body.employee-mode .order-row .col-role,
    body.employee-mode .order-row .col-actions { display:none !important; }
  `;
  document.head.appendChild(st);
}

function setRoleMode_() {
  applyRoleViewCSS_();
  document.body.classList.toggle("employee-mode", !isAdmin());
}

/* ---------------- UI visibility ---------------- */
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

/* ---------------- Sidebar ---------------- */
window.openSidebar = () => {
  const sb = document.getElementById("sidebar");
  const ov = document.getElementById("sidebar-overlay");
  sb?.classList.remove("hidden");
  ov?.classList.remove("hidden");
  sb?.classList.add("open");
  ov?.classList.add("show");
};
window.closeSidebar = () => {
  const sb = document.getElementById("sidebar");
  const ov = document.getElementById("sidebar-overlay");
  sb?.classList.remove("open");
  ov?.classList.remove("show");
};
window.toggleSidebar = () => {
  const sb = document.getElementById("sidebar");
  if (!sb) return;
  sb.classList.contains("open") ? window.closeSidebar() : window.openSidebar();
};

/* ---------------- Tabs ---------------- */
window.showTab = (tabName, btn) => {
  document.querySelectorAll(".tab-content").forEach((el) => el.classList.add("hidden"));
  document.getElementById(`tab-${tabName}`)?.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");

  if (window.innerWidth < 1024) window.closeSidebar();

  if (tabName === "orders") applyFilters();
  if (tabName === "request") {
    populateRequestItemSize();
    bindRequestSendButton_();
  }
};

/* ---------------- Login / Logout ---------------- */
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

    // nav hide/show
    const admin = isAdmin();
    document.getElementById("nav-items")?.classList.toggle("hidden", !admin);
    document.getElementById("nav-employees")?.classList.toggle("hidden", !admin);
    document.getElementById("nav-request")?.classList.toggle("hidden", admin);

    await refreshData();

    // default tab
    if (admin) showTab("orders", document.getElementById("nav-orders"));
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

  const lc = document.getElementById("login-code");
  const lp = document.getElementById("login-pass");
  if (lc) lc.value = "";
  if (lp) lp.value = "";

  setAuthUIVisible(false);
  window.closeSidebar();
};

/* ---------------- Request dropdowns ---------------- */
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

window.submitRequest = async () => {
  if (!currentUser) return;

  const item = document.getElementById("req-item")?.value || "";
  const size = document.getElementById("req-size")?.value || "";
  let qty = parseInt(document.getElementById("req-qty")?.value || "1", 10);
  if (!qty || qty < 1) qty = 1;

  if (!item) return popupError("Алдаа", "Бараа сонгоно уу");
  if (!size) return popupError("Алдаа", "Хэмжээ сонгоно уу");

  showLoading(true, "Хүсэлт илгээж байна...");
  try {
    const r = await apiPost({ action: "add_order", code: currentUser.code, item, size, qty });
    if (!r.success) throw new Error(r.msg || "Хүсэлт илгээхэд алдаа гарлаа");

    popupOk("Амжилттай", "Хүсэлт амжилттай илгээгдлээ");
    const q = document.getElementById("req-qty");
    if (q) q.value = "1";

    await refreshData();
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// Хэрвээ HTML дээр onclick тавиагүй бол “ИЛГЭЭХ” товчийг автоматаар холбож өгнө
function bindRequestSendButton_() {
  const tab = document.getElementById("tab-request");
  if (!tab) return;
  const btns = tab.querySelectorAll("button");
  for (const b of btns) {
    const txt = (b.textContent || "").trim();
    if (txt === "ИЛГЭЭХ") {
      b.onclick = () => window.submitRequest();
      break;
    }
  }
}

/* ---------------- Orders filters populate ---------------- */
function populateOrderFilters_() {
  // эдгээр ID-ууд танайд байвал шууд бөглөнө
  const itemSel = document.getElementById("filter-item");
  const statusSel = document.getElementById("filter-status");
  const yearSel = document.getElementById("filter-year");
  const monthSel = document.getElementById("filter-month");
  const placeSel = document.getElementById("filter-place");
  const deptSel = document.getElementById("filter-dept");
  const shiftSel = document.getElementById("filter-shift");

  if (itemSel) {
    const names = uniq(allItems.map((it) => it.name)).sort((a, b) => String(a).localeCompare(String(b)));
    setSelectOptions(itemSel, names, "Бүгд");
  }
  if (statusSel) {
    const base = ["Хүлээгдэж буй", "Зөвшөөрсөн", "Татгалзсан"];
    const sts = uniq(base.concat(allOrders.map((o) => o.status).filter(Boolean))).filter(Boolean);
    setSelectOptions(statusSel, sts, "Бүгд");
  }
  if (yearSel) {
    const years = new Set();
    allOrders.forEach((o) => {
      const d = new Date(o.requestedDate);
      if (!isNaN(d)) years.add(String(d.getFullYear()));
    });
    const yearsArr = Array.from(years).sort((a, b) => b.localeCompare(a));
    setSelectOptions(yearSel, yearsArr, "Бүгд");
  }
  if (monthSel) {
    const monthsArr = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
    setSelectOptions(monthSel, monthsArr, "Бүгд");
  }
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

/* ---------------- Orders filters bind (ID зөрсөн ч ажиллах auto bind) ---------------- */
function bindOrderFilterEvents_() {
  const tab = document.getElementById("tab-orders");
  if (!tab) return;

  // 1) ID таарвал шууд bind
  const ids = [
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
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const isInput = el.tagName === "INPUT";
    if (isInput) el.oninput = () => applyFilters();
    else el.onchange = () => applyFilters();
  });

  // 2) ID зөрсөн байж магадгүй тул tab-orders доторх бүх select/input дээр bind
  //    (login input-ууд биш, зөвхөн orders tab доторх)
  tab.querySelectorAll("select").forEach((s) => {
    s.addEventListener("change", () => applyFilters());
  });
  tab.querySelectorAll("input").forEach((i) => {
    i.addEventListener("input", () => applyFilters());
  });
}

window.clearOrderFilters = () => {
  const tab = document.getElementById("tab-orders");
  if (!tab) return;

  // ID таарсанууд
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
    if (el) el.value = "";
  });

  // таб доторх бусад input/select-уудыг ч clear (хэрэв ID өөр бол)
  tab.querySelectorAll("select").forEach((s) => (s.value = ""));
  tab.querySelectorAll("input").forEach((i) => (i.value = ""));

  applyFilters();
};

/* ---------------- Read filter values (fallback) ---------------- */
function getFilterValue_(id, fallbackSelectors = []) {
  const direct = document.getElementById(id);
  if (direct) return direct.value || "";

  const tab = document.getElementById("tab-orders");
  if (!tab) return "";

  // fallbackSelectors: array of functions returning element or selector strings
  for (const sel of fallbackSelectors) {
    try {
      if (typeof sel === "string") {
        const el = tab.querySelector(sel);
        if (el && "value" in el) return el.value || "";
      } else if (typeof sel === "function") {
        const el = sel(tab);
        if (el && "value" in el) return el.value || "";
      }
    } catch (_) {}
  }
  return "";
}

window.applyFilters = () => {
  const tab = document.getElementById("tab-orders");
  if (!tab) return;

  // ID таарах үед
  const nS = getFilterValue_("search-name");
  const cS = getFilterValue_("search-code");
  const rS = getFilterValue_("search-role");

  const iF = getFilterValue_("filter-item");
  const sF = getFilterValue_("filter-status");
  const yF = getFilterValue_("filter-year");
  const mF = getFilterValue_("filter-month");
  const pF = getFilterValue_("filter-place");
  const dF = getFilterValue_("filter-dept");
  const shF = getFilterValue_("filter-shift");

  const filtered = (allOrders || []).filter((o) => {
    const d = new Date(o.requestedDate);
    const fullName = `${o.ovog || ""} ${o.ner || ""}`.toLowerCase();

    const mN = !nS || fullName.includes(String(nS).toLowerCase());
    const mC = !cS || String(o.code || "").includes(String(cS));
    const mR = !rS || String(o.role || "").toLowerCase().includes(String(rS).toLowerCase());

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

/* ---------------- Orders render (8 columns EXACT by header) ---------------- */
function ensureOrdersHeaderClasses_() {
  // header дээрх 8 баганын class-уудыг нэг удаа тааруулж өгнө (CSS өөрчлөхгүй)
  // index.html дээр header текстүүд байгаа тул тэдний байрлалд class өгнө
  const tab = document.getElementById("tab-orders");
  if (!tab) return;

  // header container-ийг хайна: ихэнхдээ .orders-header эсвэл нэг row байдаг
  // Бид текстээр нь олж болно
  const headers = Array.from(tab.querySelectorAll("*")).filter((el) => {
    const t = (el.textContent || "").trim();
    return t === "АЖИЛТАН";
  });

  if (!headers.length) return;

  // "АЖИЛТАН" тексттэй элементээс нэг мөрний parent-ийг авна
  const first = headers[0];
  const row = first.parentElement;
  if (!row) return;

  row.classList.add("orders-header");

  // row доторх header cell-үүдийг авна
  const cells = Array.from(row.children);
  // Хэрэв яг 8 биш бол оролдохгүй (нураахгүй)
  if (cells.length < 8) return;

  // дараалал: Ажилтан / Газар, хэлтэс / Албан тушаал / Бараа / Тоо хэмжээ / Огноо / Төлөв / Үйлдэл
  const cls = ["col-emp", "col-place", "col-role", "col-item", "col-qty", "col-date", "col-status", "col-actions"];
  for (let i = 0; i < 8; i++) cells[i].classList.add(cls[i]);
}

function renderOrders(listData) {
  const list = document.getElementById("orders-list");
  if (!list) return;

  ensureOrdersHeaderClasses_();
  setRoleMode_(); // employee/admin mode apply

  let rows = listData || [];

  // ажилтан бол зөвхөн өөрийн хүсэлтийг харах
  if (!isAdmin()) {
    const myCode = String(currentUser?.code || "").trim();
    rows = rows.filter((o) => String(o.code || "").trim() === myCode);
  }

  if (!rows.length) {
    list.innerHTML = `<div class="empty">Мэдээлэл олдсонгүй</div>`;
    return;
  }

  const sorted = rows.slice().sort((a, b) => new Date(b.requestedDate) - new Date(a.requestedDate));

  // ✅ мөр бүр 8 баганатай
  list.innerHTML = sorted
    .map((o) => {
      const st = statusMeta(o.status);

      const empName = `${esc(o.ovog || "")} ${esc(o.ner || "")}`.trim() || "—";
      const empId = esc(o.code || "—");

      const placeDept = [o.place, o.department, o.shift].filter(Boolean).join(" • ");
      const role = o.role || "";

      const item = esc(o.item || "—");
      const size = esc(o.size || "—");
      const qty = esc(o.quantity || o.qty || "—");
      const date = esc(fmtDateOnly(o.requestedDate));

      // ✅ товч зөвхөн “Хүлээгдэж буй” үед харагдана
      const isPending = String(o.status || "") === "Хүлээгдэж буй";

      let actions = `—`;
      if (isAdmin()) {
        if (isPending) {
          actions = `
            <button class="btn sm success" onclick="decideOrder('${esc(o.id)}','Зөвшөөрсөн')">ЗӨВШӨӨРӨХ</button>
            <button class="btn sm danger" onclick="decideOrder('${esc(o.id)}','Татгалзсан')">ТАТГАЛЗАХ</button>
          `;
        } else {
          actions = `<span class="tag">ШИЙДВЭРЛЭСЭН</span>`;
        }
      } else {
        // ажилтанд үйлдэл хэрэггүй (нуусан ч — үлдээнэ)
        actions = `—`;
      }

      return `
        <div class="order-row">
          <div class="order-col col-emp">
            <div class="emp-name">${empName}</div>
            <div class="emp-id">ID:${empId}</div>
          </div>

          <div class="order-col col-place">
            ${esc(placeDept || "—")}
          </div>

          <div class="order-col col-role">
            ${esc(role || "—")}
          </div>

          <div class="order-col col-item">
            <div class="item">${item}</div>
            <div class="subline">${size}</div>
          </div>

          <div class="order-col col-qty">
            ${qty}
          </div>

          <div class="order-col col-date">
            ${date}
          </div>

          <div class="order-col col-status">
            <span class="status ${st.cls}">${esc(st.label)}</span>
          </div>

          <div class="order-col col-actions">
            ${actions}
          </div>
        </div>
      `;
    })
    .join("");
}

/* ---------------- Decide order (button -> remove immediately) ---------------- */
window.decideOrder = async (id, status) => {
  if (!id || !status) return;

  // UI-г шууд шинэчилж “Шийдвэрлэсэн” болгоно (сервер хүлээхгүй)
  const idx = allOrders.findIndex((x) => String(x.id) === String(id));
  if (idx >= 0) allOrders[idx].status = status;

  applyFilters(); // шууд refresh

  try {
    const r = await apiPost({ action: "update_status", id, status });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    // серверийн алдаа байхгүй бол дахин татаж баталгаажуулна
    await refreshData();
  } catch (e) {
    popupError("Алдаа", e.message || String(e));
    // алдаа гарвал датагаа буцааж татах
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

    if (isAdmin()) {
      const u = await apiPost({ action: "get_users" });
      allEmployees = u.success ? (u.users || []) : [];
    } else {
      allEmployees = [];
    }

    populateOrderFilters_();
    bindOrderFilterEvents_();

    populateRequestItemSize();
    bindRequestSendButton_();

    applyFilters();
  } catch (e) {
    popupError("Өгөгдөл татахад алдаа гарлаа.", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

/* ---------------- Init ---------------- */
function initApp() {
  setAuthUIVisible(false);
  document.getElementById("main-screen")?.classList.add("hidden");
  document.getElementById("login-screen")?.classList.remove("hidden");

  // filters & request button bind (login-оос өмнө ч бэлтгэнэ)
  bindOrderFilterEvents_();
  bindRequestSendButton_();

  const pass = document.getElementById("login-pass");
  pass?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") window.login();
  });
}
window.onload = function () {
  initApp();
};
