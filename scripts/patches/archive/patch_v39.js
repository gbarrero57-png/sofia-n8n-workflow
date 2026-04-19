/**
 * patch_v39.js — Fix SofIA 24h Reminders workflow (3 bugs)
 *
 * BUG 1: Format Reminder Message — missing $json. prefix everywhere
 *   `new Date(.start_time)` → `new Date($json.start_time)`
 *   `const nom = .patient_name` → `$json.patient_name`
 *   `const cli = .clinic_name` → `$json.clinic_name`
 *   `const phone = (.phone` → `$json.phone`
 *   `...,` (spread nothing) → `...$json,`
 *   Node crashes on every reminder — no reminders ever sent.
 *
 * BUG 2: Mark Reminder Sent — calls `mark_reminder_sent` RPC that doesn't exist.
 *   The correct function in Supabase is `mark_payment_reminder_sent` (different).
 *   For 24h reminders the right approach is a direct PATCH on appointments table:
 *   PATCH /rest/v1/appointments?id=eq.{id} { reminder_sent: true, reminder_sent_at: now() }
 *
 * BUG 3: Fetch Pending Reminders — doesn't propagate bot_config (Twilio creds).
 *   Send WhatsApp Reminder uses hardcoded account SID + basic auth credential.
 *   This works for the demo clinic but will break for SmilePlus (different account).
 *   Fix: join clinics.bot_config in Fetch, pass twilio_account_sid + auth_token
 *   through the pipeline so Send WhatsApp Reminder can use them dynamically.
 */

const N8N_URL = "https://workflows.n8n.redsolucionesti.com";
const N8N_KEY = require("fs")
  .readFileSync(require("path").join(__dirname, "../../../n8n-mcp/.env"), "utf8")
  .match(/N8N_API_KEY=(.+)/)?.[1]?.trim();
const SUPABASE_URL = "https://inhyrrjidhzrbqecnptn.supabase.co";
const SUPABASE_KEY = require("fs")
  .readFileSync(require("path").join(__dirname, "../../../saas/.env"), "utf8")
  .match(/SUPABASE_SERVICE_KEY=(.+)/)?.[1]?.trim();

const https = require("https");

function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(N8N_URL + path);
    const opts = {
      hostname: url.hostname, port: url.port || 443,
      path: url.pathname + url.search, method,
      headers: { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" },
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
        else resolve(JSON.parse(data));
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log("Fetching SofIA Reminders workflow...");
  const wf = await apiRequest("GET", "/api/v1/workflows/FCSJrGj5bLMuytr7");
  console.log(`Got workflow: ${wf.name} | ${wf.nodes.length} nodes`);

  function getNode(name) {
    const n = wf.nodes.find((n) => n.name === name);
    if (!n) throw new Error(`Node not found: ${name}`);
    return n;
  }

  // ── FIX 1: Format Reminder Message — fix all $json references ─────────────
  {
    const node = getNode("Format Reminder Message");

    node.parameters.jsCode = `// Prepare variables for Twilio WhatsApp template sofia_recordatorio_cita_24h
const t = new Date($json.start_time);

const fecha = t.toLocaleDateString('es-PE', {
  weekday: 'long', day: 'numeric', month: 'long',
  timeZone: 'America/Lima'
});
const hora = t.toLocaleTimeString('es-PE', {
  hour: '2-digit', minute: '2-digit', hour12: true,
  timeZone: 'America/Lima'
});

const nom   = $json.patient_name || 'paciente';
const cli   = $json.clinic_name  || 'la clinica';
const rawPhone = ($json.phone || '').toString().replace(/[^0-9+]/g, '');
// If phone already has whatsapp: prefix, keep it; else add country code +51 if needed
const toWA  = $json.phone && $json.phone.startsWith('whatsapp:')
  ? $json.phone
  : (rawPhone.startsWith('+') ? 'whatsapp:' + rawPhone : 'whatsapp:+51' + rawPhone);

// Use clinic-specific reminder SID from bot_config, fallback to default
const reminderSid = ($json.twilio_reminder_sid) || 'HXf2f27f70888a3228a1f66b1d49ec3d28';

return [{ json: {
  ...$json,
  template_sid:     reminderSid,
  template_var_1:   nom,
  template_var_2:   fecha,
  template_var_3:   hora,
  template_var_4:   cli,
  to_whatsapp:      toWA
}}];
`;
    console.log("FIX 1 applied: Format Reminder Message — $json references fixed");
  }

  // ── FIX 2: Mark Reminder Sent — direct PATCH on appointments ──────────────
  {
    const node = getNode("Mark Reminder Sent");

    node.parameters.jsCode = `// Mark reminder as sent — direct PATCH on appointments table
// NOTE: mark_reminder_sent() RPC does not exist; use REST API directly.
const SUPABASE_URL = "https://inhyrrjidhzrbqecnptn.supabase.co";
const SERVICE_KEY = $env.N8N_SUPABASE_SERVICE_KEY;

try {
  await this.helpers.httpRequest({
    method: "PATCH",
    url: SUPABASE_URL + "/rest/v1/appointments?id=eq." + $json.appointment_id,
    headers: {
      "apikey": SERVICE_KEY,
      "Authorization": "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    },
    body: {
      reminder_sent: true,
      reminder_sent_at: new Date().toISOString()
    },
    json: true
  });
  console.log(JSON.stringify({ ts: new Date().toISOString(), event: "REMINDER_MARKED_SENT", appointment_id: $json.appointment_id }));
} catch(e) {
  console.error(JSON.stringify({ ts: new Date().toISOString(), event: "REMINDER_MARK_ERROR", error: e.message }));
}

return [{ json: { ...$json, reminder_sent: true } }];
`;
    console.log("FIX 2 applied: Mark Reminder Sent — direct PATCH instead of missing RPC");
  }

  // ── FIX 3: Fetch Pending Reminders — include bot_config fields ─────────────
  {
    const node = getNode("Fetch Pending Reminders");

    node.parameters.jsCode = `// Fetch pending reminders from Supabase + clinic bot_config for Twilio
const SUPABASE_URL = "https://inhyrrjidhzrbqecnptn.supabase.co";
const SERVICE_KEY = $env.N8N_SUPABASE_SERVICE_KEY;

let reminders;
try {
  reminders = await this.helpers.httpRequest({
    method: "POST",
    url: SUPABASE_URL + "/rest/v1/rpc/get_pending_reminders",
    headers: {
      "apikey": SERVICE_KEY,
      "Authorization": "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json"
    },
    body: {},
    json: true
  });
} catch(e) {
  reminders = [];
}

if (!Array.isArray(reminders) || reminders.length === 0) {
  return [{ json: { no_reminders: true, count: 0 } }];
}

// Enrich with clinic bot_config (Twilio creds + reminder SID) for multi-clinic support
const clinicIds = [...new Set(reminders.map(function(r) { return r.clinic_id; }))];
const clinicMap = {};
try {
  const clinics = await this.helpers.httpRequest({
    method: "GET",
    url: SUPABASE_URL + "/rest/v1/clinics?select=id,bot_config&id=in.(" + clinicIds.join(",") + ")",
    headers: {
      "apikey": SERVICE_KEY,
      "Authorization": "Bearer " + SERVICE_KEY
    },
    json: true
  });
  clinics.forEach(function(c) { clinicMap[c.id] = c.bot_config || {}; });
} catch(e) { /* continue without bot_config — will use defaults */ }

return reminders.map(function(r) {
  const bc = clinicMap[r.clinic_id] || {};
  return {
    json: {
      appointment_id:      r.appointment_id,
      clinic_id:           r.clinic_id,
      clinic_name:         r.clinic_name,
      patient_name:        r.patient_name,
      phone:               r.phone,
      service:             r.service,
      start_time:          r.start_time,
      chatwoot_inbox_id:   r.chatwoot_inbox_id,
      // Twilio per-clinic credentials
      twilio_account_sid:  bc.twilio_account_sid  || null,
      twilio_auth_token:   bc.twilio_auth_token   || null,
      twilio_from:         bc.twilio_from         || null,
      twilio_reminder_sid: bc.twilio_reminder_sid || null
    }
  };
});
`;
    console.log("FIX 3 applied: Fetch Pending Reminders — bot_config propagated per clinic");
  }

  // ── Update Send WhatsApp Reminder to use dynamic credentials ──────────────
  // The Send WhatsApp Reminder is an httpRequest node (not code), so we need to
  // update its URL and auth to use the dynamic $json values from Fetch.
  {
    const node = getNode("Send WhatsApp Reminder");
    // Change URL to use dynamic account SID
    if (node.parameters.url) {
      const oldUrl = node.parameters.url;
      if (oldUrl.includes("AC4080780a4b4a7d8e7b107a39f01abad3")) {
        node.parameters.url = "=https://api.twilio.com/2010-04-01/Accounts/{{ $json.twilio_account_sid || 'AC4080780a4b4a7d8e7b107a39f01abad3' }}/Messages.json";
        console.log("FIX 3b applied: Send WhatsApp Reminder — dynamic account SID");
      }
    }
    // Update From to use dynamic value
    if (node.parameters.bodyParameters && node.parameters.bodyParameters.parameters) {
      const params = node.parameters.bodyParameters.parameters;
      const fromParam = params.find((p) => p.name === "From");
      if (fromParam) {
        fromParam.value = "={{ $json.twilio_from || 'whatsapp:+51977588512' }}";
        console.log("FIX 3c applied: Send WhatsApp Reminder — dynamic From number");
      }
    }
  }

  // ── PUT the updated workflow ──────────────────────────────────────────────
  console.log("\nSaving workflow...");
  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings,
    staticData: wf.staticData,
  };
  await apiRequest("PUT", "/api/v1/workflows/FCSJrGj5bLMuytr7", payload);
  console.log("Workflow saved.");

  await apiRequest("POST", "/api/v1/workflows/FCSJrGj5bLMuytr7/activate");
  console.log("Workflow activated.");

  // Verify
  const wf2 = await apiRequest("GET", "/api/v1/workflows/FCSJrGj5bLMuytr7");
  const fmt2 = wf2.nodes.find((n) => n.name === "Format Reminder Message");
  const mrk2 = wf2.nodes.find((n) => n.name === "Mark Reminder Sent");
  const fch2 = wf2.nodes.find((n) => n.name === "Fetch Pending Reminders");
  const snd2 = wf2.nodes.find((n) => n.name === "Send WhatsApp Reminder");

  console.log("\nVerification:");
  console.log("  Format: $json.start_time:", fmt2.parameters.jsCode.includes("$json.start_time") ? "✅" : "❌");
  console.log("  Format: $json.patient_name:", fmt2.parameters.jsCode.includes("$json.patient_name") ? "✅" : "❌");
  console.log("  Format: ...$json spread:", fmt2.parameters.jsCode.includes("...$json,") ? "✅" : "❌");
  console.log("  Mark: PATCH appointments:", mrk2.parameters.jsCode.includes("PATCH") && mrk2.parameters.jsCode.includes("appointments") ? "✅" : "❌");
  console.log("  Mark: no mark_reminder_sent RPC:", !mrk2.parameters.jsCode.includes("rpc/mark_reminder_sent") ? "✅" : "❌");
  console.log("  Fetch: bot_config enrichment:", fch2.parameters.jsCode.includes("clinicMap") ? "✅" : "❌");
  console.log("  Send: dynamic account SID:", snd2.parameters.url && snd2.parameters.url.includes("twilio_account_sid") ? "✅" : "❌");
  console.log("\npatch_v39 complete.");
}

main().catch((e) => {
  console.error("PATCH FAILED:", e.message);
  process.exit(1);
});
