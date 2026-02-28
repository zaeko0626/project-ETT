const API_URL = "https://script.google.com/macros/s/AKfycbz0x6Xv9a9_A0DqTPOI4aPH6JpA91efnomjnA2v6zzxz19HbHSg_0eDPTwSaWU1XDOk/exec";

let allOrders = [];
let allItems = [];
let currentUser = null;

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

  if (window.innerWidth < 1024) window.closeSidebar();
};

function showLoading(show) {
  document.getElementById('loading-overlay').classList.toggle('hidden', !show);
}

window.handleLogin = async () => {
  const code = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value.trim();

  showLoading(true);
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: "login", code, pass })
    });

    const text = await res.text();
    let result;
    try { result = JSON.parse(text); }
    catch {
      console.error("Login non-JSON:", text);
      alert("API JSON биш хариу өглөө. Apps Script Deploy/Access шалга.");
      return;
    }

    if (result.success) {
      currentUser = result.user;
      localStorage.setItem('ett_user', JSON.stringify(currentUser));
      initApp();
    } else {
      alert(result.msg || "Нэвтрэхэд алдаа гарлаа");
    }
  } catch (e) {
    console.error(e);
    alert("API хүрэхгүй байна (login).");
  } finally {
    showLoading(false);
  }
};

function initApp() {
  document.getElementById('login-page').classList.add('hidden');
  document.getElementById('main-page').classList.remove('hidden');

  document.getElementById('user-display-name').innerText =
    currentUser && currentUser.ovog ? `${currentUser.ovog} ${currentUser.ner}` : (currentUser?.ner || "");

  if (currentUser && currentUser.type === 'admin') {
    document.getElementById('nav-request').classList.add('hidden');
    document.getElementById('nav-admin').classList.remove('hidden');
  } else {
    document.getElementById('nav-request').classList.remove('hidden');
    document.getElementById('nav-admin').classList.add('hidden');
  }

  window.refreshData();
}

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

window.refreshData = async () => {
  showLoading(true);
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: "get_all_data" })
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch {
      console.error("get_all_data non-JSON:", text);
      alert("API JSON биш хариу өглөө. Apps Script Deploy/Access шалга.");
      return;
    }

    if (data.success === false) {
      alert(data.msg || "Дата татахад алдаа");
      return;
    }

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
  } catch (e) {
    console.error(e);
    alert("API хүрэхгүй байна (get_all_data).");
  } finally {
    showLoading(false);
  }
};

window.updateSizeOptions = () => {
  const name = document.getElementById('req-item').value;
  const select = document.getElementById('req-size');

  if (!name) {
    select.innerHTML = '<option value="">Сонгох...</option>';
    return;
  }

  const item = allItems.find(i => i.name === name);
  if (item && item.sizes) {
    select.innerHTML = item.sizes.split(',').map(s => s.trim()).filter(Boolean)
      .map(s => `<option value="${s}">${s}</option>`).join('');
  } else {
    select.innerHTML = '<option value="ST">Стандарт</option>';
  }
};

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

      const adminActions = (currentUser && currentUser.type === 'admin') ? `
        <div class="flex gap-2 mt-4 pt-4 border-t border-slate-100">
          <button onclick="window.updateStatus('${o.id}', 'Зөвшөөрсөн')" class="flex-1 bg-green-600 text-white py-2 rounded-lg text-[8px] font-black uppercase">Зөвшөөрөх</button>
          <button onclick="window.updateStatus('${o.id}', 'Татгалзсан')" class="flex-1 bg-red-600 text-white py-2 rounded-lg text-[8px] font-black uppercase">Татгалзах</button>
        </div>
      ` : '';

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

window.updateStatus = async (id, status) => {
  showLoading(true);
  try {
    const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "update_status", id, status }) });
    const text = await res.text();
    const r = JSON.parse(text);
    if (r.success) window.refreshData();
    else alert(r.msg || "Status update error");
  } catch(e) {
    console.error(e);
    alert("Алдаа! (update_status)");
  } finally {
    showLoading(false);
  }
};

window.fetchEmpHistory = async () => {
  const code = document.getElementById('hist-search-code').value.trim();
  if (!code) return alert("Код оруулна уу!");

  showLoading(true);
  try {
    const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "get_employee_history", empCode: code }) });
    const text = await res.text();
    const r = JSON.parse(text);

    if (r.success) {
      document.getElementById('emp-details-card').classList.remove('hidden');
      document.getElementById('hist-full-name').innerText = `${r.user.ovog} ${r.user.ner}`;
      document.getElementById('hist-role').innerText = `${r.user.code} | ${r.user.role}`;

      document.getElementById('hist-items-container').innerHTML =
        r.history.length ? r.history.map(h => `
          <div class="flex justify-between items-center p-2 bg-slate-50 rounded-lg text-[9px] font-bold">
            <div>${h.item} <span class="text-slate-400 ml-2">${new Date(h.date).toLocaleDateString()}</span></div>
            <div class="text-blue-600">${h.size} / ${h.qty}ш</div>
          </div>
        `).join('') : '<div class="text-center text-[8px] text-slate-400 italic">Түүх байхгүй</div>';
    } else {
      alert(r.msg || "Түүх татахад алдаа");
    }
  } catch (e) {
    console.error(e);
    alert("Алдаа! (get_employee_history)");
  } finally {
    showLoading(false);
  }
};

window.submitRequest = async () => {
  const item = document.getElementById('req-item').value;
  const size = document.getElementById('req-size').value;
  const qty = document.getElementById('req-qty').value;

  if (!item || !size) return alert("Бүрэн бөглөнө үү!");

  showLoading(true);
  try {
    const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "add_order", code: currentUser.code, item, size, qty }) });
    const text = await res.text();
    const r = JSON.parse(text);

    if (r.success) {
      alert("Хүсэлт илгээгдлээ!");
      window.refreshData();
      window.showTab('orders', document.querySelector('.nav-btn'));
    } else {
      alert(r.msg || "Хүсэлт илгээхэд алдаа");
    }
  } catch (e) {
    console.error(e);
    alert("Алдаа! (add_order)");
  } finally {
    showLoading(false);
  }
};

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
    const text = await res.text();
    const r = JSON.parse(text);
    if (r.success) alert(r.msg || "Ажилтан нэмэгдлээ");
    else alert(r.msg || "Add employee error");
  } catch (e) {
    console.error(e);
    alert("Алдаа! (add_employee)");
  } finally {
    showLoading(false);
  }
};

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
    const text = await res.text();
    const r = JSON.parse(text);

    if (r.success) {
      alert("Бараа нэмэгдлээ");
      window.refreshData();
    } else {
      alert(r.msg || "Add item error");
    }
  } catch (e) {
    console.error(e);
    alert("Алдаа! (add_item)");
  } finally {
    showLoading(false);
  }
};

window.changePassword = async () => {
  const oldP = document.getElementById('old-pass').value;
  const newP = document.getElementById('new-pass').value;
  const confP = document.getElementById('confirm-pass').value;

  if (newP !== confP) return alert("Шинэ нууц үг зөрүүтэй байна!");

  showLoading(true);
  try {
    const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "change_pass", code: currentUser.code, oldP, newP }) });
    const text = await res.text();
    const r = JSON.parse(text);
    if (r.success) alert("Амжилттай!");
    else alert(r.msg || "Password change error");
  } catch (e) {
    console.error(e);
    alert("Алдаа! (change_pass)");
  } finally {
    showLoading(false);
  }
};

window.logout = () => {
  localStorage.removeItem('ett_user');
  location.reload();
};

window.onload = () => {
  currentUser = JSON.parse(localStorage.getItem('ett_user'));
  if (currentUser) initApp();
  else document.getElementById('login-page').classList.remove('hidden');
};
