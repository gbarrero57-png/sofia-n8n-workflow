# Tests JS

Tests de integración que se ejecutan directamente contra la API de n8n y Supabase.
Requieren Node.js y las credenciales en `saas/.env`.

## Archivos
- `test_all_roles.js` — Verifica roles y permisos de usuarios
- `test_doctors_e2e.mjs` — Tests E2E de doctores (KB sync, list_doctors RPC, isolación)
- `test_patients_full.js` — Tests completos de pacientes
- `test_payments_e2e.js` — Tests de pagos
- `test_resolve.js` — Tests de resolve_clinic RPC

## Cómo correr
```bash
node scripts/tests/test_doctors_e2e.mjs
```
