/**
 * build_auto_resume_bot.mjs
 * Creates an n8n cron workflow that automatically resumes paused bots.
 *
 * Logic (Option A):
 *   Every hour, queries Supabase for conversations where:
 *     - bot_paused = true
 *     - updated_at < now() - interval 'N hours'  (default 4h, configurable via clinic bot_config.auto_resume_hours)
 *   For each stale conversation:
 *     1. Calls resume_conversation RPC (sets bot_paused=false, status=active in Supabase)
 *     2. Sets Chatwoot conversation status back to "open"
 *     3. Sends a polite "bot resumed" message to the patient in Chatwoot
 *   Sends Telegram summary report of what was resumed.
 *
 * Run: node scripts/build_auto_resume_bot.mjs
 */

const API_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const BASE     = 'https://workflows.n8n.redsolucionesti.com';
const CHAT_ID  = '-4523041658';
const CHATWOOT = 'https://chat.redsolucionesti.com';

// ── Code: find stale paused conversations ─────────────────────────────────
const CODE_FIND = `
const SUPABASE_URL = $env.N8N_SUPABASE_URL;
const SERVICE_KEY  = $env.N8N_SUPABASE_SERVICE_KEY;
const DEFAULT_RESUME_HOURS = 4;

// Fetch all paused conversations with their clinic bot_config
// PostgREST embedded relation: clinic:clinics(name,bot_config,chatwoot_api_token_unused)
const resp = await this.helpers.httpRequest({
  method: 'GET',
  url: SUPABASE_URL + '/rest/v1/conversations' +
       '?bot_paused=eq.true' +
       '&select=id,clinic_id,chatwoot_conversation_id,patient_name,last_message,updated_at,clinic:clinics(name,bot_config)',
  headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY },
  json: true
});

const rows = Array.isArray(resp) ? resp : [];
const now  = new Date();
const stale = [];

for (const row of rows) {
  const bc            = (row.clinic && row.clinic.bot_config) || {};
  const resumeHours   = Number(bc.auto_resume_hours || DEFAULT_RESUME_HOURS);
  const updatedAt     = new Date(row.updated_at);
  const ageHours      = (now - updatedAt) / 3600000;

  if (ageHours >= resumeHours) {
    stale.push({
      conversation_uuid:      row.id,
      clinic_id:              row.clinic_id,
      chatwoot_conversation_id: row.chatwoot_conversation_id,
      patient_name:           row.patient_name || 'Paciente',
      last_message:           (row.last_message || '').slice(0, 100),
      clinic_name:            (row.clinic && row.clinic.name) || 'Clínica',
      chatwoot_api_token:     (bc.chatwoot_api_token) || '',
      account_id:             2,
      age_hours:              Math.round(ageHours * 10) / 10,
      resume_hours:           resumeHours
    });
  }
}

console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'AUTO_RESUME_CHECK', paused_total: rows.length, stale_count: stale.length }));

if (stale.length === 0) {
  // Nothing to do — return empty to stop the workflow gracefully
  return [];
}

return stale.map(function(s) { return { json: s }; });
`.trim();

// ── Code: resume each conversation ───────────────────────────────────────
const CODE_RESUME = `
const SUPABASE_URL = $env.N8N_SUPABASE_URL;
const SERVICE_KEY  = $env.N8N_SUPABASE_SERVICE_KEY;
const ctx = $input.first().json;

const results = [];

for (const item of $input.all()) {
  const c = item.json;
  let supabaseOk = false;
  let chatwootOk = false;

  // 1. Resume in Supabase governance
  try {
    const r1 = await this.helpers.httpRequest({
      method: 'POST',
      url: SUPABASE_URL + '/rest/v1/rpc/resume_conversation',
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' },
      body: { p_conversation_id: c.conversation_uuid, p_clinic_id: c.clinic_id, p_user_role: 'admin' },
      json: true
    });
    supabaseOk = r1 && r1.success === true;
    if (!supabaseOk) console.warn('resume_conversation returned:', JSON.stringify(r1));
  } catch(e) {
    console.error('Supabase resume error:', e.message);
  }

  // 2. Reopen in Chatwoot (status: open)
  if (c.chatwoot_api_token && c.chatwoot_conversation_id) {
    try {
      await this.helpers.httpRequest({
        method: 'POST',
        url: 'https://chat.redsolucionesti.com/api/v1/accounts/' + c.account_id + '/conversations/' + c.chatwoot_conversation_id + '/toggle_status',
        headers: { 'api_access_token': c.chatwoot_api_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'open' }),
        json: false
      });
      chatwootOk = true;
    } catch(e) {
      console.warn('Chatwoot reopen error:', e.message);
    }

    // 3. Notify patient that bot is back
    if (chatwootOk) {
      try {
        const resumeMsg = '\\uD83E\\uDD16 Hola! Soy SofIA nuevamente.' +
          ' Estuve conectado con nuestro equipo pero parece que no pudieron atenderte.' +
          ' \\uD83D\\uDE4F\\n\\n\\u00BFEn qu\\u00E9 puedo ayudarte?';
        await this.helpers.httpRequest({
          method: 'POST',
          url: 'https://chat.redsolucionesti.com/api/v1/accounts/' + c.account_id + '/conversations/' + c.chatwoot_conversation_id + '/messages',
          headers: { 'api_access_token': c.chatwoot_api_token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: resumeMsg, message_type: 'outgoing', private: false }),
          json: false
        });
      } catch(e) {
        console.warn('Chatwoot message error:', e.message);
      }
    }
  }

  results.push(Object.assign({}, c, { supabase_resumed: supabaseOk, chatwoot_reopened: chatwootOk }));
  console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'AUTO_RESUMED', clinic: c.clinic_name, conv_id: c.chatwoot_conversation_id, age_hours: c.age_hours }));
}

return results.map(function(r) { return { json: r }; });
`.trim();

// ── Code: build Telegram summary ─────────────────────────────────────────
const CODE_SUMMARY = `
const items = $input.all();
const ok  = items.filter(function(i) { return i.json.supabase_resumed; }).length;
const err = items.length - ok;

var lines = items.map(function(i) {
  var c = i.json;
  var icon = c.supabase_resumed ? '\\u2705' : '\\u274C';
  return icon + ' *' + c.patient_name + '* (' + c.clinic_name + ') — pausado ' + c.age_hours + 'h';
});

return [{ json: {
  total:   items.length,
  ok:      ok,
  errors:  err,
  lines:   lines.join('\\n'),
  summary: ok + ' bots reanudados automáticamente'
} }];
`.trim();

// ── Build workflow JSON ───────────────────────────────────────────────────
const wf = {
  name: 'SofIA - Auto Resume Bot',
  nodes: [
    // 1. Cron: every hour at minute 5 (UTC)
    {
      id: 'cron', name: 'Cada Hora',
      type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1,
      position: [0, 300],
      parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 1 }] } }
    },
    // 2. Find stale paused conversations
    {
      id: 'find', name: 'Buscar Pausadas Vencidas',
      type: 'n8n-nodes-base.code', typeVersion: 2,
      position: [220, 300],
      parameters: { jsCode: CODE_FIND }
    },
    // 3. Resume each one
    {
      id: 'resume', name: 'Reanudar Conversaciones',
      type: 'n8n-nodes-base.code', typeVersion: 2,
      position: [440, 300],
      parameters: { mode: 'runOnceForAllItems', jsCode: CODE_RESUME }
    },
    // 4. Build summary
    {
      id: 'summary', name: 'Construir Resumen',
      type: 'n8n-nodes-base.code', typeVersion: 2,
      position: [660, 300],
      parameters: { mode: 'runOnceForAllItems', jsCode: CODE_SUMMARY }
    },
    // 5. Telegram notification
    {
      id: 'telegram', name: 'Reporte Telegram',
      type: 'n8n-nodes-base.telegram', typeVersion: 1,
      position: [880, 300],
      parameters: {
        chatId: CHAT_ID,
        text: '=🤖 *Auto-Resume Bot*\n\n✅ *{{ $json.ok }}* bots reanudados\n❌ *{{ $json.errors }}* errores\n\n{{ $json.lines }}\n\n_Reactivados automáticamente por inactividad del agente_',
        additionalFields: { parse_mode: 'Markdown' }
      },
      credentials: { telegramApi: { id: 'cSaxAEvIePNLpINc', name: 'Telegram account' } }
    }
  ],
  connections: {
    'Cada Hora':               { main: [[{ node: 'Buscar Pausadas Vencidas', type: 'main', index: 0 }]] },
    'Buscar Pausadas Vencidas':{ main: [[{ node: 'Reanudar Conversaciones', type: 'main', index: 0 }]] },
    'Reanudar Conversaciones': { main: [[{ node: 'Construir Resumen', type: 'main', index: 0 }]] },
    'Construir Resumen':       { main: [[{ node: 'Reporte Telegram', type: 'main', index: 0 }]] }
  },
  settings: { executionOrder: 'v1' }
};

// ── Create and activate ───────────────────────────────────────────────────
const r1 = await fetch(`${BASE}/api/v1/workflows`, {
  method: 'POST',
  headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify(wf)
});
const d1 = await r1.json();
if (!d1.id) { console.error('❌ Create failed:', JSON.stringify(d1).slice(0,300)); process.exit(1); }
console.log('✅ Workflow creado:', d1.id, '—', d1.name);

const r2 = await fetch(`${BASE}/api/v1/workflows/${d1.id}/activate`, {
  method: 'POST', headers: { 'X-N8N-API-KEY': API_KEY }
});
console.log('✅ Activado — corre cada hora, reanuda bots pausados > 4h sin respuesta del agente');
console.log('');
console.log('⚙️  Timeout configurable por clínica:');
console.log('   bot_config.auto_resume_hours = N  (default: 4)');
console.log('   Ej: 2 para clínicas demo, 8 para clínicas grandes con agentes nocturnos');
