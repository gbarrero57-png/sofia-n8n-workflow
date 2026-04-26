import json

with open('c:/Users/Barbara/Documents/n8n_workflow_claudio/workflows/ai-news/carousel_pipeline.json', encoding='utf-8') as f:
    wf = json.load(f)

# CSS compartido para reutilizar
CSS_SHARED = {
    'dots': "background-image:radial-gradient(circle,rgba(255,255,255,0.05) 1px,transparent 1px);background-size:44px 44px;",
    'purple': "#6C63FF",
    'cyan': "#00D4FF",
    'bg': "#07070F",
}

# Template HOOK
HOOK_TEMPLATE = """<!DOCTYPE html>
<html><head><style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
body{width:1080px;height:1080px;overflow:hidden;background:#07070F;}
.root{width:1080px;height:1080px;overflow:hidden;
  background:radial-gradient(ellipse 80% 60% at 50% 40%,#1E1040 0%,#07070F 70%);
  font-family:Inter,sans-serif;display:flex;flex-direction:column;
  align-items:center;justify-content:center;position:relative;}
.glow1{position:absolute;width:500px;height:500px;border-radius:50%;
  background:radial-gradient(circle,rgba(108,99,255,0.25) 0%,transparent 70%);
  top:-80px;left:-80px;filter:blur(40px);}
.glow2{position:absolute;width:400px;height:400px;border-radius:50%;
  background:radial-gradient(circle,rgba(0,212,255,0.15) 0%,transparent 70%);
  bottom:-60px;right:-60px;filter:blur(50px);}
.dots{position:absolute;inset:0;
  background-image:radial-gradient(circle,rgba(255,255,255,0.06) 1px,transparent 1px);
  background-size:40px 40px;}
.content{position:relative;z-index:2;display:flex;flex-direction:column;
  align-items:center;padding:80px;}
.emoji{font-size:96px;margin-bottom:24px;
  filter:drop-shadow(0 0 30px rgba(108,99,255,0.8));}
.divider{width:80px;height:3px;
  background:linear-gradient(90deg,#6C63FF,#00D4FF);
  border-radius:2px;margin-bottom:36px;}
.headline{font-size:62px;font-weight:900;text-align:center;line-height:1.08;
  max-width:900px;letter-spacing:-1px;
  background:linear-gradient(135deg,#FFFFFF 0%,#B8B0FF 50%,#00D4FF 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.badge{position:absolute;bottom:52px;right:56px;
  background:linear-gradient(135deg,#6C63FF,#4A90E2);
  color:#fff;border-radius:24px;padding:10px 20px;
  font-size:15px;font-weight:700;letter-spacing:0.5px;
  box-shadow:0 4px 20px rgba(108,99,255,0.5);}
.num{position:absolute;top:48px;left:56px;
  font-size:13px;font-weight:700;color:rgba(255,255,255,0.3);letter-spacing:2px;}
</style></head><body>
<div class="root">
  <div class="glow1"></div><div class="glow2"></div><div class="dots"></div>
  <div class="content">
    <div class="emoji">EMOJI_PH</div>
    <div class="divider"></div>
    <div class="headline">HEADLINE_PH</div>
  </div>
  <div class="badge">IA Noticias</div>
  <div class="num">01 — 07</div>
</div>
</body></html>"""

# Template CONTENT
CONTENT_TEMPLATE = """<!DOCTYPE html>
<html><head><style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
body{width:1080px;height:1080px;overflow:hidden;background:#07070F;}
.root{width:1080px;height:1080px;overflow:hidden;
  background:#0A0A12;font-family:Inter,sans-serif;
  display:flex;flex-direction:column;justify-content:center;
  position:relative;padding:70px 80px;}
.accent-bar{position:absolute;top:0;left:0;right:0;height:5px;
  background:linear-gradient(90deg,#6C63FF 0%,#00D4FF 60%,transparent 100%);}
.glow{position:absolute;width:600px;height:300px;
  background:radial-gradient(ellipse,rgba(108,99,255,0.12) 0%,transparent 70%);
  top:-50px;left:-100px;filter:blur(60px);}
.dots{position:absolute;inset:0;
  background-image:radial-gradient(circle,rgba(255,255,255,0.04) 1px,transparent 1px);
  background-size:48px 48px;}
.num-pill{position:absolute;top:36px;right:56px;
  background:rgba(108,99,255,0.15);border:1px solid rgba(108,99,255,0.4);
  color:#8B82FF;font-size:13px;font-weight:800;
  padding:6px 14px;border-radius:20px;letter-spacing:1px;}
.content{position:relative;z-index:2;}
.emoji-wrap{width:72px;height:72px;border-radius:20px;
  background:linear-gradient(135deg,rgba(108,99,255,0.25),rgba(0,212,255,0.15));
  border:1px solid rgba(108,99,255,0.3);
  display:flex;align-items:center;justify-content:center;
  font-size:38px;margin-bottom:32px;
  box-shadow:0 8px 32px rgba(108,99,255,0.2);}
.headline{font-size:46px;font-weight:900;color:#FFFFFF;
  line-height:1.12;margin-bottom:28px;
  letter-spacing:-0.5px;max-width:880px;}
.body-wrap{border-left:3px solid;
  border-image:linear-gradient(180deg,#6C63FF,#00D4FF) 1;
  padding-left:24px;}
.body{font-size:22px;color:#A0A8C0;line-height:1.65;max-width:860px;}
.bottom-line{position:absolute;bottom:60px;left:80px;
  display:flex;align-items:center;gap:12px;}
.line-accent{width:48px;height:2px;
  background:linear-gradient(90deg,#6C63FF,transparent);}
.line-text{font-size:12px;color:rgba(255,255,255,0.25);
  letter-spacing:2px;font-weight:700;}
</style></head><body>
<div class="root">
  <div class="accent-bar"></div><div class="glow"></div><div class="dots"></div>
  <div class="num-pill">NUM_PH / 07</div>
  <div class="content">
    <div class="emoji-wrap">EMOJI_PH</div>
    <div class="headline">HEADLINE_PH</div>
    <div class="body-wrap">
      <div class="body">BODY_PH</div>
    </div>
  </div>
  <div class="bottom-line">
    <div class="line-accent"></div>
    <div class="line-text">IA NOTICIAS</div>
  </div>
</div>
</body></html>"""

# Template CTA
CTA_TEMPLATE = """<!DOCTYPE html>
<html><head><style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
body{width:1080px;height:1080px;overflow:hidden;background:#07070F;}
.root{width:1080px;height:1080px;overflow:hidden;
  background:linear-gradient(145deg,#0F0A2A 0%,#1A0E3A 40%,#0A1628 100%);
  font-family:Inter,sans-serif;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  position:relative;padding:80px;}
.orb1{position:absolute;width:700px;height:700px;border-radius:50%;
  background:radial-gradient(circle,rgba(108,99,255,0.3) 0%,transparent 65%);
  top:-200px;left:-200px;filter:blur(80px);}
.orb2{position:absolute;width:500px;height:500px;border-radius:50%;
  background:radial-gradient(circle,rgba(0,212,255,0.2) 0%,transparent 65%);
  bottom:-150px;right:-100px;filter:blur(70px);}
.dots{position:absolute;inset:0;
  background-image:radial-gradient(circle,rgba(255,255,255,0.05) 1px,transparent 1px);
  background-size:44px 44px;}
.card{position:relative;z-index:2;
  background:rgba(255,255,255,0.04);
  border:1px solid rgba(255,255,255,0.1);
  border-radius:32px;padding:64px 72px;
  display:flex;flex-direction:column;align-items:center;
  backdrop-filter:blur(10px);
  box-shadow:0 32px 80px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.08);
  max-width:900px;width:100%;}
.emoji{font-size:80px;margin-bottom:28px;
  filter:drop-shadow(0 0 24px rgba(108,99,255,0.9));}
.headline{font-size:52px;font-weight:900;text-align:center;line-height:1.1;
  background:linear-gradient(135deg,#FFFFFF 0%,#C4BFFF 50%,#7FD4FF 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  margin-bottom:20px;letter-spacing:-0.5px;}
.body{font-size:21px;color:rgba(255,255,255,0.6);
  text-align:center;line-height:1.6;margin-bottom:36px;}
.btn{background:linear-gradient(135deg,#6C63FF,#4A90E2);
  color:#fff;font-size:18px;font-weight:800;
  padding:16px 48px;border-radius:50px;letter-spacing:0.5px;
  box-shadow:0 8px 32px rgba(108,99,255,0.5);}
.brand{position:absolute;bottom:44px;
  font-size:14px;color:rgba(255,255,255,0.25);letter-spacing:3px;font-weight:700;}
.num{position:absolute;top:44px;right:56px;
  font-size:13px;color:rgba(255,255,255,0.25);font-weight:700;letter-spacing:1px;}
</style></head><body>
<div class="root">
  <div class="orb1"></div><div class="orb2"></div><div class="dots"></div>
  <div class="num">07 / 07</div>
  <div class="card">
    <div class="emoji">EMOJI_PH</div>
    <div class="headline">HEADLINE_PH</div>
    <div class="body">BODY_PH</div>
    <div class="btn">Seguir ahora</div>
  </div>
  <div class="brand">IA.EVOLUCIONA</div>
</div>
</body></html>"""

# Build el jsonBody para el nodo de n8n
# Las expresiones n8n usan ={{ }} para JS, y $json para datos del item actual
body_obj = {
    "model": "anthropic/claude-sonnet-4-5",
    "messages": [
        {
            "role": "system",
            "content": (
                "Eres un diseñador experto en slides de Instagram. "
                "Recibes plantillas HTML exactas con placeholders. "
                "Tu único trabajo es reemplazar los placeholders con el contenido real y devolver el HTML completo. "
                "Devuelves SOLO el HTML, sin markdown, sin bloques de código, sin explicaciones."
            )
        },
        {
            "role": "user",
            "content": "__DYNAMIC__"
        }
    ]
}

# Construimos el jsonBody como expresión n8n (string con JS concat)
# Los templates se insertan como strings literales, los valores dinámicos via $json

hook_escaped = HOOK_TEMPLATE.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace("'", "\\'")
content_escaped = CONTENT_TEMPLATE.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace("'", "\\'")
cta_escaped = CTA_TEMPLATE.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace("'", "\\'")

json_body = (
    '=JSON.stringify({'
    '"model":"anthropic/claude-sonnet-4-5",'
    '"messages":[{'
    '"role":"system",'
    '"content":"Eres un diseñador experto en slides de Instagram. Recibes una plantilla HTML con placeholders (EMOJI_PH, HEADLINE_PH, BODY_PH, NUM_PH). Reemplazas EXACTAMENTE los placeholders con los valores reales y devuelves SOLO el HTML completo. Sin markdown, sin bloques de código, sin texto extra."'
    '},{'
    '"role":"user",'
    '"content": (function(){'
    'var type = ' + '" + $json.type + "' + ';'
    'var emoji = ' + '" + $json.emoji_icon + "' + ';'
    'var headline = ' + '" + $json.headline.replace(/"/g,\\"\\\\\\"\\"") + "' + ';'
    'var body = ' + '" + ($json.body || \\"\\").replace(/"/g,\\"\\\\\\"\\"") + "' + ';'
    'var num = ("0" + ' + '" + $json.num + "' + ').slice(-2);'
    'var tmpl;'
    'if(type==="hook"){'
    'tmpl="' + hook_escaped + '";'
    '} else if(type==="cta"){'
    'tmpl="' + cta_escaped + '";'
    '} else {'
    'tmpl="' + content_escaped + '";'
    '}'
    'tmpl=tmpl.replace(/EMOJI_PH/g,emoji).replace(/HEADLINE_PH/g,headline).replace(/BODY_PH/g,body).replace(/NUM_PH/g,num);'
    'return "Rellena los placeholders en esta plantilla HTML con los datos del slide y devuelve el HTML completo:\\n\\nDatos:\\n- EMOJI: "+emoji+"\\n- HEADLINE: "+headline+"\\n- BODY: "+body+"\\n- NUM: "+num+"\\n\\nPlantilla HTML (reemplaza los placeholders y devuelve):\\n"+tmpl;'
    '})()'
    '}]})'
)

# Actually, let's use a simpler and more reliable approach:
# Pre-render the HTML directly in the Code node BEFORE calling Claude
# Claude doesn't need to be called for the HTML template substitution - we can do it in JS
# Instead, let's update the "Parsear Carousel" node or add a new "Preparar HTML" Code node
# But that changes the workflow structure significantly

# BETTER APPROACH: Since the templates are fixed, skip Claude for HTML generation entirely
# Use a Code node that does the substitution directly
# This is MUCH more reliable and faster (no LLM call needed for pure template substitution)

print("Templates ready. Building Code node approach instead of Claude for HTML generation...")

# The Code node JS that generates HTML directly
code_js = r"""const slide = $json;
const type = slide.type || 'content';
const emoji = slide.emoji_icon || '📌';
const headline = (slide.headline || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const body = (slide.body || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const num = String(slide.num || 1).padStart(2, '0');

let html = '';

if (type === 'hook') {
  html = `<!DOCTYPE html>
<html><head><style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
body{width:1080px;height:1080px;overflow:hidden;background:#07070F;}
.root{width:1080px;height:1080px;overflow:hidden;
  background:radial-gradient(ellipse 80% 60% at 50% 40%,#1E1040 0%,#07070F 70%);
  font-family:Inter,sans-serif;display:flex;flex-direction:column;
  align-items:center;justify-content:center;position:relative;}
.glow1{position:absolute;width:500px;height:500px;border-radius:50%;
  background:radial-gradient(circle,rgba(108,99,255,0.25) 0%,transparent 70%);
  top:-80px;left:-80px;filter:blur(40px);}
.glow2{position:absolute;width:400px;height:400px;border-radius:50%;
  background:radial-gradient(circle,rgba(0,212,255,0.15) 0%,transparent 70%);
  bottom:-60px;right:-60px;filter:blur(50px);}
.dots{position:absolute;inset:0;
  background-image:radial-gradient(circle,rgba(255,255,255,0.06) 1px,transparent 1px);
  background-size:40px 40px;}
.content{position:relative;z-index:2;display:flex;flex-direction:column;
  align-items:center;padding:80px;}
.emoji{font-size:96px;margin-bottom:24px;
  filter:drop-shadow(0 0 30px rgba(108,99,255,0.8));}
.divider{width:80px;height:3px;
  background:linear-gradient(90deg,#6C63FF,#00D4FF);
  border-radius:2px;margin-bottom:36px;}
.headline{font-size:62px;font-weight:900;text-align:center;line-height:1.08;
  max-width:900px;letter-spacing:-1px;
  background:linear-gradient(135deg,#FFFFFF 0%,#B8B0FF 50%,#00D4FF 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.badge{position:absolute;bottom:52px;right:56px;
  background:linear-gradient(135deg,#6C63FF,#4A90E2);
  color:#fff;border-radius:24px;padding:10px 20px;
  font-size:15px;font-weight:700;letter-spacing:0.5px;
  box-shadow:0 4px 20px rgba(108,99,255,0.5);}
.num{position:absolute;top:48px;left:56px;
  font-size:13px;font-weight:700;color:rgba(255,255,255,0.3);letter-spacing:2px;}
</style></head><body>
<div class="root">
  <div class="glow1"></div><div class="glow2"></div><div class="dots"></div>
  <div class="content">
    <div class="emoji">${emoji}</div>
    <div class="divider"></div>
    <div class="headline">${headline}</div>
  </div>
  <div class="badge">IA Noticias</div>
  <div class="num">01 — 07</div>
</div>
</body></html>`;

} else if (type === 'cta') {
  html = `<!DOCTYPE html>
<html><head><style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
body{width:1080px;height:1080px;overflow:hidden;background:#07070F;}
.root{width:1080px;height:1080px;overflow:hidden;
  background:linear-gradient(145deg,#0F0A2A 0%,#1A0E3A 40%,#0A1628 100%);
  font-family:Inter,sans-serif;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  position:relative;padding:80px;}
.orb1{position:absolute;width:700px;height:700px;border-radius:50%;
  background:radial-gradient(circle,rgba(108,99,255,0.3) 0%,transparent 65%);
  top:-200px;left:-200px;filter:blur(80px);}
.orb2{position:absolute;width:500px;height:500px;border-radius:50%;
  background:radial-gradient(circle,rgba(0,212,255,0.2) 0%,transparent 65%);
  bottom:-150px;right:-100px;filter:blur(70px);}
.dots{position:absolute;inset:0;
  background-image:radial-gradient(circle,rgba(255,255,255,0.05) 1px,transparent 1px);
  background-size:44px 44px;}
.card{position:relative;z-index:2;
  background:rgba(255,255,255,0.04);
  border:1px solid rgba(255,255,255,0.1);
  border-radius:32px;padding:64px 72px;
  display:flex;flex-direction:column;align-items:center;
  box-shadow:0 32px 80px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.08);
  max-width:900px;width:100%;}
.emoji{font-size:80px;margin-bottom:28px;
  filter:drop-shadow(0 0 24px rgba(108,99,255,0.9));}
.headline{font-size:52px;font-weight:900;text-align:center;line-height:1.1;
  background:linear-gradient(135deg,#FFFFFF 0%,#C4BFFF 50%,#7FD4FF 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  margin-bottom:20px;letter-spacing:-0.5px;}
.body{font-size:21px;color:rgba(255,255,255,0.6);
  text-align:center;line-height:1.6;margin-bottom:36px;}
.btn{background:linear-gradient(135deg,#6C63FF,#4A90E2);
  color:#fff;font-size:18px;font-weight:800;
  padding:16px 48px;border-radius:50px;letter-spacing:0.5px;
  box-shadow:0 8px 32px rgba(108,99,255,0.5);}
.brand{position:absolute;bottom:44px;
  font-size:14px;color:rgba(255,255,255,0.25);letter-spacing:3px;font-weight:700;}
.num{position:absolute;top:44px;right:56px;
  font-size:13px;color:rgba(255,255,255,0.25);font-weight:700;letter-spacing:1px;}
</style></head><body>
<div class="root">
  <div class="orb1"></div><div class="orb2"></div><div class="dots"></div>
  <div class="num">07 / 07</div>
  <div class="card">
    <div class="emoji">${emoji}</div>
    <div class="headline">${headline}</div>
    <div class="body">${body}</div>
    <div class="btn">Seguir ahora</div>
  </div>
  <div class="brand">IA.EVOLUCIONA</div>
</div>
</body></html>`;

} else {
  html = `<!DOCTYPE html>
<html><head><style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
body{width:1080px;height:1080px;overflow:hidden;background:#07070F;}
.root{width:1080px;height:1080px;overflow:hidden;
  background:#0A0A12;font-family:Inter,sans-serif;
  display:flex;flex-direction:column;justify-content:center;
  position:relative;padding:70px 80px;}
.accent-bar{position:absolute;top:0;left:0;right:0;height:5px;
  background:linear-gradient(90deg,#6C63FF 0%,#00D4FF 60%,transparent 100%);}
.glow{position:absolute;width:600px;height:300px;
  background:radial-gradient(ellipse,rgba(108,99,255,0.12) 0%,transparent 70%);
  top:-50px;left:-100px;filter:blur(60px);}
.dots{position:absolute;inset:0;
  background-image:radial-gradient(circle,rgba(255,255,255,0.04) 1px,transparent 1px);
  background-size:48px 48px;}
.num-pill{position:absolute;top:36px;right:56px;
  background:rgba(108,99,255,0.15);border:1px solid rgba(108,99,255,0.4);
  color:#8B82FF;font-size:13px;font-weight:800;
  padding:6px 14px;border-radius:20px;letter-spacing:1px;}
.content{position:relative;z-index:2;}
.emoji-wrap{width:72px;height:72px;border-radius:20px;
  background:linear-gradient(135deg,rgba(108,99,255,0.25),rgba(0,212,255,0.15));
  border:1px solid rgba(108,99,255,0.3);
  display:flex;align-items:center;justify-content:center;
  font-size:38px;margin-bottom:32px;
  box-shadow:0 8px 32px rgba(108,99,255,0.2);}
.headline{font-size:46px;font-weight:900;color:#FFFFFF;
  line-height:1.12;margin-bottom:28px;
  letter-spacing:-0.5px;max-width:880px;}
.body-wrap{border-left:3px solid;
  border-image:linear-gradient(180deg,#6C63FF,#00D4FF) 1;
  padding-left:24px;}
.body{font-size:22px;color:#A0A8C0;line-height:1.65;max-width:860px;}
.bottom-line{position:absolute;bottom:60px;left:80px;
  display:flex;align-items:center;gap:12px;}
.line-accent{width:48px;height:2px;
  background:linear-gradient(90deg,#6C63FF,transparent);}
.line-text{font-size:12px;color:rgba(255,255,255,0.25);
  letter-spacing:2px;font-weight:700;}
</style></head><body>
<div class="root">
  <div class="accent-bar"></div><div class="glow"></div><div class="dots"></div>
  <div class="num-pill">${num} / 07</div>
  <div class="content">
    <div class="emoji-wrap">${emoji}</div>
    <div class="headline">${headline}</div>
    <div class="body-wrap">
      <div class="body">${body}</div>
    </div>
  </div>
  <div class="bottom-line">
    <div class="line-accent"></div>
    <div class="line-text">IA NOTICIAS</div>
  </div>
</div>
</body></html>`;
}

return [{ json: {
  num: slide.num,
  type: slide.type,
  headline: slide.headline,
  body: slide.body || '',
  emoji_icon: slide.emoji_icon,
  titulo_noticia: slide.titulo_noticia,
  url_noticia: slide.url_noticia,
  hash_titulo: slide.hash_titulo,
  score: slide.score,
  fecha: slide.fecha,
  html_slide: html
}}];"""

# Now update the workflow:
# 1. Replace "Claude - Diseñar Slide HTML" (HTTP node) with a Code node
# 2. Remove "Parsear HTML Claude" (it's no longer needed since Code node outputs directly)
# 3. Wire: "Parsear Carousel" -> "Generar HTML Slide" (Code) -> "HTML to Image"

new_html_node = {
    "parameters": {
        "jsCode": code_js
    },
    "id": "c2000001-0000-0000-0000-000000000017",
    "name": "Generar HTML Slide",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [3300, 300]
}

# Update nodes: replace nodes 17 and 19 (Claude HTTP + Parsear HTML Code)
new_nodes = []
for node in wf['nodes']:
    nid = node['id']
    name = node['name']
    if name == 'Claude - Diseñar Slide HTML':
        new_nodes.append(new_html_node)
        print(f'Replaced: {name} -> Generar HTML Slide (Code node)')
    elif name == 'Parsear HTML Claude':
        print(f'Removed: {name}')
        # skip it
    else:
        new_nodes.append(node)

wf['nodes'] = new_nodes

# Update connections:
# "Parsear Carousel" -> "Generar HTML Slide"
# "Generar HTML Slide" -> "HTML to Image"
# Remove "Claude - Diseñar Slide HTML" and "Parsear HTML Claude" connections

conn = wf['connections']

# Fix Parsear Carousel output
conn['Parsear Carousel'] = {"main": [[{"node": "Generar HTML Slide", "type": "main", "index": 0}]]}

# Add Generar HTML Slide connection
conn['Generar HTML Slide'] = {"main": [[{"node": "HTML to Image", "type": "main", "index": 0}]]}

# Remove old node connections
for old_name in ['Claude - Diseñar Slide HTML', 'Parsear HTML Claude']:
    if old_name in conn:
        del conn[old_name]
        print(f'Removed connection: {old_name}')

wf['connections'] = conn

with open('c:/Users/Barbara/Documents/n8n_workflow_claudio/workflows/ai-news/carousel_pipeline.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, ensure_ascii=False, indent=2)

print(f'\nDone. Total nodes: {len(wf["nodes"])}')
print('Connections:', list(wf["connections"].keys()))
