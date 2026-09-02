/**
 * /api/send-order-email — Kirim notif email ke CS saat ada order masuk
 * Format email kompatibel dengan parser BotWA (parseOrderEmail)
 *
 * POST body:
 * {
 *   to, cs_name, customer_name, customer_wa,
 *   customer_address, customer_city, product_name, order_id
 * }
 *
 * Butuh env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 * Bisa pakai: Gmail SMTP, Brevo (Sendinblue), Mailgun, dsb.
 */

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    to, cs_name, customer_name, customer_wa,
    customer_address, customer_city, customer_keluhan,
    product_name, order_id, wa_message,
  } = req.body || {};

  if (!to) return res.status(400).json({ error: 'email to wajib' });

  const subject = `Order Baru — ${product_name || 'Produk'}`;

  // Format HTML kompatibel dengan parseOrderEmail BotWA
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
  <div style="background:#2563EB;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;">
    <h2 style="margin:0;font-size:18px;">🛒 Order Baru Masuk!</h2>
    <div style="font-size:12px;opacity:0.8;margin-top:4px;">OrderAdsy</div>
  </div>
  <div style="border:1px solid #E5E7EB;border-top:none;border-radius:0 0 8px 8px;padding:20px;">
    <p style="margin:0 0 16px;color:#374151;">Halo <strong>${cs_name || 'CS'}</strong>, ada order baru untuk kamu handle!</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr>
        <td style="padding:8px 0;color:#6B7280;width:140px;">Nama</td>
        <td style="padding:8px 0;"><strong>${customer_name || '-'}</strong></td>
      </tr>
      <tr style="background:#F9FAFB;">
        <td style="padding:8px 6px;color:#6B7280;">No. WhatsApp</td>
        <td style="padding:8px 6px;"><strong>${customer_wa || '-'}</strong></td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#6B7280;">Alamat</td>
        <td style="padding:8px 0;">${customer_address || '-'}${customer_city ? ', ' + customer_city : ''}</td>
      </tr>
      <tr style="background:#F9FAFB;">
        <td style="padding:8px 6px;color:#6B7280;">Produk</td>
        <td style="padding:8px 6px;"><strong>${product_name || '-'}</strong> Rp0</td>
      </tr>
      ${customer_keluhan ? `
      <tr>
        <td style="padding:8px 0;color:#6B7280;">Keluhan</td>
        <td style="padding:8px 0;">${customer_keluhan}</td>
      </tr>` : ''}
      <tr>
        <td style="padding:8px 0;color:#6B7280;">Order ID</td>
        <td style="padding:8px 0;font-family:monospace;font-size:12px;">${order_id || '-'}</td>
      </tr>
    </table>
    <div style="margin-top:20px;">
      <a href="https://wa.me/${(customer_wa||'').replace(/\D/g,'')}${wa_message ? '?text=' + encodeURIComponent(wa_message) : ''}"
         style="background:#25D366;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;">
        💬 Hubungi via WhatsApp
      </a>
    </div>
    <p style="margin-top:20px;font-size:11px;color:#9CA3AF;">
      Email ini dikirim otomatis oleh OrderAdsy saat customer submit form order.
    </p>
  </div>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from:    process.env.SMTP_FROM || `"OrderAdsy" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });

    console.log('[Email] Sent to:', to, '| order:', order_id);
    return res.status(200).json({ ok: true });

  } catch(e) {
    console.error('[Email] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
