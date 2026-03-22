const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('saas/sofia_live.json', 'utf8'));
const get = name => wf.nodes.find(n => n.name === name);

get('WhatsApp Safe Check').parameters.jsCode = [
  '// WHATSAPP SAFE RULES - FASE 1',
  'const ctx           = $input.first().json;',
  'const bot_count     = ctx.bot_interaction_count || 0;',
  'const message_lower = (ctx.message_text || "").toLowerCase();',
  '',
  '// Regla 1: Maximo 10 interacciones automaticas',
  'if (bot_count >= 10) {',
  '  return [{ json: { ...ctx, should_escalate: true, escalation_reason: "MAX_INTERACTIONS_PHASE1",',
  '    escalation_message: "Te conecto con un agente de inmediato." } }];',
  '}',
  '',
  '// Regla 2: Mensaje > 24h',
  'const message_age_hours = (Date.now() - (ctx.message_timestamp * 1000)) / 3600000;',
  'if (message_age_hours > 24) {',
  '  return [{ json: { ...ctx, should_escalate: true, escalation_reason: "MESSAGE_TOO_OLD",',
  '    escalation_message: "Te conecto con un agente." } }];',
  '}',
  '',
  '// Regla 3: Horario comercial Lima (8am - 10pm)',
  'const now = new Date();',
  'const lima_hour = parseInt(now.toLocaleString("en-US", { timeZone: "America/Lima", hour: "numeric", hour12: false }));',
  'if (lima_hour < 8 || lima_hour >= 22) {',
  '  return [{ json: { ...ctx, should_escalate: true, escalation_reason: "OUTSIDE_BUSINESS_HOURS",',
  '    escalation_message: "Gracias por escribirnos. Te responderemos en horario de atencion (8am - 10pm)." } }];',
  '}',
  '',
  '// Regla 4: Emergencias',
  'const emergency_kws = ["emergencia","urgencia","dolor fuerte","sangra","mucho dolor","golpe","accidente","hinchazon","infeccion","fiebre"];',
  'if (emergency_kws.some(function(kw) { return message_lower.includes(kw); })) {',
  '  return [{ json: { ...ctx, should_escalate: true, escalation_reason: "EMERGENCY_DETECTED",',
  '    escalation_message: "Detecto que podrias tener una urgencia. Te conecto de inmediato.", priority: "urgent" } }];',
  '}',
  '',
  '// Regla 5: Opt-out',
  'const opt_out_kws = ["detente","ya no","basta","stop","cancelar bot","agente","humano","persona"];',
  'if (opt_out_kws.some(function(kw) { return message_lower.includes(kw); })) {',
  '  return [{ json: { ...ctx, should_escalate: true, escalation_reason: "USER_OPT_OUT",',
  '    escalation_message: "Entendido. Te conecto con un agente humano." } }];',
  '}',
  '',
  '// Todo OK - continuar al clasificador',
  'return [{ json: { ...ctx, should_escalate: false, whatsapp_safe: true,',
  '  debug_bot_count: bot_count, debug_lima_hour: lima_hour, checked_at: new Date().toISOString() } }];'
].join('\n');

const payload = {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: wf.settings,
  staticData: wf.staticData || null
};
fs.writeFileSync('saas/sofia_put_final5.json', JSON.stringify(payload));
console.log('Done');
