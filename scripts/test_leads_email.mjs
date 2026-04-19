/**
 * test_leads_email.mjs
 * Envía UN email de prueba a gaboalejandro57@gmail.com
 * usando los datos del primer lead "nuevo" de Airtable.
 * Run: node scripts/test_leads_email.mjs
 */

import nodemailer from 'nodemailer';

const AT_TOKEN = process.env.AIRTABLE_PAT;
const AT_URL   = 'https://api.airtable.com/v0/app6a4u9dvXMxwOnY/tblBuVcKITk5GFoqk';
const TEST_TO  = 'gaboalejandro57@gmail.com';

const SMTP = {
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false,
  auth: {
    user: 'a521e9001@smtp-brevo.com',
    pass: process.env.BREVO_SMTP_KEY,
  },
  tls: { rejectUnauthorized: false },
};

// ── Fetch first "nuevo" lead ──────────────────────────────────────────────────
const params = new URLSearchParams();
['nombre','email','ciudad','distrito'].forEach(f => params.append('fields[]', f));
params.set('filterByFormula', 'AND(status="nuevo", email != "")');
params.set('maxRecords', '1');

const atRes = await fetch(`${AT_URL}?${params}`, {
  headers: { Authorization: `Bearer ${AT_TOKEN}` }
});
const atData = await atRes.json();
const sampleLead = atData.records?.[0]?.fields ?? {
  nombre: 'Clínica Ejemplo',
  ciudad: 'Lima',
  distrito: 'Miraflores',
};

console.log('Lead de muestra:', sampleLead);

// ── Email HTML template ───────────────────────────────────────────────────────
function buildHtml(lead, isTest = false) {
  const nombre   = lead.nombre   || 'Estimado/a';
  const ciudad   = lead.ciudad   || '';
  const distrito = lead.distrito || '';
  const wa_link  = 'https://wa.me/51977588512?text=' + encodeURIComponent(
    `Hola Gabriel, vi tu email sobre SofIA y quiero más información.`
  );

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
${isTest ? '<div style="background:#f59e0b;color:#000;text-align:center;padding:8px;font-size:13px;font-weight:bold;">⚠️ EMAIL DE PRUEBA — Destinatario real: ' + nombre + ' (' + (lead.email||'') + ')</div>' : ''}
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;margin-top:20px;margin-bottom:20px;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1e1b4b 0%,#4c1d95 100%);padding:36px 40px;text-align:center;">
    <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:14px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:28px;">🦷</div>
    <h1 style="color:#fff;margin:0;font-size:26px;font-weight:700;letter-spacing:-0.5px;">SofIA</h1>
    <p style="color:#c4b5fd;margin:6px 0 0;font-size:14px;">Asistente de citas dental con inteligencia artificial</p>
  </div>

  <!-- Body -->
  <div style="padding:36px 40px;">
    <p style="font-size:16px;color:#374151;margin-top:0;">Hola, soy <strong>Gabriel</strong> de <strong>RedSoluciones TI</strong> 👋</p>

    <p style="font-size:15px;color:#4b5563;line-height:1.7;">
      Vi que <strong>${nombre}</strong>${ciudad ? ` en ${distrito ? distrito + ', ' : ''}${ciudad}` : ''} tiene
      una presencia destacada y me gustaría presentarles <strong>SofIA</strong>, nuestro asistente de WhatsApp
      con IA diseñado específicamente para clínicas dentales.
    </p>

    <!-- Features -->
    <div style="background:#f8fafc;border-radius:10px;padding:20px 24px;margin:24px 0;">
      <p style="margin:0 0 12px;font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">¿Qué hace SofIA por tu clínica?</p>
      ${[
        ['🕐', 'Atiende pacientes <strong>24/7</strong> por WhatsApp automáticamente'],
        ['📅', 'Agenda citas <strong>sin intervención humana</strong>, revisa disponibilidad en tiempo real'],
        ['🔔', 'Envía <strong>recordatorios automáticos</strong> a pacientes para reducir ausencias'],
        ['📊', 'Panel de control con <strong>métricas y reportes</strong> de conversaciones y citas'],
      ].map(([icon, text]) =>
        `<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">
          <span style="font-size:18px;line-height:1.4;">${icon}</span>
          <span style="font-size:14px;color:#374151;line-height:1.6;">${text}</span>
        </div>`
      ).join('')}
    </div>

    <p style="font-size:15px;color:#4b5563;line-height:1.7;">
      SofIA ya está activo en clínicas dentales de Lima, Arequipa y Trujillo.
      La implementación toma <strong>menos de 48 horas</strong> y no requiere cambiar tu número de WhatsApp.
    </p>

    <!-- CTA primary -->
    <div style="text-align:center;margin:32px 0 20px;">
      <a href="https://sofia.redsolucionesti.com"
         style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4c1d95);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:0.2px;">
        Ver demo de SofIA →
      </a>
    </div>

    <!-- CTA WhatsApp -->
    <div style="text-align:center;margin-bottom:8px;">
      <a href="${wa_link}"
         style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:600;">
        💬 Escribirme por WhatsApp
      </a>
    </div>

    <p style="font-size:13px;color:#9ca3af;text-align:center;margin-top:8px;">
      O responde este email directamente, estaré encantado de coordinar una demo de 10 minutos.
    </p>
  </div>

  <!-- Footer -->
  <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
    <p style="font-size:12px;color:#6b7280;margin:0 0 4px;">
      <strong>Gabriel Barrero</strong> · RedSoluciones TI<br>
      <a href="mailto:gabriel@redsolucionesti.com" style="color:#7c3aed;text-decoration:none;">gabriel@redsolucionesti.com</a> ·
      <a href="https://sofia.redsolucionesti.com" style="color:#7c3aed;text-decoration:none;">sofia.redsolucionesti.com</a>
    </p>
    <p style="font-size:11px;color:#9ca3af;margin:8px 0 0;">
      Si no deseas recibir más emails, responde con "cancelar" en el asunto.
    </p>
  </div>
</div>
</body>
</html>`;
}

// ── Send test email ───────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport(SMTP);

const info = await transporter.sendMail({
  from:    '"Gabriel - RedSoluciones TI" <gabriel@redsolucionesti.com>',
  to:      TEST_TO,
  subject: `[PRUEBA] SofIA — Automatización de citas dental por WhatsApp`,
  html:    buildHtml(sampleLead, true),
  replyTo: 'gabriel@redsolucionesti.com',
});

console.log('✅ Email de prueba enviado:', info.messageId);
console.log('   Destinatario:', TEST_TO);
console.log('   Lead de muestra:', sampleLead.nombre, '|', sampleLead.ciudad);
console.log('\nSi el email se ve bien, ejecuta el blast con:');
console.log('  node scripts/blast_email_leads.mjs');
