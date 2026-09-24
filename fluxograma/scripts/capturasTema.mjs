// Capturas do EDITOR (nao do fluxograma) para o tema claro - SPEC-tema-claro.md.
// Abre bot_transform.html (modo standalone, fora da Orpen) com um bot de
// teste, percorre as telas do escopo e tira uma captura de cada. Serve pra:
//   - provar que o tema escuro ficou pixel a pixel igual (Fase 0):
//       node scripts/capturasTema.mjs --tema escuro --saida ref      (antes)
//       node scripts/capturasTema.mjs --tema escuro --comparar ref   (depois)
//   - gerar a previa do tema claro (Fase 1):
//       node scripts/capturasTema.mjs --tema claro
// Saida em tests/tema_out/<saida|tema>/ (fora do git).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const RAIZ_FLUXO = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAIZ_EXT = join(RAIZ_FLUXO, "..");
const FIXTURE = join(RAIZ_FLUXO, "tests", "fixtures", "bot_suporte_financeiro_ouvidoria_v2.json");

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pares, a, i, l) => (a.startsWith("--") ? [...pares, [a.slice(2), l[i + 1]]] : pares), []),
);
const TEMA = args.tema ?? "escuro";
const SAIDA = join(RAIZ_FLUXO, "tests", "tema_out", args.saida ?? TEMA);
const COMPARAR = args.comparar ? join(RAIZ_FLUXO, "tests", "tema_out", args.comparar) : null;

const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png" };

// So pra captura: deixa o painel crescer com o conteudo (sem rolagem
// interna), senao a captura so pega o pedaco visivel. Igual antes e depois,
// entao nao interfere na comparacao.
const CSS_CAPTURA = `
  #bot-view-overlay { position: absolute !important; overflow: visible !important; min-height: 100vh; height: auto !important; }
  #bot-view-overlay .bv-panel { max-height: none !important; }
  #bot-view-overlay .bv-body { overflow: visible !important; }
  *, *::before, *::after { caret-color: transparent !important; }
`;

async function abrirEditor(pagina) {
  await pagina.route("http://editor.local/**", (rota) => {
    const caminho = decodeURIComponent(new URL(rota.request().url()).pathname);
    const arquivo = join(RAIZ_EXT, caminho);
    if (!existsSync(arquivo)) return rota.fulfill({ status: 404, body: "" });
    return rota.fulfill({ contentType: TIPOS[extname(arquivo)] ?? "application/octet-stream", body: readFileSync(arquivo) });
  });
  await pagina.goto("http://editor.local/bot_transform.html");
  await pagina.evaluate((tema) => {
    if (tema === "claro") document.documentElement.dataset.tema = "claro";
    // fluxograma-export.js le chrome.runtime no topo do modulo; aqui so
    // precisamos do dialogo, entao um stub basta.
    window.chrome = { runtime: { getURL: (p) => `http://editor.local/${p}` } };
  }, TEMA);
  await pagina.setInputFiles("#file-input", FIXTURE);
  await pagina.click("#btn-ver-bot");
  await pagina.waitForSelector("#bot-view-overlay:not(.hidden) .estado-wrap");
  await pagina.addStyleTag({ content: CSS_CAPTURA });
}

const capturas = [];
async function capturar(pagina, nome) {
  await pagina.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const arquivo = join(SAIDA, `${nome}.png`);
  await pagina.screenshot({ path: arquivo, fullPage: true, animations: "disabled", caret: "hide" });
  capturas.push(nome);
  console.log(`  ${nome}`);
}

async function roteiro(pagina) {
  await capturar(pagina, "01-geral");

  // Expande os 3 primeiros estados (clique no chevron, que nao e botao/input)
  for (let i = 0; i < 3; i++) await pagina.locator(".estado-wrap .estado-chevron").nth(i).click();
  // Abre o JSON do primeiro menu builder, se houver
  const toggleJson = pagina.locator(".mb-json-toggle").first();
  if (await toggleJson.count()) await toggleJson.click();
  await pagina.mouse.move(0, 0);
  await capturar(pagina, "02-estados-expandidos");

  // Alertas de exclusao: o estado 0 (HOME) e referenciado por outros ->
  // bloqueio; o ultimo estado costuma nao ser -> confirmacao.
  await pagina.locator('[data-action="delete-estado"]').first().click();
  await pagina.locator('[data-action="delete-estado"]').last().click();
  const excluirItem = pagina.locator(".item-delete-btn").first();
  if (await excluirItem.count()) await excluirItem.click();
  await pagina.mouse.move(0, 0);
  await capturar(pagina, "03-alertas");

  // Modal de pendencias (aparece depois do "Baixar JSON" no standalone)
  const download = pagina.waitForEvent("download").catch(() => null);
  await pagina.click("#btn-bv-baixar");
  await download;
  await pagina.waitForSelector("#pendencias-overlay:not(.hidden)", { timeout: 5000 }).catch(() => {});
  await pagina.mouse.move(0, 0);
  await capturar(pagina, "04-pendencias");
  await pagina.evaluate(() => document.querySelector("#btn-pendencias-fechar")?.click());

  // Toast + dialogo "Salvar antes de gerar?"
  await pagina.evaluate(async () => {
    const { mostrarToast } = await import("/js/utils.js");
    mostrarToast("Fluxograma pronto: exemplo.png");
    const { confirmarSalvar } = await import("/js/fluxograma-export.js");
    void confirmarSalvar();
  });
  await pagina.waitForSelector(".mb-toast.mb-toast-show");
  await pagina.waitForSelector("#fluxograma-confirmacao");
  await pagina.mouse.move(0, 0);
  await capturar(pagina, "05-toast-dialogo");
}

function comparar(nome) {
  const a = PNG.sync.read(readFileSync(join(COMPARAR, `${nome}.png`)));
  const b = PNG.sync.read(readFileSync(join(SAIDA, `${nome}.png`)));
  if (a.width !== b.width || a.height !== b.height) {
    return { ok: false, detalhe: `tamanho diferente: ${a.width}x${a.height} -> ${b.width}x${b.height}` };
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0 });
  if (n > 0) writeFileSync(join(SAIDA, `${nome}.diff.png`), PNG.sync.write(diff));
  return { ok: n === 0, detalhe: `${a.width}x${a.height}, ${n} px diferentes` };
}

mkdirSync(SAIDA, { recursive: true });
// GPU off: a rasterizacao por GPU varia 1 unidade de cor em cantos
// arredondados entre execucoes; por software a captura e deterministica.
const navegador = await chromium.launch({
  channel: process.env.PARIDADE_CANAL ?? "chrome",
  args: ["--disable-gpu", "--force-color-profile=srgb"],
});
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true });
const pagina = await contexto.newPage();
const errosConsole = [];
pagina.on("pageerror", (e) => errosConsole.push(e.message));
console.log(`Tema: ${TEMA} -> ${SAIDA}`);
await abrirEditor(pagina);
await roteiro(pagina);
await navegador.close();
if (errosConsole.length) console.log(`\nErros na pagina:\n  ${errosConsole.join("\n  ")}`);

if (COMPARAR) {
  let falhas = 0;
  console.log(`\nComparando com ${COMPARAR}:`);
  for (const nome of capturas) {
    const r = comparar(nome);
    if (!r.ok) falhas++;
    console.log(`${r.ok ? "OK  " : "DIFF"} ${nome.padEnd(24)} ${r.detalhe}`);
  }
  console.log(falhas === 0 ? "\nIdentico a referencia." : `\n${falhas} captura(s) diferente(s).`);
  process.exit(falhas === 0 ? 0 : 1);
}
