import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

const args = process.argv.slice(2);
function getArg(name) {
  const found = args.find(a => a.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : null;
}

const cwd = process.cwd();
const projectDir = path.join(cwd, '.project');
const deliveryDir = path.join(projectDir, 'delivery');

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   PROJECT LIFECYCLE — Inicialização      ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const name     = getArg('name')     || await ask(rl, '📌 Nome do projeto: ');
  const client   = getArg('client')   || await ask(rl, '👤 Cliente / Stakeholder: ');
  const type     = getArg('type')     || await ask(rl, '🔧 Tipo [feature / integration / full]: ');
  const stack    = getArg('stack')    || await ask(rl, '⚙️  Stack tecnológica (ex: Node.js + n8n): ');
  const delivery = getArg('delivery') || await ask(rl, '📅 Data de entrega prevista (DD/MM/YYYY): ');
  const desc     = getArg('desc')     || await ask(rl, '📝 Descrição curta do projeto: ');

  rl.close();

  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(deliveryDir, { recursive: true });

  const now   = new Date().toLocaleString('pt-BR');
  const today = new Date().toLocaleDateString('pt-BR');

  // Criar meta.md
  const metaTemplate = fs.readFileSync(path.join(TEMPLATES_DIR, 'project-meta.template.md'), 'utf8');
  const metaContent = metaTemplate
    .replace(/{{name}}/g, name)
    .replace(/{{client}}/g, client)
    .replace(/{{type}}/g, type)
    .replace(/{{stack}}/g, stack)
    .replace(/{{delivery}}/g, delivery)
    .replace(/{{desc}}/g, desc)
    .replace(/{{date}}/g, today)
    .replace(/{{created_at}}/g, now);

  const metaPath = path.join(projectDir, 'meta.md');
  if (!fs.existsSync(metaPath)) {
    fs.writeFileSync(metaPath, metaContent, 'utf8');
    console.log('[✓] .project/meta.md criado');
  } else {
    console.log('[~] .project/meta.md já existe — mantido sem alteração');
  }

  // Criar log.md
  const logTemplate = fs.readFileSync(path.join(TEMPLATES_DIR, 'log.template.md'), 'utf8');
  const logContent = logTemplate
    .replace(/{{name}}/g, name)
    .replace(/{{created_at}}/g, now);

  const logPath = path.join(projectDir, 'log.md');
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, logContent, 'utf8');
    console.log('[✓] .project/log.md criado');
  } else {
    console.log('[~] .project/log.md já existe — mantido sem alteração');
  }

  console.log('');
  console.log(`✅ Projeto "${name}" inicializado com sucesso!`);
  console.log(`   Diretório: ${projectDir}`);
  console.log('');
  console.log('📋 Próximos passos sugeridos:');
  if (type === 'integration' || type === 'full') {
    console.log('  → Ative a skill spec-driven-integration para modelar o integration.spec.yaml');
  }
  if (type === 'feature' || type === 'full') {
    console.log('  → Ative a skill spec-driven para especificar as features (US, AC, T)');
  }
  console.log('  → Use execution-log.mjs add para registrar decisões e progresso');
  console.log('  → Use delivery-doc.mjs ao final para gerar a documentação de entrega');
}

main().catch(console.error);