import { readFileSync, writeFileSync } from 'fs';

const d = JSON.parse(readFileSync('C:/Users/Barbara/Documents/n8n_workflow_claudio/saas/sofia_workflow_backup.json','utf8'));

// FIX 1: Preparar Prompt INFO — remove numbered options, humanize
const infoNode = d.nodes.find(n => n.name === 'Preparar Prompt INFO');
const NEW_INFO_CODE = readFileSync('C:/Users/Barbara/Documents/n8n_workflow_claudio/scripts/patch_info_code.js','utf8');
infoNode.parameters.jsCode = NEW_INFO_CODE;

// FIX 2: Pre-Clasificador — add vague INFO + fix menu digit context
const preNode = d.nodes.find(n => n.name === 'Pre-Clasificador Keywords');
const NEW_PRE_CODE = readFileSync('C:/Users/Barbara/Documents/n8n_workflow_claudio/scripts/patch_pre_code.js','utf8');
preNode.parameters.jsCode = NEW_PRE_CODE;

// FIX 3: Generar Texto Menu — add _last_message_was_menu flag
const menuNode = d.nodes.find(n => n.name === 'Generar Texto Menu');
menuNode.parameters.jsCode = menuNode.parameters.jsCode.replace(
  'return [{ json: Object.assign({}, ctx, { menu_text: menuText, menu_options: options }) }];',
  'return [{ json: Object.assign({}, ctx, { menu_text: menuText, menu_options: options, _last_message_was_menu: true }) }];'
);

writeFileSync('C:/Users/Barbara/Documents/n8n_workflow_claudio/saas/sofia_workflow_patched.json', JSON.stringify(d, null, 2));
console.log('Patched OK');
console.log('INFO has numbered options:', infoNode.parameters.jsCode.includes('opciones numeradas'));
console.log('PRE has vague info:', preNode.parameters.jsCode.includes('VAGUE_INFO_DETECTOR'));
console.log('MENU has flag:', menuNode.parameters.jsCode.includes('_last_message_was_menu: true'));
