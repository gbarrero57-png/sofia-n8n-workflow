#!/usr/bin/env node
/**
 * apply_migration_027.js
 * Applies migration 027: clinical_events table + bot-callable RPC functions
 * Already executed on 2026-03-26. Run only to re-apply on fresh DB.
 * Usage: SUPABASE_SERVICE_KEY=xxx node scripts/ops/apply_migration_027.js
 */
const fs   = require('fs');
const path = require('path');

const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SERVICE_KEY) { console.error('SUPABASE_SERVICE_KEY required'); process.exit(1); }

const sqlFile = path.join(__dirname, '../../supabase/migrations/027_patient_clinical_history.sql');
const sql = fs.readFileSync(sqlFile, 'utf8');
console.log('Migration 027 SQL ready (' + sql.length + ' chars).');
console.log('Execute via Supabase Dashboard SQL editor or: psql $DATABASE_URL < ' + sqlFile);
