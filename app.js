const API_URL = "https://script.google.com/macros/s/AKfycby_ONE2OPywmOQYBy_FoIqKpBjvBU7lo2Prt9z3TVhVwQqpdgP68w0o3OvnAtdUx3Rp/exec";

/* ---------------- State ---------------- */
let currentUser = null;
let requests = [];
let requestItems = [];
let itemsMaster = [];
let packsMaster = [];
let stockMaster = [];
let users = [];
let packBuilder = [];
let currentModalRequestId = null;
let cart = [];
let orderFilters = {
  status: "",
  shift: "",
  year: "",
  month: "",
  item: "",
  place: "",
  dept: "",
  role: "",
  code: "",
  name: "",
};

/* ---------------- Utils ---------------- */
const $ = (id) => document.getElementById(id);
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function fmtDateOnly(v) {
  const d = new Date(v);
  if (isNaN(d)) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function isAdmin() {
  return String(currentUser?.code || "").toLowerCase() === "admin" || String(currentUser?.type || "").toLowerCase() === "admin";
}
function popupOk(msg) { alert(msg || "Амжилттай"); }
function popupError(msg) { alert(msg || "Алдаа гарлаа"); }
function showLoading(on) {
  document.body.style.cursor = on ? "progress" : "default";
}
function openModal(title, html) {
  closeModal();
  const wrap = document.createElement("div");
  wrap.id = "global-modal";
  wrap.className = "modal-overlay";
  wrap.innerHTML = `
    <div class="modal-card">
      <div class="modal-head">
        <div style="font-weight:1000;">${esc(title || "Мэдээлэл")}</div>
        <button class="btn" onclick="closeModal()">ХААХ</button>
      </div>
      <div class="modal-body">${html || ""}</div>
    </div>`;
  document.body.appendChild(wrap);
}
function closeModal() {
  const el = $("global-modal");
  if (el) el.remove();
}
window.closeModal = closeModal;

async function apiPost(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(text || "Server response parse error");
  }
}

function getVisibleRequests() {
  if (isAdmin()) return requests.slice();
  const myCode = String(currentUser?.code || "").trim();
  return requests.filter((r) => String(r.code || "").trim() === myCode);
}
function linesForRequest(reqId) {
  return requestItems.filter((x) => String(x.request_id) === String(reqId));
}
function statusBadge(status) {
  const s = String(status || "Хүлээгдэж буй").trim();
  if (s === "Зөвшөөрсөн" || s === "Шийдвэрлэсэн") return `<span class="status st-approved">${esc(s)}</span>`;
  if (s === "Татгалзсан") return `<span class="status st-rejected">${esc(s)}</span>`;
  if (s === "Хэсэгчлэн шийдвэрлэсэн") return `<span class="status pill decided">${esc(s)}</span>`;
  return `<span class="status st-pending">${esc(s)}</span>`;
}
function groupPacks(lines) {
  const map = {};
  (lines || []).forEach((p) => {
    const name = String(p.pack_name || "").trim();
    if (!name) return;
    if (!map[name]) map[name] = { pack_name: name, active: true, lines: [] };
    if (String(p.active || "").toLowerCase() === "false") map[name].active = false;
    map[name].lines.push({
      item: String(p.item || "").trim(),
      default_size: String(p.default_size || "").trim(),
      default_qty: Number(p.default_qty || 1),
    });
  });
  return Object.values(map).sort((a, b) => a.pack_name.localeCompare(b.pack_name, "mn"));
}

/* ---------------- Auth / boot ---------------- */
window.login = async function login() {
  const code = $("login-code")?.value?.trim() || "";
  const pass = $("login-pass")?.value?.trim() || "";
  if (!code || !pass) return popupError("Код, нууц үгээ оруулна уу.");
  try {
    showLoading(true);
    const r = await apiPost({ action: "login", code, pass });
    if (!r.success) throw new Error(r.msg || "Нэвтрэх алдаа");
    currentUser = r.user || null;
    if ($("login-screen")) $("login-screen").classList.add("hidden");
    if ($("main-screen")) $("main-screen").classList.remove("hidden");
    applyRoleVisibility();
    await refreshData(true);
    if (isAdmin()) {
      showTab("orders", document.querySelector('.nav-btn[data-tab="orders"]'));
    } else {
      showTab("orders", document.querySelector('.nav-btn[data-tab="orders"]'));
    }
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

function applyRoleVisibility() {
  document.querySelectorAll(".admin-only").forEach((el) => {
    el.style.display = isAdmin() ? "" : "none";
  });
}

async function refreshData(showMsg) {
  try {
    const r = await apiPost({ action: "get_all_data" });
    if (!r.success) throw new Error(r.msg || "Мэдээлэл татах үед алдаа гарлаа.");
    requests = Array.isArray(r.requests) ? r.requests : [];
    requestItems = Array.isArray(r.request_items) ? r.request_items : [];
    itemsMaster = Array.isArray(r.items) ? r.items : [];
    packsMaster = Array.isArray(r.packs) ? r.packs : [];
    stockMaster = Array.isArray(r.stock) ? r.stock : [];

    try {
      const ur = await apiPost({ action: "get_users" });
      users = ur.success && Array.isArray(ur.users) ? ur.users : [];
    } catch (_) {
      users = [];
    }

    populateOrderFilters();
    renderRequests();
    renderItemsTabAll();
    renderUsers();
    renderUserHistory();
    fillRequestForm();
    if (showMsg) popupOk("Амжилттай нэвтэрлээ.");
  } catch (e) {
    popupError(e.message || String(e));
  }
}
window.refreshData = refreshData;

/* ---------------- Tabs ---------------- */
window.showTab = function showTab(tabName, btn) {
  if (!isAdmin() && tabName === "items") return popupError("Зөвхөн админ харна.");
  if (!isAdmin() && tabName === "users") return popupError("Зөвхөн админ харна.");
  if (isAdmin() && tabName === "request") return popupError("Админ талд захиалга гаргах шаардлагагүй.");

  document.querySelectorAll(".tab-content").forEach((el) => el.classList.add("hidden"));
  $("tab-" + tabName)?.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");

  if (tabName === "orders") renderRequests();
  if (tabName === "request") { fillRequestForm(); renderCart(); renderUserHistory(); }
  if (tabName === "items") renderItemsTabAll();
  if (tabName === "users") renderUsers();
};

/* ---------------- Orders ---------------- */
function populateSelect(id, values, includeAll = true) {
  const el = $(id);
  if (!el) return;
  const current = el.value;
  const arr = Array.from(new Set((values || []).filter(Boolean).map((x) => String(x).trim()))).sort((a, b) => a.localeCompare(b, "mn"));
  el.innerHTML = `${includeAll ? '<option value="">Бүгд</option>' : ''}${arr.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("")}`;
  if (arr.includes(current)) el.value = current;
}

function populateOrderFilters() {
  populateSelect("f-year", requests.map((r) => new Date(r.requestedDate).getFullYear()).filter(Boolean));
  populateSelect("f-month", requests.map((r) => String(new Date(r.requestedDate).getMonth() + 1).padStart(2, "0")).filter(Boolean));
  populateSelect("f-item", requestItems.map((x) => x.item));
  populateSelect("f-place", requests.map((r) => r.place));
  populateSelect("f-dept", requests.map((r) => r.department));
}

window.applyFilters = function applyFilters() {
  orderFilters.year = $("f-year")?.value || "";
  orderFilters.month = $("f-month")?.value || "";
  orderFilters.item = $("f-item")?.value || "";
  orderFilters.place = $("f-place")?.value || "";
  orderFilters.dept = $("f-dept")?.value || "";
  orderFilters.role = $("f-role")?.value?.trim() || "";
  orderFilters.code = $("f-code")?.value?.trim() || "";
  orderFilters.name = $("f-name")?.value?.trim() || "";
  renderRequests();
};
window.clearFilters = function clearFilters() {
  ["f-year","f-month","f-item","f-place","f-dept","f-role","f-code","f-name"].forEach(id => { if ($(id)) $(id).value = ""; });
  Object.keys(orderFilters).forEach(k => orderFilters[k] = "");
  renderRequests();
};

function passFilters(r) {
  const d = new Date(r.requestedDate);
  const year = isNaN(d) ? "" : String(d.getFullYear());
  const month = isNaN(d) ? "" : String(d.getMonth() + 1).padStart(2, "0");
  const lines = linesForRequest(r.request_id);
  const hasItem = !orderFilters.item || lines.some((l) => String(l.item || "") === String(orderFilters.item));
  return (!orderFilters.year || orderFilters.year === year)
    && (!orderFilters.month || orderFilters.month === month)
    && (!orderFilters.place || String(r.place || "") === String(orderFilters.place))
    && (!orderFilters.dept || String(r.department || "") === String(orderFilters.dept))
    && (!orderFilters.role || String(r.role || "").toLowerCase().includes(orderFilters.role.toLowerCase()))
    && (!orderFilters.code || String(r.code || "").toLowerCase().includes(orderFilters.code.toLowerCase()))
    && (!orderFilters.name || `${r.ovog || ""} ${r.ner || ""}`.toLowerCase().includes(orderFilters.name.toLowerCase()))
    && hasItem;
}

window.renderRequests = renderRequests;
function renderRequests() {
  const list = $("requests-list");
  if (!list) return;
  const data = getVisibleRequests().filter(passFilters).slice().sort((a, b) => new Date(b.requestedDate) - new Date(a.requestedDate));
  if (!data.length) {
    list.innerHTML = `<div style="padding:16px;color:#94a3b8;">Мэдээлэл олдсонгүй.</div>`;
    return;
  }
  list.innerHTML = data.map((req) => {
    const lines = linesForRequest(req.request_id);
    const itemsHtml = lines.map((l) => `
      <div class="item-line">
        <div class="item-name">${esc(l.item || "")}</div>
        <div class="item-sub">Размер: ${esc(l.size || "")} · Тоо: ${esc(l.qty || "")}</div>
      </div>
    `).join("");
    return `
      <div class="request-row ${isAdmin() ? 'orders-admin-grid' : 'orders-user-grid'}" onclick="openRequestDetail('${esc(req.request_id)}')">
        <div>
          <div class="req-id">#${esc(req.request_id)}</div>
          <div class="sub">${esc(fmtDateOnly(req.requestedDate))}</div>
        </div>
        <div class="items-vertical">${itemsHtml}</div>
        ${isAdmin() ? `<div>${esc(req.ovog || "")} ${esc(req.ner || "")}</div>` : ``}
        ${isAdmin() ? `<div>${esc(req.place || "")} / ${esc(req.department || "")}</div>` : ``}
        <div>${statusBadge(req.overall_status)}</div>
        <div>${esc(req.shift || "")}</div>
        ${isAdmin() ? `<div>${esc(req.code || "")}</div>` : ``}
      </div>`;
  }).join("");
}

window.openRequestDetail = function openRequestDetail(requestId) {
  const req = requests.find((x) => String(x.request_id) === String(requestId));
  if (!req) return popupError("Захиалга олдсонгүй");
  const lines = linesForRequest(requestId);
  currentModalRequestId = requestId;

  const rows = lines.map((l) => {
    const decided = String(l.item_status || "Хүлээгдэж буй");
    if (isAdmin()) {
      return `
      <div class="detail-table-row detail-admin-grid">
        <div class="cell-strong">${esc(l.item || "")}</div>
        <div>${esc(l.size || "")}</div>
        <div>${esc(l.qty || "")}</div>
        <div>${statusBadge(decided)}</div>
        <div><input id="iss-size-${esc(l.line_id)}" class="issue-field" value="${esc(l.issued_size || l.size || "")}" /></div>
        <div><input id="iss-qty-${esc(l.line_id)}" class="issue-field" type="number" min="0" value="${esc(l.issued_qty || l.qty || 0)}" /></div>
        <div class="detail-actions">
          <button class="btn action-icon approve" onclick="event.stopPropagation();issueLine('${esc(l.line_id)}')">✓</button>
          <button class="btn action-icon reject" onclick="event.stopPropagation();rejectLine('${esc(l.line_id)}')">✕</button>
        </div>
      </div>`;
    }
    return `
      <div class="detail-table-row detail-user-grid">
        <div class="cell-strong">${esc(l.item || "")}</div>
        <div>${esc(l.size || "")}</div>
        <div>${esc(l.qty || "")}</div>
        <div>${statusBadge(decided)}</div>
      </div>`;
  }).join("");

  const footer = isAdmin()
    ? `<div class="detail-footer"><button class="btn" onclick="closeModal()">ХААХ</button></div>`
    : `<div class="detail-footer">
         ${req.received_confirmed ? `<span class="status st-approved">ХҮЛЭЭН АВСАН</span>` : `<button class="btn primary" onclick="confirmReceivePrompt()">ХҮЛЭЭН АВСАН БАТАЛГААЖУУЛАХ</button>`}
         <button class="btn" onclick="closeModal()">ХААХ</button>
       </div>`;

  openModal(`Захиалга #${requestId}`, `
    <div class="detail-meta">
      <div class="detail-request-title">${esc(req.ovog || "")} ${esc(req.ner || "")}</div>
      <div class="detail-meta-row">
        ${statusBadge(req.overall_status)}
        <span class="detail-meta-sep">•</span>
        <span>${esc(req.place || "")}</span>
        <span class="detail-meta-sep">•</span>
        <span>${esc(req.department || "")}</span>
      </div>
    </div>
    <div class="detail-table-wrap">
      <div class="detail-table-head ${isAdmin() ? 'detail-admin-grid' : 'detail-user-grid'}">
        <div>Бараа</div><div>Размер</div><div>Тоо</div><div>Төлөв</div>${isAdmin() ? '<div>Олгох размер</div><div>Олгох тоо</div><div>Үйлдэл</div>' : ''}
      </div>
      ${rows || `<div class="detail-empty">Мөр байхгүй.</div>`}
    </div>
    ${footer}
  `);
};

window.issueLine = async function issueLine(lineId) {
  try {
    showLoading(true);
    const issued_size = $("iss-size-" + lineId)?.value?.trim() || "";
    const issued_qty = parseInt($("iss-qty-" + lineId)?.value || "0", 10) || 0;
    const r = await apiPost({ action: "issue_item", admin_code: currentUser?.code || "", line_id: lineId, issued_size, issued_qty });
    if (!r.success) throw new Error(r.msg || "Олгох үед алдаа");
    await refreshData(false);
    openRequestDetail(currentModalRequestId);
  } catch (e) { popupError(e.message || String(e)); }
  finally { showLoading(false); }
};
window.rejectLine = async function rejectLine(lineId) {
  try {
    showLoading(true);
    const r = await apiPost({ action: "update_item_status", line_id: lineId, status: "Татгалзсан" });
    if (!r.success) throw new Error(r.msg || "Татгалзах үед алдаа");
    await refreshData(false);
    openRequestDetail(currentModalRequestId);
  } catch (e) { popupError(e.message || String(e)); }
  finally { showLoading(false); }
};
window.confirmReceivePrompt = async function confirmReceivePrompt() {
  const pin = prompt("PIN оруулна уу");
  if (!pin) return;
  try {
    showLoading(true);
    const r = await apiPost({ action: "confirm_receive", code: currentUser?.code || "", request_id: currentModalRequestId, pin });
    if (!r.success) throw new Error(r.msg || "Баталгаажуулах үед алдаа");
    await refreshData(false);
    closeModal();
    popupOk("Хүлээн авалт баталгаажлаа.");
  } catch (e) { popupError(e.message || String(e)); }
  finally { showLoading(false); }
};

/* ---------------- Request tab ---------------- */
function fillRequestForm() {
  const sel = $("req-item");
  if (!sel) return;
  sel.innerHTML = `<option value="">Сонгох</option>${itemsMaster
    .filter((x) => String(x.locked).toLowerCase() !== "true")
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "mn"))
    .map((it) => `<option value="${esc(it.name)}">${esc(it.name)}</option>`).join("")}`;
  fillSizeSelect();
}
window.fillRequestForm = fillRequestForm;
window.fillSizeSelect = function fillSizeSelect() {
  const itemName = $("req-item")?.value || "";
  const sizeSel = $("req-size");
  if (!sizeSel) return;
  const item = itemsMaster.find((x) => String(x.name) === String(itemName));
  const sizes = String(item?.sizes || "").split(",").map((x) => x.trim()).filter(Boolean);
  sizeSel.innerHTML = `<option value="">Сонгох</option>${sizes.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("")}`;
};
window.addToCart = function addToCart() {
  const item = $("req-item")?.value || "";
  const size = $("req-size")?.value || "";
  let qty = parseInt($("req-qty")?.value || "1", 10);
  if (!item || !size) return popupError("Бараа, размер сонгоно уу.");
  if (!qty || qty < 1) qty = 1;
  cart.push({ item, size, qty });
  renderCart();
};
window.renderCart = renderCart;
function renderCart() {
  const box = $("request-cart");
  if (!box) return;
  if (!cart.length) {
    box.innerHTML = `<div class="muted">Сагс хоосон.</div>`;
    return;
  }
  box.innerHTML = cart.map((x, idx) => `
    <div class="history-item" style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
      <div><b>${esc(x.item)}</b> · ${esc(x.size)} · ${esc(x.qty)} ш</div>
      <button class="btn" onclick="removeCartLine(${idx})">УСТГАХ</button>
    </div>`).join("") + `
    <div style="margin-top:12px;display:flex;justify-content:flex-end;gap:10px;">
      <button class="btn" onclick="clearCart()">ЦЭВЭРЛЭХ</button>
      <button class="btn primary" onclick="submitRequest()">ЗАХИАЛАХ</button>
    </div>`;
}
window.removeCartLine = function removeCartLine(idx) { cart.splice(idx, 1); renderCart(); };
window.clearCart = function clearCart() { cart = []; renderCart(); };
window.submitRequest = async function submitRequest() {
  if (!cart.length) return popupError("Сагс хоосон.");
  try {
    showLoading(true);
    const r = await apiPost({ action: "add_request", code: currentUser?.code || "", items: cart });
    if (!r.success) throw new Error(r.msg || "Захиалга үүсгэх үед алдаа гарлаа.");
    cart = [];
    renderCart();
    await refreshData(false);
    popupOk("Захиалга амжилттай үүслээ.");
  } catch (e) { popupError(e.message || String(e)); }
  finally { showLoading(false); }
};

window.renderUserHistory = async function renderUserHistory() {
  const box = $("user-history");
  if (!box || !currentUser || isAdmin()) return;
  try {
    const r = await apiPost({ action: "get_user_history", code: currentUser.code });
    if (!r.success) throw new Error(r.msg || "Түүх ачааллах үед алдаа");
    const hist = Array.isArray(r.history) ? r.history : [];
    box.innerHTML = hist.length ? hist.map((h) => `
      <div class="history-item">
        <div class="muted">${esc(fmtDateOnly(h.date))}</div>
        <div style="font-weight:900;">${esc(h.item || "")}</div>
        <div class="muted">Размер: ${esc(h.size || "")} · Тоо: ${esc(h.qty || "")}</div>
      </div>`).join("") : `<div class="muted">Түүх хоосон.</div>`;
  } catch (e) {
    box.innerHTML = `<div class="muted">${esc(e.message || String(e))}</div>`;
  }
};

/* ---------------- Items ---------------- */
window.renderItemsTabAll = renderItemsTabAll;
function renderItemsTabAll() {
  renderItems();
  fillPackItemSelect();
  renderPackBuilder();
  renderPacks();
}

window.renderItems = renderItems;
function renderItems() {
  const box = $("items-list");
  if (!box) return;
  if (!isAdmin()) {
    box.innerHTML = `<div class="muted">Зөвхөн Admin харна.</div>`;
    return;
  }
  const q = ($("item-search")?.value || "").trim().toLowerCase();
  const data = itemsMaster
    .filter((it) => !q || String(it.name || "").toLowerCase().includes(q))
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "mn"));

  if (!data.length) {
    box.innerHTML = `<div class="muted">Бараа олдсонгүй.</div>`;
    return;
  }

  box.innerHTML = `
    <div class="mini-table items-table">
      <div class="mini-th">Бараа</div>
      <div class="mini-th">Size</div>
      <div class="mini-th">Locked</div>
      <div class="mini-th" style="text-align:right;">Үйлдэл</div>
      ${data.map((it) => {
        const locked = String(it.locked).toLowerCase() === "true";
        return `
          <div class="mini-td" style="font-weight:900;">${esc(it.name)}</div>
          <div class="mini-td">${esc(it.sizes || "")}</div>
          <div class="mini-td">${locked ? `<span class="status st-rejected">LOCKED</span>` : `<span class="status st-approved">OPEN</span>`}</div>
          <div class="mini-td" style="display:flex;gap:8px;justify-content:flex-end;">
            <button class="icon-btn btn-icon" title="Засах" onclick="openEditItem('${esc(it.name)}');event.stopPropagation();">✏️</button>
            <button class="icon-btn btn-icon" title="Устгах" onclick="deleteItem('${esc(it.name)}');event.stopPropagation();" ${locked ? "disabled" : ""}>🗑️</button>
            <button class="icon-btn btn-icon" title="Түүх" onclick="openItemHistory('${esc(it.name)}');event.stopPropagation();">🕘</button>
            <button class="icon-btn btn-icon" title="Locked солих" onclick="toggleItemLock('${esc(it.name)}');event.stopPropagation();">${locked ? "🔓" : "🔒"}</button>
          </div>`;
      }).join("")}
    </div>`;
}

window.clearItemSearch = function clearItemSearch() {
  if ($("item-search")) $("item-search").value = "";
  renderItems();
};

window.addItem = async function addItem() {
  const name = $("new-item-name")?.value?.trim() || "";
  const sizes = $("new-item-sizes")?.value?.trim() || "";
  if (!name) return popupError("Барааны нэр оруулна уу.");
  try {
    showLoading(true);
    const r = await apiPost({ action: "add_item", name, sizes });
    if (!r.success) throw new Error(r.msg || "Бараа нэмэх үед алдаа гарлаа.");
    if ($("new-item-name")) $("new-item-name").value = "";
    if ($("new-item-sizes")) $("new-item-sizes").value = "";
    await refreshData(false);
    popupOk("Бараа амжилттай нэмэгдлээ.");
  } catch (e) { popupError(e.message || String(e)); }
  finally { showLoading(false); }
};

window.openEditItem = function openEditItem(name) {
  const it = itemsMaster.find((x) => String(x.name) === String(name));
  if (!it) return popupError("Бараа олдсонгүй");
  openModal("Бараа засах", `
    <div style="padding:14px;display:grid;gap:12px;">
      <div><div class="label">Нэр</div><input id="edit-item-name" value="${esc(it.name || "")}"/></div>
      <div><div class="label">Size-үүд</div><input id="edit-item-sizes" value="${esc(it.sizes || "")}"/></div>
      <div style="display:flex;justify-content:flex-end;gap:10px;">
        <button class="btn" onclick="closeModal()">БОЛИХ</button>
        <button class="btn primary" onclick="saveEditItem('${esc(it.name)}')">ХАДГАЛАХ</button>
      </div>
    </div>`);
};
window.saveEditItem = async function saveEditItem(oldName) {
  const newName = $("edit-item-name")?.value?.trim() || "";
  const sizes = $("edit-item-sizes")?.value?.trim() || "";
  if (!newName) return popupError("Нэр хоосон байж болохгүй");
  try {
    showLoading(true);
    const r = await apiPost({ action: "update_item", oldName, newName, sizes });
    if (!r.success) throw new Error(r.msg || "Засах үед алдаа");
    closeModal();
    await refreshData(false);
    popupOk("Амжилттай хадгаллаа.");
  } catch (e) { popupError(e.message || String(e)); }
  finally { showLoading(false); }
};
window.deleteItem = async function deleteItem(name) {
  const it = itemsMaster.find((x) => String(x.name) === String(name));
  const locked = String(it?.locked).toLowerCase() === "true";
  if (locked) return popupError("Locked=true тул устгах боломжгүй.");
  if (!confirm("Устгах уу?")) return;
  try {
    showLoading(true);
    const r = await apiPost({ action: "delete_item", name });
    if (!r.success) throw new Error(r.msg || "Устгах үед алдаа");
    await refreshData(false);
    popupOk("Устгалаа.");
  } catch (e) { popupError(e.message || String(e)); }
  finally { showLoading(false); }
};
window.toggleItemLock = async function toggleItemLock(name) {
  const it = itemsMaster.find((x) => String(x.name) === String(name));
  if (!it) return;
  const next = !(String(it.locked).toLowerCase() === "true");
  try {
    showLoading(true);
    const r = await apiPost({ action: "set_item_locked", name, locked: next });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    await refreshData(false);
  } catch (e) { popupError(e.message || String(e)); }
  finally { showLoading(false); }
};
window.openItemHistory = async function openItemHistory(name) {
  try {
    showLoading(true);
    const r = await apiPost({ action: "get_item_history", item: name });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    const hist = r.history || [];
    openModal(`Барааны түүх: ${name}`, `
      <div style="padding:14px;">
        ${hist.length ? hist.map((h) => `
          <div class="history-item">
            <div class="muted">${esc(fmtDateOnly(h.date))} · ${esc(h.code || "")}</div>
            <div style="font-weight:900;">${esc(h.ovog || "")} ${esc(h.ner || "")}</div>
            <div class="muted">Размер: ${esc(h.size || "")} · Тоо: ${esc(h.qty || "")} ширхэг</div>
          </div>`).join("") : `<div class="muted">Түүх хоосон.</div>`}
      </div>`);
  } catch (e) { popupError(e.message || String(e)); }
  finally { showLoading(false); }
};

/* ---------------- Packs ---------------- */
window.fillPackItemSelect = fillPackItemSelect;
function fillPackItemSelect() {
  const sel = $("pack-item-select");
  if (!sel) return;
  sel.innerHTML = `<option value="">Сонгох</option>${itemsMaster
    .filter((x) => String(x.locked).toLowerCase() !== "true")
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "mn"))
    .map((it) => `<option value="${esc(it.name)}">${esc(it.name)}</option>`).join("")}`;
}
window.addPackLine = function addPackLine() {
  const item = $("pack-item-select")?.value || "";
  let qty = parseInt($("pack-item-qty")?.value || "1", 10);
  if (!item) return popupError("Бараа сонгоно уу.");
  if (!qty || qty < 1) qty = 1;
  const existing = packBuilder.find((x) => String(x.item) === String(item));
  if (existing) existing.qty += qty;
  else packBuilder.push({ item, qty });
  renderPackBuilder();
};
window.removePackLine = function removePackLine(idx) { packBuilder.splice(idx, 1); renderPackBuilder(); };
window.renderPackBuilder = renderPackBuilder;
function renderPackBuilder() {
  const box = $("pack-builder-list");
  if (!box) return;
  if (!packBuilder.length) {
    box.innerHTML = `<div class="muted">Багцад бараа нэмээгүй байна.</div>`;
    return;
  }
  box.innerHTML = packBuilder.map((x, i) => `
    <div class="history-item" style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
      <div><b>${esc(x.item)}</b> · ${esc(x.qty)} ширхэг</div>
      <button class="btn" onclick="removePackLine(${i})">УСТГАХ</button>
    </div>`).join("");
}
window.savePack = async function savePack() {
  const pack_name = $("pack-name")?.value?.trim() || "";
  if (!pack_name) return popupError("Багцын нэр оруулна уу.");
  if (!packBuilder.length) return popupError("Багцад бараа нэмнэ үү.");
  try {
    showLoading(true);
    const r = await apiPost({
      action: "save_pack",
      admin_code: currentUser?.code || "",
      pack_name,
      lines: packBuilder.map((x) => ({ item: x.item, default_size: "", default_qty: x.qty }))
    });
    if (!r.success) throw new Error(r.msg || "Багц хадгалах үед алдаа гарлаа.");
    packBuilder = [];
    if ($("pack-name")) $("pack-name").value = "";
    if ($("pack-item-qty")) $("pack-item-qty").value = 1;
    await refreshData(false);
    popupOk("Багц амжилттай хадгалагдлаа.");
  } catch (e) { popupError(e.message || String(e)); }
  finally { showLoading(false); }
};
window.renderPacks = renderPacks;
function renderPacks() {
  const box = $("packs-list");
  if (!box) return;
  const groups = groupPacks(packsMaster);
  if (!groups.length) {
    box.innerHTML = `<div class="muted">Багц алга.</div>`;
    return;
  }
  box.innerHTML = groups.map((p) => {
    const activeBadge = p.active
      ? `<span class="status st-approved">ИДЭВХТЭЙ</span>`
      : `<span class="status st-rejected">ИДЭВХГҮЙ</span>`;
    const linesHtml = p.lines.map((ln) => `
      <div class="mini-td" style="display:grid;grid-template-columns:2fr 1fr;gap:10px;align-items:center;">
        <div style="font-weight:800;">${esc(ln.item)}</div>
        <div>${esc(ln.default_qty)} ширхэг</div>
      </div>`).join("");
    return `
      <div class="card" style="margin-top:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <div>
            <div style="font-weight:1000;font-size:18px;">${esc(p.pack_name)}</div>
            <div style="margin-top:6px;">${activeBadge}</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn" onclick="togglePackActive('${esc(p.pack_name)}', ${!p.active})">${p.active ? 'ИДЭВХГҮЙ' : 'ИДЭВХЖҮҮЛЭХ'}</button>
            <button class="btn danger" onclick="deletePack('${esc(p.pack_name)}')">УСТГАХ</button>
          </div>
        </div>
        <div class="mini-table" style="grid-template-columns:2fr 1fr;margin-top:12px;">${linesHtml}</div>
      </div>`;
  }).join("");
}
window.togglePackActive = async function togglePackActive(pack_name, nextActive) {
  try {
    showLoading(true);
    const r = await apiPost({ action: "set_pack_active", admin_code: currentUser?.code || "", pack_name, active: nextActive });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    await refreshData(false);
  } catch (e) { popupError(e.message || String(e)); }
  finally { showLoading(false); }
};
window.deletePack = async function deletePack(pack_name) {
  if (!confirm(`"${pack_name}" багцыг устгах уу?`)) return;
  try {
    showLoading(true);
    const r = await apiPost({ action: "delete_pack", admin_code: currentUser?.code || "", pack_name });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    await refreshData(false);
  } catch (e) { popupError(e.message || String(e)); }
  finally { showLoading(false); }
};

/* ---------------- Users ---------------- */
window.renderUsers = renderUsers;
function renderUsers() {
  const box = $("users-list");
  if (!box) return;
  if (!isAdmin()) {
    box.innerHTML = `<div class="muted">Зөвхөн Admin харна.</div>`;
    return;
  }
  if (!users.length) {
    box.innerHTML = `<div class="muted">Ажилтан алга.</div>`;
    return;
  }
  box.innerHTML = `
    <div class="mini-table users-table">
      <div class="mini-th">Код</div>
      <div class="mini-th">Нэр</div>
      <div class="mini-th">Албан тушаал</div>
      <div class="mini-th">Газар</div>
      <div class="mini-th">Хэлтэс</div>
      <div class="mini-th">Ээлж</div>
      <div class="mini-th" style="text-align:right;">Үйлдэл</div>
      ${users.map((u) => {
        const locked = String(u.locked).toLowerCase() === "true";
        return `
          <div class="mini-td">${esc(u.code)}</div>
          <div class="mini-td">${esc(u.ovog || "")} ${esc(u.ner || "")}</div>
          <div class="mini-td">${esc(u.role || "")}</div>
          <div class="mini-td">${esc(u.place || "")}</div>
          <div class="mini-td">${esc(u.department || "")}</div>
          <div class="mini-td">${esc(u.shift || "")}</div>
          <div class="mini-td" style="display:flex;gap:8px;justify-content:flex-end;">
            <button class="icon-btn btn-icon" onclick="openEditUser('${esc(u.code)}')">✏️</button>
            <button class="icon-btn btn-icon" onclick="deleteUser('${esc(u.code)}')" ${locked ? 'disabled' : ''}>🗑️</button>
            <button class="icon-btn btn-icon" onclick="toggleUserLock('${esc(u.code)}')">${locked ? '🔓' : '🔒'}</button>
            <button class="icon-btn btn-icon" onclick="openUserHistory('${esc(u.code)}')">🕘</button>
          </div>`;
      }).join("")}
    </div>`;
}
window.addUser = async function addUser() {
  const payload = {
    action: "add_user",
    code: $("u-code")?.value?.trim() || "",
    pass: $("u-pass")?.value?.trim() || "",
    ner: $("u-ner")?.value?.trim() || "",
    ovog: $("u-ovog")?.value?.trim() || "",
    role: $("u-role")?.value?.trim() || "",
    place: $("u-place")?.value?.trim() || "",
    department: $("u-dept")?.value?.trim() || "",
    shift: $("u-shift")?.value || "",
    pin: $("u-pin")?.value?.trim() || "",
  };
  if (!payload.code || !payload.ner) return popupError("Код болон нэр заавал.");
  try {
    showLoading(true);
    const r = await apiPost(payload);
    if (!r.success) throw new Error(r.msg || "Ажилтан нэмэх үед алдаа");
    ["u-code","u-pass","u-ner","u-ovog","u-role","u-place","u-dept","u-pin"].forEach(id => { if ($(id)) $(id).value = ""; });
    if ($("u-shift")) $("u-shift").value = "";
    await refreshData(false);
    popupOk("Ажилтан нэмэгдлээ.");
  } catch (e) { popupError(e.message || String(e)); }
  finally { showLoading(false); }
};
window.openEditUser = function openEditUser(code) {
  const u = users.find((x) => String(x.code) === String(code));
  if (!u) return popupError("Ажилтан олдсонгүй");
  openModal("Ажилтан засах", `
    <div style="padding:14px;display:grid;gap:12px;">
      <div><div class="label">Нууц үг</div><input id="eu-pass" value="" placeholder="Өөрчлөхгүй бол хоосон үлдээнэ"/></div>
      <div><div class="label">Нэр</div><input id="eu-ner" value="${esc(u.ner || "")}"/></div>
      <div><div class="label">Овог</div><input id="eu-ovog" value="${esc(u.ovog || "")}"/></div>
      <div><div class="label">Албан тушаал</div><input id="eu-role" value="${esc(u.role || "")}"/></div>
      <div><div class="label">Газар</div><input id="eu-place" value="${esc(u.place || "")}"/></div>
      <div><div class="label">Хэлтэс</div><input id="eu-dept" value="${esc(u.department || "")}"/></div>
      <div><div class="label">Ээлж</div><input id="eu-shift" value="${esc(u.shift || "")}"/></div>
      <div><div class="label">PIN</div><input id="eu-pin" value="${esc(u.pin || "")}"/></div>
      <div style="display:flex;justify-content:flex-end;gap:10px;">
        <button class="btn" onclick="closeModal()">БОЛИХ</button>
        <button class="btn primary" onclick="saveEditUser('${esc(code)}')">ХАДГАЛАХ</button>
      </div>
    </div>`);
};
window.saveEditUser = async function saveEditUser(code) {
  const payload = {
    action: "update_user",
    code,
    pass: $("eu-pass")?.value?.trim() || "",
    ner: $("eu-ner")?.value?.trim() || "",
    ovog: $("eu-ovog")?.value?.trim() || "",
    role: $("eu-role")?.value?.trim() || "",
    place: $("eu-place")?.value?.trim() || "",
    department: $("eu-dept")?.value?.trim() || "",
    shift: $("eu-shift")?.value?.trim() || "",
    pin: $("eu-pin")?.value?.trim() || "",
  };
  try {
    showLoading(true);
    const r = await apiPost(payload);
    if (!r.success) throw new Error(r.msg || "Ажилтан засах үед алдаа");
    closeModal();
    await refreshData(false);
    popupOk("Амжилттай хадгаллаа.");
  } catch (e) { popupError(e.message || String(e)); }
  finally { showLoading(false); }
};
window.deleteUser = async function deleteUser(code) {
  if (!confirm("Устгах уу?")) return;
  try {
    showLoading(true);
    const r = await apiPost({ action: "delete_user", code });
    if (!r.success) throw new Error(r.msg || "Устгах үед алдаа");
    await refreshData(false);
  } catch (e) { popupError(e.message || String(e)); }
  finally { showLoading(false); }
};
window.toggleUserLock = async function toggleUserLock(code) {
  const u = users.find((x) => String(x.code) === String(code));
  const next = !(String(u?.locked).toLowerCase() === "true");
  try {
    showLoading(true);
    const r = await apiPost({ action: "set_user_locked", code, locked: next });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    await refreshData(false);
  } catch (e) { popupError(e.message || String(e)); }
  finally { showLoading(false); }
};
window.openUserHistory = async function openUserHistory(code) {
  try {
    showLoading(true);
    const r = await apiPost({ action: "get_user_history", code });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    const hist = Array.isArray(r.history) ? r.history : [];
    openModal(`Олголтын түүх: ${code}`, `
      <div style="padding:14px;">
        ${hist.length ? hist.map((h) => `
          <div class="history-item">
            <div class="muted">${esc(fmtDateOnly(h.date))}</div>
            <div style="font-weight:900;">${esc(h.item || "")}</div>
            <div class="muted">Размер: ${esc(h.size || "")} · Тоо: ${esc(h.qty || "")}</div>
          </div>`).join("") : `<div class="muted">Түүх хоосон.</div>`}
      </div>`);
  } catch (e) { popupError(e.message || String(e)); }
  finally { showLoading(false); }
};

/* ---------------- Password ---------------- */
window.changePass = async function changePass() {
  const oldP = $("old-pass")?.value?.trim() || "";
  const newP = $("new-pass")?.value?.trim() || "";
  if (!oldP || !newP) return popupError("Хуучин, шинэ нууц үгээ оруулна уу.");
  try {
    showLoading(true);
    const r = await apiPost({ action: "change_pass", code: currentUser?.code || "", oldP, newP });
    if (!r.success) throw new Error(r.msg || "Нууц үг солих үед алдаа");
    if ($("old-pass")) $("old-pass").value = "";
    if ($("new-pass")) $("new-pass").value = "";
    popupOk("Нууц үг амжилттай солигдлоо.");
  } catch (e) { popupError(e.message || String(e)); }
  finally { showLoading(false); }
};

/* ---------------- Safe no-op fallbacks ---------------- */
window.openSidebar = window.openSidebar || function(){};
window.closeSidebar = window.closeSidebar || function(){};
window.renderKpis = window.renderKpis || function(){};
window.renderOrdersHeader = window.renderOrdersHeader || function(){};
window.showRequestModal = window.showRequestModal || function(id){ openRequestDetail(id); };

