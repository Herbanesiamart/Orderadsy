/**
 * /api/submit-order — Handle seluruh proses order dalam 1 API call
 *
 * Menggantikan 4 request serial dari client:
 *   cek blokir → cek duplikat → count → INSERT
 * + background tasks: WA notif (Fonnte), CAPI, TikTok Events API
 *
 * Client hanya nunggu 1 round-trip, lalu langsung redirect ke WA.
 *
 * Env vars yang dibutuhkan di Vercel:
 *   SUPABASE_URL        — sama dengan di config.js
 *   SUPABASE_ANON_KEY   — sama dengan di config.js
 *   FONNTE_TOKEN        — sudah ada
 */

const SUPABASE_URL = process.env.SUPABASE_URL  || 'https://bdoodcaxizksnhxunjky.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkb29kY2F4aXprc25oeHVuamt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNTIxNzYsImV4cCI6MjEwMzkyODE3Nn0.5OX4tunpCbAbaMb7NtEDiuxpxtHw8LoCC4iN1A4Dkds';
const FONNTE_TOKEN = process.env.FONNTE_TOKEN;
const API_BASE     = process.env.API_BASE || 'https://orderadsy.vercel.app/api';

const SB_HEADERS = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Prefer': 'return=representation',
};

async function sbGet(table, query = '') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, { headers: SB_HEADERS });
  if (!r.ok) throw new Error(`sbGet ${table}: ${await r.text()}`);
  return r.json();
}

async function sbPost(table, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers: SB_HEADERS, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`sbPost ${table}: ${await r.text()}`);
  return r.json();
}

async function sbPatch(table, query, body) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method: 'PATCH',
    headers: { ...SB_HEADERS, 'Prefer': 'return=minimal' },
    body: JSON.stringify(body),
  });
}

function normalizeWA(hp) {
  let n = (hp || '').replace(/\D/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1);
  if (n.startsWith('8')) n = '62' + n;
  if (!n.startsWith('62')) n = '62' + n;
  return n;
}

function fillTemplate(tpl, vars) {
  return tpl
    .replace(/\{\{name\}\}/gi,    vars.name    || '')
    .replace(/\{\{cs_name\}\}/gi, vars.cs_name || '')
    .replace(/\{\{phone\}\}/gi,   vars.phone   || '')
    .replace(/\{\{address\}\}/gi, vars.address || '')
    .replace(/\{\{product\}\}/gi, vars.product || '');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    product_id, checkout_page_id,
    customer_name, customer_wa: rawWA,
    customer_email, customer_address, customer_city,
    customer_note, customer_keluhan,
    event_id, tiktok_event_id, event_source_url, fbc, fbp,
  } = req.body || {};

  if (!product_id || !checkout_page_id) {
    return res.status(400).json({ error: 'product_id dan checkout_page_id wajib' });
  }

  const customer_wa = normalizeWA(rawWA);

  try {
    // ── 1. Cek blokir WA ─────────────────────────────────────────────
    const blocked = await sbGet('blocked_wa',
      `?wa_number=eq.${encodeURIComponent(customer_wa)}&select=id&limit=1`);
    if (blocked?.length > 0) {
      // Diam-diam batal — jangan beri tahu customer
      return res.status(200).json({ ok: true, blocked: true });
    }

    // ── 2. Get product + checkout page (parallel) ─────────────────────
    const [products, checkoutPages] = await Promise.all([
      sbGet('products', `?id=eq.${product_id}&select=id,name,slug,price,pixel_id,access_token,tiktok_pixel_id,tiktok_access_token,gtm_id,followup_welcome,followup_redirect&limit=1`),
      sbGet('checkout_pages', `?id=eq.${checkout_page_id}&select=id,pixel_event&limit=1`),
    ]);
    const product     = products[0];
    const checkoutPage = checkoutPages[0];
    if (!product) return res.status(404).json({ error: 'Produk tidak ditemukan' });

    // ── 3. Get assigned CS + rotator (parallel) ───────────────────────
    const [assignedRows, rotatorRows] = await Promise.all([
      sbGet('product_cs', `?product_id=eq.${product_id}&select=cs_team(id,name,wa_number,email)`),
      sbGet('cs_rotator', `?product_id=eq.${product_id}&select=last_cs_index&limit=1`),
    ]);
    const assignedCS   = assignedRows.map(r => r.cs_team).filter(Boolean);
    const rotatorIndex = rotatorRows[0]?.last_cs_index ?? 0;
    let cs = assignedCS.length > 0 ? assignedCS[rotatorIndex % assignedCS.length] : null;

    // ── 4. Cek duplikat 24 jam + count hari ini (parallel) ────────────
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const WIB_OFFSET = 7 * 60 * 60 * 1000;
    const nowWIB = new Date(Date.now() + WIB_OFFSET);
    nowWIB.setUTCHours(0, 0, 0, 0);
    const todayStartUTC = new Date(nowWIB.getTime() - WIB_OFFSET).toISOString();

    const [prevOrders, countRes] = await Promise.all([
      sbGet('orders', `?customer_wa=eq.${encodeURIComponent(customer_wa)}&product_id=eq.${product_id}&created_at=gte.${since24h}&select=cs_id&order=created_at.desc&limit=1`),
      fetch(`${SUPABASE_URL}/rest/v1/orders?product_id=eq.${product_id}&cs_id=eq.${cs?.id}&created_at=gte.${todayStartUTC}&select=id`, {
        headers: { ...SB_HEADERS, 'Prefer': 'count=exact', 'Range': '0-0' },
      }),
    ]);

    let isDuplicate = false;
    if (prevOrders.length > 0 && prevOrders[0].cs_id) {
      isDuplicate = true;
      const prevCS = assignedCS.find(c => c.id === prevOrders[0].cs_id);
      if (prevCS) cs = prevCS; // sticky ke CS lama
    }

    const cr = countRes.headers.get('Content-Range') || '';
    const orderNumberToday = (parseInt(cr.split('/')[1] || '0') || 0) + 1;

    // ── 5. INSERT order ───────────────────────────────────────────────
    const orderData = await sbPost('orders', {
      checkout_page_id, product_id,
      cs_id:            cs?.id || null,
      customer_name,
      customer_wa,
      customer_email:   customer_email   || null,
      customer_address: customer_address || null,
      customer_city:    customer_city    || null,
      customer_note:    customer_note    || null,
      customer_keluhan: customer_keluhan || null,
      status:           'pending',
      is_duplicate:     isDuplicate,
    });
    const orderId = orderData[0]?.id;

    // ── 6. Build redirect URL ─────────────────────────────────────────
    const tplVars = {
      name:    customer_name    || '',
      cs_name: cs?.name         || '',
      phone:   customer_wa,
      address: [customer_address, customer_city].filter(Boolean).join(', '),
      product: product.name     || '',
    };

    const redirectMsg = fillTemplate(
      product.followup_redirect ||
      'Halo, saya {{name}} ingin order {{product}}\n\nNama     : {{name}}\nNo. WA   : {{phone}}\nAlamat   : {{address}}',
      tplVars,
    );
    const redirectUrl = cs?.wa_number
      ? `https://wa.me/${normalizeWA(cs.wa_number)}?text=${encodeURIComponent(redirectMsg)}`
      : null;

    // ── 7. Background tasks ───────────────────────────────────────────

    // Update rotator (fire & forget — tidak kritis)
    if (assignedCS.length > 1) {
      sbPatch('cs_rotator', `?product_id=eq.${product_id}`,
        { last_cs_index: (rotatorIndex + 1) % assignedCS.length }
      ).catch(() => {});
    }

    // WA notif ke CS via Fonnte — di-await agar tidak di-kill Vercel sebelum terkirim
    if (cs?.wa_number && FONNTE_TOKEN) {
      const waMessage = fillTemplate(
        product.followup_welcome ||
        'Halo Kak {{name}}, saya {{cs_name}}. Terima kasih sudah order ya kak!\n\nNama     : {{name}}\nNo. WA   : {{phone}}\nAlamat   : {{address}}\n\nSudah benar ya kak? 😊',
        tplVars,
      );
      const alamat = tplVars.address || '-';
      const notifMsg =
`🔔 *Order Baru Masuk!*${orderNumberToday ? ` _(ke-${orderNumberToday} hari ini)_` : ''}
Halo ${cs.name || 'CS'}, ada order baru untuk kamu handle.

📦 *Produk:* ${product.name || '-'}
👤 *Nama:* ${customer_name || '-'}
📱 *No. WA:* ${customer_wa}
📍 *Alamat:* ${alamat}${customer_keluhan ? `\n💬 *Keluhan:* ${customer_keluhan}` : ''}

Balas customer:
https://wa.me/${customer_wa}?text=${encodeURIComponent(waMessage)}`;

      try {
        const r = await fetch('https://api.fonnte.com/send', {
          method: 'POST',
          headers: { 'Authorization': FONNTE_TOKEN, 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: cs.wa_number, message: notifMsg }),
        });
        const d = await r.json();
        if (!d.status) console.error('[WA Notif] Fonnte error:', JSON.stringify(d));
      } catch(e) {
        console.error('[WA Notif] Exception:', e.message);
      }
    }

    // Email notif ke CS (backup, fire & forget)
    if (cs?.email) {
      const waMessageEmail = fillTemplate(
        product.followup_welcome ||
        'Halo Kak {{name}}, saya {{cs_name}}. Terima kasih sudah order ya kak!\n\nNama     : {{name}}\nNo. WA   : {{phone}}\nAlamat   : {{address}}\n\nSudah benar ya kak? 😊',
        tplVars,
      );
      fetch(`${API_BASE}/send-order-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: cs.email, cs_name: cs.name,
          customer_name, customer_wa,
          customer_address, customer_city, customer_keluhan,
          product_name: product.name, order_id: orderId,
          wa_message: waMessageEmail, order_number_today: orderNumberToday,
        }),
      }).catch(() => {});
    }

    // Meta CAPI
    if (product.pixel_id && product.access_token) {
      fetch(`${API_BASE}/send-capi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pixel_id:     product.pixel_id,
          access_token: product.access_token,
          event_name:   checkoutPage?.pixel_event || 'Lead',
          event_id:     event_id || ('submit_' + orderId),
          user_data: {
            ph:      customer_wa,
            em:      customer_email  || '',
            fn:      (customer_name || '').split(' ')[0].toLowerCase(),
            ln:      (customer_name || '').split(' ').slice(1).join(' ').toLowerCase(),
            ct:      (customer_city || '').toLowerCase().replace(/\s/g, ''),
            country: 'id',
            fbc:     fbc || null,
            fbp:     fbp || null,
          },
          custom_data: {
            product_name: product.name,
            order_id:     orderId,
            value:        product.price || 0,
            currency:     'IDR',
          },
          event_source_url: event_source_url || '',
        }),
      }).catch(() => {});
    }

    // TikTok Events API — PlaceAnOrder = Lead (Purchase dikirim saat CS closing di orders.html)
    if (product.tiktok_pixel_id && product.tiktok_access_token) {
      const ttBaseId = tiktok_event_id || ('tt_' + (event_id || orderId));
      fetch(`${API_BASE}/send-tiktok-event`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pixel_code:   product.tiktok_pixel_id,
          access_token: product.tiktok_access_token,
          event_name:   'PlaceAnOrder',
          event_id:     ttBaseId,
          user_data:    { ph: customer_wa, em: customer_email || null },
          custom_data:  { product_id, product_name: product.name, value: product.price || 0, currency: 'IDR', order_id: orderId },
          event_source_url: event_source_url || '',
        }),
      }).catch(() => {});
    }

    // ── 8. Response ───────────────────────────────────────────────────
    return res.status(200).json({
      ok:            true,
      order_id:      orderId,
      redirect_url:  redirectUrl,
      gtm_id:        product.gtm_id   || null,
      tiktok_pixel_id: product.tiktok_pixel_id || null,
      pixel_id:      product.pixel_id || null,
      pixel_event:   checkoutPage?.pixel_event || 'Lead',
      product_id:    product.id,
      product_name:  product.name,
      product_price: product.price || 0,
      is_duplicate:  isDuplicate,
    });

  } catch(e) {
    console.error('[submit-order]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
