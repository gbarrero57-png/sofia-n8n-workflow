/**
 * patch_v40.js — Fix Asistente Pagina Web (redsolucionesti.com chat)
 *
 * BUG 1: Redis Chat Memory v1.5 — "No session ID found"
 *   sessionIdType not configured → Redis doesn't know how to key the session.
 *   FIX: set sessionIdType=customKey, sessionKey={{ $json.sessionId }}
 *
 * BUG 2: System prompt ignores FAQ questions — goes straight to lead capture
 *   FIX: balanced prompt: Mode 1 = answer FAQs (using Google Docs), Mode 2 = capture lead
 *
 * BUG 3: Telegram message has no structure — AI generates whatever it wants
 *   FIX: prompt explicitly specifies the exact Telegram format to use
 */

const N8N_URL = "https://workflows.n8n.redsolucionesti.com";
const N8N_KEY = require("fs")
  .readFileSync(require("path").join(__dirname, "../../../n8n-mcp/.env"), "utf8")
  .match(/N8N_API_KEY=(.+)/)?.[1]?.trim();

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

const SYSTEM_PROMPT = `Eres el asistente virtual de Red Soluciones TI (RST), empresa peruana especializada en automatizacion con inteligencia artificial.

MODO 1 - RESPONDER PREGUNTAS
Usa la herramienta "Get a document in Google Docs" para responder preguntas sobre servicios, precios, casos de uso, SofIA, integraciones o proceso de trabajo.

Respuesta rapida si no necesitas docs:
- Hacemos: bots WhatsApp con IA 24/7, automatizacion de procesos (agendamiento, facturacion, reportes), integraciones entre sistemas, agentes IA con n8n y Make.
- Producto estrella: SofIA, asistente IA para clinicas dentales. Ver en sofia.redsolucionesti.com
- Contacto directo: wa.me/51905858566

MODO 2 - CAPTURA DE LEAD
Cuando el usuario muestre interes real (quiere demo, cotizacion o mas informacion), captura estos datos EN ORDEN:
1. Nombre
2. WhatsApp con codigo de pais (validar formato +51XXXXXXXXX, si falla pedir correccion)
3. Email (validar que tenga @ y dominio, si falla pedir correccion)
4. Proceso a automatizar

CUANDO TENGAS LOS 4 DATOS VALIDOS:
Paso A: Usa "Send a text message in Telegram" con este texto exacto:
NUEVO LEAD RST Web
Nombre: {nombre}
WhatsApp: {telefono}
Email: {email}
Proceso: {proceso}

Paso B: Usa "Append or update row in sheet in Google Sheets" para guardar.

Paso C: Responde: "Perfecto {nombre}! Revisare tu caso y te contactare por WhatsApp para una demo personalizada. Hablamos pronto!"

REGLAS:
- Responde siempre en espanol
- Maximo 3 lineas por mensaje
- No reiniciar conversacion
- No repetir preguntas ya respondidas`;

async function main() {
  console.log("Fetching Asistente Pagina web workflow...");
  const wf = await apiRequest("GET", "/api/v1/workflows/pcjSqYlnURtWWAMc");
  console.log(`Got: ${wf.name} | ${wf.nodes.length} nodes`);

  // FIX 1: Redis Chat Memory — add sessionIdType
  const redis = wf.nodes.find((n) => n.name === "Redis Chat Memory");
  if (!redis) throw new Error("Redis Chat Memory not found");
  redis.parameters = {
    sessionIdType: "customKey",
    sessionKey: "={{ $json.sessionId }}",
    contextWindowLength: 10,
    sessionTTL: 3600,
  };
  console.log("FIX 1: Redis sessionIdType=customKey, sessionKey=$json.sessionId");

  // FIX 2: System prompt — FAQ + lead capture
  const agent = wf.nodes.find((n) => n.name === "AI Agent");
  if (!agent) throw new Error("AI Agent not found");
  if (!agent.parameters.options) agent.parameters.options = {};
  agent.parameters.options.systemMessage = SYSTEM_PROMPT;
  console.log("FIX 2: System prompt updated (FAQ + structured lead capture + Telegram format)");

  // Save
  console.log("Saving workflow...");
  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings,
    staticData: wf.staticData,
  };
  await apiRequest("PUT", "/api/v1/workflows/pcjSqYlnURtWWAMc", payload);
  console.log("Saved.");

  await apiRequest("POST", "/api/v1/workflows/pcjSqYlnURtWWAMc/activate");
  console.log("Activated.");

  // Verify
  const wf2 = await apiRequest("GET", "/api/v1/workflows/pcjSqYlnURtWWAMc");
  const redis2 = wf2.nodes.find((n) => n.name === "Redis Chat Memory");
  const agent2 = wf2.nodes.find((n) => n.name === "AI Agent");
  console.log("\nVerification:");
  console.log("  Redis sessionIdType:", redis2.parameters.sessionIdType === "customKey" ? "✅ customKey" : "❌ " + redis2.parameters.sessionIdType);
  console.log("  Redis sessionKey:", redis2.parameters.sessionKey ? "✅ set" : "❌ missing");
  console.log("  System prompt has FAQ mode:", agent2.parameters.options.systemMessage.includes("MODO 1") ? "✅" : "❌");
  console.log("  System prompt has lead capture:", agent2.parameters.options.systemMessage.includes("MODO 2") ? "✅" : "❌");
  console.log("  System prompt has Telegram format:", agent2.parameters.options.systemMessage.includes("NUEVO LEAD RST Web") ? "✅" : "❌");
  console.log("\npatch_v40 complete.");
}

main().catch((e) => {
  console.error("PATCH FAILED:", e.message);
  process.exit(1);
});
