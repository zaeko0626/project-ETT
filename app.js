const API_URL = "PUT_YOUR_SCRIPT_WEBAPP_URL_HERE";

let allOrders = [];
let allItems = [];
let currentUser = null;

function setVH() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty("--vh", `${vh}px`);
}
window.addEventListener("resize", setVH);
window.addEventListener("orientationchange", () => setTimeout(setVH, 200));

function safeJsonParse(str) { try { return JSON.parse(str); } catch { return null; } }

async function postJson(payload) {
  const res = await fetch(API_URL, { method: "POST", body: JSON.stringify(payload) });
  const text = await res.text();
  const json = safeJsonParse(text);
  if (!json) { console.error("API non-JSON:", text); throw new Error("API non-JSON"); }
  return json;
}

function showLoading(show) {
  const el = document.getElementById("loading-overlay");
  if (!el) return;
  el.classList.toggle("hidden", !show);
}

/* Sidebar */
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
  document.querySelectorAll(".tab-content").forEach(t => t.classList.add("hidden"));
  document.getElementById("tab-" + tabName)?.classList.remove("hidden");
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  setTimeout(setVH, 0);
  if (window.innerWidth < 1024) window.closeSidebar();
  if (tabName === "items") window.renderItemsList();
};

/* Modal */
window.openModal = (title, html) => {
  document.getElementById("modal-title").innerText = title;
  document.getElementById("modal-body").innerHTML = html;
  document.getElementById("modal-overlay").classList.remove("hidden");
};
window.closeModal = () => {
  document.getElementById("modal-overlay").classList.add("hidden");
  document.getElementById("modal-body").innerHTML = "";
};

function uiStatus(status) {
  if (status === "Зөвшөөрсөн") return "Олгосон";
  return status || "";
}

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

/* Login */
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
    } else alert(result.msg || "Код эсвэл нууц үг буруу байна");
  } catch (e) {
    console.error(e);
    alert("Нэвтрэх үед алдаа гарлаа (API/JSON).");
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

/* Data refresh */
window.refreshData = async () => {
  showLoading(true);
  try {
    const data = await postJson({ action: "get_all_data" });
    if (data.success === false) { alert(data.msg || "Дата татахад алдаа"); return; }

    allOrders = data.orders || [];
    allItems = data.items || [];

    // Orders item filter
    const filterItem = document.getElementById("filter-item");
    const reqItem = document.getElementById("req-item");

    if (filterItem) {
      let itH = `<option value="">Бүх бараа</option>`;
      allItems.forEach(it => { itH += `<option value="${esc(it.name)}">${esc(it.name)}</option>`; });
      filterItem.innerHTML = itH;
    }
    if (reqItem) {
      let reqH = `<option value="">Сонгох...</option>`;
      allItems.forEach(it => { reqH += `<option value="${esc(it.name)}">${esc(it.name)}</option>`; });
      reqItem.innerHTML = reqH;
    }

    window.updateSizeOptions();
    setupOrderFilters();
    setupEmployeeFilters(); // ✅ Place/Dept/Shift
    window.applyFilters();

    const cnt = document.getElementById("items-count");
    if (cnt) cnt.innerText = `${allItems.length} бараа`;

    if (!document.getElementById("tab-items")?.classList.contains("hidden")) window.renderItemsList();
    setTimeout(setVH, 0);
  } catch (e) {
    console.error(e);
    alert("Өгөгдөл татахад алдаа гарлаа.");
  } finally {
    showLoading(false);
  }
};

function setupOrderFilters() {
  const yearSel = document.getElementById("filter-year");
  const monthSel = document.getElementById("filter-month");
  if (!yearSel || !monthSel) return;

  const years = new Set();
  allOrders.forEach(o => {
    const d = new Date(o.requestedDate);
    if (!isNaN(d)) years.add(d.getFullYear());
  });
  const sortedYears = [...years].sort((a, b) => a - b);
  let yH = `<option value="">БҮХ ОН</option>`;
  (sortedYears.length ? sortedYears : [new Date().getFullYear()]).forEach(y => {
    yH += `<option value="${y}">${y}</option>`;
  });

  let mH = `<option value="">БҮХ САР</option>`;
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, "0");
    mH += `<option value="${mm}">${m} сар</option>`;
  }
  yearSel.innerHTML = yH;
  monthSel.innerHTML = mH;
}

/* ✅ Employee filters (Place -> Dept cascading) */
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

  const sortedPlaces = [...places].sort((a,b)=>a.localeCompare(b));
  const sortedDepts = [...depts].sort((a,b)=>a.localeCompare(b));

  placeSel.innerHTML = `<option value="">БҮХ ГАЗАР</option>` + sortedPlaces.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join("");
  deptSel.innerHTML = `<option value="">БҮХ ХЭЛТЭС</option>` + sortedDepts.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join("");
  shiftSel.innerHTML = `<option value="">БҮХ ЭЭЛЖ</option>` + SHIFT_OPTIONS.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
}

window.onPlaceChange = () => {
  const placeSel = document.getElementById("filter-place");
  const deptSel = document.getElementById("filter-dept");
  if (!placeSel || !deptSel) return;

  const place = placeSel.value || "";
  const depts = new Set();
  allOrders.forEach(o => {
    if (!o.department) return;
    if (!place) { depts.add(o.department); return; }
    if ((o.place || "") === place) depts.add(o.department);
  });

  const sortedDepts = [...depts].sort((a,b)=>a.localeCompare(b));
  deptSel.innerHTML = `<option value="">БҮХ ХЭЛТЭС</option>` + sortedDepts.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join("");
  window.applyFilters();
};

/* Request size options */
window.updateSizeOptions = () => {
  const name = document.getElementById("req-item")?.value || "";
  const select = document.getElementById("req-size");
  if (!select) return;
  if (!name) { select.innerHTML = `<option value="">Сонгох...</option>`; return; }
  const item = allItems.find(i => i.name === name);
  if (item && item.sizes) {
    const opts = item.sizes.split(",").map(s => s.trim()).filter(Boolean)
      .map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
    select.innerHTML = opts || `<option value="ST">Стандарт</option>`;
  } else {
    select.innerHTML = `<option value="ST">Стандарт</option>`;
  }
};

/* Orders filter */
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

  const filtered = allOrders.filter(o => {
    const d = new Date(o.requestedDate);

    const mN = !nS || (o.ner && o.ner.toLowerCase().includes(nS)) || (o.ovog && o.ovog.toLowerCase().includes(nS));
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
    container.innerHTML = `<div class="text-center p-10 text-[9px] font-black text-slate-400 uppercase italic">Мэдээлэл олдсонгүй</div>`;
    return;
  }

  container.innerHTML = orders.slice().reverse().map(o => {
    let sC = "bg-amber-100 text-amber-700";
    if (o.status === "Зөвшөөрсөн") sC = "bg-green-100 text-green-700";
    if (o.status === "Татгалзсан") sC = "bg-red-100 text-red-700";

    const shouldShowActions = (currentUser?.type === "admin" && o.status === "Хүлээгдэж буй");
    const adminActions = shouldShowActions ? `
      <div class="flex gap-2 mt-4 pt-4 border-t border-slate-100">
        <button onclick="window.updateStatus('${escAttr(o.id)}', 'Зөвшөөрсөн')" class="flex-1 bg-green-600 text-white py-2 rounded-lg text-[8px] font-black uppercase">Олгох</button>
        <button onclick="window.updateStatus('${escAttr(o.id)}', 'Татгалзсан')" class="flex-1 bg-red-600 text-white py-2 rounded-lg text-[8px] font-black uppercase">Татгалзах</button>
      </div>
    ` : "";

    return `
      <div class="card animate-fade-in">
        <div class="flex justify-between items-start mb-3">
          <div>
            <div class="text-[10px] font-black uppercase text-slate-800">${esc(o.ovog)} ${esc(o.ner)}</div>
            <div class="text-[7px] font-bold text-blue-600 uppercase">${esc(o.code)} • ${esc(o.role)}</div>
            <div class="text-[7px] font-bold text-slate-400 uppercase mt-1">${esc(o.place)} • ${esc(o.department)} • ${esc(o.shift)}</div>
          </div>
          <span class="badge ${sC}">${uiStatus(o.status)}</span>
        </div>

        <div class="bg-slate-50 p-3 rounded-xl flex justify-between items-center text-[9px] font-black">
          <div>${esc(o.item)}</div>
          <div>${esc(o.size || "ST")} / ${o.quantity ?? 1}ш</div>
        </div>

        ${adminActions}
      </div>
    `;
  }).join("");
}

window.updateStatus = async (id, status) => {
  showLoading(true);
  try {
    const r = await postJson({ action: "update_status", id, status });
    if (!r.success) alert(r.msg || "Status update error");
    await window.refreshData();
  } catch (e) {
    console.error(e);
    alert("Алдаа! (update_status)");
  } finally {
    showLoading(false);
  }
};

/* Request submit */
window.submitRequest = async () => {
  const item = document.getElementById("req-item")?.value || "";
  const size = document.getElementById("req-size")?.value || "";
  const qty = document.getElementById("req-qty")?.value || 1;
  if (!item || !size) return alert("Бүрэн бөглөнө үү!");
  showLoading(true);
  try {
    const r = await postJson({ action: "add_order", code: currentUser.code, item, size, qty });
    if (r.success) {
      alert("Хүсэлт илгээгдлээ!");
      await window.refreshData();
      const firstBtn = document.querySelector(".nav-btn");
      window.showTab("orders", firstBtn);
    } else alert(r.msg || "Алдаа");
  } catch (e) {
    console.error(e);
    alert("Алдаа! (add_order)");
  } finally {
    showLoading(false);
  }
};

/* Items admin */
window.renderItemsList = () => {
  const container = document.getElementById("items-list-container");
  if (!container) return;

  const q = (document.getElementById("items-filter")?.value || "").trim().toLowerCase();
  const filtered = allItems.filter(it => {
    if (!q) return true;
    const hay = `${it.name || ""} ${(it.sizes || "")}`.toLowerCase();
    return hay.includes(q);
  });

  const cnt = document.getElementById("items-count");
  if (cnt) cnt.innerText = `${filtered.length} бараа`;

  if (!filtered.length) {
    container.innerHTML = `<div class="text-center p-10 text-[9px] font-black text-slate-400 uppercase italic">Бараа олдсонгүй</div>`;
    return;
  }

  const head = `
    <div class="items-head">
      <div>#</div>
      <div>Бараа</div>
      <div>Размер</div>
      <div class="text-right">Үйлдэл</div>
    </div>
  `;

  const rows = filtered.map((it, idx) => {
    const sizes = (it.sizes || "").split(",").map(s => s.trim()).filter(Boolean);
    const sizeList = sizes.length
      ? sizes.map(s => `<span class="sz">${esc(s)}</span>`).join("")
      : `<span class="sz">ST</span>`;

    const locked = !!it.locked;
    const lockMsg = "Энэ бараагаар хүсэлт/олголт бүртгэгдсэн тул засах/устгах боломжгүй.";

    const editBtn = locked
      ? `<button class="btn-mini edit disabled" onclick="alert('${lockMsg}')">Засах</button>`
      : `<button class="btn-mini edit" onclick="window.openEditItem('${escAttr(it.name)}','${escAttr(it.sizes || "")}')">Засах</button>`;

    const delBtn = locked
      ? `<button class="btn-mini del disabled" onclick="alert('${lockMsg}')">Устгах</button>`
      : `<button class="btn-mini del" onclick="window.deleteItem('${escAttr(it.name)}')">Устгах</button>`;

    const histBtn = `<button class="btn-mini hist" onclick="window.openItemHistory('${escAttr(it.name)}')">Түүх</button>`;

    return `
      <div class="items-row">
        <div class="items-no">${idx + 1}</div>
        <div class="items-name">${esc(it.name)}</div>
        <div class="items-sizes">${sizeList}</div>
        <div class="items-actions">${editBtn}${histBtn}${delBtn}</div>
      </div>
    `;
  }).join("");

  container.innerHTML = head + rows;
};

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
    alert("Алдаа! (add_item)");
  } finally {
    showLoading(false);
  }
};

window.openEditItem = (oldName, sizes) => {
  const html = `
    <div class="space-y-4">
      <div>
        <label class="filter-label">Барааны нэр</label>
        <input id="edit-item-name" value="${escAttr(oldName)}" />
      </div>
      <div>
        <label class="filter-label">Размерууд (таслалаар)</label>
        <input id="edit-item-sizes" value="${escAttr(sizes || "")}" />
      </div>
      <div class="flex gap-2">
        <button class="btn-primary" onclick="window.saveEditItem('${escAttr(oldName)}')">Хадгалах</button>
        <button class="btn-primary bg-slate-800" onclick="window.closeModal()">Болих</button>
      </div>
      <div class="text-[10px] font-bold text-slate-500">⚠️ Хэрвээ хүсэлт/олголт бүртгэгдсэн бараа бол засах боломжгүй.</div>
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
    alert("Алдаа! (update_item)");
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
    alert("Алдаа! (delete_item)");
  } finally {
    showLoading(false);
  }
};

/* ✅ Item history: Size & Qty тусдаа багана */
window.openItemHistory = async (item) => {
  showLoading(true);
  try {
    const r = await postJson({ action: "get_item_history", item });
    if (!r.success) { alert(r.msg || "Алдаа"); return; }

    const rows = (r.history || []).slice().reverse();
    const table = rows.length ? `
      <div class="overflow-x-auto">
        <table class="w-full text-[11px]">
          <thead>
            <tr class="text-left text-slate-500 uppercase text-[10px]">
              <th class="py-2 pr-3">Огноо</th>
              <th class="py-2 pr-3">Код</th>
              <th class="py-2 pr-3">Овог нэр</th>
              <th class="py-2 pr-3">Размер</th>
              <th class="py-2 pr-3">Тоо</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(h => `
              <tr class="border-t">
                <td class="py-2 pr-3">${formatDate(h.date)}</td>
                <td class="py-2 pr-3 font-black">${esc(h.code)}</td>
                <td class="py-2 pr-3">${esc(h.ovog)} ${esc(h.ner)}</td>
                <td class="py-2 pr-3 font-black text-blue-700">${esc(h.size || "ST")}</td>
                <td class="py-2 pr-3 font-black text-slate-800">${esc(h.qty)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    ` : `<div class="text-center text-slate-400 font-bold italic text-[12px]">Олголтын түүх байхгүй</div>`;

    window.openModal(`Олголтын түүх • ${item}`, table);
  } catch (e) {
    console.error(e);
    alert("Алдаа! (get_item_history)");
  } finally {
    showLoading(false);
  }
};

/* Password */
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
    alert("Алдаа! (change_pass)");
  } finally {
    showLoading(false);
  }
};

window.logout = () => { localStorage.clear(); location.reload(); };

/* Utils */
function esc(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}
function escAttr(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}
function formatDate(dt){
  try{
    const d = new Date(dt);
    if (isNaN(d)) return "";
    return d.toLocaleDateString();
  } catch { return ""; }
}

window.onload = () => {
  setVH();
  currentUser = safeJsonParse(localStorage.getItem("ett_user"));
  if (currentUser) initApp();
  else document.getElementById("login-page")?.classList.remove("hidden");
};
