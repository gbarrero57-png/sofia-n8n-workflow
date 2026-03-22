# AI NEWS CAROUSEL — Especificación de Templates Placid

## Tokens de Diseño

```
RESOLUCIÓN:    1080 × 1080 px
FONDO BASE:    #0B0F1A
TEXT PRIMARY:  #FFFFFF
TEXT BODY:     #B0B7C3
ACCENT:        #00E5FF
HEADLINE FONT: Space Grotesk Bold, 64-80px
BODY FONT:     Inter Regular, 28-32px
COUNTER FONT:  Space Grotesk Medium, 18px
PADDING:       60px todos los lados
EMOJI SIZE:    80-96px (unicode texto, no imagen)
```

---

## Template 1 — HOOK (slide 1)

### Layout ASCII (1080×1080)

```
┌──────────────────────────────────────────┐
│                                          │
│  ◉ AI.EVOLUCIONA            01 / 07     │  ← logo left (static) | slide_counter right
│  ─────────────────────────────────────  │  ← accent line #00E5FF, 2px
│                                          │
│                                          │
│                                          │
│                   🤯                     │  ← emoji_icon  (centered, 96px)
│                                          │
│                                          │
│        ¿Lo que acaba de pasar           │
│         cambia el trabajo               │  ← headline (Space Grotesk Bold 72px)
│         para siempre?                   │     centrado, color #FFFFFF
│                                          │     máx 3 líneas, line-height 1.15
│                                          │
│                                          │
│              ▸ desliza                  │  ← texto estático #B0B7C3
│                                          │
└──────────────────────────────────────────┘
  fondo: #0B0F1A sólido
```

### Capas dinámicas

| Capa | Tipo Placid | Contenido |
|---|---|---|
| `headline` | text | Pregunta o afirmación de hook |
| `emoji_icon` | text | Un emoji grande |
| `slide_counter` | text | "01 / 07" |

### Capas estáticas (definidas en el template)

| Capa | Contenido fijo |
|---|---|
| `logo` | Handle "@ia.evoluciona" |
| `accent_line` | Línea cyan decorativa |
| `swipe_cta` | "▸ desliza" |
| `background` | Rectángulo #0B0F1A |

### Ejemplo payload

```json
{
  "template_uuid": "PLACID_TEMPLATE_HOOK",
  "layers": {
    "headline": {
      "text": "¿GPT-5 acaba de dejar obsoleto tu trabajo?"
    },
    "emoji_icon": {
      "text": "🤯"
    },
    "slide_counter": {
      "text": "01 / 07"
    }
  }
}
```

### Notas de diseño

- Sin capa `body` — toda la atención al headline
- Headline debe ser pregunta retórica o afirmación provocadora
- Emoji posicionado encima del headline, centrado verticalmente
- El texto "▸ desliza" es ESTÁTICO en el template

---

## Template 2 — NORMAL (slides 2 a 6)

### Layout ASCII (1080×1080)

```
┌──────────────────────────────────────────┐
│                                          │
│  ◉ AI.EVOLUCIONA            02 / 07     │  ← logo | slide_counter
│  ─────────────────────────────────────  │  ← accent line
│                                          │
│  ⚡                                      │  ← emoji_icon (izquierda, 56px)
│                                          │
│  QUÉ PASÓ                              │  ← headline (Space Grotesk Bold 68px)
│                                          │     alineado izquierda, #FFFFFF
│  ─────────────────────────────────────  │  ← línea separadora #00E5FF 1px
│                                          │
│  OpenAI lanzó un modelo con            │
│  razonamiento avanzado que supera       │  ← body (Inter Regular 30px)
│  a los mejores humanos en              │     color #B0B7C3, alineado izquierda
│  matemáticas.                           │     máx 4 líneas
│                                          │
│                                          │
└──────────────────────────────────────────┘
  fondo: #0B0F1A sólido
```

### Capas dinámicas

| Capa | Tipo Placid | Contenido |
|---|---|---|
| `headline` | text | Título del slide (max 10 palabras) |
| `body` | text | Explicación (max 30 palabras) |
| `emoji_icon` | text | Un emoji relevante |
| `slide_counter` | text | "02 / 07" ... "06 / 07" |

### Capas estáticas

| Capa | Contenido fijo |
|---|---|
| `logo` | "@ai.evoluciona" |
| `accent_line_top` | Línea cyan bajo header |
| `accent_line_mid` | Separador entre headline y body |
| `background` | #0B0F1A |

### Ejemplo payload — Slide 2 (Qué pasó)

```json
{
  "template_uuid": "PLACID_TEMPLATE_NORMAL",
  "layers": {
    "headline": {
      "text": "QUÉ PASÓ"
    },
    "body": {
      "text": "OpenAI lanzó GPT-5, su modelo más avanzado, capaz de razonar mejor que la mayoría de expertos humanos."
    },
    "emoji_icon": {
      "text": "📰"
    },
    "slide_counter": {
      "text": "02 / 07"
    }
  }
}
```

### Ejemplo payload — Slide 4 (Cómo funciona)

```json
{
  "template_uuid": "PLACID_TEMPLATE_NORMAL",
  "layers": {
    "headline": {
      "text": "CÓMO FUNCIONA"
    },
    "body": {
      "text": "Es como tener un asistente que leyó todos los libros del mundo y puede razonar paso a paso como un detective."
    },
    "emoji_icon": {
      "text": "⚙️"
    },
    "slide_counter": {
      "text": "04 / 07"
    }
  }
}
```

---

## Template 3 — CTA (slide 7)

### Layout ASCII (1080×1080)

```
┌──────────────────────────────────────────┐  ← gradiente: #0B0F1A → #1A0B2E
│                                          │
│  ◉ AI.EVOLUCIONA            07 / 07     │  ← logo | slide_counter
│  ─────────────────────────────────────  │
│                                          │
│                                          │
│                   🤖                     │  ← emoji_icon (centrado, 80px)
│                                          │
│       ¿Te gustó este contenido?        │  ← headline (Space Grotesk Bold 66px)
│                                          │     centrado, #FFFFFF
│  ══════════════════════════════════     │  ← borde decorativo #00E5FF
│                                          │
│      Guarda este post y síguenos        │  ← body (Inter Regular 28px)
│      para no perderte nada de IA.       │     centrado, #B0B7C3
│                                          │
│  ══════════════════════════════════     │  ← borde decorativo
│                                          │
│            @ia.evoluciona               │  ← handle estático destacado
│                                          │
└──────────────────────────────────────────┘
  fondo: gradiente vertical #0B0F1A → #1A0B2E
```

### Capas dinámicas

| Capa | Tipo Placid | Contenido |
|---|---|---|
| `headline` | text | Pregunta o frase de cierre |
| `body` | text | CTA concreto |
| `emoji_icon` | text | Emoji de cierre |
| `slide_counter` | text | "07 / 07" |

### Capas estáticas

| Capa | Contenido fijo |
|---|---|
| `logo` | "@ia.evoluciona" |
| `handle_large` | "@ia.evoluciona" (más grande, al fondo) |
| `decorative_lines` | Bordes cyan |
| `background_gradient` | #0B0F1A → #1A0B2E |

### Ejemplo payload

```json
{
  "template_uuid": "PLACID_TEMPLATE_CTA",
  "layers": {
    "headline": {
      "text": "¿Te resultó útil esta info?"
    },
    "body": {
      "text": "Guarda este post y síguenos para no perderte nada sobre IA cada semana."
    },
    "emoji_icon": {
      "text": "👇"
    },
    "slide_counter": {
      "text": "07 / 07"
    }
  }
}
```

---

## Estructura JSON completa del LLM

El LLM debe generar exactamente este formato:

```json
{
  "slides": [
    {
      "type": "hook",
      "headline": "¿GPT-5 acaba de dejar obsoleto tu trabajo?",
      "emoji_icon": "🤯"
    },
    {
      "type": "content",
      "headline": "Qué pasó",
      "body": "OpenAI lanzó GPT-5, su modelo más potente, capaz de razonar como un experto en cualquier campo.",
      "emoji_icon": "📰"
    },
    {
      "type": "content",
      "headline": "Por qué te importa",
      "body": "Si usas IA en tu trabajo, este modelo puede hacer en minutos lo que antes tomaba horas.",
      "emoji_icon": "💡"
    },
    {
      "type": "content",
      "headline": "Cómo funciona",
      "body": "Es como un asistente que leyó todo el conocimiento humano y puede razonar paso a paso.",
      "emoji_icon": "⚙️"
    },
    {
      "type": "content",
      "headline": "En la práctica",
      "body": "Puedes pedirle que resuelva problemas matemáticos, escriba código o analice documentos complejos.",
      "emoji_icon": "✅"
    },
    {
      "type": "content",
      "headline": "El futuro que viene",
      "body": "En 2 años, modelos como este estarán integrados en todas las apps que usas hoy.",
      "emoji_icon": "🔮"
    },
    {
      "type": "cta",
      "headline": "¿Te resultó útil esta info?",
      "body": "Guarda este post y síguenos para más noticias de IA cada semana.",
      "emoji_icon": "👇"
    }
  ]
}
```

### Reglas de generación

| Slide | type | headline | body | emoji_icon |
|---|---|---|---|---|
| 1 | `hook` | ≤ 10 palabras, pregunta o afirmación | NO | 1 emoji |
| 2–6 | `content` | ≤ 10 palabras | ≤ 30 palabras | 1 emoji |
| 7 | `cta` | ≤ 10 palabras | ≤ 25 palabras, CTA claro | 1 emoji |

---

## Función de Mapeo: Slides → Templates

### JavaScript para n8n Code Node (`Preparar Placid Payload`)

```javascript
const slide = $json;
const type = slide.type || 'content';

// ⚠️ Reemplazar con UUIDs reales de placid.app
const TEMPLATE_UUIDS = {
  'hook':    'PLACID_TEMPLATE_HOOK',
  'content': 'PLACID_TEMPLATE_NORMAL',
  'cta':     'PLACID_TEMPLATE_CTA'
};

const template_uuid = TEMPLATE_UUIDS[type] || TEMPLATE_UUIDS['content'];
const counter = String(slide.num).padStart(2, '0') + ' / 07';

// Construir layers según tipo
const layers = {
  headline:      { text: slide.headline || '' },
  slide_counter: { text: counter },
  emoji_icon:    { text: slide.emoji_icon || '📌' }
};

// body solo en slides content y cta
if (type !== 'hook' && slide.body) {
  layers.body = { text: slide.body };
}

return [{ json: {
  ...slide,
  template_uuid,
  placid_layers: layers
}}];
```

---

## Lógica de Iteración de los 7 Slides en n8n

### Cómo fluyen los datos

```
Parsear Carousel
  └─▶ devuelve 7 items (uno por slide)
        └─▶ [n8n procesa cada item secuencialmente]
              └─▶ Preparar Placid Payload
                    └─▶ Placid - Crear Imagen  (POST /api/rest/images)
                          └─▶ Wait 15s
                                └─▶ Check Estado
                                      └─▶ Merge Slide + Image URL
                                            │
                                [todos los items llegan aquí]
                                            │
                                      Collect Slides
                                      (7 items → 1 item con array)
```

### Nota técnica

n8n procesa los 7 items **secuencialmente** a través de cada nodo.
El `Wait 15s` pausa toda la ejecución una sola vez para todos los items,
garantizando que Placid haya terminado de renderizar todos los slides.

---

## Endpoint Placid

```
POST https://api.placid.app/api/rest/images
Authorization: Bearer {PLACID_API_TOKEN}
Content-Type: application/json

Body:
{
  "template_uuid": "...",
  "layers": {
    "headline":      {"text": "..."},
    "body":          {"text": "..."},
    "slide_counter": {"text": "02 / 07"},
    "emoji_icon":    {"text": "⚡"}
  }
}

Response (queued):
{
  "id": "abc123",
  "status": "queued",
  "image_url": null,
  "refresh_url": "https://api.placid.app/api/rest/images/abc123",
  "webhook_called": false
}

Response (finished, al hacer GET al refresh_url):
{
  "id": "abc123",
  "status": "finished",
  "image_url": "https://static.placid.app/renders/abc123.png"
}
```

---

## Checklist de Setup en Placid

### Paso 1 — Crear cuenta
- [ ] Registrarse en https://placid.app
- [ ] Plan recomendado: Starter ($19/mes) — 500 renders/mes (~70 carruseles)

### Paso 2 — Crear Template HOOK
- [ ] Nuevo proyecto → Canvas 1080×1080
- [ ] Fondo: #0B0F1A
- [ ] Capa texto `logo`: "@ia.evoluciona", posición arriba-izquierda
- [ ] Capa texto `slide_counter`: posición arriba-derecha — marcar como DINÁMICO
- [ ] Línea decorativa cyan #00E5FF
- [ ] Capa texto `emoji_icon`: centro superior — marcar como DINÁMICO
- [ ] Capa texto `headline`: centro — marcar como DINÁMICO, Space Grotesk Bold 72px
- [ ] Texto estático "▸ desliza": abajo centro
- [ ] Copiar Template UUID del panel

### Paso 3 — Crear Template NORMAL
- [ ] Duplicar template anterior, ajustar layout
- [ ] Capa texto `headline`: izquierda superior, Space Grotesk Bold 68px — DINÁMICO
- [ ] Capa texto `body`: izquierda inferior, Inter Regular 30px, color #B0B7C3 — DINÁMICO
- [ ] Añadir línea separadora entre headline y body
- [ ] Copiar Template UUID

### Paso 4 — Crear Template CTA
- [ ] Fondo: gradiente #0B0F1A → #1A0B2E
- [ ] Mismo header que los otros
- [ ] Layout centrado con bordes decorativos
- [ ] Capa `handle_large`: "@ia.evoluciona" grande, estático
- [ ] Copiar Template UUID

### Paso 5 — Configurar en n8n
- [ ] Crear credencial: `httpBearerAuth` → nombre "Placid API" → token de Placid
- [ ] Reemplazar `PLACID_TEMPLATE_HOOK` → UUID real
- [ ] Reemplazar `PLACID_TEMPLATE_NORMAL` → UUID real
- [ ] Reemplazar `PLACID_TEMPLATE_CTA` → UUID real
- [ ] Reemplazar `PLACID_API_TOKEN` → token real (o usar credencial)
- [ ] Reemplazar `CAROUSEL_TABLE_ID` → ID de tabla Airtable
- [ ] Reemplazar `YOUR_TELEGRAM_CHAT_ID` → tu chat ID

---

## Payloads Completos — Los 7 Slides

### Carousel de ejemplo: "OpenAI lanza GPT-5"

**Slide 1 — HOOK**
```json
{
  "template_uuid": "PLACID_TEMPLATE_HOOK",
  "layers": {
    "headline":      {"text": "¿GPT-5 acaba de dejar obsoleto tu trabajo?"},
    "emoji_icon":    {"text": "🤯"},
    "slide_counter": {"text": "01 / 07"}
  }
}
```

**Slide 2 — Qué pasó**
```json
{
  "template_uuid": "PLACID_TEMPLATE_NORMAL",
  "layers": {
    "headline":      {"text": "Qué pasó"},
    "body":          {"text": "OpenAI presentó GPT-5, el modelo más avanzado hasta ahora, con razonamiento superior a expertos humanos."},
    "emoji_icon":    {"text": "📰"},
    "slide_counter": {"text": "02 / 07"}
  }
}
```

**Slide 3 — Por qué importa**
```json
{
  "template_uuid": "PLACID_TEMPLATE_NORMAL",
  "layers": {
    "headline":      {"text": "Por qué te importa"},
    "body":          {"text": "Si usas IA en tu trabajo, ahora tienes acceso a un asistente con capacidades de experto en segundos."},
    "emoji_icon":    {"text": "💡"},
    "slide_counter": {"text": "03 / 07"}
  }
}
```

**Slide 4 — Cómo funciona**
```json
{
  "template_uuid": "PLACID_TEMPLATE_NORMAL",
  "layers": {
    "headline":      {"text": "Cómo funciona"},
    "body":          {"text": "Como un detective que lee todo el contexto antes de responder. Razona paso a paso, no adivina."},
    "emoji_icon":    {"text": "⚙️"},
    "slide_counter": {"text": "04 / 07"}
  }
}
```

**Slide 5 — Ejemplo práctico**
```json
{
  "template_uuid": "PLACID_TEMPLATE_NORMAL",
  "layers": {
    "headline":      {"text": "En la práctica"},
    "body":          {"text": "Puedes pedirle que revise un contrato, resuelva un problema matemático o escriba código listo para producción."},
    "emoji_icon":    {"text": "✅"},
    "slide_counter": {"text": "05 / 07"}
  }
}
```

**Slide 6 — Futuro**
```json
{
  "template_uuid": "PLACID_TEMPLATE_NORMAL",
  "layers": {
    "headline":      {"text": "El futuro que viene"},
    "body":          {"text": "En 2026 este modelo estará integrado en Word, Excel y las apps que ya usas todos los días."},
    "emoji_icon":    {"text": "🔮"},
    "slide_counter": {"text": "06 / 07"}
  }
}
```

**Slide 7 — CTA**
```json
{
  "template_uuid": "PLACID_TEMPLATE_CTA",
  "layers": {
    "headline":      {"text": "¿Te resultó útil esta info?"},
    "body":          {"text": "Guarda este post y síguenos para más noticias de IA cada semana."},
    "emoji_icon":    {"text": "👇"},
    "slide_counter": {"text": "07 / 07"}
  }
}
```
