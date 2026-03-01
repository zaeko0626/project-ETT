// =========================
// ETT PPE System - app.js (FULL)
// - CORS-safe fetch (no custom headers)
// - Better error popup: FETCH_ERROR / HTTP_403 / JSON_PARSE_ERROR
// =========================

const API_URL =
  "https://script.google.com/macros/s/AKfycbxBHHml8zicq4mX7GcNqsTjMXYaD-kOAZ4WZWjgdA60sdsus6LrsGonzubMKahhCPTm/exec";

let allOrders = [];
let allItems = [];
let currentUser = null;

// ---- VH fix ----
function setVH() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty("--vh", `${vh}px`);
}
window.addEventListener("resize", setVH);
window.addEventListener("orientationchange", () => setTimeout(setVH, 200));

// ---- Helpers ----
function safeJsonParse(str) { try { return JSON.parse(str); } catch { return null; } }
function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function formatDate(dt) { try { const d = new Date(dt); return isNaN(d) ? "" : d.toLocaleDateString(); } catch { return ""; } }
function uiStatus(status) { if (status === "Зөвшөөрсөн") return "Олгосон"; return status || ""; }

function showLoading(show) {
  const el = document.getElementById("loading-overlay");
  if (!el) return;
  el.classList.toggle("hidden", !show);
}

function popupError(title, msg) {
  alert(`${title}\n\n${msg}`);
}

// -------------------------
// ✅ API call (CORS-safe) + DEBUG
// -------------------------
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
    throw new Error(`HTTP_${res.status}: ${text.slice(0, 200)}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error("JSON_PARSE_ERROR: " + text.slice(0, 200));
  }

  return json;
}

// -------------------------
// Sidebar
// -------------------------
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

window.showTab = (tabName, btn) => {
  document.querySelectorAll(".tab-content").forEach((t) => t.classList.add("hidden"));
  document.getElementById("tab-" + tabName)?.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");

  setTimeout(setVH, 0);
  if (window.innerWidth < 1024) window.closeSidebar();

  if (tabName === "items") window.renderItemsList();
};

// -------------------------
// Modal
// -------------------------
window.openModal = (title, html) => {
  document.getElementById("modal-title").innerText = title;
  document.getElementById("modal-body").innerHTML = html;
  document.getElementById("modal-overlay").classList.remove("hidden");
};
window.closeModal = () => {
  document.getElementById("modal-overlay").classList.add("hidden");
  document.getElementById("modal-body").innerHTML = "";
};

// -------------------------
// User card
// -------------------------
function updateHeaderSubtitle() {
  const el = document.getElementById("user-display-name");
  if (!el) return;
  if (currentUser && currentUser.type === "admin") {
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
    nameEl.innerText = ""; idEl.innerText = ""; roleEl.innerText = ""; extraEl.innerText = "";
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

// -------------------------
// Login
// -------------------------
window.handleLogin = async () => {
  const code = document.getElementById("login-user")?.value?.trim() || "";
  const pass = document.getElementById("login-pass")?.value?.trim() || "";
  if (!code || !pass) return popupError("Алдаа", "Код, нууц үгээ оруулна уу!");

  showLoading(true);
  try {
    const result = await apiPost({ action: "login", code, pass });
    if (result.success) {
      currentUser = result.user;
      localStorage.setItem("ett_user", JSON.stringify(currentUser));
      initApp();
    } else {
      popupError("Нэвтрэх боломжгүй", result.msg || "Код эсвэл нууц үг буруу");
    }
  } catch (e) {
    console.error(e);
    popupError("Login error", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

function initApp() {
  document.getElementById("login-page")?.classList.add("hidden");
  document.getElementById("main-page")?.classList.remove("hidden");

  updateHeaderSubtitle();
  updateSidebarUserCard();

  const isAdmin = currentUser?.type === "admin";
  document.getElementById("nav-request")?.classList.toggle("hidden", isAdmin);
  document.getElementById("nav-items")?.classList.toggle("hidden", !isAdmin);

  window.refreshData();
  setTimeout(setVH, 0);
}

// -------------------------
// Data refresh
// -------------------------
window.refreshData = async () => {
  showLoading(true);
  try {
    const data = await apiPost({ action: "get_all_data" });

    if (data.success === false) {
      popupError("Өгөгдөл татахад алдаа гарлаа.", data.msg || "Unknown");
      return;
    }

    allOrders = data.orders || [];
    allItems = data.items || [];

    populateOrderItemFilter();
    populateRequestItemSelect();
    updateSizeOptions();
    setupOrderFilters();
    setupEmployeeFilters();
    setupItemsNameFilter();
    applyFilters();

    const cnt = document.getElementById("items-count");
    if (cnt) cnt.innerText = `${allItems.length} бараа`;

    if (!document.getElementById("tab-items")?.classList.contains("hidden")) {
      window.renderItemsList();
    }
  } catch (e) {
    console.error(e);
    popupError("Өгөгдөл татахад алдаа гарлаа.", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// -------------------------
// Selects
// -------------------------
function populateOrderItemFilter() {
  const el = document.getElementById("filter-item");
  if (!el) return;
  el.innerHTML = `<option value="">Бүх бараа</option>` + allItems.map(i => `<option value="${esc(i.name)}">${esc(i.name)}</option>`).join("");
}
function populateRequestItemSelect() {
  const el = document.getElementById("req-item");
  if (!el) return;
  el.innerHTML = `<option value="">Сонгох...</option>` + allItems.map(i => `<option value="${esc(i.name)}">${esc(i.name)}</option>`).join("");
}

// -------------------------
// Filters setup
// -------------------------
function setupOrderFilters() {
  const yearSel = document.getElementById("filter-year");
  const monthSel = document.getElementById("filter-month");
  if (!yearSel || !monthSel) return;

  const years = new Set();
  allOrders.forEach((o) => {
    const d = new Date(o.requestedDate);
    if (!isNaN(d)) years.add(d.getFullYear());
  });

  const sortedYears = [...years].sort((a, b) => a - b);
  yearSel.innerHTML =
    `<option value="">БҮХ ОН</option>` +
    (sortedYears.length ? sortedYears : [new Date().getFullYear()])
      .map((y) => `<option value="${y}">${y}</option>`)
      .join("");

  monthSel.innerHTML =
    `<option value="">БҮХ САР</option>` +
    Array.from({ length: 12 }, (_, i) => i + 1)
      .map((m) => {
        const mm = String(m).padStart(2, "0");
        return `<option value="${mm}">${m} сар</option>`;
      })
      .join("");
}

const SHIFT_OPTIONS = ["А ээлж", "Б ээлж", "В ээлж", "Г ээлж", "Төв оффис", "Бусад"];

function setupEmployeeFilters() {
  const placeSel = document.getElementById("filter-place");
  const deptSel = document.getElementById("filter-dept");
  const shiftSel = document.getElementById("filter-shift");
  if (!placeSel || !deptSel || !shiftSel) return;

  const places = new Set();
  const depts = new Set();

  allOrders.forEach((o) => {
    if (o.place) places.add(o.place);
    if (o.department) depts.add(o.department);
  });

  placeSel.innerHTML =
    `<option value="">БҮХ ГАЗАР</option>` + [...places].sort().map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join("");

  deptSel.innerHTML =
    `<option value="">БҮХ ХЭЛТЭС</option>` + [...depts].sort().map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join("");

  shiftSel.innerHTML =
    `<option value="">БҮХ ЭЭЛЖ</option>` + SHIFT_OPTIONS.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
}

window.onPlaceChange = () => {
  const placeSel = document.getElementById("filter-place");
  const deptSel = document.getElementById("filter-dept");
  if (!placeSel || !deptSel) return;

  const place = placeSel.value || "";
  const depts = new Set();

  allOrders.forEach((o) => {
    if (!o.department) return;
    if (!place) depts.add(o.department);
    else if ((o.place || "") === place) depts.add(o.department);
  });

  deptSel.innerHTML =
    `<option value="">БҮХ ХЭЛТЭС</option>` + [...depts].sort().map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join("");

  applyFilters();
};

function setupItemsNameFilter() {
  const sel = document.getElementById("items-filter-name");
  if (!sel) return;
  const names = allItems.map(i => i.name).filter(Boolean).sort();
  sel.innerHTML = `<option value="">БҮХ БАРАА</option>` + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
}
window.clearItemsFilter = () => {
  const sel = document.getElementById("items-filter-name");
  if (sel) sel.value = "";
  window.renderItemsList();
};

// -------------------------
// Request size options
// -------------------------
function updateSizeOptions() {
  const name = document.getElementById("req-item")?.value || "";
  const select = document.getElementById("req-size");
  if (!select) return;

  if (!name) {
    select.innerHTML = `<option value="">Сонгох...</option>`;
    return;
  }
  const item = allItems.find((i) => i.name === name);
  if (item && item.sizes) {
    const opts = item.sizes.split(",").map(s => s.trim()).filter(Boolean)
      .map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
    select.innerHTML = opts || `<option value="Стандарт">Стандарт</option>`;
  } else {
    select.innerHTML = `<option value="Стандарт">Стандарт</option>`;
  }
}
window.updateSizeOptions = updateSizeOptions;

// -------------------------
// Orders filtering + render
// -------------------------
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

  const filtered = allOrders.filter((o) => {
    const d = new Date(o.requestedDate);

    const mN =
      !nS ||
      (o.ner && o.ner.toLowerCase().includes(nS)) ||
      (o.ovog && o.ovog.toLowerCase().includes(nS));

    const mC = !cS || (o.code && String(o.code).includes(cS));
    const mR = !rS || (o.role && o.role.toLowerCase().includes(rS));
    const mI = !iF || o.item === iF;
    const mS = !sF || o.status === sF;

    const mY = !yF || (!isNaN(d) && String(d.getFullYear()) === yF);
    const mM = !mF || (!isNaN(d) && String(d.getMonth() + 1).padStart(2, "0") === mF);

    const mP = !pF || (o.place || "") === pF;
    const mD = !dF || (o.department || "") === dF;
    const mSh = !shF || (o.shift || "") === shF;

    return mN && mC && mR && mI && mS && mY && mM && mP && mD && mSh;
  });

  renderOrders(filtered);
}
window.applyFilters = applyFilters;

function renderOrders(orders) {
  const container = document.getElementById("orders-list-container");
  if (!container) return;

  if (!orders.length) {
    container.innerHTML = `<div class="card muted">Мэдээлэл олдсонгүй</div>`;
    return;
  }

  container.innerHTML = orders.slice().reverse().map((o) => {
    const canAct = currentUser?.type === "admin" && o.status === "Хүлээгдэж буй";
    const actions = canAct ? `
      <div class="row" style="margin-top:10px">
        <button class="btn-mini edit" onclick="updateStatus('${esc(o.id)}','Зөвшөөрсөн')">Олгох</button>
        <button class="btn-mini del" onclick="updateStatus('${esc(o.id)}','Татгалзсан')">Татгалзах</button>
      </div>` : "";

    return `
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <div>
            <div style="font-weight:900">${esc(o.ovog)} ${esc(o.ner)}</div>
            <div class="muted">${esc(o.code)} • ${esc(o.role)}</div>
            <div class="muted">${esc(o.place)} • ${esc(o.department)} • ${esc(o.shift)}</div>
          </div>
          <span class="badge">${esc(uiStatus(o.status))}</span>
        </div>

        <div style="margin-top:10px">
          <div>${esc(o.item)}</div>
          <div class="muted">${esc(o.size || "ST")} / ${esc(o.quantity ?? 1)}ш • ${esc(formatDate(o.requestedDate))}</div>
        </div>

        ${actions}
      </div>
    `;
  }).join("");
}

// -------------------------
// Admin status update
// -------------------------
window.updateStatus = async (id, status) => {
  showLoading(true);
  try {
    const r = await apiPost({ action: "update_status", id, status });
    if (!r.success) popupError("Алдаа", r.msg || "Status update error");
    await window.refreshData();
  } catch (e) {
    console.error(e);
    popupError("update_status error", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// -------------------------
// Submit request
// -------------------------
window.submitRequest = async () => {
  const item = document.getElementById("req-item")?.value || "";
  const size = document.getElementById("req-size")?.value || "";
  const qty = document.getElementById("req-qty")?.value || 1;

  if (!item || !size) return popupError("Алдаа", "Бараа/Размер сонгоно уу!");

  showLoading(true);
  try {
    const r = await apiPost({ action: "add_order", code: currentUser.code, item, size, qty });
    if (r.success) {
      alert("Хүсэлт илгээгдлээ!");
      await window.refreshData();
      const firstBtn = document.getElementById("nav-orders");
      window.showTab("orders", firstBtn);
    } else {
      popupError("Алдаа", r.msg || "Request error");
    }
  } catch (e) {
    console.error(e);
    popupError("add_order error", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// -------------------------
// Items (Admin) list + CRUD + history
// -------------------------
window.renderItemsList = () => {
  const container = document.getElementById("items-list-container");
  if (!container) return;

  const selectedName = document.getElementById("items-filter-name")?.value || "";
  const filtered = allItems.filter((it) => !selectedName || it.name === selectedName);

  const cnt = document.getElementById("items-count");
  if (cnt) cnt.innerText = `${filtered.length} бараа`;

  if (!filtered.length) {
    container.innerHTML = `<div class="card muted">Бараа олдсонгүй</div>`;
    return;
  }

  const head = `
    <div class="items-head">
      <div>#</div>
      <div>Бараа</div>
      <div>Размер</div>
      <div>Үйлдэл</div>
    </div>
  `;

  const rows = filtered.map((it, idx) => {
    const sizes = (it.sizes || "").split(",").map(s => s.trim()).filter(Boolean);
    const sizeList = sizes.length ? sizes.map(s => `<span class="sz">${esc(s)}</span>`).join("") : `<span class="sz">ST</span>`;
    const locked = !!it.locked;
    const lockMsg = "Энэ бараагаар хүсэлт/олголт бүртгэгдсэн тул засах/устгах боломжгүй.";

    const editBtn = locked
      ? `<button class="btn-mini edit disabled" title="${esc(lockMsg)}" disabled>Засах</button>`
      : `<button class="btn-mini edit" onclick="openEditItem('${esc(it.name)}','${esc(it.sizes || "")}')">Засах</button>`;

    const delBtn = locked
      ? `<button class="btn-mini del disabled" title="${esc(lockMsg)}" disabled>Устгах</button>`
      : `<button class="btn-mini del" onclick="deleteItem('${esc(it.name)}')">Устгах</button>`;

    const histBtn = `<button class="btn-mini hist" onclick="openItemHistory('${esc(it.name)}')">Түүх</button>`;

    return `
      <div class="items-row">
        <div>${idx + 1}</div>
        <div>${esc(it.name)}</div>
        <div>${sizeList}</div>
        <div>${editBtn}${histBtn}${delBtn}</div>
      </div>
    `;
  }).join("");

  container.innerHTML = head + rows;
};

window.addItem = async () => {
  const name = document.getElementById("new-item-name")?.value?.trim() || "";
  const sizes = document.getElementById("new-item-sizes")?.value?.trim() || "";
  if (!name) return popupError("Алдаа", "Нэр оруулна уу!");

  showLoading(true);
  try {
    const r = await apiPost({ action: "add_item", name, sizes });
    if (r.success) {
      document.getElementById("new-item-name").value = "";
      document.getElementById("new-item-sizes").value = "";
      await window.refreshData();
      alert("Бараа нэмэгдлээ");
    } else popupError("Алдаа", r.msg || "add_item error");
  } catch (e) {
    console.error(e);
    popupError("add_item error", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.openEditItem = (oldName, sizes) => {
  const html = `
    <div>
      <label class="lbl">Барааны нэр</label>
      <input id="edit-item-name" class="inp" value="${esc(oldName)}" />
      <label class="lbl">Размерууд (таслалаар)</label>
      <input id="edit-item-sizes" class="inp" value="${esc(sizes || "")}" />
      <div class="row" style="margin-top:10px">
        <button class="btn primary" onclick="saveEditItem('${esc(oldName)}')">Хадгалах</button>
        <button class="btn ghost" onclick="closeModal()">Болих</button>
      </div>
    </div>
  `;
  window.openModal("Бараа засах", html);
};

window.saveEditItem = async (oldName) => {
  const newName = document.getElementById("edit-item-name")?.value?.trim() || "";
  const sizes = document.getElementById("edit-item-sizes")?.value?.trim() || "";
  if (!newName) return popupError("Алдаа", "Нэр хоосон байна!");

  showLoading(true);
  try {
    const r = await apiPost({ action: "update_item", oldName, newName, sizes });
    if (r.success) {
      closeModal();
      await window.refreshData();
      alert("Амжилттай засагдлаа");
    } else popupError("Алдаа", r.msg || "update_item error");
  } catch (e) {
    console.error(e);
    popupError("update_item error", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.deleteItem = async (name) => {
  if (!confirm(`"${name}" барааг устгах уу?`)) return;

  showLoading(true);
  try {
    const r = await apiPost({ action: "delete_item", name });
    if (r.success) {
      await window.refreshData();
      alert("Устгагдлаа");
    } else popupError("Алдаа", r.msg || "delete_item error");
  } catch (e) {
    console.error(e);
    popupError("delete_item error", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

window.openItemHistory = async (item) => {
  showLoading(true);
  try {
    const r = await apiPost({ action: "get_item_history", item });
    if (!r.success) return popupError("Алдаа", r.msg || "history error");

    const rows = (r.history || []).slice().reverse();
    const table = rows.length ? `
      <div style="overflow:auto">
        <table style="width:100%; border-collapse:collapse; font-size:13px">
          <thead>
            <tr style="color:#94a3b8; text-align:left">
              <th style="padding:8px; border-bottom:1px solid rgba(255,255,255,.08)">Огноо</th>
              <th style="padding:8px; border-bottom:1px solid rgba(255,255,255,.08)">Код</th>
              <th style="padding:8px; border-bottom:1px solid rgba(255,255,255,.08)">Овог нэр</th>
              <th style="padding:8px; border-bottom:1px solid rgba(255,255,255,.08)">Размер</th>
              <th style="padding:8px; border-bottom:1px solid rgba(255,255,255,.08)">Тоо</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(h => `
              <tr>
                <td style="padding:8px; border-bottom:1px solid rgba(255,255,255,.06)">${esc(formatDate(h.date))}</td>
                <td style="padding:8px; border-bottom:1px solid rgba(255,255,255,.06)">${esc(h.code)}</td>
                <td style="padding:8px; border-bottom:1px solid rgba(255,255,255,.06)">${esc(h.ovog)} ${esc(h.ner)}</td>
                <td style="padding:8px; border-bottom:1px solid rgba(255,255,255,.06)">${esc(h.size || "ST")}</td>
                <td style="padding:8px; border-bottom:1px solid rgba(255,255,255,.06)">${esc(h.qty)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>` : `<div class="muted">Олголтын түүх байхгүй</div>`;

    openModal(`Олголтын түүх • ${esc(item)}`, table);
  } catch (e) {
    console.error(e);
    popupError("history error", e.message || String(e));
  } finally {
    showLoading(false);
  }
};

// -------------------------
// Logout / Bootstrap
// -------------------------
window.logout = () => { localStorage.clear(); location.reload(); };

window.onload = () => {
  setVH();
  currentUser = safeJsonParse(localStorage.getItem("ett_user"));
  if (currentUser) initApp();
  else document.getElementById("login-page")?.classList.remove("hidden");
};
