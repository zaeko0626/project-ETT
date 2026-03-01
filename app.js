const API_URL = "https://script.google.com/macros/s/AKfycbx1PPKNOHqOH6epWVK06G7no2d36A7LGQAhf-DigmIm-Zexun7FhnCXIQNu6RlAiIZc/exec";

let allOrders = [];
let allItems = [];
let currentUser = null;

/* ---------- Utilities ---------- */
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

function forceToLogin() {
  currentUser = null;
  localStorage.removeItem("ett_user");
  document.getElementById("main-page")?.classList.add("hidden");
  document.getElementById("login-page")?.classList.remove("hidden");
  showLoading(false);
}

/* ---------- Sidebar ---------- */
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

/* ---------- Labels ---------- */
function uiStatus(status) {
  if (status === "Зөвшөөрсөн") return "Олгосон";
  return status || "";
}

/* ---------- Header + Sidebar profile card ---------- */
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
  if (!nameEl || !idEl || !roleEl) return;

  if (!currentUser) {
    nameEl.innerText = "";
    idEl.innerText = "";
    roleEl.innerText = "";
    return;
  }

  if (currentUser.type === "admin") {
    nameEl.innerText = "АДМИНИСТРАТОР";
    idEl.innerText = "";
    roleEl.innerText = "";
    return;
  }

  const fullName = `${currentUser.ovog || ""} ${currentUser.ner || ""}`.trim();
  nameEl.innerText = fullName;
  idEl.innerText = `ID# ${currentUser.code || ""}`;
  roleEl.innerText = currentUser.role || "";
}

/* ---------- Modal ---------- */
window.openModal = (title, html) => {
  document.getElementById("modal-title").innerText = title;
  document.getElementById("modal-body").innerHTML = html;
  document.getElementById("modal-overlay").classList.remove("hidden");
};
window.closeModal = () => {
  document.getElementById("modal-overlay").classList.add("hidden");
  document.getElementById("modal-body").innerHTML = "";
};

/* ---------- Login ---------- */
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

/* ---------- Filters for orders ---------- */
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
  for (let m = 1; m <= 12; m++) mH += `<option value="${String(m).padStart(2, "0")}">${m} сар</option>`;

  yearSel.innerHTML = yH;
  monthSel.innerHTML = mH;
}

/* ---------- Data ---------- */
window.refreshData = async () => {
  showLoading(true);
  try {
    const data = await postJson({ action: "get_all_data" });
    if (data.success === false) { alert(data.msg || "Дата татахад алдаа"); return; }

    allOrders = data.orders || [];
    allItems = data.items || [];

    const filterItem = document.getElementById("filter-item");
    const reqItem = document.getElementById("req-item");

    if (filterItem) {
      let itH = `<option value="">Бүх бараа</option>`;
      allItems.forEach(it => { itH += `<option value="${it.name}">${it.name}</option>`; });
      filterItem.innerHTML = itH;
    }

    if (reqItem) {
      let reqH = `<option value="">Сонгох...</option>`;
      allItems.forEach(it => { reqH += `<option value="${it.name}">${it.name}</option>`; });
      reqItem.innerHTML = reqH;
    }

    window.updateSizeOptions();
    setupOrderFilters();
    window.applyFilters();

    const cnt = document.getElementById("items-count");
    if (cnt) cnt.innerText = `${allItems.length} бараа`;

    if (!document.getElementById("tab-items")?.classList.contains("hidden")) window.renderItemsList();

    setTimeout(setVH, 0);
  } catch (e) {
    console.error(e);
    alert("Өгөгдөл татахад алдаа гарлаа.");
    forceToLogin();
  } finally {
    showLoading(false);
  }
};

window.updateSizeOptions = () => {
  const name = document.getElementById("req-item")?.value || "";
  const select = document.getElementById("req-size");
  if (!select) return;

  if (!name) { select.innerHTML = `<option value="">Сонгох...</option>`; return; }

  const item = allItems.find(i => i.name === name);
  if (item && item.sizes) {
    select.innerHTML = item.sizes.split(",").map(s => s.trim()).filter(Boolean)
      .map(s => `<option value="${s}">${s}</option>`).join("") || `<option value="ST">Стандарт</option>`;
  } else select.innerHTML = `<option value="ST">Стандарт</option>`;
};

/* ---------- Orders ---------- */
window.applyFilters = () => {
  const nS = (document.getElementById("search-name")?.value || "").toLowerCase();
  const cS = (document.getElementById("search-code")?.value || "").trim();
  const rS = (document.getElementById("search-role")?.value || "").toLowerCase();

  const iF = document.getElementById("filter-item")?.value || "";
  const sF = document.getElementById("filter-status")?.value || "";
  const yF = document.getElementById("filter-year")?.value || "";
  const mF = document.getElementById("filter-month")?.value || "";

  const filtered = allOrders.filter(o => {
    const d = new Date(o.requestedDate);

    const mN = !nS || (o.ner && o.ner.toLowerCase().includes(nS)) || (o.ovog && o.ovog.toLowerCase().includes(nS));
    const mC = !cS || (o.code && String(o.code).includes(cS));
    const mR = !rS || (o.role && o.role.toLowerCase().includes(rS));

    const mI = !iF || o.item === iF;
    const mS = !sF || o.status === sF;

    const mY = !yF || (!isNaN(d) && String(d.getFullYear()) === yF);
    const mM = !mF || (!isNaN(d) && String(d.getMonth() + 1).padStart(2, "0") === mF);

    return mN && mC && mR && mI && mS && mY && mM;
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
        <button onclick="window.updateStatus('${o.id}', 'Зөвшөөрсөн')" class="flex-1 bg-green-600 text-white py-2 rounded-lg text-[8px] font-black uppercase">Олгох</button>
        <button onclick="window.updateStatus('${o.id}', 'Татгалзсан')" class="flex-1 bg-red-600 text-white py-2 rounded-lg text-[8px] font-black uppercase">Татгалзах</button>
      </div>
    ` : "";

    return `
      <div class="card animate-fade-in">
        <div class="flex justify-between items-start mb-3">
          <div>
            <div class="text-[10px] font-black uppercase text-slate-800">${o.ovog || ""} ${o.ner || ""}</div>
            <div class="text-[7px] font-bold text-blue-600 uppercase">${o.code || ""} • ${o.role || ""}</div>
          </div>
          <span class="badge ${sC}">${uiStatus(o.status)}</span>
        </div>

        <div class="bg-slate-50 p-3 rounded-xl flex justify-between items-center text-[9px] font-black">
          <div>${o.item || ""}</div>
          <div>${o.size || "ST"} / ${o.quantity ?? 1}ш</div>
        </div>

        ${adminActions}
      </div>
    `;
  }).join("");
}

window.updateStatus = async (id, status) => {
  showLoading(true);
  try {
    const idx = allOrders.findIndex(x => String(x.id) === String(id));
    if (idx >= 0) allOrders[idx].status = status;
    window.applyFilters();
  } catch {}

  try {
    const r = await postJson({ action: "update_status", id, status });
    if (!r.success) alert(r.msg || "Status update error");
    await window.refreshData();
  } catch (e) {
    console.error(e);
    alert("Алдаа! (update_status)");
    await window.refreshData();
  } finally {
    showLoading(false);
  }
};

/* ---------- Request ---------- */
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

/* ---------- Items (admin) ---------- */
function esc(s){
  return String(s || "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}
function escapeQuotes(s){
  return String(s).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

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
      <div class="hidden sm:block">Размер</div>
      <div>Үйлдэл</div>
    </div>
  `;

  const rows = filtered.map((it, idx) => {
    const sizes = (it.sizes || "").split(",").map(s => s.trim()).filter(Boolean);
    const sizeList = sizes.length
      ? sizes.map(s => `<span class="sz">${esc(s)}</span>`).join("")
      : `<span class="sz">ST</span>`;

    return `
      <div class="items-row animate-fade-in">
        <div class="items-no">${idx + 1}</div>

        <div class="min-w-0">
          <div class="items-name">${esc(it.name)}</div>
        </div>

        <div class="items-sizes hidden sm:block">
          ${sizeList}
        </div>

        <div class="items-actions">
          <button class="btn-mini edit" onclick="window.openItemEdit('${escapeQuotes(it.name || "")}')">Засах</button>
          <button class="btn-mini hist" onclick="window.openItemHistory('${escapeQuotes(it.name || "")}')">Түүх</button>
        </div>
      </div>
    `;
  }).join("");

  container.innerHTML = head + rows;
};

window.addItem = async () => {
  const name = (document.getElementById("new-item-name")?.value || "").trim();
  const sizes = (document.getElementById("new-item-sizes")?.value || "").trim();
  if (!name) return alert("Барааны нэр оруулна уу!");

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

window.openItemEdit = (oldName) => {
  const item = allItems.find(x => x.name === oldName);
  const html = `
    <div class="space-y-4">
      <div>
        <label class="filter-label">Барааны нэр</label>
        <input id="edit-item-name" value="${esc(item?.name || "")}">
      </div>
      <div>
        <label class="filter-label">Размерууд</label>
        <input id="edit-item-sizes" value="${esc(item?.sizes || "")}" placeholder="Ж: 38,39,40">
      </div>
      <button class="btn-primary bg-slate-800" onclick="window.saveItemEdit('${escapeQuotes(oldName)}')">Хадгалах</button>
    </div>
  `;
  window.openModal("Бараа засах", html);
};

window.saveItemEdit = async (oldName) => {
  const newName = (document.getElementById("edit-item-name")?.value || "").trim();
  const newSizes = (document.getElementById("edit-item-sizes")?.value || "").trim();
  if (!newName) return alert("Нэр хоосон байж болохгүй!");

  showLoading(true);
  try {
    const r = await postJson({ action: "update_item", oldName, newName, newSizes });
    if (r.success) {
      window.closeModal();
      await window.refreshData();
      alert("Амжилттай заслаа");
    } else alert(r.msg || "Алдаа");
  } catch (e) {
    console.error(e);
    alert("Алдаа! (update_item)");
  } finally {
    showLoading(false);
  }
};

window.openItemHistory = async (itemName) => {
  showLoading(true);
  try {
    const r = await postJson({ action: "get_item_history", item: itemName });
    if (!r.success) { alert(r.msg || "Алдаа"); return; }

    const rows = r.history || [];
    const body = rows.length ? `
      <div class="text-[11px] font-black uppercase text-slate-800 mb-4">${esc(itemName)}</div>
      <div class="space-y-2">
        ${rows.map(h => `
          <div class="p-3 rounded-xl border border-slate-200 bg-slate-50">
            <div class="flex justify-between items-center">
              <div class="font-black text-[10px] uppercase text-slate-800">${esc(h.lastname || "")} ${esc(h.name || "")}</div>
              <div class="text-[9px] font-black text-slate-500">${new Date(h.date).toLocaleDateString()}</div>
            </div>
            <div class="text-[9px] font-bold text-blue-600 uppercase mt-1">${esc(h.code || "")} • ${esc(h.role || "")}</div>
            <div class="text-[10px] font-black text-slate-800 mt-2">${esc(h.size || "ST")} / ${h.qty ?? 1}ш</div>
          </div>
        `).join("")}
      </div>
    ` : `<div class="text-center text-[10px] font-black text-slate-400 uppercase italic">Олгосон түүх байхгүй</div>`;

    window.openModal("Хувцас олгосон түүх", body);
  } catch (e) {
    console.error(e);
    alert("Алдаа! (get_item_history)");
  } finally {
    showLoading(false);
  }
};

/* ---------- Profile ---------- */
window.changePassword = async () => {
  const oldP = document.getElementById("old-pass")?.value || "";
  const newP = document.getElementById("new-pass")?.value || "";
  const confP = document.getElementById("confirm-pass")?.value || "";
  if (newP !== confP) return alert("Шинэ нууц үг зөрүүтэй байна!");

  showLoading(true);
  try {
    const r = await postJson({ action: "change_pass", code: currentUser.code, oldP, newP });
    alert(r.success ? "Амжилттай!" : (r.msg || "Алдаа"));
  } catch (e) {
    console.error(e);
    alert("Алдаа! (change_pass)");
  } finally {
    showLoading(false);
  }
};

window.logout = () => {
  localStorage.removeItem("ett_user");
  location.reload();
};

/* ---------- Boot ---------- */
window.onload = () => {
  setVH();
  showLoading(false);

  const stored = localStorage.getItem("ett_user");
  if (!stored) {
    document.getElementById("login-page")?.classList.remove("hidden");
    return;
  }

  const parsed = safeJsonParse(stored);
  if (!parsed || !parsed.code) {
    forceToLogin();
    return;
  }

  currentUser = parsed;
  initApp();
};
