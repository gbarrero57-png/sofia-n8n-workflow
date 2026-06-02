#!/usr/bin/env python3
"""
E2E test for @GeneradorPreU_bot — mirrors the n8n pipeline exactly.

Pipeline under test:
  Stage 1: Generate   — same prompt as Build OpenAI Request + gpt-4o (useReasoning=false)
  Stage 2: Parse      — same JSON extraction as Extraer JSON Problemas
  Stage 3: Re-solver  — same blind re-solve as Re-solver Adversarial node
  Stage 4: /verify    — calls the word-generator /verify endpoint (optional)
  Stage 5: Judge      — independent GPT-4o auditor scores final answer keys

Output: per-area accuracy table, corrections per layer, warnings flagged.

Usage:
    python e2e_test.py                     # all areas, 5 problems, DECO
    python e2e_test.py algebra 5           # one area, custom count
    python e2e_test.py algebra 10 facil    # custom difficulty
"""
import json, sys, time, re, os, requests
from openai import OpenAI
import io

# Fix Windows cp1252 encoding issues (θ, √, ≈ etc.)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ── Config ────────────────────────────────────────────────────────────────────
DEFAULT_DIFFICULTY  = 'deco'
DEFAULT_N           = 5
VERIFY_URL          = 'https://algebra-word-gen.bzgfek.easypanel.host/verify'
GENERATE_MODEL      = 'gpt-4o'   # override with env var GENERATE_MODEL

TEST_CASES = {
    'algebra':     'matrices y determinantes',
    'aritmetica':  'porcentajes y moviles',
    'geometria':   'circunferencia y triangulos',
    'calculo':     'limites y derivadas',
    'estadistica': 'probabilidad y bayes',
    'fisica':      'cinematica y energia',
    'quimica':     'estequiometria y equilibrio',
}

# Allow overriding model via env var
import os as _os
GENERATE_MODEL  = _os.environ.get('GENERATE_MODEL', GENERATE_MODEL)
GEMINI_API_KEY  = _os.environ.get('GEMINI_API_KEY', '')
GEMINI_BASE_URL  = 'https://generativelanguage.googleapis.com/v1beta/openai/'
DEEPSEEK_API_KEY = _os.environ.get('DEEPSEEK_API_KEY', '')
if not DEEPSEEK_API_KEY:
    # Fallback: read from .env files
    for _p in ['../.env', '../n8n-mcp/.env', '.env']:
        if _os.path.exists(_p):
            for _line in open(_p).read().splitlines():
                if 'DEEPSEEK' in _line and '=' in _line:
                    _v = _line.split('=',1)[1].strip().strip('"').strip("'")
                    if _v.startswith('sk-'): DEEPSEEK_API_KEY = _v; break
            if DEEPSEEK_API_KEY: break
DEEPSEEK_BASE_URL = 'https://api.deepseek.com'

# ── API key from .env ─────────────────────────────────────────────────────────
def get_openai_key():
    # 1. Env var
    key = os.environ.get('OPENAI_API_KEY', '')
    if key.startswith('sk-'):
        return key
    # 2. Any .env file in common locations
    paths = ['../n8n-mcp/.env', '.env', os.path.expanduser('~/.env'), '../.env']
    for p in paths:
        if os.path.exists(p):
            for line in open(p).read().splitlines():
                if 'OPENAI' in line and '=' in line:
                    val = line.split('=', 1)[1].strip().strip('"').strip("'")
                    if val.startswith('sk-'):
                        return val
    # 3. Command-line last arg if it looks like a key
    if len(sys.argv) > 1 and sys.argv[-1].startswith('sk-'):
        return sys.argv[-1]
    # 4. Interactive prompt
    try:
        key = input('OpenAI API key (sk-...): ').strip()
        return key
    except Exception:
        return ''

# ── Extract prompt blocks from wf_current.json ───────────────────────────────
def _extract_template_literal(code, start_marker, end_search_from):
    """Extract content of a JS template literal after start_marker."""
    start = code.find(start_marker)
    if start < 0:
        return ''
    start += len(start_marker)
    # Find next ` that closes the literal (not escaped)
    pos = start
    while pos < len(code):
        if code[pos] == '`' and (pos == 0 or code[pos-1] != '\\'):
            return code[start:pos]
        pos += 1
    return code[start:start+2000]

def build_deco_prompt(area, topic, difficulty, n):
    """Reconstruct the exact same systemPrompt + userMsg the n8n bot would build."""
    with open('wf_current.json', encoding='utf-8') as f:
        wf = json.load(f)
    b = next(x for x in wf['nodes'] if x['name'] == 'Build OpenAI Request')
    code = b['parameters']['jsCode']

    is_deco = difficulty.lower() == 'deco'
    area_lower = area.lower()

    # Extract each block
    base_rules    = _extract_template_literal(code, 'const baseRules = `\n', 0)
    exam_rules    = _extract_template_literal(code, 'const examRules = `\n', 0)
    variety_rules = _extract_template_literal(code, 'const varietyRules = `\n', 0)
    chart_rules   = _extract_template_literal(code, 'const chartRules = `\n', 0)

    # formatRulesGPT (useReasoning is always false -> always use formatRulesGPT)
    format_rules  = _extract_template_literal(code, '// gpt-4o: needs explicit CoT via solution/answer for auto-correction\nconst formatRulesGPT = `\n', 0)
    if not format_rules:
        # Fallback: find formatRulesGPT another way
        idx = code.find('const formatRulesGPT = `')
        if idx >= 0:
            format_rules = _extract_template_literal(code, code[idx:idx+25], 0)

    # DECO_RULES[area]
    deco_area_rules = ''
    if is_deco:
        deco_marker = f'  {area_lower}: `\n'
        idx_deco_rules = code.find('const DECO_RULES')
        idx_deco_end   = code.find('const decoRules')
        deco_block = code[idx_deco_rules:idx_deco_end]
        deco_area_rules = _extract_template_literal(deco_block, deco_marker, 0)
        if not deco_area_rules:
            # Fallback to algebra DECO rules
            deco_area_rules = _extract_template_literal(deco_block, '  algebra: `\n', 0)

    system_prompt = (
        base_rules
        + (deco_area_rules if is_deco else exam_rules)
        + variety_rules
        + chart_rules
        + format_rules
    )

    area_ctx = {
        'fisica':  'Contexto: preuniversitaria peruana, estilo UNMSM Ciencias. Usa SI. Valores realistas. Verifica unidades.',
        'quimica': 'Contexto: preuniversitaria peruana, estilo UNMSM Ciencias. Masas molares enteras. Alternativas con NOMBRES.',
    }.get(area_lower, '')

    deco_note = (
        f'\nMODO DECO activado para {area_lower}: multitematico, alternativas trampa, minimo 4 pasos de razonamiento.'
        if is_deco else ''
    )

    difficulty_notes = {
        'facil':   '\nNIVEL FACIL: aplicacion directa de UNA formula, 1-2 pasos, datos completos.',
        'medio':   '\nNIVEL MEDIO: proceso de 3-4 pasos, combina 2 conceptos.',
        'dificil': '\nNIVEL DIFICIL: proceso de 5-6 pasos, estrategia no obvia, estilo UNMSM/UNI.',
        'deco':    ('\nNIVEL DECO - FILOSOFIA SAN MARCOS / LUMBRERAS / UNI:\n'
                    'ENUNCIADO CORTO, RESOLUCION DIFICIL. No mas de 3 lineas para leer. El truco esta escondido.\n'
                    'INTEGRACION OBLIGATORIA: cada problema mezcla MINIMO 3 conceptos distintos del area.\n'
                    'TRAMPA CONCEPTUAL: condicion que hace creer que va por un camino, pero hay una propiedad clave.\n'
                    'ABSTRACCION: usa parametros (k, a, n), matrices simbolicas, condiciones generales.\n'
                    'JERARQUIA INTERNA: primeros 30% base, 40% intermedio, 30% final son los mas exigentes.\n'
                    'DISTRIBUCION DE CLAVES: distribuye correct:true entre A, B, C, D, E.\n'
                    'DISTRACTORES DE ERROR REAL: cada opcion incorrecta viene de un error que un alumno real comete.')
    }.get(difficulty.lower(), '')

    user_msg = (
        f'Genera {n} problemas de {area_lower} sobre el tema: {topic}'
        f'\nDificultad: {difficulty}'
        f'{difficulty_notes}'
        f'\nRECUERDA: sin LaTeX, notacion plana con ^ para potencias, variedad de estructuras.'
        + (f'\n{area_ctx}' if area_ctx else '')
        + deco_note
        + f'\n[seed:{int(time.time())}]'
    )

    return system_prompt, user_msg

# ── Stage 1: Generate ─────────────────────────────────────────────────────────
def _make_generate_client():
    """Return (client, model) for the generation step."""
    is_gemini = GENERATE_MODEL.startswith('gemini')
    if is_gemini:
        from openai import OpenAI as _OAI
        key = GEMINI_API_KEY or GENERATE_MODEL  # key must come from env
        if not GEMINI_API_KEY:
            raise ValueError('Set GEMINI_API_KEY env var to use Gemini models')
        return _OAI(api_key=GEMINI_API_KEY, base_url=GEMINI_BASE_URL), GENERATE_MODEL
    return None, GENERATE_MODEL  # caller uses the shared client

SPLIT_PIPELINE = _os.environ.get('SPLIT_PIPELINE', '0') == '1'

# Extra instruction appended to system prompt in split-pipeline mode
_SPLIT_EXTRA = """
=== INSTRUCCION ESPECIAL: MODO SPLIT PIPELINE ===
Tu rol en este modo es SOLO generar el enunciado y las opciones. NO elijas la respuesta correcta.
- Pon "correct": false en TODAS las opciones
- Omite el campo "answer" o dejalo vacio ""
- El campo "solution" debe contener el desarrollo algebraico/matematico detallado HASTA EL PENULTIMO PASO, sin mencionar cual opcion corresponde a la respuesta
- Genera distractores plausibles pero numericamente distintos al valor correcto
Un verificador matematico independiente determinara la respuesta correcta.
"""

def stage1_generate(client, area, topic, difficulty, n):
    system, user = build_deco_prompt(area, topic, difficulty, n)

    if SPLIT_PIPELINE:
        system = system + _SPLIT_EXTRA

    is_o1     = GENERATE_MODEL.startswith('o1') or GENERATE_MODEL.startswith('o3')
    is_gemini = GENERATE_MODEL.startswith('gemini')

    gen_client, model = _make_generate_client()
    if gen_client is None:
        gen_client = client

    kwargs = dict(
        model=model,
        messages=[
            {'role': 'system', 'content': system},
            {'role': 'user',   'content': user}
        ],
        max_tokens=16000,
    )
    if not is_o1:
        kwargs['response_format'] = {'type': 'json_object'}
        kwargs['temperature'] = {'deco': 0.4, 'dificil': 0.6, 'medio': 0.8}.get(difficulty.lower(), 0.9)

    resp = gen_client.chat.completions.create(**kwargs)
    raw = resp.choices[0].message.content
    data = _parse_json_robust(raw)
    return data

def _parse_json_robust(raw):
    """Parse JSON tolerantly — fixes LaTeX backslashes that Gemini emits."""
    # Strip markdown code fences
    raw = re.sub(r'^```(?:json)?\s*', '', raw.strip(), flags=re.MULTILINE)
    raw = re.sub(r'\s*```$', '', raw.strip(), flags=re.MULTILINE)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    # Escape invalid JSON escape sequences (LaTeX: \f -> \\f, \s -> \\s, etc.)
    fixed = re.sub(r'\\([^"\\/bfnrtu0-9])', r'\\\\\1', raw)
    try:
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass
    # Remove control characters inside strings
    fixed2 = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', fixed)
    try:
        return json.loads(fixed2)
    except json.JSONDecodeError:
        pass
    # Last resort: extract the problems array with regex
    m = re.search(r'\{.*"problems"\s*:\s*\[.*\]\s*\}', fixed2, re.DOTALL)
    if m:
        return json.loads(m.group(0))
    raise ValueError(f'Cannot parse JSON from model output (len={len(raw)})')


def _safe_eval_local(expr):
    """Safe arithmetic evaluator for e2e local use."""
    import ast as _ast, operator as _op
    _OPS = {_ast.Add: _op.add, _ast.Sub: _op.sub, _ast.Mult: _op.mul,
            _ast.Div: _op.truediv, _ast.Pow: pow, _ast.USub: _op.neg}
    def _ev(n):
        if isinstance(n, _ast.Constant) and isinstance(n.value, (int, float)):
            return float(n.value)
        if isinstance(n, _ast.BinOp) and type(n.op) in _OPS:
            r = _ev(n.right)
            if isinstance(n.op, _ast.Div) and r == 0:
                raise ZeroDivisionError()
            return _OPS[type(n.op)](_ev(n.left), r)
        if isinstance(n, _ast.UnaryOp) and type(n.op) in _OPS:
            return _OPS[type(n.op)](_ev(n.operand))
        raise ValueError()
    try:
        expr = re.sub(r'[^0-9+\-*/().]', '', str(expr).replace('^', '**'))
        if not expr or len(expr) > 80:
            return None
        return round(float(_ev(_ast.parse(expr, mode='eval').body)), 8)
    except Exception:
        return None


def _solve_bayes_local(prob):
    """
    Local Bayes solver — same logic as the /verify endpoint's _solve_bayes().
    Runs in e2e_test BEFORE /verify so we can mark problems as Bayes-verified
    and prevent DeepSeek from overriding a deterministic result.
    Returns True if correct flags were updated.
    """
    question = str(prob.get('question', ''))
    solution = str(prob.get('solution', '') or '')
    options  = prob.get('options', [])
    if not options or '|' not in (question + solution):
        return False
    combined = question + ' ' + solution
    asked = None
    for pat in [
        r'(?:hall[ae]|calcul[ae]?|encuentr[ae]|determin[ae]?|obteng[ao])\s+[Pp]\s*\(\s*(\w+)\s*\|\s*(\w+)\s*\)',
        r'[Pp]\s*\(\s*(\w+)\s*\|\s*(\w+)\s*\)\s*(?:=\s*\?|\?)',
        r'[Pp]\s*\(\s*(\w+)\s*\|\s*(\w+)\s*\)[^=\d]*$',
    ]:
        m = re.search(pat, combined, re.IGNORECASE)
        if m:
            asked = (m.group(1), m.group(2))
            break
    if not asked:
        return False

    posterior, evidence = asked
    cond = {}
    for m in re.finditer(r'[Pp]\s*\(\s*(\w+)\s*\|\s*(\w+)\s*\)\s*=\s*(\d+(?:\.\d+)?)', combined):
        cond[(m.group(1), m.group(2))] = float(m.group(3))
    priors = {}
    for m in re.finditer(r'[Pp]\s*\(\s*(\w+)\s*\)\s*=\s*(\d+(?:\.\d+)?)', combined):
        priors[m.group(1)] = float(m.group(2))
    hyps = [k[1] for k in cond if k[0] == evidence]
    if not hyps or posterior not in hyps or posterior not in priors:
        return False
    p_ev = sum(cond.get((evidence, h), 0) * priors.get(h, 0) for h in hyps)
    if abs(p_ev) < 1e-10:
        return False
    result = cond.get((evidence, posterior), 0) * priors[posterior] / p_ev
    best_idx, best_score = -1, -1
    for i, opt in enumerate(options):
        on = _extract_num(str(opt.get('text', '')).replace(',', '.'))
        if on is None:
            continue
        sc = 5 if _close(result, on, 0.025) else (3 if abs(result - on) < max(abs(result) * 0.05, 0.005) else 0)
        if sc > best_score:
            best_score, best_idx = sc, i
    if best_score >= 3 and best_idx >= 0:
        for j, opt in enumerate(options):
            opt['correct'] = (j == best_idx)
        prob['_deterministic'] = f'bayes:P({posterior}|{evidence})={result:.4f}'
        return True
    return False


def _solve_arith_local(prob):
    """
    Stage 3b: Detect problems where _compute_solution gives a confident unique result.
    Marks as 'arith' to skip the judge (which makes arithmetic errors on many problem types).
    Returns True if answer was deterministically fixed.
    """
    solution = str(prob.get('solution', '') or '')
    options  = prob.get('options', [])
    if not options or not solution:
        return False

    def _trailing_num(text):
        """Extract a standalone number at the end of a solution segment (handles units)."""
        # Must not be preceded by / or * (not part of a fraction/product)
        m = re.search(r'(?<![0-9/*])(-?\d+(?:\.\d+)?)\s*(?:km/h|km|h(?:oras?)?\b|min\b|kg|m/s\b|m\b|°|%|\s*)\s*\.?\s*$', text.strip())
        return float(m.group(1)) if m else None

    # Compute final value from solution chain (scan from right to left)
    computed = None
    for part in reversed(re.split(r'=', solution)):
        # First try: extract trailing number with unit suffix (handles "7.5 h.", "100 km/h.")
        v = _trailing_num(part)
        if v is None:
            # Fallback: strip non-arithmetic chars and evaluate expression
            cleaned = re.sub(r'[a-zA-ZÁÉÍÓÚáéíóúñ°%\s,;:~≈→()\[\]]+', '', part)
            cleaned = re.sub(r'\.(?!\d)', '', cleaned).strip('.')  # remove stray dots
            v = _safe_eval_local(cleaned)
        if v is not None:
            computed = round(v, 6)
            break
    if computed is None:
        return False

    def _ext(s):
        s2 = s.replace(',', '.')
        fm = re.match(r'\s*(-?\d+(?:\.\d+)?)\s*/\s*(-?\d+(?:\.\d+)?)\s*$', s2.strip())
        if fm:
            try:
                d = float(fm.group(2))
                if d != 0:
                    return round(float(fm.group(1)) / d, 8)
            except Exception:
                pass
        m = re.search(r'-?\d+(?:\.\d+)?', s2)
        return float(m.group(0)) if m else None

    def _close_enough(a, b):
        if a is None or b is None:
            return False
        tol = max(abs(a) * 0.02, 0.015)
        return abs(a - b) <= tol

    matches = [(i, o) for i, o in enumerate(options)
               if _close_enough(computed, _ext(str(o.get('text', ''))))]
    if len(matches) != 1:
        return False

    best_i = matches[0][0]
    for j, o in enumerate(options):
        o['correct'] = (j == best_i)
    prob['_deterministic'] = 'arith'
    return True


def _solve_matrix_local(prob):
    """
    Stage 3b: Detect and solve 2x2 matrix algebra problems locally before /verify.
    Handles tr(A^n), eigenvalues, singular matrix parameter.
    Sets prob['_deterministic'] to protect from DeepSeek override.
    Returns True if correct flags were updated.
    """
    try:
        import sympy as _sp
        _has_sp = True
    except ImportError:
        _has_sp = False

    question = str(prob.get('question', ''))
    solution = str(prob.get('solution', '') or '')
    options  = prob.get('options', [])
    if not options:
        return False

    combined = question + ' ' + solution

    # Normalize Unicode superscripts so A³ → A3 for pattern matching
    _sup_map = str.maketrans('²³⁴⁵⁶⁷⁸⁹¹', '234567891')
    question = question.translate(_sup_map)
    solution = solution.translate(_sup_map)
    combined = question + ' ' + solution

    # Irrational guard: trust GPT when answer involves √, shield from overrides
    _irr_syms = ('√','∛','π')
    _irr_opts = [o for o in options if any(c in str(o.get('text','')) for c in _irr_syms)]
    _sol_irr = any(c in solution for c in _irr_syms)
    if len(_irr_opts) >= 2 or (len(_irr_opts) >= 1 and _sol_irr):
        prob['_deterministic'] = 'irrational'
        return True  # Preserve GPT's answer unchanged

    def _get_tr(txt):
        for pat in [r'tr\s*\(?A\)?\s*=\s*(-?\d+(?:\.\d+)?)',
                    r'traza\s*(?:de\s*A)?\s*[=:]\s*(-?\d+(?:\.\d+)?)',
                    r'Tr\s*=\s*(-?\d+(?:\.\d+)?)',
                    r'\btr\s*=\s*(-?\d+(?:\.\d+)?)']:
            m = re.search(pat, txt, re.IGNORECASE)
            if m: return float(m.group(1))
        return None

    def _get_det(txt):
        for pat in [r'det\s*\(?A\)?\s*=\s*(-?\d+(?:\.\d+)?)',
                    r'\|A\|\s*=\s*(-?\d+(?:\.\d+)?)',
                    r'determinante\s*(?:de\s*A)?\s*[=:]\s*(-?\d+(?:\.\d+)?)',
                    r'\bdet\s*=\s*(-?\d+(?:\.\d+)?)']:
            m = re.search(pat, txt, re.IGNORECASE)
            if m: return float(m.group(1))
        return None

    # ── 1. tr(A^n) via Cayley-Hamilton ───────────────────────────────────────
    pow_m = re.search(r'tr\s*\(?A\^?(\d)\)?', combined, re.IGNORECASE)
    if pow_m and not _has_sp:
        # No sympy locally — but detect the pattern so /verify can compute it
        # and DeepSeek won't override the correct answer
        tr_val  = _get_tr(solution)
        det_val = _get_det(solution)
        if tr_val is not None and det_val is not None:
            prob['_deterministic'] = f'matrix_trace_guard:tr={tr_val},det={det_val}'
    if pow_m and _has_sp:
        n = int(pow_m.group(1))
        tr_val  = _get_tr(solution)
        det_val = _get_det(solution)
        if tr_val is not None and det_val is not None:
            try:
                x = _sp.Symbol('x')
                roots = _sp.solve(x**2 - tr_val * x + det_val, x)
                if len(roots) == 2:
                    computed = float(sum(r ** n for r in [r.evalf() for r in roots]))
                    for i, opt in enumerate(options):
                        on = _extract_num(str(opt.get('text', '')).replace(',', '.'))
                        if on is not None and _close(computed, on, 0.02):
                            for j, o in enumerate(options): o['correct'] = (j == i)
                            prob['_deterministic'] = f'matrix_trace:tr(A^{n})={computed:.2f}'
                            return True
            except Exception:
                pass

    # ── 2. Eigenvalues from factored characteristic polynomial ────────────────
    _asks_eig = (re.search(r'autovalor|valor.{0,5}propio', question, re.IGNORECASE) and
                 re.search(r'hall[ae]|calcul[ae]?|encuentr[ae]|determin[ae]?|son\s+los', question, re.IGNORECASE))
    if _asks_eig:
        factor_m   = re.findall(r'\(?[λx]\s*[-−]\s*(\d+(?:\.\d+)?)\)?', solution)
        factor_AI  = re.findall(r'\(A\s*[-−]\s*(\d+(?:\.\d+)?)I\)', solution)
        factor_AI1 = ['1'] * len(re.findall(r'\(A\s*[-−]\s*I\)', solution))
        eq_m = re.findall(r'[λx][₁₂\d]*\s*=\s*(-?\d+(?:\.\d+)?)', solution)
        eq_m += re.findall(r'(?:lambda|autovalor)\s*(?:[₁₂1-9])?\s*=\s*(-?\d+(?:\.\d+)?)', solution, re.IGNORECASE)
        eigs = sorted(set([float(v) for v in factor_m + factor_AI + factor_AI1 + eq_m]))
        if len(eigs) >= 2:
            for i, opt in enumerate(options):
                opt_nums = sorted([float(m) for m in re.findall(r'-?\d+(?:\.\d+)?', str(opt.get('text', '')))])
                if (len(opt_nums) >= 2 and
                        all(any(abs(e - on) < 0.05 for on in opt_nums) for e in eigs[:2])):
                    for j, o in enumerate(options): o['correct'] = (j == i)
                    prob['_deterministic'] = f'matrix_eigenvals:{eigs[:2]}'
                    return True

    # ── 3. Singular matrix / infinite solutions — find parameter k/m ─────────
    # Guard: skip compound questions like "hallar k+b_1" — solver only finds k, not k+compound
    _hallar_m = re.search(r'hall[ae]r?\s+(.{1,30}?)(?:\.|,|$)', question, re.IGNORECASE)
    _compound_ask = (_hallar_m and re.search(r'[+\-*/·×]', _hallar_m.group(1)))
    if (re.search(r'singular|infinitas?\s+soluciones?|det.{1,25}cero', combined, re.IGNORECASE)
            and not _compound_ask):
        param_val = None
        m1 = re.search(r'[→⟹>]\s*\b([a-z])\s*=\s*(-?\d+(?:\.\d+)?)\s*$', solution.strip(), re.IGNORECASE)
        if m1:
            param_val = float(m1.group(2))
        else:
            hits = list(re.finditer(r'\b([kmnabt])\s*=\s*(-?\d+(?:\.\d+)?)', solution, re.IGNORECASE))
            if hits:
                param_val = float(hits[-1].group(2))
        if param_val is not None:
            for i, opt in enumerate(options):
                on = _extract_num(str(opt.get('text', '')).replace(',', '.'))
                if on is not None and _close(param_val, on, 0.02):
                    for j, o in enumerate(options): o['correct'] = (j == i)
                    prob['_deterministic'] = f'matrix_singular:k={param_val}'
                    return True

    return False


def _extract_deepseek_json(raw):
    """Robustly extract {correct_letter, computed, confidence} from DeepSeek-R1 output.

    R1 wraps its answer in reasoning text, markdown, or nested braces — regex fails
    when 'computed' contains special chars. Walk the string looking for any valid
    JSON object that contains 'correct_letter'.
    """
    raw = raw.strip() if raw else ''
    # Direct parse (ideal case)
    try:
        obj = json.loads(raw)
        if isinstance(obj, dict) and 'correct_letter' in obj:
            return obj
    except Exception:
        pass
    # Walk character by character, try to decode JSON at each '{'
    decoder = json.JSONDecoder()
    for i, c in enumerate(raw):
        if c != '{':
            continue
        try:
            obj, _ = decoder.raw_decode(raw, i)
            if isinstance(obj, dict) and 'correct_letter' in obj:
                return obj
        except json.JSONDecodeError:
            continue
    return None

# ── Stage 2: Parse (mirrors Extraer JSON Problemas) ───────────────────────────
def _extract_num(s):
    if not isinstance(s, str):
        return None
    s2 = s.replace(',', '.')
    # Handle fraction options: "6/7", "3/11", "-2/5"
    fm = re.match(r'\s*(-?\d+(?:\.\d+)?)\s*/\s*(-?\d+(?:\.\d+)?)\s*$', s2.strip())
    if fm:
        try:
            d = float(fm.group(2))
            if d != 0:
                return round(float(fm.group(1)) / d, 8)
        except (ValueError, ZeroDivisionError):
            pass
    m = re.search(r'-?\d+(?:\.\d+)?', s2)
    return float(m.group(0)) if m else None

def _close(a, b, tol=0.03):
    if a is None or b is None:
        return False
    return abs(a - b) / (max(abs(a), abs(b), 0.001)) < tol

def stage2_parse(data, max_n=None):
    """Mirror: Extraer JSON Problemas node."""
    problems = data.get('problems', [])
    if max_n and len(problems) > max_n:
        problems = problems[:max_n]

    if not SPLIT_PIPELINE:
        # Classic mode: try to auto-detect correct answer from GPT's answer field
        for prob in problems:
            answer_raw = str(prob.get('answer', '')).lower().strip()
            if not answer_raw:
                continue
            answer_num = _extract_num(answer_raw)
            answer_all = [float(m) for m in re.findall(r'-?\d+(?:\.\d+)?', answer_raw)]
            best_idx, best_score = -1, -1
            for i, opt in enumerate(prob.get('options', [])):
                opt_text = str(opt.get('text', '')).replace(',', '.')
                opt_num  = _extract_num(opt_text)
                opt_all  = [float(m) for m in re.findall(r'-?\d+(?:\.\d+)?', opt_text)]
                score = 0
                if len(answer_all) > 1 and len(opt_all) >= len(answer_all):
                    if all(any(_close(n, on) for on in opt_all) for n in answer_all):
                        score = 4
                elif answer_num is not None and opt_num is not None and _close(answer_num, opt_num, 0.02):
                    score = 3
                elif answer_raw in opt_text.lower() or opt_text.lower() in answer_raw:
                    score = 2
                elif answer_num is not None and opt_num is not None and abs(answer_num - opt_num) < max(abs(answer_num)*0.1, 1):
                    score = 1
                if score > best_score:
                    best_score, best_idx = score, i
            if best_score > 0 and best_idx >= 0:
                for j, opt in enumerate(prob['options']):
                    opt['correct'] = (j == best_idx)
    else:
        # Split-pipeline mode: GPT does NOT set the answer — clear all correct flags
        for prob in problems:
            for opt in prob.get('options', []):
                opt['correct'] = False

    # Shuffle option order (randomize A-E distribution)
    import random as _random
    letters = ['A', 'B', 'C', 'D', 'E']
    for prob in problems:
        opts = prob.get('options', [])
        if len(opts) == 5:
            _random.shuffle(opts)
            for i, o in enumerate(opts):
                o['letter'] = letters[i]
        prob['options'] = opts

    return problems

# ── Stage 3: Re-solver adversarial ───────────────────────────────────────────
RESOLVER_SYSTEM = """Eres un VERIFICADOR MATEMATICO adversarial. Tu unica tarea es resolver cada problema de forma INDEPENDIENTE, sin ver la solucion del autor.

REGLAS ESTRICTAS:
1. Resuelve cada problema desde cero usando SOLO el enunciado y las 5 opciones
2. Determina cual opcion es matematicamente correcta segun tu propio calculo
3. Si el resultado no coincide con ninguna opcion: issue = "no_exact_match"
4. Si hay datos INCONSISTENTES: issue = "inconsistent_data"
5. Si mas de una opcion puede ser correcta: issue = "ambiguous"
6. Solo usa confidence "high" si el calculo es inequivoco

Responde UNICAMENTE con JSON valido:
{
  "verifications": [
    {"number": 1, "computed": "valor", "correct_letter": "B", "confidence": "high", "issue": null}
  ]
}"""

def stage3_resolver(client, problems):
    """Mirror: Re-solver Adversarial n8n node."""
    blind = [{'number': p['number'], 'question': p['question'],
              'options': [{'letter': o['letter'], 'text': o['text']} for o in p['options']]}
             for p in problems]
    resp = client.chat.completions.create(
        model='gpt-4o',
        messages=[
            {'role': 'system', 'content': RESOLVER_SYSTEM},
            {'role': 'user',   'content': json.dumps({'problems': blind})}
        ],
        response_format={'type': 'json_object'},
        temperature=0.1,
        max_tokens=2000
    )
    verifications = json.loads(resp.choices[0].message.content).get('verifications', [])
    corrections, warnings = 0, 0
    for v in verifications:
        prob = next((p for p in problems if p['number'] == v['number']), None)
        if not prob:
            continue
        marked = next((o['letter'] for o in prob['options'] if o.get('correct')), None)
        if v.get('issue'):
            prob['_warning'] = v['issue']
            warnings += 1
        # Corrections disabled: GPT self-verification unreliable for DECO
        # Only Python /verify (deterministic arithmetic) should correct answer keys
    return problems, corrections, warnings

# ── Stage 4: /verify endpoint ────────────────────────────────────────────────
def stage4_verify(data_with_problems):
    """Call word-generator /verify endpoint. Returns (problems, reachable)."""
    try:
        resp = requests.post(VERIFY_URL, json=data_with_problems, timeout=15)
        if resp.status_code == 200:
            return resp.json().get('problems', data_with_problems.get('problems', [])), True
    except Exception as e:
        pass
    # /verify unreachable — strip solution/answer locally (fallback)
    for p in data_with_problems.get('problems', []):
        p.pop('solution', None)
        p.pop('answer', None)
    return data_with_problems.get('problems', []), False

# ── Stage 4b: DeepSeek-R1 Math Verifier / Primary Solver ─────────────────────
DEEPSEEK_VERIFY_PROMPT = """Eres un verificador matematico experto en examenes preuniversitarios peruanos (DECO/UNI/UNMSM).
Se te da un problema de opcion multiple. Resuelve desde cero de forma INDEPENDIENTE.
Responde UNICAMENTE con JSON valido (sin texto adicional):
{"correct_letter": "B", "computed": "valor o expresion exacta", "confidence": "high/medium/low"}"""

DEEPSEEK_SPLIT_PROMPT = """Eres un experto matematico resolviendo examenes preuniversitarios peruanos nivel DECO.
Se te da un problema con 5 opciones. Tu unica tarea: resolver el problema matematicamente y determinar cual opcion es correcta.
Razona paso a paso en tu cabeza, luego responde UNICAMENTE con JSON valido:
{"correct_letter": "B", "computed": "valor exacto que obtuviste", "confidence": "high/medium/low"}
IMPORTANTE: Si tu resultado no coincide exactamente con ninguna opcion, elige la mas cercana y pon confidence "low"."""

def stage4b_deepseek(problems, area):
    """DeepSeek-R1: primary solver (split mode) or verifier (classic mode)."""
    if not DEEPSEEK_API_KEY:
        return problems, 0

    from openai import OpenAI as _OAI
    ds = _OAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)
    corrected = 0
    letters = ['A', 'B', 'C', 'D', 'E']
    sys_prompt = DEEPSEEK_SPLIT_PROMPT if SPLIT_PIPELINE else DEEPSEEK_VERIFY_PROMPT

    for prob in problems:
        opts = prob.get('options', [])
        if not opts:
            continue
        # Skip if a deterministic solver already set the answer (Bayes, chart, etc.)
        if prob.get('_deterministic'):
            continue
        opts_text = '\n'.join(
            o['letter'] + ') ' + str(o.get('text', '')) for o in opts
        )
        # In split mode: include GPT's solution chain as context (it's mathematically
        # detailed but doesn't reveal the answer letter)
        sol = prob.get('solution', '') or ''
        sol_section = ('\n\nDesarrollo previo (puede tener errores al final):\n' + sol) if sol else ''

        user_msg = (
            'Area: ' + area + '\n'
            'Problema: ' + str(prob.get('question', '')) + '\n\n'
            'Opciones:\n' + opts_text
            + sol_section
        )
        try:
            resp = ds.chat.completions.create(
                model='deepseek-reasoner',
                messages=[
                    {'role': 'system', 'content': sys_prompt},
                    {'role': 'user',   'content': user_msg}
                ],
                max_tokens=1200,
            )
            raw = resp.choices[0].message.content or ''
            result = _extract_deepseek_json(raw)
            if not result:
                logging.warning(f'DeepSeek: no JSON found in output for prob#{prob.get("number")} raw={raw[:120]!r}')
                continue
            new_letter = result.get('correct_letter', '').strip().upper()
            if new_letter not in letters:
                continue

            old_letter = next((o['letter'] for o in opts if o.get('correct')), '?')
            for o in opts:
                o['correct'] = (o['letter'] == new_letter)

            conf = result.get('confidence', '?')
            prob['_deepseek_confidence'] = conf

            if SPLIT_PIPELINE:
                # In split mode every problem gets answered by DeepSeek
                corrected += 1
                prob['_deepseek_set'] = new_letter
            elif old_letter != new_letter:
                corrected += 1
                prob['_deepseek_corrected'] = old_letter + '->' + new_letter

        except Exception:
            continue

    return problems, corrected

# ── Stage 5: Independent accuracy judge ──────────────────────────────────────
JUDGE_SYSTEM = """Eres un experto en matematicas preuniversitarias peruanas. Se te da un problema con 5 opciones y la opcion marcada como correcta (✓). Tu tarea: resolver el problema de forma independiente.
Responde UNICAMENTE con JSON: {"correct": true/false, "real_letter": "B", "explanation": "calculo en 1 linea"}"""

def stage5_judge(client, prob, area):
    opts = '\n'.join(
        f"  {'[MARCADA]' if o.get('correct') else '         '} {o['letter']}) {o['text']}"
        for o in prob.get('options', [])
    )
    marked = next((o['letter'] for o in prob['options'] if o.get('correct')), '?')
    resp = client.chat.completions.create(
        model='gpt-4o',
        messages=[
            {'role': 'system', 'content': JUDGE_SYSTEM},
            {'role': 'user', 'content': f'Area: {area}\nProblema: {prob["question"]}\n\nOpciones:\n{opts}\n\nOpcion marcada: {marked}'}
        ],
        response_format={'type': 'json_object'},
        temperature=0,
        max_tokens=250
    )
    try:
        return json.loads(resp.choices[0].message.content)
    except:
        return {'correct': None, 'real_letter': '?', 'explanation': 'parse error'}

# ── Main ──────────────────────────────────────────────────────────────────────
def run_case(client, area, topic, difficulty, n):
    print(f'\n{"="*60}')
    print(f'  {area.upper()} — {topic} [{difficulty.upper()}, {n} problemas]')
    print(f'{"="*60}')

    # S1: Generate
    t0 = time.time()
    print('  [S1] Generando...', end='', flush=True)
    try:
        data = stage1_generate(client, area, topic, difficulty, n)
    except Exception as e:
        print(f' ERROR: {e}')
        return None
    print(f' OK ({time.time()-t0:.0f}s) — {len(data.get("problems",[]))} problemas')

    # S2: Parse
    problems = stage2_parse(data, max_n=n)
    data['problems'] = problems
    print(f'  [S2] Parse: {len(problems)} problemas extraidos')

    # S3: Re-solver
    t1 = time.time()
    print('  [S3] Re-solver adversarial...', end='', flush=True)
    try:
        problems, corrections, warnings = stage3_resolver(client, problems)
        print(f' OK ({time.time()-t1:.0f}s) — {corrections} correcciones, {warnings} warnings')
    except Exception as e:
        print(f' ERROR: {e}')
        corrections, warnings = 0, 0

    # S3b: Local deterministic solvers — run BEFORE /verify so result survives stripping
    det_count = 0
    det_types = []
    for prob in problems:
        if _solve_bayes_local(prob):
            det_count += 1
            det_types.append('bayes')
        elif _solve_matrix_local(prob):
            det_count += 1
            det_types.append('matrix')
        elif _solve_arith_local(prob):
            det_count += 1
            det_types.append('arith')
    if det_count:
        from collections import Counter
        type_summary = ', '.join(f'{v}×{k}' for k, v in Counter(det_types).items())
        print(f'  [S3b] Deterministic solvers: {det_count} problemas ({type_summary})')

    # S4: /verify (sympy)
    # Save pre-verify problems for debugging
    import json as _json
    with open('debug_preverify.json', 'w', encoding='utf-8') as _f:
        _json.dump(data, _f, ensure_ascii=False, indent=2)
    print(f'  [S4] /verify endpoint...', end='', flush=True)
    problems, verify_ok = stage4_verify(data)
    if verify_ok:
        print(f' OK (endpoint disponible)')
    else:
        print(f' SKIP (endpoint no disponible en {VERIFY_URL})')

    # S4b: DeepSeek-R1 verifier
    if DEEPSEEK_API_KEY:
        print(f'  [S4b] DeepSeek-R1 verificando...', end='', flush=True)
        t4b = time.time()
        try:
            problems, ds_corrected = stage4b_deepseek(problems, area)
            print(f' OK ({time.time()-t4b:.0f}s) — {ds_corrected} correcciones DeepSeek')
        except Exception as e:
            print(f' ERROR: {e}')

    # S5: Judge
    print(f'  [S5] Auditando respuestas...')
    ok = fail = unknown = 0
    details = []
    for prob in problems:
        marked = next((o['letter'] for o in prob.get('options', []) if o.get('correct')), '?')
        warning = prob.get('_warning', '')
        corrected = prob.get('_corrected_from', '')
        try:
            det = prob.get('_deterministic', '')
            # Trust deterministic solvers — skip judge for these
            # 'matrix' = server-side solve; 'irrational' = GPT preserved; 'cond_prob'/'bayes' = probability
            _trust_det = det and any(t in det for t in ('matrix', 'irrational', 'bayes', 'cond_prob', 'prob_arith', 'arith'))
            if _trust_det:
                v = {'correct': True, 'real_letter': marked, 'explanation': f'[deterministic:{det}]'}
            else:
                v = stage5_judge(client, prob, area)
            is_ok = v.get('correct')
            real  = v.get('real_letter', '?')
            expl  = v.get('explanation', '')[:80]
            status = 'OK' if is_ok is True else ('FAIL' if is_ok is False else '??')
            if is_ok is True:   ok += 1
            elif is_ok is False: fail += 1
            else:                unknown += 1
            flag = ''
            if corrected:  flag += f' [re-solver: {corrected}->{marked}]'
            ds_corr = prob.get('_deepseek_corrected', '')
            ds_set  = prob.get('_deepseek_set', '')
            ds_conf = prob.get('_deepseek_confidence', '')
            det     = prob.get('_deterministic', '')
            if ds_corr: flag += f' [deepseek fix: {ds_corr}]'
            if ds_set:  flag += f' [deepseek→{ds_set} conf={ds_conf}]'
            if det:     flag += f' [det:{det}]'
            if warning:    flag += f' [WARN:{warning}]'
            print(f'    P{prob.get("number","?"):>2} [{status}] marcada:{marked} real:{real}{flag}')
            if is_ok is False:
                print(f'         {expl}')
            details.append({'num': prob.get('number'), 'ok': is_ok,
                             'marked': marked, 'real': real,
                             'corrected_from': corrected, 'warning': warning, 'expl': expl})
        except Exception as e:
            unknown += 1
            print(f'    P{prob.get("number","?"):>2} [??] error juez: {e}')
        time.sleep(0.3)

    total = ok + fail + unknown
    pct   = round(100 * ok / max(total, 1))
    ds_total = sum(1 for p in problems if p.get('_deepseek_corrected') or p.get('_deepseek_set'))
    print(f'\n  Resultado: {ok}/{total} correctas ({pct}%) | correcciones_resolver={corrections} | deepseek={ds_total} | warnings={warnings}')
    return {'area': area, 'topic': topic, 'ok': ok, 'fail': fail, 'unknown': unknown,
            'pct': pct, 'corrections': corrections, 'ds_corrections': ds_total,
            'warnings': warnings, 'details': details}

def main():
    # Parse args
    areas_to_test = list(TEST_CASES.keys())
    difficulty = DEFAULT_DIFFICULTY
    n = DEFAULT_N

    if len(sys.argv) >= 2:
        areas_to_test = [sys.argv[1].lower()]
    if len(sys.argv) >= 3:
        n = int(sys.argv[2])
    if len(sys.argv) >= 4:
        difficulty = sys.argv[3].lower()

    api_key = get_openai_key()
    if not api_key or not api_key.startswith('sk-'):
        print('ERROR: OpenAI API key not found in ../n8n-mcp/.env or OPENAI_API_KEY env var')
        sys.exit(1)

    client = OpenAI(api_key=api_key)
    gen_label = GENERATE_MODEL
    if GENERATE_MODEL.startswith('gemini') and GEMINI_API_KEY:
        gen_label += ' (Gemini AI Studio)'
    mode = 'SPLIT (GPT genera, DeepSeek resuelve)' if SPLIT_PIPELINE else 'CLASSIC (GPT genera+responde)'
    print(f'E2E test: {len(areas_to_test)} area(s), difficulty={difficulty}, n={n}')
    print(f'Modo: {mode}')
    print(f'Generate model: {gen_label} | Solver: {"DeepSeek-R1" if SPLIT_PIPELINE else "gpt-4o"} | Judge: gpt-4o')
    print(f'Pipeline: Generate -> Parse -> Re-solver -> /verify -> Judge')

    all_results = []
    for area in areas_to_test:
        topic = TEST_CASES.get(area, 'temas generales')
        result = run_case(client, area, topic, difficulty, n)
        if result:
            all_results.append(result)

    if not all_results:
        print('\nNo results.')
        return

    # Final report
    total_ok   = sum(r['ok'] for r in all_results)
    total_all  = sum(r['ok'] + r['fail'] + r['unknown'] for r in all_results)
    total_corr = sum(r['corrections'] for r in all_results)
    total_warn = sum(r['warnings'] for r in all_results)
    global_pct = round(100 * total_ok / max(total_all, 1))

    print(f'\n{"="*60}')
    print(f'  REPORTE FINAL — {total_ok}/{total_all} ({global_pct}%) | re-solver corrigio {total_corr} | {total_warn} warnings')
    print(f'{"="*60}')
    for r in all_results:
        bar = 'O' * r['ok'] + 'X' * r['fail'] + '?' * r['unknown']
        ds = r.get('ds_corrections', 0)
        ds_label = f', {ds} deepseek' if ds else ''
        print(f'  {r["area"]:12} {r["pct"]:3}%  {bar}  ({r["corrections"]} resolver{ds_label}, {r["warnings"]} warn)')

    if global_pct >= 90:
        verdict = 'LISTO PARA PRODUCCION'
    elif global_pct >= 75:
        verdict = 'ACEPTABLE — monitorear'
    else:
        verdict = 'REVISAR PROMPT'

    print(f'\n  Veredicto: {verdict}')

    with open('e2e_report.json', 'w', encoding='utf-8') as f:
        json.dump({'difficulty': difficulty, 'n_per_area': n,
                   'global_pct': global_pct, 'total_ok': total_ok, 'total': total_all,
                   'resolver_corrections': total_corr, 'warnings': total_warn,
                   'results': all_results}, f, ensure_ascii=False, indent=2)
    print('  Reporte guardado: e2e_report.json')

if __name__ == '__main__':
    main()
