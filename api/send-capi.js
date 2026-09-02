/**
 * /api/send-capi — Kirim event ke Meta Conversions API (CAPI)
 * Deploy sebagai Vercel Serverless Function atau Supabase Edge Function
 *
 * POST body:
 * {
 *   pixel_id, access_token, event_name, event_id, event_time,
 *   user_data: { ph, em, fn, ln, ct, country },
 *   custom_data: { product_name, order_id, value, currency },
 *   event_source_url
 * }
 */

const GRAPH_API_VERSION = 'v19.0';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    pixel_id, access_token, event_name = 'Lead',
    event_id, event_time, user_data = {}, custom_data = {},
    event_source_url,
  } = req.body || {};

  if (!pixel_id || !access_token) {
    return res.status(400).json({ error: 'pixel_id dan access_token wajib' });
  }

  // Hash fungsi — Meta CAPI butuh SHA256 hash untuk user data
  const { createHash } = await import('crypto');
  function sha256(str) {
    if (!str) return undefined;
    return createHash('sha256').update(str.trim().toLowerCase()).digest('hex');
  }

  // Build user_data dengan hash
  const hashedUserData = {
    ...(user_data.ph    ? { ph:      sha256(user_data.ph.replace(/\D/g,'')) } : {}),
    ...(user_data.em    ? { em:      sha256(user_data.em) }  : {}),
    ...(user_data.fn    ? { fn:      sha256(user_data.fn) }  : {}),
    ...(user_data.ln    ? { ln:      sha256(user_data.ln) }  : {}),
    ...(user_data.ct    ? { ct:      sha256(user_data.ct) }  : {}),
    ...(user_data.country ? { country: sha256(user_data.country) } : {}),
    client_ip_address: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || undefined,
    client_user_agent: req.headers['user-agent'] || undefined,
    fbc: user_data.fbc || undefined,
    fbp: user_data.fbp || undefined,
  };

  const payload = {
    data: [
      {
        event_name,
        event_time:       event_time || Math.floor(Date.now() / 1000),
        event_id:         event_id   || Date.now().toString(36),
        event_source_url: event_source_url || undefined,
        action_source:    'website',
        user_data:        hashedUserData,
        custom_data: {
          value:    custom_data.value    || 0,
          currency: custom_data.currency || 'IDR',
          content_name: custom_data.product_name || undefined,
          order_id: custom_data.order_id || undefined,
        },
      },
    ],
  };

  try {
    const capiRes = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixel_id}/events?access_token=${access_token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    const capiData = await capiRes.json();

    if (!capiRes.ok) {
      console.error('[CAPI] Error:', JSON.stringify(capiData));
      return res.status(500).json({ error: 'CAPI error', details: capiData });
    }

    console.log('[CAPI] Success:', event_name, '| events_received:', capiData.events_received);
    return res.status(200).json({ ok: true, events_received: capiData.events_received });

  } catch(e) {
    console.error('[CAPI] Exception:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
