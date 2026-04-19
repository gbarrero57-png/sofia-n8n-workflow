/**
 * patch_lead_welcome.mjs
 * Adds Email (Brevo) + WhatsApp (Twilio template) to Meta leads workflow.
 * Run: node scripts/patch_lead_welcome.mjs
 */

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const BASE = 'https://workflows.n8n.redsolucionesti.com';
const WF_ID = 'J5aUVLsnYNNZw9Rq';

const emailHtml = `<!DOCTYPE html>
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
          <p style="color:#1a1a1a;font-size:17px;margin:0 0 16px;">Hola <strong>{{NOMBRE_FIRST}}</strong></p>
          <p style="color:#444;font-size:15px;line-height:1.7;margin:0 0 24px;">
            Vi que te intereso <strong>SofIA</strong> — el asistente de inteligencia artificial que transforma la gestion de citas en clinicas dentales.
          </p>

          <!-- Features box -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7ff;border-radius:10px;margin:0 0 28px;">
            <tr><td style="padding:24px 28px;">
              <p style="margin:0 0 14px;font-weight:700;color:#1a73e8;font-size:15px;">Que hace SofIA por tu clinica?</p>
              <p style="margin:0 0 10px;color:#333;font-size:14px;">Atiende WhatsApp <strong>24/7 sin intervencion humana</strong></p>
              <p style="margin:0 0 10px;color:#333;font-size:14px;">Agenda, confirma y reagenda citas <strong>de forma autonoma</strong></p>
              <p style="margin:0 0 10px;color:#333;font-size:14px;">Envia recordatorios 24h antes para <strong>reducir inasistencias</strong></p>
              <p style="margin:0 0 10px;color:#333;font-size:14px;">Se integra a tu WhatsApp actual, <strong>sin cambiar de numero</strong></p>
              <p style="margin:0;color:#333;font-size:14px;">Reportes mensuales con metricas de tu clinica</p>
            </td></tr>
          </table>

          <!-- CTA Button -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
            <tr><td align="center">
              <a href="https://wa.me/51977588512?text=Hola%2C%20quiero%20ver%20una%20demo%20de%20SofIA"
                 style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 36px;border-radius:50px;">
                Agendar Demo Gratis por WhatsApp
              </a>
            </td></tr>
          </table>

          <p style="color:#666;font-size:13px;text-align:center;margin:0 0 28px;">
            Tambien puedes escribirnos directamente al <strong>+51 977 588 512</strong>
          </p>

          <!-- Links -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e8edf5;">
            <tr><td style="padding-top:24px;">
              <p style="margin:0 0 12px;font-weight:700;color:#333;font-size:14px;">Conocenos mas:</p>
              <p style="margin:0 0 8px;font-size:13px;color:#555;">
                Sitio web: <a href="https://redsolucionesti.com" style="color:#1a73e8;text-decoration:none;">redsolucionesti.com</a>
              </p>
              <p style="margin:0 0 8px;font-size:13px;color:#555;">
                Demo en vivo: <a href="https://wa.me/51977588512" style="color:#1a73e8;text-decoration:none;">Habla con SofIA ahora mismo</a>
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8f9fa;padding:24px 40px;border-top:1px solid #e8edf5;">
          <p style="margin:0 0 4px;font-size:14px;color:#333;font-weight:600;">Gabriel Barrero</p>
          <p style="margin:0 0 4px;font-size:12px;color:#777;">CEO - RedSoluciones TI</p>
          <p style="margin:0;font-size:12px;color:#777;">gabriel@redsolucionesti.com | +51 977 588 512</p>
        </td></tr>

      </table>
      <p style="color:#aaa;font-size:11px;margin:16px 0 0;text-align:center;">
        Recibiste este mensaje porque completaste un formulario de SofIA.<br>
        RedSoluciones TI - Lima, Peru
      </p>
    </td></tr>
  </table>
</body>
</html>`;

async function main() {
  const wf = await fetch(`${BASE}/api/v1/workflows/${WF_ID}`, {
    headers: { 'X-N8N-API-KEY': API_KEY }
  }).then(r => r.json());

  // Remove old SMS node if still present
  wf.nodes = wf.nodes.filter(n => n.name !== 'SMS Inmediato Twilio');

  // ── Email via Brevo SMTP ──────────────────────────────────────────────────
  const emailNode = {
    id: 'email-lead',
    name: 'Email Bienvenida Lead',
    type: 'n8n-nodes-base.emailSend',
    typeVersion: 2,
    position: [1300, 540],
    parameters: {
      fromEmail: '"SofIA by RedSoluciones TI" <gabriel@redsolucionesti.com>',
      toEmail: '={{ $json.email }}',
      subject: '={{ "Hola " + ($json.nombre || "").split(" ")[0] + " - Tu demo de SofIA te espera" }}',
      emailFormat: 'html',
      html: emailHtml.replace('{{NOMBRE_FIRST}}', '={{ ($json.nombre || "").split(" ")[0] }}'),
      options: {}
    },
    credentials: {
      smtp: { id: 'smtp-brevo', name: 'Brevo SMTP' }
    }
  };

  // ── WhatsApp via Twilio ContentSid (template required for first contact) ──
  // ContentSid will be updated once template is approved.
  // To get the approved SID: run node scripts/create_lead_welcome_template.mjs
  const waNode = {
    id: 'wa-lead',
    name: 'WhatsApp Bienvenida Lead',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4,
    position: [1520, 540],
    parameters: {
      method: 'POST',
      url: 'https://api.twilio.com/2010-04-01/Accounts/AC4080780a4b4a7d8e7b107a39f01abad3/Messages.json',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBasicAuth',
      sendBody: true,
      contentType: 'form-urlencoded',
      bodyParameters: {
        parameters: [
          { name: 'To',               value: '=whatsapp:+51{{ $json.telefono.replace(/\\D/g, "") }}' },
          { name: 'From',             value: 'whatsapp:+13186683828' },
          { name: 'ContentSid',       value: 'PENDING_APPROVAL' },
          { name: 'ContentVariables', value: '={{ JSON.stringify({"1": ($json.nombre || "").split(" ")[0]}) }}' }
        ]
      },
      options: {
        response: { response: { responseFormat: 'json' } },
        allowUnauthorizedCerts: false
      }
    },
    credentials: {
      httpBasicAuth: { id: 'yh9g07Rj36ac5eE0', name: 'Twilio API' }
    }
  };

  // Remove existing versions if re-running
  wf.nodes = wf.nodes.filter(n => !['Email Bienvenida Lead', 'WhatsApp Bienvenida Lead'].includes(n.name));
  wf.nodes.push(emailNode, waNode);

  // ── Connections: Airtable → Email → WhatsApp → Responder OK ──────────────
  wf.connections['Guardar en Airtable'] = {
    main: [[{ node: 'Email Bienvenida Lead', type: 'main', index: 0 }]]
  };
  wf.connections['Email Bienvenida Lead'] = {
    main: [[{ node: 'WhatsApp Bienvenida Lead', type: 'main', index: 0 }]]
  };
  wf.connections['WhatsApp Bienvenida Lead'] = {
    main: [[{ node: 'Responder OK', type: 'main', index: 0 }]]
  };

  const r = await fetch(`${BASE}/api/v1/workflows/${WF_ID}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings, staticData: null })
  });
  const d = await r.json();
  if (r.ok) {
    console.log('✅ Workflow updated:', d.id);
    const nodeNames = d.nodes?.map(n => n.name);
    console.log('   Nodes:', nodeNames?.join(', '));
  } else {
    console.error('❌ Error:', JSON.stringify(d).slice(0, 400));
  }
}

main().catch(console.error);
