// ===============================
// ETT PPE System - app.js (Stable build)
// - Header/Sidebar hidden on login
// - Orders list: column layout + ЭЭЛЖ + dept under place + "Размер:" + "ширхэг"
// - Approve/Reject => buttons replaced by "ШИЙДВЭРЛЭСЭН"
// - Filters 100% working
// - Employee can submit order + view own history
// - Admin can manage items/users (simple UI)
// ===============================

const API_URL = "https://script.google.com/macros/s/AKfycbzrFXNS4aOBTKeSjxEpkKAshZDDriNcKt39e4qnHg-saVaDjmnIXsilfMxUn2PPUVEr/exec";

let allOrders = [];
let allItems = [];
let allUsers = [];
let currentUser = null;

const SHIFT_OPTIONS = ["А", "Б", "Өдөр", "Шөнө"];

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function isAdmin() { return currentUser?.type === "admin"; }
function uniq(arr) { return Array.from(new Set((arr || []).filter((x) => x != null && x !== ""))); }

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
  if (s === "Татгалзсан") return { label: "ТАТГАЛЗАХ", cls: "st-rejected" };
  return { label: "ХҮЛЭЭГДЭЖ БУЙ", cls: "st-pending" };
}

// ---------- UI: loading & modal ----------
function showLoading(show, subText = "") {
  const el = $("loading-overlay");
  if (!el) return;
  const sub = $("loading-sub");
  if (sub) sub.textContent = subText || "";
  el.classList.toggle("hidden", !show);
}

window.openModal = (title, html) => {
  const ov = $("modal-overlay");
  const t = $("modal-title");
  const b = $("modal-body");
  if (!ov || !t || !b) {
    alert(`${title}\n\n${String(html || "").replace(/<[^>]*>/g, "")}`);
    return;
  }
  t.textContent = title || "";
  b.innerHTML = html || "";
  ov.classList.remove("hidden");
};
window.closeModal = () => {
  $("modal-overlay")?.classList.add("hidden");
  if ($("modal-body")) $("modal-body").innerHTML = "";
};

function popupError(msg) {
  openModal("Алдаа", `
    <div class="modal-msg">${esc(msg || "Алдаа гарлаа")}</div>
    <div class="modal-actions"><button class="btn" onclick="closeModal()">OK</button></div>
  `);
}
function popupOk(msg) {
  openModal("Амжилттай", `
    <div class="modal-msg">${esc(msg || "OK")}</div>
    <div class="modal-actions"><button class="btn" onclick="closeModal()">OK</button></div>
  `);
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
  try { json = JSON.parse(text); }
  catch { throw new Error("Invalid JSON: " + text); }
  return json;
}

// ---------- Header / Sidebar ----------
function setLoggedInUI(isLoggedIn) {
  $("login-screen")?.classList.toggle("hidden", isLoggedIn);
  $("main-screen")?.classList.toggle("hidden", !isLoggedIn);

  // IMPORTANT: chrome should be hidden on login
  $("app-header")?.classList.toggle("hidden", !isLoggedIn);
  $("sidebar")?.classList.toggle("hidden", !isLoggedIn);
  $("sidebar-overlay")?.classList.add("hidden");
  $("sidebar")?.classList.remove("open");
}

window.openSidebar = () => {
  $("sidebar")?.classList.add("open");
  $("sidebar-overlay")?.classList.remove("hidden");
};
window.closeSidebar = () => {
  $("sidebar")?.classList.remove("open");
  $("sidebar-overlay")?.classList.add("hidden");
};
window.toggleSidebar = () => {
  const sb = $("sidebar");
  if (!sb) return;
  sb.classList.contains("open") ? closeSidebar() : openSidebar();
};

window.showTab = (tabName, btn) => {
  document.querySelectorAll(".tab-content").forEach((el) => el.classList.add("hidden"));
  $(`tab-${tabName}`)?.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");

  if (window.innerWidth < 1024) closeSidebar();

  if (tabName === "orders") applyFilters();
  if (tabName === "request") renderUserHistory();
  if (tabName === "items") renderItems();
  if (tabName === "users") renderUsers();
};

// ---------- Orders Grid CSS (Admin vs Employee) ----------
function ensureOrdersGridCSS() {
  if (document.getElementById("orders-grid-css")) return;
  const st = document.createElement("style");
  st.id = "orders-grid-css";
  st.textContent = `
    .orders-header, .order-row {
      display:grid;
      width:100%;
      column-gap:18px;
      align-items:start;
    }
    body.admin-mode .orders-header, body.admin-mode .order-row{
      grid-template-columns: 2.1fr 2.6fr 1.6fr 1fr 2.2fr 1fr 1.2fr 1.2fr 1.7fr;
    }
    body.employee-mode .orders-header, body.employee-mode .order-row{
      grid-template-columns: 2.2fr 1fr 2.6fr 1.1fr 1.3fr 1.2fr;
    }
    body.employee-mode .orders-header > :nth-child(2),
    body.employee-mode .orders-header > :nth-child(3),
    body.employee-mode .orders-header > :nth-child(9),
    body.employee-mode .order-row > .col-place,
    body.employee-mode .order-row > .col-role,
    body.employee-mode .order-row > .col-actions{
      display:none !important;
    }
  `;
  document.head.appendChild(st);
}

function applyRoleMode() {
  ensureOrdersGridCSS();
  document.body.classList.toggle("admin-mode", isAdmin());
  document.body.classList.toggle("employee-mode", !isAdmin());

  // Admin-only tab buttons
  const usersBtn = $("nav-users");
  if (usersBtn) usersBtn.style.display = isAdmin() ? "" : "none";
}

// ---------- Filters ----------
function setSelectOptions(sel, values, allLabel = "Бүгд") {
  if (!sel) return;
  const opts = [`<option value="">${esc(allLabel)}</option>`];
  uniq(values).forEach((v) => opts.push(`<option value="${esc(v)}">${esc(v)}</option>`));
  sel.innerHTML = opts.join("");
}

function populateFilters() {
  setSelectOptions($("filter-status"), ["Хүлээгдэж буй", "Зөвшөөрсөн", "Татгалзсан"]);
  setSelectOptions($("filter-item"), allItems.map((x) => x.name));
  setSelectOptions($("filter-year"),
    uniq(allOrders.map(o => {
      const d = new Date(o.requestedDate);
      return isNaN(d) ? "" : String(d.getFullYear());
    })).sort((a,b)=>b.localeCompare(a))
  );
  setSelectOptions($("filter-month"), Array.from({length:12}, (_,i)=>String(i+1).padStart(2,"0")));
  setSelectOptions($("filter-place"), allOrders.map(o => o.place || ""));
  setSelectOptions($("filter-dept"), allOrders.map(o => o.department || ""));
  setSelectOptions($("filter-shift"), uniq(SHIFT_OPTIONS.concat(allOrders.map(o=>o.shift||""))));
}

function bindFilterEvents() {
  const ids = [
    "filter-status","filter-item","filter-year","filter-month","filter-place","filter-dept","filter-shift",
    "search-name","search-code","search-role"
  ];
  ids.forEach(id => {
    const el = $(id);
    if (!el) return;
    const evt = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(evt, applyFilters);
  });
}

window.resetFilters = () => {
  ["filter-status","filter-item","filter-year","filter-month","filter-place","filter-dept","filter-shift"].forEach(id => { if($(id)) $(id).value=""; });
  ["search-name","search-code","search-role"].forEach(id => { if($(id)) $(id).value=""; });
  applyFilters();
};

window.applyFilters = () => {
  const f = {
    status: ($("filter-status")?.value || "").trim(),
    item: ($("filter-item")?.value || "").trim(),
    year: ($("filter-year")?.value || "").trim(),
    month: ($("filter-month")?.value || "").trim(),
    place: ($("filter-place")?.value || "").trim(),
    dept: ($("filter-dept")?.value || "").trim(),
    shift: ($("filter-shift")?.value || "").trim(),
    name: ($("search-name")?.value || "").trim().toLowerCase(),
    code: ($("search-code")?.value || "").trim(),
    role: ($("search-role")?.value || "").trim().toLowerCase(),
  };

  let rows = (allOrders || []).slice();

  // employee sees only own
  if (!isAdmin()) {
    const myCode = String(currentUser?.code || "").trim();
    rows = rows.filter(o => String(o.code || "").trim() === myCode);
  }

  const filtered = rows.filter(o => {
    const d = new Date(o.requestedDate);
    const fullName = `${o.ovog || ""} ${o.ner || ""}`.toLowerCase();

    if (f.name && !fullName.includes(f.name)) return false;
    if (f.code && !String(o.code || "").includes(f.code)) return false;
    if (f.role && !String(o.role || "").toLowerCase().includes(f.role)) return false;

    if (f.item && String(o.item || "") !== f.item) return false;
    if (f.status && String(o.status || "") !== f.status) return false;

    if (f.year && (!isNaN(d) ? String(d.getFullYear()) : "") !== f.year) return false;
    if (f.month && (!isNaN(d) ? String(d.getMonth()+1).padStart(2,"0") : "") !== f.month) return false;

    if (f.place && String(o.place || "") !== f.place) return false;
    if (f.dept && String(o.department || "") !== f.dept) return false;
    if (f.shift && String(o.shift || "") !== f.shift) return false;

    return true;
  });

  renderOrders(filtered);
};

// ---------- Orders render ----------
function renderOrders(listData) {
  const list = $("orders-list");
  if (!list) return;

  applyRoleMode();

  const rows = listData || [];
  if (!rows.length) {
    list.innerHTML = `<div class="muted" style="padding:12px 0;">Мэдээлэл олдсонгүй</div>`;
    return;
  }

  const sorted = rows.slice().sort((a,b)=> new Date(b.requestedDate) - new Date(a.requestedDate));

  list.innerHTML = sorted.map(o => {
    const st = statusMeta(o.status);
    const empName = `${esc(o.ovog || "")} ${esc(o.ner || "")}`.trim() || "—";
    const empId = esc(o.code || "—");

    const place = esc(o.place || "—");
    const dept = esc(o.department || "—");
    const role = esc(o.role || "—");
    const shift = esc(o.shift || "—");
    const item = esc(o.item || "—");
    const sizeLine = `Размер: ${esc(o.size || "—")}`;
    const qtyVal = o.quantity ?? o.qty ?? "—";
    const qtyLine = `${esc(qtyVal)} ширхэг`;
    const date = esc(fmtDateOnly(o.requestedDate));

    const isPending = String(o.status || "") === "Хүлээгдэж буй";
    let actions = "—";
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
        <div class="col-emp">
          <div class="emp-name">${empName}</div>
          <div class="emp-id">ID:${empId}</div>
        </div>

        <div class="col-place">
          <div class="place-main">${place}</div>
          <div class="place-sub">Хэлтэс: ${dept}</div>
        </div>

        <div class="col-role">${role}</div>
        <div class="col-shift">${shift}</div>

        <div class="col-item">
          <div style="font-weight:800">${item}</div>
          <div class="place-sub">${esc(sizeLine)}</div>
        </div>

        <div class="col-qty">${qtyLine}</div>
        <div class="col-date">${date}</div>

        <div class="col-status">
          <span class="status ${st.cls}">${esc(st.label)}</span>
        </div>

        <div class="col-actions">${actions}</div>
      </div>
    `;
  }).join("");
}

window.decideOrder = async (id, status) => {
  try {
    // optimistic
    const idx = allOrders.findIndex(x => String(x.id) === String(id));
    if (idx >= 0) allOrders[idx].status = status;
    applyFilters();

    const r = await apiPost({ action: "update_status", id, status });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    await refreshData();
  } catch (e) {
    popupError(e.message || String(e));
    await refreshData();
  }
};

// ---------- Request (employee) ----------
function fillRequestForm() {
  const itemSel = $("req-item");
  if (!itemSel) return;
  setSelectOptions(itemSel, allItems.map(x => x.name), "Сонгох");
  itemSel.addEventListener("change", () => fillSizeOptions());
  fillSizeOptions();
}
function fillSizeOptions() {
  const itemName = ($("req-item")?.value || "").trim();
  const sizeSel = $("req-size");
  if (!sizeSel) return;
  const it = allItems.find(x => String(x.name) === itemName);
  const sizes = it ? String(it.sizes || "").split(",").map(s => s.trim()).filter(Boolean) : [];
  setSelectOptions(sizeSel, sizes, "Сонгох");
}

window.submitOrder = async () => {
  try {
    if (!currentUser) return;

    const item = ($("req-item")?.value || "").trim();
    const size = ($("req-size")?.value || "").trim();
    let qty = parseInt(($("req-qty")?.value || "1"), 10);
    if (!qty || qty < 1) qty = 1;

    if (!item) return popupError("Бараа сонгоно уу");
    if (!size) return popupError("Хэмжээ сонгоно уу");

    showLoading(true, "Хүсэлт илгээж байна...");
    const r = await apiPost({ action: "add_order", code: currentUser.code, item, size, qty });
    if (!r.success) throw new Error(r.msg || "Илгээхэд алдаа");

    popupOk("Хүсэлт амжилттай илгээгдлээ");
    await refreshData();
    await renderUserHistory();
    showTab("orders", $("nav-orders"));
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------- History ----------
async function renderUserHistory() {
  const box = $("user-history");
  if (!box) return;
  if (!currentUser || isAdmin()) {
    box.innerHTML = `<div class="muted">Зөвхөн ажилтны хэсэгт харагдана.</div>`;
    return;
  }

  try {
    const r = await apiPost({ action: "get_user_history", code: currentUser.code });
    if (!r.success) throw new Error(r.msg || "History татахад алдаа");

    const hist = r.history || [];
    if (!hist.length) {
      box.innerHTML = `<div class="muted">Түүх хоосон байна.</div>`;
      return;
    }
    box.innerHTML = hist
      .slice()
      .sort((a,b)=> new Date(b.date)-new Date(a.date))
      .map(h => `
        <div class="hist-card">
          <div class="kv">
            <div><div class="k">Огноо</div><div class="v">${esc(fmtDateOnly(h.date))}</div></div>
            <div><div class="k">Бараа</div><div class="v">${esc(h.item || "")}</div></div>
            <div><div class="k">Хэмжээ</div><div class="v">Размер: ${esc(h.size || "")}</div></div>
            <div><div class="k">Тоо</div><div class="v">${esc(h.qty || "")} ширхэг</div></div>
          </div>
        </div>
      `).join("");
  } catch (e) {
    box.innerHTML = `<div class="muted">${esc(e.message || String(e))}</div>`;
  }
}

// ---------- Items (admin) ----------
window.clearItemSearch = () => { if ($("item-search")) $("item-search").value = ""; renderItems(); };

window.addItem = async () => {
  if (!isAdmin()) return popupError("Admin эрх хэрэгтэй");
  const name = ($("new-item-name")?.value || "").trim();
  const sizes = ($("new-item-sizes")?.value || "").trim();
  if (!name) return popupError("Барааны нэр оруулна уу");
  try {
    showLoading(true, "Нэмэж байна...");
    const r = await apiPost({ action: "add_item", name, sizes });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    $("new-item-name").value = "";
    $("new-item-sizes").value = "";
    await refreshData();
    popupOk("Бараа нэмэгдлээ");
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

function renderItems() {
  const box = $("items-list");
  if (!box) return;
  if (!isAdmin()) {
    box.innerHTML = `<div class="muted">Зөвхөн Admin харна.</div>`;
    return;
  }

  const q = ($("item-search")?.value || "").trim().toLowerCase();
  const items = (allItems || []).filter(it => !q || String(it.name||"").toLowerCase().includes(q));

  if (!items.length) {
    box.innerHTML = `<div class="muted">Бараа олдсонгүй.</div>`;
    return;
  }

  box.innerHTML = items.map(it => `
    <div class="item-card">
      <div class="kv">
        <div><div class="k">Нэр</div><div class="v">${esc(it.name)}</div></div>
        <div><div class="k">Size</div><div class="v">${esc(it.sizes || "")}</div></div>
        <div><div class="k">Locked</div><div class="v">${it.locked ? "ТИЙМ" : "ҮГҮЙ"}</div></div>
      </div>
      <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn" onclick="promptUpdateItem('${esc(it.name)}','${esc(it.sizes||"")}')" ${it.locked ? "disabled" : ""}>ЗАСАХ</button>
        <button class="btn danger" onclick="deleteItem('${esc(it.name)}')" ${it.locked ? "disabled" : ""}>УСТГАХ</button>
        <button class="btn" onclick="showItemHistory('${esc(it.name)}')">ТҮҮХ</button>
      </div>
    </div>
  `).join("");
}

window.promptUpdateItem = (oldName, oldSizes) => {
  openModal("Бараа засах", `
    <div class="form">
      <div class="label">Хуучин нэр</div>
      <input class="input" value="${esc(oldName)}" disabled />
      <div class="label">Шинэ нэр</div>
      <input id="upd-item-name" class="input" value="${esc(oldName)}" />
      <div class="label">Size-үүд</div>
      <input id="upd-item-sizes" class="input" value="${esc(oldSizes)}" />
      <div class="modal-actions">
        <button class="btn" onclick="closeModal()">Болих</button>
        <button class="btn primary" onclick="updateItem('${esc(oldName)}')">Хадгалах</button>
      </div>
    </div>
  `);
};

window.updateItem = async (oldName) => {
  try {
    const newName = ($("upd-item-name")?.value || "").trim();
    const sizes = ($("upd-item-sizes")?.value || "").trim();
    if (!newName) return popupError("Нэр хоосон байж болохгүй");

    showLoading(true, "Засаж байна...");
    const r = await apiPost({ action: "update_item", oldName, newName, sizes });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    closeModal();
    await refreshData();
    popupOk("Засагдлаа");
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.deleteItem = async (name) => {
  try {
    if (!confirm(`"${name}" устгах уу?`)) return;
    showLoading(true, "Устгаж байна...");
    const r = await apiPost({ action: "delete_item", name });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    await refreshData();
    popupOk("Устгагдлаа");
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.showItemHistory = async (item) => {
  try {
    showLoading(true, "Түүх татаж байна...");
    const r = await apiPost({ action: "get_item_history", item });
    if (!r.success) throw new Error(r.msg || "Алдаа");

    const hist = r.history || [];
    openModal(`Түүх: ${item}`, `
      <div class="history-list">
        ${hist.length ? hist.map(h=>`
          <div class="hist-card">
            <div class="kv">
              <div><div class="k">Огноо</div><div class="v">${esc(fmtDateOnly(h.date))}</div></div>
              <div><div class="k">Код</div><div class="v">${esc(h.code)}</div></div>
              <div><div class="k">Нэр</div><div class="v">${esc(h.ovog||"")} ${esc(h.ner||"")}</div></div>
              <div><div class="k">Хэмжээ</div><div class="v">Размер: ${esc(h.size||"")}</div></div>
              <div><div class="k">Тоо</div><div class="v">${esc(h.qty||"")} ширхэг</div></div>
            </div>
          </div>
        `).join("") : `<div class="muted">Түүх хоосон байна.</div>`}
      </div>
      <div class="modal-actions"><button class="btn" onclick="closeModal()">Хаах</button></div>
    `);
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------- Users (admin) ----------
window.addUser = async () => {
  if (!isAdmin()) return popupError("Admin эрх хэрэгтэй");

  const code = ($("u-code")?.value || "").trim();
  const pass = ($("u-pass")?.value || "").trim() || "12345";
  const ner = ($("u-ner")?.value || "").trim();
  const ovog = ($("u-ovog")?.value || "").trim();
  const role = ($("u-role")?.value || "").trim();
  const place = ($("u-place")?.value || "").trim();
  const department = ($("u-dept")?.value || "").trim();
  const shift = ($("u-shift")?.value || "").trim();

  if (!code || !ner) return popupError("Код болон нэр заавал");

  try {
    showLoading(true, "Нэмэж байна...");
    const r = await apiPost({ action: "add_user", code, pass, ner, ovog, role, place, department, shift });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    ["u-code","u-pass","u-ner","u-ovog","u-role","u-place","u-dept","u-shift"].forEach(id => { if($(id)) $(id).value=""; });
    await refreshData();
    popupOk("Ажилтан нэмэгдлээ");
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

function renderUsers() {
  const box = $("users-list");
  if (!box) return;

  if (!isAdmin()) {
    box.innerHTML = `<div class="muted">Зөвхөн Admin харна.</div>`;
    return;
  }

  if (!allUsers.length) {
    box.innerHTML = `<div class="muted">Ажилтан олдсонгүй.</div>`;
    return;
  }

  box.innerHTML = allUsers.map(u => `
    <div class="user-card">
      <div class="kv">
        <div><div class="k">Код</div><div class="v">${esc(u.code)}</div></div>
        <div><div class="k">Нэр</div><div class="v">${esc(u.ovog||"")} ${esc(u.ner||"")}</div></div>
        <div><div class="k">Албан тушаал</div><div class="v">${esc(u.role||"")}</div></div>
        <div><div class="k">Газар</div><div class="v">${esc(u.place||"")}</div></div>
        <div><div class="k">Хэлтэс</div><div class="v">${esc(u.department||"")}</div></div>
        <div><div class="k">Ээлж</div><div class="v">${esc(u.shift||"")}</div></div>
        <div><div class="k">Locked</div><div class="v">${u.locked ? "ТИЙМ" : "ҮГҮЙ"}</div></div>
      </div>
      <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn" onclick="promptUpdateUser('${esc(u.code)}')" ${u.locked ? "" : ""}>ЗАСАХ</button>
        <button class="btn danger" onclick="deleteUser('${esc(u.code)}')" ${u.locked ? "disabled" : ""}>УСТГАХ</button>
      </div>
    </div>
  `).join("");
}

window.promptUpdateUser = (code) => {
  const u = allUsers.find(x => String(x.code) === String(code));
  if (!u) return popupError("Ажилтан олдсонгүй");

  openModal("Ажилтан засах", `
    <div class="form">
      <div class="label">Код</div>
      <input class="input" value="${esc(u.code)}" disabled />

      <div class="label">Нууц үг (хоосон бол өөрчлөхгүй)</div>
      <input id="uu-pass" class="input" placeholder="••••••" />

      <div class="label">Нэр</div>
      <input id="uu-ner" class="input" value="${esc(u.ner||"")}" />

      <div class="label">Овог</div>
      <input id="uu-ovog" class="input" value="${esc(u.ovog||"")}" />

      <div class="label">Албан тушаал</div>
      <input id="uu-role" class="input" value="${esc(u.role||"")}" />

      <div class="label">Газар</div>
      <input id="uu-place" class="input" value="${esc(u.place||"")}" />

      <div class="label">Хэлтэс</div>
      <input id="uu-dept" class="input" value="${esc(u.department||"")}" />

      <div class="label">Ээлж</div>
      <input id="uu-shift" class="input" value="${esc(u.shift||"")}" />

      <div class="modal-actions">
        <button class="btn" onclick="closeModal()">Болих</button>
        <button class="btn primary" onclick="updateUser('${esc(u.code)}')">Хадгалах</button>
      </div>
    </div>
  `);
};

window.updateUser = async (code) => {
  try {
    showLoading(true, "Засаж байна...");
    const payload = {
      action: "update_user",
      code,
      pass: ($("uu-pass")?.value || "").trim(),
      ner: ($("uu-ner")?.value || "").trim(),
      ovog: ($("uu-ovog")?.value || "").trim(),
      role: ($("uu-role")?.value || "").trim(),
      place: ($("uu-place")?.value || "").trim(),
      department: ($("uu-dept")?.value || "").trim(),
      shift: ($("uu-shift")?.value || "").trim(),
    };
    const r = await apiPost(payload);
    if (!r.success) throw new Error(r.msg || "Алдаа");
    closeModal();
    await refreshData();
    popupOk("Засагдлаа");
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.deleteUser = async (code) => {
  try {
    if (!confirm(`Код: ${code} устгах уу?`)) return;
    showLoading(true, "Устгаж байна...");
    const r = await apiPost({ action: "delete_user", code });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    await refreshData();
    popupOk("Устгагдлаа");
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------- Password ----------
window.changePass = async () => {
  if (!currentUser || isAdmin()) return popupError("Зөвхөн ажилтан өөрийн нууц үгээ солино");
  const oldP = ($("old-pass")?.value || "").trim();
  const newP = ($("new-pass")?.value || "").trim();
  if (!oldP || !newP) return popupError("Мэдээлэл дутуу");
  try {
    showLoading(true, "Сольж байна...");
    const r = await apiPost({ action: "change_pass", code: currentUser.code, oldP, newP });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    $("old-pass").value = "";
    $("new-pass").value = "";
    popupOk("Нууц үг солигдлоо");
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------- Data refresh ----------
window.refreshData = async () => {
  if (!currentUser) return;
  try {
    showLoading(true, "Өгөгдөл татаж байна...");
    const r = await apiPost({ action: "get_all_data" });
    if (!r.success) throw new Error(r.msg || "Дата татахад алдаа");

    allOrders = r.orders || [];
    allItems = r.items || [];

    // admin users
    if (isAdmin()) {
      const u = await apiPost({ action: "get_users" });
      if (u.success) allUsers = u.users || [];
    } else {
      allUsers = [];
    }

    populateFilters();
    fillRequestForm();
    renderItems();
    renderUsers();
    applyFilters();
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------- Login / Logout ----------
window.login = async () => {
  const code = ($("login-code")?.value || "").trim();
  const pass = ($("login-pass")?.value || "").trim();
  if (!code || !pass) return popupError("Код, нууц үг оруулна уу");

  try {
    showLoading(true, "Нэвтэрч байна...");
    const r = await apiPost({ action: "login", code, pass });
    if (!r.success) throw new Error(r.msg || "Нэвтрэх амжилтгүй");

    currentUser = r.user;
    setLoggedInUI(true);
    applyRoleMode();

    await refreshData();

    // default tab
    if (isAdmin()) showTab("orders", $("nav-orders"));
    else showTab("request", $("nav-request"));
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.logout = () => {
  currentUser = null;
  allOrders = [];
  allItems = [];
  allUsers = [];
  setLoggedInUI(false);
  if ($("login-code")) $("login-code").value = "";
  if ($("login-pass")) $("login-pass").value = "";
};

// ---------- Init ----------
function init() {
  setLoggedInUI(false);
  bindFilterEvents();

  $("login-pass")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") login();
  });
}
window.addEventListener("load", init);
