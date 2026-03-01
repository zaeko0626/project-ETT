// =========================
// ETT PPE System - app.js (FULL)
// =========================

// 1) 🔧 API URL чинь /exec-ээр төгссөн байх ёстой
const API_URL =
  "https://script.google.com/macros/s/AKfycbzt5PLrQ24ZmBnkZDKOR82gOXzQbSBDnQoplVQ_Sne0HIIzyq7ORksBPxMUOz_iqrjr/exec";

// -------------------------
// Global state
// -------------------------
let allOrders = [];
let allItems = [];
let currentUser = null;

// -------------------------
// Mobile safe-area VH helper
// -------------------------
function setVH() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty("--vh", `${vh}px`);
}
window.addEventListener("resize", setVH);
window.addEventListener("orientationchange", () => setTimeout(setVH, 200));

// -------------------------
// Helpers
// -------------------------
function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function showLoading(show) {
  const el = document.getElementById("loading-overlay");
  if (!el) return;
  el.classList.toggle("hidden", !show);
}

function uiStatus(status) {
  if (status === "Зөвшөөрсөн") return "Олгосон";
  return status || "";
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function formatDate(dt) {
  try {
    const d = new Date(dt);
    if (isNaN(d)) return "";
    return d.toLocaleDateString();
  } catch {
    return "";
  }
}

// -------------------------
// ✅ Robust API POST (JSON)
// -------------------------
async function postJson(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=utf-8",
    },
    body: JSON.stringify(payload),
    redirect: "follow",
  });

  const text = await res.text();

  // HTTP error -> show real response
  if (!res.ok) {
    console.error("API HTTP ERROR:", res.status, text);
    throw new Error(`API HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = safeJsonParse(text);
  if (!json) {
    // This is the #1 cause: Apps Script returned HTML (deploy/permission, etc.)
    console.error("API returned NON-JSON:", text);
    const head = text.slice(0, 200).toLowerCase();
    if (head.includes("<!doctype") || head.includes("<html")) {
      throw new Error(
        "API JSON биш HTML буцаалаа. (Apps Script Deploy/Permission асуудал байх магадлал өндөр)"
      );
    }
    throw new Error("API non-JSON response");
  }

  return json;
}

// -------------------------
// Sidebar controls (existing UI)
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
// Header / Sidebar user info
// -------------------------
function updateHeaderSubtitle() {
  const el = document.getElementById("user-display-name");
  if (!el) return;

  if (currentUser && currentUser.type !== "admin") {
    el.innerText = "";
    el.classList.add("hidden");
    return;
  }
  if (currentUser && currentUser.type === "admin") {
    el.classList.remove("hidden");
    el.innerText = "АДМИНИСТРАТОР";
    return;
  }
  el.innerText = "";
  el.classList.add("hidden");
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

  const fullName = `${currentUser.ovog || ""} ${currentUser.ner || ""}`.trim();
  nameEl.innerText = fullName;
  idEl.innerText = `ID# ${currentUser.code || ""}`;
  roleEl.innerText = currentUser.role || "";

  const place = currentUser.place || "";
  const dept = currentUser.department || "";
  const shift = currentUser.shift || "";
  const parts = [];
  if (place) parts.push(`Газар: ${place}`);
  if (dept) parts.push(`Хэлтэс: ${dept}`);
  if (shift) parts.push(`Ээлж: ${shift}`);
  extraEl.innerText = parts.join(" • ");
}

// -------------------------
// Login
// -------------------------
window.handleLogin = async () => {
  const code = document.getElementById("login-user")?.value?.trim() || "";
  const pass = document.getElementById("login-pass")?.value?.trim() || "";
  if (!code || !pass) return alert("Код, нууц үгээ оруулна уу!");

  showLoading(true);
  try {
    const result = await postJson({ action: "login", code, pass });
    if (result.success) {
      currentUser = result.user;
      localStorage.setItem("ett_user", JSON.stringify(currentUser));
      initApp();
    } else {
      alert(result.msg || "Код эсвэл нууц үг буруу байна");
    }
  } catch (e) {
    console.error(e);
    alert(String(e.message || e));
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
// ✅ Data refresh
// -------------------------
window.refreshData = async () => {
  showLoading(true);
  try {
    const data = await postJson({ action: "get_all_data" });

    if (data.success === false) {
      alert(data.msg || "Дата татахад алдаа");
      return;
    }

    allOrders = data.orders || [];
    allItems = data.items || [];

    // Populate Order filters
    populateOrderItemFilter();
    populateRequestItemSelect();

    window.updateSizeOptions();
    setupOrderFilters();
    setupEmployeeFilters();
    setupItemsNameFilter();

    window.applyFilters();

    const cnt = document.getElementById("items-count");
    if (cnt) cnt.innerText = `${allItems.length} бараа`;

    if (!document.getElementById("tab-items")?.classList.contains("hidden")) {
      window.renderItemsList();
    }
    setTimeout(setVH, 0);
  } catch (e) {
    console.error(e);

    // илүү ойлгомжтой message
    const msg = String(e.message || e);
    if (msg.includes("Deploy/Permission")) {
      alert(
        "Өгөгдөл татахад алдаа гарлаа.\n\n" +
          "⚠️ Apps Script API JSON биш HTML буцааж байна.\n" +
          "Deploy тохиргоо:\n" +
          "Deploy → Manage deployments → Web app\n" +
          "Execute as: Me\n" +
          "Who has access: Anyone\n\n" +
          "Мөн API_URL /exec зөв эсэхийг шалга."
      );
    } else {
      alert("Өгөгдөл татахад алдаа гарлаа.\n\n" + msg);
    }
  } finally {
    showLoading(false);
  }
};

// -------------------------
// ✅ Select population (fix option tags)
// -------------------------
function populateOrderItemFilter() {
  const filterItem = document.getElementById("filter-item");
  if (!filterItem) return;

  let html = `<option value="">Бүх бараа</option>`;
  allItems.forEach((it) => {
    html += `<option value="${esc(it.name)}">${esc(it.name)}</option>`;
  });
  filterItem.innerHTML = html;
}

function populateRequestItemSelect() {
  const reqItem = document.getElementById("req-item");
  if (!reqItem) return;

  let html = `<option value="">Сонгох...</option>`;
  allItems.forEach((it) => {
    html += `<option value="${esc(it.name)}">${esc(it.name)}</option>`;
  });
  reqItem.innerHTML = html;
}

// -------------------------
// Items name dropdown filter
// -------------------------
function setupItemsNameFilter() {
  const sel = document.getElementById("items-filter-name");
  if (!sel) return;

  const names = allItems
    .map((i) => i.name)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  sel.innerHTML =
    `<option value="">БҮХ БАРАА</option>` +
    names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
}

window.clearItemsFilter = () => {
  const sel = document.getElementById("items-filter-name");
  if (sel) sel.value = "";
  window.renderItemsList();
};

// -------------------------
// Order filters (existing)
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

// Employee filters
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

  const sortedPlaces = [...places].sort((a, b) => a.localeCompare(b));
  const sortedDepts = [...depts].sort((a, b) => a.localeCompare(b));

  placeSel.innerHTML =
    `<option value="">БҮХ ГАЗАР</option>` +
    sortedPlaces.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join("");

  deptSel.innerHTML =
    `<option value="">БҮХ ХЭЛТЭС</option>` +
    sortedDepts.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join("");

  shiftSel.innerHTML =
    `<option value="">БҮХ ЭЭЛЖ</option>` +
    SHIFT_OPTIONS.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
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

  const sortedDepts = [...depts].sort((a, b) => a.localeCompare(b));
  deptSel.innerHTML =
    `<option value="">БҮХ ХЭЛТЭС</option>` +
    sortedDepts.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join("");

  window.applyFilters();
};

// Request size options
window.updateSizeOptions = () => {
  const name = document.getElementById("req-item")?.value || "";
  const select = document.getElementById("req-size");
  if (!select) return;

  if (!name) {
    select.innerHTML = `<option value="">Сонгох...</option>`;
    return;
  }

  const item = allItems.find((i) => i.name === name);
  if (item && item.sizes) {
    const opts = item.sizes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => `<option value="${esc(s)}">${esc(s)}</option>`)
      .join("");
    select.innerHTML = opts || `<option value="Стандарт">Стандарт</option>`;
  } else {
    select.innerHTML = `<option value="Стандарт">Стандарт</option>`;
  }
};

// Orders filter apply
window.applyFilters = () => {
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
};

function renderOrders(orders) {
  const container = document.getElementById("orders-list-container");
  if (!container) return;

  if (!orders.length) {
    container.innerHTML = `<div class="p-3 text-slate-500">Мэдээлэл олдсонгүй</div>`;
    return;
  }

  container.innerHTML = orders
    .slice()
    .reverse()
    .map((o) => {
      const shouldShowActions = currentUser?.type === "admin" && o.status === "Хүлээгдэж буй";

      const adminActions = shouldShowActions
        ? `
          <div class="mt-2 flex gap-2">
            <button class="btn-mini edit" onclick="updateStatus('${esc(o.id)}','Зөвшөөрсөн')">Олгох</button>
            <button class="btn-mini del" onclick="updateStatus('${esc(o.id)}','Татгалзсан')">Татгалзах</button>
          </div>
        `
        : "";

      return `
        <div class="card animate-fade-in">
          <div class="flex justify-between items-start">
            <div>
              <div class="font-semibold">${esc(o.ovog)} ${esc(o.ner)}</div>
              <div class="text-sm text-slate-500">${esc(o.code)} • ${esc(o.role)}</div>
              <div class="text-xs text-slate-500">${esc(o.place)} • ${esc(o.department)} • ${esc(o.shift)}</div>
            </div>
            <span class="badge">${esc(uiStatus(o.status))}</span>
          </div>

          <div class="mt-2">
            <div class="text-sm">${esc(o.item)}</div>
            <div class="text-sm text-slate-600">${esc(o.size || "ST")} / ${esc(o.quantity ?? 1)}ш</div>
          </div>

          ${adminActions}
        </div>
      `;
    })
    .join("");
}

window.updateStatus = async (id, status) => {
  showLoading(true);
  try {
    const r = await postJson({ action: "update_status", id, status });
    if (!r.success) alert(r.msg || "Status update error");
    await window.refreshData();
  } catch (e) {
    console.error(e);
    alert("Алдаа! (update_status)\n\n" + String(e.message || e));
  } finally {
    showLoading(false);
  }
};

// Request submit
window.submitRequest = async () => {
  const item = document.getElementById("req-item")?.value || "";
  const size = document.getElementById("req-size")?.value || "";
  const qty = document.getElementById("req-qty")?.value || 1;

  if (!item || !size) return alert("Бүрэн бөглөнө үү!");

  showLoading(true);
  try {
    const r = await postJson({
      action: "add_order",
      code: currentUser.code,
      item,
      size,
      qty,
    });
    if (r.success) {
      alert("Хүсэлт илгээгдлээ!");
      await window.refreshData();
      const firstBtn = document.querySelector(".nav-btn");
      window.showTab("orders", firstBtn);
    } else {
      alert(r.msg || "Алдаа");
    }
  } catch (e) {
    console.error(e);
    alert("Алдаа! (add_order)\n\n" + String(e.message || e));
  } finally {
    showLoading(false);
  }
};

// -------------------------
// Items list
// -------------------------
window.renderItemsList = () => {
  const container = document.getElementById("items-list-container");
  if (!container) return;

  const selectedName = document.getElementById("items-filter-name")?.value || "";
  const filtered = allItems.filter((it) => !selectedName || it.name === selectedName);

  const cnt = document.getElementById("items-count");
  if (cnt) cnt.innerText = `${filtered.length} бараа`;

  if (!filtered.length) {
    container.innerHTML = `<div class="p-3 text-slate-500">Бараа олдсонгүй</div>`;
    return;
  }

  const head = `
    <div class="items-head">
      <div class="items-no">#</div>
      <div class="items-name">Бараа</div>
      <div class="items-sizes">Размер</div>
      <div class="items-actions">Үйлдэл</div>
    </div>
  `;

  const rows = filtered
    .map((it, idx) => {
      const sizes = (it.sizes || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const sizeList = sizes.length
        ? sizes.map((s) => `<span class="sz">${esc(s)}</span>`).join("")
        : `<span class="sz">ST</span>`;

      const locked = !!it.locked;
      const lockMsg =
        "Энэ бараагаар хүсэлт/олголт бүртгэгдсэн тул засах/устгах боломжгүй.";

      const editBtn = locked
        ? `<button class="btn-mini edit disabled" title="${esc(lockMsg)}" disabled>Засах</button>`
        : `<button class="btn-mini edit" onclick="openEditItem('${esc(it.name)}','${esc(it.sizes || "")}')">Засах</button>`;

      const delBtn = locked
        ? `<button class="btn-mini del disabled" title="${esc(lockMsg)}" disabled>Устгах</button>`
        : `<button class="btn-mini del" onclick="deleteItem('${esc(it.name)}')">Устгах</button>`;

      const histBtn = `<button class="btn-mini hist" onclick="openItemHistory('${esc(it.name)}')">Түүх</button>`;

      return `
        <div class="items-row">
          <div class="items-no">${idx + 1}</div>
          <div class="items-name">${esc(it.name)}</div>
          <div class="items-sizes">${sizeList}</div>
          <div class="items-actions">${editBtn}${histBtn}${delBtn}</div>
        </div>
      `;
    })
    .join("");

  container.innerHTML = head + rows;
};

// -------------------------
// Item CRUD + history
// -------------------------
window.addItem = async () => {
  const name = document.getElementById("new-item-name")?.value?.trim() || "";
  const sizes = document.getElementById("new-item-sizes")?.value?.trim() || "";
  if (!name) return alert("Нэр оруулна уу!");

  showLoading(true);
  try {
    const r = await postJson({ action: "add_item", name, sizes });
    if (r.success) {
      document.getElementById("new-item-name").value = "";
      document.getElementById("new-item-sizes").value = "";
      await window.refreshData();
      alert("Бараа нэмэгдлээ");
    } else alert(r.msg || "Алдаа");
  } catch (e) {
    console.error(e);
    alert("Алдаа! (add_item)\n\n" + String(e.message || e));
  } finally {
    showLoading(false);
  }
};

window.openEditItem = (oldName, sizes) => {
  const html = `
    <div class="space-y-2">
      <label class="block text-sm">Барааны нэр</label>
      <input id="edit-item-name" value="${esc(oldName)}" />
      <label class="block text-sm mt-2">Размерууд (таслалаар)</label>
      <input id="edit-item-sizes" value="${esc(sizes || "")}" />
      <div class="mt-3 flex gap-2">
        <button class="btn-primary" onclick="saveEditItem('${esc(oldName)}')">Хадгалах</button>
        <button class="btn-reset" onclick="closeModal()">Болих</button>
      </div>
      <div class="mt-2 text-xs text-slate-500">
        ⚠️ Хэрвээ хүсэлт/олголт бүртгэгдсэн бараа бол засах боломжгүй.
      </div>
    </div>
  `;
  window.openModal("Бараа засах", html);
};

window.saveEditItem = async (oldName) => {
  const newName = document.getElementById("edit-item-name")?.value?.trim() || "";
  const sizes = document.getElementById("edit-item-sizes")?.value?.trim() || "";
  if (!newName) return alert("Нэр хоосон байна!");

  showLoading(true);
  try {
    const r = await postJson({ action: "update_item", oldName, newName, sizes });
    if (r.success) {
      window.closeModal();
      await window.refreshData();
      alert("Амжилттай засагдлаа");
    } else alert(r.msg || "Алдаа");
  } catch (e) {
    console.error(e);
    alert("Алдаа! (update_item)\n\n" + String(e.message || e));
  } finally {
    showLoading(false);
  }
};

window.deleteItem = async (name) => {
  if (!confirm(`"${name}" барааг устгах уу?`)) return;

  showLoading(true);
  try {
    const r = await postJson({ action: "delete_item", name });
    if (r.success) {
      await window.refreshData();
      alert("Устгагдлаа");
    } else alert(r.msg || "Алдаа");
  } catch (e) {
    console.error(e);
    alert("Алдаа! (delete_item)\n\n" + String(e.message || e));
  } finally {
    showLoading(false);
  }
};

window.openItemHistory = async (item) => {
  showLoading(true);
  try {
    const r = await postJson({ action: "get_item_history", item });
    if (!r.success) {
      alert(r.msg || "Алдаа");
      return;
    }

    const rows = (r.history || []).slice().reverse();

    const table = rows.length
      ? `
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-slate-500">
                <th class="p-2">Огноо</th>
                <th class="p-2">Код</th>
                <th class="p-2">Овог нэр</th>
                <th class="p-2">Размер</th>
                <th class="p-2">Тоо</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (h) => `
                <tr class="border-t">
                  <td class="p-2">${esc(formatDate(h.date))}</td>
                  <td class="p-2">${esc(h.code)}</td>
                  <td class="p-2">${esc(h.ovog)} ${esc(h.ner)}</td>
                  <td class="p-2">${esc(h.size || "ST")}</td>
                  <td class="p-2">${esc(h.qty)}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `
      : `<div class="p-2 text-slate-500">Олголтын түүх байхгүй</div>`;

    window.openModal(`Олголтын түүх • ${esc(item)}`, table);
  } catch (e) {
    console.error(e);
    alert("Алдаа! (get_item_history)\n\n" + String(e.message || e));
  } finally {
    showLoading(false);
  }
};

// Password
window.changePassword = async () => {
  const oldP = document.getElementById("old-pass")?.value || "";
  const newP = document.getElementById("new-pass")?.value || "";
  const confP = document.getElementById("confirm-pass")?.value || "";

  if (newP !== confP) return alert("Шинэ нууц үг зөрүүтэй байна!");

  showLoading(true);
  try {
    const r = await postJson({ action: "change_pass", code: currentUser.code, oldP, newP });
    if (r.success) alert("Амжилттай!");
    else alert(r.msg || "Алдаа");
  } catch (e) {
    console.error(e);
    alert("Алдаа! (change_pass)\n\n" + String(e.message || e));
  } finally {
    showLoading(false);
  }
};

window.logout = () => {
  localStorage.clear();
  location.reload();
};

// -------------------------
// Bootstrap
// -------------------------
window.onload = () => {
  setVH();
  currentUser = safeJsonParse(localStorage.getItem("ett_user"));
  if (currentUser) initApp();
  else document.getElementById("login-page")?.classList.remove("hidden");
};
