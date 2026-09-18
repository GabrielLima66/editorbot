import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const command = args[0] || 'help';

function getArg(name) {
  const found = args.find(a => a.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : null;
}

const cwd = process.cwd();
const logPath = path.join(cwd, '.project', 'log.md');

const CATEGORIES = {
  decision:   '🔵 DECISÃO',
  progress:   '🟢 PROGRESSO',
  issue:      '🔴 PROBLEMA',
  assumption: '🟡 SUPOSIÇÃO',
  milestone:  '🏁 MARCO',
  note:       '📝 NOTA',
};

function ensureLog() {
  if (!fs.existsSync(logPath)) {
    console.error('[execution-log] ❌ .project/log.md não encontrado.');
    console.error('   Execute primeiro: node project-init.mjs');
    process.exit(1);
  }
}

function addEntry() {
  ensureLog();

  const event    = getArg('event')    || args.slice(1).filter(a => !a.startsWith('--')).join(' ');
  const category = getArg('category') || 'note';
  const ref      = getArg('ref')      || '';

  if (!event || event.trim() === '') {
    console.error('[execution-log] Uso: node execution-log.mjs add --event="Descrição" [--category=decision|progress|issue|assumption|milestone|note] [--ref=AC-001]');
    process.exit(1);
  }

  const label  = CATEGORIES[category] || CATEGORIES.note;
  const now    = new Date().toLocaleString('pt-BR');
  const refStr = ref ? ` \`${ref}\`` : '';

  const entry = `\n### ${now} — ${label}${refStr}\n\n${event.trim()}\n\n---`;

  const content = fs.readFileSync(logPath, 'utf8');
  const marker  = '<!-- LOG_ENTRIES -->';

  const updated = content.includes(marker)
    ? content.replace(marker, `${marker}${entry}`)
    : content + entry;

  fs.writeFileSync(logPath, updated, 'utf8');
  console.log(`[execution-log] ✅ Registrado: [${label}]${refStr} — ${event.trim().slice(0, 60)}${event.length > 60 ? '...' : ''}`);
}

function listEntries() {
  ensureLog();
  const content = fs.readFileSync(logPath, 'utf8');
  const entries = content.match(/^###.+/gm) || [];
  if (entries.length === 0) {
    console.log('[execution-log] Nenhuma entrada registrada ainda.');
    return;
  }
  const last = Math.min(10, entries.length);
  console.log(`\n📋 Últimas ${last} entradas:\n`);
  entries.slice(-last).forEach(e => console.log('  ' + e));
}

function showStatus() {
  ensureLog();
  const content = fs.readFileSync(logPath, 'utf8');
  console.log('\n📊 Status do Log de Execução:\n');
  for (const [key, label] of Object.entries(CATEGORIES)) {
    const regex = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const count = (content.match(regex) || []).length;
    if (count > 0) console.log(`  ${label}: ${count}`);
  }
  console.log('');
}

function help() {
  console.log(`
execution-log — Diário de Bordo do Projeto

Uso:
  node execution-log.mjs add --event="Descrição" [--category=<tipo>] [--ref=AC-001]
  node execution-log.mjs list
  node execution-log.mjs status

Categorias disponíveis:
  decision    Decisão técnica ou de negócio tomada
  progress    Progresso em tarefa ou etapa
  issue       Problema identificado
  assumption  Suposição adotada (ASM-xxx)
  milestone   Marco ou entrega atingida
  note        Nota genérica (padrão)

Exemplos:
  node execution-log.mjs add --event="Decidimos usar form-data no egress" --category=decision --ref=AC-003
  node execution-log.mjs add --event="API do cliente retornou 403 — aguardando novo token" --category=issue
  node execution-log.mjs list
`);
}

if (command === 'add')    addEntry();
else if (command === 'list')   listEntries();
else if (command === 'status') showStatus();
else help();