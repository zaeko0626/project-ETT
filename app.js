// ETT PPE System - app.js (old UI compatible, fixed fetch/CORS)
// Copy/paste this whole file.
//
// IMPORTANT: Apps Script Deploy -> Execute as: Me, Who has access: Anyone
const API_URL = "https://script.google.com/macros/s/AKfycbwKtUSt5NLStZ0OCkwspBehi8PoUbV_NRKYrBE48Ehu3MmxzrGsq-kMGhORI_bX-i5O/exec";

let allOrders = [];
let allItems = [];
let currentUser = null;

// -------------------- Mobile safe-area height --------------------
function setVH() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty("--vh", `${vh}px`);
}
window.addEventListener("resize", setVH);
window.addEventListener("orientationchange", () => setTimeout(setVH, 200));

// -------------------- Helpers --------------------
function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function showLoading(show) {
  const el = document.getElementById("loading-overlay");
  if (!el) return;
  el.classList.toggle("hidden", !show);
}

function popup(msg, title="ETT PPE System") {
  alert(`${title}\n\n${msg}`);
}

function uiStatus(status) {
  return status === "Зөвшөөрсөн" ? "Олгосон" : (status || "");
}

function fmtDate(v) {
  try {
    const d = new Date(v);
    return isNaN(d) ? "" : d.toLocaleString();
  } catch {
    return "";
  }
}

// -------------------- API (CORS-safe: no JSON headers) --------------------
async function apiPost(payload) {
  const body = new URLSearchParams();
  Object.entries(payload || {}).forEach(([k, v]) => body.append(k, v == null ? "" : String(v)));

  let res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      body,
      redirect: "follow",
      cache: "no-store",
    });
  } catch (err) {
    throw new Error("FETCH_ERROR: " + (err?.message || String(err)));
  }

  let text = "";
  try {
    text = await res.text();
  } catch (err) {
    throw new Error("READ_ERROR: " + (err?.message || String(err)));
  }

  if (!res.ok) {
    throw new Error(`HTTP_${res.status}: ${text.slice(0, 300)}`);
  }

  const json = safeJsonParse(text);
  if (!json) {
    throw new Error("JSON_PARSE_ERROR: " + text.slice(0, 300));
  }
  return json;
}

// -------------------- Sidebar / Tabs --------------------
window.openSidebar = () => {
  document.getElementById("sidebar")?.classList.add("open");
  document.getElementById("sidebar-overlay")?.classList.add("show");
};
window.closeSidebar = () => {
  document.getElementById("sidebar")?.classList.remove("open");
  document.getElementById("sidebar-overlay")?.classList.remove("show");
};
window.toggleSidebar = () => {
  const sb = document.getElementById("sidebar");
  if (!sb) return;
  sb.classList.contains("open") ? window.closeSidebar() : window.openSidebar();
};

function setActiveNav(btn) {
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
}

window.showTab = (tabName, btn) => {
  document.querySelectorAll(".tab-content").forEach(t => t.classList.add("hidden"));
  document.getElementById("tab-" + tabName)?.classList.remove("hidden");
  setActiveNav(btn);

  if (window.innerWidth < 1024) window.closeSidebar();
  setTimeout(setVH, 0);

  if (tabName === "items") renderItemsList();
};

// -------------------- Modal --------------------
window.openModal = (title, html) => {
  document.getElementById("modal-title").innerText = title || "";
  document.getElementById("modal-body").innerHTML = html || "";
  document.getElementById("modal-overlay").classList.remove("hidden");
};
window.closeModal = () => {
  document.getElementById("modal-overlay").classList.add("hidden");
  document.getElementById("modal-body").innerHTML = "";
};

// -------------------- UI: user card --------------------
function updateHeaderSubtitle() {
  const el = document.getElementById("user-display-name");
  if (!el) return;
  if (currentUser?.type === "admin") {
    el.classList.remove("hidden");
    el.innerText = "АДМИНИСТРАТОР";
  } else {
    el.classList.add("hidden");
    el.innerText = "";
  }
}

function updateSidebarUserCard() {
  const nameEl = document.getElementById("sb-name");
  const idEl = document.getElementById("sb-id");
  const roleEl = document.getElementById("sb-role");
  const extraEl = document.getElementById("sb-extra");
  if (!nameEl || !idEl || !roleEl || !extraEl) return;

  if (!currentUser) {
    nameEl.innerText = "";
    idEl.innerText = "";
    roleEl.innerText = "";
    extraEl.innerText = "";
    return;
  }

  if (currentUser.type === "admin") {
    nameEl.innerText = "АДМИНИСТРАТОР";
    idEl.innerText = "";
    roleEl.innerText = "";
    extraEl.innerText = "";
    return;
  }

  nameEl.innerText = `${currentUser.ovog || ""} ${currentUser.ner || ""}`.trim();
  idEl.innerText = `ID# ${currentUser.code || ""}`;
  roleEl.innerText = currentUser.role || "";

  const parts = [];
  if (currentUser.place) parts.push(`Газар: ${currentUser.place}`);
  if (currentUser.department) parts.push(`Хэлтэс: ${currentUser.department}`);
  if (currentUser.shift) parts.push(`Ээлж: ${currentUser.shift}`);
  extraEl.innerText = parts.join(" • ");
}

// -------------------- Login / Logout --------------------
window.handleLogin = async () => {
  const code = document.getElementById("login-user")?.value?.trim() || "";
  const pass = document.getElementById("login-pass")?.value?.trim() || "";
  if (!code || !pass) return popup("Код, нууц үгээ оруулна уу!", "Нэвтрэх");

  showLoading(true);
  try {
    const result = await apiPost({ action: "login", code, pass });
    if (!result.success) return popup(result.msg || "Код эсвэл нууц үг буруу байна", "Нэвтрэх");

    currentUser = result.user;
    localStorage.setItem("ett_user", JSON.stringify(currentUser));
    initApp();
  } catch (e) {
    console.error(e);
    popup(e.message || String(e), "Нэвтрэх үед алдаа");
  } finally {
    showLoading(false);
  }
};

window.logout = () => {
  localStorage.removeItem("ett_user");
  location.reload();
};

function initApp() {
  document.getElementById("login-page")?.classList.add("hidden");
  document.getElementById("main-page")?.classList.remove("hidden");

  updateHeaderSubtitle();
  updateSidebarUserCard();

  const isAdmin = currentUser?.type === "admin";

  document.getElementById("nav-request")?.classList.toggle("hidden", isAdmin);
  document.getElementById("nav-items")?.classList.toggle("hidden", !isAdmin);

  const profileBtn = document.getElementById("nav-profile");
  if (profileBtn) profileBtn.classList.toggle("hidden", isAdmin);

  refreshData();
  setTimeout(setVH, 0);
}

// -------------------- Populate selects --------------------
function setSelectOptions(el, options) {
  if (!el) return;
  el.innerHTML = options;
}

function populateItemSelects() {
  const filterItem = document.getElementById("filter-item");
  const reqItem = document.getElementById("req-item");
  const itemsFilter = document.getElementById("items-filter-name");

  setSelectOptions(
    filterItem,
    `<option value="">Бүгд</option>` +
      allItems.map(it => `<option value="${esc(it.name)}">${esc(it.name)}</option>`).join("")
  );

  setSelectOptions(
    reqItem,
    `<option value="">Сонгох...</option>` +
      allItems.map(it => `<option value="${esc(it.name)}">${esc(it.name)}</option>`).join("")
  );

  if (itemsFilter) {
    const names = allItems.map(i => i.name).filter(Boolean).sort((a,b)=>a.localeCompare(b));
    setSelectOptions(
      itemsFilter,
      `<option value="">Бүгд</option>` +
        names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("")
    );
  }
}

function setupOrderFilters() {
  const yearSel = document.getElementById("filter-year");
  const monthSel = document.getElementById("filter-month");
  if (!yearSel || !monthSel) return;

  const years = new Set();
  allOrders.forEach(o => {
    const d = new Date(o.requestedDate);
    if (!isNaN(d)) years.add(d.getFullYear());
  });
  const sortedYears = [...years].sort((a,b)=>a-b);

  setSelectOptions(
    yearSel,
    `<option value="">Бүгд</option>` +
      (sortedYears.length ? sortedYears : [new Date().getFullYear()])
        .map(y => `<option value="${y}">${y}</option>`).join("")
  );

  setSelectOptions(
    monthSel,
    `<option value="">Бүгд</option>` +
      Array.from({length:12}, (_,i)=>i+1).map(m => {
        const mm = String(m).padStart(2,"0");
        return `<option value="${mm}">${m} сар</option>`;
      }).join("")
  );
}

const SHIFT_OPTIONS = ["А ээлж","Б ээлж","В ээлж","Г ээлж","Төв оффис","Бусад"];

function setupEmployeeFilters() {
  const placeSel = document.getElementById("filter-place");
  const deptSel = document.getElementById("filter-dept");
  const shiftSel = document.getElementById("filter-shift");
  if (!placeSel || !deptSel || !shiftSel) return;

  const places = new Set();
  const depts = new Set();
  allOrders.forEach(o => {
    if (o.place) places.add(o.place);
    if (o.department) depts.add(o.department);
  });

  const p = [...places].sort((a,b)=>a.localeCompare(b));
  const d = [...depts].sort((a,b)=>a.localeCompare(b));

  setSelectOptions(
    placeSel,
    `<option value="">Бүгд</option>` + p.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join("")
  );
  setSelectOptions(
    deptSel,
    `<option value="">Бүгд</option>` + d.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join("")
  );
  setSelectOptions(
    shiftSel,
    `<option value="">Бүгд</option>` + SHIFT_OPTIONS.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join("")
  );
}

window.onPlaceChange = () => {
  const placeSel = document.getElementById("filter-place");
  const deptSel = document.getElementById("filter-dept");
  if (!placeSel || !deptSel) return;

  const place = placeSel.value || "";
  const depts = new Set();
  allOrders.forEach(o => {
    if (!o.department) return;
    if (!place || (o.place || "") === place) depts.add(o.department);
  });

  const d = [...depts].sort((a,b)=>a.localeCompare(b));
  setSelectOptions(
    deptSel,
    `<option value="">Бүгд</option>` + d.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join("")
  );

  applyFilters();
};

// -------------------- Request: size options --------------------
window.updateSizeOptions = () => {
  const name = document.getElementById("req-item")?.value || "";
  const select = document.getElementById("req-size");
  if (!select) return;

  if (!name) {
    setSelectOptions(select, `<option value="">Сонгох...</option>`);
    return;
  }

  const item = allItems.find(i => i.name === name);
  const sizes = (item?.sizes || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  setSelectOptions(
    select,
    sizes.length
      ? sizes.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("")
      : `<option value="Стандарт">Стандарт</option>`
  );
};

// -------------------- Data refresh --------------------
window.refreshData = refreshData;
async function refreshData() {
  showLoading(true);
  try {
    const data = await apiPost({ action: "get_all_data" });
    if (data.success === false) return popup(data.msg || "Дата татахад алдаа", "Алдаа");

    allOrders = data.orders || [];
    allItems = data.items || [];

    populateItemSelects();
    window.updateSizeOptions();
    setupOrderFilters();
    setupEmployeeFilters();

    const cnt = document.getElementById("items-count");
    if (cnt) cnt.innerText = `${allItems.length} бараа`;

    applyFilters();

    if (!document.getElementById("tab-items")?.classList.contains("hidden")) {
      renderItemsList();
    }
  } catch (e) {
    console.error(e);
    popup(e.message || String(e), "Өгөгдөл татахад алдаа");
  } finally {
    showLoading(false);
  }
}

// -------------------- Orders filter + render --------------------
window.applyFilters = applyFilters;
function applyFilters() {
  const nS = (document.getElementById("search-name")?.value || "").toLowerCase();
  const cS = (document.getElementById("search-code")?.value || "").trim();
  const rS = (document.getElementById("search-role")?.value || "").toLowerCase();

  const iF = document.getElementById("filter-item")?.value || "";
  const sF = document.getElementById("filter-status")?.value || "";
  const yF = document.getElementById("filter-year")?.value || "";
  const mF = document.getElementById("filter-month")?.value || "";

  const pF = document.getElementById("filter-place")?.value || "";
  const dF = document.getElementById("filter-dept")?.value || "";
  const shF = document.getElementById("filter-shift")?.value || "";

  const filtered = allOrders.filter(o => {
    const d = new Date(o.requestedDate);

    const mN = !nS || (o.ner && o.ner.toLowerCase().includes(nS)) || (o.ovog && o.ovog.toLowerCase().includes(nS));
    const mC = !cS || (o.code && String(o.code).includes(cS));
    const mR = !rS || (o.role && o.role.toLowerCase().includes(rS));

    const mI = !iF || o.item === iF;
    const mS = !sF || o.status === sF;

    const mY = !yF || (!isNaN(d) && String(d.getFullYear()) === yF);
    const mM = !mF || (!isNaN(d) && String(d.getMonth() + 1).padStart(2,"0") === mF);

    const mP = !pF || (o.place || "") === pF;
    const mD = !dF || (o.department || "") === dF;
    const mSh = !shF || (o.shift || "") === shF;

    return mN && mC && mR && mI && mS && mY && mM && mP && mD && mSh;
  });

  renderOrders(filtered);
}

function renderOrders(orders) {
  const container = document.getElementById("orders-list-container");
  if (!container) return;

  if (!orders.length) {
    container.innerHTML = `<div class="card animate-fade-in">Мэдээлэл олдсонгүй</div>`;
    return;
  }

  const isAdmin = currentUser?.type === "admin";

  container.innerHTML = orders.slice().reverse().map(o => {
    const canAct = isAdmin && o.status === "Хүлээгдэж буй";

    const actions = canAct ? `
      <div class="items-actions" style="justify-content:flex-start;margin-top:10px">
        <button class="btn-mini edit" onclick="updateStatus('${esc(o.id)}','Зөвшөөрсөн')">Олгох</button>
        <button class="btn-mini del" onclick="updateStatus('${esc(o.id)}','Татгалзсан')">Татгалзах</button>
      </div>` : "";

    return `
      <div class="card animate-fade-in">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
          <div style="min-width:0">
            <div style="font-weight:900;color:#0f172a">${esc(o.ovog)} ${esc(o.ner)}</div>
            <div style="margin-top:6px;font-size:11px;font-weight:800;color:#64748b">
              ${esc(o.code)} • ${esc(o.role || "")}
            </div>
            <div style="margin-top:6px;font-size:10px;font-weight:800;color:#94a3b8">
              ${esc(o.place || "")} • ${esc(o.department || "")} • ${esc(o.shift || "")}
            </div>
          </div>
          <span class="badge" style="background:#e2e8f0;color:#0f172a">${esc(uiStatus(o.status))}</span>
        </div>

        <div style="margin-top:12px;font-weight:900;color:#0f172a">${esc(o.item)}</div>
        <div style="margin-top:6px;font-size:11px;font-weight:800;color:#64748b">
          Размер: ${esc(o.size || "ST")} • Тоо: ${esc(o.quantity ?? 1)} • ${esc(fmtDate(o.requestedDate))}
        </div>

        ${actions}
      </div>
    `;
  }).join("");
}

// -------------------- Orders: admin update status --------------------
window.updateStatus = async (id, status) => {
  showLoading(true);
  try {
    const r = await apiPost({ action: "update_status", id, status });
    if (!r.success) popup(r.msg || "Status update error", "Алдаа");
    await refreshData();
  } catch (e) {
    console.error(e);
    popup(e.message || String(e), "Status update error");
  } finally {
    showLoading(false);
  }
};

// -------------------- Request: submit order --------------------
window.submitRequest = async () => {
  if (!currentUser || currentUser.type === "admin") return;

  const item = document.getElementById("req-item")?.value || "";
  const size = document.getElementById("req-size")?.value || "";
  const qty = parseInt(document.getElementById("req-qty")?.value || "1", 10) || 1;

  if (!item) return popup("Бараа сонгоно уу!", "Хүсэлт");
  if (!size) return popup("Хэмжээ сонгоно уу!", "Хүсэлт");

  showLoading(true);
  try {
    const r = await apiPost({ action: "add_order", code: currentUser.code, item, size, qty });
    if (!r.success) return popup(r.msg || "Хүсэлт илгээхэд алдаа", "Алдаа");

    popup("Хүсэлт амжилттай илгээгдлээ.", "Амжилттай");
    await refreshData();
  } catch (e) {
    console.error(e);
    popup(e.message || String(e), "Хүсэлт илгээхэд алдаа");
  } finally {
    showLoading(false);
  }
};

// -------------------- Items (Admin): list + CRUD + history --------------------
window.clearItemsFilter = () => {
  const sel = document.getElementById("items-filter-name");
  if (sel) sel.value = "";
  renderItemsList();
};

function renderItemsList() {
  const container = document.getElementById("items-list-container");
  if (!container) return;

  const selName = document.getElementById("items-filter-name")?.value || "";
  const list = allItems.filter(it => !selName || it.name === selName);

  if (!list.length) {
    container.innerHTML = `<div class="card animate-fade-in">Бараа олдсонгүй</div>`;
    return;
  }

  const head = `
    <div class="items-head animate-fade-in">
      <div>#</div>
      <div>Бараа</div>
      <div>Размер</div>
      <div style="text-align:right">Үйлдэл</div>
    </div>
  `;

  const rows = list.map((it, idx) => {
    const sizes = (it.sizes || "").split(",").map(s=>s.trim()).filter(Boolean);
    const sizeHtml = sizes.length
      ? sizes.map(s => `<span class="sz">${esc(s)}</span>`).join("")
      : `<span class="sz">ST</span>`;

    const locked = !!it.locked;
    const lockTitle = "Энэ бараагаар хүсэлт/олголт бүртгэгдсэн тул засах/устгах боломжгүй.";

    const editBtn = locked
      ? `<button class="btn-mini edit disabled" disabled title="${esc(lockTitle)}">Засах</button>`
      : `<button class="btn-mini edit" onclick="openEditItem('${esc(it.name)}','${esc(it.sizes || "")}')">Засах</button>`;

    const delBtn = locked
      ? `<button class="btn-mini del disabled" disabled title="${esc(lockTitle)}">Устгах</button>`
      : `<button class="btn-mini del" onclick="deleteItem('${esc(it.name)}')">Устгах</button>`;

    const histBtn = `<button class="btn-mini hist" onclick="openItemHistory('${esc(it.name)}')">Түүх</button>`;

    return `
      <div class="items-row animate-fade-in">
        <div class="items-no">${idx + 1}</div>
        <div class="items-name">${esc(it.name)}</div>
        <div class="items-sizes">${sizeHtml}</div>
        <div class="items-actions">${editBtn}${histBtn}${delBtn}</div>
      </div>
    `;
  }).join("");

  container.innerHTML = head + rows;
}

window.addItem = async () => {
  const name = document.getElementById("new-item-name")?.value?.trim() || "";
  const sizes = document.getElementById("new-item-sizes")?.value?.trim() || "";
  if (!name) return popup("Нэр оруулна уу!", "Бараа нэмэх");

  showLoading(true);
  try {
    const r = await apiPost({ action: "add_item", name, sizes });
    if (!r.success) return popup(r.msg || "Бараа нэмэхэд алдаа", "Алдаа");

    document.getElementById("new-item-name").value = "";
    document.getElementById("new-item-sizes").value = "";
    await refreshData();
    popup("Бараа нэмэгдлээ.", "Амжилттай");
  } catch (e) {
    console.error(e);
    popup(e.message || String(e), "Бараа нэмэхэд алдаа");
  } finally {
    showLoading(false);
  }
};

window.openEditItem = (oldName, sizes) => {
  const html = `
    <div class="card" style="border:none;box-shadow:none;padding:0">
      <div class="filter-label">Барааны нэр</div>
      <input id="edit-item-name" value="${esc(oldName)}" />
      <div style="height:10px"></div>
      <div class="filter-label">Размерууд (таслалаар)</div>
      <input id="edit-item-sizes" value="${esc(sizes || "")}" />
      <div style="height:12px"></div>
      <button class="btn-primary" onclick="saveEditItem('${esc(oldName)}')">Хадгалах</button>
    </div>
  `;
  window.openModal("Бараа засах", html);
};

window.saveEditItem = async (oldName) => {
  const newName = document.getElementById("edit-item-name")?.value?.trim() || "";
  const sizes = document.getElementById("edit-item-sizes")?.value?.trim() || "";
  if (!newName) return popup("Нэр хоосон байна!", "Алдаа");

  showLoading(true);
  try {
    const r = await apiPost({ action: "update_item", oldName, newName, sizes });
    if (!r.success) return popup(r.msg || "Бараа засахад алдаа", "Алдаа");

    window.closeModal();
    await refreshData();
    popup("Амжилттай засагдлаа.", "Амжилттай");
  } catch (e) {
    console.error(e);
    popup(e.message || String(e), "Бараа засахад алдаа");
  } finally {
    showLoading(false);
  }
};

window.deleteItem = async (name) => {
  if (!confirm(`"${name}" барааг устгах уу?`)) return;

  showLoading(true);
  try {
    const r = await apiPost({ action: "delete_item", name });
    if (!r.success) return popup(r.msg || "Устгахад алдаа", "Алдаа");

    await refreshData();
    popup("Устгагдлаа.", "Амжилттай");
  } catch (e) {
    console.error(e);
    popup(e.message || String(e), "Устгахад алдаа");
  } finally {
    showLoading(false);
  }
};

window.openItemHistory = async (item) => {
  showLoading(true);
  try {
    const r = await apiPost({ action: "get_item_history", item });
    if (!r.success) return popup(r.msg || "Түүх татахад алдаа", "Алдаа");

    const rows = (r.history || []).slice().reverse();
    const body = rows.length
      ? `
        <div style="overflow:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Огноо</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Код</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Нэр</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Хэмжээ</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Тоо</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(h => `
                <tr>
                  <td style="padding:8px;border-bottom:1px solid #f1f5f9">${esc(fmtDate(h.date))}</td>
                  <td style="padding:8px;border-bottom:1px solid #f1f5f9">${esc(h.code)}</td>
                  <td style="padding:8px;border-bottom:1px solid #f1f5f9">${esc(h.ovog)} ${esc(h.ner)}</td>
                  <td style="padding:8px;border-bottom:1px solid #f1f5f9">${esc(h.size || "ST")}</td>
                  <td style="padding:8px;border-bottom:1px solid #f1f5f9">${esc(h.qty)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `
      : `<div style="font-weight:800;color:#64748b">Олголтын түүх байхгүй</div>`;

    window.openModal("Олголтын түүх • " + item, body);
  } catch (e) {
    console.error(e);
    popup(e.message || String(e), "Түүх татахад алдаа");
  } finally {
    showLoading(false);
  }
};

// -------------------- Password change --------------------
window.changePassword = async () => {
  if (!currentUser || currentUser.type === "admin") return;

  const oldP = document.getElementById("old-pass")?.value?.trim() || "";
  const newP = document.getElementById("new-pass")?.value?.trim() || "";
  const conP = document.getElementById("confirm-pass")?.value?.trim() || "";

  if (!oldP || !newP || !conP) return popup("Бүх талбарыг бөглөнө үү!", "Нууц үг солих");
  if (newP !== conP) return popup("Шинэ нууц үг давхцахгүй байна!", "Нууц үг солих");

  showLoading(true);
  try {
    const r = await apiPost({ action: "change_pass", code: currentUser.code, oldP, newP });
    if (!r.success) return popup(r.msg || "Нууц үг солиход алдаа", "Алдаа");

    document.getElementById("old-pass").value = "";
    document.getElementById("new-pass").value = "";
    document.getElementById("confirm-pass").value = "";

    popup("Нууц үг амжилттай солигдлоо.", "Амжилттай");
  } catch (e) {
    console.error(e);
    popup(e.message || String(e), "Нууц үг солиход алдаа");
  } finally {
    showLoading(false);
  }
};

// -------------------- Bootstrap --------------------
window.onload = () => {
  setVH();

  ["search-name","search-code","search-role"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", applyFilters);
  });

  ["filter-item","filter-status","filter-year","filter-month","filter-dept","filter-shift"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", applyFilters);
  });

  const placeSel = document.getElementById("filter-place");
  if (placeSel) placeSel.addEventListener("change", window.onPlaceChange);

  const reqItem = document.getElementById("req-item");
  if (reqItem) reqItem.addEventListener("change", window.updateSizeOptions);

  const saved = safeJsonParse(localStorage.getItem("ett_user"));
  if (saved) {
    currentUser = saved;
    initApp();
  }
};
