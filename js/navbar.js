function renderNavbar(activePage) {
  const pages = {
    dashboard: 'dashboard.html',
    products:  'products.html',
    orders:    'orders.html',
    others:    'others-cs.html',
  };

  const nav = document.getElementById('navbar');
  if (!nav) return;

  nav.innerHTML = `
    <a href="dashboard.html" class="navbar-brand">Order<span>Adsy</span></a>
    <nav class="navbar-nav">
      <a href="dashboard.html" class="nav-link ${activePage==='dashboard'?'active':''}">Dashboard</a>
      <a href="products.html"  class="nav-link ${activePage==='products'?'active':''}">Products</a>
      <a href="orders.html"    class="nav-link ${activePage==='orders'?'active':''}">Orders</a>
      <div class="nav-dropdown">
        <button class="nav-link ${activePage==='others'?'active':''}">Others ▾</button>
        <div class="nav-dropdown-menu">
          <a href="others-cs.html" class="nav-dropdown-item">👥 CS Team</a>
        </div>
      </div>
    </nav>
    <div class="navbar-right">
      <a href="products-add.html" class="btn-add-product">＋ Add Product</a>
      <button class="icon-btn" title="Logout" onclick="logout()">⏻</button>
    </div>
  `;
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
