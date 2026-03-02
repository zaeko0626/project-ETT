const API_URL = "https://script.google.com/macros/s/AKfycbzqdEl1j2A_Yw8eCnAVA6A8sJjsEIQHgTVZtWRfSyDRfWafHApwdTU67gqZSFynbi2D/exec";

let currentUser = null;

let requests = [];
let requestItems = [];
let itemsMaster = [];
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

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isAdmin() {
  return currentUser?.type === "admin";
}

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

// ---------------- Loading & Modal ----------------
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
  openModal(
    "Алдаа",
    `
    <div style="padding:12px;">
      <div style="margin-bottom:12px;">${esc(msg || "Алдаа гарлаа")}</div>
      <button class="btn primary full" onclick="closeModal()">OK</button>
    </div>
    `
  );
}
function popupOk(msg) {
  openModal(
    "Амжилттай",
    `
    <div style="padding:12px;">
      <div style="margin-bottom:12px;">${esc(msg || "OK")}</div>
      <button class="btn primary full" onclick="closeModal()">OK</button>
    </div>
    `
  );
}

// ---------------- API ----------------
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
  } catch {
    throw new Error("Invalid JSON: " + text);
  }
  return json;
}

// ---------------- Sidebar ----------------
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

function setSidebarUserInfo() {
  const box = $("sidebar-userinfo");
  if (!box) return;

  if (!currentUser) {
    box.textContent = "—";
    return;
  }

  if (isAdmin()) {
    box.innerHTML = `<div style="font-weight:900;">АДМИН</div>`;
    return;
  }

  const fullName = `${esc(currentUser.ovog || "")} ${esc(currentUser.ner || "")}`.trim();
  const code = esc(currentUser.code || "");
  const role = esc(currentUser.role || "");
  const place = esc(currentUser.place || "");
  const dept = esc(currentUser.department || "");

  box.innerHTML = `
    <div style="font-weight:900;">${fullName || "Ажилтан"}</div>
    <div style="opacity:.85; font-size:12px;">Код: ${code || "—"}</div>
    ${role ? `<div style="opacity:.85; font-size:12px;">${role}</div>` : ``}
    ${(place || dept) ? `<div style="opacity:.85; font-size:12px;">${place}${dept ? ` / ${dept}` : ""}</div>` : ``}
  `;
}

function applyRoleVisibility() {
  const navReq = $("nav-request");
  const navItems = $("nav-items");
  const navUsers = $("nav-users");

  if (navReq) navReq.style.display = isAdmin() ? "none" : "";
  if (navItems) navItems.style.display = isAdmin() ? "" : "none";
  if (navUsers) navUsers.style.display = isAdmin() ? "" : "none";

  document.querySelectorAll(".admin-only").forEach((el) => {
    el.style.display = isAdmin() ? "" : "none";
  });

  renderOrdersHeader();
}

window.showTab = (tabName, btn) => {
  if (!isAdmin() && tabName === "items") return popupError("Зөвхөн админ харна.");
  if (isAdmin() && tabName === "request") return popupError("Админ талд захиалга гаргах шаардлагагүй.");

  document.querySelectorAll(".tab-content").forEach((el) => el.classList.add("hidden"));
  $(`tab-${tabName}`)?.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");

  if (window.innerWidth < 1024) closeSidebar();

  if (tabName === "orders") {
    populateOrderFilters();
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

// ---------------- Orders grid CSS ----------------
function ensureRequestsGridCSS() {
  if (document.getElementById("requests-grid-css")) return;
  const st = document.createElement("style");
  st.id = "requests-grid-css";
  st.textContent = `
    #requests-header, .request-row{
      display:grid;
      column-gap: 16px;
      align-items: start;
      width: 100%;
    }
    .request-row{
      padding: 12px 0;
      border-bottom: 1px solid rgba(0,0,0,.08);
      cursor: pointer;
    }
    .request-row:last-child{ border-bottom:none; }
    .req-id{ font-weight: 900; letter-spacing:.3px; }
    .sub{ opacity:.75; font-size: 12px; margin-top: 2px; }

    /* header "excel-like" filter */
    .hdr-cell{ position: relative; }
    .hdr-top{
      display:flex;
      align-items:center;
      gap:8px;
      font-weight: 900;
      opacity:.85;
      line-height: 1.2;
    }
    .hdr-icons{ margin-left:auto; display:flex; gap:6px; align-items:center; }
    .hdr-icon{
      border: 1px solid rgba(0,0,0,.12);
      background: transparent;
      border-radius: 10px;
      width: 28px;
      height: 28px;
      display:flex;
      align-items:center;
      justify-content:center;
      cursor:pointer;
      font-weight:900;
    }
    .hdr-icon:hover{ background: rgba(0,0,0,.04); }
    .hdr-icon.clear{ display:none; }
    .hdr-icon.clear.show{ display:flex; }

    .hdr-dropdown{
      position:absolute;
      top: 34px;
      right: 0;
      z-index: 50;
      background: #fff;
      border: 1px solid rgba(0,0,0,.12);
      border-radius: 12px;
      padding: 8px;
      box-shadow: 0 8px 20px rgba(0,0,0,.08);
      min-width: 160px;
      display:none;
    }
    .hdr-dropdown.show{ display:block; }
    .hdr-select{
      width:100%;
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid rgba(0,0,0,.12);
      background: transparent;
      font-size: 13px;
    }

    /* items vertical */
    .items-vertical .item-line{ margin-top: 6px; }
    .items-vertical .item-name{ font-weight: 800; }
    .items-vertical .item-sub{ opacity:.8; font-size: 12px; margin-top: 2px; }
  `;
  document.head.appendChild(st);
}

function setOrdersGridColumns() {
  const header = $("requests-header");
  if (!header) return;

  if (isAdmin()) {
    header.style.gridTemplateColumns = "1.3fr 2.2fr 2.4fr 0.9fr 3.2fr 1.3fr 1.1fr";
  } else {
    header.style.gridTemplateColumns = "1.3fr 3.8fr 1.3fr 1.1fr";
  }
  document.querySelectorAll(".request-row").forEach((row) => {
    row.style.gridTemplateColumns = header.style.gridTemplateColumns;
  });
}

// ---------------- Orders data helpers ----------------
function getVisibleRequests() {
  if (isAdmin()) return requests.slice();
  const myCode = String(currentUser?.code || "").trim();
  return requests.filter((r) => String(r.code || "").trim() === myCode);
}
function linesForRequest(reqId) {
  return requestItems.filter((x) => String(x.request_id) === String(reqId));
}
function requestHasItem(reqId, itemName) {
  if (!itemName) return true;
  const wanted = String(itemName).trim();
  return linesForRequest(reqId).some((l) => String(l.item || "").trim() === wanted);
}

function buildItemsSummaryHTML(reqId) {
  const lines = linesForRequest(reqId);
  if (!lines.length) return `<div>—</div>`;
  const html = lines.map((l) => {
    const item = esc(String(l.item || "").trim() || "—");
    const size = esc(String(l.size || "").trim() || "—");
    const qty = esc(String(l.qty ?? "").trim() || "—");
    return `
      <div class="item-line">
        <div class="item-name">${item}</div>
        <div class="item-sub">Размер: ${size} · Тоо: ${qty} ширхэг</div>
      </div>
    `;
  }).join("");
  return `<div class="items-vertical">${html}</div>`;
}

// ---------------- Header filters (⏷ + ×) ----------------
function headerFilterCell(title, key, optionsHtml) {
  const clearShow = orderFilters[key] ? "show" : "";
  const dropShow = openHeaderFilterKey === key ? "show" : "";
  return `
    <div class="hdr-cell" onclick="event.stopPropagation();">
      <div class="hdr-top">
        <span>${title}</span>
        <div class="hdr-icons">
          <button class="hdr-icon" title="Шүүх" onclick="event.stopPropagation(); toggleHeaderFilter('${key}')">⏷</button>
          <button id="hdr-clear-${key}" class="hdr-icon clear ${clearShow}" title="Цэвэрлэх" onclick="event.stopPropagation(); clearHeaderFilter('${key}')">×</button>
        </div>
      </div>
      <div id="hdr-drop-${key}" class="hdr-dropdown ${dropShow}">
        <select id="h-${key}" class="hdr-select" onchange="event.stopPropagation(); applyHeaderSelect('${key}', this.value)">
          ${optionsHtml}
        </select>
      </div>
    </div>
  `;
}

window.toggleHeaderFilter = (key) => {
  openHeaderFilterKey = (openHeaderFilterKey === key) ? null : key;
  // rerender header only (fast) then keep list
  renderOrdersHeader();
};

window.clearHeaderFilter = (key) => {
  orderFilters[key] = "";
  openHeaderFilterKey = null;
  renderOrdersHeader();
  renderRequests();
};

window.applyHeaderSelect = (key, val) => {
  orderFilters[key] = String(val || "").trim();
  openHeaderFilterKey = null;
  renderOrdersHeader();
  renderRequests();
};

function renderOrdersHeader() {
  const header = $("requests-header");
  if (!header) return;

  const statusOptions = `
    <option value="">Бүгд</option>
    <option value="Хүлээгдэж буй">Хүлээгдэж буй</option>
    <option value="Хэсэгчлэн">Хэсэгчлэн</option>
    <option value="Шийдвэрлэсэн">Шийдвэрлэсэн</option>
  `;

  const shiftOptions = `
    <option value="">Бүгд</option>
    <option value="А ээлж">А ээлж</option>
    <option value="Б ээлж">Б ээлж</option>
    <option value="В ээлж">В ээлж</option>
    <option value="Г ээлж">Г ээлж</option>
  `;

  if (isAdmin()) {
    header.innerHTML = `
      <div style="font-weight:900; opacity:.85;">ЗАХИАЛГЫН ДУГААР</div>
      <div style="font-weight:900; opacity:.85;">АЖИЛТАН</div>
      <div style="font-weight:900; opacity:.85;">ГАЗАР, ХЭЛТЭС</div>
      ${headerFilterCell("ЭЭЛЖ", "shift", shiftOptions)}
      <div style="font-weight:900; opacity:.85;">БАРАА</div>
      ${headerFilterCell("ТӨЛӨВ", "status", statusOptions)}
      <div style="font-weight:900; opacity:.85;">ОГНОО</div>
    `;
  } else {
    header.innerHTML = `
      <div style="font-weight:900; opacity:.85;">ЗАХИАЛГЫН ДУГААР</div>
      <div style="font-weight:900; opacity:.85;">БАРАА</div>
      ${headerFilterCell("ТӨЛӨВ", "status", statusOptions)}
      <div style="font-weight:900; opacity:.85;">ОГНОО</div>
    `;
  }

  // set selected values
  setTimeout(() => {
    if ($("h-status")) $("h-status").value = orderFilters.status || "";
    if ($("h-shift")) $("h-shift").value = orderFilters.shift || "";
  }, 0);

  setOrdersGridColumns();
}

// close dropdown when clicking outside
function installHeaderCloseHandler() {
  document.addEventListener("click", () => {
    if (openHeaderFilterKey !== null) {
      openHeaderFilterKey = null;
      renderOrdersHeader();
    }
  });
}

// ---------------- Filter bar ----------------
function setSelectOptions(sel, values, allLabel = "Бүгд") {
  if (!sel) return;
  const uniq = Array.from(new Set((values || []).filter((v) => v != null && v !== "")));
  uniq.sort((a, b) => String(a).localeCompare(String(b)));
  const opts = [`<option value="">${esc(allLabel)}</option>`];
  uniq.forEach((v) => opts.push(`<option value="${esc(v)}">${esc(v)}</option>`));
  sel.innerHTML = opts.join("");
}

function populateOrderFilters() {
  const data = getVisibleRequests();

  setSelectOptions($("f-year"), data.map((r) => getYear(r.requestedDate)).filter(Boolean), "Бүгд");
  setSelectOptions($("f-month"), ["01","02","03","04","05","06","07","08","09","10","11","12"], "Бүгд");

  const itemNames = itemsMaster?.length ? itemsMaster.map((x) => x.name) : requestItems.map((x) => x.item);
  setSelectOptions($("f-item"), itemNames.filter(Boolean), "Бүгд");

  setSelectOptions($("f-place"), data.map((r) => (r.place || "").toString().trim()).filter(Boolean), "Бүгд");
  setSelectOptions($("f-dept"), data.map((r) => (r.department || "").toString().trim()).filter(Boolean), "Бүгд");

  if ($("f-year")) $("f-year").value = orderFilters.year || "";
  if ($("f-month")) $("f-month").value = orderFilters.month || "";
  if ($("f-item")) $("f-item").value = orderFilters.item || "";
  if ($("f-place")) $("f-place").value = orderFilters.place || "";
  if ($("f-dept")) $("f-dept").value = orderFilters.dept || "";
  if ($("f-role")) $("f-role").value = orderFilters.role || "";
  if ($("f-code")) $("f-code").value = orderFilters.code || "";
  if ($("f-name")) $("f-name").value = orderFilters.name || "";

  renderOrdersHeader();
}

window.applyOrderFilters = () => {
  orderFilters.year = ($("f-year")?.value || "").trim();
  orderFilters.month = ($("f-month")?.value || "").trim();
  orderFilters.item = ($("f-item")?.value || "").trim();

  orderFilters.place = ($("f-place")?.value || "").trim();
  orderFilters.dept = ($("f-dept")?.value || "").trim();
  orderFilters.role = ($("f-role")?.value || "").trim();
  orderFilters.code = ($("f-code")?.value || "").trim();
  orderFilters.name = ($("f-name")?.value || "").trim();

  renderRequests();
};

window.clearOrderFilters = () => {
  orderFilters = {
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
  openHeaderFilterKey = null;

  ["f-year","f-month","f-item","f-place","f-dept","f-role","f-code","f-name"].forEach((id)=>{
    if ($(id)) $(id).value = "";
  });

  renderOrdersHeader();
  renderRequests();
};

function applyFiltersToData(data) {
  return data.filter((r) => {
    const st = String(r.overall_status || "").trim();
    const yr = getYear(r.requestedDate);
    const mo = getMonth(r.requestedDate);

    // header filters
    if (orderFilters.status && st !== orderFilters.status) return false;

    const shift = String(r.shift || "").trim();
    if (orderFilters.shift && shift !== orderFilters.shift) return false;

    // bar filters
    if (orderFilters.year && yr !== orderFilters.year) return false;
    if (orderFilters.month && mo !== orderFilters.month) return false;

    if (orderFilters.item && !requestHasItem(r.request_id, orderFilters.item)) return false;

    // admin-only filters
    const place = String(r.place || "").trim();
    const dept = String(r.department || "").trim();
    const role = String(r.role || "").trim();
    const code = String(r.code || "").trim();
    const fullName = `${String(r.ovog||"").trim()} ${String(r.ner||"").trim()}`.trim();

    if (orderFilters.place && place !== orderFilters.place) return false;
    if (orderFilters.dept && dept !== orderFilters.dept) return false;
    if (orderFilters.role && !role.toLowerCase().includes(orderFilters.role.toLowerCase())) return false;
    if (orderFilters.code && !code.includes(orderFilters.code)) return false;
    if (orderFilters.name && !fullName.toLowerCase().includes(orderFilters.name.toLowerCase())) return false;

    return true;
  });
}

// ---------------- Orders list render ----------------
function renderRequests() {
  ensureRequestsGridCSS();
  renderOrdersHeader();

  const list = $("requests-list");
  if (!list) return;

  let data = getVisibleRequests()
    .slice()
    .sort((a, b) => new Date(b.requestedDate) - new Date(a.requestedDate));

  data = applyFiltersToData(data);

  if (!data.length) {
    list.innerHTML = `<div style="padding:12px; opacity:.8;">Захиалга олдсонгүй</div>`;
    return;
  }

  list.innerHTML = data.map((r) => {
    const rid = esc(r.request_id || "");
    const dt = esc(fmtDateOnly(r.requestedDate));
    const st = statusMetaOverall(r.overall_status);
    const itemsHtml = buildItemsSummaryHTML(r.request_id);

    if (isAdmin()) {
      const emp = `${esc(r.ovog || "")} ${esc(r.ner || "")}`.trim() || "—";
      const code = esc(r.code || "—");
      const role = esc(r.role || "");
      const place = esc(r.place || "—");
      const dept = esc(r.department || "—");
      const shift = esc(r.shift || "—");

      return `
        <div class="request-row" style="grid-template-columns:${$("requests-header")?.style.gridTemplateColumns || ""};" onclick="openRequestDetail('${esc(r.request_id)}')">
          <div><div class="req-id">${rid}</div></div>

          <div>
            <div style="font-weight:700;">${emp}</div>
            <div class="sub">ID: ${code}</div>
            ${role ? `<div class="sub">${role}</div>` : ``}
          </div>

          <div>
            <div>${place}</div>
            <div class="sub">${dept}</div>
          </div>

          <div>${shift}</div>

          <div>${itemsHtml}</div>

          <div><span class="${esc(st.cls)}">${esc(st.label)}</span></div>

          <div>${dt}</div>
        </div>
      `;
    }

    return `
      <div class="request-row" style="grid-template-columns:${$("requests-header")?.style.gridTemplateColumns || ""};" onclick="openRequestDetail('${esc(r.request_id)}')">
        <div><div class="req-id">${rid}</div></div>
        <div>${itemsHtml}</div>
        <div><span class="${esc(st.cls)}">${esc(st.label)}</span></div>
        <div>${dt}</div>
      </div>
    `;
  }).join("");

  setOrdersGridColumns();
}

// ---------------- Order detail modal ----------------
window.openRequestDetail = (request_id) => {
  currentModalRequestId = request_id;
  const req = requests.find((x) => String(x.request_id) === String(request_id));
  if (!req) return popupError("Захиалга олдсонгүй");

  const lines = linesForRequest(request_id);
  const st = statusMetaOverall(req.overall_status);

  const header = `
    <div style="padding:12px;">
      <div style="font-weight:900; margin-bottom:8px;">Захиалгын мэдээлэл</div>
      ${isAdmin() ? `
        <div><b>Ажилтан:</b> ${esc(req.ovog||"")} ${esc(req.ner||"")} (Код: ${esc(req.code||"")})</div>
        <div><b>Албан тушаал:</b> ${esc(req.role||"")}</div>
        <div><b>Газар/Хэлтэс:</b> ${esc(req.place||"")} / ${esc(req.department||"")}</div>
        <div><b>Ээлж:</b> ${esc(req.shift||"")}</div>
      ` : ``}
      <div><b>Огноо:</b> ${esc(fmtDateOnly(req.requestedDate))}</div>
      <div><b>Төлөв:</b> ${esc(st.label)}</div>
    </div>
  `;

  const tableHead = `
    <div style="padding:0 12px 12px;">
      <div style="display:grid; grid-template-columns: 2.2fr 1.4fr 0.9fr 1.2fr 1.6fr; gap:12px; font-weight:900; opacity:.85; padding:10px 0; border-bottom:1px solid rgba(0,0,0,.08);">
        <div>БАРАА</div><div>РАЗМЕР</div><div>ТОО</div><div>ТӨЛӨВ</div><div>ҮЙЛДЭЛ</div>
      </div>
  `;

  const bodyRows = lines.map((line) => {
    const item = esc(line.item || "—");
    const size = esc(line.size || "—");
    const qty = esc(line.qty ?? "—");
    const meta = statusMetaItem(line.item_status);
    const decided = String(line.item_status || "").trim() !== "" && String(line.item_status || "").trim() !== "Хүлээгдэж буй";

    let actionHtml = `—`;
    if (isAdmin()) {
      if (!decided) {
        actionHtml = `
          <button class="btn" onclick="event.stopPropagation(); setItemDecision('${esc(line.line_id)}','Зөвшөөрсөн')">ЗӨВШӨӨРӨХ</button>
          <button class="btn danger" onclick="event.stopPropagation(); setItemDecision('${esc(line.line_id)}','Татгалзсан')">ТАТГАЛЗАХ</button>
        `;
      } else {
        actionHtml = `<span style="font-weight:900;">ШИЙДВЭРЛЭСЭН</span>`;
      }
    } else {
      actionHtml = decided ? `<span style="font-weight:900;">ШИЙДВЭРЛЭСЭН</span>` : `ХҮЛЭЭЖ БУЙ`;
    }

    return `
      <div style="display:grid; grid-template-columns: 2.2fr 1.4fr 0.9fr 1.2fr 1.6fr; gap:12px; padding:10px 0; border-bottom:1px solid rgba(0,0,0,.06); align-items:center;">
        <div>${item}</div>
        <div>Размер: ${size}</div>
        <div>${qty} ширхэг</div>
        <div><span class="${esc(meta.cls)}">${esc(meta.label)}</span></div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">${actionHtml}</div>
      </div>
    `;
  }).join("");

  const finalizeBtn = isAdmin()
    ? `
      <div style="padding:12px; display:flex; gap:10px;">
        <button class="btn" onclick="closeModal()">ХААХ</button>
        <button class="btn primary" onclick="finalizeCurrentRequest()">БҮГДИЙГ ШИЙДВЭРЛЭХ</button>
      </div>
    `
    : `
      <div style="padding:12px;">
        <button class="btn primary full" onclick="closeModal()">ХААХ</button>
      </div>
    `;

  openModal(`Захиалга: ${request_id}`, `${header}${tableHead}${bodyRows || `<div style="padding:12px;">Мэдээлэл хоосон.</div>`}</div>${finalizeBtn}`);
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

// ---------------- Request (employee) ----------------
function fillRequestForm() {
  const itemSel = $("req-item");
  const sizeSel = $("req-size");
  if (!itemSel || !sizeSel) return;

  setSelectOptions(itemSel, itemsMaster.map((x) => x.name), "Сонгох");

  const onItemChange = () => {
    const itemName = (itemSel.value || "").trim();
    const it = itemsMaster.find((x) => String(x.name) === itemName);
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
};

window.removeCartItem = (i) => {
  cart.splice(i, 1);
  renderCart();
};

function renderCart() {
  const box = $("cart-list");
  if (!box) return;

  if (!cart.length) {
    box.innerHTML = `<div style="padding:12px; opacity:.8;">Одоогоор сонгосон бараа алга.</div>`;
    return;
  }

  box.innerHTML = cart.map((c, i) => `
    <div style="padding:10px; border-bottom:1px solid rgba(0,0,0,.06); display:flex; justify-content:space-between; gap:10px; align-items:center;">
      <div>
        <div><b>${esc(c.item)}</b></div>
        <div class="sub">Размер: ${esc(c.size)} · Тоо: ${esc(c.qty)} ширхэг</div>
      </div>
      <button class="btn danger" onclick="removeCartItem(${i})">УСТГАХ</button>
    </div>
  `).join("");
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

// ---------------- History ----------------
async function renderUserHistory() {
  const box = $("user-history");
  if (!box) return;

  if (!currentUser || isAdmin()) {
    box.innerHTML = `<div style="padding:12px; opacity:.8;">Зөвхөн ажилтны хэсэгт харагдана.</div>`;
    return;
  }

  try {
    const r = await apiPost({ action: "get_user_history", code: currentUser.code });
    if (!r.success) throw new Error(r.msg || "History татахад алдаа");

    const hist = r.history || [];
    if (!hist.length) {
      box.innerHTML = `<div style="padding:12px; opacity:.8;">Түүх хоосон байна.</div>`;
      return;
    }

    box.innerHTML = hist
      .slice()
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map((h) => `
        <div style="padding:10px; border-bottom:1px solid rgba(0,0,0,.06);">
          <div><b>Огноо:</b> ${esc(fmtDateOnly(h.date))}</div>
          <div class="sub"><b>${esc(h.item || "")}</b> · Размер: ${esc(h.size || "")} · Тоо: ${esc(h.qty || "")} ширхэг</div>
        </div>
      `)
      .join("");
  } catch (e) {
    box.innerHTML = `<div style="padding:12px; color:#c00;">${esc(e.message || String(e))}</div>`;
  }
}

// ---------------- Items (Admin) ----------------
window.clearItemSearch = () => {
  if ($("item-search")) $("item-search").value = "";
  renderItems();
};
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

function renderItems() {
  const box = $("items-list");
  if (!box) return;

  if (!isAdmin()) {
    box.innerHTML = `<div style="padding:12px; opacity:.8;">Зөвхөн Admin харна.</div>`;
    return;
  }

  const q = ($("item-search")?.value || "").trim().toLowerCase();
  const data = itemsMaster.filter((it) => !q || String(it.name || "").toLowerCase().includes(q));

  if (!data.length) {
    box.innerHTML = `<div style="padding:12px; opacity:.8;">Бараа олдсонгүй.</div>`;
    return;
  }

  box.innerHTML = data.map((it) => `
    <div style="padding:10px; border-bottom:1px solid rgba(0,0,0,.06);">
      <div><b>Нэр:</b> ${esc(it.name)}</div>
      <div class="sub"><b>Size:</b> ${esc(it.sizes || "")}</div>
    </div>
  `).join("");
}

// ---------------- Users (Admin) ----------------
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

    ["u-code","u-pass","u-ner","u-ovog","u-role","u-place","u-dept","u-shift"].forEach((id) => {
      if ($(id)) $(id).value = "";
    });

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
  if (!isAdmin()) {
    box.innerHTML = `<div style="padding:12px; opacity:.8;">Зөвхөн Admin харна.</div>`;
    return;
  }
  box.innerHTML = (users || []).map((u) => `
    <div style="padding:10px; border-bottom:1px solid rgba(0,0,0,.06);">
      <div><b>Код:</b> ${esc(u.code)}</div>
      <div class="sub"><b>Нэр:</b> ${esc(u.ovog || "")} ${esc(u.ner || "")}</div>
      <div class="sub"><b>Газар:</b> ${esc(u.place || "")} · <b>Хэлтэс:</b> ${esc(u.department || "")}</div>
      <div class="sub"><b>Ээлж:</b> ${esc(u.shift || "")}</div>
    </div>
  `).join("");
}

// ---------------- Password ----------------
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
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------------- Data refresh ----------------
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
    if (activeTab === "nav-items") showTab("items", $("nav-items"));
    if (activeTab === "nav-users") showTab("users", $("nav-users"));
    if (activeTab === "nav-pass") showTab("pass", $("nav-pass"));
  } catch (e) {
    popupError(e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// ---------------- Login / Logout ----------------
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
  currentModalRequestId = null;

  orderFilters = {
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
  openHeaderFilterKey = null;

  setLoggedInUI(false);

  if ($("sidebar-userinfo")) $("sidebar-userinfo").textContent = "—";
  if ($("login-code")) $("login-code").value = "";
  if ($("login-pass")) $("login-pass").value = "";
};

// ---------------- Init ----------------
function init() {
  setLoggedInUI(false);

  $("login-pass")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") login();
  });

  ensureRequestsGridCSS();
  renderOrdersHeader();
  installHeaderCloseHandler();
}

window.addEventListener("load", init);
