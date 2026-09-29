/**
 * /api/send-tiktok-event — Kirim event ke TikTok Events API
 *
 * POST body:
 * {
 *   pixel_code, access_token, event_name, event_id,
 *   user_data: { ph, em },
 *   custom_data: { product_id, product_name, value, currency, order_id },
 *   event_source_url
 * }
 */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    pixel_code, access_token, event_name = 'Purchase',
    event_id, user_data = {}, custom_data = {},
    event_source_url,
  } = req.body || {};

  if (!pixel_code || !access_token) {
    return res.status(400).json({ error: 'pixel_code dan access_token wajib' });
  }

  const { createHash } = await import('crypto');
  function sha256(str) {
    if (!str) return undefined;
    return createHash('sha256').update(str.trim().toLowerCase()).digest('hex');
  }

  // TikTok butuh phone dalam format E.164 tanpa + sebelum di-hash
  const phone = user_data.ph ? user_data.ph.replace(/\D/g, '') : null;

  const payload = {
    event_source:    'web',
    event_source_id: pixel_code,
    data: [{
      event:      event_name,
      event_time: Math.floor(Date.now() / 1000),
      event_id:   event_id || Date.now().toString(36),
      user: {
        ...(phone        ? { phone_numbers: [sha256(phone)] } : {}),
        ...(user_data.em ? { emails:        [sha256(user_data.em)] } : {}),
      },
      properties: {
        value:    custom_data.value    || 0,
        currency: custom_data.currency || 'IDR',
        order_id: custom_data.order_id || undefined,
        num_items: 1,
        contents: [{
          content_id:   String(custom_data.product_id || ''),
          content_name: custom_data.product_name || '',
          quantity:     1,
          price:        custom_data.value || 0,
        }],
      },
      page: {
        url: event_source_url || '',
      },
    }],
  };

  try {
    const ttRes = await fetch(
      'https://business-api.tiktok.com/open_api/v1.3/event/track/',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Token':  access_token,
        },
        body: JSON.stringify(payload),
      }
    );
    const ttData = await ttRes.json();

    if (!ttRes.ok || ttData.code !== 0) {
      console.error('[TikTok Events] Error:', JSON.stringify(ttData));
      return res.status(500).json({ error: 'TikTok Events API error', details: ttData });
    }

    console.log('[TikTok Events] Success:', event_name, '| request_id:', ttData.request_id);
    return res.status(200).json({ ok: true, request_id: ttData.request_id });

  } catch(e) {
    console.error('[TikTok Events] Exception:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
