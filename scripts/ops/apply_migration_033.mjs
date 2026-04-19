#!/usr/bin/env node
/**
 * apply_migration_033.mjs
 * Re-applies get_conversations_to_reengage() with message_count >= 1 (was >= 2)
 * Usage: node scripts/ops/apply_migration_033.mjs
 * O manualmente: pega migration 033 en Supabase Dashboard → SQL editor
 */

const SUPABASE_URL = 'https://inhyrrjidhzrbqecnptn.supabase.co';
const SERVICE_KEY  = process.env.N8N_SUPABASE_SERVICE_KEY
  || 'process.env.SUPABASE_SERVICE_KEY';

const sql = `
CREATE OR REPLACE FUNCTION get_conversations_to_reengage()
RETURNS TABLE (
  chatwoot_conversation_id  TEXT,
  chatwoot_account_id       INTEGER,
  chatwoot_inbox_id         INTEGER,
  clinic_id                 UUID,
  clinic_name               TEXT,
  chatwoot_api_token        TEXT,
  patient_name              TEXT,
  phone                     TEXT,
  last_activity_at          TIMESTAMPTZ,
  reminder_type             TEXT,
  reengagement_id           UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cv.chatwoot_conversation_id,
    c.chatwoot_account_id,
    c.chatwoot_inbox_id,
    cv.clinic_id,
    c.name AS clinic_name,
    NULL::TEXT AS chatwoot_api_token,
    cv.patient_name,
    NULL::TEXT AS phone,
    cv.last_activity_at,
    'R1'::TEXT AS reminder_type,
    rr.id AS reengagement_id
  FROM conversations cv
  JOIN clinics c ON c.id = cv.clinic_id
  JOIN conversation_metrics cm
    ON cm.clinic_id = cv.clinic_id
   AND cm.conversation_id = cv.chatwoot_conversation_id::INTEGER
  LEFT JOIN reengagement_reminders rr
    ON rr.clinic_id = cv.clinic_id
   AND rr.chatwoot_conversation_id = cv.chatwoot_conversation_id
  WHERE cv.status = 'active'
    AND cv.bot_paused = false
    AND cm.intent = 'CREATE_EVENT'
    AND cm.booked = false
    AND cm.message_count >= 1
    AND c.active = true
    AND (c.bot_config->>'reengagement_enabled' IS NULL
         OR c.bot_config->>'reengagement_enabled' = 'true')
    AND cv.last_activity_at BETWEEN now() - interval '3 hours'
                                AND now() - interval '1 hour 30 minutes'
    AND (rr.id IS NULL OR (rr.reminder_1_sent = false AND rr.stopped = false))

  UNION ALL

  SELECT
    cv.chatwoot_conversation_id,
    c.chatwoot_account_id,
    c.chatwoot_inbox_id,
    cv.clinic_id,
    c.name,
    NULL::TEXT, cv.patient_name, NULL::TEXT,
    cv.last_activity_at,
    'R2'::TEXT,
    rr.id
  FROM conversations cv
  JOIN clinics c ON c.id = cv.clinic_id
  JOIN conversation_metrics cm
    ON cm.clinic_id = cv.clinic_id
   AND cm.conversation_id = cv.chatwoot_conversation_id::INTEGER
  JOIN reengagement_reminders rr
    ON rr.clinic_id = cv.clinic_id
   AND rr.chatwoot_conversation_id = cv.chatwoot_conversation_id
  WHERE cv.status = 'active'
    AND cv.bot_paused = false
    AND cm.intent = 'CREATE_EVENT'
    AND cm.booked = false
    AND c.active = true
    AND (c.bot_config->>'reengagement_enabled' IS NULL
         OR c.bot_config->>'reengagement_enabled' = 'true')
    AND rr.reminder_1_sent = true
    AND rr.reminder_2_sent = false
    AND rr.stopped = false
    AND cv.last_activity_at BETWEEN now() - interval '26 hours'
                                AND now() - interval '22 hours'

  ORDER BY last_activity_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_conversations_to_reengage() TO service_role;
`;

console.log('Migration 033: fix message_count threshold (>= 2 → >= 1)');
console.log('');
console.log('Supabase REST API no soporta DDL directo.');
console.log('Para aplicar, ve a: https://supabase.com/dashboard/project/inhyrrjidhzrbqecnptn/sql');
console.log('Y ejecuta el SQL de: supabase/migrations/033_reengagement_fix_message_count.sql');
console.log('');
console.log('--- SQL a ejecutar ---');
console.log(sql);
