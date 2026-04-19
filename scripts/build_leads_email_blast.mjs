/**
 * build_leads_email_blast.mjs
 * Crea workflow one-shot: envía email a los 15 leads antiguos mañana 9am Lima
 * y confirma por Telegram.
 * Run: node scripts/build_leads_email_blast.mjs
 */

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const BASE = 'https://workflows.n8n.redsolucionesti.com';

const leads = [
  { nombre: 'Marvin Charles Cangalaya Barzola', email: 'marvincharles_2@hotmail.com', citas: 'menos_de_20' },
  { nombre: 'José Santos',                      email: 'jsgen06@gmail.com',           citas: 'menos_de_20' },
  { nombre: 'Daniel Alca',                      email: 'danielalca80@hotmail.com',    citas: 'menos_de_20' },
  { nombre: 'Pedro',                            email: 'pedromartinezf34@gmail.com',  citas: 'más_de_50'   },
  { nombre: 'Luis Enrique',                     email: 'luisdiaque0510@gmail.com',    citas: 'más_de_50'   },
  { nombre: 'Óscar Becerra',                    email: 'carrascoandres402@gmail.com', citas: 'entre_20_y_50'},
  { nombre: 'Alex',                             email: 'dr.alexander.alvarez@gmail.com', citas: 'menos_de_20'},
  { nombre: 'Arnaldo Alvarez',                  email: 'alvarezarnaldo84@gmail.com',  citas: 'menos_de_20' },
  { nombre: 'Maria Rios',                       email: 'mjmayu@yahoo.com',            citas: 'menos_de_20' },
  { nombre: 'Lucero Cabana',                    email: 'Cabanalucero175@gmail.com',   citas: 'más_de_50'   },
  { nombre: 'Enrique',                          email: 'enriver18@gmail.com',         citas: 'entre_20_y_50'},
  { nombre: 'Luis Alberto Saavedra Santi',      email: 'Fisiomanosperusac@gmail.com', citas: 'entre_20_y_50'},
  { nombre: 'Héctor Meléndez',                  email: 'hector.melendez1999@gmail.com', citas: 'entre_20_y_50'},
  { nombre: 'Milagros Vega',                    email: 'milagros.vega@upch.pe',       citas: 'menos_de_20' },
  { nombre: 'Gabriel Barrero',                  email: 'gaboalejandro57@gmail.com',   citas: 'entre_20_y_50'},
];

// ── Email HTML ──────────────────────────────────────────────────────────────
const htmlTemplate = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1a73e8 0%,#0d47a1 100%);padding:32px 40px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:700;">SofIA</h1>
          <p style="color:#bbdefb;margin:6px 0 0;font-size:14px;">Asistente de IA para Clinicas Dentales</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:40px;">
          <p style="color:#1a1a1a;font-size:17px;margin:0 0 20px;">Hola <strong>NOMBRE_FIRST</strong>,</p>

          <p style="color:#444;font-size:15px;line-height:1.8;margin:0 0 24px;">
            Mi nombre es <strong>Gabriel Barrero</strong>, CEO de <strong>RedSoluciones TI</strong>.
            Hace unos dias mostraste interes en <strong>SofIA</strong>, nuestra solucion de inteligencia
            artificial para clinicas dentales, y queria escribirte personalmente.
          </p>

          <p style="color:#444;font-size:15px;line-height:1.8;margin:0 0 28px;">
            Muchos directores de clinica como tu nos dicen lo mismo: el equipo pasa demasiado tiempo
            respondiendo WhatsApp, confirmando citas y persiguiendo pacientes que no aparecen.
            <strong>SofIA resuelve exactamente eso</strong>, de forma automatica y sin cambiar tu numero actual.
          </p>

          <!-- Features box -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7ff;border-radius:10px;margin:0 0 28px;">
            <tr><td style="padding:24px 28px;">
              <p style="margin:0 0 16px;font-weight:700;color:#1a73e8;font-size:15px;">Lo que SofIA hace por tu clinica:</p>
              <p style="margin:0 0 10px;color:#333;font-size:14px;line-height:1.6;">Atiende WhatsApp <strong>24 horas al dia, 7 dias a la semana</strong> — sin intervenci&oacute;n humana</p>
              <p style="margin:0 0 10px;color:#333;font-size:14px;line-height:1.6;">Agenda, confirma y reagenda citas <strong>de forma autonoma</strong></p>
              <p style="margin:0 0 10px;color:#333;font-size:14px;line-height:1.6;">Envia recordatorios autom&aacute;ticos 24h antes para <strong>reducir inasistencias</strong></p>
              <p style="margin:0 0 10px;color:#333;font-size:14px;line-height:1.6;">Se integra a tu WhatsApp actual, <strong>sin cambiar de numero</strong></p>
              <p style="margin:0;color:#333;font-size:14px;line-height:1.6;">Reportes mensuales con m&eacute;tricas reales de tu clinica</p>
            </td></tr>
          </table>

          <!-- CTA principal -->
          <p style="color:#333;font-size:15px;font-weight:600;margin:0 0 16px;">
            Me gustaria mostrarte como funciona en tu clinica especificamente.
          </p>
          <p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 24px;">
            Tengo disponibilidad esta semana para una <strong>demo de 10 minutos</strong> por videollamada
            o WhatsApp. Sin compromiso, solo para que veas el sistema en accion.
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
            <tr><td align="center">
              <a href="https://wa.me/51905858566?text=Hola%20Gabriel%2C%20vi%20tu%20mensaje%20sobre%20SofIA%20y%20me%20interesa%20la%20demo%20de%2010%20minutos"
                 style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 36px;border-radius:50px;box-shadow:0 4px 12px rgba(37,211,102,0.3);">
                Agendar mi demo de 10 minutos
              </a>
            </td></tr>
          </table>

          <p style="color:#888;font-size:13px;text-align:center;margin:0 0 32px;">
            Presiona el boton y te escribo de inmediato por WhatsApp
          </p>

          <!-- Credibilidad -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e8edf5;margin-bottom:4px;">
            <tr><td style="padding-top:24px;">
              <p style="margin:0 0 12px;font-weight:700;color:#333;font-size:14px;">Sobre nosotros:</p>
              <p style="margin:0 0 8px;font-size:13px;color:#555;line-height:1.6;">
                Sitio web: <a href="https://redsolucionesti.com" style="color:#1a73e8;text-decoration:none;">redsolucionesti.com</a>
              </p>
              <p style="margin:0 0 8px;font-size:13px;color:#555;line-height:1.6;">
                Demo en vivo de SofIA: <a href="https://wa.me/51977588512" style="color:#1a73e8;text-decoration:none;">+51 977 588 512</a>
                <span style="color:#aaa;"> (escribe "Hola" y SofIA te atiende en tiempo real)</span>
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Firma CEO -->
        <tr><td style="background:#f8f9fa;padding:24px 40px;border-top:1px solid #e8edf5;">
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-right:16px;vertical-align:top;">
                <div style="width:48px;height:48px;border-radius:50%;background:#1a73e8;display:flex;align-items:center;justify-content:center;color:white;font-size:18px;font-weight:700;text-align:center;line-height:48px;">G</div>
              </td>
              <td style="vertical-align:top;">
                <p style="margin:0 0 2px;font-size:15px;color:#1a1a1a;font-weight:700;">Gabriel Barrero</p>
                <p style="margin:0 0 2px;font-size:12px;color:#1a73e8;font-weight:600;">CEO &amp; Founder — RedSoluciones TI</p>
                <p style="margin:0 0 2px;font-size:12px;color:#777;">WhatsApp: <a href="https://wa.me/51905858566" style="color:#1a73e8;text-decoration:none;">+51 905 858 566</a></p>
                <p style="margin:0;font-size:12px;color:#777;">gabriel@redsolucionesti.com</p>
              </td>
            </tr>
          </table>
        </td></tr>

      </table>
      <p style="color:#bbb;font-size:11px;margin:16px 0 0;text-align:center;">
        Recibiste este mensaje porque completaste un formulario de interes en SofIA.<br>
        RedSoluciones TI &middot; Lima, Peru
      </p>
    </td></tr>
  </table>
</body>
</html>`;

// ── Build workflow ──────────────────────────────────────────────────────────
const wf = {
  name: 'SofIA - Email Blast Leads Apr12',
  nodes: [
    // 1. Cron: tomorrow 9am Lima = 14:00 UTC (Lima = UTC-5)
    {
      id: 'cron', name: 'Cron 9am Lima Apr12',
      type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1,
      position: [0, 300],
      parameters: {
        rule: {
          interval: [{ field: 'cronExpression', expression: '0 14 12 4 *' }]
        }
      }
    },
    // 2. Leads data
    {
      id: 'leads', name: 'Leads Antiguos',
      type: 'n8n-nodes-base.code', typeVersion: 2,
      position: [220, 300],
      parameters: {
        jsCode: 'return ' + JSON.stringify(leads.map(l => ({ json: l }))) + ';'
      }
    },
    // 3. Send email
    {
      id: 'email', name: 'Email Lead Antiguo',
      type: 'n8n-nodes-base.emailSend', typeVersion: 2,
      position: [440, 300],
      parameters: {
        fromEmail: '"Gabriel Barrero - SofIA" <gabriel@redsolucionesti.com>',
        toEmail: '={{ $json.email }}',
        subject: '={{ "Hola " + $json.nombre.split(" ")[0] + " — una demo de 10 min puede cambiar tu clinica" }}',
        emailFormat: 'html',
        html: '=' + JSON.stringify(htmlTemplate) + '.replace("NOMBRE_FIRST", $json.nombre.split(" ")[0])',
        options: {}
      },
      credentials: { smtp: { id: 'jDrJYwwXeKHOtAF9', name: 'Brevo SMTP' } }
    },
    // 4. Aggregate results
    {
      id: 'aggregate', name: 'Contar Enviados',
      type: 'n8n-nodes-base.code', typeVersion: 2,
      position: [660, 300],
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode: `const items = $input.all();
const total = items.length;
const nombres = items.map(i => i.json.nombre.split(' ')[0]).join(', ');
return [{ json: { total, nombres, mensaje: total + ' emails enviados a las 9am del 12 de abril' } }];`
      }
    },
    // 5. Telegram notification
    {
      id: 'telegram', name: 'Confirmar Telegram',
      type: 'n8n-nodes-base.telegram', typeVersion: 1,
      position: [880, 300],
      parameters: {
        chatId: '-4523041658',
        text: `=✅ *Email Blast SofIA — Completado*\n\n📧 {{ $json.total }} emails enviados exitosamente\n\n👥 *Leads contactados:*\n{{ $json.nombres }}\n\n📋 *Email enviado:* Demo de 10 min con CEO\n📱 *CTA:* wa.me/51905858566\n\n_Enviado automáticamente a las 9:00am (hora Lima)_`,
        additionalFields: { parse_mode: 'Markdown' }
      },
      credentials: { telegramApi: { id: 'cSaxAEvIePNLpINc', name: 'Telegram account' } }
    },
    // 6. Deactivate self after running (one-shot)
    {
      id: 'deactivate', name: 'Desactivar Workflow',
      type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
      position: [1100, 300],
      parameters: {
        method: 'POST',
        url: '=https://workflows.n8n.redsolucionesti.com/api/v1/workflows/{{ $workflow.id }}/deactivate',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        options: {}
      },
      credentials: { httpHeaderAuth: { id: 'n8n-api-key', name: 'N8N API Key' } }
    }
  ],
  connections: {
    'Cron 9am Lima Apr12': { main: [[{ node: 'Leads Antiguos', type: 'main', index: 0 }]] },
    'Leads Antiguos':       { main: [[{ node: 'Email Lead Antiguo', type: 'main', index: 0 }]] },
    'Email Lead Antiguo':   { main: [[{ node: 'Contar Enviados', type: 'main', index: 0 }]] },
    'Contar Enviados':      { main: [[{ node: 'Confirmar Telegram', type: 'main', index: 0 }]] },
    'Confirmar Telegram':   { main: [[{ node: 'Desactivar Workflow', type: 'main', index: 0 }]] }
  },
  settings: { executionOrder: 'v1' }
};

// Create and activate
const r = await fetch(`${BASE}/api/v1/workflows`, {
  method: 'POST',
  headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify(wf)
});
const d = await r.json();
if (!d.id) { console.error('Create failed:', JSON.stringify(d)); process.exit(1); }
console.log('✅ Workflow creado:', d.id);

await fetch(`${BASE}/api/v1/workflows/${d.id}/activate`, {
  method: 'POST', headers: { 'X-N8N-API-KEY': API_KEY }
});
console.log('✅ Activado — disparará mañana 12 Apr a las 9:00am Lima (14:00 UTC)');
console.log('   ID para referencia:', d.id);
