const API_URL = "https://script.google.com/macros/s/AKfycbzCTHxnIWVV70Nw9NBuADybkcWaCtg9dBe91CY008uXhSw7lRp01WDlFpeR6otNDaYE/exec";

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
      <div>ГАЗАР, ХЭЛТЭС</div>
      <div>${headerFilterCell("ЭЭЛЖ", "shift", shiftOptions)}</div>
      <div>${headerFilterCell("ТӨЛӨВ", "status", statusOptions)}</div>
      <div>ОГНОО</div>`;
    // ✅ БАРАА багана авсан
    header.style.gridTemplateColumns = "1.1fr 2.1fr 2.2fr 0.7fr 1.2fr 1.1fr";
  } else {
    header.innerHTML = `
      <div>ЗАХИАЛГЫН ДУГААР</div>
      <div>${headerFilterCell("ТӨЛӨВ", "status", statusOptions)}</div>
      <div>ОГНОО</div>`;
    // ✅ Ажилтан: зөвхөн дугаар / төлөв / огноо
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
  if (orderFilters.role && !String(r.role || "").toLowerCase().includes(orderFilters.role.toLowerCase())) return false;
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
        <div class="sub">ID: ${esc(r.code||"")}${r.role?` · ${esc(r.role)}`:""}</div></div>`;

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

function renderReceiveConfirmSection(req) {
  const overall = normalizeOverallStatus(req.overall_status);
  const alreadyReceived = String(req.received_confirmed || "").toLowerCase() === "true" || req.received_confirmed === true;
  if (alreadyReceived) {
    return `
      <div class="detail-receive-box">
        <div class="receive-title">ХҮЛЭЭН АВСАН</div>
        <div class="muted">Энэ захиалгыг ажилтан хүлээн авсан байна.</div>
      </div>`;
  }
  if (overall !== "Шийдвэрлэсэн") return "";

  return `
    <div class="detail-receive-box">
      <div class="receive-title">ХҮЛЭЭН АВАЛТ БАТАЛГААЖУУЛАХ</div>
      <div class="receive-row">
        <input id="receive-pin" class="input receive-pin" type="password" placeholder="PIN оруулна уу" />
        <button class="btn primary" onclick="confirmReceive()">ХҮЛЭЭН АВСАН</button>
      </div>
    </div>`;
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
