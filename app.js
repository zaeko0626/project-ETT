// ✅ 1) API URL: Apps Script Web App URL-ээ энд тавина
const API_URL = "https://script.google.com/macros/s/AKfycbx1iUbzrQIlb-Smh8mMq8gLh5YyTkeUQGha1ir1_mprxddjxQzsX6v1DcD4glhOAjPh/exec";

let allOrders = [];
let allItems = [];
let currentUser = null;

// --------------------
// Sidebar controls (toggle bug fix included)
// --------------------
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

// --------------------
// Tabs
// --------------------
window.showTab = (tabName, btn) => {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
  document.getElementById('tab-' + tabName).classList.remove('hidden');

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  if (window.innerWidth < 1024) window.closeSidebar(); // ✅ no toggle surprise
};

// --------------------
// Loading
// --------------------
function showLoading(show) {
  document.getElementById('loading-overlay').classList.toggle('hidden', !show);
}

// --------------------
// Login
// --------------------
window.handleLogin = async () => {
  const code = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value.trim();

  showLoading(true);
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: "login", code, pass })
    });
    const result = await res.json();

    if (result.success) {
      currentUser = result.user;
      localStorage.setItem('ett_user', JSON.stringify(currentUser));
      initApp();
    } else {
      alert(result.msg || "Нэвтрэхэд алдаа гарлаа");
    }
  } catch (e) {
    alert("Алдаа! (fetch/login)");
  }
  showLoading(false);
};

function initApp() {
  document.getElementById('login-page').classList.add('hidden');
  document.getElementById('main-page').classList.remove('hidden');

  document.getElementById('user-display-name').innerText =
    currentUser.ovog ? `${currentUser.ovog} ${currentUser.ner}` : currentUser.ner;

  if (currentUser.type === 'admin') {
    document.getElementById('nav-request').classList.add('hidden');
    document.getElementById('nav-admin').classList.remove('hidden');
  } else {
    document.getElementById('nav-request').classList.remove('hidden');
    document.getElementById('nav-admin').classList.add('hidden');
  }

  window.refreshData();
}

// --------------------
// Filters (built after data fetched)
// --------------------
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

// --------------------
// Data refresh
// --------------------
window.refreshData = async () => {
  showLoading(true);
  try {
    const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "get_all_data" }) });
    const data = await res.json();

    if (!data.success && data.success !== undefined) {
      alert(data.msg || "Дата татахад алдаа");
      showLoading(false);
      return;
    }

    allOrders = data.orders || [];
    allItems = data.items || [];

    // Build item dropdowns
    let itH = '<option value="">Бүх бараа</option>';
    let reqH = '<option value="">Сонгох...</option>';

    allItems.forEach(it => {
      itH += `<option value="${it.name}">${it.name}</option>`;
      reqH += `<option value="${it.name}">${it.name}</option>`;
    });

    document.getElementById('filter-item').innerHTML = itH;
    document.getElementById('req-item').innerHTML = reqH;

    window.updateSizeOptions(); // ✅ prevent empty size dropdown
    setupFilters();
    window.applyFilters();

  } catch (e) {
    alert("Алдаа! (fetch/get_all_data)");
  }
  showLoading(false);
};

// --------------------
// Request sizes
// --------------------
window.updateSizeOptions = () => {
  const name = document.getElementById('req-item').value;
  const select = document.getElementById('req-size');

  if (!name) {
    select.innerHTML = '<option value="">Сонгох...</option>';
    return;
  }

  const item = allItems.find(i => i.name === name);
  if (item && item.sizes) {
    select.innerHTML = item.sizes
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => `<option value="${s}">${s}</option>`)
      .join('');
  } else {
    select.innerHTML = '<option value="ST">Стандарт</option>';
  }
};

// --------------------
// Apply filters
// --------------------
window.applyFilters = () => {
  const nS = document.getElementById('search-name').value.toLowerCase();
  const cS = document.getElementById('search-code').value.trim();
  const rS = document.getElementById('search-role').value.toLowerCase();
  const iF = document.getElementById('filter-item').value;
  const sF = document.getElementById('filter-status').value;
  const yF = document.getElementById('filter-year').value;
  const mF = document.getElementById('filter-month').value;

  const filtered = allOrders.filter(o => {
    const d = new Date(o.requestedDate);
    const mN = !nS || (o.ner && o.ner.toLowerCase().includes(nS)) || (o.ovog && o.ovog.toLowerCase().includes(nS));
    const mC = !cS || (o.code && o.code.toString().includes(cS));
    const mR = !rS || (o.role && o.role.toLowerCase().includes(rS));
    const mI = !iF || o.item === iF;
    const mS = !sF || o.status === sF;
    const mY = !yF || (!isNaN(d) && d.getFullYear().toString() === yF);
    const mM = !mF || (!isNaN(d) && (d.getMonth()+1).toString().padStart(2,'0') === mF);
    return mN && mC && mR && mI && mS && mY && mM;
  });

  renderOrders(filtered);
};

function renderOrders(orders) {
  const container = document.getElementById('orders-list-container');

  container.innerHTML = orders.length
    ? orders.slice().reverse().map(o => {
      let sC = "bg-amber-100 text-amber-700";
      if (o.status === 'Зөвшөөрсөн') sC = "bg-green-100 text-green-700";
      if (o.status === 'Татгалзсан') sC = "bg-red-100 text-red-700";

      const adminActions = currentUser.type === 'admin'
        ? `
          <div class="flex gap-2 mt-4 pt-4 border-t border-slate-100">
            <button onclick="window.updateStatus('${o.id}', 'Зөвшөөрсөн')" class="flex-1 bg-green-600 text-white py-2 rounded-lg text-[8px] font-black uppercase">Зөвшөөрөх</button>
            <button onclick="window.updateStatus('${o.id}', 'Татгалзсан')" class="flex-1 bg-red-600 text-white py-2 rounded-lg text-[8px] font-black uppercase">Татгалзах</button>
          </div>
        `
        : '';

      return `
        <div class="card animate-fade-in">
          <div class="flex justify-between items-start mb-3">
            <div>
              <div class="text-[10px] font-black uppercase text-slate-800">${o.ovog || ""} ${o.ner || ""}</div>
              <div class="text-[7px] font-bold text-blue-600 uppercase">${o.code || ""} • ${o.role || ""}</div>
            </div>
            <span class="badge ${sC}">${o.status || ""}</span>
          </div>
          <div class="bg-slate-50 p-3 rounded-xl flex justify-between items-center text-[9px] font-black">
            <div>${o.item || ""}</div>
            <div>${o.size || "ST"} / ${(o.quantity ?? 1)}ш</div>
          </div>
          ${adminActions}
        </div>
      `;
    }).join('')
    : '<div class="text-center p-10 text-[9px] font-black text-slate-400 uppercase italic">Мэдээлэл олдсонгүй</div>';
}

// --------------------
// Admin update status
// --------------------
window.updateStatus = async (id, status) => {
  showLoading(true);
  try {
    const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "update_status", id, status }) });
    const r = await res.json();
    if (r.success) window.refreshData();
    else alert(r.msg || "Status update error");
  } catch(e) {
    alert("Алдаа! (update_status)");
  }
  showLoading(false);
};

// --------------------
// Employee history (Admin)
// --------------------
window.fetchEmpHistory = async () => {
  const code = document.getElementById('hist-search-code').value.trim();
  if (!code) return alert("Код оруулна уу!");

  showLoading(true);
  try {
    const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "get_employee_history", empCode: code }) });
    const r = await res.json();

    if (r.success) {
      document.getElementById('emp-details-card').classList.remove('hidden');
      document.getElementById('hist-full-name').innerText = `${r.user.ovog} ${r.user.ner}`;
      document.getElementById('hist-role').innerText = `${r.user.code} | ${r.user.role}`;

      document.getElementById('hist-items-container').innerHTML =
        r.history.length
          ? r.history.map(h => `
            <div class="flex justify-between items-center p-2 bg-slate-50 rounded-lg text-[9px] font-bold">
              <div>${h.item} <span class="text-slate-400 ml-2">${new Date(h.date).toLocaleDateString()}</span></div>
              <div class="text-blue-600">${h.size} / ${h.qty}ш</div>
            </div>
          `).join('')
          : '<div class="text-center text-[8px] text-slate-400 italic">Түүх байхгүй</div>';
    } else {
      alert(r.msg || "Түүх татахад алдаа");
    }
  } catch (e) {
    alert("Алдаа! (get_employee_history)");
  }
  showLoading(false);
};

// --------------------
// Submit request
// --------------------
window.submitRequest = async () => {
  const item = document.getElementById('req-item').value;
  const size = document.getElementById('req-size').value;
  const qty = document.getElementById('req-qty').value;

  if (!item || !size) return alert("Бүрэн бөглөнө үү!");

  showLoading(true);
  try {
    const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "add_order", code: currentUser.code, item, size, qty }) });
    const r = await res.json();

    if (r.success) {
      alert("Хүсэлт илгээгдлээ!");
      window.refreshData();
      window.showTab('orders', document.querySelector('.nav-btn'));
    } else {
      alert(r.msg || "Хүсэлт илгээхэд алдаа");
    }
  } catch (e) {
    alert("Алдаа! (add_order)");
  }
  showLoading(false);
};

// --------------------
// Add employee (Admin)
// --------------------
window.addEmployee = async () => {
  const data = {
    action: "add_employee",
    code: document.getElementById('new-emp-code').value.trim(),
    ner: document.getElementById('new-emp-name').value.trim(),
    ovog: document.getElementById('new-emp-lastname').value.trim(),
    role: document.getElementById('new-emp-role').value.trim()
  };

  if (!data.code || !data.ner) return alert("Мэдээллээ шалгана уу!");

  showLoading(true);
  try {
    const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify(data) });
    const r = await res.json();
    if (r.success) alert(r.msg || "Ажилтан нэмэгдлээ");
    else alert(r.msg || "Add employee error");
  } catch (e) {
    alert("Алдаа! (add_employee)");
  }
  showLoading(false);
};

// --------------------
// Add item (Admin)
// --------------------
window.addItem = async () => {
  const data = {
    action: "add_item",
    name: document.getElementById('new-item-name').value.trim(),
    sizes: document.getElementById('new-item-sizes').value.trim()
  };

  if (!data.name) return alert("Нэр оруулна уу!");

  showLoading(true);
  try {
    const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify(data) });
    const r = await res.json();
    if (r.success) {
      alert("Бараа нэмэгдлээ");
      window.refreshData();
    } else {
      alert(r.msg || "Add item error");
    }
  } catch (e) {
    alert("Алдаа! (add_item)");
  }
  showLoading(false);
};

// --------------------
// Change password
// --------------------
window.changePassword = async () => {
  const oldP = document.getElementById('old-pass').value;
  const newP = document.getElementById('new-pass').value;
  const confP = document.getElementById('confirm-pass').value;

  if (newP !== confP) return alert("Шинэ нууц үг зөрүүтэй байна!");

  showLoading(true);
  try {
    const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "change_pass", code: currentUser.code, oldP, newP }) });
    const r = await res.json();
    if (r.success) alert("Амжилттай!");
    else alert(r.msg || "Password change error");
  } catch (e) {
    alert("Алдаа! (change_pass)");
  }
  showLoading(false);
};

// --------------------
// Logout
// --------------------
window.logout = () => {
  localStorage.removeItem('ett_user');
  location.reload();
};

// --------------------
// Startup
// --------------------
window.onload = () => {
  currentUser = JSON.parse(localStorage.getItem('ett_user'));
  if (currentUser) initApp();
  else document.getElementById('login-page').classList.remove('hidden');
};
