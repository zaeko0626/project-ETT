const API_URL = "https://script.google.com/macros/s/AKfycbz0x6Xv9a9_A0DqTPOI4aPH6JpA91efnomjnA2v6zzxz19HbHSg_0eDPTwSaWU1XDOk/exec";

let allOrders = [];
let allItems = [];
let currentUser = null;

function setVH() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}
window.addEventListener('resize', setVH);
window.addEventListener('orientationchange', () => setTimeout(setVH, 200));

window.openSidebar = () => {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('show');
};
window.closeSidebar = () => {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('show');
};
window.toggleSidebar = () => {
  const isOpen = document.getElementById('sidebar').classList.contains('open');
  isOpen ? window.closeSidebar() : window.openSidebar();
};

window.showTab = (tabName, btn) => {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
  document.getElementById('tab-' + tabName).classList.remove('hidden');

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  setTimeout(setVH, 0);
  if (window.innerWidth < 1024) window.closeSidebar();
};

function showLoading(show) {
  const el = document.getElementById('loading-overlay');
  if (!el) return;
  el.classList.toggle('hidden', !show);
}

function safeJsonParse(str) { try { return JSON.parse(str); } catch { return null; } }

async function postJson(payload) {
  const res = await fetch(API_URL, { method: "POST", body: JSON.stringify(payload) });
  const text = await res.text();
  const json = safeJsonParse(text);
  if (!json) { console.error("API non-JSON:", text); throw new Error("API non-JSON"); }
  return json;
}

function forceToLogin() {
  currentUser = null;
  localStorage.removeItem('ett_user');
  document.getElementById('main-page')?.classList.add('hidden');
  document.getElementById('login-page')?.classList.remove('hidden');
  showLoading(false);
}

/* ✅ Sidebar employee/admin card */
function updateSidebarUserCard() {
  const nameEl = document.getElementById('sb-name');
  const idEl = document.getElementById('sb-id');
  const roleEl = document.getElementById('sb-role');
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

/* ✅ Header subtitle (ETT PPE System доорх нэр) */
function updateHeaderSubtitle() {
  const el = document.getElementById('user-display-name');
  if (!el) return;

  // ажилтан дээр бүр алга болгоно
  if (currentUser && currentUser.type !== "admin") {
    el.innerText = "";
    el.classList.add('hidden');
    return;
  }

  // admin дээр хүсвэл харагдуулна (эсвэл хоосон байлгаж болно)
  if (currentUser && currentUser.type === "admin") {
    el.classList.remove('hidden');
    el.innerText = "АДМИНИСТРАТОР";
    return;
  }

  el.innerText = "";
  el.classList.add('hidden');
}

window.handleLogin = async () => {
  const code = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value.trim();

  showLoading(true);
  try {
    const result = await postJson({ action: "login", code, pass });
    if (result.success) {
      currentUser = result.user;
      localStorage.setItem('ett_user', JSON.stringify(currentUser));
      initApp();
    } else alert(result.msg || "Нэвтрэхэд алдаа");
  } catch (e) {
    console.error(e);
    alert("API хүрэхгүй байна (login) эсвэл JSON биш.");
  } finally {
    showLoading(false);
  }
};

function initApp() {
  document.getElementById('login-page').classList.add('hidden');
  document.getElementById('main-page').classList.remove('hidden');

  updateHeaderSubtitle();
  updateSidebarUserCard();

  if (currentUser && currentUser.type === 'admin') {
    document.getElementById('nav-request')?.classList.add('hidden');
    document.getElementById('nav-admin')?.classList.remove('hidden');
  } else {
    document.getElementById('nav-request')?.classList.remove('hidden');
    document.getElementById('nav-admin')?.classList.add('hidden');
  }

  window.refreshData();
  setTimeout(setVH, 0);
}

/* (Доорх хэсгүүд чинь өмнөхтэй адил ажиллана) */
function setupFilters() {
  const years = new Set();
  allOrders.forEach(o => {
    const d = new Date(o.requestedDate);
    if (!isNaN(d)) years.add(d.getFullYear());
  });

  const sortedYears = [...years].sort((a,b)=>a-b);
  let yH = '<option value="">БҮХ ОН</option>';
  (sortedYears.length ? sortedYears : [new Date().getFullYear()]).forEach(y => {
    yH += `<option value="${y}">${y}</option>`;
  });

  let mH = '<option value="">БҮХ САР</option>';
  for (let m = 1; m <= 12; m++) {
    mH += `<option value="${m.toString().padStart(2,'0')}">${m} сар</option>`;
  }

  document.getElementById('filter-year').innerHTML = yH;
  document.getElementById('filter-month').innerHTML = mH;
}

function uiStatus(status) {
  if (status === "Зөвшөөрсөн") return "Олгосон";
  return status;
}

window.refreshData = async () => {
  showLoading(true);
  try {
    const data = await postJson({ action: "get_all_data" });
    if (data.success === false) { alert(data.msg || "Дата татахад алдаа"); return; }

    allOrders = data.orders || [];
    allItems = data.items || [];

    let itH = '<option value="">Бүх бараа</option>';
    let reqH = '<option value="">Сонгох...</option>';
    allItems.forEach(it => {
      itH += `<option value="${it.name}">${it.name}</option>`;
      reqH += `<option value="${it.name}">${it.name}</option>`;
    });

    document.getElementById('filter-item').innerHTML = itH;
    document.getElementById('req-item').innerHTML = reqH;

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
  const name = document.getElementById('req-item')?.value;
  const select = document.getElementById('req-size');
  if (!select) return;

  if (!name) { select.innerHTML = '<option value="">Сонгох...</option>'; return
