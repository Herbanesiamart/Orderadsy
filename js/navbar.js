function renderNavbar(activePage) {
  const nav = document.getElementById('navbar');
  if (!nav) return;

  const admin = isAdmin();
  const csName = getCSName();

  nav.innerHTML = `
    <a href="dashboard.html" class="navbar-brand">
      <img src="img/logo-adsy.png" alt="Adsy" style="width:28px;height:28px;object-fit:contain;">
      Order<span>Adsy</span>
    </a>
    <nav class="navbar-nav">
      <a href="dashboard.html" class="nav-link ${activePage==='dashboard'?'active':''}">Dashboard</a>
      ${admin ? `<a href="products.html" class="nav-link ${activePage==='products'?'active':''}">Products</a>` : ''}
      <a href="orders.html" class="nav-link ${activePage==='orders'?'active':''}">Orders</a>
      ${admin ? `
      <div class="nav-dropdown" id="navDropdown">
        <button class="nav-link ${activePage==='others'?'active':''}" onclick="toggleNavDropdown(event)">Others ▾</button>
        <div class="nav-dropdown-menu">
          <a href="others-cs.html" class="nav-dropdown-item">👥 CS Team</a>
          <a href="others-blocked-wa.html" class="nav-dropdown-item">🚫 Blokir WA</a>
          <a href="others-abandoned.html" class="nav-dropdown-item">🛒 Abandoned Cart</a>
        </div>
      </div>` : ''}
    </nav>
    <div class="navbar-right">
      ${admin ? `<a href="products-add.html" class="btn-add-product">＋ Add Product</a>` : `<span style="font-size:13px;color:var(--gray-500);font-weight:500;"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>${csName || 'CS'}</span>`}
      <div class="notif-wrapper" id="notifWrapper">
        <button class="icon-btn" id="notifBtn" title="Notifikasi" onclick="toggleNotif(event)">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <span class="notif-badge" id="notifBadge" style="display:none;">0</span>
        </button>
        <div class="notif-panel" id="notifPanel">
          <div class="notif-panel-header">
            <button class="notif-mark-all" onclick="markAllRead()"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><polyline points="20 6 9 17 4 12"/></svg>Mark All as Read</button>
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
    // 30 hari terakhir, tanpa limit count — yang sudah dibaca disembunyikan di render
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const orders = await sbGet('orders',
      `?order=created_at.desc&created_at=gte.${since}&select=id,customer_name,created_at,product_id,products(name)${csFilter}`
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

  // Minta izin browser notification (sekali, tidak ganggu kalau sudah granted/denied)
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // Fallback polling 60 detik
  if (_notifInterval) clearInterval(_notifInterval);
  _notifInterval = setInterval(fetchNotifications, 60000);

  // prevent notif panel clicks from closing
  const panel = document.getElementById('notifWrapper');
  if (panel) panel.addEventListener('click', e => e.stopPropagation());

  // Supabase Realtime — load CDN jika belum ada, lalu subscribe
  _initNotifRealtime();
}

function showBrowserNotif(order) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const title   = '🛒 Order Baru Masuk!';
  const body    = `${order.customer_name || 'Customer'} memesan ${order.products?.name || '-'}`;
  const icon    = order.products?.image_url || 'img/logo-adsy.png';
  const orderId = order.id;

  const notif = new Notification(title, { body, icon, badge: 'img/logo-adsy.png', tag: orderId });

  // Klik notif → fokus tab + buka detail order
  notif.onclick = () => {
    window.focus();
    _notifReadIds.add(orderId);
    _saveReadIds();
    updateNotifBadge();
    if (window.location.pathname.endsWith('orders.html')) {
      if (typeof openDetail === 'function') {
        const found = (typeof allOrders !== 'undefined') && allOrders.find(o => o.id === orderId);
        if (found) { openDetail(orderId); return; }
      }
    }
    window.location.href = `orders.html?open=${orderId}`;
  };

  // Auto close 8 detik
  setTimeout(() => notif.close(), 8000);
}

function _initNotifRealtime() {
  if (typeof supabase !== 'undefined') {
    _subscribeNotifRealtime();
    return;
  }
  // Load CDN dinamis kalau belum ada
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
  s.onload = _subscribeNotifRealtime;
  document.head.appendChild(s);
}

function _subscribeNotifRealtime() {
  try {
    const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    _sb.channel('notif-orders')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        async (payload) => {
          // CS filter — skip kalau bukan ordernya
          const csId = (typeof getCSId === 'function') ? getCSId() : null;
          if (csId && payload.new?.cs_id !== csId) return;

          playOrderSound();

          // Fetch data lengkap order (termasuk join produk untuk nama + gambar)
          try {
            const rows = await sbGet('orders',
              `?id=eq.${payload.new.id}&select=id,customer_name,product_id,products(name,image_url)&limit=1`
            );
            if (rows && rows[0]) {
              showOrderToast(rows[0]);
              showBrowserNotif(rows[0]);
            }
          } catch(e) {
            // fallback: tampilkan dengan data minimal dari payload
            const fallback = { id: payload.new.id, customer_name: payload.new.customer_name, products: { name: '-' } };
            showOrderToast(fallback);
            showBrowserNotif(fallback);
          }

          fetchNotifications();
        }
      )
      .subscribe();

    // Realtime aktif — matikan polling fallback
    if (_notifInterval) { clearInterval(_notifInterval); _notifInterval = null; }
  } catch(e) {}
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

/* ── Rich Order Toast ─────────────────────────────────── */
function showOrderToast(order) {
  // order = { id, customer_name, product_id, products: { name, image_url } }
  let container = document.getElementById('order-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'order-toast-container';
    document.body.appendChild(container);
  }

  const DURATION = 8000; // 8 detik
  const productName = order.products?.name || '-';
  const customerName = order.customer_name || 'Customer';
  const imageUrl = order.products?.image_url;
  const orderId = order.id;

  const toast = document.createElement('div');
  toast.className = 'order-toast';
  toast.innerHTML = `
    <div class="order-toast-header">
      <span class="order-toast-badge">🛒 Order Baru</span>
      <span class="order-toast-time">Baru saja</span>
      <button class="order-toast-dismiss" onclick="this.closest('.order-toast')._dismiss()">✕</button>
    </div>
    <div class="order-toast-body">
      ${imageUrl
        ? `<img class="order-toast-img" src="${imageUrl}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="order-toast-img-placeholder" style="display:none">🛍️</div>`
        : `<div class="order-toast-img-placeholder">🛍️</div>`
      }
      <div class="order-toast-info">
        <div class="order-toast-name">${customerName}</div>
        <div class="order-toast-product">${productName}</div>
      </div>
    </div>
    <div class="order-toast-actions">
      <button class="order-toast-btn primary" onclick="this.closest('.order-toast')._viewOrder()">Lihat Order</button>
      <button class="order-toast-btn secondary" onclick="this.closest('.order-toast')._dismiss()">Tutup</button>
    </div>
    <div class="order-toast-progress">
      <div class="order-toast-progress-bar" id="otpb-${orderId}" style="width:100%"></div>
    </div>
  `;

  // Attach actions
  toast._dismiss = () => {
    clearTimeout(toast._timer);
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 350);
  };
  toast._viewOrder = () => {
    toast._dismiss();
    _notifReadIds.add(orderId);
    _saveReadIds();
    updateNotifBadge();
    if (window.location.pathname.endsWith('orders.html')) {
      if (typeof openDetail === 'function') {
        const found = (typeof allOrders !== 'undefined') && allOrders.find(o => o.id === orderId);
        if (found) { openDetail(orderId); return; }
      }
    }
    window.location.href = `orders.html?open=${orderId}`;
  };

  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });

  // Progress bar countdown
  const bar = toast.querySelector(`#otpb-${orderId}`);
  if (bar) {
    bar.style.transition = `width ${DURATION}ms linear`;
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = '0%'; }));
  }

  // Auto dismiss
  toast._timer = setTimeout(() => toast._dismiss(), DURATION);
}
