import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

const args = process.argv.slice(2);
function getArg(name) {
  const found = args.find(a => a.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : null;
}

const cwd = process.cwd();
const projectDir  = path.join(cwd, '.project');
const deliveryDir = path.join(projectDir, 'delivery');
const specDir     = path.join(cwd, '.spec');

function readFile(filePath, fallback = '_Não disponível._') {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : fallback;
}

function collectFeatures() {
  const featuresDir = path.join(specDir, 'features');
  if (!fs.existsSync(featuresDir)) return [];
  return fs.readdirSync(featuresDir).filter(f =>
    fs.statSync(path.join(featuresDir, f)).isDirectory()
  );
}

function generate() {
  console.log('[delivery-doc] 🚀 Gerando documentação de entrega...');
  console.log('');

  const metaPath = path.join(projectDir, 'meta.md');
  if (!fs.existsSync(metaPath)) {
    console.error('[delivery-doc] ❌ .project/meta.md não encontrado. Execute project-init.mjs primeiro.');
    process.exit(1);
  }

  fs.mkdirSync(deliveryDir, { recursive: true });

  const meta = readFile(metaPath);
  const log  = readFile(path.join(projectDir, 'log.md'), '_Nenhuma entrada no log de execução._');

  const timestamp  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputName = getArg('output') || `${timestamp}-delivery`;
  const outputPath = path.join(deliveryDir, `${outputName}.md`);

  // Coletar features do spec-driven
  const features = collectFeatures();
  let featuresContent = '';
  if (features.length > 0) {
    for (const feature of features) {
      const featureDir     = path.join(specDir, 'features', feature);
      const specContent    = readFile(path.join(featureDir, 'spec.md'));
      const designContent  = readFile(path.join(featureDir, 'design.md'));
      const tasksContent   = readFile(path.join(featureDir, 'tasks.md'));
      featuresContent += `\n## Feature: \`${feature}\`\n\n`;
      featuresContent += `### Especificação (US / AC)\n\n${specContent}\n\n`;
      featuresContent += `### Design Técnico\n\n${designContent}\n\n`;
      featuresContent += `### Backlog de Tarefas\n\n${tasksContent}\n\n---\n`;
    }
  } else {
    featuresContent = '_Nenhuma feature especificada via skill spec-driven._\n';
  }

  // Contrato de integração
  const integrationPath = path.join(cwd, 'integration.spec.yaml');
  const integrationContent = fs.existsSync(integrationPath)
    ? '```yaml\n' + fs.readFileSync(integrationPath, 'utf8') + '\n```'
    : '_Nenhum contrato de integração encontrado (integration.spec.yaml)._';

  // Montar documento final
  const template = fs.readFileSync(path.join(TEMPLATES_DIR, 'delivery.template.md'), 'utf8');
  const deliveryContent = template
    .replace('{{meta}}',         meta)
    .replace('{{features}}',     featuresContent)
    .replace('{{integration}}',  integrationContent)
    .replace('{{log}}',          log)
    .replace('{{generated_at}}', new Date().toLocaleString('pt-BR'));

  fs.writeFileSync(outputPath, deliveryContent, 'utf8');

  const lineCount = deliveryContent.split('\n').length;
  console.log(`[delivery-doc] ✅ Documentação de entrega gerada:`);
  console.log(`   📄 ${outputPath}`);
  console.log(`   📊 ${lineCount} linhas | ${features.length} feature(s) | log incluído`);
}

generate();