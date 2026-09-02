/**
 * /api/send-wa-notif — Kirim notif WA ke CS via Fonnte saat ada order masuk
 *
 * POST body:
 * {
 *   cs_wa, cs_name, customer_name, customer_wa,
 *   customer_address, customer_city, customer_keluhan,
 *   product_name, order_id
 * }
 *
 * Butuh env: FONNTE_TOKEN
 */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.FONNTE_TOKEN;
  if (!token) return res.status(500).json({ error: 'FONNTE_TOKEN belum diset' });

  const {
    cs_wa, cs_name, customer_name, customer_wa,
    customer_address, customer_city, customer_keluhan,
    product_name, order_id, wa_message, order_number_today,
  } = req.body || {};

  if (!cs_wa) return res.status(400).json({ error: 'cs_wa wajib' });

  const alamat = [customer_address, customer_city].filter(Boolean).join(', ') || '-';

  const message =
`🔔 *Order Baru Masuk!*${order_number_today ? ` _(ke-${order_number_today} hari ini)_` : ''}
Halo ${cs_name || 'CS'}, ada order baru untuk kamu handle.

📦 *Produk:* ${product_name || '-'}
👤 *Nama:* ${customer_name || '-'}
📱 *No. WA:* ${customer_wa || '-'}
📍 *Alamat:* ${alamat}${customer_keluhan ? `\n💬 *Keluhan:* ${customer_keluhan}` : ''}

Balas customer:
https://wa.me/${(customer_wa || '').replace(/\D/g, '')}${wa_message ? '?text=' + encodeURIComponent(wa_message) : ''}`;

  try {
    const r = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        target:  cs_wa,
        message: message,
      }),
    });

    const data = await r.json();
    if (!data.status) {
      console.error('[WA Notif] Fonnte error:', JSON.stringify(data));
      return res.status(500).json({ error: 'Fonnte error', details: data });
    }

    console.log('[WA Notif] Sent to CS:', cs_wa, '| order:', order_id);
    return res.status(200).json({ ok: true });

  } catch(e) {
    console.error('[WA Notif] Exception:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
