/**
 * /api/daily-recap — Rekap harian otomatis via WA (Fonnte)
 *
 * Dijalankan otomatis jam 08.00 WIB setiap hari via Vercel Cron (schedule: "0 1 * * *")
 * Bisa juga dipanggil manual: GET /api/daily-recap?secret=CRON_SECRET
 *
 * Env vars yang dibutuhkan:
 *   SUPABASE_URL         — project URL Supabase
 *   SUPABASE_SERVICE_KEY — service role key (bukan anon key, agar bisa baca semua data)
 *   FONNTE_TOKEN_REKAP   — token Fonnte nomor khusus rekap
 *   ANTHROPIC_API_KEY    — untuk generate motivasi AI
 *   SPV_WA_NUMBERS       — nomor WA SPV dipisah koma, e.g. "6281234,6285678"
 *   CRON_SECRET          — (opsional) untuk proteksi trigger manual
 */

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FONNTE_TOKEN         = process.env.FONNTE_TOKEN_REKAP;
const ANTHROPIC_API_KEY    = process.env.ANTHROPIC_API_KEY;
const SPV_WA_NUMBERS       = (process.env.SPV_WA_NUMBERS || '').split(',').map(s => s.trim()).filter(Boolean);

// ── Helpers ──────────────────────────────────────────────

function getWIBDateRange() {
  // Kemarin WIB: mulai 00:00 s/d 23:59 WIB (UTC+7)
  // Cron jalan jam 08.00 WIB = rekap KEMARIN full day
  const now = new Date();
  // Kemarin midnight WIB = UTC kemarin 17:00
  const wibOffset = 7 * 60 * 60 * 1000;
  const todayWIBMidnight = new Date(Math.floor((now.getTime() + wibOffset) / 86400000) * 86400000 - wibOffset);
  const yesterdayWIBMidnight = new Date(todayWIBMidnight.getTime() - 86400000);

  return {
    start: yesterdayWIBMidnight.toISOString(),
    end:   todayWIBMidnight.toISOString(),
    label: yesterdayWIBMidnight.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

async function sbFetch(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey':        SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  if (!r.ok) throw new Error(`Supabase error: ${await r.text()}`);
  return r.json();
}

async function sendWA(target, message) {
  const r = await fetch('https://api.fonnte.com/send', {
    method: 'POST',
    headers: { 'Authorization': FONNTE_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, message }),
  });
  const data = await r.json();
  if (!data.status) console.error('[Rekap] Fonnte error ke', target, JSON.stringify(data));
  return data;
}

async function generateMotivasi(csName, total, closing, rate) {
  try {
    const prompt = rate >= 70
      ? `CS bernama ${csName} punya performa luar biasa hari ini: ${total} order masuk, ${closing} closing, closing rate ${rate}%. Tulis 1-2 kalimat penyemangat singkat dalam Bahasa Indonesia yang natural, hangat, dan spesifik terhadap pencapaian ini. Jangan lebay, jangan pakai emoji. Langsung ke kalimat motivasinya saja.`
      : rate >= 40
      ? `CS bernama ${csName} punya performa cukup hari ini: ${total} order masuk, ${closing} closing, closing rate ${rate}%. Tulis 1-2 kalimat penyemangat singkat dalam Bahasa Indonesia yang natural dan mendorong untuk lebih baik lagi. Jangan lebay, jangan pakai emoji. Langsung ke kalimat motivasinya saja.`
      : total === 0
      ? `CS bernama ${csName} tidak ada order masuk hari ini. Tulis 1-2 kalimat penyemangat singkat dalam Bahasa Indonesia yang tetap positif dan mendorong semangat. Jangan lebay, jangan pakai emoji. Langsung ke kalimat motivasinya saja.`
      : `CS bernama ${csName} perlu dorongan: ${total} order masuk tapi hanya ${closing} closing (${rate}%). Tulis 1-2 kalimat penyemangat singkat dalam Bahasa Indonesia yang jujur tapi tetap memotivasi. Jangan lebay, jangan pakai emoji. Langsung ke kalimat motivasinya saja.`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 120,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });
    const data = await r.json();
    return data.content?.[0]?.text?.trim() || '';
  } catch(e) {
    console.error('[Rekap] AI error:', e.message);
    return '';
  }
}

// ── Main Handler ─────────────────────────────────────────

module.exports = async function handler(req, res) {
  // Proteksi: hanya Vercel Cron atau yang punya secret
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const reqSecret = req.query?.secret || req.headers?.['x-cron-secret'];
    if (reqSecret !== secret) return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Supabase env belum diset' });
  if (!FONNTE_TOKEN)    return res.status(500).json({ error: 'FONNTE_TOKEN_REKAP belum diset' });
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY belum diset' });

  const { start, end, label } = getWIBDateRange();
  console.log(`[Rekap] Proses rekap untuk: ${label} (${start} - ${end})`);

  try {
    // 1. Fetch semua order kemarin + join cs_team + products
    const orders = await sbFetch(
      `orders?select=id,status,cs_id,product_id,cs_team(id,name,wa_number),products(name)&created_at=gte.${start}&created_at=lt.${end}&order=created_at.asc`
    );

    // 2. Agregasi per CS
    const csMap = {}; // { cs_id: { name, wa_number, total, closing, products: { product_name: { total, closing } } } }
    for (const o of orders) {
      const csId   = o.cs_id;
      const csName = o.cs_team?.name || 'Unknown CS';
      const csWa   = o.cs_team?.wa_number || '';
      const prodName = o.products?.name || 'Unknown';
      const isClosing = o.status === 'closing';

      if (!csMap[csId]) csMap[csId] = { name: csName, wa: csWa, total: 0, closing: 0, products: {} };
      csMap[csId].total++;
      if (isClosing) csMap[csId].closing++;

      if (!csMap[csId].products[prodName]) csMap[csId].products[prodName] = { total: 0, closing: 0 };
      csMap[csId].products[prodName].total++;
      if (isClosing) csMap[csId].products[prodName].closing++;
    }

    // 3. Kirim WA ke masing-masing CS
    const csResults = [];
    for (const [csId, cs] of Object.entries(csMap)) {
      if (!cs.wa) { console.warn('[Rekap] CS tanpa WA number:', cs.name); continue; }

      const rate = cs.total > 0 ? Math.round((cs.closing / cs.total) * 100) : 0;
      const motivasi = await generateMotivasi(cs.name, cs.total, cs.closing, rate);

      const rateEmoji = rate >= 70 ? '🔥' : rate >= 40 ? '📈' : '💪';

      const msg =
`Halo *${cs.name}* 👋

📊 *Rekap Harian — ${label}*

📥 Order Masuk: *${cs.total}*
✅ Closing: *${cs.closing}*
${rateEmoji} Closing Rate: *${rate}%*
${motivasi ? `\n💬 _${motivasi}_` : ''}

— OrderAdsy`;

      await sendWA(cs.wa, msg);
      console.log(`[Rekap] Terkirim ke CS: ${cs.name} (${cs.wa})`);
      csResults.push({ name: cs.name, wa: cs.wa, total: cs.total, closing: cs.closing, rate, products: cs.products });
    }

    // 4. Susun rekap SPV per produk
    if (SPV_WA_NUMBERS.length > 0) {
      // Agregasi per produk
      const prodMap = {}; // { product_name: [{ csName, total, closing }] }
      for (const cs of csResults) {
        for (const [prodName, stat] of Object.entries(cs.products)) {
          if (!prodMap[prodName]) prodMap[prodName] = [];
          prodMap[prodName].push({ name: cs.name, total: stat.total, closing: stat.closing });
        }
      }

      const grandTotal   = csResults.reduce((a, c) => a + c.total, 0);
      const grandClosing = csResults.reduce((a, c) => a + c.closing, 0);
      const grandRate    = grandTotal > 0 ? Math.round((grandClosing / grandTotal) * 100) : 0;

      let spvMsg = `📊 *Rekap Harian Semua CS*\n*${label}*\n`;

      for (const [prodName, csList] of Object.entries(prodMap)) {
        spvMsg += `\n🛍️ *${prodName}*\n`;
        for (const cs of csList) {
          const r = cs.total > 0 ? Math.round((cs.closing / cs.total) * 100) : 0;
          spvMsg += `• ${cs.name}: ${cs.total} order, ${cs.closing} closing (${r}%)\n`;
        }
      }

      const rateEmoji = grandRate >= 70 ? '🔥' : grandRate >= 40 ? '📈' : '💪';
      spvMsg +=
`\n📈 *Total Keseluruhan*
Order: *${grandTotal}* | Closing: *${grandClosing}* | Rate: ${rateEmoji} *${grandRate}%*

— OrderAdsy`;

      for (const spvWa of SPV_WA_NUMBERS) {
        await sendWA(spvWa, spvMsg);
        console.log(`[Rekap] Terkirim ke SPV: ${spvWa}`);
      }
    }

    return res.status(200).json({ ok: true, date: label, cs_count: csResults.length });

  } catch(e) {
    console.error('[Rekap] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
