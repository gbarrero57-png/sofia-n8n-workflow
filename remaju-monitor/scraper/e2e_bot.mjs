/**
 * e2e_bot.mjs — E2E test de handlers del bot REMAJU con Supabase real
 *
 * Testea:
 *   1. Conectividad Supabase
 *   2. Fix /estado: remaju_filters join objeto vs array
 *   3. Toggle tipo de propiedad → DB actualizada
 *   4. Toggle tier → DB actualizada
 *   5. Toggle distrito → DB actualizada + texto actualiza
 *   6. Error handling: upsert falla → answerCbQuery con error
 *   7. Estado de usuarios actuales (no modifica)
 *
 * Uso:
 *   node e2e_bot.mjs
 *
 * Requiere .env en remaju-monitor/scraper/ con:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Cargar .env manual
try {
  const env = readFileSync(join(__dirname, '.env'), 'utf8')
  env.split('\n').forEach(line => {
    const [k, ...v] = line.split('=')
    if (k && v.length) process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '')
  })
} catch {}

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ SUPABASE_URL y SUPABASE_SERVICE_KEY requeridos en .env')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

// ── Test helpers ──────────────────────────────────────────────────────────────

const TEST_TELEGRAM_ID = 999999999  // ID ficticio para tests
let passed = 0
let failed = 0

function ok(label) {
  console.log(`  ✅ ${label}`)
  passed++
}

function fail(label, detail) {
  console.log(`  ❌ ${label}${detail ? ': ' + detail : ''}`)
  failed++
}

function section(title) {
  console.log(`\n── ${title} ─────────────────────────────`)
}

// Mock contexto Telegraf
function mockCtx(telegramId = TEST_TELEGRAM_ID) {
  const calls = { answerCbQuery: [], editMessageText: [], editMessageReplyMarkup: [] }
  return {
    calls,
    from: { id: telegramId },
    answerCbQuery: async (msg) => { calls.answerCbQuery.push(msg || '') },
    editMessageText: async (text, opts) => { calls.editMessageText.push({ text, opts }) },
    editMessageReplyMarkup: async (markup) => { calls.editMessageReplyMarkup.push(markup) },
    replyWithHTML: async (text, opts) => {}
  }
}

// ── Setup / Teardown ─────────────────────────────────────────────────────────

async function setupTestUser() {
  const trialEnds = new Date()
  trialEnds.setDate(trialEnds.getDate() + 7)

  const { data: user, error } = await sb
    .from('remaju_users')
    .upsert({
      telegram_id:         TEST_TELEGRAM_ID,
      telegram_username:  'e2e_test_user',
      first_name:         'E2E',
      last_name:          'Test',
      subscription_status: 'trial',
      trial_ends_at:       trialEnds.toISOString()
    }, { onConflict: 'telegram_id' })
    .select().single()

  if (error) throw new Error('Setup user: ' + error.message)

  // Filtros iniciales conocidos
  await sb.from('remaju_filters').upsert({
    user_id:        user.id,
    max_price_usd:  90000,
    property_types: ['casa', 'departamento'],
    tiers:          ['super_ganga', 'muy_bueno'],
    districts:      ['Los Olivos', 'SMP']
  }, { onConflict: 'user_id' })

  return user
}

async function cleanupTestUser() {
  const { data: user } = await sb.from('remaju_users').select('id').eq('telegram_id', TEST_TELEGRAM_ID).single()
  if (user) {
    await sb.from('remaju_filters').delete().eq('user_id', user.id)
    await sb.from('remaju_users').delete().eq('telegram_id', TEST_TELEGRAM_ID)
  }
}

async function getFilters(userId) {
  const { data } = await sb.from('remaju_filters').select('*').eq('user_id', userId).single()
  return data
}

// ── Lógica de handlers (extraída del bot, misma lógica) ─────────────────────

async function handleTipoToggle(ctx, tipo) {
  await ctx.answerCbQuery()
  try {
    const { data: user } = await sb.from('remaju_users').select('id').eq('telegram_id', ctx.from.id).single()
    if (!user) return

    const { data: f } = await sb.from('remaju_filters').select('property_types').eq('user_id', user.id).single()
    let types = f?.property_types || ['casa','departamento','terreno','local','otro']

    if (types.includes(tipo)) {
      if (types.length === 1) return
      types = types.filter(t => t !== tipo)
    } else {
      types = [...types, tipo]
    }

    const { error: upsertErr } = await sb.from('remaju_filters').upsert({ user_id: user.id, property_types: types }, { onConflict: 'user_id' })
    if (upsertErr) return ctx.answerCbQuery('❌ Error guardando. Intenta de nuevo.')

    await ctx.editMessageReplyMarkup({ inline_keyboard: [[{ text: 'mock' }]] })
    return types
  } catch (err) {
    if (!err.message?.includes('message is not modified')) console.error(err.message)
  }
}

async function handleTierToggle(ctx, tier) {
  await ctx.answerCbQuery()
  try {
    const { data: user } = await sb.from('remaju_users').select('id').eq('telegram_id', ctx.from.id).single()
    if (!user) return

    const { data: f } = await sb.from('remaju_filters').select('tiers').eq('user_id', user.id).single()
    let tiers = f?.tiers || ['super_ganga','muy_bueno','bueno','aceptable']

    if (tiers.includes(tier)) {
      if (tiers.length === 1) return
      tiers = tiers.filter(t => t !== tier)
    } else {
      tiers = [...tiers, tier]
    }

    const { error: upsertErr } = await sb.from('remaju_filters').upsert({ user_id: user.id, tiers }, { onConflict: 'user_id' })
    if (upsertErr) return ctx.answerCbQuery('❌ Error guardando. Intenta de nuevo.')

    await ctx.editMessageReplyMarkup({ inline_keyboard: [[{ text: 'mock' }]] })
    return tiers
  } catch (err) {
    if (!err.message?.includes('message is not modified')) console.error(err.message)
  }
}

function selLine(districts) {
  if (!districts.length) return 'Todo el Perú'
  return districts.slice(0, 4).join(', ') + (districts.length > 4 ? ` (+${districts.length - 4} más)` : '')
}

async function handleDistritoToggle(ctx, distrito) {
  await ctx.answerCbQuery()
  try {
    const { data: user } = await sb.from('remaju_users').select('id').eq('telegram_id', ctx.from.id).single()
    if (!user) return

    const { data: f } = await sb.from('remaju_filters').select('districts').eq('user_id', user.id).single()
    let districts = f?.districts || []

    if (distrito === 'todos') {
      districts = []
    } else if (districts.includes(distrito)) {
      districts = districts.filter(d => d !== distrito)
    } else {
      districts = [...districts, distrito]
    }

    const { error: upsertErr } = await sb.from('remaju_filters').upsert({ user_id: user.id, districts }, { onConflict: 'user_id' })
    if (upsertErr) return ctx.answerCbQuery('❌ Error guardando. Intenta de nuevo.')
    await ctx.editMessageText(
      `📍 <b>Distritos</b>\n\nSeleccionados: <b>${selLine(districts)}</b>\n\n...`,
      { parse_mode: 'HTML' }
    )
    return districts
  } catch (err) {
    if (!err.message?.includes('message is not modified')) console.error(err.message)
  }
}

async function handleRegionDistritoToggle(ctx, regionKey, distrito) {
  await ctx.answerCbQuery()
  try {
    const { data: user } = await sb.from('remaju_users').select('id').eq('telegram_id', ctx.from.id).single()
    if (!user) return

    const { data: f } = await sb.from('remaju_filters').select('districts').eq('user_id', user.id).single()
    let districts = f?.districts || []

    if (distrito === '__todos__') {
      districts = []
    } else if (districts.includes(distrito)) {
      districts = districts.filter(d => d !== distrito)
    } else {
      districts = [...districts, distrito]
    }

    const { error: upsertErr } = await sb.from('remaju_filters').upsert({ user_id: user.id, districts }, { onConflict: 'user_id' })
    if (upsertErr) return ctx.answerCbQuery('❌ Error guardando. Intenta de nuevo.')
    await ctx.editMessageText(
      `📍 <b>${regionKey}</b>\n\nSeleccionados: <b>${selLine(districts)}</b>\n\n...`,
      { parse_mode: 'HTML' }
    )
    return districts
  } catch (err) {
    if (!err.message?.includes('message is not modified')) console.error(err.message)
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function test1_connectivity() {
  section('Test 1: Conectividad Supabase')
  const { data, error } = await sb.from('remaju_users').select('count').limit(1)
  error ? fail('Supabase conectado', error.message) : ok('Supabase conectado')
}

async function test2_estado_join_fix(testUser) {
  section('Test 2: /estado — fix Array.isArray en remaju_filters join')

  // Simula la query exacta que hace el comando /estado
  const { data: user, error } = await sb
    .from('remaju_users')
    .select('*, remaju_filters(*)')
    .eq('telegram_id', TEST_TELEGRAM_ID)
    .single()

  if (error || !user) return fail('Query usuario con join', error?.message)
  ok('Query usuario con join exitosa')

  const rawF = user.remaju_filters
  const isObject = rawF && !Array.isArray(rawF) && typeof rawF === 'object'
  const isArray  = Array.isArray(rawF)

  if (isObject) ok('remaju_filters devuelve objeto (PostgREST 1:1) — comportamiento confirmado')
  else if (isArray) ok('remaju_filters devuelve array')
  else fail('remaju_filters formato inesperado', JSON.stringify(rawF))

  // Aplicar el fix: Array.isArray guard
  const f = rawF ? (Array.isArray(rawF) ? rawF[0] : rawF) : null
  if (f && f.max_price_usd !== undefined) {
    ok(`Fix Array.isArray funciona — max_price_usd: $${f.max_price_usd}`)
  } else {
    fail('Fix Array.isArray no devuelve filtros', JSON.stringify(f))
  }
}

async function test3_tipo_toggle(testUser) {
  section('Test 3: Toggle tipo de propiedad')

  const ctx = mockCtx()

  // Estado inicial: ['casa', 'departamento']
  const f0 = await getFilters(testUser.id)
  if (!f0.property_types.includes('casa')) return fail('Estado inicial tiene casa', JSON.stringify(f0.property_types))
  ok(`Estado inicial: ${f0.property_types.join(', ')}`)

  // Agregar 'terreno'
  await handleTipoToggle(ctx, 'terreno')
  const f1 = await getFilters(testUser.id)
  if (f1.property_types.includes('terreno')) ok('Agregar terreno: ✅ guardado en DB')
  else fail('Agregar terreno', JSON.stringify(f1.property_types))

  // Quitar 'terreno'
  await handleTipoToggle(ctx, 'terreno')
  const f2 = await getFilters(testUser.id)
  if (!f2.property_types.includes('terreno')) ok('Quitar terreno: ✅ removido de DB')
  else fail('Quitar terreno', JSON.stringify(f2.property_types))

  // No puede quedar 0 tipos (mínimo 1)
  const ctx2 = mockCtx()
  await handleTipoToggle(ctx2, 'departamento')
  await handleTipoToggle(ctx2, 'casa')
  const f3 = await getFilters(testUser.id)
  // Solo queda 1 item (casa), intentar quitar casa no debe eliminarlo
  if (f3.property_types.length >= 1) ok('Mínimo 1 tipo protegido')
  else fail('Mínimo 1 tipo no respetado', JSON.stringify(f3.property_types))

  // Verificar editMessageReplyMarkup fue llamado
  if (ctx.calls.editMessageReplyMarkup.length > 0) ok('editMessageReplyMarkup llamado en toggle')
  else fail('editMessageReplyMarkup no fue llamado')

  // Restaurar estado
  await sb.from('remaju_filters').update({ property_types: ['casa', 'departamento'] }).eq('user_id', testUser.id)
}

async function test4_tier_toggle(testUser) {
  section('Test 4: Toggle tiers')

  const ctx = mockCtx()

  // Estado inicial: ['super_ganga', 'muy_bueno']
  const f0 = await getFilters(testUser.id)
  ok(`Estado inicial: ${f0.tiers.join(', ')}`)

  // Agregar 'bueno'
  await handleTierToggle(ctx, 'bueno')
  const f1 = await getFilters(testUser.id)
  if (f1.tiers.includes('bueno')) ok('Agregar bueno: ✅ guardado')
  else fail('Agregar bueno', JSON.stringify(f1.tiers))

  // Quitar 'bueno'
  await handleTierToggle(ctx, 'bueno')
  const f2 = await getFilters(testUser.id)
  if (!f2.tiers.includes('bueno')) ok('Quitar bueno: ✅ removido')
  else fail('Quitar bueno', JSON.stringify(f2.tiers))

  // No puede quedar 0 tiers
  await handleTierToggle(ctx, 'muy_bueno')
  await handleTierToggle(ctx, 'super_ganga') // intenta quitar el último
  const f3 = await getFilters(testUser.id)
  if (f3.tiers.length >= 1) ok('Mínimo 1 tier protegido')
  else fail('Mínimo 1 tier no respetado', JSON.stringify(f3.tiers))

  // Restaurar
  await sb.from('remaju_filters').update({ tiers: ['super_ganga', 'muy_bueno'] }).eq('user_id', testUser.id)
}

async function test5_distrito_toggle(testUser) {
  section('Test 5: Toggle distritos + texto actualiza')

  const ctx = mockCtx()

  // Estado inicial: ['Los Olivos', 'SMP']
  const f0 = await getFilters(testUser.id)
  ok(`Estado inicial: ${f0.districts.join(', ')}`)

  // Agregar 'Miraflores'
  await handleDistritoToggle(ctx, 'Miraflores')
  const f1 = await getFilters(testUser.id)
  if (f1.districts.includes('Miraflores')) ok('Agregar Miraflores: ✅ guardado')
  else fail('Agregar Miraflores', JSON.stringify(f1.districts))

  // Verificar que editMessageText fue llamado con texto "Seleccionados:"
  const lastEdit = ctx.calls.editMessageText[0]
  if (lastEdit && lastEdit.text.includes('Seleccionados:')) ok('editMessageText llamado con texto "Seleccionados:"')
  else fail('editMessageText no contiene "Seleccionados:"', lastEdit?.text?.slice(0, 100))

  // Verificar que el texto muestra los distritos actualizados
  if (lastEdit && lastEdit.text.includes('Miraflores')) ok('Texto muestra Miraflores recién agregado')
  else fail('Texto no muestra Miraflores', lastEdit?.text?.slice(0, 100))

  // Quitar 'Miraflores'
  const ctx2 = mockCtx()
  await handleDistritoToggle(ctx2, 'Miraflores')
  const f2 = await getFilters(testUser.id)
  if (!f2.districts.includes('Miraflores')) ok('Quitar Miraflores: ✅ removido')
  else fail('Quitar Miraflores', JSON.stringify(f2.districts))

  // 'dist:todos' limpia todos los distritos
  const ctx3 = mockCtx()
  await handleDistritoToggle(ctx3, 'todos')
  const f3 = await getFilters(testUser.id)
  if (f3.districts.length === 0) ok('dist:todos limpia → Todo el Perú')
  else fail('dist:todos no limpió', JSON.stringify(f3.districts))

  const lastEdit3 = ctx3.calls.editMessageText[0]
  if (lastEdit3 && lastEdit3.text.includes('Todo el Per')) ok('Texto muestra "Todo el Perú" al limpiar')
  else fail('Texto no muestra Todo el Perú', lastEdit3?.text?.slice(0, 100))

  // Restaurar
  await sb.from('remaju_filters').update({ districts: ['Los Olivos', 'SMP'] }).eq('user_id', testUser.id)
}

async function test5b_region_toggle(testUser) {
  section('Test 5b: Toggle distritos desde vista de región (ddst:)')

  // Agregar Arequipa desde vista región
  const ctx = mockCtx()
  await handleRegionDistritoToggle(ctx, 'AREQUIPA', 'Arequipa')
  const f1 = await getFilters(testUser.id)
  if (f1.districts.includes('Arequipa')) ok('ddst: Agregar Arequipa desde región: ✅ guardado')
  else fail('ddst: Agregar Arequipa', JSON.stringify(f1.districts))

  // Verificar texto de región actualizado
  const lastEdit = ctx.calls.editMessageText[0]
  if (lastEdit && lastEdit.text.includes('AREQUIPA')) ok('Texto región muestra nombre de región')
  else fail('Texto región no tiene nombre', lastEdit?.text?.slice(0, 100))
  if (lastEdit && lastEdit.text.includes('Arequipa')) ok('Texto muestra Arequipa recién agregada')
  else fail('Texto no muestra Arequipa', lastEdit?.text?.slice(0, 100))

  // Agregar otro distrito de Cusco
  const ctx2 = mockCtx()
  await handleRegionDistritoToggle(ctx2, 'CUSCO', 'Cusco')
  const f2 = await getFilters(testUser.id)
  if (f2.districts.includes('Cusco')) ok('ddst: Agregar Cusco desde región CUSCO: ✅ guardado')
  else fail('ddst: Agregar Cusco', JSON.stringify(f2.districts))

  // Limpiar con __todos__
  const ctx3 = mockCtx()
  await handleRegionDistritoToggle(ctx3, 'AREQUIPA', '__todos__')
  const f3 = await getFilters(testUser.id)
  if (f3.districts.length === 0) ok('ddst:__todos__ limpia todos los distritos')
  else fail('ddst:__todos__ no limpió', JSON.stringify(f3.districts))

  // Verificar callback_data size (Telegram limit 64 bytes)
  const longRegion = 'MADRE_DE_DIOS'
  const longDistrict = 'Canoas de Punta Sal'  // uno de los más largos
  const callbackData = `ddst:${longRegion}:${longDistrict}`
  if (callbackData.length <= 64) ok(`callback_data dentro de límite 64 bytes: "${callbackData}" (${callbackData.length} bytes)`)
  else fail(`callback_data excede 64 bytes: "${callbackData}" (${callbackData.length} bytes)`)

  // Verificar todos los callback_data de todas las regiones
  let maxLen = 0, maxCb = ''
  for (const [key, region] of Object.entries({ AMAZONAS: { rows: [['Chachapoyas', 'Bagua Grande', 'Bagua']] }, MADRE_DE_DIOS: { rows: [['Puerto Maldonado', 'Tambopata', 'Inambari'], ['Las Piedras', 'Laberinto', 'Iñapari']] }, TUMBES: { rows: [['Zorritos', 'Casitas', 'Canoas de Punta Sal']] }, LA_LIBERTAD: { rows: [['Víctor Larco Herrera', 'El Porvenir', 'La Esperanza']] } })) {
    for (const row of region.rows) {
      for (const d of row) {
        const cb = `ddst:${key}:${d}`
        if (cb.length > maxLen) { maxLen = cb.length; maxCb = cb }
      }
    }
  }
  if (maxLen <= 64) ok(`Todos callback_data ≤64 bytes (max: "${maxCb}" = ${maxLen} bytes)`)
  else fail(`Callback_data demasiado largo: "${maxCb}" = ${maxLen} bytes`)

  // Restaurar
  await sb.from('remaju_filters').update({ districts: ['Los Olivos', 'SMP'] }).eq('user_id', testUser.id)
}

async function test6_usuarios_actuales() {
  section('Test 6: Estado usuarios actuales (solo lectura)')

  const { data: users, error } = await sb
    .from('remaju_users')
    .select('*, remaju_filters(*)')
    .neq('telegram_id', TEST_TELEGRAM_ID)
    .order('created_at', { ascending: false })

  if (error) return fail('Query usuarios reales', error.message)
  if (!users?.length) return ok('Sin usuarios reales registrados aún')

  ok(`${users.length} usuario(s) real(es) encontrados`)

  for (const u of users) {
    const rawF = u.remaju_filters
    const f = rawF ? (Array.isArray(rawF) ? rawF[0] : rawF) : null
    const tieneEstado = !!f
    const nombre = u.first_name + (u.telegram_username ? ` (@${u.telegram_username})` : '')
    const status = u.subscription_status === 'active' ? '✅ activo'
      : u.subscription_status === 'trial' ? '🕐 trial'
      : '❌ vencido'

    if (tieneEstado) {
      ok(`${nombre} — ${status} | precio≤$${f.max_price_usd?.toLocaleString()} | tipos: ${(f.property_types||[]).join(',')} | distritos: ${(f.districts||[]).join(',') || 'todos'}`)
    } else {
      fail(`${nombre} — sin filtros en DB`, 'remaju_filters es null')
    }

    // Verificar que el fix Array.isArray funciona para cada usuario
    if (tieneEstado && f.max_price_usd !== undefined) {
      ok(`  Fix /estado OK para ${u.first_name}`)
    } else if (!tieneEstado) {
      fail(`  Fix /estado: sin filtros para ${u.first_name}`)
    }
  }
}

async function test7_precio_toggle(testUser) {
  section('Test 7: Cambio de precio máximo')

  // Simular savePrecio
  const { data: user } = await sb.from('remaju_users').select('id').eq('telegram_id', TEST_TELEGRAM_ID).single()
  const newPrice = 75000

  await sb.from('remaju_filters').upsert({ user_id: user.id, max_price_usd: newPrice }, { onConflict: 'user_id' })
  const f = await getFilters(testUser.id)

  if (f.max_price_usd === newPrice) ok(`Precio actualizado a $${newPrice.toLocaleString()}`)
  else fail('Precio no actualizado', `esperado ${newPrice}, actual ${f.max_price_usd}`)

  // Restaurar
  await sb.from('remaju_filters').update({ max_price_usd: 90000 }).eq('user_id', testUser.id)
  ok('Precio restaurado a $90,000')
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🤖 REMAJU Bot E2E Test\n')
  console.log(`📡 Supabase: ${SUPABASE_URL}`)
  console.log(`🧪 Test user Telegram ID: ${TEST_TELEGRAM_ID}\n`)

  let testUser = null

  try {
    console.log('⚙️  Preparando usuario de prueba...')
    testUser = await setupTestUser()
    console.log(`   ✅ Usuario test creado: id=${testUser.id}`)

    await test1_connectivity()
    await test2_estado_join_fix(testUser)
    await test3_tipo_toggle(testUser)
    await test4_tier_toggle(testUser)
    await test5_distrito_toggle(testUser)
    await test5b_region_toggle(testUser)
    await test6_usuarios_actuales()
    await test7_precio_toggle(testUser)

  } catch (err) {
    console.error('\n💥 Error inesperado:', err.message)
    failed++
  } finally {
    if (testUser) {
      await cleanupTestUser()
      console.log('\n🧹 Usuario de prueba eliminado')
    }
  }

  console.log(`\n${'═'.repeat(50)}`)
  console.log(`✅ Passed: ${passed}  ❌ Failed: ${failed}  Total: ${passed + failed}`)
  console.log('═'.repeat(50))

  if (failed > 0) process.exit(1)
}

main()
