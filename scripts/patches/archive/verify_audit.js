const wf = JSON.parse(require('fs').readFileSync('C:/Users/Barbara/Documents/n8n_workflow_claudio/workflows/sofia/sofia_main.json','utf8'));
const nodes = wf.nodes;
console.log('Workflow:', wf.name, '| ID:', wf.id, '| Active:', wf.active, '| Nodes:', nodes.length);

const checks = [
  ['Pedir Aclaración', 'jsonBody', 'JSON.stringify', 'uses JSON.stringify (not double-stringified)'],
  ['Enviar Mensaje Escalado', 'jsonBody', 'JSON.stringify', 'uses JSON.stringify'],
  ['Crear Nota Interna', 'jsonBody', 'JSON.stringify', 'uses JSON.stringify'],
  ['Preparar Escalado', 'jsCode', 'pause_conversation', 'pauses bot in Supabase after escalation'],
  ['Preparar Prompt INFO', 'jsCode', 'maximo 100 palabras', 'short response instruction'],
  ['Preparar Prompt INFO', 'jsCode', 'siguiente paso numeradas', 'follow-up options instruction'],
  ['Confirmar al Paciente', 'jsCode', 'Cita confirmada!', 'professional confirmation header'],
  ['Confirmar al Paciente', 'jsCode', 'doctor_line', 'includes doctor line'],
  ['Pre-Clasificador Keywords', 'jsCode', 'APPT_KEYWORDS', 'has APPOINTMENT_STATUS keywords'],
  ['Pre-Clasificador Keywords', 'jsCode', 'cancelar cita', 'handles cancelar'],
  ['Pre-Clasificador Keywords', 'jsCode', 'mis citas', 'handles ver mis citas'],
  ['Formatear Oferta de Slots', 'jsCode', 'Horarios disponibles', 'better slot formatting with emoji'],
  ['Validar Respuesta', 'jsCode', '800', 'length limit updated to 800'],
];

let pass = 0, fail = 0;
checks.forEach(([nodeName, field, expect, description]) => {
  const n = nodes.find(n => n.name === nodeName);
  if (!n) { console.log('FAIL - NOT FOUND:', nodeName); fail++; return; }
  const val = n.parameters[field] || '';
  if (val.includes(expect)) {
    console.log('PASS -', nodeName, '-', description);
    pass++;
  } else {
    console.log('FAIL -', nodeName, '-', description, '| Expected:', expect);
    console.log('  Actual (first 200):', val.substring(0, 200));
    fail++;
  }
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log(fail === 0 ? '\nAll audit fixes verified!' : '\nSome checks failed!');
