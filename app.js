const API_URL = "https://script.google.com/macros/s/AKfycbzCTHxnIWVV70Nw9NBuADybkcWaCtg9dBe91CY008uXhSw7lRp01WDlFpeR6otNDaYE/exec";
function rebuildPacksGrouped(){
  if(!Array.isArray(packsMaster)) return;
  const map = {};
  packsMaster.forEach(p=>{
    if(!map[p.pack_name]) map[p.pack_name] = [];
    map[p.pack_name].push(p);
  });
  packsGrouped = map;
}
let currentUser = null;
let requests = [];
let requestItems = [];
let itemsMaster = [];
let packsMaster = []; // Packs sheet (active)
let stockMaster = []; // Inventory rows
let packBuilder = []; // { item, qty }
let packsGrouped = []; // [{ pack_name, active, lines:[] }]

let users = [];
let currentModalRequestId = null;
let cart = []; // { item, size, qty }

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

let openHeaderFilterKey = null; // 'status' | 'shift' | null

const $ = (id) => document.getElementById(id);

function escAttr(s){return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isAdmin() { return String(currentUser?.code || "").toLowerCase() === "admin"; }

function fmtDateOnly(v) {
  const d = new Date(v);
  if (isNaN(d)) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function getYear(v) { const d = new Date(v); return isNaN(d) ? "" : String(d.getFullYear()); }
function getMonth(v) { const d = new Date(v); return isNaN(d) ? "" : String(d.getMonth() + 1).padStart(2, "0"); }

function statusMetaOverall(s) {
  const st = String(s || "").trim();
  if (st === "Шийдвэрлэсэн") return { label: "ШИЙДВЭРЛЭСЭН", cls: "st-approved" };
  if (st === "Хэсэгчлэн" || st === "Хэсэгчлэн шийдвэрлэсэн") return { label: "ХЭСЭГЧЛЭН ШИЙДВЭРЛЭСЭН", cls: "st-pending" };
  return { label: "ХҮЛЭЭГДЭЖ БУЙ", cls: "st-pending" };
}
function statusMetaItem(s) {
  const st = String(s || "").trim();
  if (st === "Зөвшөөрсөн") return { label: "ЗӨВШӨӨРСӨН", cls: "st-approved" };
  if (st === "Татгалзсан") return { label: "ТАТГАЛЗСАН", cls: "st-rejected" };
  return { label: "ХҮЛЭЭГДЭЖ БУЙ", cls: "st-pending" };
}

/* ---------------- Loading & Modal ---------------- */
function showLoading(show) {
  const el = $("loading-overlay");
  if (!el) return;
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
  openModal("Алдаа", `<div style="padding:14px">${esc(msg || "Алдаа гарлаа")}</div>
  <div style="padding:0 14px 14px"><button class="btn primary" onclick="closeModal()">OK</button></div>`);
}
function popupOk(msg) {
  openModal("Амжилттай", `<div style="padding:14px">${esc(msg || "OK")}</div>
  <div style="padding:0 14px 14px"><button class="btn primary" onclick="closeModal()">OK</button></div>`);
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
  try { json = JSON.parse(text); } catch { throw new Error("Invalid JSON: " + text); }
  return json;
}

/* ---------------- Sidebar / Header ---------------- */
function setLoggedInUI(isLoggedIn) {
  $("login-screen")?.classList.toggle("hidden", isLoggedIn);
  $("main-screen")?.classList.toggle("hidden", !isLoggedIn);
  $("app-header")?.classList.toggle("hidden", !isLoggedIn);
  $("sidebar")?.classList.toggle("hidden", !isLoggedIn);
  $("sidebar-overlay")?.classList.add("hidden");
  $("sidebar")?.classList.remove("open");
}

window.openSidebar = () => { $("sidebar")?.classList.add("open"); $("sidebar-overlay")?.classList.remove("hidden"); };
window.closeSidebar = () => { $("sidebar")?.classList.remove("open"); $("sidebar-overlay")?.classList.add("hidden"); };
window.toggleSidebar = () => {
  const sb = $("sidebar");
  if (!sb) return;
  sb.classList.contains("open") ? closeSidebar() : openSidebar();
};

function setSidebarUserInfo() {
  const box = $("sidebar-userinfo");
  const headerLine = $("header-userline");
  if (!box || !headerLine) return;

  if (!currentUser) { box.textContent = "—"; headerLine.textContent = "—"; return; }

  if (isAdmin()) {
    box.innerHTML = `<div style="font-weight:900;">АДМИН</div>`;
    headerLine.textContent = "АДМИН";
    return;
  }

  const fullName = `${esc(currentUser.ovog || "")} ${esc(currentUser.ner || "")}`.trim();
  const code = esc(currentUser.code || "");
  const role = esc(currentUser.role || "");
  const place = esc(currentUser.place || "");
  const dept = esc(currentUser.department || "");
  const shift = esc(currentUser.shift || "");

  box.innerHTML = `
    <div style="font-weight:900;">${fullName || "Ажилтан"}</div>
    <div class="muted" style="margin-top:6px;">Код: ${code || "—"}</div>
    ${role ? `<div class="muted">${role}</div>` : ``}
    ${(place || dept) ? `<div class="muted">${place}${dept ? ` / ${dept}` : ""}</div>` : ``}
    ${shift ? `<div class="muted">${shift}</div>` : ``}
  `;
  headerLine.textContent = `${fullName || "Ажилтан"} · ${code}${role ? ` · ${role}` : ""}`;
}

function applyRoleVisibility() {
  const headerLine = document.getElementById("header-userline");
  // ✅ employee дээр header доор давхар мэдээлэл харагдахгүй
  if (headerLine) headerLine.style.display = isAdmin() ? "" : "none";

  const navReq = $("nav-request");
  const navItems = $("nav-items");
  const navUsers = $("nav-users");
  if (navReq) navReq.style.display = isAdmin() ? "none" : "";
  if (navItems) navItems.style.display = isAdmin() ? "" : "none";
  if (navUsers) navUsers.style.display = isAdmin() ? "" : "none";

  document.querySelectorAll(".admin-only").forEach((el) => {
    el.style.display = isAdmin() ? "" : "none";
  });
  document.querySelectorAll(".emp-only").forEach((el) => {
    el.style.display = isAdmin() ? "none" : "";
  });

  // ✅ Legacy filter panel: employee үед илүүдэл шүүлтүүрийн ТОЛГОЙ/BOX бүхэлд нь нуух
  const adminOnlyIds = ["f-place", "f-dept", "f-role", "f-name", "f-code"];
  adminOnlyIds.forEach((id) => {
    const el = $(id);
    if (!el) return;
    const wrap = el.closest(".grow") || el.closest(".filter-field") || el.parentElement;
    if (wrap) wrap.style.display = isAdmin() ? "" : "none";
    else el.style.display = isAdmin() ? "" : "none";
  });

  renderOrdersHeader();
  renderKpis();
}

window.showTab = (tabName, btn) => {
  if (!isAdmin() && tabName === "items") return popupError("Зөвхөн админ харна.");
  if (!isAdmin() && tabName === "users") return popupError("Зөвхөн админ харна.");
  if (isAdmin() && tabName === "request") return popupError("Админ талд захиалга гаргах шаардлагагүй.");

  document.querySelectorAll(".tab-content").forEach((el) => el.classList.add("hidden"));
  $(`tab-${tabName}`)?.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");

  if (window.innerWidth < 1024) closeSidebar();

  if (tabName === "orders") { populateOrderFilters(); renderRequests(); }
  if (tabName === "request") { fillRequestForm(); renderCart(); renderUserHistory(); }
  if (tabName === "items") {
    setTimeout(() => {
      renderItemsTabAll();
    }, 0);
  }
  if (tabName === "users") renderUsers();
};

function renderItemsTabAll() {
  renderItems();
  fillPackItemSelect();
  renderPackBuilder();
  renderPacks();
}

/* ---------------- Orders: header dropdown filters (excel-like) ---------------- */
function ensureRequestsGridCSS() { /* kept for compatibility (now mostly in CSS file) */ }
function getVisibleRequests() {
  if (isAdmin()) return requests.slice();
  const myCode = String(currentUser?.code || "").trim();
  return requests.filter((r) => String(r.code || "").trim() === myCode);
}
function linesForRequest(reqId) { return requestItems.filter((x) => String(x.request_id) === String(reqId)); }
function requestHasItem(reqId, itemName) {
  if (!itemName) return true;
  const wanted = String(itemName).trim();
  return linesForRequest(reqId).some((l) => String(l.item || "").trim() === wanted);
}
function buildItemsSummaryHTML(reqId) {
  const lines = linesForRequest(reqId);
  if (!lines.length) return `—`;
  return lines.map((l) => {
    const item = esc(String(l.item || "").trim() || "—");
    const size = esc(String(l.size || "").trim() || "—");
    const qty = esc(String(l.qty ?? "").trim() || "—");
    return `<div class="item-line"><div class="item-name">${item}</div><div class="item-sub">Размер: ${size} · Тоо: ${qty} ширхэг</div></div>`;
  }).join("");
}

function renderKpis() {
  const wrap = $("kpi-wrap");
  if (!wrap) return;
  if (!isAdmin()) { wrap.innerHTML = ""; wrap.style.display = "none"; return; }
  wrap.style.display = "";

  const data = getVisibleRequests();
  const total = data.length;
  const pending = data.filter(r => String(r.overall_status || "").trim() === "Хүлээгдэж буй" || String(r.overall_status || "").trim() === "").length;
  const partial = data.filter(r => String(r.overall_status || "").trim() === "Хэсэгчлэн").length;
  const done = data.filter(r => String(r.overall_status || "").trim() === "Шийдвэрлэсэн").length;

  const card = (title, value, chip, clickStatus) => `
    <div class="kpi-card" onclick="applyKpiStatus('${esc(clickStatus)}')" role="button">
      <div class="label">${esc(title)}</div>
      <div style="font-size:22px;font-weight:900;margin-top:6px;">${esc(value)}</div>
      <div class="muted" style="margin-top:6px;">${esc(chip)}</div>
    </div>`;
  wrap.innerHTML = [
    card("Нийт захиалга", total, "Бүгд", ""),
    card("Хүлээгдэж буй", pending, "Хүлээгдэж буй", "Хүлээгдэж буй"),
    card("Хэсэгчлэн шийдвэрлэсэн", partial, "Хэсэгчлэн шийдвэрлэсэн", "Хэсэгчлэн"),
    card("Шийдвэрлэсэн", done, "Шийдвэрлэсэн", "Шийдвэрлэсэн")
  ].join("");
}

window.applyKpiStatus = (status) => {
  orderFilters.status = String(status || "").trim();
  openHeaderFilterKey = null;
  renderOrdersHeader();
  renderRequests();
};

function headerFilterCell(title, key, optionsHtml) {
  const clearShow = orderFilters[key] ? "show" : "";
  const dropShow = openHeaderFilterKey === key ? "show" : "";
  return `
    <div class="hdr-cell">
      <div class="hdr-top">
        <div>${esc(title)}</div>
        <div class="hdr-icons">
          <button class="hdr-icon" onclick="toggleHeaderFilter('${esc(key)}')" title="Filter">⏷</button>
          <button class="hdr-icon clear ${clearShow}" onclick="clearHeaderFilter('${esc(key)}')" title="Clear">×</button>
        </div>
      </div>
      <div class="hdr-dropdown ${dropShow}">
        <select class="hdr-select" onchange="applyHeaderSelect('${esc(key)}', this.value)">${optionsHtml}</select>
      </div>
    </div>`;
}
window.toggleHeaderFilter = (key) => { openHeaderFilterKey = (openHeaderFilterKey === key) ? null : key; renderOrdersHeader(); };
window.clearHeaderFilter = (key) => { orderFilters[key] = ""; openHeaderFilterKey = null; renderOrdersHeader(); renderRequests(); };
window.applyHeaderSelect = (key, val) => { orderFilters[key] = String(val || "").trim(); openHeaderFilterKey = null; renderOrdersHeader(); renderRequests(); };

function renderOrdersHeader() {
  const header = $("requests-header");
  if (!header) return;

  const statusOptions = `
    <option value="">Бүгд</option>
    <option ${orderFilters.status==="Хүлээгдэж буй"?"selected":""}>Хүлээгдэж буй</option>
    <option ${orderFilters.status==="Хэсэгчлэн"?"selected":""}>Хэсэгчлэн</option>
    <option ${orderFilters.status==="Шийдвэрлэсэн"?"selected":""}>Шийдвэрлэсэн</option>`;

  const shiftOptions = `
    <option value="">Бүгд</option>
    <option ${orderFilters.shift==="А ээлж"?"selected":""}>А ээлж</option>
    <option ${orderFilters.shift==="Б ээлж"?"selected":""}>Б ээлж</option>
    <option ${orderFilters.shift==="В ээлж"?"selected":""}>В ээлж</option>
    <option ${orderFilters.shift==="Г ээлж"?"selected":""}>Г ээлж</option>`;

  if (isAdmin()) {
    header.innerHTML = `
      <div>ЗАХИАЛГЫН ДУГААР</div>
      <div>АЖИЛТАН</div>
      <div>АЛБАН ТУШААЛ</div>
      <div>ГАЗАР, ХЭЛТЭС</div>
      <div>${headerFilterCell("ЭЭЛЖ", "shift", shiftOptions)}</div>
      <div>${headerFilterCell("ТӨЛӨВ", "status", statusOptions)}</div>
      <div>ОГНОО</div>`;
    header.style.gridTemplateColumns = "1.1fr 1.8fr 1.3fr 1.8fr 0.9fr 1.2fr 1.1fr";
  } else {
    header.innerHTML = `
      <div>ЗАХИАЛГЫН ДУГААР</div>
      <div>${headerFilterCell("ТӨЛӨВ", "status", statusOptions)}</div>
      <div>ОГНОО</div>`;
    header.style.gridTemplateColumns = "1.4fr 1.2fr 1.1fr";
  }
}

function installHeaderCloseHandler() {
  document.addEventListener("click", (e) => {
    const dd = document.querySelector(".hdr-dropdown.show");
    if (!dd) return;
    const cell = dd.closest(".hdr-cell");
    if (cell && cell.contains(e.target)) return;
    openHeaderFilterKey = null;
    renderOrdersHeader();
  });
}

/* ---------------- Old filters (legacy panel) ---------------- */
function setSelectOptions(sel, arr, placeholder) {
  if (!sel) return;
  const opts = [`<option value="">${esc(placeholder || "Бүгд")}</option>`]
    .concat((arr || []).map((v) => `<option>${esc(v)}</option>`));
  sel.innerHTML = opts.join("");
}
function uniq(arr) { return Array.from(new Set(arr.filter(Boolean))); }

function populateOrderFilters() {
  // Keep legacy filters working if used
  const vis = getVisibleRequests();
  setSelectOptions($("f-year"), uniq(vis.map(r => getYear(r.requestedDate))).sort(), "Бүгд");
  setSelectOptions($("f-month"), uniq(vis.map(r => getMonth(r.requestedDate))).sort(), "Бүгд");
  setSelectOptions($("f-item"), uniq(requestItems.map(x => String(x.item||"").trim())).sort(), "Бүгд");
  setSelectOptions($("f-place"), uniq(vis.map(r => String(r.place||"").trim())).sort(), "Бүгд");
  setSelectOptions($("f-dept"), uniq(vis.map(r => String(r.department||"").trim())).sort(), "Бүгд");

  // wire apply buttons only once
  window.applyFilters = () => {
    orderFilters.year = ($("f-year")?.value || "").trim();
    orderFilters.month = ($("f-month")?.value || "").trim();
    orderFilters.item = ($("f-item")?.value || "").trim();
    orderFilters.place = ($("f-place")?.value || "").trim();
    orderFilters.dept = ($("f-dept")?.value || "").trim();
    orderFilters.role = ($("f-role")?.value || "").trim();
    orderFilters.name = ($("f-name")?.value || "").trim();
    orderFilters.code = ($("f-code")?.value || "").trim();
    renderRequests();
  };
  window.clearFilters = () => {
    ["f-year","f-month","f-item","f-place","f-dept","f-role","f-name","f-code"].forEach(id => { if ($(id)) $(id).value = ""; });
    orderFilters = { status: orderFilters.status, shift: orderFilters.shift, year:"",month:"",item:"",place:"",dept:"",role:"",code:"",name:"" };
    renderRequests();
  };
}

function passFilters(r) {
  const y = getYear(r.requestedDate);
  const m = getMonth(r.requestedDate);
  const st = String(r.overall_status || "").trim() || "Хүлээгдэж буй";

  if (orderFilters.status && st !== orderFilters.status) return false;
  if (orderFilters.shift && String(r.shift || "").trim() !== orderFilters.shift) return false;
  if (orderFilters.year && y !== orderFilters.year) return false;
  if (orderFilters.month && m !== orderFilters.month) return false;
  if (orderFilters.place && String(r.place || "").trim() !== orderFilters.place) return false;
  if (orderFilters.dept && String(r.department || "").trim() !== orderFilters.dept) return false;
  if (orderFilters.role){
  const role = String(r.role || "").trim();
  if(role !== orderFilters.role.trim()) return false;
}
  if (orderFilters.code && !String(r.code || "").toLowerCase().includes(orderFilters.code.toLowerCase())) return false;
  if (orderFilters.name) {
    const full = `${String(r.ovog||"")} ${String(r.ner||"")}`.toLowerCase();
    if (!full.includes(orderFilters.name.toLowerCase())) return false;
  }
  if (orderFilters.item && !requestHasItem(r.request_id, orderFilters.item)) return false;

  return true;
}

function renderRequests() {
  const list = $("requests-list");
  if (!list) return;

  renderOrdersHeader();

  const data = getVisibleRequests().filter(passFilters)
    .sort((a, b) => new Date(b.requestedDate) - new Date(a.requestedDate));

  if (!data.length) {
    list.innerHTML = `<div style="padding:16px;color:#6b7280;">Мэдээлэл олдсонгүй.</div>`;
    return;
  }

  const gridCols = $("requests-header")?.style.gridTemplateColumns || (isAdmin()
    ? "1.1fr 2.1fr 2.2fr 0.7fr 1.2fr 1.1fr"
    : "1.4fr 1.2fr 1.1fr");

  list.innerHTML = data.map((r) => {
    const st = statusMetaOverall(r.overall_status);
    const reqId = esc(r.request_id);

    const employee = `<div><div style="font-weight:900;">${esc(`${r.ovog||""} ${r.ner||""}`.trim() || "—")}</div>
        <div class="sub">ID: ${esc(r.code||"")}${r.role ? ` · ${esc(r.role)}` : ``}</div></div>`;
    const placeDept = `<div><div style="font-weight:900;">${esc(r.place||"")}</div><div class="sub">${esc(r.department||"")}</div></div>`;
    const shift = `<div>${esc(r.shift||"")}</div>`;
    const status = `<span class="status ${st.cls}">${esc(st.label)}</span>`;
    const date = `<div>${esc(fmtDateOnly(r.requestedDate))}</div>`;

    if (isAdmin()) {
      return `<div class="request-row" style="display:grid;grid-template-columns:${gridCols};" onclick="openRequestDetail('${reqId}')">
        <div class="req-id">${reqId}</div>
        <div>${employee}</div>
        <div>${placeDept}</div>
        <div>${shift}</div>
        <div>${status}</div>
        <div>${date}</div>
      </div>`;
    }

    // employee view (✅ бараа багана байхгүй)
    return `<div class="request-row" style="display:grid;grid-template-columns:${gridCols};" onclick="openRequestDetail('${reqId}')">
      <div class="req-id">${reqId}</div>
      <div>${status}</div>
      <div>${date}</div>
    </div>`;
  }).join("");
}

/* ---------------- Request Detail (Admin + User) ---------------- */
window.openRequestDetail = (request_id) => {
  currentModalRequestId = String(request_id);
  const req = requests.find((x) => String(x.request_id) === String(request_id));
  if (!req) return popupError("Захиалга олдсонгүй");

  const st = statusMetaOverall(req.overall_status);
  const header = `
    <div style="padding:14px;">
      <div style="font-weight:900;font-size:16px;">Захиалгын дугаар: ${esc(req.request_id)}</div>
      <div class="muted" style="margin-top:6px;">Огноо: ${esc(fmtDateOnly(req.requestedDate))} · <span class="status ${st.cls}">${esc(st.label)}</span></div>
      ${isAdmin() ? `
        <div class="muted" style="margin-top:10px;line-height:1.5;">
          Ажилтан: ${esc(req.ovog||"")} ${esc(req.ner||"")} (Код: ${esc(req.code||"")})<br/>
          Албан тушаал: ${esc(req.role||"")}<br/>
          Газар/Хэлтэс: ${esc(req.place||"")} / ${esc(req.department||"")}<br/>
          Ээлж: ${esc(req.shift||"")}
        </div>` : ``}
    </div>`;

  const tableHead = `
    <div style="padding:0 14px 10px;">
      <div class="light-table-head">
        <div>БАРАА</div>
        <div>РАЗМЕР</div>
        <div>ТОО</div>
        <div>ТӨЛӨВ</div>
        ${isAdmin() ? `<div>ҮЙЛДЭЛ</div>` : ``}
      </div>
    </div>`;

  const lines = linesForRequest(request_id);
  const bodyRows = lines.map((l) => {
    const item = esc(l.item || "");
    const size = esc(l.size || "");
    const qty = esc(l.qty ?? "");
    const meta = statusMetaItem(l.item_status);
    const decided = ["Зөвшөөрсөн","Татгалзсан","Хэсэгчлэн шийдвэрлэсэн"].includes(String(l.item_status||"").trim());
    const actionHtml = isAdmin()
      ? (decided ? `<span class="pill decided">ШИЙДВЭРЛЭСЭН</span>` :
        `<div class="decision-actions issue-actions">
          <input class="input tiny" id="iss-size-${esc(l.line_id)}" value="${esc(l.issued_size || l.size || "")}" placeholder="Размер" />
          <input class="input tiny" id="iss-qty-${esc(l.line_id)}" type="number" min="0" value="${esc(l.issued_qty || l.qty || 0)}" placeholder="Тоо" />
          <button class="btn pill approve" onclick="issueLine('${esc(l.line_id)}');event.stopPropagation();">ОЛГОХ</button>
          <button class="btn pill reject" onclick="issueLineReject('${esc(l.line_id)}');event.stopPropagation();">ТАТГАЛЗАХ</button>
        </div>`)
      : ``;    return `<div class="light-table-row">
      <div style="font-weight:900;">${item}</div>
      <div>Размер: ${size}</div>
      <div>${qty} ширхэг</div>
      <div><span class="status ${meta.cls}">${esc(meta.label)}</span></div>
      ${isAdmin() ? `<div>${actionHtml}</div>` : ``}
    </div>`;
  }).join("");

  const finalizeBtn = isAdmin()
    ? `<div style="padding:14px;display:flex;justify-content:flex-end;gap:10px;">
        <button class="btn" onclick="closeModal()">ХААХ</button>
        <button class="btn primary" onclick="finalizeCurrentRequest()">БҮГДИЙГ ШИЙДВЭРЛЭХ</button>
      </div>`
    : `<div style="padding:14px;display:flex;justify-content:flex-end;">
        <button class="btn" onclick="closeModal()">ХААХ</button>
      </div>`;

  openModal(`Захиалга: ${request_id}`, `${header}${tableHead}${bodyRows || `<div style="padding:14px;">Мэдээлэл хоосон.</div>`}${finalizeBtn}`);
};

window.setItemDecision = async (line_id, status) => {
  try {
    showLoading(true);
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


// Admin: approve + issued size/qty + stock-out
window.issueLine = async (line_id) => {
  try {
    const size = ($(`iss-size-${line_id}`)?.value || "").trim();
    const qty = parseInt($(`iss-qty-${line_id}`)?.value || "0", 10) || 0;
    showLoading(true);
    const r = await apiPost({ action: "issue_item", admin_code: currentUser.code, line_id, issued_size: size, issued_qty: qty });
    if (!r.success) throw new Error(r.msg || "Алдаа гарлаа");
    await refreshData(false);
    if (currentModalRequestId) openRequestDetail(currentModalRequestId);
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.issueLineReject = async (line_id) => {
  try {
    showLoading(true);
    const r = await apiPost({ action: "issue_item", admin_code: currentUser.code, line_id, issued_size: "", issued_qty: 0 });
    if (!r.success) throw new Error(r.msg || "Алдаа гарлаа");
    await refreshData(false);
    if (currentModalRequestId) openRequestDetail(currentModalRequestId);
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// Employee: confirm receive by PIN
window.confirmReceive = async () => {
  const pin = ($("receive-pin")?.value || "").trim();
  if (!pin) return popupError("PIN оруулна уу");
  try {
    showLoading(true);
    const r = await apiPost({ action: "confirm_receive", code: currentUser.code, request_id: currentModalRequestId, pin });
    if (!r.success) throw new Error(r.msg || "Алдаа гарлаа");
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
    showLoading(true);
    const r = await apiPost({ action: "finalize_request", request_id: currentModalRequestId });
    if (!r.success) throw new Error(r.msg || "Finalize алдаа");
    await refreshData(false);
    closeModal();
    popupOk("Захиалга шийдвэрлэгдлээ");
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

/* ---------------- Request (employee) ---------------- */
function groupPacks(lines) {
  const map = {};
  (lines || []).forEach((p) => {
    const name = String(p.pack_name || "").trim();
    if (!name) return;
    if (!map[name]) {
      map[name] = {
        pack_name: name,
        active: String(p.active || "").toLowerCase() === "false" ? false : true,
        lines: []
      };
    }
    map[name].lines.push({
      item: String(p.item || "").trim(),
      default_size: String(p.default_size || "").trim(),
      default_qty: Number(p.default_qty || 1)
    });
  });
  return Object.values(map).sort((a, b) => a.pack_name.localeCompare(b.pack_name, "mn"));
}

function rebuildPacksGrouped() {
  packsGrouped = groupPacks(packsMaster || []);
}

function fillPackItemSelect() {
  const sel = $("pack-item-select");
  if (!sel) return;

  const names = Array.from(
    new Set(
      (itemsMaster || [])
        .map((x) => String(x.name || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "mn"));

  sel.innerHTML = `<option value="">Сонгох</option>` +
    names.map((name) => `<option value="${escAttr(name)}">${esc(name)}</option>`).join("");
}

function fillRequestForm() {
  const itemSel = $("req-item");
  const sizeSel = $("req-size");
  const packSel = $("req-pack");

  if (itemSel) {
    const itemNames = (itemsMaster || [])
      .map((x) => String(x.name || "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "mn"));
    setSelectOptions(itemSel, itemNames, "Сонгох");

    const onItemChange = () => {
      const itemName = (itemSel.value || "").trim();
      const it = itemsMaster.find((x) => String(x.name || "") === itemName);
      const sizes = it ? String(it.sizes || "").split(",").map((s) => s.trim()).filter(Boolean) : [];
      setSelectOptions(sizeSel, sizes, "Сонгох");
    };
    itemSel.onchange = onItemChange;
    onItemChange();
  }

  if (packSel) {
    const activePackNames = groupPacks(packsMaster || [])
      .filter((p) => p.active)
      .map((p) => p.pack_name);
    setSelectOptions(packSel, activePackNames, "Сонгох");
  }
}

window.addToCart = () => {
  if (isAdmin()) return popupError("Админ талд захиалга илгээх хэрэггүй");
  const item = ($("req-item")?.value || "").trim();
  const size = ($("req-size")?.value || "").trim();
  let qty = parseInt(($("req-qty")?.value || "1"), 10);
  if (!qty || qty < 1) qty = 1;

  if (!item) return popupError("Бараа сонгоно уу");
  if (!size) return popupError("Размер сонгоно уу");

  const idx = cart.findIndex((x) => x.item === item && x.size === size);
  if (idx >= 0) cart[idx].qty += qty;
  else cart.push({ item, size, qty });

  renderCart();
  // clear last selections to prevent duplicate accidental add
  try {
    const itemSel = $("req-item");
    const sizeSel = $("req-size");
    const qtyInp = $("req-qty");
    if (itemSel) itemSel.value = "";
    if (sizeSel) sizeSel.innerHTML = '<option value="">Размер</option>';
    if (qtyInp) qtyInp.value = 1;
  } catch (e) {}
};


window.addPackToCart = () => {
  const packName = ($("req-pack")?.value || "").trim();
  if (!packName) return popupError("Багц сонгоно уу");

  const grouped = groupPacks(packsMaster || []);
  const pack = grouped.find((p) => p.pack_name === packName && p.active);
  if (!pack || !pack.lines.length) return popupError("Багц хоосон/олдсонгүй");

  const modalHtml = `
    <div style="padding:14px;">
      <div class="muted" style="margin-bottom:12px;">${esc(packName)} багцын бараа бүрт размер сонгоно уу.</div>
      <div class="mini-table" style="display:grid;gap:10px;">
        ${pack.lines.map((ln, i) => {
          const item = itemsMaster.find((x) => String(x.name || "") === String(ln.item || ""));
          const sizes = item ? String(item.sizes || "").split(",").map((s) => s.trim()).filter(Boolean) : [];
          return `
            <div class="light-table-row" style="grid-template-columns:2fr 1fr 1.2fr;">
              <div style="font-weight:900;">${esc(ln.item)}</div>
              <div>${esc(ln.default_qty)} ширхэг</div>
              <div>
                <select id="pack-size-${i}" class="input">
                  <option value="">Размер</option>
                  ${sizes.map((s) => `<option value="${escAttr(s)}">${esc(s)}</option>`).join("")}
                </select>
              </div>
            </div>`;
        }).join("")}
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px;">
        <button class="btn" onclick="closeModal()">ХААХ</button>
        <button class="btn primary" onclick="confirmPackToCart('${escAttr(packName)}')">БАГЦ НЭМЭХ</button>
      </div>
    </div>`;
  openModal(`Багц: ${packName}`, modalHtml);
};

window.confirmPackToCart = (packName) => {
  const grouped = groupPacks(packsMaster || []);
  const pack = grouped.find((p) => p.pack_name === packName && p.active);
  if (!pack) return popupError("Багц олдсонгүй");

  for (let i = 0; i < pack.lines.length; i++) {
    const ln = pack.lines[i];
    const size = ($(`pack-size-${i}`)?.value || "").trim();
    if (!size) return popupError(`"${ln.item}" бараа��д размер сонгоно уу.`);
  }

  pack.lines.forEach((ln, i) => {
    const size = ($(`pack-size-${i}`)?.value || "").trim();
    const qty = parseInt(ln.default_qty, 10) || 1;
    const idx = cart.findIndex((x) => x.item === ln.item && x.size === size);
    if (idx >= 0) cart[idx].qty += qty;
    else cart.push({ item: ln.item, size, qty });
  });

  renderCart();
  try { $("req-pack").value = ""; } catch (e) {}
  closeModal();
};

window.submitPackRequest = async () => {
  const packName = ($("req-pack")?.value || "").trim();
  if (!packName) return popupError("Багц сонгоно уу");

  const grouped = groupPacks(packsMaster || []);
  const pack = grouped.find((p) => p.pack_name === packName && p.active);
  if (!pack || !pack.lines.length) return popupError("Багц хоосон/олдсонгүй");

  const modalHtml = `
    <div style="padding:14px;">
      <div class="muted" style="margin-bottom:12px;">${esc(packName)} багцын бараа бүрт размер сонгоод шууд илгээнэ.</div>
      <div class="mini-table" style="display:grid;gap:10px;">
        ${pack.lines.map((ln, i) => {
          const item = itemsMaster.find((x) => String(x.name || "") === String(ln.item || ""));
          const sizes = item ? String(item.sizes || "").split(",").map((s) => s.trim()).filter(Boolean) : [];
          return `
            <div class="light-table-row" style="grid-template-columns:2fr 1fr 1.2fr;">
              <div style="font-weight:900;">${esc(ln.item)}</div>
              <div>${esc(ln.default_qty)} ширхэг</div>
              <div>
                <select id="pack-submit-size-${i}" class="input">
                  <option value="">Размер</option>
                  ${sizes.map((s) => `<option value="${escAttr(s)}">${esc(s)}</option>`).join("")}
                </select>
              </div>
            </div>`;
        }).join("")}
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px;">
        <button class="btn" onclick="closeModal()">ХААХ</button>
        <button class="btn primary" onclick="confirmSubmitPackRequest('${escAttr(packName)}')">БАГЦ ИЛГЭЭХ</button>
      </div>
    </div>`;
  openModal(`Багц илгээх: ${packName}`, modalHtml);
};

window.confirmSubmitPackRequest = async (packName) => {
  const grouped = groupPacks(packsMaster || []);
  const pack = grouped.find((p) => p.pack_name === packName && p.active);
  if (!pack) return popupError("Багц олдсонгүй");

  const items = [];
  for (let i = 0; i < pack.lines.length; i++) {
    const ln = pack.lines[i];
    const size = ($(`pack-submit-size-${i}`)?.value || "").trim();
    if (!size) return popupError(`"${ln.item}" бараанд размер сонгоно уу.`);
    items.push({ item: ln.item, size, qty: parseInt(ln.default_qty, 10) || 1 });
  }

  try {
    showLoading(true);
    const r = await apiPost({ action: "add_request", code: currentUser.code, items });
    if (!r.success) throw new Error(r.msg || "Алдаа гарлаа");
    closeModal();
    try { $("req-pack").value = ""; } catch (e) {}
    cart = [];
    renderCart();
    await refreshData(false);
    showTab("orders", $("nav-orders"));
    popupOk("Амжилттай! Захиалгын дугаар: " + (r.request_id || ""));
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.removeCartItem = (i) => { cart.splice(i, 1); renderCart(); };

function renderCart() {
  const box = $("cart-list");
  if (!box) return;
  if (!cart.length) {
    box.innerHTML = `<div class="muted">Одоогоор сонгосон бараа алга.</div>`;
    return;
  }
  box.innerHTML = cart.map((c, i) => `
    <div class="cart-item">
      <div style="font-weight:900;">${esc(c.item)}</div>
      <div class="muted" style="margin-top:2px;">Размер: ${esc(c.size)} · Тоо: ${esc(c.qty)} ширхэг</div>
      <button class="icon-btn btn-icon" onclick="removeCartItem(${i});event.stopPropagation();" title="Устгах">🗑️</button>
    </div>`).join("");
}

window.submitMultiRequest = async () => {
  try {
    if (isAdmin()) return popupError("Админ талд захиалга илгээх хэрэггүй");
    if (!currentUser) return popupError("Нэвтэрнэ үү");
    if (!cart.length) return popupError("Сонгосон бараа алга");
    showLoading(true);
    const r = await apiPost({
      action: "add_request",
      code: currentUser.code,
      items: cart.map((x) => ({ item: x.item, size: x.size, qty: x.qty })),
    });
    if (!r.success) throw new Error(r.msg || "Илгээхэд алдаа");
    cart = [];
    renderCart();
    popupOk(`Захиалга амжилттай илгээгдлээ (${r.request_id || ""})`);
    await refreshData(false);
    showTab("orders", $("nav-orders"));
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};


window.addPackLine = () => {
  const item = ($("pack-item-select")?.value || "").trim();
  let qty = parseInt(($("pack-item-qty")?.value || "1"), 10);
  if (!item) return popupError("Бараа сонгоно уу.");
  if (!qty || qty < 1) qty = 1;

  const existing = packBuilder.find((x) => String(x.item) === item);
  if (existing) existing.qty += qty;
  else packBuilder.push({ item, qty });

  if ($("pack-item-qty")) $("pack-item-qty").value = 1;
  renderPackBuilder();
};

window.removePackLine = (idx) => {
  packBuilder.splice(idx, 1);
  renderPackBuilder();
};

function renderPackBuilder() {
  const box = $("pack-builder-list");
  if (!box) return;

  if (!packBuilder.length) {
    box.innerHTML = "";
    return;
  }

  box.innerHTML = packBuilder.map((x, idx) => `
    <div class="light-table-row" style="grid-template-columns:2fr 1fr auto;align-items:center;">
      <div style="font-weight:900;">${esc(x.item)}</div>
      <div>${esc(x.qty)} ширхэг</div>
      <div style="display:flex;justify-content:flex-end;">
        <button class="btn danger" onclick="removePackLine(${idx})">УСТГАХ</button>
      </div>
    </div>
  `).join("");
}

window.savePack = async () => {
  try {
    const pack_name = ($("pack-name")?.value || "").trim();
    if (!pack_name) return popupError("Багцын нэр оруулна уу.");
    if (!packBuilder.length) return popupError("Багцад дор хаяж 1 бараа нэмнэ үү.");

    showLoading(true);
    const r = await apiPost({
      action: "save_pack",
      admin_code: currentUser?.code || "",
      pack_name,
      lines: packBuilder.map((x) => ({
        item: x.item,
        default_size: "",
        default_qty: x.qty
      }))
    });

    if (!r.success) throw new Error(r.msg || "Багц хадгалах үед алдаа гарлаа.");

    packBuilder = [];
    if ($("pack-name")) $("pack-name").value = "";
    if ($("pack-item-qty")) $("pack-item-qty").value = 1;

    await refreshData(false);
    rebuildPacksGrouped();
    renderPackBuilder();
    renderPacks();
    fillPackItemSelect();
    popupOk("Багц амжилттай хадгалагдлаа.");
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.togglePackActive = async (pack_name, nextActive) => {
  try {
    showLoading(true);
    const r = await apiPost({
      action: "set_pack_active",
      admin_code: currentUser?.code || "",
      pack_name,
      active: nextActive
    });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    await refreshData(false);
    rebuildPacksGrouped();
    renderPacks();
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.deletePack = async (pack_name) => {
  try {
    if (!confirm(`"${pack_name}" багцыг устгах уу?`)) return;
    showLoading(true);
    const r = await apiPost({
      action: "delete_pack",
      admin_code: currentUser?.code || "",
      pack_name
    });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    await refreshData(false);
    rebuildPacksGrouped();
    renderPacks();
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

function renderPacks() {
  const box = $("packs-list");
  if (!box) return;

  rebuildPacksGrouped();
  if (!packsGrouped.length) {
    box.innerHTML = "";
    return;
  }

  box.innerHTML = packsGrouped.map((p) => {
    const activeBadge = p.active
      ? `<span class="status st-approved">ИДЭВХТЭЙ</span>`
      : `<span class="status st-rejected">ИДЭВХГҮЙ</span>`;

    const linesHtml = p.lines.map((ln) => `
      <div class="mini-td" style="display:grid;grid-template-columns:2fr 1fr;gap:10px;align-items:center;">
        <div style="font-weight:800;">${esc(ln.item)}</div>
        <div>${esc(ln.default_qty)} ширхэг</div>
      </div>
    `).join("");

    return `
      <div class="card" style="margin-top:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <div>
            <div style="font-weight:1000;font-size:18px;">${esc(p.pack_name)}</div>
            <div style="margin-top:6px;">${activeBadge}</div>
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn" onclick="togglePackActive('${escAttr(p.pack_name)}', ${p.active ? "false" : "true"})">
              ${p.active ? "ИДЭВХГҮЙ БОЛГОХ" : "ИДЭВХЖҮҮЛЭХ"}
            </button>
            <button class="btn danger" onclick="deletePack('${escAttr(p.pack_name)}')">УСТГАХ</button>
          </div>
        </div>

        <div class="mini-table" style="margin-top:12px;">
          <div class="mini-th" style="display:grid;grid-template-columns:2fr 1fr;gap:10px;">
            <div>БАРАА</div>
            <div>ТОО</div>
          </div>
          ${linesHtml}
        </div>
      </div>
    `;
  }).join("");
}

/* ---------------- History ---------------- */
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
      .map((h) => `
        <div class="history-item">
          <div class="muted">Огноо: ${esc(fmtDateOnly(h.date))}</div>
          <div style="font-weight:900;">${esc(h.item || "")}</div>
          <div class="muted">Размер: ${esc(h.size || "")} · Тоо: ${esc(h.qty || "")} ширхэг</div>
        </div>`)
      .join("");
  } catch (e) {
    box.innerHTML = `<div class="muted">${esc(e.message || String(e))}</div>`;
  }
}

/* ---------------- Items (Admin) ---------------- */
window.clearItemSearch = () => { if ($("item-search")) $("item-search").value = ""; renderItems(); };

window.addItem = async () => {
  if (!isAdmin()) return popupError("Admin эрх хэрэгтэй");
  const name = ($("new-item-name")?.value || "").trim();
  const sizes = ($("new-item-sizes")?.value || "").trim();
  if (!name) return popupError("Барааны нэр оруулна уу");

  try {
    showLoading(true);
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

window.openEditItem = (name) => {
  const it = itemsMaster.find(x => String(x.name) === String(name));
  if (!it) return popupError("Бараа олдсонгүй");
  const locked = String(it.locked).toLowerCase() === "true";
  openModal("Бараа засах", `
    <div style="padding:14px;display:grid;gap:10px;">
      <div class="label">Нэр</div>
      <input id="edit-item-name" value="${esc(it.name)}" ${locked ? "disabled" : ""}/>
      <div class="label">Size-үүд</div>
      <input id="edit-item-sizes" value="${esc(it.sizes || "")}" ${locked ? "disabled" : ""}/>
      <div class="muted">${locked ? "Locked=true тул засах боломжгүй. (Unlock хийж байж засна)" : ""}</div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button class="btn" onclick="closeModal()">ХААХ</button>
        <button class="btn primary" onclick="saveItemEdit('${esc(it.name)}')" ${locked ? "disabled" : ""}>ХАДГАЛАХ</button>
      </div>
    </div>`);
};

window.saveItemEdit = async (oldName) => {
  const newName = ($("edit-item-name")?.value || "").trim();
  const sizes = ($("edit-item-sizes")?.value || "").trim();
  if (!newName) return popupError("Нэр хоосон байна");
  try {
    showLoading(true);
    const r = await apiPost({ action: "update_item", oldName, newName, sizes });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    await refreshData(false);
    closeModal();
    popupOk("Хадгаллаа");
  } catch (e) {
    popupError(e.message || String(e));
  } finally { showLoading(false); }
};

window.deleteItem = async (name) => {
  const it = itemsMaster.find(x => String(x.name) === String(name));
  const locked = String(it?.locked).toLowerCase() === "true";
  if (locked) return popupError("Locked=true тул устгах боломжгүй. (Unlock хийж байж устгана)");
  if (!confirm("Устгах уу?")) return;
  try {
    showLoading(true);
    const r = await apiPost({ action: "delete_item", name });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    await refreshData(false);
    popupOk("Устгалаа");
  } catch (e) { popupError(e.message || String(e)); }
  finally { showLoading(false); }
};

window.toggleItemLock = async (name) => {
  const it = itemsMaster.find(x => String(x.name) === String(name));
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

window.openItemHistory = async (name) => {
  try {
    showLoading(true);
    const r = await apiPost({ action: "get_item_history", item: name });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    const hist = r.history || [];
    openModal(`Барааны түүх: ${esc(name)}`, `
      <div style="padding:14px;">
        ${hist.length ? hist.map(h => `
          <div class="history-item">
            <div class="muted">${esc(fmtDateOnly(h.date))} · ${esc(h.code || "")}</div>
            <div style="font-weight:900;">${esc(h.ovog || "")} ${esc(h.ner || "")}</div>
            <div class="muted">Размер: ${esc(h.size || "")} · Тоо: ${esc(h.qty || "")} ширхэг</div>
          </div>`).join("") : `<div class="muted">Түүх хоосон.</div>`}
        <div style="margin-top:10px;display:flex;justify-content:flex-end;">
          <button class="btn" onclick="closeModal()">ХААХ</button>
        </div>
      </div>`);
  } catch (e) {
    popupError(e.message || String(e));
  } finally { showLoading(false); }
};

window.renderItems = renderItems;
function renderItems() {
  const box = $("items-list");
  if (!box) return;

  if (!isAdmin()) { box.innerHTML = `<div class="muted">Зөвхөн Admin харна.</div>`; return; }

  const q = ($("item-search")?.value || "").trim().toLowerCase();
  const data = itemsMaster
    .filter((it) => !q || String(it.name || "").toLowerCase().includes(q))
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "mn"));

  if (!data.length) { box.innerHTML = `<div class="muted">Бараа олдсонгүй.</div>`; return; }

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

/* ---------------- Users (Admin) ---------------- */
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
    showLoading(true);
    const r = await apiPost({ action: "add_user", code, pass, ner, ovog, role, place, department, shift });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    ["u-code","u-pass","u-ner","u-ovog","u-role","u-place","u-dept","u-shift"].forEach((id) => { if ($(id)) $(id).value = ""; });
    await refreshData(false);
    popupOk("Ажилтан нэмэгдлээ");
  } catch (e) { popupError(e.message || String(e)); }
  finally { showLoading(false); }
};

window.openEditUser = (code) => {
  const u = (users || []).find(x => String(x.code) === String(code));
  if (!u) return popupError("Ажилтан олдсонгүй");
  const locked = String(u.locked).toLowerCase() === "true";

  openModal("Ажилтан засах", `
    <div style="padding:14px;display:grid;gap:10px;">
      <div class="label">Код</div>
      <input id="edit-u-code" value="${esc(u.code)}" disabled/>
      <div class="label">Нууц үг (хоосон байж болно)</div>
      <input id="edit-u-pass" value="" placeholder="Шинэ нууц үг" ${locked ? "disabled" : ""}/>
      <div class="label">Нэр</div>
      <input id="edit-u-ner" value="${esc(u.ner||"")}" ${locked ? "disabled" : ""}/>
      <div class="label">Овог</div>
      <input id="edit-u-ovog" value="${esc(u.ovog||"")}" ${locked ? "disabled" : ""}/>
      <div class="label">Албан тушаал</div>
      <input id="edit-u-role" value="${esc(u.role||"")}" ${locked ? "disabled" : ""}/>
      <div class="label">Газар</div>
      <input id="edit-u-place" value="${esc(u.place||"")}" ${locked ? "disabled" : ""}/>
      <div class="label">Хэлтэс</div>
      <input id="edit-u-dept" value="${esc(u.department||"")}" ${locked ? "disabled" : ""}/>
      <div class="label">Ээлж</div>
      <select id="edit-u-shift" ${locked ? "disabled" : ""}>
        <option value="">Сонгох</option>
        <option ${u.shift==="А ээлж"?"selected":""}>А ээлж</option>
        <option ${u.shift==="Б ээлж"?"selected":""}>Б ээлж</option>
        <option ${u.shift==="В ээлж"?"selected":""}>В ээлж</option>
        <option ${u.shift==="Г ээлж"?"selected":""}>Г ээлж</option>
      </select>
      <div class="muted">${locked ? "Locked=true тул засах боломжгүй. (Unlock хийж байж засна)" : ""}</div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button class="btn" onclick="closeModal()">ХААХ</button>
        <button class="btn primary" onclick="saveUserEdit('${esc(u.code)}')" ${locked ? "disabled" : ""}>ХАДГАЛАХ</button>
      </div>
    </div>`);
};

window.saveUserEdit = async (code) => {
  const pass = ($("edit-u-pass")?.value || "").trim();
  const ner = ($("edit-u-ner")?.value || "").trim();
  const ovog = ($("edit-u-ovog")?.value || "").trim();
  const role = ($("edit-u-role")?.value || "").trim();
  const place = ($("edit-u-place")?.value || "").trim();
  const department = ($("edit-u-dept")?.value || "").trim();
  const shift = ($("edit-u-shift")?.value || "").trim();

  if (!ner) return popupError("Нэр хоосон байж болохгүй");

  try {
    showLoading(true);
    const r = await apiPost({ action: "update_user", code, pass, ner, ovog, role, place, department, shift });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    await refreshData(false);
    closeModal();
    popupOk("Хадгаллаа");
  } catch (e) { popupError(e.message || String(e)); }
  finally { showLoading(false); }
};

window.deleteUser = async (code) => {
  const u = (users || []).find(x => String(x.code) === String(code));
  const locked = String(u?.locked).toLowerCase() === "true";
  if (locked) return popupError("Locked=true тул устгах боломжгүй. (Unlock хийж байж устгана)");
  if (!confirm("Устгах уу?")) return;
  try {
    showLoading(true);
    const r = await apiPost({ action: "delete_user", code });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    await refreshData(false);
    popupOk("Устгалаа");
  } catch (e) { popupError(e.message || String(e)); }
  finally { showLoading(false); }
};

window.toggleUserLock = async (code) => {
  const u = (users || []).find(x => String(x.code) === String(code));
  if (!u) return;
  const next = !(String(u.locked).toLowerCase() === "true");
  try {
    showLoading(true);
    const r = await apiPost({ action: "set_user_locked", code, locked: next });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    await refreshData(false);
  } catch (e) { popupError(e.message || String(e)); }
  finally { showLoading(false); }
};

window.openUserHistory = async (code) => {
  try {
    showLoading(true);
    const r = await apiPost({ action: "get_user_history", code });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    const hist = r.history || [];
    openModal(`Ажилтны түүх: ${esc(code)}`, `
      <div style="padding:14px;">
        ${hist.length ? hist.map(h => `
          <div class="history-item">
            <div class="muted">${esc(fmtDateOnly(h.date))}</div>
            <div style="font-weight:900;">${esc(h.item || "")}</div>
            <div class="muted">Размер: ${esc(h.size || "")} · Тоо: ${esc(h.qty || "")} ширхэг</div>
          </div>`).join("") : `<div class="muted">Түүх хоосон.</div>`}
        <div style="margin-top:10px;display:flex;justify-content:flex-end;">
          <button class="btn" onclick="closeModal()">ХААХ</button>
        </div>
      </div>`);
  } catch (e) { popupError(e.message || String(e)); }
  finally { showLoading(false); }
};

window.renderUsers = renderUsers;
function renderUsers() {
  const box = $("users-list");
  if (!box) return;

  if (!isAdmin()) { box.innerHTML = `<div class="muted">Зөвхөн Admin харна.</div>`; return; }

  const data = (users || []).slice().sort((a, b) => String(a.code||"").localeCompare(String(b.code||""), "mn"));
  if (!data.length) { box.innerHTML = `<div class="muted">Ажилтан олдсонгүй.</div>`; return; }

  box.innerHTML = `
    <div class="mini-table users-table">
      <div class="mini-th">Код</div>
      <div class="mini-th">Нэр</div>
      <div class="mini-th">Албан тушаал</div>
      <div class="mini-th">Газар / Хэлтэс</div>
      <div class="mini-th">Ээлж</div>
      <div class="mini-th">Locked</div>
      <div class="mini-th" style="text-align:right;">Үйлдэл</div>
      ${data.map((u) => {
        const locked = String(u.locked).toLowerCase() === "true";
        return `
          <div class="mini-td" style="font-weight:900;">${esc(u.code)}</div>
          <div class="mini-td">${esc(u.ovog||"")} ${esc(u.ner||"")}</div>
          <div class="mini-td">${esc(u.role||"")}</div>
          <div class="mini-td">${esc(u.place||"")}${u.department?` / ${esc(u.department)}`:""}</div>
          <div class="mini-td">${esc(u.shift||"")}</div>
          <div class="mini-td">${locked ? `<span class="status st-rejected">LOCKED</span>` : `<span class="status st-approved">OPEN</span>`}</div>
          <div class="mini-td" style="display:flex;gap:8px;justify-content:flex-end;">
            <button class="icon-btn btn-icon" title="Засах" onclick="openEditUser('${esc(u.code)}');event.stopPropagation();">✏️</button>
            <button class="icon-btn btn-icon" title="Устгах" onclick="deleteUser('${esc(u.code)}');event.stopPropagation();" ${locked ? "disabled" : ""}>🗑️</button>
            <button class="icon-btn btn-icon" title="Түүх" onclick="openUserHistory('${esc(u.code)}');event.stopPropagation();">🕘</button>
            <button class="icon-btn btn-icon" title="Locked солих" onclick="toggleUserLock('${esc(u.code)}');event.stopPropagation();">${locked ? "🔓" : "🔒"}</button>
          </div>`;
      }).join("")}
    </div>`;
}

/* ---------------- Password ---------------- */
window.changePass = async () => {
  if (!currentUser || isAdmin()) return popupError("Зөвхөн ажилтан өөрийн нууц үгээ солино");
  const oldP = ($("old-pass")?.value || "").trim();
  const newP = ($("new-pass")?.value || "").trim();
  if (!oldP || !newP) return popupError("Мэдээлэл дутуу");
  try {
    showLoading(true);
    const r = await apiPost({ action: "change_pass", code: currentUser.code, oldP, newP });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    if ($("old-pass")) $("old-pass").value = "";
    if ($("new-pass")) $("new-pass").value = "";
    popupOk("Нууц үг солигдлоо");
  } catch (e) { popupError(e.message || String(e)); }
  finally { showLoading(false); }
};

/* ---------------- Data refresh ---------------- */
window.refreshData = async (keepTab = true) => {
  if (!currentUser) return;
  const activeTab = keepTab ? (document.querySelector(".nav-btn.active")?.id || "nav-orders") : "nav-orders";
  try {
    showLoading(true);
    const r = await apiPost({ action: "get_all_data" });
    if (!r.success) throw new Error(r.msg || "Дата татахад алдаа");
    requests = Array.isArray(r.requests) ? r.requests : [];
    requestItems = Array.isArray(r.request_items) ? r.request_items : [];
    itemsMaster = Array.isArray(r.items) ? r.items : [];
    packsMaster = Array.isArray(r.packs) ? r.packs : [];
    stockMaster = Array.isArray(r.stock) ? r.stock : [];
    rebuildPacksGrouped();
    if (isAdmin()) {
      const u = await apiPost({ action: "get_users" });
      users = u.success ? (u.users || []) : [];
    } else {
      users = [];
    }
    setSidebarUserInfo();
    applyRoleVisibility();
    populateOrderFilters();
    if (activeTab === "nav-orders") showTab("orders", $("nav-orders"));
    if (activeTab === "nav-request") showTab("request", $("nav-request"));
    if (activeTab === "nav-items") {
      showTab("items", $("nav-items"));
      setTimeout(() => {
        renderItemsTabAll();
      }, 0);
    }
    if (activeTab === "nav-users") showTab("users", $("nav-users"));
    if (activeTab === "nav-pass") showTab("pass", $("nav-pass"));
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

/* ---------------- Login / Logout ---------------- */
window.login = async () => {
  const code = ($("login-code")?.value || "").trim();
  const pass = ($("login-pass")?.value || "").trim();
  if (!code || !pass) return popupError("Код, нууц үг оруулна уу");
  try {
    showLoading(true);
    const r = await apiPost({ action: "login", code, pass });
    if (!r.success) throw new Error(r.msg || "Нэвтрэх амжилтгүй");
    currentUser = r.user;
    setLoggedInUI(true);
    setSidebarUserInfo();
    applyRoleVisibility();
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
  packBuilder = [];
  packsGrouped = [];
  currentModalRequestId = null;
  orderFilters = { status: "", shift: "", year: "", month: "", item: "", place: "", dept: "", role: "", code: "", name: "" };
  openHeaderFilterKey = null;
  setLoggedInUI(false);
  if ($("sidebar-userinfo")) $("sidebar-userinfo").textContent = "—";
  if ($("header-userline")) $("header-userline").textContent = "—";
  if ($("login-code")) $("login-code").value = "";
  if ($("login-pass")) $("login-pass").value = "";
};

/* ---------------- Init ---------------- */
function init() {
  setLoggedInUI(false);
  $("login-pass")?.addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
  renderOrdersHeader();
  installHeaderCloseHandler();
  renderKpis();
}

window.addEventListener("load", init);


/* ================= 2026-03-08 UI / FILTER / MODAL OVERRIDES ================= */

function fmtDateTime(v) {
  const d = new Date(v);
  if (isNaN(d)) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function normalizeOverallStatus(v) {
  const s = String(v || "").trim();
  if (s === "Хэсэгчлэн шийдвэрлэсэн") return "Хэсэгчлэн";
  return s || "Хүлээгдэж буй";
}

function getUserMetaByCode(code) {
  const wanted = String(code || "").trim();
  const u = (users || []).find((x) => String(x.code || "").trim() === wanted);
  if (!u) return null;
  return {
    role: String(u.role || "").trim(),
    place: String(u.place || "").trim(),
    department: String(u.department || "").trim(),
    shift: String(u.shift || "").trim(),
    ovog: String(u.ovog || "").trim(),
    ner: String(u.ner || "").trim()
  };
}

function packSignatureFromLines(lines) {
  const counts = {};
  (lines || []).forEach((ln) => {
    const key = `${String(ln.item || "").trim()}__${parseInt(ln.qty, 10) || 0}`;
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.keys(counts).sort().map((k) => `${k}::${counts[k]}`).join("|");
}

function getRequestPackLabel(request_id) {
  const req = requests.find((x) => String(x.request_id) === String(request_id)) || {};
  if (String(req.pack_name || "").trim()) return String(req.pack_name || "").trim();

  const lines = linesForRequest(request_id);
  if (!lines.length) return "Энгийн";

  const reqSig = packSignatureFromLines(lines);
  const grouped = groupPacks ? groupPacks(packsMaster || []) : [];
  const match = grouped.find((p) => packSignatureFromLines((p.lines || []).map((ln) => ({
    item: ln.item,
    qty: ln.default_qty
  }))) === reqSig);

  return match ? String(match.pack_name || "").trim() : "Энгийн";
}

function hydrateRequestsForUI() {
  requests = (requests || []).map((r) => {
    const meta = getUserMetaByCode(r.code) || {};
    return {
      ...r,
      ovog: String(r.ovog || meta.ovog || "").trim(),
      ner: String(r.ner || meta.ner || "").trim(),
      role: String(r.role || meta.role || "").trim(),
      place: String(r.place || meta.place || "").trim(),
      department: String(r.department || meta.department || "").trim(),
      shift: String(r.shift || meta.shift || "").trim(),
      pack_name: String(r.pack_name || "").trim(),
      pack_label: getRequestPackLabel(r.request_id)
    };
  });
}

function getVisibleRequestsHydrated() {
  hydrateRequestsForUI();
  return getVisibleRequests();
}

function renderOrdersHeader() {
  const header = $("requests-header");
  if (!header) return;

  const statusOptions = `
    <option value="">Бүгд</option>
    <option value="Хүлээгдэж буй" ${orderFilters.status==="Хүлээгдэж буй"?"selected":""}>Хүлээгдэж буй</option>
    <option value="Хэсэгчлэн" ${orderFilters.status==="Хэсэгчлэн"?"selected":""}>Хэсэгчлэн</option>
    <option value="Шийдвэрлэсэн" ${orderFilters.status==="Шийдвэрлэсэн"?"selected":""}>Шийдвэрлэсэн</option>`;
  const shiftOptions = `
    <option value="">Бүгд</option>
    <option value="А ээлж" ${orderFilters.shift==="А ээлж"?"selected":""}>А ээлж</option>
    <option value="Б ээлж" ${orderFilters.shift==="Б ээлж"?"selected":""}>Б ээлж</option>
    <option value="В ээлж" ${orderFilters.shift==="В ээлж"?"selected":""}>В ээлж</option>
    <option value="Г ээлж" ${orderFilters.shift==="Г ээлж"?"selected":""}>Г ээлж</option>`;

  if (isAdmin()) {
    header.innerHTML = `
      <div>ЗАХИАЛГЫН ДУГААР</div>
      <div>АЖИЛТАН</div>
      <div>АЛБАН ТУШААЛ</div>
      <div>ГАЗАР, ХЭЛТЭС</div>
      <div>${headerFilterCell("ЭЭЛЖ", "shift", shiftOptions)}</div>
      <div>${headerFilterCell("ТӨЛӨВ", "status", statusOptions)}</div>
      <div>ОГНОО</div>`;
    header.style.gridTemplateColumns = "1.1fr 1.7fr 1.25fr 1.8fr 0.8fr 1.15fr 1.05fr";
  } else {
    header.innerHTML = `
      <div>ЗАХИАЛГЫН ДУГААР</div>
      <div>БАГЦ</div>
      <div>${headerFilterCell("ТӨЛӨВ", "status", statusOptions)}</div>
      <div>ОГНОО</div>`;
    header.style.gridTemplateColumns = "1.2fr 1fr 1.15fr 1.05fr";
  }
}

function populateOrderFilters() {
  const vis = getVisibleRequestsHydrated();
  setSelectOptions($("f-year"), uniq(vis.map(r => getYear(r.requestedDate))).sort(), "Бүгд");
  setSelectOptions($("f-month"), uniq(vis.map(r => getMonth(r.requestedDate))).sort(), "Бүгд");
  setSelectOptions($("f-item"), uniq(vis.map(r => getRequestPackLabel(r.request_id))).sort((a,b)=>String(a).localeCompare(String(b),"mn")), "Бүгд");
  setSelectOptions($("f-place"), uniq(vis.map(r => String(r.place||"").trim())).sort((a,b)=>String(a).localeCompare(String(b),"mn")), "Бүгд");
  setSelectOptions($("f-dept"), uniq(vis.map(r => String(r.department||"").trim())).sort((a,b)=>String(a).localeCompare(String(b),"mn")), "Бүгд");

  window.applyFilters = () => {
    orderFilters.year = ($("f-year")?.value || "").trim();
    orderFilters.month = ($("f-month")?.value || "").trim();
    orderFilters.item = ($("f-item")?.value || "").trim();
    orderFilters.place = ($("f-place")?.value || "").trim();
    orderFilters.dept = ($("f-dept")?.value || "").trim();
    orderFilters.role = ($("f-role")?.value || "").trim();
    orderFilters.name = ($("f-name")?.value || "").trim();
    orderFilters.code = ($("f-code")?.value || "").trim();
    renderRequests();
  };

  window.clearFilters = () => {
    ["f-year","f-month","f-item","f-place","f-dept","f-role","f-name","f-code"].forEach(id => { if ($(id)) $(id).value = ""; });
    orderFilters = { status: orderFilters.status, shift: orderFilters.shift, year:"",month:"",item:"",place:"",dept:"",role:"",code:"",name:"" };
    renderRequests();
  };
}

function passFilters(r) {
  const y = getYear(r.requestedDate);
  const m = getMonth(r.requestedDate);
  const st = normalizeOverallStatus(r.overall_status);
  const packLabel = getRequestPackLabel(r.request_id);

  if (orderFilters.status && st !== orderFilters.status) return false;
  if (orderFilters.shift && String(r.shift || "").trim() !== orderFilters.shift) return false;
  if (orderFilters.year && y !== orderFilters.year) return false;
  if (orderFilters.month && m !== orderFilters.month) return false;
  if (orderFilters.place && String(r.place || "").trim() !== orderFilters.place) return false;
  if (orderFilters.dept && String(r.department || "").trim() !== orderFilters.dept) return false;
  if (orderFilters.role && !String(r.role || "").toLowerCase().includes(orderFilters.role.toLowerCase())) return false;
  if (orderFilters.code && !String(r.code || "").toLowerCase().includes(orderFilters.code.toLowerCase())) return false;
  if (orderFilters.name) {
    const full = `${String(r.ovog || "")} ${String(r.ner || "")}`.toLowerCase();
    if (!full.includes(orderFilters.name.toLowerCase())) return false;
  }
  if (orderFilters.item && packLabel !== orderFilters.item) return false;

  return true;
}

function renderRequests() {
  const list = $("requests-list");
  if (!list) return;

  renderOrdersHeader();

  const data = getVisibleRequests()
    .filter(passFilters)
    .sort((a, b) => new Date(b.requestedDate) - new Date(a.requestedDate));

  if (!data.length) {
    list.innerHTML = `<div style="padding:16px;color:#6b7280;">Мэдээлэл олдсонгүй.</div>`;
    return;
  }

  const gridCols = $("requests-header")?.style.gridTemplateColumns || (
    isAdmin()
      ? "1.1fr 1.8fr 1.3fr 1.8fr 0.9fr 1.2fr 1.1fr"
      : "1.4fr 1.2fr 1.1fr"
  );

  list.innerHTML = data.map((r) => {
    const st = statusMetaOverall(r.overall_status);
    const reqId = esc(r.request_id);

    const fullName = `${String(r.ovog || "").trim()} ${String(r.ner || "").trim()}`.trim();

    const employee = `
      <div>
        <div style="font-weight:900;">${esc(fullName || "—")}</div>
        <div class="sub">ID: ${esc(r.code || "")}</div>
      </div>`;

    const roleCol = `<div>${esc(String(r.role || "").trim())}</div>`;

    const placeDept = `
      <div>
        <div style="font-weight:900;">${esc(r.place || "")}</div>
        <div class="sub">${esc(r.department || "")}</div>
      </div>`;

    const shift = `<div>${esc(r.shift || "")}</div>`;
    const status = `<span class="status ${st.cls}">${esc(st.label)}</span>`;
    const date = `<div>${esc(fmtDateOnly(r.requestedDate))}</div>`;

    if (isAdmin()) {
      return `
        <div class="request-row" style="display:grid;grid-template-columns:${gridCols};" onclick="openRequestDetail('${reqId}')">
          <div class="req-id">${reqId}</div>
          <div>${employee}</div>
          <div>${roleCol}</div>
          <div>${placeDept}</div>
          <div>${shift}</div>
          <div>${status}</div>
          <div>${date}</div>
        </div>`;
    }

    return `
      <div class="request-row" style="display:grid;grid-template-columns:${gridCols};" onclick="openRequestDetail('${reqId}')">
        <div class="req-id">${reqId}</div>
        <div>${status}</div>
        <div>${date}</div>
      </div>`;
  }).join("");
}

  const gridCols = $("requests-header")?.style.gridTemplateColumns || (isAdmin()
    ? "1.1fr 1.7fr 1.25fr 1.8fr 0.8fr 1.15fr 1.05fr"
    : "1.2fr 1fr 1.15fr 1.05fr");

  list.innerHTML = data.map((r) => {
    const st = statusMetaOverall(normalizeOverallStatus(r.overall_status));
    const reqId = esc(r.request_id);
    const fullName = `${r.ovog || ""} ${r.ner || ""}`.trim() || "—";
    const employee = `
      <div>
        <div style="font-weight:900;">${esc(fullName)}</div>
        <div class="sub">ID: ${esc(r.code || "")}</div>
      </div>`;
    const role = `<div>${esc(r.role || "—")}</div>`;
    const placeDept = `
      <div>
        <div style="font-weight:900;">${esc(r.place || "—")}</div>
        <div class="sub">${esc(r.department || "—")}</div>
      </div>`;
    const shift = `<div>${esc(r.shift || "—")}</div>`;
    const status = `<span class="status ${st.cls}">${esc(st.label)}</span>`;
    const date = `<div>${esc(fmtDateTime(r.requestedDate))}</div>`;
    const pack = `<div><span class="status pack-chip">${esc(getRequestPackLabel(r.request_id))}</span></div>`;

    if (isAdmin()) {
      return `
        <div class="request-row orders-admin-grid" onclick="openRequestDetail('${reqId}')">
          <div class="req-id">${reqId}</div>
          <div>${employee}</div>
          <div>${role}</div>
          <div>${placeDept}</div>
          <div>${shift}</div>
          <div>${status}</div>
          <div>${date}</div>
        </div>`;
    }

    return `
      <div class="request-row orders-user-grid" onclick="openRequestDetail('${reqId}')">
        <div class="req-id">${reqId}</div>
        <div>${pack}</div>
        <div>${status}</div>
        <div>${date}</div>
      </div>`;
  }).join("");
}

window.openRequestDetail = (request_id) => {
  hydrateRequestsForUI();
  currentModalRequestId = String(request_id);
  const req = requests.find((x) => String(x.request_id) === String(request_id));
  if (!req) return popupError("Захиалга олдсонгүй");

  const st = statusMetaOverall(normalizeOverallStatus(req.overall_status));
  const packLabel = getRequestPackLabel(request_id);

  const header = `
    <div class="detail-meta">
      <div class="detail-request-title">Захиалгын дугаар: ${esc(req.request_id)}</div>
      <div class="detail-meta-row">
        <span class="muted">Огноо:</span> ${esc(fmtDateTime(req.requestedDate))}
        <span class="detail-meta-sep">•</span>
        <span class="status ${st.cls}">${esc(st.label)}</span>
      </div>
      <div class="detail-meta-grid">
        <div><span class="muted">Ажилтан:</span> ${esc(`${req.ovog || ""} ${req.ner || ""}`.trim())} (Код: ${esc(req.code || "")})</div>
        <div><span class="muted">Албан тушаал:</span> ${esc(req.role || "")}</div>
        <div><span class="muted">Газар/Хэлтэс:</span> ${esc(req.place || "—")} / ${esc(req.department || "—")}</div>
        <div><span class="muted">Ээлж:</span> ${esc(req.shift || "—")}</div>
        <div><span class="muted">Багц:</span> ${esc(packLabel)}</div>
      </div>
    </div>`;

  const tableHead = isAdmin()
    ? `
      <div class="detail-table-wrap">
        <div class="detail-table-head detail-admin-grid">
          <div>БАРАА</div>
          <div>РАЗМЕР</div>
          <div>ТОО</div>
          <div>ОЛГОХ РАЗМЕР</div>
          <div>ОЛГОХ ТОО</div>
          <div>ТӨЛӨВ</div>
          <div>ҮЙЛДЭЛ</div>
        </div>
        ${renderDetailRowsAdmin(request_id)}
      </div>`
    : `
      <div class="detail-table-wrap">
        <div class="detail-table-head detail-user-grid">
          <div>БАРАА</div>
          <div>РАЗМЕР</div>
          <div>ТОО</div>
          <div>ТӨЛӨВ</div>
        </div>
        ${renderDetailRowsUser(request_id)}
      </div>`;

  const footer = isAdmin()
    ? `<div class="detail-footer">
         <button class="btn" onclick="closeModal()">ХААХ</button>
         <button class="btn primary" onclick="finalizeCurrentRequest()">БҮГДИЙГ ШИЙДВЭРЛЭХ</button>
       </div>`
    : `<div class="detail-footer">
         <button class="btn" onclick="closeModal()">ХААХ</button>
       </div>`;

  openModal(`Захиалга: ${request_id}`, `${header}${tableHead}${footer}`);
};

function renderDetailRowsAdmin(request_id) {
  const lines = linesForRequest(request_id);
  if (!lines.length) return `<div class="detail-empty">Мэдээлэл хоосон.</div>`;

  return lines.map((l) => {
    const meta = statusMetaItem(l.item_status);
    const decided = ["Зөвшөөрсөн","Татгалзсан","Хэсэгчлэн шийдвэрлэсэн"].includes(String(l.item_status || "").trim());

    const actionHtml = decided
      ? `<span class="status ${meta.cls}">ШИЙДВЭРЛЭСЭН</span>`
      : `
        <div class="detail-actions">
          <button class="icon-btn action-icon approve" title="Олгох" onclick="issueLine('${escAttr(l.line_id)}');event.stopPropagation();">✓</button>
          <button class="icon-btn action-icon reject" title="Татгалзах" onclick="issueLineReject('${escAttr(l.line_id)}');event.stopPropagation();">✕</button>
        </div>`;

    return `
      <div class="detail-table-row detail-admin-grid">
        <div class="cell-strong">${esc(l.item || "")}</div>
        <div>${esc(l.size || "—")}</div>
        <div>${esc(l.qty ?? "")}</div>
        <div><input class="input tiny issue-field" id="iss-size-${escAttr(l.line_id)}" value="${escAttr(l.issued_size || l.size || "")}" placeholder="Размер"/></div>
        <div><input class="input tiny issue-field" id="iss-qty-${escAttr(l.line_id)}" type="number" min="0" value="${escAttr(l.issued_qty || l.qty || 0)}" placeholder="Тоо"/></div>
        <div><span class="status ${meta.cls}">${esc(meta.label)}</span></div>
        <div>${actionHtml}</div>
      </div>`;
  }).join("");
}

function renderDetailRowsUser(request_id) {
  const lines = linesForRequest(request_id);
  if (!lines.length) return `<div class="detail-empty">Мэдээлэл хоосон.</div>`;

  return lines.map((l) => {
    const meta = statusMetaItem(l.item_status);
    return `
      <div class="detail-table-row detail-user-grid">
        <div class="cell-strong">${esc(l.item || "")}</div>
        <div>${esc(l.size || "—")}</div>
        <div>${esc(l.qty ?? "")}</div>
        <div><span class="status ${meta.cls}">${esc(meta.label)}</span></div>
      </div>`;
  }).join("");
}

function renderItemsTabAll() {
  renderItems();
  fillPackItemSelect();
  renderPackBuilder();
  renderPacks();
}

window.showTab = (tabName, btn) => {
  if (!isAdmin() && tabName === "items") return popupError("Зөвхөн админ харна.");
  if (!isAdmin() && tabName === "users") return popupError("Зөвхөн админ харна.");
  if (isAdmin() && tabName === "request") return popupError("Админ талд захиалга гаргах шаардлагагүй.");

  document.querySelectorAll(".tab-content").forEach((el) => el.classList.add("hidden"));
  $(`tab-${tabName}`)?.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");

  if (window.innerWidth < 1024) closeSidebar();

  if (tabName === "orders") { populateOrderFilters(); renderRequests(); }
  if (tabName === "request") { fillRequestForm(); renderCart(); renderUserHistory(); }
  if (tabName === "items") setTimeout(renderItemsTabAll, 0);
  if (tabName === "users") renderUsers();
};

window.refreshData = async (keepTab = true) => {
  if (!currentUser) return;
  const activeTab = keepTab ? (document.querySelector(".nav-btn.active")?.id || "nav-orders") : "nav-orders";
  try {
    showLoading(true);
    const r = await apiPost({ action: "get_all_data" });
    if (!r.success) throw new Error(r.msg || "Дата татах��д алдаа");
    requests = Array.isArray(r.requests) ? r.requests : [];
    requestItems = Array.isArray(r.request_items) ? r.request_items : [];
    itemsMaster = Array.isArray(r.items) ? r.items : [];
    packsMaster = Array.isArray(r.packs) ? r.packs : [];
    stockMaster = Array.isArray(r.stock) ? r.stock : [];
    rebuildPacksGrouped();
    if (isAdmin()) {
      const u = await apiPost({ action: "get_users" });
      users = u.success ? (u.users || []) : [];
    } else {
      users = [];
    }
    hydrateRequestsForUI();
    setSidebarUserInfo();
    applyRoleVisibility();
    populateOrderFilters();

    if (activeTab === "nav-orders") showTab("orders", $("nav-orders"));
    if (activeTab === "nav-request") showTab("request", $("nav-request"));
    if (activeTab === "nav-items") {
      showTab("items", $("nav-items"));
      setTimeout(renderItemsTabAll, 0);
    }
    if (activeTab === "nav-users") showTab("users", $("nav-users"));
    if (activeTab === "nav-pass") showTab("pass", $("nav-pass"));
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};



/* ===== FINAL OVERRIDES: mobile fixes, request mode, receive by password ===== */
let loginInFlight = false;

function rebuildPacksGrouped() {
  packsGrouped = groupPacks(packsMaster || []);
}

function normalizeOverallStatus(v, receivedConfirmed) {
  const s = String(v || "").trim();
  const received = String(receivedConfirmed || "").toLowerCase() === "true" || receivedConfirmed === true;
  if (received) return "Хүлээн авсан";
  if (s === "Шийдвэрлэсэн") return "Хүлээн аваагүй";
  if (s === "Хэсэгчлэн шийдвэрлэсэн") return "Хэсэгчлэн";
  return s || "Хүлээгдэж буй";
}

function getRequestPackLabel(request_id) {
  const req = (requests || []).find((x) => String(x.request_id) === String(request_id)) || {};
  if (String(req.pack_name || "").trim()) return String(req.pack_name || "").trim();

  const lines = linesForRequest(request_id);
  if (!lines.length) return "Энгийн";

  const lineCounts = {};
  lines.forEach((ln) => {
    const key = `${String(ln.item || "").trim()}__${parseInt(ln.qty, 10) || 0}`;
    lineCounts[key] = (lineCounts[key] || 0) + 1;
  });

  const grouped = groupPacks(packsMaster || []);
  for (const p of grouped) {
    const packCounts = {};
    (p.lines || []).forEach((ln) => {
      const key = `${String(ln.item || "").trim()}__${parseInt(ln.default_qty, 10) || 0}`;
      packCounts[key] = (packCounts[key] || 0) + 1;
    });
    const a = Object.keys(lineCounts).sort().map(k => `${k}:${lineCounts[k]}`).join("|");
    const b = Object.keys(packCounts).sort().map(k => `${k}:${packCounts[k]}`).join("|");
    if (a && a === b) return p.pack_name || "Энгийн";
  }
  return "Энгийн";
}

function hydrateRequestsForUI() {
  requests = (requests || []).map((r) => {
    const role = String(r.role || "").trim();
    const place = String(r.place || "").trim();
    const department = String(r.department || "").trim();
    const shift = String(r.shift || "").trim();
    return {
      ...r,
      role,
      place,
      department,
      shift,
      pack_label: getRequestPackLabel(r.request_id),
      ui_status: normalizeOverallStatus(r.overall_status, r.received_confirmed)
    };
  });
}

function statusMetaOverall(s) {
  const st = String(s || "").trim();
  if (st === "Шийдвэрлэсэн") return { label: "ШИЙДВЭРЛЭСЭН", cls: "st-approved" };
  if (st === "Хүлээн авсан") return { label: "ХҮЛЭЭН АВСАН", cls: "st-approved" };
  if (st === "Хүлээн аваагүй") return { label: "ХҮЛЭЭН АВААГҮЙ", cls: "st-pending" };
  if (st === "Хэсэгчлэн" || st === "Хэсэгчлэн шийдвэрлэсэн") return { label: "ХЭСЭГЧЛЭН ШИЙДВЭРЛЭСЭН", cls: "st-pending" };
  return { label: "ХҮЛЭЭГДЭЖ БУЙ", cls: "st-pending" };
}

window.login = async function () {
  if (loginInFlight) return;
  const code = ($("login-code")?.value || "").trim();
  const pass = ($("login-pass")?.value || "").trim();
  if (!code || !pass) return popupError("Код болон нууц үг оруулна уу");

  const btn = document.querySelector('#login-screen button[onclick="login()"]');
  try {
    loginInFlight = true;
    if (btn) btn.disabled = true;
    showLoading(true);
    const data = await apiPost({ action: "login", code, pass });
    if (!data.success) throw new Error(data.msg || "Нэвтрэхэд алдаа гарлаа");
    currentUser = data.user;
    setLoggedInUI(true);
    setSidebarUserInfo();
    applyRoleVisibility();
    await refreshData(true);
  } catch (err) {
    popupError(err.message || "Сервертэй холбогдож чадсангүй");
  } finally {
    loginInFlight = false;
    if (btn) btn.disabled = false;
    showLoading(false);
  }
};

function syncRequestModeUI() {
  const packVal = ($("req-pack")?.value || "").trim();
  const manualHasCart = (cart || []).length > 0;
  const hasPackSelected = !!packVal;

  const reqItem = $("req-item");
  const reqSize = $("req-size");
  const reqQty = $("req-qty");
  const btnAdd = $("btn-add-item");
  const btnSubmit = $("btn-submit-request");
  const btnPackAdd = $("btn-pack-add");
  const btnPackSubmit = $("btn-pack-submit");
  const manualBlock = $("manual-request-block");

  const manualDisabled = hasPackSelected;
  [reqItem, reqSize, reqQty, btnAdd, btnSubmit].forEach(el => { if (el) el.disabled = manualDisabled; });
  if (manualBlock) manualBlock.classList.toggle("mode-disabled", manualDisabled);

  const packDisabled = manualHasCart && !hasPackSelected;
  [btnPackAdd, btnPackSubmit].forEach(el => { if (el) el.disabled = packDisabled; });

  if (reqItem) reqItem.disabled = manualDisabled;
  if (reqSize) reqSize.disabled = manualDisabled;
  if (reqQty) reqQty.disabled = manualDisabled;
}

function fillRequestForm() {
  const itemSel = $("req-item");
  const sizeSel = $("req-size");
  const packSel = $("req-pack");

  if (itemSel) {
    const itemNames = (itemsMaster || [])
      .map((x) => String(x.name || "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "mn"));
    setSelectOptions(itemSel, itemNames, "Сонгох");

    const onItemChange = () => {
      const itemName = (itemSel.value || "").trim();
      const it = itemsMaster.find((x) => String(x.name || "") === itemName);
      const sizes = it ? String(it.sizes || "").split(",").map((s) => s.trim()).filter(Boolean) : [];
      setSelectOptions(sizeSel, sizes, "Сонгох");
      syncRequestModeUI();
    };
    itemSel.onchange = onItemChange;
    onItemChange();
  }

  if (packSel) {
    const activePackNames = groupPacks(packsMaster || [])
      .filter((p) => p.active)
      .map((p) => p.pack_name);
    setSelectOptions(packSel, activePackNames, "Сонгох");
    packSel.onchange = () => {
      if ((packSel.value || "").trim()) {
        // clear manual selections when switching to pack mode
        if ($("req-item")) $("req-item").value = "";
        if ($("req-size")) setSelectOptions($("req-size"), [], "Сонгох");
        if ($("req-qty")) $("req-qty").value = 1;
      }
      syncRequestModeUI();
    };
  }

  syncRequestModeUI();
}

window.addToCart = () => {
  if (isAdmin()) return popupError("Админ талд захиалга илгээх хэрэггүй");
  if (($("req-pack")?.value || "").trim()) return popupError("Багц сонгосон үед энгийн бараа нэмэхгүй.");
  const item = ($("req-item")?.value || "").trim();
  const size = ($("req-size")?.value || "").trim();
  let qty = parseInt(($("req-qty")?.value || "1"), 10);
  if (!qty || qty < 1) qty = 1;

  if (!item) return popupError("Бараа сонгоно уу");
  if (!size) return popupError("Размер сонгоно уу");

  const idx = cart.findIndex((x) => x.item === item && x.size === size);
  if (idx >= 0) cart[idx].qty += qty;
  else cart.push({ item, size, qty });

  renderCart();
  if ($("req-item")) $("req-item").value = "";
  if ($("req-size")) setSelectOptions($("req-size"), [], "Сонгох");
  if ($("req-qty")) $("req-qty").value = 1;
  syncRequestModeUI();
};

window.removeCartItem = (i) => { cart.splice(i, 1); renderCart(); syncRequestModeUI(); };

window.addPackToCart = () => {
  if ((cart || []).length > 0) return popupError("Энгийн бараа сонгосон үед багц нэмэхгүй.");
  const packName = ($("req-pack")?.value || "").trim();
  if (!packName) return popupError("Багц сонгоно уу");

  const grouped = groupPacks(packsMaster || []);
  const pack = grouped.find((p) => p.pack_name === packName && p.active);
  if (!pack || !pack.lines.length) return popupError("Багц хоосон/олдсонгүй");

  const modalHtml = `
    <div style="padding:14px;">
      <div class="muted" style="margin-bottom:12px;">${esc(packName)} багцын бараа бүрт размер сонгоно уу.</div>
      <div class="mini-table pack-grid" style="display:grid;gap:10px;">
        ${pack.lines.map((ln, i) => {
          const item = itemsMaster.find((x) => String(x.name || "") === String(ln.item || ""));
          const sizes = item ? String(item.sizes || "").split(",").map((s) => s.trim()).filter(Boolean) : [];
          return `
            <div class="light-table-row" style="grid-template-columns:2fr 1fr 1.2fr;">
              <div style="font-weight:900;">${esc(ln.item)}</div>
              <div>${esc(ln.default_qty)} ширхэг</div>
              <div>
                <select id="pack-size-${i}" class="input">
                  <option value="">Размер</option>
                  ${sizes.map((s) => `<option value="${escAttr(s)}">${esc(s)}</option>`).join("")}
                </select>
              </div>
            </div>`;
        }).join("")}
      </div>
      <div class="detail-footer modal-actions">
        <button class="btn" onclick="closeModal()">ХААХ</button>
        <button class="btn primary" onclick="confirmPackToCart('${escAttr(packName)}')">БАГЦ НЭМЭХ</button>
      </div>
    </div>`;
  openModal(`Багц: ${packName}`, modalHtml);
};

window.confirmPackToCart = (packName) => {
  const grouped = groupPacks(packsMaster || []);
  const pack = grouped.find((p) => p.pack_name === packName && p.active);
  if (!pack) return popupError("Багц олдсонгүй");

  for (let i = 0; i < pack.lines.length; i++) {
    const ln = pack.lines[i];
    const size = ($(`pack-size-${i}`)?.value || "").trim();
    if (!size) return popupError(`"${ln.item}" бараанд размер сонгоно уу.`);
  }

  pack.lines.forEach((ln, i) => {
    const size = ($(`pack-size-${i}`)?.value || "").trim();
    const qty = parseInt(ln.default_qty, 10) || 1;
    const idx = cart.findIndex((x) => x.item === ln.item && x.size === size);
    if (idx >= 0) cart[idx].qty += qty;
    else cart.push({ item: ln.item, size, qty });
  });

  renderCart();
  if ($("req-pack")) $("req-pack").value = "";
  closeModal();
  syncRequestModeUI();
};

window.submitPackRequest = async () => {
  if ((cart || []).length > 0) return popupError("Энгийн бараа сонгосон үед багц илгээхгүй.");
  const packName = ($("req-pack")?.value || "").trim();
  if (!packName) return popupError("Багц сонгоно уу");

  const grouped = groupPacks(packsMaster || []);
  const pack = grouped.find((p) => p.pack_name === packName && p.active);
  if (!pack || !pack.lines.length) return popupError("Багц хоосон/олдсонгүй");

  const modalHtml = `
    <div style="padding:14px;">
      <div class="muted" style="margin-bottom:12px;">${esc(packName)} багцын бараа бүрт размер сонгоод шууд илгээнэ.</div>
      <div class="mini-table pack-grid" style="display:grid;gap:10px;">
        ${pack.lines.map((ln, i) => {
          const item = itemsMaster.find((x) => String(x.name || "") === String(ln.item || ""));
          const sizes = item ? String(item.sizes || "").split(",").map((s) => s.trim()).filter(Boolean) : [];
          return `
            <div class="light-table-row" style="grid-template-columns:2fr 1fr 1.2fr;">
              <div style="font-weight:900;">${esc(ln.item)}</div>
              <div>${esc(ln.default_qty)} ширхэг</div>
              <div>
                <select id="pack-submit-size-${i}" class="input">
                  <option value="">Размер</option>
                  ${sizes.map((s) => `<option value="${escAttr(s)}">${esc(s)}</option>`).join("")}
                </select>
              </div>
            </div>`;
        }).join("")}
      </div>
      <div class="detail-footer modal-actions">
        <button class="btn" onclick="closeModal()">ХААХ</button>
        <button class="btn primary" onclick="confirmSubmitPackRequest('${escAttr(packName)}')">БАГЦ ИЛГЭЭХ</button>
      </div>
    </div>`;
  openModal(`Багц илгээх: ${packName}`, modalHtml);
};

window.submitMultiRequest = async () => {
  try {
    if (($("req-pack")?.value || "").trim()) return popupError("Багц сонгосон үед энгийн захиалга илгээхгүй.");
    if (isAdmin()) return popupError("Админ талд захиалга илгээх хэрэггүй");
    if (!currentUser) return popupError("Нэвтэрнэ үү");
    if (!cart.length) return popupError("Сонгосон бараа алга");
    showLoading(true);
    const r = await apiPost({
      action: "add_request",
      code: currentUser.code,
      items: cart.map((x) => ({ item: x.item, size: x.size, qty: x.qty })),
    });
    if (!r.success) throw new Error(r.msg || "Илгээхэд алдаа");
    cart = [];
    renderCart();
    syncRequestModeUI();
    popupOk(`Захиалга амжилттай илгээгдлээ (${r.request_id || ""})`);
    await refreshData(false);
    showTab("orders", $("nav-orders"));
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

function renderReceiveConfirmSection(req) {
  const overall = normalizeOverallStatus(req.overall_status, req.received_confirmed);
  const alreadyReceived = String(req.received_confirmed || "").toLowerCase() === "true" || req.received_confirmed === true;
  if (alreadyReceived) {
    return `
      <div class="detail-receive-box">
        <div class="receive-title">ХҮЛЭЭН АВСАН</div>
        <div class="muted">Энэ захиалгыг ажилтан хүлээн авсан байна.</div>
      </div>`;
  }
  if (overall !== "Хүлээн аваагүй") return "";

  return `
    <div class="detail-receive-box">
      <div class="receive-title">ХҮЛЭЭН АВАЛТ БАТАЛГААЖУУЛАХ</div>
      <div class="receive-row">
        <input id="receive-pass" class="input receive-pin" type="password" placeholder="Нууц үг оруулна уу" />
        <button class="btn primary" onclick="confirmReceive()">ХҮЛЭЭН АВСАН</button>
      </div>
    </div>`;
}

window.confirmReceive = async () => {
  const pass = ($("receive-pass")?.value || "").trim();
  if (!pass) return popupError("Нууц үг оруулна уу");
  try {
    showLoading(true);
    const r = await apiPost({ action: "confirm_receive", code: currentUser.code, request_id: currentModalRequestId, pass });
    if (!r.success) throw new Error(r.msg || "Алдаа гарлаа");
    await refreshData(false);
    if (currentModalRequestId) openRequestDetail(currentModalRequestId);
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

function renderOrdersHeader() {
  const header = $("requests-header");
  if (!header) return;

  const statusOptions = `
    <option value="">Бүгд</option>
    <option value="Хүлээгдэж буй" ${orderFilters.status==="Хүлээгдэж буй"?"selected":""}>Хүлээгдэж буй</option>
    <option value="Хэсэгчлэн" ${orderFilters.status==="Хэсэгчлэн"?"selected":""}>Хэсэгчлэн</option>
    <option value="Хүлээн аваагүй" ${orderFilters.status==="Хүлээн аваагүй"?"selected":""}>Хүлээн аваагүй</option>
    <option value="Хүлээн авсан" ${orderFilters.status==="Хүлээн авсан"?"selected":""}>Хүлээн авсан</option>`;

  const shiftOptions = `
    <option value="">Бүгд</option>
    <option value="А ээлж" ${orderFilters.shift==="А ээлж"?"selected":""}>А ээлж</option>
    <option value="Б ээлж" ${orderFilters.shift==="Б ээлж"?"selected":""}>Б ээлж</option>
    <option value="В ээлж" ${orderFilters.shift==="В ээлж"?"selected":""}>В ээлж</option>
    <option value="Г ээлж" ${orderFilters.shift==="Г ээлж"?"selected":""}>Г ээлж</option>`;

  if (isAdmin()) {
    header.innerHTML = `
      <div>ЗАХИАЛГЫН ДУГААР</div>
      <div>АЖИЛТАН</div>
      <div>АЛБАН ТУШААЛ</div>
      <div>ГАЗАР, ХЭЛТЭС</div>
      <div>${headerFilterCell("ЭЭЛЖ", "shift", shiftOptions)}</div>
      <div>${headerFilterCell("ТӨЛӨВ", "status", statusOptions)}</div>
      <div>ОГНОО</div>`;
    header.style.gridTemplateColumns = "1.1fr 1.8fr 1.3fr 1.8fr .8fr 1.2fr 1.1fr";
  } else {
    header.innerHTML = `
      <div>ЗАХИАЛГЫН ДУГААР</div>
      <div>БАГЦ</div>
      <div>${headerFilterCell("ТӨЛӨВ", "status", statusOptions)}</div>
      <div>ОГНОО</div>`;
    header.style.gridTemplateColumns = "1.3fr .9fr 1.2fr 1.1fr";
  }
}

function passFilters(r) {
  const y = getYear(r.requestedDate);
  const m = getMonth(r.requestedDate);
  const st = normalizeOverallStatus(r.overall_status, r.received_confirmed);
  if (orderFilters.status && st !== orderFilters.status) return false;
  if (orderFilters.shift && String(r.shift || "").trim() !== orderFilters.shift) return false;
  if (orderFilters.year && y !== orderFilters.year) return false;
  if (orderFilters.month && m !== orderFilters.month) return false;
  if (orderFilters.place && String(r.place || "").trim() !== orderFilters.place) return false;
  if (orderFilters.dept && String(r.department || "").trim() !== orderFilters.dept) return false;
  if (orderFilters.role && !String(r.role || "").toLowerCase().includes(orderFilters.role.toLowerCase())) return false;
  if (orderFilters.code && !String(r.code || "").toLowerCase().includes(orderFilters.code.toLowerCase())) return false;
  if (orderFilters.name) {
    const full = `${String(r.ovog||"")} ${String(r.ner||"")}`.toLowerCase();
    if (!full.includes(orderFilters.name.toLowerCase())) return false;
  }
  if (orderFilters.item) {
    const packLabel = getRequestPackLabel(r.request_id);
    if (String(packLabel || "").trim() !== orderFilters.item) return false;
  }
  return true;
}

function populateOrderFilters() {
  const vis = getVisibleRequests();
  setSelectOptions($("f-year"), uniq(vis.map(r => getYear(r.requestedDate))).sort(), "Бүгд");
  setSelectOptions($("f-month"), uniq(vis.map(r => getMonth(r.requestedDate))).sort(), "Бүгд");
  setSelectOptions($("f-item"), uniq(vis.map(r => getRequestPackLabel(r.request_id))).sort((a,b)=>a.localeCompare(b,"mn")), "Бүгд");
  setSelectOptions($("f-place"), uniq(vis.map(r => String(r.place||"").trim())).sort(), "Бүгд");
  setSelectOptions($("f-dept"), uniq(vis.map(r => String(r.department||"").trim())).sort(), "Бүгд");

  window.applyFilters = () => {
    orderFilters.year = ($("f-year")?.value || "").trim();
    orderFilters.month = ($("f-month")?.value || "").trim();
    orderFilters.item = ($("f-item")?.value || "").trim();
    orderFilters.place = ($("f-place")?.value || "").trim();
    orderFilters.dept = ($("f-dept")?.value || "").trim();
    orderFilters.role = ($("f-role")?.value || "").trim();
    orderFilters.name = ($("f-name")?.value || "").trim();
    orderFilters.code = ($("f-code")?.value || "").trim();
    renderRequests();
  };
  window.clearFilters = () => {
    ["f-year","f-month","f-item","f-place","f-dept","f-role","f-name","f-code"].forEach(id => { if ($(id)) $(id).value = ""; });
    orderFilters = { status: orderFilters.status, shift: orderFilters.shift, year:"",month:"",item:"",place:"",dept:"",role:"",code:"",name:"" };
    renderRequests();
  };
}

function renderRequests() {
  const list = $("requests-list");
  if (!list) return;
  hydrateRequestsForUI();
  renderOrdersHeader();

  const data = getVisibleRequests().filter(passFilters)
    .sort((a, b) => new Date(b.requestedDate) - new Date(a.requestedDate));

  if (!data.length) {
    list.innerHTML = `<div style="padding:16px;color:#6b7280;">Мэдээлэл олдсонгүй.</div>`;
    return;
  }

  const gridCols = $("requests-header")?.style.gridTemplateColumns || (isAdmin()
    ? "1.1fr 1.8fr 1.3fr 1.8fr .8fr 1.2fr 1.1fr"
    : "1.3fr .9fr 1.2fr 1.1fr");

  list.innerHTML = data.map((r) => {
    const st = statusMetaOverall(normalizeOverallStatus(r.overall_status, r.received_confirmed));
    const reqId = esc(r.request_id);
    const packLabel = getRequestPackLabel(r.request_id);

    if (isAdmin()) {
      return `<div class="request-row" style="grid-template-columns:${gridCols};" onclick="openRequestDetail('${reqId}')">
        <div class="req-id">${reqId}</div>
        <div><div style="font-weight:900;">${esc(`${r.ovog||""} ${r.ner||""}`.trim() || "—")}</div><div class="sub">ID: ${esc(r.code||"")}</div></div>
        <div>${esc(r.role || "—")}</div>
        <div><div style="font-weight:900;">${esc(r.place||"—")}</div><div class="sub">${esc(r.department||"—")}</div></div>
        <div>${esc(r.shift||"—")}</div>
        <div><span class="status ${st.cls}">${esc(st.label)}</span></div>
        <div>${esc(fmtDateOnly(r.requestedDate))}</div>
      </div>`;
    }

    return `<div class="request-row" style="grid-template-columns:${gridCols};" onclick="openRequestDetail('${reqId}')">
      <div class="req-id">${reqId}</div>
      <div><span class="status pack-chip">${esc(packLabel)}</span></div>
      <div><span class="status ${st.cls}">${esc(st.label)}</span></div>
      <div>${esc(fmtDateOnly(r.requestedDate))}</div>
    </div>`;
  }).join("");
}

window.openRequestDetail = (request_id) => {
  hydrateRequestsForUI();
  currentModalRequestId = String(request_id);
  const req = requests.find((x) => String(x.request_id) === String(request_id));
  if (!req) return popupError("Захиалга олдсонгүй");

  const st = statusMetaOverall(normalizeOverallStatus(req.overall_status, req.received_confirmed));
  const packLabel = getRequestPackLabel(request_id);

  const header = `
    <div class="detail-meta">
      <div class="detail-request-title">Захиалгын дугаар: ${esc(req.request_id)}</div>
      <div class="detail-meta-row">
        <span class="muted">Огноо:</span> ${esc(fmtDateOnly(req.requestedDate))}
        <span class="detail-meta-sep">•</span>
        <span class="status ${st.cls}">${esc(st.label)}</span>
      </div>
      <div class="detail-meta-grid">
        <div><span class="muted">Ажилтан:</span> ${esc(`${req.ovog || ""} ${req.ner || ""}`.trim())} (Код: ${esc(req.code || "")})</div>
        <div><span class="muted">Албан тушаал:</span> ${esc(req.role || "—")}</div>
        <div><span class="muted">Газар/Хэлтэс:</span> ${esc(req.place || "—")} / ${esc(req.department || "—")}</div>
        <div><span class="muted">Ээлж:</span> ${esc(req.shift || "—")}</div>
        <div><span class="muted">Багц:</span> ${esc(packLabel)}</div>
      </div>
    </div>`;

  const tableHead = isAdmin()
    ? `
      <div class="detail-table-wrap">
        <div class="detail-table-head detail-admin-head-grid detail-head-top">
          <div>БАРАА</div>
          <div class="group-head" style="grid-column:2 / span 2;">ХҮССЭН</div>
          <div class="group-head" style="grid-column:4 / span 2;">ОЛГОХ</div>
          <div>ТӨЛӨВ</div>
          <div>ҮЙЛДЭЛ</div>
        </div>
        <div class="detail-table-head detail-admin-grid detail-head-sub">
          <div></div>
          <div>РАЗМЕР</div>
          <div>ТОО</div>
          <div>РАЗМЕР</div>
          <div>ТОО</div>
          <div></div>
          <div></div>
        </div>
        ${renderDetailRowsAdmin(request_id)}
      </div>`
    : `
      <div class="detail-table-wrap">
        <div class="detail-table-head detail-user-grid">
          <div>БАРАА</div>
          <div>РАЗМЕР</div>
          <div>ТОО</div>
          <div>ТӨЛӨВ</div>
        </div>
        ${renderDetailRowsUser(request_id)}
      </div>`;

  const receiveSection = !isAdmin() ? renderReceiveConfirmSection(req) : "";

  const footer = isAdmin()
    ? `<div class="detail-footer">
         <button class="btn" onclick="closeModal()">ХААХ</button>
         <button class="btn primary" onclick="finalizeCurrentRequest()">БҮГДИЙГ ШИЙДВЭРЛЭХ</button>
       </div>`
    : `<div class="detail-footer">
         <button class="btn" onclick="closeModal()">ХААХ</button>
       </div>`;

  openModal(`Захиалга: ${request_id}`, `${header}${tableHead}${receiveSection}${footer}`);
};

window.showTab = (tabName, btn) => {
  if (!isAdmin() && tabName === "items") return popupError("Зөвхөн админ харна.");
  if (!isAdmin() && tabName === "users") return popupError("Зөвхөн админ харна.");
  if (isAdmin() && tabName === "request") return popupError("Админ талд захиалга гаргах шаардлагагүй.");

  document.querySelectorAll(".tab-content").forEach((el) => el.classList.add("hidden"));
  $(`tab-${tabName}`)?.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");

  if (window.innerWidth < 1024) closeSidebar();

  if (tabName === "orders") { populateOrderFilters(); renderRequests(); }
  if (tabName === "request") { fillRequestForm(); renderCart(); renderUserHistory(); }
  if (tabName === "items") setTimeout(renderItemsTabAll, 0);
  if (tabName === "users") renderUsers();
};

window.refreshData = async (keepTab = true) => {
  if (!currentUser) return;
  const activeTab = keepTab ? (document.querySelector(".nav-btn.active")?.id || "nav-orders") : "nav-orders";
  try {
    showLoading(true);
    const r = await apiPost({ action: "get_all_data" });
    if (!r.success) throw new Error(r.msg || "Дата татахад алдаа");
    requests = Array.isArray(r.requests) ? r.requests : [];
    requestItems = Array.isArray(r.request_items) ? r.request_items : [];
    itemsMaster = Array.isArray(r.items) ? r.items : [];
    packsMaster = Array.isArray(r.packs) ? r.packs : [];
    stockMaster = Array.isArray(r.stock) ? r.stock : [];
    rebuildPacksGrouped();
    if (isAdmin()) {
      const u = await apiPost({ action: "get_users" });
      users = u.success ? (u.users || []) : [];
    } else {
      users = [];
    }
    hydrateRequestsForUI();
    setSidebarUserInfo();
    applyRoleVisibility();
    populateOrderFilters();

    if (activeTab === "nav-orders") showTab("orders", $("nav-orders"));
    if (activeTab === "nav-request") showTab("request", $("nav-request"));
    if (activeTab === "nav-items") setTimeout(() => showTab("items", $("nav-items")), 0);
    if (activeTab === "nav-users") showTab("users", $("nav-users"));
    if (activeTab === "nav-pass") showTab("pass", $("nav-pass"));
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

/* ---------------- Login / Logout ---------------- */
window.login = async () => {
  const btn = document.querySelector('#login-screen button[onclick="login()"]');
  if (btn?.dataset.loading === "1") return;

  const code = ($("login-code")?.value || "").trim();
  const pass = ($("login-pass")?.value || "").trim();
  if (!code || !pass) return popupError("Код, нууц үг оруулна уу");

  try {
    if (btn) {
      btn.dataset.loading = "1";
      btn.disabled = true;
    }
    showLoading(true);
    const r = await apiPost({ action: "login", code, pass });
    if (!r.success) throw new Error(r.msg || "Нэвтрэх амжилтгүй");
    currentUser = r.user;
    setLoggedInUI(true);
    setSidebarUserInfo();
    applyRoleVisibility();
    await refreshData(false);
    if (isAdmin()) showTab("orders", $("nav-orders"));
    else showTab("request", $("nav-request"));
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
    if (btn) {
      btn.dataset.loading = "0";
      btn.disabled = false;
    }
  }
};

window.logout = () => {
  currentUser = null;
  requests = [];
  requestItems = [];
  itemsMaster = [];
  packsMaster = [];
  stockMaster = [];
  packBuilder = [];
  packsGrouped = [];
  users = [];
  cart = [];
  currentModalRequestId = null;
  orderFilters = { status: "", shift: "", year: "", month: "", item: "", place: "", dept: "", role: "", code: "", name: "" };
  openHeaderFilterKey = null;
  setLoggedInUI(false);
  if ($("sidebar-userinfo")) $("sidebar-userinfo").textContent = "—";
  if ($("header-userline")) $("header-userline").textContent = "—";
  if ($("login-code")) $("login-code").value = "";
  if ($("login-pass")) $("login-pass").value = "";
};

/* ---------------- Init ---------------- */
function init() {
  setLoggedInUI(false);
  $("login-pass")?.addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
  renderOrdersHeader();
  installHeaderCloseHandler();
  renderKpis();
}

window.addEventListener("load", init);
