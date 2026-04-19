#!/usr/bin/env node
/**
 * apply_migration_035.mjs
 * Prints the SQL for migration 035 and instructions for manual application.
 * This migration adds p_update_activity flag to upsert_conversation so
 * outgoing SofIA messages don't reset last_activity_at (re-engagement fix).
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, '../../supabase/migrations/035_upsert_conversation_activity_flag.sql');

console.log('\n========== Migration 035 ==========');
console.log('Purpose: Fix re-engagement — outgoing SofIA messages no longer reset last_activity_at');
console.log('\nSQL to apply in Supabase SQL Editor:\n');
console.log(readFileSync(sqlPath, 'utf8'));
console.log('\nInstructions:');
console.log('1. Go to https://supabase.com/dashboard/project/inhyrrjidhzrbqecnptn/sql/new');
console.log('2. Paste the SQL above and run it');
console.log('3. Then run: node scripts/patch_reengagement_activity.mjs');
console.log('=====================================\n');
