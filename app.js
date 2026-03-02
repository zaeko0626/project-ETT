// ===============================
// ETT PPE System - app.js
// - Requests + Request_items workflow
// - Request ID: №10000001...
// - Employee code under employee name
// - Filters support (if filter inputs exist in HTML)
// ===============================

const API_URL = "https://script.google.com/macros/s/AKfycbzqdEl1j2A_Yw8eCnAVA6A8sJjsEIQHgTVZtWRfSyDRfWafHApwdTU67gqZSFynbi2D/exec"; // <- Apps Script Web App /exec URL

let currentUser = null;

// Backend data
let requests = [];
let requestItems = [];
let itemsMaster = [];
let users = [];

// Modal state
let currentModalRequestId = null;

// Cart (employee)
let cart = []; // { item, size, qty }

// Filters (admin mainly)
let orderFilters = {
  status: "",
  year: "",
  month: "",
  shift: "",
  place: "",
  dept: "",
  role: "",
  code: "",
  name: ""
};

const $ = (id) => document.getElementById(id);

// ---------- Helpers ----------
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function isAdmin() { return currentUser?.type === "admin"; }

function fmtDateOnly(v) {
  const d = new Date(v);
  if (isNaN(d)) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function getYear(v) {
  const d = new Date(v);
  return isNaN(d) ? "" : String(d.getFullYear());
}
function getMonth(v) {
  const d = new Date(v);
  return isNaN(d) ? "" : String(d.getMonth() + 1).padStart(2, "0");
}

function statusMetaOverall(s) {
  const st = String(s || "").trim();
  if (st === "Шийдвэрлэсэн") return { label: "ШИЙДВЭРЛЭСЭН", cls: "st-approved" };
  if (st === "Хэсэгчлэн") return { label: "ХЭСЭГЧЛЭН", cls: "st-pending" };
  return { label: "ХҮЛЭЭГДЭЖ БУЙ", cls: "st-pending" };
}
function statusMetaItem(s) {
  const st = String(s || "").trim();
  if (st === "Зөвшөөрсөн") return { label: "ЗӨВШӨӨРСӨН", cls: "st-approved" };
  if (st === "Татгалзсан") return { label: "ТАТГАЛЗСАН", cls: "st-rejected" };
  return { label: "ХҮЛЭЭГДЭЖ БУЙ", cls: "st-pending" };
}

// ---------- Loading & Modal ----------
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
  currentModalRequestId = null;
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

  if (tabName === "orders") {
    populateOrderFilters(); // if filter elements exist
    renderRequests();
  }
  if (tabName === "request") {
    fillRequestForm();
    renderCart();
    renderUserHistory();
  }
  if (tabName === "items") renderItems();
  if (tabName === "users") renderUsers();
};

// ---------- Requests grid CSS ----------
function ensureRequestsGridCSS() {
  if (document.getElementById("requests-grid-css")) return;
  const st = document.createElement("style");
  st.id = "requests-grid-css";
  st.textContent = `
    #requests-header, .request-row{
      display:grid;
      grid-template-columns: 1.4fr 2.2fr 2.6fr 0.9fr 1fr 1.2fr 1.2fr;
      column-gap: 16px;
      align-items: start;
      width: 100%;
    }
    .request-row{ padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,.06); cursor: pointer; }
    .request-row:last-child{ border-bottom: none; }
    .req-id{ font-weight: 900; letter-spacing:.3px; }
    .sub{ color: var(--muted); font-size: 12px; margin-top: 2px; }
  `;
  document.head.appendChild(st);
}

// ---------- Requests render ----------
function getVisibleRequests() {
  if (isAdmin()) return requests.slice();
  const myCode = String(currentUser?.code || "").trim();
  return requests.filter(r => String(r.code || "").trim() === myCode);
}
function countItemsForRequest(reqId) {
  return requestItems.filter(x => String(x.request_id) === String(reqId)).length;
}

// ---------- Filters ----------
function setSelectOptions(sel, values, allLabel = "Бүгд") {
  if (!sel) return;
  const uniq = Array.from(new Set((values || []).filter(v => v != null && v !== "")));
  uniq.sort((a,b)=>String(a).localeCompare(String(b)));
  const opts = [`<option value="">${esc(allLabel)}</option>`];
  uniq.forEach(v => opts.push(`<option value="${esc(v)}">${esc(v)}</option>`));
  sel.innerHTML = opts.join("");
}

function populateOrderFilters() {
  // if filter UI doesn't exist -> skip (so app won't break)
  const fStatus = $("f-status");
  const fYear = $("f-year");
  const fMonth = $("f-month");
  const fShift = $("f-shift");
  const fPlace = $("f-place");
  const fDept = $("f-dept");

  if (!fStatus && !fYear && !fMonth && !fShift && !fPlace && !fDept) return;

  const data = getVisibleRequests();

  setSelectOptions(fStatus, ["Хүлээгдэж буй", "Хэсэгчлэн", "Шийдвэрлэсэн"], "Бүгд");
  setSelectOptions(fYear, data.map(r => getYear(r.requestedDate)).filter(Boolean), "Бүгд");
  setSelectOptions(fMonth, ["01","02","03","04","05","06","07","08","09","10","11","12"], "Бүгд");
  setSelectOptions(fShift, data.map(r => (r.shift || "").toString().trim()).filter(Boolean), "Бүгд");
  setSelectOptions(fPlace, data.map(r => (r.place || "").toString().trim()).filter(Boolean), "Бүгд");
  setSelectOptions(fDept, data.map(r => (r.department || "").toString().trim()).filter(Boolean), "Бүгд");

  // restore current values
  if (fStatus) fStatus.value = orderFilters.status || "";
  if (fYear) fYear.value = orderFilters.year || "";
  if (fMonth) fMonth.value = orderFilters.month || "";
  if (fShift) fShift.value = orderFilters.shift || "";
  if (fPlace) fPlace.value = orderFilters.place || "";
  if (fDept) fDept.value = orderFilters.dept || "";
  if ($("f-role")) $("f-role").value = orderFilters.role || "";
  if ($("f-code")) $("f-code").value = orderFilters.code || "";
  if ($("f-name")) $("f-name").value = orderFilters.name || "";
}

window.applyOrderFilters = () => {
  orderFilters.status = ($("f-status")?.value || "").trim();
  orderFilters.year = ($("f-year")?.value || "").trim();
  orderFilters.month = ($("f-month")?.value || "").trim();
  orderFilters.shift = ($("f-shift")?.value || "").trim();
  orderFilters.place = ($("f-place")?.value || "").trim();
  orderFilters.dept = ($("f-dept")?.value || "").trim();
  orderFilters.role = ($("f-role")?.value || "").trim();
  orderFilters.code = ($("f-code")?.value || "").trim();
  orderFilters.name = ($("f-name")?.value || "").trim();
  renderRequests();
};

window.clearOrderFilters = () => {
  orderFilters = { status:"", year:"", month:"", shift:"", place:"", dept:"", role:"", code:"", name:"" };

  if ($("f-status")) $("f-status").value = "";
  if ($("f-year")) $("f-year").value = "";
  if ($("f-month")) $("f-month").value = "";
  if ($("f-shift")) $("f-shift").value = "";
  if ($("f-place")) $("f-place").value = "";
  if ($("f-dept")) $("f-dept").value = "";
  if ($("f-role")) $("f-role").value = "";
  if ($("f-code")) $("f-code").value = "";
  if ($("f-name")) $("f-name").value = "";

  renderRequests();
};

function applyFiltersToData(data) {
  return data.filter(r => {
    const st = String(r.overall_status || "").trim();
    const yr = getYear(r.requestedDate);
    const mo = getMonth(r.requestedDate);
    const shift = String(r.shift || "").trim();
    const place = String(r.place || "").trim();
    const dept = String(r.department || "").trim();
    const role = String(r.role || "").trim();
    const code = String(r.code || "").trim();
    const fullName = `${String(r.ovog||"").trim()} ${String(r.ner||"").trim()}`.trim();

    if (orderFilters.status && st !== orderFilters.status) return false;
    if (orderFilters.year && yr !== orderFilters.year) return false;
    if (orderFilters.month && mo !== orderFilters.month) return false;
    if (orderFilters.shift && shift !== orderFilters.shift) return false;
    if (orderFilters.place && place !== orderFilters.place) return false;
    if (orderFilters.dept && dept !== orderFilters.dept) return false;

    if (orderFilters.role && !role.toLowerCase().includes(orderFilters.role.toLowerCase())) return false;
    if (orderFilters.code && !code.includes(orderFilters.code)) return false;
    if (orderFilters.name && !fullName.toLowerCase().includes(orderFilters.name.toLowerCase())) return false;

    return true;
  });
}

function renderRequests() {
  ensureRequestsGridCSS();
  const list = $("requests-list");
  if (!list) return;

  let data = getVisibleRequests()
    .slice()
    .sort((a, b) => new Date(b.requestedDate) - new Date(a.requestedDate));

  // apply filters if filter UI exists OR filter state has any value
  const hasAnyFilter =
    !!orderFilters.status || !!orderFilters.year || !!orderFilters.month || !!orderFilters.shift ||
    !!orderFilters.place || !!orderFilters.dept || !!orderFilters.role || !!orderFilters.code || !!orderFilters.name;

  const filterUIExists = !!$("f-status") || !!$("f-year") || !!$("f-month") || !!$("f-shift") || !!$("f-place") || !!$("f-dept");
  if (hasAnyFilter || filterUIExists) data = applyFiltersToData(data);

  if (!data.length) {
    list.innerHTML = `<div class="muted" style="padding:12px 0;">Хүсэлт олдсонгүй</div>`;
    return;
  }

  list.innerHTML = data.map(r => {
    const rid = esc(r.request_id || "");
    const emp = `${esc(r.ovog || "")} ${esc(r.ner || "")}`.trim() || "—";
    const code = esc(r.code || "—");
    const place = esc(r.place || "—");
    const dept = esc(r.department || "—");
    const shift = esc(r.shift || "—");
    const cnt = countItemsForRequest(r.request_id);
    const st = statusMetaOverall(r.overall_status);
    const dt = esc(fmtDateOnly(r.requestedDate));
    const role = esc(r.role || "");

    return `
      <div class="request-row" onclick="openRequestDetail('${rid}')">
        <div>
          <div class="req-id">${rid}</div>
          <div class="sub">${dt}</div>
        </div>

        <div>
          <div style="font-weight:800">${emp}</div>
          <div class="sub">ID:${code}</div>
          ${role ? `<div class="sub">${role}</div>` : ``}
        </div>

        <div>
          <div style="font-weight:800">${place}</div>
          <div class="sub">Хэлтэс: ${dept}</div>
        </div>

        <div>${shift}</div>
        <div><span class="tag">${cnt} бараа</span></div>
        <div><span class="status ${st.cls}">${esc(st.label)}</span></div>
        <div>${dt}</div>
      </div>
    `;
  }).join("");
}

// ---------- Request Detail Modal ----------
window.openRequestDetail = (request_id) => {
  currentModalRequestId = request_id;

  const req = requests.find(x => String(x.request_id) === String(request_id));
  if (!req) return popupError("Request олдсонгүй");

  const lines = requestItems.filter(x => String(x.request_id) === String(request_id));

  const st = statusMetaOverall(req.overall_status);

  const header = `
    <div class="kv" style="margin-bottom:10px;">
      <div><div class="k">Ажилтан</div><div class="v">${esc(req.ovog||"")} ${esc(req.ner||"")}</div></div>
      <div><div class="k">Код</div><div class="v">${esc(req.code||"")}</div></div>
      <div><div class="k">Албан тушаал</div><div class="v">${esc(req.role||"")}</div></div>
      <div><div class="k">Газар</div><div class="v">${esc(req.place||"")}</div></div>
      <div><div class="k">Хэлтэс</div><div class="v">${esc(req.department||"")}</div></div>
      <div><div class="k">Ээлж</div><div class="v">${esc(req.shift||"")}</div></div>
      <div><div class="k">Огноо</div><div class="v">${esc(fmtDateOnly(req.requestedDate))}</div></div>
      <div><div class="k">Төлөв</div><div class="v"><span class="status ${st.cls}">${esc(st.label)}</span></div></div>
    </div>
  `;

  const tableHead = `
    <div class="orders-header" style="display:grid; grid-template-columns: 2.4fr 1.4fr 1fr 1.3fr 2fr; column-gap:16px; margin-top:10px;">
      <div>БАРАА</div><div>ХЭМЖЭЭ</div><div>ТОО</div><div>ТӨЛӨВ</div><div>ҮЙЛДЭЛ</div>
    </div>
  `;

  const bodyRows = lines.map(line => {
    const item = esc(line.item || "—");
    const size = esc(line.size || "—");
    const qty = esc(line.qty ?? "—");
    const meta = statusMetaItem(line.item_status);
    const decided = String(line.item_status || "").trim() !== "" && String(line.item_status || "").trim() !== "Хүлээгдэж буй";

    let actionHtml = `<span class="tag">—</span>`;
    if (isAdmin()) {
      if (!decided) {
        actionHtml = `
          <button class="btn sm success" onclick="setItemDecision('${esc(line.line_id)}','Зөвшөөрсөн')">ЗӨВШӨӨРӨХ</button>
          <button class="btn sm danger" onclick="setItemDecision('${esc(line.line_id)}','Татгалзсан')">ТАТГАЛЗАХ</button>
        `;
      } else {
        actionHtml = `<span class="tag">ШИЙДВЭРЛЭСЭН</span>`;
      }
    } else {
      actionHtml = decided ? `<span class="tag">ШИЙДВЭРЛЭСЭН</span>` : `<span class="tag">ХҮЛЭЭЖ БУЙ</span>`;
    }

    return `
      <div class="order-row" style="display:grid; grid-template-columns: 2.4fr 1.4fr 1fr 1.3fr 2fr; column-gap:16px;">
        <div><div style="font-weight:800">${item}</div></div>
        <div>Размер: ${size}</div>
        <div>${qty} ширхэг</div>
        <div><span class="status ${meta.cls}">${esc(meta.label)}</span></div>
        <div>${actionHtml}</div>
      </div>
    `;
  }).join("");

  const finalizeBtn = isAdmin()
    ? `<div class="modal-actions">
         <button class="btn" onclick="closeModal()">ХААХ</button>
         <button class="btn primary" onclick="finalizeCurrentRequest()">БҮГДИЙГ ШИЙДВЭРЛЭХ</button>
       </div>`
    : `<div class="modal-actions">
         <button class="btn" onclick="closeModal()">ХААХ</button>
       </div>`;

  openModal(`Request: ${request_id}`, `
    ${header}
    ${tableHead}
    <div class="orders-list" style="padding:10px 0;">
      ${bodyRows || `<div class="muted">Мэдээлэл хоосон.</div>`}
    </div>
    ${finalizeBtn}
  `);
};

window.setItemDecision = async (line_id, status) => {
  try {
    showLoading(true, "Шийдвэрлэж байна...");
    const r = await apiPost({ action: "update_item_status", line_id, status });
    if (!r.success) throw new Error(r.msg || "Алдаа");

    await refreshData(false);
    if (currentModalRequestId) openRequestDetail(currentModalRequestId);
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.finalizeCurrentRequest = async () => {
  try {
    if (!currentModalRequestId) return;
    showLoading(true, "Finalize хийж байна...");
    const r = await apiPost({ action: "finalize_request", request_id: currentModalRequestId });
    if (!r.success) throw new Error(r.msg || "Finalize алдаа");

    await refreshData(false);
    closeModal();
    popupOk("Хүсэлт шийдвэрлэгдлээ");
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------- Employee: Multi-item cart ----------
function fillRequestForm() {
  const itemSel = $("req-item");
  const sizeSel = $("req-size");
  if (!itemSel || !sizeSel) return;

  setSelectOptions(itemSel, itemsMaster.map(x => x.name), "Сонгох");

  const onItemChange = () => {
    const itemName = (itemSel.value || "").trim();
    const it = itemsMaster.find(x => String(x.name) === itemName);
    const sizes = it ? String(it.sizes || "").split(",").map(s => s.trim()).filter(Boolean) : [];
    setSelectOptions(sizeSel, sizes, "Сонгох");
  };

  itemSel.onchange = onItemChange;
  onItemChange();
}

window.addToCart = () => {
  if (isAdmin()) return popupError("Admin талд хүсэлт илгээх хэрэггүй");

  const item = ($("req-item")?.value || "").trim();
  const size = ($("req-size")?.value || "").trim();
  let qty = parseInt(($("req-qty")?.value || "1"), 10);
  if (!qty || qty < 1) qty = 1;

  if (!item) return popupError("Бараа сонгоно уу");
  if (!size) return popupError("Размер сонгоно уу");

  const idx = cart.findIndex(x => x.item === item && x.size === size);
  if (idx >= 0) cart[idx].qty += qty;
  else cart.push({ item, size, qty });

  renderCart();
};

window.removeCartItem = (i) => {
  cart.splice(i, 1);
  renderCart();
};

function renderCart() {
  const box = $("cart-list");
  if (!box) return;

  if (!cart.length) {
    box.innerHTML = `<div class="muted">Одоогоор сонгосон бараа алга.</div>`;
    return;
  }

  box.innerHTML = cart.map((c, i) => `
    <div class="item-card">
      <div class="kv">
        <div><div class="k">Бараа</div><div class="v">${esc(c.item)}</div></div>
        <div><div class="k">Размер</div><div class="v">Размер: ${esc(c.size)}</div></div>
        <div><div class="k">Тоо</div><div class="v">${esc(c.qty)} ширхэг</div></div>
      </div>
      <div style="margin-top:10px; display:flex; gap:10px;">
        <button class="btn danger sm" onclick="removeCartItem(${i})">УСТГАХ</button>
      </div>
    </div>
  `).join("");
}

window.submitMultiRequest = async () => {
  try {
    if (isAdmin()) return popupError("Admin талд хүсэлт илгээх хэрэггүй");
    if (!currentUser) return popupError("Нэвтэрнэ үү");
    if (!cart.length) return popupError("Сонгосон бараа алга");

    showLoading(true, "Хүсэлт илгээж байна...");
    const r = await apiPost({
      action: "add_request",
      code: currentUser.code,
      items: cart.map(x => ({ item: x.item, size: x.size, qty: x.qty })),
    });

    if (!r.success) throw new Error(r.msg || "Илгээхэд алдаа");

    cart = [];
    renderCart();
    popupOk(`Хүсэлт амжилттай илгээгдлээ (${r.request_id || ""})`);
    await refreshData(false);
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
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map(h => `
        <div class="hist-card">
          <div class="kv">
            <div><div class="k">Огноо</div><div class="v">${esc(fmtDateOnly(h.date))}</div></div>
            <div><div class="k">Бараа</div><div class="v">${esc(h.item || "")}</div></div>
            <div><div class="k">Размер</div><div class="v">Размер: ${esc(h.size || "")}</div></div>
            <div><div class="k">Тоо</div><div class="v">${esc(h.qty || "")} ширхэг</div></div>
          </div>
        </div>
      `).join("");
  } catch (e) {
    box.innerHTML = `<div class="muted">${esc(e.message || String(e))}</div>`;
  }
}

// ---------- Items (Admin) ----------
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
    await refreshData(false);
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
  if (!isAdmin()) { box.innerHTML = `<div class="muted">Зөвхөн Admin харна.</div>`; return; }

  const q = ($("item-search")?.value || "").trim().toLowerCase();
  const data = itemsMaster.filter(it => !q || String(it.name || "").toLowerCase().includes(q));

  if (!data.length) { box.innerHTML = `<div class="muted">Бараа олдсонгүй.</div>`; return; }

  box.innerHTML = data.map(it => `
    <div class="item-card">
      <div class="kv">
        <div><div class="k">Нэр</div><div class="v">${esc(it.name)}</div></div>
        <div><div class="k">Size</div><div class="v">${esc(it.sizes || "")}</div></div>
      </div>
      <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn" onclick="promptUpdateItem('${esc(it.name)}','${esc(it.sizes||"")}')">ЗАСАХ</button>
        <button class="btn danger" onclick="deleteItem('${esc(it.name)}')">УСТГАХ</button>
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
    await refreshData(false);
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
    await refreshData(false);
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
              <div><div class="k">Размер</div><div class="v">Размер: ${esc(h.size||"")}</div></div>
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

// ---------- Users (Admin) ----------
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
    await refreshData(false);
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

  if (!isAdmin()) { box.innerHTML = `<div class="muted">Зөвхөн Admin харна.</div>`; return; }
  if (!users.length) { box.innerHTML = `<div class="muted">Ажилтан олдсонгүй.</div>`; return; }

  box.innerHTML = users.map(u => `
    <div class="user-card">
      <div class="kv">
        <div><div class="k">Код</div><div class="v">${esc(u.code)}</div></div>
        <div><div class="k">Нэр</div><div class="v">${esc(u.ovog||"")} ${esc(u.ner||"")}</div></div>
        <div><div class="k">Албан тушаал</div><div class="v">${esc(u.role||"")}</div></div>
        <div><div class="k">Газар</div><div class="v">${esc(u.place||"")}</div></div>
        <div><div class="k">Хэлтэс</div><div class="v">${esc(u.department||"")}</div></div>
        <div><div class="k">Ээлж</div><div class="v">${esc(u.shift||"")}</div></div>
      </div>
      <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn" onclick="promptUpdateUser('${esc(u.code)}')">ЗАСАХ</button>
        <button class="btn danger" onclick="deleteUser('${esc(u.code)}')">УСТГАХ</button>
      </div>
    </div>
  `).join("");
}

window.promptUpdateUser = (code) => {
  const u = users.find(x => String(x.code) === String(code));
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
    await refreshData(false);
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
    await refreshData(false);
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
    if ($("old-pass")) $("old-pass").value = "";
    if ($("new-pass")) $("new-pass").value = "";
    popupOk("Нууц үг солигдлоо");
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------- Data refresh ----------
window.refreshData = async (keepTab = true) => {
  if (!currentUser) return;

  const activeTab = keepTab
    ? (document.querySelector(".nav-btn.active")?.id || "nav-orders")
    : "nav-orders";

  try {
    showLoading(true, "Өгөгдөл татаж байна...");
    const r = await apiPost({ action: "get_all_data" });
    if (!r.success) throw new Error(r.msg || "Дата татахад алдаа");

    requests = r.requests || [];
    requestItems = r.request_items || [];
    itemsMaster = r.items || [];

    if (isAdmin()) {
      const u = await apiPost({ action: "get_users" });
      users = u.success ? (u.users || []) : [];
    } else {
      users = [];
    }

    // refresh filters (if UI exists)
    populateOrderFilters();

    if (activeTab === "nav-orders") showTab("orders", $("nav-orders"));
    if (activeTab === "nav-request") showTab("request", $("nav-request"));
    if (activeTab === "nav-items") showTab("items", $("nav-items"));
    if (activeTab === "nav-users") showTab("users", $("nav-users"));
    if (activeTab === "nav-pass") showTab("pass", $("nav-pass"));

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

    const usersBtn = $("nav-users");
    if (usersBtn) usersBtn.style.display = isAdmin() ? "" : "none";

    await refreshData(false);

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
  requests = [];
  requestItems = [];
  itemsMaster = [];
  users = [];
  cart = [];
  currentModalRequestId = null;
  orderFilters = { status:"", year:"", month:"", shift:"", place:"", dept:"", role:"", code:"", name:"" };

  setLoggedInUI(false);

  if ($("login-code")) $("login-code").value = "";
  if ($("login-pass")) $("login-pass").value = "";
};

// ---------- Init ----------
function init() {
  setLoggedInUI(false);

  $("login-pass")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") login();
  });
}
window.addEventListener("load", init);
