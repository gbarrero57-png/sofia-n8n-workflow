const { Telegraf, Markup } = require('telegraf')
const { createClient } = require('@supabase/supabase-js')
const logger = require('../utils/logger')

const BOT_TOKEN   = process.env.ADMIN_TELEGRAM_TOKEN
const ADMIN_ID    = parseInt(process.env.ADMIN_TELEGRAM_CHAT_ID)

const PRICE_SOLES = process.env.PAYMENT_PRICE_SOLES  || '70'
const YAPE_NUM    = process.env.PAYMENT_YAPE          || '—'
const PLIN_NUM    = process.env.PAYMENT_PLIN          || '—'
const ADMIN_NAME  = process.env.PAYMENT_ADMIN_NAME    || 'Gabriel Barrero'

let supabase = null

// Estado temporal en memoria para inputs personalizados
const awaitingInput = new Map()  // telegram_id → 'precio'

function getSupabase () {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      { auth: { persistSession: false } }
    )
  }
  return supabase
}

async function getOrCreateUser (telegramUser) {
  const sb = getSupabase()
  const { id, username, first_name, last_name } = telegramUser

  const { data: existing } = await sb
    .from('remaju_users')
    .select('*')
    .eq('telegram_id', id)
    .single()

  if (existing) return { user: existing, isNew: false }

  const trialEnds = new Date()
  trialEnds.setDate(trialEnds.getDate() + 3)

  const { data: newUser, error } = await sb
    .from('remaju_users')
    .insert({
      telegram_id:       id,
      telegram_username: username || null,
      first_name:        first_name || 'Usuario',
      last_name:         last_name  || null,
      subscription_status: 'trial',
      trial_ends_at:     trialEnds.toISOString()
    })
    .select()
    .single()

  if (error) throw error

  // Crear filtros por defecto
  await sb.from('remaju_filters').insert({ user_id: newUser.id })

  return { user: newUser, isNew: true }
}

function getStatusEmoji (status, isExpired) {
  if (status === 'active')   return '✅'
  if (status === 'trial' && !isExpired) return '🕐'
  return '❌'
}

function formatSubscriptionLine (user) {
  const { subscription_status, trial_ends_at, subscription_ends_at } = user
  const now = new Date()

  if (subscription_status === 'active' && subscription_ends_at) {
    const end  = new Date(subscription_ends_at)
    const days = Math.ceil((end - now) / 86400000)
    return `✅ Suscripción <b>activa</b> — vence en ${days} días (${end.toLocaleDateString('es-PE')})`
  }

  if (subscription_status === 'trial' && trial_ends_at) {
    const end  = new Date(trial_ends_at)
    const days = Math.ceil((end - now) / 86400000)
    if (days > 0) return `🕐 Prueba gratuita — <b>${days} días restantes</b>`
    return `⚠️ Prueba vencida — usa /suscripcion para continuar`
  }

  return `❌ Suscripción vencida — usa /suscripcion`
}

function isUserActive (user) {
  const now = new Date()
  if (user.subscription_status === 'active') {
    return !user.subscription_ends_at || new Date(user.subscription_ends_at) > now
  }
  if (user.subscription_status === 'trial') {
    return !user.trial_ends_at || new Date(user.trial_ends_at) > now
  }
  return false
}

// ── Crear y configurar bot ─────────────────────────────────────────────────

function createBot () {
  if (!BOT_TOKEN) {
    logger.warn('ADMIN_TELEGRAM_TOKEN no configurado — bot SaaS deshabilitado')
    return null
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    logger.warn('SUPABASE_URL/SERVICE_KEY no configurados — bot SaaS deshabilitado')
    return null
  }

  const bot = new Telegraf(BOT_TOKEN)

  // ── /start ───────────────────────────────────────────────────────────────
  bot.start(async (ctx) => {
    try {
      const { user, isNew } = await getOrCreateUser(ctx.from)

      if (isNew) {
        await ctx.replyWithHTML(
          `👋 <b>¡Hola ${user.first_name}!</b>\n\n` +
          `Cada mañana a las <b>7AM</b> te envío los mejores remates de Lima, ` +
          `filtrados por tu presupuesto y zona. Sin que tengas que buscar nada.\n\n` +
          `🔴 Super Ganga · 🟠 Muy Bueno · 🟡 Bueno · 🟢 Aceptable\n\n` +
          `⏳ <b>3 días de prueba gratis</b> — sin tarjeta.\n\n` +
          `Para empezar, configura qué propiedades te interesan:`,
          Markup.inlineKeyboard([
            [Markup.button.callback('⚙️ Configurar mis filtros', 'ayuda:filtros')],
            [Markup.button.callback('❓ ¿Cómo funciona?', 'ayuda:inicio')]
          ])
        )

        // Notificar al admin
        await bot.telegram.sendMessage(ADMIN_ID,
          `🆕 <b>Nuevo usuario registrado</b>\n` +
          `👤 ${user.first_name} (@${user.telegram_username || 'sin_usuario'})\n` +
          `🆔 ID: <code>${user.telegram_id}</code>`,
          { parse_mode: 'HTML' }
        ).catch(() => {})

      } else {
        const subLine = formatSubscriptionLine(user)
        const now = new Date()
        const endsAt = user.subscription_status === 'active' ? user.subscription_ends_at : user.trial_ends_at
        const daysLeft = endsAt ? Math.ceil((new Date(endsAt) - now) / 86400000) : null
        const showRenew = daysLeft !== null && daysLeft <= 5

        const buttons = [
          [Markup.button.callback('⚙️ Mis filtros', 'filt:menu'), Markup.button.callback('📊 Mi estado', 'ver:estado')]
        ]
        if (showRenew) buttons.push([Markup.button.callback('💳 Renovar acceso', 'sub:pago')])

        await ctx.replyWithHTML(
          `👋 <b>¡Hola de nuevo, ${user.first_name}!</b>\n\n` +
          `${subLine}`,
          Markup.inlineKeyboard(buttons)
        )
      }
    } catch (err) {
      logger.error('Error en /start', { error: err.message, telegram_id: ctx.from.id })
      await ctx.reply('Hubo un error al registrarte. Intenta de nuevo en unos minutos.')
    }
  })

  // ── /estado ──────────────────────────────────────────────────────────────
  bot.command('estado', async (ctx) => {
    try {
      const sb = getSupabase()
      const { data: user } = await sb
        .from('remaju_users')
        .select('*, remaju_filters(*)')
        .eq('telegram_id', ctx.from.id)
        .single()

      if (!user) {
        return ctx.reply('No estás registrado. Usa /start para comenzar.')
      }

      const rawF = user.remaju_filters
      const f = rawF ? (Array.isArray(rawF) ? rawF[0] : rawF) : null
      const filterInfo = f
        ? `💰 Precio: <b>$${(f.min_price_usd || 0).toLocaleString()} – $${(f.max_price_usd || 90000).toLocaleString()} USD</b>\n` +
          `🏠 Tipos: ${(f.property_types || []).join(', ')}\n` +
          `📍 Distritos: ${f.districts?.length ? f.districts.slice(0,3).join(', ') + (f.districts.length > 3 ? ` (+${f.districts.length - 3} más)` : '') : 'Todo el Perú'}`
        : 'Sin filtros configurados'

      const now2 = new Date()
      const endsAt2 = user.subscription_status === 'active' ? user.subscription_ends_at : user.trial_ends_at
      const daysLeft2 = endsAt2 ? Math.ceil((new Date(endsAt2) - now2) / 86400000) : null
      const showRenew2 = daysLeft2 !== null && daysLeft2 <= 7

      const estadoButtons = [[Markup.button.callback('⚙️ Cambiar filtros', 'filt:menu')]]
      if (showRenew2 || user.subscription_status === 'expired') {
        estadoButtons.push([Markup.button.callback('💳 Renovar acceso', 'sub:pago')])
      }

      await ctx.replyWithHTML(
        `📊 <b>Tu cuenta REMAJU Monitor</b>\n\n` +
        `${formatSubscriptionLine(user)}\n\n` +
        `<b>Filtros activos:</b>\n${filterInfo}`,
        Markup.inlineKeyboard(estadoButtons)
      )
    } catch (err) {
      logger.error('Error en /estado', { error: err.message })
      await ctx.reply('Error al consultar tu estado. Intenta de nuevo.')
    }
  })

  // ── /suscripcion ─────────────────────────────────────────────────────────
  bot.command('suscripcion', async (ctx) => {
    await ctx.replyWithHTML(
      `💳 <b>Plan REMAJU Monitor</b>\n\n` +
      `<b>S/ ${PRICE_SOLES}/mes</b>\n\n` +
      `✅ Alertas diarias a las 7AM\n` +
      `✅ Filtros por precio, tipo y distrito\n` +
      `✅ Sin publicidad ni límites\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📱 <b>Yape / Plin:</b> ${YAPE_NUM}\n` +
      `   A nombre de: <b>${ADMIN_NAME}</b>\n\n` +
      `Envía tu captura del comprobante aquí mismo — te activamos en menos de 24h.`,
      Markup.inlineKeyboard([
        [Markup.button.callback('📸 Ya pagué — enviar comprobante', 'sub:comprobante')]
      ])
    )
  })

  // ── Recibir comprobante de pago (foto o archivo) ─────────────────────────
  bot.on(['photo', 'document'], async (ctx) => {
    const { id, username, first_name } = ctx.from
    try {
      await bot.telegram.forwardMessage(ADMIN_ID, id, ctx.message.message_id)
      await bot.telegram.sendMessage(
        ADMIN_ID,
        `💰 <b>Comprobante de pago</b>\n` +
        `👤 ${first_name} (@${username || 'sin_usuario'})\n` +
        `🆔 <code>${id}</code>\n\n` +
        `Activar con: <code>/activar ${id}</code>`,
        { parse_mode: 'HTML' }
      )
      await ctx.reply('✅ Comprobante recibido. Te activamos en menos de 24 horas. ¡Gracias!')
    } catch (err) {
      logger.error('Error reenviando comprobante', { error: err.message })
      await ctx.reply('Hubo un error enviando el comprobante. Escríbele directamente al administrador.')
    }
  })

  // ── /ayuda — cómo funciona + guía de configuración ─────────────────────
  const AYUDA_TEXTO = {
    inicio:
      `❓ <b>¿Cómo funciona REMAJU Monitor?</b>\n\n` +
      `Cada día a las <b>7:00 AM</b> revisamos todos los remates publicados en remaju.pe.\n\n` +
      `Solo te enviamos los que cumplen <b>tus filtros</b>:\n` +
      `• Precio máximo en USD\n` +
      `• Tipo de propiedad (casa, dpto, terreno…)\n` +
      `• Categoría de precio (Super Ganga, Muy Bueno…)\n` +
      `• Distrito o región del Perú\n\n` +
      `Si no hay nada nuevo, igual te avisamos para que sepas que estamos vigilando.\n\n` +
      `<b>Categorías de precio:</b>\n` +
      `🔴 <b>Super Ganga</b> — menos de $40,000 USD\n` +
      `🟠 <b>Muy Bueno</b> — $40,000 – $60,000 USD\n` +
      `🟡 <b>Bueno</b> — $60,000 – $75,000 USD\n` +
      `🟢 <b>Aceptable</b> — $75,000 – $90,000 USD`,

    filtros:
      `⚙️ <b>Cómo configurar tus filtros</b>\n\n` +
      `Usa el comando /filtros para personalizar qué remates recibes.\n\n` +
      `<b>1️⃣ Precio máximo</b>\n` +
      `Elige el tope en dólares. Solo verás propiedades por debajo de ese precio. Puedes escribir cualquier monto personalizado.\n\n` +
      `<b>2️⃣ Tipo de propiedad</b>\n` +
      `Activa o desactiva: Casa, Departamento, Terreno, Local/Oficina u Otro. Puedes combinarlos.\n\n` +
      `<b>3️⃣ Categorías (tiers)</b>\n` +
      `Filtra por rango de precio relativo. Útil si solo te interesan las súper gangas o si buscas algo más amplio.\n\n` +
      `<b>4️⃣ Distritos</b>\n` +
      `Elige los distritos de Lima que te interesan, o explora todas las regiones del Perú. Sin selección = recibes de todo el país.\n\n` +
      `💡 <b>Consejo:</b> empieza con el precio máximo y los distritos que conoces — eso tiene el mayor impacto en la cantidad de alertas.`
  }

  async function sendAyuda (ctx, tipo) {
    const texto = AYUDA_TEXTO[tipo] || AYUDA_TEXTO.inicio
    const kb = Markup.inlineKeyboard([
      [Markup.button.callback('⚙️ Ir a mis filtros ahora', 'ayuda:ir_filtros')]
    ])
    return { texto, kb }
  }

  async function showFiltrosMenu (ctx) {
    const sb = getSupabase()
    const { data: user } = await sb.from('remaju_users').select('id').eq('telegram_id', ctx.from.id).single()
    if (!user) return ctx.reply('Usa /start primero.')
    const { data: f } = await sb.from('remaju_filters').select('*').eq('user_id', user.id).single()
    const maxPrice   = f?.max_price_usd  || 90000
    const types      = f?.property_types || ['casa','departamento','terreno','local','otro']
    const tiers      = f?.tiers          || ['super_ganga','muy_bueno','bueno','aceptable']
    const districts  = f?.districts      || []
    const tierLabels = { super_ganga: '🔴 Super Ganga', muy_bueno: '🟠 Muy Bueno', bueno: '🟡 Bueno', aceptable: '🟢 Aceptable' }
    const kb = Markup.inlineKeyboard([
      [Markup.button.callback('💰 Precio máximo', 'filt:precio')],
      [Markup.button.callback('🏠 Tipo de propiedad', 'filt:tipo')],
      [Markup.button.callback('📊 Tiers / categorías', 'filt:tiers')],
      [Markup.button.callback('📍 Distritos', 'filt:distritos')],
      [Markup.button.callback('✅ Listo', 'filt:done')]
    ])
    const texto =
      `⚙️ <b>Mis Filtros</b>\n\n` +
      `💰 Precio máx: <b>$${maxPrice.toLocaleString()} USD</b>\n` +
      `🏠 Tipos: <b>${types.length === 5 ? 'Todos' : types.join(', ')}</b>\n` +
      `📊 Tiers: <b>${tiers.map(t => tierLabels[t] || t).join(', ')}</b>\n` +
      `📍 Distritos: <b>${districts.length ? districts.slice(0,4).join(', ') + (districts.length > 4 ? '...' : '') : 'Todo el Perú'}</b>\n\n` +
      `¿Qué quieres cambiar?`
    return { texto, kb }
  }

  bot.command('ayuda', async (ctx) => {
    const { texto, kb } = await sendAyuda(ctx, 'inicio')
    await ctx.replyWithHTML(texto, kb)
  })

  bot.action('ayuda:inicio', async (ctx) => {
    await ctx.answerCbQuery()
    const { texto, kb } = await sendAyuda(ctx, 'inicio')
    try {
      await ctx.editMessageText(texto, { parse_mode: 'HTML', ...kb })
    } catch (e) {
      if (!e.message?.includes('message is not modified')) await ctx.replyWithHTML(texto, kb)
    }
  })

  bot.action('ayuda:filtros', async (ctx) => {
    await ctx.answerCbQuery()
    try {
      const { texto, kb } = await showFiltrosMenu(ctx)
      await ctx.editMessageText(texto, { parse_mode: 'HTML', ...kb })
    } catch (e) {
      if (!e.message?.includes('message is not modified')) {
        const { texto, kb } = await showFiltrosMenu(ctx)
        await ctx.replyWithHTML(texto, kb)
      }
    }
  })

  bot.action('ayuda:ir_filtros', async (ctx) => {
    await ctx.answerCbQuery()
    const { texto, kb } = await showFiltrosMenu(ctx)
    await ctx.replyWithHTML(texto, kb)
  })

  // ── /filtros — menú principal de configuración ──────────────────────────
  bot.command('filtros', async (ctx) => {
    const sb = getSupabase()
    const { data: user } = await sb.from('remaju_users').select('id').eq('telegram_id', ctx.from.id).single()
    if (!user) return ctx.reply('Usa /start primero para registrarte.')

    const { data: f } = await sb.from('remaju_filters').select('*').eq('user_id', user.id).single()

    const maxPrice     = f?.max_price_usd   || 90000
    const types        = f?.property_types  || ['casa','departamento','terreno','local','otro']
    const tiers        = f?.tiers           || ['super_ganga','muy_bueno','bueno','aceptable']
    const districts    = f?.districts       || []

    const tierLabels   = { super_ganga: '🔴 Super Ganga', muy_bueno: '🟠 Muy Bueno', bueno: '🟡 Bueno', aceptable: '🟢 Aceptable' }
    const tiersLine    = tiers.map(t => tierLabels[t] || t).join(', ')
    const typesLine    = types.length === 5 ? 'Todos' : types.join(', ')
    const districtsLine = districts.length ? districts.slice(0, 4).join(', ') + (districts.length > 4 ? '...' : '') : 'Todo el Perú'

    await ctx.replyWithHTML(
      `⚙️ <b>Mis Filtros</b>\n\n` +
      `💰 Precio máx: <b>$${maxPrice.toLocaleString()} USD</b>\n` +
      `🏠 Tipos: <b>${typesLine}</b>\n` +
      `📊 Tiers: <b>${tiersLine}</b>\n` +
      `📍 Distritos: <b>${districtsLine}</b>\n\n` +
      `¿Qué quieres cambiar?`,
      Markup.inlineKeyboard([
        [Markup.button.callback('💰 Precio máximo', 'filt:precio')],
        [Markup.button.callback('🏠 Tipo de propiedad', 'filt:tipo')],
        [Markup.button.callback('📊 Tiers / categorías', 'filt:tiers')],
        [Markup.button.callback('📍 Distritos', 'filt:distritos')],
        [Markup.button.callback('✅ Listo', 'filt:done')]
      ])
    )
  })

  // ── Callbacks de filtros ─────────────────────────────────────────────────

  // PRECIO
  bot.action('filt:precio', async (ctx) => {
    await ctx.answerCbQuery()
    await ctx.editMessageText(
      '💰 <b>Precio máximo en USD</b>\n\nElige el tope o escribe un monto personalizado:',
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([
        [
          Markup.button.callback('$40k',  'precio:40000'),
          Markup.button.callback('$60k',  'precio:60000'),
          Markup.button.callback('$75k',  'precio:75000')
        ],
        [
          Markup.button.callback('$90k',  'precio:90000'),
          Markup.button.callback('$120k', 'precio:120000'),
          Markup.button.callback('$150k', 'precio:150000')
        ],
        [
          Markup.button.callback('$200k', 'precio:200000'),
          Markup.button.callback('$300k', 'precio:300000'),
          Markup.button.callback('$500k', 'precio:500000')
        ],
        [
          Markup.button.callback('$750k', 'precio:750000'),
          Markup.button.callback('$1M',   'precio:1000000')
        ],
        [Markup.button.callback('✏️ Escribir monto personalizado', 'precio:custom')],
        [Markup.button.callback('« Volver', 'filt:menu')]
      ]) }
    )
  })

  bot.action('precio:custom', async (ctx) => {
    await ctx.answerCbQuery()
    awaitingInput.set(ctx.from.id, 'precio')
    await ctx.editMessageText(
      '✏️ <b>Monto personalizado</b>\n\nEscribe el precio máximo en USD (solo el número, sin símbolos).\n\nEjemplo: <code>250000</code>',
      { parse_mode: 'HTML' }
    )
  })

  bot.action(/^precio:(\d+)$/, async (ctx) => {
    const maxPrice = parseInt(ctx.match[1])
    await savePrecio(ctx, maxPrice)
  })

  async function savePrecio (ctx, maxPrice) {
    const sb = getSupabase()
    const { data: user } = await sb.from('remaju_users').select('id').eq('telegram_id', ctx.from.id).single()
    if (!user) return ctx.answerCbQuery ? ctx.answerCbQuery('No registrado') : null

    await sb.from('remaju_filters').upsert({ user_id: user.id, max_price_usd: maxPrice }, { onConflict: 'user_id' })

    const label = maxPrice >= 1000000 ? '$1,000,000' : `$${maxPrice.toLocaleString('es-PE')}`
    const text  = `✅ <b>Precio máximo guardado:</b> ${label} USD\n\n¿Qué más quieres cambiar?`
    const kb    = Markup.inlineKeyboard([
      [Markup.button.callback('💰 Cambiar precio',       'filt:precio')],
      [Markup.button.callback('🏠 Tipo de propiedad',    'filt:tipo')],
      [Markup.button.callback('📊 Tiers / categorías',   'filt:tiers')],
      [Markup.button.callback('📍 Distritos',            'filt:distritos')],
      [Markup.button.callback('✅ Listo',                'filt:done')]
    ])

    if (ctx.answerCbQuery) {
      await ctx.answerCbQuery(`✅ Precio: ${label}`)
      await ctx.editMessageText(text, { parse_mode: 'HTML', ...kb })
    } else {
      await ctx.replyWithHTML(text, kb)
    }
  }

  // TIPO DE PROPIEDAD
  bot.action('filt:tipo', async (ctx) => {
    await ctx.answerCbQuery()
    const sb = getSupabase()
    const { data: user } = await sb.from('remaju_users').select('id').eq('telegram_id', ctx.from.id).single()
    const { data: f }    = await sb.from('remaju_filters').select('property_types').eq('user_id', user?.id).single()
    const sel = f?.property_types || ['casa','departamento','terreno','local','otro']

    const options = [
      { key: 'casa',          label: '🏠 Casa' },
      { key: 'departamento',  label: '🏢 Departamento' },
      { key: 'terreno',       label: '🌿 Terreno' },
      { key: 'local',         label: '🏪 Local / Oficina' },
      { key: 'otro',          label: '🏗️ Otro' }
    ]

    const buttons = options.map(o => [
      Markup.button.callback(
        (sel.includes(o.key) ? '✅ ' : '☐ ') + o.label,
        `tipo:${o.key}`
      )
    ])
    buttons.push([Markup.button.callback('« Volver', 'filt:menu')])

    await ctx.editMessageText(
      '🏠 <b>Tipo de propiedad</b>\n\nToca para activar/desactivar. Los marcados con ✅ te llegarán:',
      { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }
    )
  })

  bot.action(/^tipo:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery()
    const tipo = ctx.match[1]
    try {
      const sb   = getSupabase()
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
      if (upsertErr) {
        logger.error('Error guardando tipo', { error: upsertErr.message })
        return ctx.answerCbQuery('❌ Error guardando. Intenta de nuevo.')
      }

      const options = [
        { key: 'casa',         label: '🏠 Casa' },
        { key: 'departamento', label: '🏢 Departamento' },
        { key: 'terreno',      label: '🌿 Terreno' },
        { key: 'local',        label: '🏪 Local / Oficina' },
        { key: 'otro',         label: '🏗️ Otro' }
      ]
      const buttons = options.map(o => [
        Markup.button.callback(
          (types.includes(o.key) ? '✅ ' : '☐ ') + o.label,
          `tipo:${o.key}`
        )
      ])
      buttons.push([Markup.button.callback('« Volver', 'filt:menu')])
      await ctx.editMessageReplyMarkup(Markup.inlineKeyboard(buttons).reply_markup)
    } catch (err) {
      if (!err.message?.includes('message is not modified')) {
        logger.error('Error en filtro tipo', { error: err.message })
      }
    }
  })

  // TIERS
  bot.action('filt:tiers', async (ctx) => {
    await ctx.answerCbQuery()
    const sb = getSupabase()
    const { data: user } = await sb.from('remaju_users').select('id').eq('telegram_id', ctx.from.id).single()
    const { data: f }    = await sb.from('remaju_filters').select('tiers').eq('user_id', user?.id).single()
    const sel = f?.tiers || ['super_ganga','muy_bueno','bueno','aceptable']

    const options = [
      { key: 'super_ganga', label: '🔴 Super Ganga  (< $40k)' },
      { key: 'muy_bueno',   label: '🟠 Muy Bueno   ($40–60k)' },
      { key: 'bueno',       label: '🟡 Bueno        ($60–75k)' },
      { key: 'aceptable',   label: '🟢 Aceptable    ($75–90k)' }
    ]
    const buttons = options.map(o => [
      Markup.button.callback((sel.includes(o.key) ? '✅ ' : '☐ ') + o.label, `tier:${o.key}`)
    ])
    buttons.push([Markup.button.callback('« Volver', 'filt:menu')])

    await ctx.editMessageText(
      '📊 <b>Categorías de precio</b>\n\nToca para activar/desactivar las que quieres recibir:',
      { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }
    )
  })

  bot.action(/^tier:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery()
    const tier = ctx.match[1]
    try {
      const sb   = getSupabase()
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
      if (upsertErr) {
        logger.error('Error guardando tiers', { error: upsertErr.message })
        return ctx.answerCbQuery('❌ Error guardando. Intenta de nuevo.')
      }

      const options = [
        { key: 'super_ganga', label: '🔴 Super Ganga  (< $40k)' },
        { key: 'muy_bueno',   label: '🟠 Muy Bueno   ($40–60k)' },
        { key: 'bueno',       label: '🟡 Bueno        ($60–75k)' },
        { key: 'aceptable',   label: '🟢 Aceptable    ($75–90k)' }
      ]
      const buttons = options.map(o => [
        Markup.button.callback((tiers.includes(o.key) ? '✅ ' : '☐ ') + o.label, `tier:${o.key}`)
      ])
      buttons.push([Markup.button.callback('« Volver', 'filt:menu')])
      await ctx.editMessageReplyMarkup(Markup.inlineKeyboard(buttons).reply_markup)
    } catch (err) {
      if (!err.message?.includes('message is not modified')) {
        logger.error('Error en filtro tier', { error: err.message })
      }
    }
  })

  // ── DISTRITOS — datos completos de todas las regiones del Perú ──────────────

  const LIMA_RAPIDO = [
    ['Miraflores', 'San Isidro', 'Surco'],
    ['San Borja', 'La Molina', 'Barranco'],
    ['Chorrillos', 'San Miguel', 'Jesús María'],
    ['Lince', 'Pueblo Libre', 'Magdalena'],
    ['Los Olivos', 'San Martín de Porres', 'Comas'],
    ['ATE', 'San Juan de Lurigancho', 'Villa El Salvador'],
    ['Villa María del Triunfo', 'San Juan de Miraflores', 'Independencia'],
    ['Carabayllo', 'Puente Piedra', 'Santa Anita'],
    ['La Victoria', 'Breña', 'Rímac'],
    ['Cercado de Lima', 'El Agustino', 'Lurigancho'],
    ['Callao', 'Bellavista', 'Ventanilla'],
  ]

  const PERU_REGIONES = {
    'AMAZONAS':      { label: 'Amazonas',       rows: [['Chachapoyas', 'Bagua Grande', 'Bagua'], ['Luya', 'Bongará', 'Rodríguez de Mendoza']] },
    'ANCASH':        { label: 'Áncash',          rows: [['Chimbote', 'Nuevo Chimbote', 'Huaraz'], ['Caraz', 'Carhuaz', 'Yungay'], ['Casma', 'Barranca', 'Huarmey']] },
    'APURIMAC':      { label: 'Apurímac',        rows: [['Abancay', 'Tamburco', 'Andahuaylas'], ['San Jerónimo', 'Chincheros', 'Cotabambas']] },
    'AREQUIPA':      { label: 'Arequipa',        rows: [['Arequipa', 'Cayma', 'Cerro Colorado'], ['Sachaca', 'Socabaya', 'José Luis Bustamante'], ['Paucarpata', 'Mariano Melgar', 'Hunter'], ['Yanahuara', 'Tiabaya', 'Characato'], ['Camaná', 'Islay', 'Caravelí']] },
    'AYACUCHO':      { label: 'Ayacucho',        rows: [['Ayacucho', 'San Juan Bautista', 'Carmen Alto'], ['Jesús Nazareno', 'Huanta', 'La Mar']] },
    'CAJAMARCA':     { label: 'Cajamarca',       rows: [['Cajamarca', 'Baños del Inca', 'Llacanora'], ['Jaén', 'San Ignacio', 'Chota'], ['Cutervo', 'Santa Cruz', 'Celendín']] },
    'CALLAO':        { label: 'Callao',          rows: [['Callao', 'Bellavista', 'La Perla'], ['La Punta', 'Mi Perú', 'Ventanilla']] },
    'CUSCO':         { label: 'Cusco',           rows: [['Cusco', 'San Sebastián', 'San Jerónimo'], ['Santiago', 'Wanchaq', 'Poroy'], ['Urubamba', 'Pisac', 'Calca'], ['Quillabamba', 'Espinar', 'Sicuani']] },
    'HUANCAVELICA':  { label: 'Huancavelica',    rows: [['Huancavelica', 'Ascensión', 'Pampas'], ['Acobamba', 'Churcampa', 'Tayacaja']] },
    'HUANUCO':       { label: 'Huánuco',         rows: [['Huánuco', 'Amarilis', 'Pillco Marca'], ['Tingo María', 'Leoncio Prado', 'Ambo'], ['Llata', 'Puerto Inca', 'Pachitea']] },
    'ICA':           { label: 'Ica',             rows: [['Ica', 'La Tinguiña', 'Subtanjalla'], ['Chincha Alta', 'El Carmen', 'Grocio Prado'], ['Pisco', 'Paracas', 'San Andrés'], ['Nasca', 'Vista Alegre', 'Palpa']] },
    'JUNIN':         { label: 'Junín',           rows: [['Huancayo', 'El Tambo', 'Chilca'], ['Chupaca', 'Concepción', 'Jauja'], ['Tarma', 'La Oroya', 'Junín'], ['Satipo', 'Chanchamayo', 'San Ramón']] },
    'LA_LIBERTAD':   { label: 'La Libertad',     rows: [['Trujillo', 'Víctor Larco Herrera', 'El Porvenir'], ['La Esperanza', 'Florencia de Mora', 'Huanchaco'], ['Moche', 'Laredo', 'Salaverry'], ['Chepén', 'Pacasmayo', 'Ascope'], ['Santiago de Chuco', 'Otuzco', 'Virú']] },
    'LAMBAYEQUE':    { label: 'Lambayeque',      rows: [['Chiclayo', 'La Victoria', 'José Leonardo Ortiz'], ['Pimentel', 'Monsefú', 'Reque'], ['Lambayeque', 'Olmos', 'Motupe'], ['Ferreñafe', 'Mesones Muro', 'Incahuasi']] },
    'LIMA':          { label: 'Lima (provincia)', rows: [['Miraflores', 'San Isidro', 'Surco'], ['San Borja', 'La Molina', 'Barranco'], ['Chorrillos', 'San Miguel', 'Jesús María'], ['Lince', 'Pueblo Libre', 'Magdalena'], ['Los Olivos', 'San Martín de Porres', 'Comas'], ['ATE', 'San Juan de Lurigancho', 'Villa El Salvador'], ['Villa María del Triunfo', 'San Juan de Miraflores', 'Independencia'], ['Carabayllo', 'Puente Piedra', 'Santa Anita'], ['La Victoria', 'Breña', 'Rímac'], ['Cercado de Lima', 'El Agustino', 'Lurigancho'], ['Lunahuaná', 'Cañete', 'Huaral'], ['Huacho', 'Barranca', 'Huaura']] },
    'LORETO':        { label: 'Loreto',          rows: [['Iquitos', 'San Juan Bautista', 'Punchana'], ['Belén', 'Nauta', 'Requena'], ['Yurimaguas', 'Contamana', 'Caballococha']] },
    'MADRE_DE_DIOS': { label: 'Madre de Dios',   rows: [['Puerto Maldonado', 'Tambopata', 'Inambari'], ['Las Piedras', 'Laberinto', 'Iñapari']] },
    'MOQUEGUA':      { label: 'Moquegua',        rows: [['Moquegua', 'Samegua', 'Torata'], ['Ilo', 'El Algarrobal', 'Pacocha']] },
    'PASCO':         { label: 'Pasco',           rows: [['Cerro de Pasco', 'Yanacancha', 'Chaupimarca'], ['Oxapampa', 'Villa Rica', 'Pozuzo']] },
    'PIURA':         { label: 'Piura',           rows: [['Piura', 'Castilla', 'Veintiséis de Octubre'], ['Catacaos', 'Chulucanas', 'La Unión'], ['Sullana', 'Bellavista', 'Querecotillo'], ['Talara', 'Pariñas', 'La Brea'], ['Paita', 'Colán', 'Amotape']] },
    'PUNO':          { label: 'Puno',            rows: [['Puno', 'Paucarcolla', 'Acora'], ['Juliaca', 'Caracoto', 'Cabana'], ['Azángaro', 'Lampa', 'Yunguyo'], ['Ilave', 'Desaguadero', 'Moho']] },
    'SAN_MARTIN':    { label: 'San Martín',      rows: [['Tarapoto', 'Morales', 'La Banda de Shilcayo'], ['Moyobamba', 'Jepelacio', 'Soritor'], ['Rioja', 'Nueva Cajamarca', 'Naranjillo'], ['Juanjuí', 'Tocache', 'Bellavista']] },
    'TACNA':         { label: 'Tacna',           rows: [['Tacna', 'Gregorio Albarracín', 'Alto de la Alianza'], ['Ciudad Nueva', 'Pocollay', 'Sama']] },
    'TUMBES':        { label: 'Tumbes',          rows: [['Tumbes', 'Corrales', 'San Jacinto'], ['San Juan de la Virgen', 'Zarumilla', 'La Cruz'], ['Zorritos', 'Casitas', 'Canoas de Punta Sal']] },
    'UCAYALI':       { label: 'Ucayali',         rows: [['Pucallpa', 'Callería', 'Manantay'], ['Yarinacocha', 'Campo Verde', 'Nueva Requena'], ['Coronel Portillo', 'Atalaya', 'Padre Abad']] },
  }

  const REGIONES_GRID = [
    ['LIMA', 'CALLAO'],
    ['AREQUIPA', 'LA_LIBERTAD', 'PIURA'],
    ['LAMBAYEQUE', 'CUSCO', 'JUNIN'],
    ['ANCASH', 'ICA', 'SAN_MARTIN'],
    ['HUANUCO', 'PUNO', 'CAJAMARCA'],
    ['TACNA', 'MOQUEGUA', 'TUMBES'],
    ['UCAYALI', 'LORETO', 'AMAZONAS'],
    ['APURIMAC', 'AYACUCHO', 'HUANCAVELICA'],
    ['PASCO', 'MADRE_DE_DIOS'],
  ]

  // ── helper: texto resumen de distritos seleccionados ──────────────────────
  function selLine (districts) {
    if (!districts.length) return 'Todos el Perú'
    return districts.slice(0, 4).join(', ') + (districts.length > 4 ? ` (+${districts.length - 4} más)` : '')
  }

  // ── Lima rápido (pantalla inicial de distritos) ───────────────────────────
  function buildLimaKeyboard (sel) {
    const buttons = LIMA_RAPIDO.map(row =>
      row.map(d => Markup.button.callback((sel.includes(d) ? '✅ ' : '') + d, `dist:${d}`))
    )
    buttons.push([
      Markup.button.callback(sel.length === 0 ? '✅ Todo el Perú' : '🌍 Todo el Perú (quitar filtro)', 'dist:todos'),
    ])
    buttons.push([Markup.button.callback('🗺 Otras regiones del Perú', 'filt:regiones')])
    buttons.push([Markup.button.callback('« Volver al menú', 'filt:menu')])
    return Markup.inlineKeyboard(buttons)
  }

  // ── Teclado de una región específica ─────────────────────────────────────
  function buildRegionKeyboard (regionKey, sel) {
    const region = PERU_REGIONES[regionKey]
    const buttons = region.rows.map(row =>
      row.map(d => Markup.button.callback((sel.includes(d) ? '✅ ' : '') + d, `ddst:${regionKey}:${d}`))
    )
    buttons.push([Markup.button.callback('🌍 Todo el Perú (quitar filtro)', 'ddst:' + regionKey + ':__todos__')])
    buttons.push([Markup.button.callback('« Regiones', 'filt:regiones')])
    buttons.push([Markup.button.callback('« Volver al menú', 'filt:menu')])
    return Markup.inlineKeyboard(buttons)
  }

  // ── Teclado selector de regiones ─────────────────────────────────────────
  function buildRegionesKeyboard () {
    const buttons = REGIONES_GRID.map(row =>
      row.map(key => Markup.button.callback(PERU_REGIONES[key].label, `dept:${key}`))
    )
    buttons.push([Markup.button.callback('« Volver a Lima rápido', 'filt:distritos')])
    buttons.push([Markup.button.callback('« Volver al menú', 'filt:menu')])
    return Markup.inlineKeyboard(buttons)
  }

  // ── Handler: pantalla inicial distritos (Lima rápido) ────────────────────
  bot.action('filt:distritos', async (ctx) => {
    await ctx.answerCbQuery()
    const sb = getSupabase()
    const { data: user } = await sb.from('remaju_users').select('id').eq('telegram_id', ctx.from.id).single()
    const { data: f }    = await sb.from('remaju_filters').select('districts').eq('user_id', user?.id).single()
    const sel = f?.districts || []

    await ctx.editMessageText(
      `📍 <b>Distritos</b>\n\n` +
      `Seleccionados: <b>${selLine(sel)}</b>\n\n` +
      `Lima rápido — toca para activar/desactivar.\nUsa <b>🗺 Otras regiones</b> para ver todo el Perú:`,
      { parse_mode: 'HTML', ...buildLimaKeyboard(sel) }
    )
  })

  // ── Handler: lista de todas las regiones ─────────────────────────────────
  bot.action('filt:regiones', async (ctx) => {
    await ctx.answerCbQuery()
    const sb = getSupabase()
    const { data: user } = await sb.from('remaju_users').select('id').eq('telegram_id', ctx.from.id).single()
    const { data: f }    = await sb.from('remaju_filters').select('districts').eq('user_id', user?.id).single()
    const sel = f?.districts || []

    await ctx.editMessageText(
      `🗺 <b>Regiones del Perú</b>\n\n` +
      `Seleccionados: <b>${selLine(sel)}</b>\n\n` +
      `Elige una región para ver sus distritos:`,
      { parse_mode: 'HTML', ...buildRegionesKeyboard() }
    )
  })

  // ── Handler: distritos de una región específica ───────────────────────────
  bot.action(/^dept:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery()
    const regionKey = ctx.match[1]
    if (!PERU_REGIONES[regionKey]) return

    const sb = getSupabase()
    const { data: user } = await sb.from('remaju_users').select('id').eq('telegram_id', ctx.from.id).single()
    const { data: f }    = await sb.from('remaju_filters').select('districts').eq('user_id', user?.id).single()
    const sel = f?.districts || []

    const region = PERU_REGIONES[regionKey]
    await ctx.editMessageText(
      `📍 <b>${region.label}</b>\n\n` +
      `Seleccionados: <b>${selLine(sel)}</b>\n\n` +
      `Toca para activar/desactivar distritos:`,
      { parse_mode: 'HTML', ...buildRegionKeyboard(regionKey, sel) }
    )
  })

  // ── Handler: toggle desde Lima rápido ────────────────────────────────────
  bot.action(/^dist:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery()
    const distrito = ctx.match[1]
    try {
      const sb = getSupabase()
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
      if (upsertErr) {
        logger.error('Error guardando distritos', { error: upsertErr.message })
        return ctx.answerCbQuery('❌ Error guardando. Intenta de nuevo.')
      }

      await ctx.editMessageText(
        `📍 <b>Distritos</b>\n\n` +
        `Seleccionados: <b>${selLine(districts)}</b>\n\n` +
        `Lima rápido — toca para activar/desactivar.\nUsa <b>🗺 Otras regiones</b> para ver todo el Perú:`,
        { parse_mode: 'HTML', ...buildLimaKeyboard(districts) }
      )
    } catch (err) {
      if (!err.message?.includes('message is not modified')) {
        logger.error('Error en filtro distrito', { error: err.message })
      }
    }
  })

  // ── Handler: toggle desde vista de región ────────────────────────────────
  bot.action(/^ddst:([^:]+):(.+)$/, async (ctx) => {
    await ctx.answerCbQuery()
    const regionKey = ctx.match[1]
    const distrito  = ctx.match[2]
    if (!PERU_REGIONES[regionKey]) return

    try {
      const sb = getSupabase()
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
      if (upsertErr) {
        logger.error('Error guardando distritos región', { error: upsertErr.message })
        return ctx.answerCbQuery('❌ Error guardando. Intenta de nuevo.')
      }

      const region = PERU_REGIONES[regionKey]
      await ctx.editMessageText(
        `📍 <b>${region.label}</b>\n\n` +
        `Seleccionados: <b>${selLine(districts)}</b>\n\n` +
        `Toca para activar/desactivar distritos:`,
        { parse_mode: 'HTML', ...buildRegionKeyboard(regionKey, districts) }
      )
    } catch (err) {
      if (!err.message?.includes('message is not modified')) {
        logger.error('Error en filtro distrito región', { error: err.message })
      }
    }
  })

  // MENÚ PRINCIPAL (volver)
  bot.action('filt:menu', async (ctx) => {
    await ctx.answerCbQuery()
    const sb = getSupabase()
    const { data: user } = await sb.from('remaju_users').select('id').eq('telegram_id', ctx.from.id).single()
    const { data: f }    = await sb.from('remaju_filters').select('*').eq('user_id', user?.id).single()

    const maxPrice      = f?.max_price_usd  || 90000
    const types         = f?.property_types || ['casa','departamento','terreno','local','otro']
    const tiers         = f?.tiers          || ['super_ganga','muy_bueno','bueno','aceptable']
    const districts     = f?.districts      || []
    const tierLabels    = { super_ganga: '🔴', muy_bueno: '🟠', bueno: '🟡', aceptable: '🟢' }

    await ctx.editMessageText(
      `⚙️ <b>Mis Filtros</b>\n\n` +
      `💰 Precio máx: <b>$${maxPrice.toLocaleString()} USD</b>\n` +
      `🏠 Tipos: <b>${types.length === 5 ? 'Todos' : types.join(', ')}</b>\n` +
      `📊 Tiers: <b>${tiers.map(t => tierLabels[t]).join(' ')}</b>\n` +
      `📍 Distritos: <b>${districts.length ? districts.slice(0,4).join(', ') + (districts.length > 4 ? '...' : '') : 'Todo el Perú'}</b>\n\n` +
      `¿Qué quieres cambiar?`,
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([
        [Markup.button.callback('💰 Precio máximo', 'filt:precio')],
        [Markup.button.callback('🏠 Tipo de propiedad', 'filt:tipo')],
        [Markup.button.callback('📊 Tiers / categorías', 'filt:tiers')],
        [Markup.button.callback('📍 Distritos', 'filt:distritos')],
        [Markup.button.callback('✅ Listo', 'filt:done')]
      ]) }
    )
  })

  // LISTO
  bot.action('filt:done', async (ctx) => {
    await ctx.answerCbQuery('✅ Guardado')
    await ctx.editMessageText(
      '✅ <b>Filtros guardados.</b>\n\nTus alertas de mañana ya usarán esta configuración.',
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([
        [Markup.button.callback('📊 Ver mi estado', 'ver:estado')]
      ]) }
    )
  })

  // ── ver:estado — estado inline desde cualquier mensaje ──────────────────
  bot.action('ver:estado', async (ctx) => {
    await ctx.answerCbQuery()
    const sb = getSupabase()
    const { data: user } = await sb
      .from('remaju_users')
      .select('*, remaju_filters(*)')
      .eq('telegram_id', ctx.from.id)
      .single()

    if (!user) return ctx.answerCbQuery('Usa /start primero')

    const rawF = user.remaju_filters
    const f = rawF ? (Array.isArray(rawF) ? rawF[0] : rawF) : null
    const filterInfo = f
      ? `💰 Precio: <b>$${(f.min_price_usd || 0).toLocaleString()} – $${(f.max_price_usd || 90000).toLocaleString()} USD</b>\n` +
        `🏠 Tipos: ${(f.property_types || []).join(', ')}\n` +
        `📍 Distritos: ${f.districts?.length ? f.districts.slice(0,3).join(', ') + (f.districts.length > 3 ? ` (+${f.districts.length - 3} más)` : '') : 'Todo el Perú'}`
      : 'Sin filtros configurados'

    const now3 = new Date()
    const endsAt3 = user.subscription_status === 'active' ? user.subscription_ends_at : user.trial_ends_at
    const daysLeft3 = endsAt3 ? Math.ceil((new Date(endsAt3) - now3) / 86400000) : null
    const showRenew3 = daysLeft3 !== null && daysLeft3 <= 7

    const buttons3 = [[Markup.button.callback('⚙️ Cambiar filtros', 'filt:menu')]]
    if (showRenew3 || user.subscription_status === 'expired') {
      buttons3.push([Markup.button.callback('💳 Renovar acceso', 'sub:pago')])
    }

    const texto = `📊 <b>Tu cuenta REMAJU Monitor</b>\n\n${formatSubscriptionLine(user)}\n\n<b>Filtros:</b>\n${filterInfo}`
    try {
      await ctx.editMessageText(texto, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons3) })
    } catch (e) {
      if (!e.message?.includes('message is not modified')) await ctx.replyWithHTML(texto, Markup.inlineKeyboard(buttons3))
    }
  })

  // ── sub:pago — info de pago inline ──────────────────────────────────────
  bot.action('sub:pago', async (ctx) => {
    await ctx.answerCbQuery()
    const texto =
      `💳 <b>Plan REMAJU Monitor</b>\n\n` +
      `<b>S/ ${PRICE_SOLES}/mes</b>\n\n` +
      `✅ Alertas diarias a las 7AM\n` +
      `✅ Filtros por precio, tipo y distrito\n` +
      `✅ Sin publicidad ni límites\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📱 <b>Yape / Plin:</b> ${YAPE_NUM}\n` +
      `   A nombre de: <b>${ADMIN_NAME}</b>\n\n` +
      `Envía tu captura del comprobante aquí mismo — te activamos en menos de 24h.`
    const kb = Markup.inlineKeyboard([[Markup.button.callback('📸 Ya pagué — enviar comprobante', 'sub:comprobante')]])
    try {
      await ctx.editMessageText(texto, { parse_mode: 'HTML', ...kb })
    } catch (e) {
      if (!e.message?.includes('message is not modified')) await ctx.replyWithHTML(texto, kb)
    }
  })

  // ── sub:comprobante — instrucciones para enviar foto ─────────────────────
  bot.action('sub:comprobante', async (ctx) => {
    await ctx.answerCbQuery()
    await ctx.editMessageText(
      `📸 <b>Enviar comprobante</b>\n\n` +
      `Adjunta aquí la captura de pantalla del Yape o Plin como <b>foto</b>.\n\n` +
      `Te confirmamos en menos de 24h. ¡Gracias!`,
      { parse_mode: 'HTML' }
    )
  })

  // ── Mensaje de texto genérico — guía al usuario ──────────────────────────
  bot.on('text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next()

    // Input personalizado de precio
    if (awaitingInput.get(ctx.from.id) === 'precio') {
      awaitingInput.delete(ctx.from.id)
      const raw     = ctx.message.text.replace(/[^0-9]/g, '')
      const amount  = parseInt(raw)

      if (!amount || amount < 1000 || amount > 10000000) {
        return ctx.replyWithHTML(
          '⚠️ Monto inválido. Ingresa un número entre <b>1,000</b> y <b>10,000,000</b> USD.\n\nEjemplo: <code>250000</code>'
        )
      }

      return savePrecio(ctx, amount)
    }

    await ctx.replyWithHTML(
      `Usa los comandos para interactuar:\n\n` +
      `❓ /ayuda — cómo funciona y cómo configurar\n` +
      `📊 /estado — ver tu suscripción\n` +
      `⚙️ /filtros — personalizar alertas\n` +
      `💳 /suscripcion — ver opciones de pago\n\n` +
      `<i>Para enviar un comprobante de pago, adjunta la imagen directamente.</i>`
    )
  })

  // ════════════════════════════════════════════════════════
  // COMANDOS DE ADMIN (solo ADMIN_ID)
  // ════════════════════════════════════════════════════════

  // ── Callback: reactivar usuario desde notificación de vencimiento ──────────
  bot.action(/^reactivar:(\d+)$/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
      return ctx.answerCbQuery('⛔ No autorizado')
    }
    await ctx.answerCbQuery('Activando...')

    const targetTelegramId = parseInt(ctx.match[1])
    const sb   = getSupabase()
    const ends = new Date()
    ends.setDate(ends.getDate() + 30)

    const { data: user, error } = await sb
      .from('remaju_users')
      .update({ subscription_status: 'active', subscription_ends_at: ends.toISOString(), active: true })
      .eq('telegram_id', targetTelegramId)
      .select()
      .single()

    if (error || !user) {
      return ctx.editMessageText('❌ Usuario no encontrado.', { parse_mode: 'HTML' })
    }

    await bot.telegram.sendMessage(
      targetTelegramId,
      `🎉 <b>¡Tu suscripción está activa!</b>\n\n` +
      `✅ Acceso completo por <b>30 días</b>\n` +
      `📅 Vence: ${ends.toLocaleDateString('es-PE')}\n\n` +
      `Recibirás alertas cada mañana con los mejores remates de Lima.\n` +
      `Usa /filtros para personalizar tus preferencias.`,
      { parse_mode: 'HTML' }
    ).catch(() => {})

    await ctx.editMessageText(
      `✅ <b>${user.first_name} reactivado</b>\n` +
      `📅 Vence: ${ends.toLocaleDateString('es-PE')} (30 días)`,
      { parse_mode: 'HTML' }
    )
  })

  // /myid — diagnóstico
  bot.command('myid', async (ctx) => {
    await ctx.reply(`Tu Telegram ID: ${ctx.from.id}`)
  })

  // /activar <telegram_id> [dias]
  bot.command('activar', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
      await ctx.reply(`⛔ No autorizado. Tu ID: ${ctx.from.id} | Admin esperado: ${ADMIN_ID}`)
      return
    }

    const args      = ctx.message.text.trim().split(/\s+/)
    const targetId  = parseInt(args[1])
    const days      = parseInt(args[2]) || 30

    if (!targetId) return ctx.reply('Uso: /activar <telegram_id> [días]')

    try {
      const sb  = getSupabase()
      const ends = new Date()
      ends.setDate(ends.getDate() + days)

      const { data: user, error } = await sb
        .from('remaju_users')
        .update({
          subscription_status:  'active',
          subscription_ends_at: ends.toISOString(),
          active: true
        })
        .eq('telegram_id', targetId)
        .select()
        .single()

      if (error || !user) return ctx.reply(`❌ Usuario ${targetId} no encontrado`)

      // Notificar al usuario
      await bot.telegram.sendMessage(
        targetId,
        `🎉 <b>¡Tu suscripción está activa!</b>\n\n` +
        `✅ Acceso completo por <b>${days} días</b>\n` +
        `📅 Vence: ${ends.toLocaleDateString('es-PE')}\n\n` +
        `Recibirás alertas cada mañana con los mejores remates de Lima.\n` +
        `Usa /filtros para personalizar qué tipo de propiedades te interesan.`,
        { parse_mode: 'HTML' }
      ).catch(() => {})

      await ctx.replyWithHTML(
        `✅ <b>Activado</b>\n` +
        `👤 ${user.first_name} (ID: ${targetId})\n` +
        `📅 Vence: ${ends.toLocaleDateString('es-PE')} (${days} días)`
      )
    } catch (err) {
      logger.error('Error en /activar', { error: err.message })
      await ctx.reply(`Error: ${err.message}`)
    }
  })

  // /desactivar <telegram_id>
  bot.command('desactivar', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return

    const args     = ctx.message.text.trim().split(/\s+/)
    const targetId = parseInt(args[1])
    if (!targetId) return ctx.reply('Uso: /desactivar <telegram_id>')

    const sb = getSupabase()
    const { data: user } = await sb
      .from('remaju_users')
      .update({ subscription_status: 'cancelled', active: false })
      .eq('telegram_id', targetId)
      .select()
      .single()

    if (!user) return ctx.reply(`❌ Usuario ${targetId} no encontrado`)
    await ctx.reply(`✅ Usuario ${user.first_name} (${targetId}) desactivado`)
  })

  // /usuarios — listado de usuarios
  bot.command('usuarios', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return

    const sb = getSupabase()
    const { data: users } = await sb
      .from('remaju_users')
      .select('telegram_id, first_name, telegram_username, subscription_status, trial_ends_at, subscription_ends_at, created_at')
      .order('created_at', { ascending: false })
      .limit(25)

    if (!users?.length) return ctx.reply('Sin usuarios registrados aún.')

    const lines = users.map(u => {
      const now  = new Date()
      const end  = u.subscription_status === 'active'
        ? u.subscription_ends_at ? new Date(u.subscription_ends_at) : null
        : u.trial_ends_at        ? new Date(u.trial_ends_at)        : null
      const days = end ? Math.ceil((end - now) / 86400000) : null
      const emoji = u.subscription_status === 'active' ? '✅'
        : u.subscription_status === 'trial' && days > 0 ? '🕐' : '❌'

      return `${emoji} ${u.first_name} (@${u.telegram_username || '?'}) — ${days !== null ? days + 'd' : '?'}`
    })

    await ctx.replyWithHTML(
      `<b>👥 Usuarios (${users.length}):</b>\n\n` + lines.join('\n') + '\n\n' +
      `<i>Activar: /activar &lt;id&gt; [días]</i>`
    )
  })

  // /stats — estadísticas rápidas
  bot.command('stats', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return

    const sb = getSupabase()
    const { data: users } = await sb.from('remaju_users').select('subscription_status, trial_ends_at, subscription_ends_at')

    const now    = new Date()
    const total  = users?.length || 0
    const active = users?.filter(u => u.subscription_status === 'active' && (!u.subscription_ends_at || new Date(u.subscription_ends_at) > now)).length || 0
    const trial  = users?.filter(u => u.subscription_status === 'trial'  && (!u.trial_ends_at || new Date(u.trial_ends_at) > now)).length || 0
    const expired = total - active - trial

    await ctx.replyWithHTML(
      `📈 <b>Estadísticas REMAJU SaaS</b>\n\n` +
      `👥 Total usuarios: <b>${total}</b>\n` +
      `✅ Activos (pago): <b>${active}</b>\n` +
      `🕐 En prueba:      <b>${trial}</b>\n` +
      `❌ Vencidos:       <b>${expired}</b>\n\n` +
      `💰 MRR est.: <b>S/ ${(active * parseInt(PRICE_SOLES)).toLocaleString('es-PE')}</b>`
    )
  })

  return bot
}

module.exports = { createBot, isUserActive, getSupabase }
