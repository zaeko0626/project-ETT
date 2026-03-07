const API_URL = "https://script.google.com/macros/s/AKfycbxSnzfJ5ABLAn7dqba0TfUW7_MsgkbdQnrgwVa7__7rB3jKvDpmhH5ovLJryaa3oI49/exec";

let currentUser = null;
let requests = [];
let requestItems = [];
let itemsMaster = [];
let packsMaster = []; // Packs sheet (active)
let packsAdmin = []; // all pack rows (admin)
let stockMaster = []; // Inventory rows

let users = [];
let packDraft = []; // { item, qty } for admin builder
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
  if (st === "Хэсэгчлэн") return { label: "ХЭСЭГЧЛЭН ШИЙДВЭРЛЭСЭН", cls: "st-pending" };
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
  if (tabName === "items") renderItems();
  if (tabName === "users") renderUsers();
};

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
  renderPacksAdmin();
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
    showLoading("Шийдвэрлэж байна...");
    const r = await api({ action: "issue_item", admin_code: currentUser.code, line_id: line_id, issued_size: size, issued_qty: qty });
    showLoading(false);
    if (!r.success) return popupError(r.msg || "Алдаа гарлаа");
    await loadAllData();
    openRequestDetail(currentModalRequestId);
  } catch (e) {
    showLoading(False);
    popupError("Алдаа: " + e.toString());
  }
};

window.issueLineReject = async (line_id) => {
  try {
    showLoading("Татгалзаж байна...");
    const r = await api({ action: "issue_item", admin_code: currentUser.code, line_id: line_id, issued_size: "", issued_qty: 0 });
    showLoading(False);
    if (!r.success) return popupError(r.msg || "Алдаа гарлаа");
    await loadAllData();
    openRequestDetail(currentModalRequestId);
  } catch (e) {
    showLoading(False);
    popupError("Алдаа: " + e.toString());
  }
};

// Employee: confirm receive by PIN
window.confirmReceive = async () => {
  const pin = ($("receive-pin")?.value || "").trim();
  if (!pin) return popupError("PIN оруулна уу");
  try {
    showLoading("Баталгаажуулж байна...");
    const r = await api({ action: "confirm_receive", code: currentUser.code, request_id: currentModalRequestId, pin: pin });
    showLoading(false);
    if (!r.success) return popupError(r.msg || "Алдаа гарлаа");
    await loadAllData();
    openRequestDetail(currentModalRequestId);
  } catch (e) {
    showLoading(false);
    popupError("Алдаа: " + e.toString());
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
function fillRequestForm() {
  const itemSel = $("req-item");
  const sizeSel = $("req-size");
  const packSel = $("req-pack");
  if (!itemSel || !sizeSel) return;

  const activeItems = itemsMaster.filter((x) => String(x.locked).toLowerCase() !== "true");
  setSelectOptions(itemSel, activeItems.map((x) => x.name), "Сонгох");

  if (packSel) {
    const packNames = Array.from(new Set((packsMaster || []).map((x) => String(x.pack_name || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "mn"));
    setSelectOptions(packSel, packNames, "Сонгох");
  }

  const onItemChange = () => {
    const itemName = (itemSel.value || "").trim();
    const it = activeItems.find((x) => String(x.name) === itemName);
    const sizes = it ? String(it.sizes || "").split(",").map((s) => s.trim()).filter(Boolean) : [];
    setSelectOptions(sizeSel, sizes, "Сонгох");
  };
  itemSel.onchange = onItemChange;
  onItemChange();
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



function getPackLinesByName(packName, useAdminRows = false) {
  const source = useAdminRows ? packsAdmin : packsMaster;
  return (source || []).filter((p) => String(p.pack_name || "").trim() === String(packName || "").trim());
}

function openPackRequestModal(packName, mode) {
  const lines = getPackLinesByName(packName, false);
  if (!lines.length) return popupError("Багц хоосон/олдсонгүй");

  const html = `
    <div style="padding:14px;display:grid;gap:12px;">
      <div class="muted">Багц: <b>${esc(packName)}</b></div>
      <div class="mini-table pack-size-table">
        <div class="mini-th">Бараа</div>
        <div class="mini-th">Размер</div>
        <div class="mini-th">Тоо</div>
        ${lines.map((ln, idx) => {
          const itemName = String(ln.item || "").trim();
          const item = itemsMaster.find((x) => String(x.name || "").trim() === itemName);
          const sizes = item ? String(item.sizes || "").split(",").map((s) => s.trim()).filter(Boolean) : [];
          return `
            <div class="mini-td" style="font-weight:900;">${esc(itemName)}</div>
            <div class="mini-td">
              <select id="pack-size-${idx}" class="input">
                <option value="">Сонгох</option>
                ${sizes.map((s) => `<option value="${escAttr(s)}">${esc(s)}</option>`).join("")}
              </select>
            </div>
            <div class="mini-td">${esc(parseInt(ln.default_qty, 10) || 1)} ширхэг</div>`;
        }).join("")}
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button class="btn" onclick="closeModal()">БОЛИХ</button>
        <button class="btn primary" onclick="confirmPackRequest('${escAttr(packName)}','${escAttr(mode)}')">${mode === "submit" ? "ИЛГЭЭХ" : "САГСЛАХ"}</button>
      </div>
    </div>`;
  openModal("Багц сонгох", html);
}

window.addPackToCart = () => {
  if (isAdmin()) return popupError("Админ талд захиалга илгээх хэрэггүй");
  const packName = ($("req-pack")?.value || "").trim();
  if (!packName) return popupError("Багц сонгоно уу");
  openPackRequestModal(packName, "cart");
};

window.confirmPackRequest = async (packName, mode) => {
  const lines = getPackLinesByName(packName, false);
  if (!lines.length) return popupError("Багц олдсонгүй");
  const resolved = [];
  for (let i = 0; i < lines.length; i++) {
    const item = String(lines[i].item || "").trim();
    const size = ($(`pack-size-${i}`)?.value || "").trim();
    const qty = parseInt(lines[i].default_qty, 10) || 1;
    if (!size) return popupError(`"${item}" барааны размер сонгоно уу`);
    resolved.push({ item, size, qty });
  }

  if (mode === "submit") {
    try {
      showLoading(true);
      const r = await apiPost({ action: "add_request", code: currentUser.code, items: resolved });
      if (!r.success) throw new Error(r.msg || "Алдаа гарлаа");
      closeModal();
      if ($("req-pack")) $("req-pack").value = "";
      await refreshData(false);
      showTab("orders", $("nav-orders"));
      popupOk("Амжилттай! Захиалгын дугаар: " + r.request_id);
    } catch (e) {
      popupError(e.message || String(e));
    } finally {
      showLoading(false);
    }
    return;
  }

  resolved.forEach((ln) => {
    const idx = cart.findIndex((x) => x.item === ln.item && x.size === ln.size);
    if (idx >= 0) cart[idx].qty += ln.qty;
    else cart.push(ln);
  });
  closeModal();
  if ($("req-pack")) $("req-pack").value = "";
  renderCart();
};

window.submitPackRequest = async () => {
  if (isAdmin()) return popupError("Админ талд захиалга илгээх хэрэггүй");
  const packName = ($("req-pack")?.value || "").trim();
  if (!packName) return popupError("Багц сонгоно уу");
  openPackRequestModal(packName, "submit");
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

  if (!data.length) { box.innerHTML = `<div class="muted">Бараа олдсонгүй.</div>`; renderPacksAdmin(); return; }

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


/* ---------------- Packs (Admin) ---------------- */
function groupPackRows(rows) {
  const map = new Map();
  (rows || []).forEach((r) => {
    const name = String(r.pack_name || "").trim();
    if (!name) return;
    if (!map.has(name)) map.set(name, { pack_name: name, active: false, lines: [] });
    const g = map.get(name);
    g.lines.push({ item: String(r.item || "").trim(), qty: parseInt(r.default_qty, 10) || 1 });
    if (String(r.active).toLowerCase() === "true") g.active = true;
  });
  return Array.from(map.values()).sort((a, b) => a.pack_name.localeCompare(b.pack_name, "mn"));
}

function fillPackItemSelect() {
  const sel = $("pack-item-select");
  if (!sel) return;
  const activeItems = itemsMaster.filter((x) => String(x.locked).toLowerCase() !== "true").map((x) => x.name);
  setSelectOptions(sel, activeItems, "Сонгох");
}

function renderPackDraft() {
  const box = $("pack-draft-list");
  if (!box) return;
  if (!packDraft.length) {
    box.innerHTML = `<div class="muted">Одоогоор багцад нэмсэн бараа алга.</div>`;
    return;
  }
  box.innerHTML = `
    <div class="mini-table pack-draft-table">
      <div class="mini-th">Бараа</div>
      <div class="mini-th">Тоо</div>
      <div class="mini-th" style="text-align:right;">Үйлдэл</div>
      ${packDraft.map((ln, i) => `
        <div class="mini-td" style="font-weight:900;">${esc(ln.item)}</div>
        <div class="mini-td">${esc(ln.qty)} ширхэг</div>
        <div class="mini-td" style="display:flex;justify-content:flex-end;">
          <button class="icon-btn btn-icon" onclick="removePackDraftItem(${i})">🗑️</button>
        </div>
      `).join("")}
    </div>`;
}

window.addPackDraftItem = () => {
  if (!isAdmin()) return popupError("Admin эрх хэрэгтэй");
  const item = ($("pack-item-select")?.value || "").trim();
  let qty = parseInt(($("pack-item-qty")?.value || "1"), 10);
  if (!qty || qty < 1) qty = 1;
  if (!item) return popupError("Бараа сонгоно уу");
  const idx = packDraft.findIndex((x) => x.item === item);
  if (idx >= 0) packDraft[idx].qty += qty;
  else packDraft.push({ item, qty });
  if ($("pack-item-select")) $("pack-item-select").value = "";
  if ($("pack-item-qty")) $("pack-item-qty").value = 1;
  renderPackDraft();
};

window.removePackDraftItem = (i) => {
  packDraft.splice(i, 1);
  renderPackDraft();
};

window.clearPackDraft = () => {
  packDraft = [];
  if ($("new-pack-name")) $("new-pack-name").value = "";
  if ($("pack-item-select")) $("pack-item-select").value = "";
  if ($("pack-item-qty")) $("pack-item-qty").value = 1;
  renderPackDraft();
};

window.savePack = async () => {
  if (!isAdmin()) return popupError("Admin эрх хэрэгтэй");
  const packName = ($("new-pack-name")?.value || "").trim();
  if (!packName) return popupError("Багцын нэр оруулна уу");
  if (!packDraft.length) return popupError("Багцад дор хаяж 1 бараа нэмнэ үү");
  try {
    showLoading(true);
    const r = await apiPost({ action: "add_pack", pack_name: packName, lines: packDraft });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    clearPackDraft();
    await refreshData(false);
    popupOk("Багц нэмэгдлээ");
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.deletePack = async (packName) => {
  if (!confirm(`"${packName}" багцыг устгах уу?`)) return;
  try {
    showLoading(true);
    const r = await apiPost({ action: "delete_pack", pack_name: packName });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    await refreshData(false);
    popupOk("Багц устгалаа");
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.togglePackActive = async (packName) => {
  const grouped = groupPackRows(packsAdmin);
  const found = grouped.find((x) => x.pack_name === packName);
  const next = !(found && found.active);
  try {
    showLoading(true);
    const r = await apiPost({ action: "set_pack_active", pack_name: packName, active: next });
    if (!r.success) throw new Error(r.msg || "Алдаа");
    await refreshData(false);
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

function renderPacksAdmin() {
  fillPackItemSelect();
  renderPackDraft();

  const box = $("packs-list");
  if (!box) return;
  if (!isAdmin()) { box.innerHTML = `<div class="muted">Зөвхөн Admin харна.</div>`; return; }

  const q = ($("pack-search")?.value || "").trim().toLowerCase();
  const grouped = groupPackRows(packsAdmin).filter((p) => {
    if (!q) return true;
    return p.pack_name.toLowerCase().includes(q) || p.lines.some((ln) => String(ln.item || "").toLowerCase().includes(q));
  });

  if (!grouped.length) {
    box.innerHTML = `<div class="muted">Багц олдсонгүй.</div>`;
    return;
  }

  box.innerHTML = `
    <div class="mini-table packs-table">
      <div class="mini-th">Багц</div>
      <div class="mini-th">Бараанууд</div>
      <div class="mini-th">Төлөв</div>
      <div class="mini-th" style="text-align:right;">Үйлдэл</div>
      ${grouped.map((p) => `
        <div class="mini-td" style="font-weight:900;">${esc(p.pack_name)}</div>
        <div class="mini-td">${p.lines.map((ln) => `${esc(ln.item)} (${esc(ln.qty)}ш)`).join(", ")}</div>
        <div class="mini-td">${p.active ? `<span class="status st-approved">ACTIVE</span>` : `<span class="status st-rejected">INACTIVE</span>`}</div>
        <div class="mini-td" style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="icon-btn btn-icon" title="Идэвх солих" onclick="togglePackActive('${escAttr(p.pack_name)}')">${p.active ? "⏸️" : "▶️"}</button>
          <button class="icon-btn btn-icon" title="Устгах" onclick="deletePack('${escAttr(p.pack_name)}')">🗑️</button>
        </div>
      `).join("")}
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
    requests = r.requests || [];
    requestItems = r.request_items || [];
    itemsMaster = r.items || [];
    packsMaster = r.packs || [];
    stockMaster = r.stock || [];
    if (isAdmin()) {
      const u = await apiPost({ action: "get_users" });
      users = u.success ? (u.users || []) : [];
      const p = await apiPost({ action: "get_packs_admin" });
      packsAdmin = p.success ? (p.packs || []) : [];
    } else {
      users = [];
      packsAdmin = [];
      packDraft = [];
    }
    setSidebarUserInfo();
    applyRoleVisibility();
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
  packsMaster = [];
  packsAdmin = [];
  users = [];
  cart = [];
  packDraft = [];
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
