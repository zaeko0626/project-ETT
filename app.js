// NOTE: This app.js is provided as part of the downloadable pack.
// If you already have working backend routes, keep your Code.gs as-is.
// This file focuses on UI upgrades (Hybrid table desktop + cards mobile, KPI cards, header filters).

const API_URL = "https://script.google.com/macros/s/AKfycbzqdEl1j2A_Yw8eCnAVA6A8sJjsEIQHgTVZtWRfSyDRfWafHApwdTU67gqZSFynbi2D/exec";

let currentUser = null;

let requests = [];
let requestItems = [];
let itemsMaster = [];
let users = [];

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

let openHeaderFilterKey = null;

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

// Loading / Modal
function showLoading(show) { $("loading-overlay")?.classList.toggle("hidden", !show); }
window.openModal = (title, html) => {
  $("modal-title").textContent = title || "";
  $("modal-body").innerHTML = html || "";
  $("modal-overlay").classList.remove("hidden");
};
window.closeModal = () => { $("modal-overlay").classList.add("hidden"); $("modal-body").innerHTML = ""; currentModalRequestId = null; };
function popupError(msg) { openModal("Алдаа", `<div style="padding:12px;"><div style="margin-bottom:12px;">${esc(msg)}</div><button class="btn primary full" onclick="closeModal()">OK</button></div>`); }
function popupOk(msg) { openModal("Амжилттай", `<div style="padding:12px;"><div style="margin-bottom:12px;">${esc(msg)}</div><button class="btn primary full" onclick="closeModal()">OK</button></div>`); }

// API
async function apiPost(payload) {
  const res = await fetch(API_URL, { method:"POST", headers:{ "Content-Type":"text/plain;charset=utf-8" }, body: JSON.stringify(payload||{}) });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { throw new Error("Invalid JSON: " + text); }
  return json;
}

// Sidebar
function setLoggedInUI(isLoggedIn) {
  $("login-screen")?.classList.toggle("hidden", isLoggedIn);
  $("main-screen")?.classList.toggle("hidden", !isLoggedIn);
  $("app-header")?.classList.toggle("hidden", !isLoggedIn);
  $("sidebar")?.classList.toggle("hidden", !isLoggedIn);
  $("sidebar-overlay")?.classList.add("hidden");
  $("sidebar")?.classList.remove("open");
}
window.closeSidebar = () => { $("sidebar")?.classList.remove("open"); $("sidebar-overlay")?.classList.add("hidden"); };
window.openSidebar = () => { $("sidebar")?.classList.add("open"); $("sidebar-overlay")?.classList.remove("hidden"); };
window.toggleSidebar = () => { $("sidebar")?.classList.contains("open") ? closeSidebar() : openSidebar(); };

function setSidebarUserInfo() {
  const box = $("sidebar-userinfo");
  if (!box) return;
  if (!currentUser) { box.textContent = "—"; return; }
  if (isAdmin()) { box.innerHTML = `<div style="font-weight:950;">АДМИН</div>`; return; }
  const fullName = `${esc(currentUser.ovog || "")} ${esc(currentUser.ner || "")}`.trim();
  const code = esc(currentUser.code || "");
  const role = esc(currentUser.role || "");
  const place = esc(currentUser.place || "");
  const dept = esc(currentUser.department || "");
  box.innerHTML = `
    <div style="font-weight:950;">${fullName || "Ажилтан"}</div>
    <div style="opacity:.85; font-size:12px;">Код: ${code || "—"}</div>
    ${role ? `<div style="opacity:.85; font-size:12px;">${role}</div>` : ``}
    ${(place || dept) ? `<div style="opacity:.85; font-size:12px;">${place}${dept ? ` / ${dept}` : ""}</div>` : ``}
  `;
}
function applyRoleVisibility() {
  $("nav-request").style.display = isAdmin() ? "none" : "";
  $("nav-items").style.display = isAdmin() ? "" : "none";
  $("nav-users").style.display = isAdmin() ? "" : "none";
  document.querySelectorAll(".admin-only").forEach((el)=>{ el.style.display = isAdmin() ? "" : "none"; });
  $("admin-kpi")?.classList.toggle("hidden", !isAdmin());
  renderOrdersHeader();
}
window.showTab = (tabName, btn) => {
  document.querySelectorAll(".tab-content").forEach((el)=>el.classList.add("hidden"));
  $(`tab-${tabName}`)?.classList.remove("hidden");
  document.querySelectorAll(".nav-btn").forEach((b)=>b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  if (window.innerWidth < 1024) closeSidebar();
  if (tabName === "orders") { populateOrderFilters(); renderRequests(); }
  if (tabName === "request") { fillRequestForm(); renderCart(); }
};

// ====== UI header filters (status/shift) + KPI + hybrid list ======
function setOrdersGridColumns() {
  const header = $("requests-header");
  if (!header) return;
  header.style.gridTemplateColumns = isAdmin()
    ? "1.3fr 2.2fr 2.4fr 0.9fr 3.2fr 1.3fr 1.1fr"
    : "1.3fr 3.8fr 1.3fr 1.1fr";
  document.querySelectorAll(".request-row").forEach((row)=>{ row.style.gridTemplateColumns = header.style.gridTemplateColumns; });
}

function headerFilterCell(title, key, optionsHtml) {
  const clearShow = orderFilters[key] ? "show" : "";
  const dropShow = openHeaderFilterKey === key ? "show" : "";
  return `
    <div class="hdr-cell" onclick="event.stopPropagation();">
      <div class="hdr-top">
        <span>${title}</span>
        <div class="hdr-icons">
          <button class="hdr-icon" onclick="event.stopPropagation(); toggleHeaderFilter('${key}')">⏷</button>
          <button class="hdr-icon clear ${clearShow}" onclick="event.stopPropagation(); clearHeaderFilter('${key}')">×</button>
        </div>
      </div>
      <div class="hdr-dropdown ${dropShow}">
        <select class="hdr-select" onchange="event.stopPropagation(); applyHeaderSelect('${key}', this.value)">
          ${optionsHtml}
        </select>
      </div>
    </div>
  `;
}
window.toggleHeaderFilter = (key) => { openHeaderFilterKey = (openHeaderFilterKey === key) ? null : key; renderOrdersHeader(); };
window.clearHeaderFilter = (key) => { orderFilters[key] = ""; openHeaderFilterKey = null; renderOrdersHeader(); renderRequests(); };
window.applyHeaderSelect = (key, val) => { orderFilters[key] = String(val||"").trim(); openHeaderFilterKey = null; renderOrdersHeader(); renderRequests(); };

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

  header.innerHTML = isAdmin()
    ? `
      <div style="font-weight:950; opacity:.88;">ЗАХИАЛГЫН ДУГААР</div>
      <div style="font-weight:950; opacity:.88;">АЖИЛТАН</div>
      <div style="font-weight:950; opacity:.88;">ГАЗАР, ХЭЛТЭС</div>
      ${headerFilterCell("ЭЭЛЖ","shift",shiftOptions)}
      <div style="font-weight:950; opacity:.88;">БАРАА</div>
      ${headerFilterCell("ТӨЛӨВ","status",statusOptions)}
      <div style="font-weight:950; opacity:.88;">ОГНОО</div>
    `
    : `
      <div style="font-weight:950; opacity:.88;">ЗАХИАЛГЫН ДУГААР</div>
      <div style="font-weight:950; opacity:.88;">БАРАА</div>
      ${headerFilterCell("ТӨЛӨВ","status",statusOptions)}
      <div style="font-weight:950; opacity:.88;">ОГНОО</div>
    `;

  setOrdersGridColumns();
}
document.addEventListener("click", ()=>{ if (openHeaderFilterKey!==null){ openHeaderFilterKey=null; renderOrdersHeader(); } });

// Filters bar population (simple)
function setSelectOptions(sel, values, allLabel="Бүгд") {
  const uniq = Array.from(new Set((values||[]).filter(v=>v!=null && v!==""))).sort((a,b)=>String(a).localeCompare(String(b)));
  sel.innerHTML = [`<option value="">${esc(allLabel)}</option>`, ...uniq.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`)].join("");
}
function populateOrderFilters(){
  const data = isAdmin()? requests : requests.filter(r=>String(r.code||"").trim()===String(currentUser?.code||"").trim());
  setSelectOptions($("f-year"), data.map(r=>getYear(r.requestedDate)).filter(Boolean));
  setSelectOptions($("f-month"), ["01","02","03","04","05","06","07","08","09","10","11","12"]);
  setSelectOptions($("f-item"), itemsMaster.map(x=>x.name).filter(Boolean));
  renderOrdersHeader();
}
window.applyOrderFilters=()=>renderRequests();
window.clearOrderFilters=()=>{
  orderFilters={status:"",shift:"",year:"",month:"",item:"",place:"",dept:"",role:"",code:"",name:""};
  ["f-year","f-month","f-item","f-place","f-dept","f-role","f-code","f-name"].forEach(id=>{ if($(id)) $(id).value=""; });
  renderOrdersHeader(); renderRequests();
};

function statusMetaOverall(s){
  const st=String(s||"").trim();
  if (st==="Шийдвэрлэсэн") return {label:"ШИЙДВЭРЛЭСЭН", cls:"st-approved"};
  if (st==="Хэсэгчлэн") return {label:"ХЭСЭГЧЛЭН", cls:"st-pending"};
  return {label:"ХҮЛЭЭГДЭЖ БУЙ", cls:"st-pending"};
}
function linesForRequest(reqId){ return requestItems.filter(x=>String(x.request_id)===String(reqId)); }
function buildItemsSummaryHTML(reqId){
  const lines=linesForRequest(reqId);
  return `<div class="items-vertical">`+lines.map(l=>`
    <div class="item-line">
      <div class="item-name">${esc(l.item||"—")}</div>
      <div class="item-sub">Размер: ${esc(l.size||"—")} · Тоо: ${esc(l.qty??"—")} ширхэг</div>
    </div>
  `).join("")+`</div>`;
}
function renderAdminKPI(data){
  const box=$("admin-kpi"); if(!box) return;
  if(!isAdmin()){ box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  const total=data.length;
  const pending=data.filter(r=>String(r.overall_status||"").trim()===""||String(r.overall_status||"").trim()==="Хүлээгдэж буй").length;
  const partial=data.filter(r=>String(r.overall_status||"").trim()==="Хэсэгчлэн").length;
  const decided=data.filter(r=>String(r.overall_status||"").trim()==="Шийдвэрлэсэн").length;
  box.innerHTML=`
    <div class="kpi-card"><div class="kpi-label">НИЙТ ЗАХИАЛГА</div><div class="kpi-value">${total}</div></div>
    <div class="kpi-card"><div class="kpi-label">ХҮЛЭЭГДЭЖ БУЙ</div><div class="kpi-value">${pending}</div></div>
    <div class="kpi-card"><div class="kpi-label">ХЭСЭГЧЛЭН</div><div class="kpi-value">${partial}</div></div>
    <div class="kpi-card"><div class="kpi-label">ШИЙДВЭРЛЭСЭН</div><div class="kpi-value">${decided}</div></div>
  `;
}

function renderRequests(){
  renderOrdersHeader();
  const list=$("requests-list"); if(!list) return;

  let data = isAdmin()? requests.slice() : requests.filter(r=>String(r.code||"").trim()===String(currentUser?.code||"").trim());
  const fy=($("f-year")?.value||"").trim(); const fm=($("f-month")?.value||"").trim(); const fi=($("f-item")?.value||"").trim();
  data=data.filter(r=>{
    if(orderFilters.status && String(r.overall_status||"").trim()!==orderFilters.status) return false;
    if(orderFilters.shift && String(r.shift||"").trim()!==orderFilters.shift) return false;
    if(fy && getYear(r.requestedDate)!==fy) return false;
    if(fm && getMonth(r.requestedDate)!==fm) return false;
    if(fi && !linesForRequest(r.request_id).some(l=>String(l.item||"").trim()===fi)) return false;
    return true;
  }).sort((a,b)=>new Date(b.requestedDate)-new Date(a.requestedDate));

  renderAdminKPI(data);

  if(!data.length){ list.innerHTML=`<div style="padding:12px;opacity:.8;">Захиалга олдсонгүй</div>`; return; }

  list.innerHTML=data.map(r=>{
    const st=statusMetaOverall(r.overall_status);
    const dt=esc(fmtDateOnly(r.requestedDate));
    const itemsHtml=buildItemsSummaryHTML(r.request_id);

    if(isAdmin()){
      const emp=`${esc(r.ovog||"")} ${esc(r.ner||"")}`.trim()||"—";
      return `
        <div class="request-row" style="grid-template-columns:${$("requests-header").style.gridTemplateColumns};">
          <div class="cell" data-label="Захиалгын дугаар"><div class="req-id">${esc(r.request_id||"")}</div></div>
          <div class="cell" data-label="Ажилтан"><div style="font-weight:800;">${emp}</div><div class="sub">ID: ${esc(r.code||"—")}</div></div>
          <div class="cell" data-label="Газар / Хэлтэс"><div>${esc(r.place||"—")}</div><div class="sub">${esc(r.department||"—")}</div></div>
          <div class="cell" data-label="Ээлж">${esc(r.shift||"—")}</div>
          <div class="cell" data-label="Бараа">${itemsHtml}</div>
          <div class="cell" data-label="Төлөв"><span class="${esc(st.cls)}">${esc(st.label)}</span></div>
          <div class="cell" data-label="Огноо">${dt}</div>
        </div>`;
    }
    return `
      <div class="request-row" style="grid-template-columns:${$("requests-header").style.gridTemplateColumns};">
        <div class="cell" data-label="Захиалгын дугаар"><div class="req-id">${esc(r.request_id||"")}</div></div>
        <div class="cell" data-label="Бараа">${itemsHtml}</div>
        <div class="cell" data-label="Төлөв"><span class="${esc(st.cls)}">${esc(st.label)}</span></div>
        <div class="cell" data-label="Огноо">${dt}</div>
      </div>`;
  }).join("");

  setOrdersGridColumns();
}

// Request screen minimal (cart)
function fillRequestForm(){
  setSelectOptions($("req-item"), itemsMaster.map(x=>x.name).filter(Boolean), "Сонгох");
  $("req-item").onchange=()=>{
    const nm=($("req-item").value||"").trim();
    const it=itemsMaster.find(x=>String(x.name)===nm);
    const sizes=it? String(it.sizes||"").split(",").map(s=>s.trim()).filter(Boolean):[];
    setSelectOptions($("req-size"), sizes, "Сонгох");
  };
  $("req-item").onchange();
}
window.addToCart=()=>{
  const item=($("req-item")?.value||"").trim();
  const size=($("req-size")?.value||"").trim();
  let qty=parseInt(($("req-qty")?.value||"1"),10); if(!qty||qty<1) qty=1;
  if(!item) return popupError("Бараа сонгоно уу");
  if(!size) return popupError("Размер сонгоно уу");
  const idx=cart.findIndex(x=>x.item===item && x.size===size);
  if(idx>=0) cart[idx].qty+=qty; else cart.push({item,size,qty});
  renderCart();
};
window.removeCartItem=(i)=>{ cart.splice(i,1); renderCart(); };
function renderCart(){
  const box=$("cart-list"); if(!box) return;
  if(!cart.length){ box.innerHTML=`<div style="padding:12px;opacity:.8;">Одоогоор сонгосон бараа алга.</div>`; return; }
  box.innerHTML=cart.map((c,i)=>`
    <div style="padding:10px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;justify-content:space-between;gap:10px;align-items:center;">
      <div><div><b>${esc(c.item)}</b></div><div class="sub">Размер: ${esc(c.size)} · Тоо: ${esc(c.qty)} ширхэг</div></div>
      <button class="btn danger" onclick="removeCartItem(${i})">УСТГАХ</button>
    </div>`).join("");
}
window.submitMultiRequest=async()=>{
  try{
    if(!cart.length) return popupError("Сонгосон бараа алга");
    showLoading(true);
    const r=await apiPost({action:"add_request", code: currentUser.code, items: cart.map(x=>({item:x.item,size:x.size,qty:x.qty}))});
    if(!r.success) throw new Error(r.msg||"Алдаа");
    cart=[]; renderCart(); popupOk("Захиалга илгээгдлээ");
    await refreshData(false);
    showTab("orders",$("nav-orders"));
  }catch(e){ popupError(e.message||String(e)); } finally{ showLoading(false); }
};

// Data
window.refreshData=async(keepTab=true)=>{
  try{
    showLoading(true);
    const r=await apiPost({action:"get_all_data"});
    if(!r.success) throw new Error(r.msg||"Дата татахад алдаа");
    requests=r.requests||[];
    requestItems=r.request_items||[];
    itemsMaster=r.items||[];
    setSidebarUserInfo(); applyRoleVisibility(); populateOrderFilters();
    showTab("orders",$("nav-orders"));
  }catch(e){ popupError(e.message||String(e)); } finally{ showLoading(false); }
};

// Login / Logout
window.login=async()=>{
  const code=($("login-code")?.value||"").trim();
  const pass=($("login-pass")?.value||"").trim();
  if(!code||!pass) return popupError("Код, нууц үг оруулна уу");
  try{
    showLoading(true);
    const r=await apiPost({action:"login", code, pass});
    if(!r.success) throw new Error(r.msg||"Нэвтрэх амжилтгүй");
    currentUser=r.user;
    setLoggedInUI(true);
    setSidebarUserInfo(); applyRoleVisibility();
    await refreshData(false);
    if(isAdmin()) showTab("orders",$("nav-orders")); else showTab("request",$("nav-request"));
  }catch(e){ popupError(e.message||String(e)); } finally{ showLoading(false); }
};
window.logout=()=>{ currentUser=null; requests=[]; requestItems=[]; itemsMaster=[]; cart=[]; setLoggedInUI(false); };

function init(){
  setLoggedInUI(false);
  renderOrdersHeader();
  $("login-pass")?.addEventListener("keydown",(e)=>{ if(e.key==="Enter") login(); });
}
window.addEventListener("load", init);
