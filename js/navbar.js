function renderNavbar(activePage) {
  const nav = document.getElementById('navbar');
  if (!nav) return;

  const admin = isAdmin();
  const csName = getCSName();

  nav.innerHTML = `
    <a href="dashboard.html" class="navbar-brand">Order<span>Adsy</span></a>
    <nav class="navbar-nav">
      <a href="dashboard.html" class="nav-link ${activePage==='dashboard'?'active':''}">Dashboard</a>
      ${admin ? `<a href="products.html" class="nav-link ${activePage==='products'?'active':''}">Products</a>` : ''}
      <a href="orders.html" class="nav-link ${activePage==='orders'?'active':''}">Orders</a>
      ${admin ? `
      <div class="nav-dropdown" id="navDropdown">
        <button class="nav-link ${activePage==='others'?'active':''}" onclick="toggleNavDropdown(event)">Others ▾</button>
        <div class="nav-dropdown-menu">
          <a href="others-cs.html" class="nav-dropdown-item">👥 CS Team</a>
        </div>
      </div>` : ''}
    </nav>
    <div class="navbar-right">
      ${admin ? `<a href="products-add.html" class="btn-add-product">＋ Add Product</a>` : `<span style="font-size:13px;color:var(--gray-500);font-weight:500;">👤 ${csName || 'CS'}</span>`}
      <div class="notif-wrapper" id="notifWrapper">
        <button class="icon-btn" id="notifBtn" title="Notifikasi" onclick="toggleNotif(event)">
          🔔
          <span class="notif-badge" id="notifBadge" style="display:none;">0</span>
        </button>
        <div class="notif-panel" id="notifPanel">
          <div class="notif-panel-header">
            <button class="notif-mark-all" onclick="markAllRead()">🔔 Mark All as Read</button>
            <button class="notif-close" onclick="closeNotif()">✕</button>
          </div>
          <div class="notif-list" id="notifList">
            <div class="notif-empty">Tidak ada notifikasi</div>
          </div>
        </div>
      </div>
      <button class="icon-btn" title="Logout" onclick="logout()">⏻</button>
    </div>
  `;

  // Init notifications after rendering
  initNotifications();
}

function toggleNavDropdown(e) {
  e.stopPropagation();
  const d = document.getElementById('navDropdown');
  if (d) d.classList.toggle('open');
}

// Klik di luar → tutup dropdown & notif panel
document.addEventListener('click', function() {
  const d = document.getElementById('navDropdown');
  if (d) d.classList.remove('open');
  const p = document.getElementById('notifWrapper');
  if (p) p.classList.remove('open');
});

/* ── Notification Sound ──────────────────────────────────── */
function playOrderSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Nada 1 — "ding" pendek
    function beep(freq, startTime, duration, vol = 0.4) {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(vol, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
    }

    const t = ctx.currentTime;
    beep(880, t,        0.12);  // La5
    beep(1046, t + 0.13, 0.12); // Do6
    beep(1318, t + 0.26, 0.22); // Mi6 — lebih panjang

  } catch(e) {}
}

/* ── Notification System ──────────────────────────────────── */
let _notifData     = [];      // all fetched orders for notif
let _notifReadIds  = new Set(); // ids marked as read (persisted in localStorage)
let _notifInterval = null;

function _loadReadIds() {
  try { return new Set(JSON.parse(localStorage.getItem('oa_notif_read') || '[]')); }
  catch { return new Set(); }
}

function _saveReadIds() {
  try { localStorage.setItem('oa_notif_read', JSON.stringify([..._notifReadIds])); }
  catch {}
}

async function fetchNotifications() {
  try {
    const csFilter = (typeof getCSId === 'function' && getCSId()) ? `&cs_id=eq.${getCSId()}` : '';
    const orders = await sbGet('orders',
      `?order=created_at.desc&limit=30&select=id,customer_name,created_at,product_id,products(name)${csFilter}`
    );
    _notifData = orders;
    renderNotifList();
    updateNotifBadge();
  } catch(e) {}
}

function renderNotifList() {
  const el = document.getElementById('notifList');
  if (!el) return;
  if (!_notifData.length) {
    el.innerHTML = '<div class="notif-empty">Tidak ada notifikasi</div>';
    return;
  }
  el.innerHTML = _notifData.map(o => {
    const isRead = _notifReadIds.has(o.id);
    return `
      <div class="notif-item ${isRead ? 'read' : ''}" data-id="${o.id}" onclick="openNotifOrder('${o.id}')">
        <div class="notif-icon">🛒</div>
        <div class="notif-content">
          <div class="notif-title">Pesanan Baru</div>
          <div class="notif-sub">${o.customer_name || '-'} memesan ${o.products?.name || '-'}</div>
        </div>
        <div class="notif-time">${timeAgo(o.created_at)}</div>
      </div>`;
  }).join('');
}

function updateNotifBadge() {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  const unread = _notifData.filter(o => !_notifReadIds.has(o.id)).length;
  if (unread > 0) {
    badge.textContent = unread > 99 ? '99+' : unread;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function toggleNotif(e) {
  e.stopPropagation();
  const w = document.getElementById('notifWrapper');
  if (!w) return;
  const wasOpen = w.classList.contains('open');
  // close nav dropdown if open
  const d = document.getElementById('navDropdown');
  if (d) d.classList.remove('open');
  w.classList.toggle('open', !wasOpen);
}

function closeNotif() {
  const w = document.getElementById('notifWrapper');
  if (w) w.classList.remove('open');
}

function markAllRead() {
  _notifData.forEach(o => _notifReadIds.add(o.id));
  _saveReadIds();
  renderNotifList();
  updateNotifBadge();
}

function openNotifOrder(id) {
  // Mark as read
  _notifReadIds.add(id);
  _saveReadIds();
  updateNotifBadge();
  closeNotif();

  // If already on orders page, open detail directly
  if (window.location.pathname.endsWith('orders.html')) {
    if (typeof openDetail === 'function') {
      // Try to find in allOrders first, else navigate with param
      const found = (typeof allOrders !== 'undefined') && allOrders.find(o => o.id === id);
      if (found) { openDetail(id); return; }
    }
  }
  // Navigate to orders page with order id param
  window.location.href = `orders.html?open=${id}`;
}

function initNotifications() {
  _notifReadIds = _loadReadIds();
  fetchNotifications();
  if (_notifInterval) clearInterval(_notifInterval);
  _notifInterval = setInterval(fetchNotifications, 60000);

  // prevent notif panel clicks from closing
  document.addEventListener('click', function() {}, false);
  const panel = document.getElementById('notifWrapper');
  if (panel) {
    panel.addEventListener('click', e => e.stopPropagation());
  }
}

function logout() {
  sessionStorage.removeItem('oa_auth');
  window.location.href = 'login.html';
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'show' + (type ? ' ' + type : '');
  setTimeout(() => { t.className = ''; }, 3000);
}
