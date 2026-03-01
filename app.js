const API_URL = "https://script.google.com/macros/s/AKfycbxPY3DH4VWYxzp-5E3EOlSnVn1_3Oj-nVoAEJcve4v0hHhVW05cryp0aSknVrwFxCBV/exec";

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

function showLoading(show) {
  const el = document.getElementById("loading-overlay");
  if (!el) return;
  el.classList.toggle("hidden", !show);
}

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

async function postJson(payload) {
  const res = await fetch(API_URL, { method: "POST", body: JSON.stringify(payload) });
  const text = await res.text();
  const json = safeJsonParse(text);
  if (!json) {
    console.error("API non-JSON response:", text);
    throw new Error("API returned non-JSON");
  }
  return json;
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
};

/* ---------- UI labels ---------- */
function uiStatus(status) {
  if (status === "Зөвшөөрсөн") return "Олгосон";
  return status || "";
}

/* ---------- Header + Sidebar profile card ---------- */
function updateHeaderSubtitle() {
  const el = document.getElementById("user-display-name");
  if (!el) return;

  // ✅ Ажилтан талд ETT PPE SYSTEM-ийн доорх нэрийг бүр нуух
  if (currentUser && currentUser.type !== "admin") {
    el.innerText = "";
    el.classList.add("hidden");
    return;
  }

  // Admin дээр хүсвэл "АДМИНИСТРАТОР" гэж гаргана
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
    } else {
      alert(result.msg || "Код эсвэл нууц үг буруу байна");
    }
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

  // admin/user nav
  if (currentUser?.type === "admin") {
    document.getElementById("nav-request")?.classList.add("hidden");
    document.getElementById("nav-admin")?.classList.remove("hidden");
  } else {
    document.getElementById("nav-request")?.classList.remove("hidden");
    document.getElementById("nav-admin")?.classList.add("hidden");
  }

  window.refreshData();
  setTimeout(setVH, 0);
}

/* ---------- Filters ---------- */
function setupFilters() {
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
    mH += `<option value="${String(m).padStart(2, "0")}">${m} сар</option>`;
  }

  yearSel.innerHTML = yH;
  monthSel.innerHTML = mH;
}

/* ---------- Data ---------- */
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

    // populate item filters
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
    setupFilters();
    window.applyFilters();
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

  if (!name) {
    select.innerHTML = `<option value="">Сонгох...</option>`;
    return;
  }

  const item = allItems.find(i => i.name === name);
  if (item && item.sizes) {
    const opts = item.sizes
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => `<option value="${s}">${s}</option>`)
      .join("");
    select.innerHTML = opts || `<option value="ST">Стандарт</option>`;
  } else {
    select.innerHTML = `<option value="ST">Стандарт</option>`;
  }
};

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

/* ---------- Render list ---------- */
function renderOrders(orders) {
  const container = document.getElementById("orders-list-container");
  if (!container) return;

  if (!orders.length) {
    container.innerHTML = `<div class="text-center p-10 text-[9px] font-black text-slate-400 uppercase italic">Мэдээлэл олдсонгүй</div>`;
    return;
  }

  container.innerHTML = orders
    .slice()
    .reverse()
    .map(o => {
      let sC = "bg-amber-100 text-amber-700";
      if (o.status === "Зөвшөөрсөн") sC = "bg-green-100 text-green-700";
      if (o.status === "Татгалзсан") sC = "bg-red-100 text-red-700";

      // ✅ товч зөвхөн "Хүлээгдэж буй" үед харагдана
      const shouldShowActions = (currentUser?.type === "admin" && o.status === "Хүлээгдэж буй");

      const adminActions = shouldShowActions
        ? `
          <div class="flex gap-2 mt-4 pt-4 border-t border-slate-100">
            <button onclick="window.updateStatus('${o.id}', 'Зөвшөөрсөн')" class="flex-1 bg-green-600 text-white py-2 rounded-lg text-[8px] font-black uppercase">Олгох</button>
            <button onclick="window.updateStatus('${o.id}', 'Татгалзсан')" class="flex-1 bg-red-600 text-white py-2 rounded-lg text-[8px] font-black uppercase">Татгалзах</button>
          </div>
        `
        : "";

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
    })
    .join("");
}

/* ---------- Update status ---------- */
window.updateStatus = async (id, status) => {
  showLoading(true);

  // optimistic UI
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

/* ---------- Change password ---------- */
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
