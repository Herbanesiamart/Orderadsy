const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Admin credentials (single login)
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'adsy2024';

function getSupabaseHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Prefer': 'return=representation',
  };
}

async function sbGet(table, query = '') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, { headers: getSupabaseHeaders() });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function sbPost(table, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers: getSupabaseHeaders(), body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function sbPatch(table, query, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method: 'PATCH',
    headers: { ...getSupabaseHeaders(), 'Prefer': 'return=minimal' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
}

async function sbDelete(table, query) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method: 'DELETE', headers: getSupabaseHeaders(),
  });
  if (!r.ok) throw new Error(await r.text());
}

function isLoggedIn() {
  return sessionStorage.getItem('oa_auth') === 'true';
}

function requireAuth() {
  if (!isLoggedIn()) window.location.href = 'login.html';
}

function normalizeWA(hp) {
  let n = (hp || '').replace(/\D/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1);
  if (n.startsWith('8')) n = '62' + n;
  if (!n.startsWith('62')) n = '62' + n;
  return n;
}

function formatRp(num) {
  return 'Rp' + (num || 0).toLocaleString('id-ID');
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60) return 'Baru saja';
  if (diff < 3600) return Math.floor(diff / 60) + ' menit lalu';
  if (diff < 86400) return Math.floor(diff / 3600) + ' jam lalu';
  return Math.floor(diff / 86400) + ' hari lalu';
}
