// Seed knowledge base for OdontoVida Norte and Sofia Assistant Demo
const https = require('https');

const SUPABASE_URL = 'inhyrrjidhzrbqecnptn.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluaHlycmppZGh6cmJxZWNucHRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwNzU3NSwiZXhwIjoyMDg2NTgzNTc1fQ.-YwX0Qf4Gn8MdjFbLxCYuCJV1OzWl2qWWk4hKuU6z7k';

const ODONTOVIDA_ID = 'f8e7d6c5-b4a3-9281-0fed-cba987654321';
const DEMO_ID = 'c6c15fca-d7fc-4d98-83c1-2c5cb5a6bef1';

function e(clinic_id, category, question, answer, keywords, priority) {
  return { clinic_id, category, question, answer, keywords: keywords || [], metadata: {}, priority: priority || 0, active: true };
}

const odontovidaKB = [
  e(ODONTOVIDA_ID, 'horarios', 'Cual es el horario de atencion?', 'Atendemos de lunes a viernes de 9:00am a 7:00pm, y los sabados de 9:00am a 2:00pm.', ['horario','atencion','hora'], 10),
  e(ODONTOVIDA_ID, 'horarios', 'Atienden los domingos?', 'Los domingos no tenemos atencion regular, pero en casos de urgencia puede comunicarse al WhatsApp para evaluar disponibilidad.', ['domingo','fin de semana'], 5),
  e(ODONTOVIDA_ID, 'horarios', 'Tienen atencion de urgencias?', 'Si, atendemos urgencias dentales. Escribenos y coordinamos lo antes posible.', ['urgencia','emergencia','dolor'], 10),
  e(ODONTOVIDA_ID, 'ubicacion', 'Donde estan ubicados?', 'Estamos ubicados en la zona norte de Lima. Escribenos y te compartimos la direccion exacta y el mapa de ubicacion.', ['direccion','ubicacion','donde','mapa'], 10),
  e(ODONTOVIDA_ID, 'ubicacion', 'Tienen estacionamiento?', 'Contamos con facilidades de acceso y hay zonas de parqueo cercanas a la clinica.', ['estacionamiento','parqueo','parking'], 5),
  e(ODONTOVIDA_ID, 'servicios', 'Que servicios ofrecen?', 'Ofrecemos consulta general, limpieza dental, blanqueamiento, ortodoncia (brackets y alineadores), implantes dentales, endodoncia, cirugia oral, y odontologia pediatrica.', ['servicios','tratamientos'], 10),
  e(ODONTOVIDA_ID, 'servicios', 'Hacen implantes dentales?', 'Si, realizamos implantes dentales con tecnologia de ultima generacion. Agendemos una evaluacion para ver tu caso especifico.', ['implante','implantes'], 8),
  e(ODONTOVIDA_ID, 'servicios', 'Atienden ninos?', 'Si, contamos con odontologia pediatrica para ninos de todas las edades en un ambiente amigable y sin miedo.', ['ninos','pediatrica','infantil'], 8),
  e(ODONTOVIDA_ID, 'servicios', 'Realizan blanqueamiento dental?', 'Si, ofrecemos blanqueamiento dental profesional en consultorio. Los resultados son visibles desde la primera sesion.', ['blanqueamiento','blanquear'], 8),
  e(ODONTOVIDA_ID, 'servicios', 'Hacen ortodoncia?', 'Si, realizamos ortodoncia con brackets metalicos, zafiro y alineadores invisibles.', ['ortodoncia','brackets','alineadores'], 8),
  e(ODONTOVIDA_ID, 'precios', 'Cuanto cuesta una consulta?', 'La consulta de evaluacion tiene un costo accesible. Escribenos y te damos el precio actual con promociones vigentes.', ['consulta','precio','costo'], 8),
  e(ODONTOVIDA_ID, 'precios', 'Cuanto cuesta una limpieza dental?', 'La limpieza dental profesional tiene un precio competitivo. Contactanos para el precio actualizado y paquetes disponibles.', ['limpieza','profilaxis','precio'], 8),
  e(ODONTOVIDA_ID, 'precios', 'Cuanto cuestan los brackets?', 'El costo de ortodoncia varia segun el tipo de brackets. Agendemos una evaluacion sin costo para darte un presupuesto personalizado.', ['brackets','ortodoncia','precio'], 8),
  e(ODONTOVIDA_ID, 'precios', 'Cuanto cuesta un implante dental?', 'El costo del implante depende del caso. Te invitamos a una evaluacion para darte el precio exacto e informarte sobre financiamiento.', ['implante','precio'], 8),
  e(ODONTOVIDA_ID, 'pagos', 'Que formas de pago aceptan?', 'Aceptamos efectivo, tarjetas de debito y credito, Yape, Plin y transferencias bancarias.', ['pago','yape','plin','tarjeta','efectivo'], 9),
  e(ODONTOVIDA_ID, 'pagos', 'Tienen facilidades de pago o cuotas?', 'Si, ofrecemos facilidades de pago para tratamientos de mayor costo. Coordinamos un plan de cuotas segun tu posibilidad.', ['cuotas','facilidades','financiamiento'], 8),
  e(ODONTOVIDA_ID, 'seguros', 'Aceptan seguros medicos?', 'Trabajamos con algunos seguros dentales privados. Consultanos sobre tu seguro especifico para confirmarte si hay convenio.', ['seguro','seguros'], 7),
  e(ODONTOVIDA_ID, 'preparacion', 'Necesito prepararme para mi cita?', 'Para la mayoria de consultas no necesitas preparacion especial. Para cirugias o procedimientos especificos te indicaremos las instrucciones al confirmar tu cita.', ['preparacion','antes','cita'], 6),
  e(ODONTOVIDA_ID, 'preparacion', 'Me dolera el tratamiento?', 'Utilizamos anestesia local para todos los procedimientos que lo requieren. Tu comodidad es nuestra prioridad.', ['dolor','duele','anestesia'], 8),
  e(ODONTOVIDA_ID, 'general', 'Como puedo agendar una cita?', 'Puedes agendar tu cita directamente por este WhatsApp. Solo dime que tratamiento necesitas y te ofrezco los horarios disponibles.', ['cita','agendar','reservar'], 10),
  e(ODONTOVIDA_ID, 'general', 'Como cancelo o cambio mi cita?', 'Para cancelar o reprogramar tu cita, escribenos con al menos 24 horas de anticipacion por este mismo WhatsApp.', ['cancelar','cambiar','reprogramar'], 8),
  e(ODONTOVIDA_ID, 'general', 'Atienden pacientes con miedo al dentista?', 'Si, tenemos mucha experiencia con pacientes con ansiedad dental. Trabajamos con calma y explicamos cada paso del procedimiento.', ['miedo','ansiedad','nervioso'], 7),
];

const demoKB = [
  e(DEMO_ID, 'horarios', 'Cual es el horario de atencion?', 'Esta es una clinica demo de SofIA. El horario de atencion esta configurado de lunes a viernes de 9:00am a 6:00pm.', ['horario','atencion','hora'], 10),
  e(DEMO_ID, 'horarios', 'Atienden los fines de semana?', 'Esta demo tiene horario de lunes a viernes. En una implementacion real, el horario se configura segun la clinica.', ['fin de semana','sabado','domingo'], 5),
  e(DEMO_ID, 'servicios', 'Que servicios ofrecen?', 'SofIA Demo ofrece todos los servicios de una clinica dental completa: consulta general, limpieza, blanqueamiento, ortodoncia e implantes. Esta es una demostracion del sistema SofIA.', ['servicios','tratamientos'], 10),
  e(DEMO_ID, 'servicios', 'Que es SofIA?', 'SofIA es un asistente virtual inteligente para clinicas dentales. Puede responder preguntas, verificar disponibilidad y agendar citas automaticamente por WhatsApp.', ['sofia','asistente','bot','ia'], 10),
  e(DEMO_ID, 'servicios', 'Como funciona el agendamiento automatico?', 'Cuando solicitas una cita, SofIA revisa los horarios disponibles en tiempo real y te ofrece 3 opciones. Al confirmar, la cita queda registrada automaticamente.', ['agendamiento','automatico','cita','funciona'], 10),
  e(DEMO_ID, 'precios', 'Cuanto cuesta una consulta?', 'En esta demo, la consulta tiene un costo referencial de S/. 50. En una implementacion real, los precios se configuran segun la clinica.', ['consulta','precio','costo'], 8),
  e(DEMO_ID, 'precios', 'Cuanto cuesta una limpieza dental?', 'Limpieza dental en esta demo: S/. 80. Los precios reales se configuran en el knowledge base de cada clinica.', ['limpieza','precio'], 8),
  e(DEMO_ID, 'ubicacion', 'Donde estan ubicados?', 'SofIA Demo es una clinica virtual de demostracion. En produccion, la direccion real de la clinica se configura en el knowledge base.', ['direccion','ubicacion','donde'], 8),
  e(DEMO_ID, 'pagos', 'Que formas de pago aceptan?', 'Esta demo acepta todos los metodos de pago: efectivo, tarjetas, Yape y Plin. En produccion se configura segun la clinica.', ['pago','yape','tarjeta','efectivo'], 8),
  e(DEMO_ID, 'general', 'Como puedo agendar una cita?', 'Simplemente dime que quieres una cita y el tipo de tratamiento. SofIA verificara disponibilidad y te ofrecera horarios en segundos.', ['cita','agendar','reservar'], 10),
  e(DEMO_ID, 'general', 'Esto es real o es una demo?', 'Esto es una cuenta de demostracion de SofIA. Permite probar todas las funciones del sistema antes de implementarlo en tu clinica real.', ['demo','real','prueba','test'], 10),
  e(DEMO_ID, 'general', 'Como implemento SofIA en mi clinica?', 'Para implementar SofIA en tu clinica, contactate con el equipo de Red Soluciones TI. Configuramos el sistema completo adaptado a tu clinica.', ['implementar','contratar','instalar'], 9),
];

const allEntries = [...odontovidaKB, ...demoKB];
const body = JSON.stringify(allEntries);

const options = {
  hostname: SUPABASE_URL,
  path: '/rest/v1/knowledge_base',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'apikey': SERVICE_KEY,
    'Authorization': 'Bearer ' + SERVICE_KEY,
    'Prefer': 'return=minimal'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    console.log('HTTP', res.statusCode);
    if (data) console.log(data);
    else console.log('OK - ' + allEntries.length + ' entradas insertadas (' + odontovidaKB.length + ' OdontoVida Norte + ' + demoKB.length + ' Sofia Demo)');
  });
});
req.on('error', e => console.error(e));
req.write(body);
req.end();
