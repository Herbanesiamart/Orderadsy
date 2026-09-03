const SUPABASE_URL = 'https://bdoodcaxizksnhxunjky.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkb29kY2F4aXprc25oeHVuamt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNTIxNzYsImV4cCI6MjEwMzkyODE3Nn0.5OX4tunpCbAbaMb7NtEDiuxpxtHw8LoCC4iN1A4Dkds';

// Admin credentials (single login)
const ADMIN_USER = 'Adsy';
const ADMIN_PASS = 'Sukses2026';

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

function getAuthData() {
  try { return JSON.parse(sessionStorage.getItem('oa_auth')); } catch { return null; }
}

function isLoggedIn() { return !!getAuthData(); }
function isAdmin()    { return getAuthData()?.role === 'admin'; }
function getCSId()    { return getAuthData()?.cs_id || null; }
function getCSName()  { return getAuthData()?.cs_name || null; }

function requireAuth() {
  if (!isLoggedIn()) window.location.href = 'login.html';
}

function requireAdmin() {
  if (!isAdmin()) window.location.href = 'dashboard.html';
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
