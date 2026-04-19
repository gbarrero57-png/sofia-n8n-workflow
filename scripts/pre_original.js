// PRE-CLASIFICADOR BASADO EN KEYWORDS v7 — Dental Clinic Full Coverage
const message = ($json.message_text || "").toLowerCase().trim();
const msgNorm = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// 0. WhatsApp Safe ya pidio escalacion
if ($json.should_escalate === true) {
    return [{ json: Object.assign({}, $json, { intent: "HUMAN", confidence: "high", classified_by: "WHATSAPP_SAFE_ESCALATION", skip_ai: true }) }];
}

// 1. SLOT CONFIRMATION — maxima prioridad cuando awaiting_slot
const convLabels = $json.raw_payload && $json.raw_payload.conversation && $json.raw_payload.conversation.labels || [];
const awaitingSlot = convLabels.includes("awaiting_slot");
if (awaitingSlot) {
    const wordMap = {"uno":"1","one":"1","dos":"2","two":"2","tres":"3","three":"3","primero":"1","primera":"1","primer":"1","segundo":"2","segunda":"2","tercero":"3","tercera":"3","tercer":"3","ultimo":"3","ultima":"3"};
    const cleanMsg = msgNorm.replace(/[^a-z0-9 ]/g, "").trim();
    const msgWords = cleanMsg.split(' ');
    let slotFromWord = null;
    for (var wi = 0; wi < msgWords.length; wi++) { if (wordMap[msgWords[wi]]) { slotFromWord = wordMap[msgWords[wi]]; break; } }
    const slotFromDigit = message.match(/[1-3]/)?.[0];
    const slotDigit = slotFromWord || slotFromDigit || null;
    if (slotDigit) return [{ json: Object.assign({}, $json, { message_text: slotDigit, intent: "CREATE_EVENT", confidence: "high", classified_by: "SLOT_CONFIRMATION_DETECTOR", skip_ai: true }) }];
    const affirmatives = ["si","yes","ok","dale","de acuerdo","bueno","perfecto","claro","listo","va","quiero","ese","esa","esa opcion","esa hora","ese horario","con ese","con esa","andale","sale","orale","va pues","ya pues"];
    const cleanMsg2 = msgNorm.replace(/[^a-z0-9 ]/g, "").trim();
    if (affirmatives.includes(cleanMsg2) || affirmatives.some(function(a) { return cleanMsg2.startsWith(a + " "); })) return [{ json: Object.assign({}, $json, { intent: "CREATE_EVENT", confidence: "high", classified_by: "SLOT_AFFIRMATION_DETECTOR", skip_ai: true }) }];
    const negatives = ["no","ninguno","ninguna","ningun","no me sirve","no puedo","no me queda","otro","otros","diferente","cambiar","cambio","no gracias","otros dias","otras opciones"];
    if (negatives.includes(cleanMsg2)) return [{ json: Object.assign({}, $json, { intent: "CREATE_EVENT", confidence: "high", classified_by: "SLOT_REJECTION_DETECTOR", skip_ai: true, day_change_request: true, message_text: ($json.message_text || "") + " preferencia de otro dia" }) }];
    const DAY_KW = ["lunes","martes","miercoles","jueves","viernes","sabado","domingo","hoy","manana","otro dia","siguiente","proxima","proxima semana","esta semana"];
    if (DAY_KW.some(function(d) { return msgNorm.includes(d); })) return [{ json: Object.assign({}, $json, { intent: "CREATE_EVENT", confidence: "high", classified_by: "DAY_CHANGE_DETECTOR", skip_ai: true, day_change_request: true }) }];
}

// 1b. Empty or emoji-only message — show menu
const cleanAlpha = message.replace(/[^a-z0-9]/g, "");
if (cleanAlpha.length === 0) return [{ json: Object.assign({}, $json, { intent: "GREETING", confidence: "high", classified_by: "EMPTY_MESSAGE_HANDLER", skip_ai: true }) }];

// ── GREETING — catch early so "hola, pregunta" doesnt fall to AI ─────────────
const greetingRegex = /^(hola+s*|holi+|hols|holaz|hey+|ola+|hi+|hello+|buenas?|buenos?|saludos?|buen dia|buenos dias|buenas tardes|buenas noches|buenas noche|que tal|q tal|k tal|alo+|wena+|wenas+|wsp|ws|epa|greetings|bienvenid|bienvenida|good morning|good afternoon|good evening)[!?., ]*$/i;
const holaShortRegex = /^(hola|ola|buenas|buenos|hey|hols)[,!. ]+([a-z ]{0,30}[?!]?)$/i;
if (greetingRegex.test(msgNorm) || holaShortRegex.test(msgNorm)) {
    return [{ json: Object.assign({}, $json, { intent: "GREETING", confidence: "high", classified_by: "GREETING_DETECTOR", skip_ai: true }) }];
}

// ── THANKS — warm closing ─────────────────────────────────────────────────────
const graciasKw = ["gracias","muchas gracias","grax","grasias","thank you","thanks","perfecto gracias","listo gracias","ok gracias","dale gracias","si gracias","ok muchas gracias","muchas grasias","mil gracias","gracias a ti","gracias de nuevo","dios la bendiga","dios te bendiga","bendiciones","que dios te bendiga"];
const msgNormClean = msgNorm.replace(/[!?.]+$/, "").trim(); // strip trailing punctuation for thanks/greeting checks
if (graciasKw.some(function(kw) { return msgNormClean === kw || msgNorm === kw || msgNorm.startsWith(kw + " ") || msgNorm.startsWith(kw + ","); })) {
    return [{ json: Object.assign({}, $json, { intent: "INFO", confidence: "high", classified_by: "THANKS_HANDLER", skip_ai: true, message_text: "El paciente agradecio la atencion. Responde con un cierre cordial de 1 linea, amable, en espanol informal. No hagas preguntas.", _is_thanks: true }) }];
}

// ── MENU keywords ─────────────────────────────────────────────────────��───────
const MENU_KEYWORDS = ["menu","opciones","opcion","inicio","volver","ayuda","start","ver opciones","que puedes hacer","que haces","como funciona"];
for (var mi = 0; mi < MENU_KEYWORDS.length; mi++) {
    if (msgNorm === MENU_KEYWORDS[mi] || msgNorm.startsWith(MENU_KEYWORDS[mi] + " ")) return [{ json: Object.assign({}, $json, { intent: "MENU", confidence: "high", classified_by: "MENU_KEYWORD_DETECTOR", skip_ai: true }) }];
}

// ── HUMAN — MUST run before CREATE_EVENT so "dolor+cita" → HUMAN ─────────────
// Exception: "tienen emergencias dentales?" is INFO (service inquiry, not personal emergency)
const isTienentEmergencias = msgNorm.includes("tienen emergencias") || msgNorm.includes("hacen emergencias") || msgNorm.includes("atienden emergencias") || msgNorm.includes("servicio de emergencia") || msgNorm.includes("servicios de emergencia");
if (!isTienentEmergencias) {
  const HUMAN_KEYWORDS = [
    "hablar con un","pasa con","comunica con","me comuniques","habla con alguien","hablar con alguien",
    "hablar con el doctor","hablar con la doctora","hablar con un doctor","hablar con una doctora",
    "necesito un humano","quiero un humano","quiero una persona","quiero hablar con","necesito hablar con",
    "persona real","persona humana",
    "emergencia","emrgencia","urgencia","urgente",
    "dolor fuerte","mucho dolor","me duele mucho","duele mucho","tengo mucho dolor",
    "me duele bastante","dolor intenso","dolor insoportable","no aguanto el dolor",
    "no puedo dormir del dolor","llevo dias con dolor","tengo dias con dolor",
    "dolor de muela","me duele la muela","me duele una muela","dolor muela",
    "duele el diente","duele la muela","me duele el diente","me duele un diente",
    "muela rota","diente roto","se rompio","se me rompio","se me partio","se partio",
    "se me cayo la corona","se cayo la corona","perdi la corona","corona caida",
    "diente flojo","muela floja","se me mueve el diente","se mueve la muela",
    "sangra","sangrado","me sangra","sangra la encia","me sangra la encia",
    "hinchazon","cara hinchada","muela hinchada","me hinche","tengo la cara hinchada",
    "infeccion","inflamacion","absceso","quiste","pus","fiebre dental",
    "granito en la encia","grano en la encia","bolita en la encia","bulto en la encia",
    "golpe","accidente","trauma","fractura dental","me golpee","me cai",
    "estoy embarazada","soy embarazada","estoy gestando","estoy en gestacion",
    "tengo diabetes","soy diabetico","soy diabetica","tengo azucar alta",
    "soy alergico","soy alergica","alergico a","alergica a",
    "tomo anticoagulantes","tomo warfarina","tomo coumadin","tomo eliquis","tomo xarelto",
    "tomo aspirina diaria","tomo aspirina para el corazon",
    "tengo marcapasos","problema cardiaco","enfermedad del corazon",
    "tengo hipertension","presion alta",
    "queja","reclamo","problema grave","mal servicio","mala atencion",
    "me llamas","me pueden llamar","llamenme","quiero que me llamen","quiero que me contacten"
  ];
  for (var hi = 0; hi < HUMAN_KEYWORDS.length; hi++) {
    if (msgNorm.includes(HUMAN_KEYWORDS[hi])) return [{ json: Object.assign({}, $json, { intent: "HUMAN", confidence: "high", classified_by: "PRE_CLASSIFIER_HUMAN", skip_ai: true }) }];
  }
}

// ── APPOINTMENT_STATUS keywords ──────────────────────────────────────────────
// "cancelar" requires special logic to separate action vs info question
if (msgNorm.includes("cancelar")) {
    const infoCancelKw = ["puedo cancelar","cobra por cancelar","costo de cancelar","cuanto cuesta cancelar","penalidad por cancelar","cobran por cancelar","precio de cancelar","se cobra por cancelar","hay cargo por cancelar"];
    const isInfoCancel = infoCancelKw.some(function(kw) { return msgNorm.includes(kw); });
    if (!isInfoCancel) return [{ json: Object.assign({}, $json, { intent: "APPOINTMENT_STATUS", confidence: "high", classified_by: "APPT_CANCEL_DETECTOR", skip_ai: true }) }];
}
const APPT_KEYWORDS = [
    "ver mi cita","ver mis citas","mis citas","mi cita es","mi cita del","mi proxima cita",
    "tengo cita","cuando es mi cita","a que hora es mi cita","a que hora tengo mi cita",
    "ver cita","consultar cita","estado de mi cita",
    "mis reservas","ver reserva","tengo una reserva","mi reserva",
    "cambiar mi cita","cambiar cita","mover mi cita",
    "reagendar","re-agendar","quiero cambiar mi cita","quiero mover mi cita",
    "confirmar mi cita","me pueden confirmar mi cita","confirmar cita",
    "olvide mi hora","me olvide la hora","olvide la hora","olvide mi cita","mi hora de cita",
    "no recuerdo mi cita","no recuerdo la hora","no me acuerdo de mi cita"
];
for (var ai = 0; ai < APPT_KEYWORDS.length; ai++) {
    if (msgNorm.includes(APPT_KEYWORDS[ai])) return [{ json: Object.assign({}, $json, { intent: "APPOINTMENT_STATUS", confidence: "high", classified_by: "APPT_KEYWORD_DETECTOR", skip_ai: true }) }];
}

// ── MENU_SELECTION — solo si el menu principal fue mostrado recientemente ──────
// Un digito enviado en medio de una conversacion NO debe interpretarse como opcion del menu
const digitMatch = message.match(/^([1-5])$/);
const lastBotWasMenu = $json._last_message_was_menu === true;
if (digitMatch && !awaitingSlot && lastBotWasMenu) return [{ json: Object.assign({}, $json, { intent: "MENU_SELECTION", menu_selection_option: digitMatch[1], confidence: "high", classified_by: "MENU_SELECTION_DETECTOR", skip_ai: true }) }];
// Digito sin contexto de menu → dejar al AI clasificar o tratar como respuesta conversacional
if (digitMatch && !awaitingSlot && !lastBotWasMenu) return [{ json: Object.assign({}, $json, { skip_ai: false }) }];

// ── CREATE_EVENT — check BEFORE INFO because "agendar + precio" → CREATE_EVENT ─
// Booking keywords that definitively signal appointment intent
const CREATE_EVENT_STRONG = ["agendar","reservar","separar una cita","separar cita","separar hora","me gustaria agendar","me gustaria reservar","podria agendar","podria reservar","quiero reservar","me puedes agendar","pueden agendarme","quiero ir al dentista","necesito ir al dentista","quiero ir a la clinica"];
for (var ces = 0; ces < CREATE_EVENT_STRONG.length; ces++) {
    if (msgNorm.includes(CREATE_EVENT_STRONG[ces])) return [{ json: Object.assign({}, $json, { intent: "CREATE_EVENT", confidence: "high", classified_by: "PRE_CLASSIFIER_CE_STRONG", skip_ai: true }) }];
}
// Multi-intent: message has "cita para el [dia]" → CREATE_EVENT wins (booking is the primary action)
const cieMulti = msgNorm.includes("cita para el") || msgNorm.includes("cita para la") || msgNorm.includes("una cita para") || msgNorm.includes("quiero una cita");
if (cieMulti) return [{ json: Object.assign({}, $json, { intent: "CREATE_EVENT", confidence: "high", classified_by: "PRE_CLASSIFIER_CE_MULTI", skip_ai: true }) }];
// Disponibilidad + fecha → booking (e.g. "tienen disponible mañana?", "hay algo para el viernes?")
const DAYS_KW2 = ["manana","hoy","lunes","martes","miercoles","jueves","viernes","sabado","esta semana","proxima semana","siguiente semana"];
const availDate = (msgNorm.includes("disponible") || msgNorm.includes("hay algo para") || msgNorm.includes("hay espacio") || msgNorm.includes("tienen hora") || msgNorm.includes("hay hora")) && DAYS_KW2.some(function(d) { return msgNorm.includes(d); });
if (availDate) return [{ json: Object.assign({}, $json, { intent: "CREATE_EVENT", confidence: "high", classified_by: "AVAIL_DATE_DETECTOR", skip_ai: true }) }];

// ── VAGUE INFO — peticiones de info sin especificar tema ─────────────────────
const VAGUE_INFO_KW = [
    "dame info","dame informacion","dame informaci","quiero info","quiero informacion",
    "necesito informacion","necesito info","necesito saber","necesito ayuda con info",
    "info","informacion","mas info","me das info","dame mas info",
    "quiero saber","que servicios tienen","que ofrecen",
    "cuentame","cuentame mas","dime mas","dime algo",
    "me pueden ayudar","pueden ayudarme","puedes ayudarme","me ayudas","ayudame",
    "tengo una consulta","tengo una pregunta","tengo una duda",
    "una consulta","una pregunta","una duda",
    "quiero preguntar","quiero consultar","quisiera preguntar","quisiera consultar",
    "es para mi mama","es para mi papa","es para mi hijo","es para mi hija","es para mi esposa","es para mi esposo","es para un familiar","es para otra persona"
];
for (var vi = 0; vi < VAGUE_INFO_KW.length; vi++) {
    if (msgNorm === VAGUE_INFO_KW[vi] || msgNorm.startsWith(VAGUE_INFO_KW[vi] + " ") || msgNorm.startsWith(VAGUE_INFO_KW[vi] + ",") || msgNorm.startsWith(VAGUE_INFO_KW[vi] + "?")) {
        return [{ json: Object.assign({}, $json, { intent: "INFO", confidence: "high", classified_by: "VAGUE_INFO_DETECTOR", skip_ai: true, message_text: "El paciente pidio informacion de forma vaga sin especificar el tema. Preguntale de forma natural y conversacional que especificamente quiere saber: precios, tratamientos, horarios, ubicacion u otro tema. Si menciono que es para un familiar, adapta la respuesta ('¿Para quién es la cita?'). NO uses listas numeradas. Se breve y amigable.", _last_message_was_menu: false }) }];
    }
}

// ── INFO keywords — dental treatments, services, prices, hours, location ──────
const INFO_KEYWORDS = [
  "blanqueamiento","blanquear","dientes mas blancos",
  "ortodoncia","brackets","bracket","braketes","aparatos dentales","correctores dentales",
  "invisalign","alineadores","alineador invisible","ortodoncia invisible",
  "implante dental","implantes dentales","implante de diente",
  "endodoncia","tratamiento de conducto","conducto radicular","matar el nervio",
  "extraccion","extracciones","sacar el diente","sacar la muela","arrancar el diente",
  "limpieza dental","limpieza de dientes","profilaxis","destartaje","sarro","placa dental",
  "carillas","carilla dental","carilla de porcelana","carilla de resina",
  "diseno de sonrisa","sonrisa perfecta","rehabilitacion oral",
  "protesis dental","protesis fija","protesis removible","dentadura","dentadura postiza",
  "corona dental","corona de porcelana","corona ceramica","colocar corona","poner corona",
  "periodoncia","enfermedad de las encias",
  "rayos x","radiografia","radiografia dental","panoramica dental",
  "odontopediatria","dentista para ninos","pediatra dental","atienden ninos",
  "emergencias dentales","servicio de emergencia dental",
  "que servicios","que tratamientos","que hacen","que ofrecen","que atienden",
  "que incluye","en que consiste","como funciona el","como es el tratamiento",
  "que es la ","que es el ","que es una ","que es un ",
  "para que sirve","cuando se necesita","quien necesita",
  "duele la ","duele el ","duele un ","duele una ","es doloroso","tiene dolor",
  "cuantas sesiones","cuanto dura","cuanto demora","cuantas citas","cuanto tarda",
  "cada cuanto","con que frecuencia",
  "cuanto cuesta","cuanto sale","cuanto vale","precio","precios","costo","costos",
  "cuanto cobran","cuanto es","cuanto son","cuanto queda",
  "descuento","descuentos","promocion","promociones","oferta","ofertas",
  "presupuesto","cotizacion","lista de precios",
  "financiamiento","cuotas","pago en cuotas","a plazos","credito","creditos",
  "seguro medico","seguros medicos","aceptan seguro","trabajan con seguro","eps","essalud","pacifico seguros","rimac","mapfre",
  "aceptan tarjeta","aceptan visa","aceptan mastercard","aceptan american",
  "aceptan efectivo","formas de pago","metodos de pago","como puedo pagar","como pago",
  "aceptan transferencia","numero de cuenta","cuenta bancaria",
  "aceptan yape","aceptan plin","aceptan izipay","pagan con yape","pagan con plin",
  "primera consulta","consulta inicial","primera vez",
  "horario","horarios","que dias atienden","que horas atienden","a que hora abren","a que hora cierran",
  "hasta que hora","desde que hora","cuando abren","cuando cierran",
  "atienden sabado","atienden domingo","atienden feriado","atienden fin de semana",
  "fines de semana","turno manana","turno tarde","turno nocturno","atienden en la noche",
  "abren los","abren el",
  "donde estan","donde queda","donde se encuentran","como llego","como llegar",
  "direccion","cual es la direccion","su direccion",
  "en que distrito","en que zona","en que lugar","en que parte",
  "estacionamiento","parking","donde estaciono","hay donde estacionar",
  "cerca de","a cuantas cuadras","referencias para llegar","google maps",
  "otro local","otras sedes","sucursal","sucursales","tienen mas locales",
  "puedo ir sin cita","atencion sin cita","sin reserva",
  "cuanto tiempo dura","tiempo de espera","sala de espera",
  "que debo traer","que tengo que traer","que necesito traer",
  "debo traer","traer dni","traer radiografia",
  "puedo llevar a mi hijo","puedo llevar a mis hijos","puedo llevar a un nino",
  "cuanto antes","llegar temprano","llegar con anticipacion",
  "cobra por cancelar","costo de cancelacion","penalidad por cancelar","cobran por cancelar",
  "cuanto tiempo para cancelar","con cuanto tiempo","cuanto tiempo de anticipacion",
  "me mandan recordatorio","me avisan","aviso de cita","recordatorio de cita","recordatorio",
  "puedo comer antes","puedo tomar antes","puedo desayunar antes","en ayunas",
  "puedo tomar medicamento","puedo tomar pastilla",
  "tengo miedo","miedo al dentista","miedo a la aguja","ansiedad dental","nervioso",
  "van a dormirme","me van a dormir","anestesia general","sedacion consciente",
  "cuanto tiempo cicatriza","cicatrizar","cuanto tarda en sanar","cuanto tarda en curarse","cicatrizacion",
  "cuando puedo comer despues","que puedo comer despues","puedo comer despues",
  "puedo tomar alcohol","puedo beber alcohol","puedo fumar despues",
  "cuidados despues de","recomendaciones despues","instrucciones de cuidado",
  "es normal que duela","es normal sentir","es normal molestia","es normal un poco",
  "cuantos doctores","cuantos dentistas","cuantos especialistas",
  "doctor es especialista","dentista especialista","tienen especialistas",
  "tienen anestesia","usan anestesia","con anestesia",
  "material esterilizado","higiene","esterilizacion","instrumental esteril",
  "clinica o consultorio","es una clinica","es un consultorio",
  "instagram","facebook","redes sociales","pagina web","pagina de internet","sitio web",
  "como los encontre","como los contacto",
  "eres un robot","eres una ia","eres inteligencia artificial","eres un bot",
  "quien eres","eres una persona","eres humano","eres humana","eres real",
  "hablas ingles","speak english","hablan ingles","do you speak","hablan ingles",
  "tienen ","hacen ","atienden ","ofrecen "
];
for (var ii = 0; ii < INFO_KEYWORDS.length; ii++) {
    if (msgNorm.includes(INFO_KEYWORDS[ii]) || msgNorm.startsWith(INFO_KEYWORDS[ii])) return [{ json: Object.assign({}, $json, { intent: "INFO", confidence: "high", classified_by: "INFO_KEYWORD_DETECTOR", skip_ai: true }) }];
}

// ── CREATE_EVENT — remaining booking keywords ─────────────────────────────────
const CREATE_EVENT_KEYWORDS = [
    "turno","appointment",
    "quiero una cita","necesito cita","quiero cita","quiero ir","necesito ir",
    "cuando puedo","disponibilidad","hay disponible","hay hora","tienes hora","tienen hora",
    "hay espacio","hay lugar","tienen espacio","tienes espacio",
    "hay para el","hay para la","tienes para el","tienen para el",
    "puedo ir el","puedo ir manana","puedo ir hoy",
    "hora disponible","una hora para",
    "quiero el lunes","quiero el martes","quiero el miercoles","quiero el jueves",
    "quiero el viernes","quiero el sabado","quiero el domingo",
    "cita para el","cita el lunes","cita el martes","cita el miercoles",
    "cita el jueves","cita el viernes","cita el sabado",
    "hay para manana","hay para hoy","para manana","para hoy",
    "para esta semana","hay algo para",
    "hay horario disponible","tienen horario disponible","hay cita disponible",
    "me puedes dar una cita","quiero una hora",
    "necesito una cita","quiero pasar"
];
// "cita" alone only in booking context
if (msgNorm.includes("cita") && !msgNorm.includes("mi cita") && !msgNorm.includes("tu cita") && !msgNorm.includes("la cita") && !msgNorm.includes("citas del")) {
    if (msgNorm.includes("quiero") || msgNorm.includes("necesito") || msgNorm.includes("para el") || msgNorm.includes("para la") || msgNorm.includes("para hoy") || msgNorm.includes("para manana")) {
        return [{ json: Object.assign({}, $json, { intent: "CREATE_EVENT", confidence: "high", classified_by: "PRE_CLASSIFIER_CITA", skip_ai: true }) }];
    }
}
for (var ci = 0; ci < CREATE_EVENT_KEYWORDS.length; ci++) {
    if (msgNorm.includes(CREATE_EVENT_KEYWORDS[ci])) return [{ json: Object.assign({}, $json, { intent: "CREATE_EVENT", confidence: "high", classified_by: "PRE_CLASSIFIER_CE", skip_ai: true }) }];
}

// ── PAYMENT — payment action confirmation ─────────────────────────────────────
const PAYMENT_KEYWORDS = ["ya pague","acabo de pagar","pague hoy","pague ayer","realize el pago","hice el pago","envie el comprobante","adjunto comprobante","hice la transferencia","realize la transferencia","hice el deposito","deposite","realize el deposito"];
for (var pi = 0; pi < PAYMENT_KEYWORDS.length; pi++) {
    if (msgNorm.includes(PAYMENT_KEYWORDS[pi])) return [{ json: Object.assign({}, $json, { intent: "PAYMENT", confidence: "high", classified_by: "PRE_CLASSIFIER_PAYMENT", skip_ai: true }) }];
}

// 8. Fallback — AI classifier
return [{ json: Object.assign({}, $json, { skip_ai: false }) }];
