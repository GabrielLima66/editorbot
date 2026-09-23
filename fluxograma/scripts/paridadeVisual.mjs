// Paridade VISUAL com o desktop (Fase 2 da spec). Para cada golden:
//   - lado desktop: abre Fluxo BOT/frontend/dist/index.html (o build real
//     do app, em modo "previa sem ponte Python") servindo o grafo que o
//     Python gerou, e chama a propria captura do desktop
//     (window.fluxobotCapturarDiagrama, exportar.ts);
//   - lado extensao: abre vendor/fluxograma/index.html num iframe, faz o
//     mesmo handshake que a extensao fara e pede o PNG do bot BRUTO (o port
//     TS roda o pipeline inteiro).
// Os dois PNGs sao comparados pixel a pixel. Mesmo Chromium dos dois lados,
// entao qualquer diferenca e do port/render, nao do motor.
//
// Uso: npm run paridade:visual [-- filtro]   (saida em tests/visual_out/)
import { mkdirSync, readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const FLUXO_BOT = process.env.FLUXO_BOT ?? "C:/Users/RCX/Desktop/Fluxo BOT";
const DESKTOP_HTML = join(FLUXO_BOT, "frontend", "dist", "index.html");
const VENDOR = join(RAIZ, "..", "vendor", "fluxograma");
const SAIDA = join(RAIZ, "tests", "visual_out");
const filtro = process.argv[2] ?? "";
const FORMATO = process.env.PARIDADE_FORMATO ?? "png";

const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

function goldens() {
  const lista = [];
  for (const [pasta, pastaFix] of [
    ["golden", "fixtures"],
    ["golden_local", join("golden_local", "fixtures")],
  ]) {
    const dir = join(RAIZ, "tests", pasta);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).sort()) {
      if (!f.endsWith(".json") || f === "erros.json" || !f.includes(filtro)) continue;
      const g = JSON.parse(readFileSync(join(dir, f), "utf-8"));
      g.arquivo = f;
      g.bot = JSON.parse(readFileSync(join(RAIZ, "tests", pastaFix, g.fixture), "utf-8"));
      lista.push(g);
    }
  }
  return lista;
}

// Mesma conversao de tests/apoio.ts (nomesComoDadoReal): na extensao o nome
// do ambiente e dado real do no, nao override manual. O desktop recebe o
// grafo ja nesse formato, entao a comparacao continua sendo do DESENHO.
function esperado(golden) {
  const r = structuredClone(golden.resultado);
  if (!golden.nomes) return r;
  for (const { data: d } of r.nodes) {
    if (typeof d.overrideRotulo !== "string") continue;
    if (d.tipo === "fila" || d.tipo === "bot_externo") d.rotulo = d.overrideRotulo;
    else if (d.tipo === "calendario") {
      d.rotulo = d.overrideRotulo;
      d.naoResolvida = false;
    } else continue;
    delete d.overrideRotulo;
  }
  return r;
}

async function capturaDesktop(contexto, golden) {
  const pagina = await contexto.newPage();
  await pagina.route("http://desktop.local/**", async (rota) => {
    const caminho = new URL(rota.request().url()).pathname;
    if (caminho === "/" || caminho === "/index.html") {
      return rota.fulfill({ contentType: "text/html", body: readFileSync(DESKTOP_HTML) });
    }
    if (caminho === "/fixtures/_indice.json") return rota.fulfill({ json: ["alvo.json"] });
    if (caminho === "/fixtures/alvo.json") {
      // No app real o grafo chega segundos depois (usuario abre o arquivo):
      // da tempo da Inter carregar antes do layout medir os cards.
      await new Promise((r) => setTimeout(r, 1500));
      return rota.fulfill({ json: { ...esperado(golden), botNome: golden.bot.NAME } });
    }
    return rota.fulfill({ status: 404, body: "" });
  });
  await pagina.goto("http://desktop.local/");
  const esperadas = esperado(golden).edges.length;
  await pagina.waitForFunction(
    (n) => typeof window.fluxobotCapturarDiagrama === "function" && document.querySelectorAll(".react-flow__edge").length >= n,
    esperadas,
    { timeout: 60_000 },
  );
  const { dataUrl, interOk } = await pagina.evaluate(async (formato) => {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return {
      interOk: document.fonts.check("400 13px Inter") && document.fonts.check("500 11px Inter"),
      dataUrl: await window.fluxobotCapturarDiagrama(formato),
    };
  }, FORMATO);
  await pagina.close();
  const corpo = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return { png: FORMATO === "png" ? Buffer.from(corpo, "base64") : Buffer.from(decodeURIComponent(corpo), "utf-8"), interOk };
}

async function capturaExtensao(contexto, golden) {
  const pagina = await contexto.newPage();
  await pagina.route("http://extensao.local/**", (rota) => {
    const caminho = new URL(rota.request().url()).pathname;
    if (caminho === "/harness.html") return rota.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" });
    const arquivo = join(VENDOR, caminho === "/" ? "index.html" : caminho);
    if (!existsSync(arquivo)) return rota.fulfill({ status: 404, body: "" });
    return rota.fulfill({ contentType: TIPOS[extname(arquivo)] ?? "application/octet-stream", body: readFileSync(arquivo) });
  });
  await pagina.goto("http://extensao.local/harness.html");
  const resposta = await pagina.evaluate(
    async ({ bot, nomes, formato }) => {
      // getRandomValues (nao randomUUID): funciona tambem fora de https
      const nonce = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
      const iframe = document.createElement("iframe");
      // variante (b) da Fase 0: na tela, invisivel
      iframe.style.cssText = "position:fixed;left:0;top:0;width:1280px;height:800px;border:0;opacity:0;pointer-events:none";
      iframe.src = `/index.html#n=${nonce}`;
      await new Promise((r) => {
        iframe.onload = r;
        document.body.appendChild(iframe);
      });
      const canal = new MessageChannel();
      const mensagens = [];
      const final = new Promise((resolve) => {
        canal.port1.onmessage = (ev) => {
          mensagens.push(ev.data.tipo === "progresso" ? ev.data.etapa : ev.data.tipo);
          if (ev.data.tipo === "conectado") {
            canal.port1.postMessage({ tipo: "gerar", id: 1, bot, formato, nomesAmbiente: nomes ?? null });
          }
          if (ev.data.tipo === "pronto" || ev.data.tipo === "erro") resolve(ev.data);
        };
      });
      iframe.contentWindow.postMessage({ tipo: "conectar", nonce }, location.origin, [canal.port2]);
      const r = await final;
      if (r.tipo === "erro") return { erro: r.mensagem, mensagens };
      let bin = "";
      const bytes = new Uint8Array(r.arquivo);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { base64: btoa(bin), mensagens };
    },
    { bot: golden.bot, nomes: golden.nomes, formato: FORMATO },
  );
  await pagina.close();
  if (resposta.erro) throw new Error(`extensao: ${resposta.erro}`);
  return { png: Buffer.from(resposta.base64, "base64"), mensagens: resposta.mensagens };
}

// O texto do SVG carrega estilos do contexto da pagina (tamanho do container,
// idioma, pointer-events) que diferem entre o app desktop e o iframe sem mudar
// nada do desenho. O criterio e o mesmo do PNG: o SVG DESENHADO pelo Chrome
// tem que ser identico pixel a pixel.
async function rasterizarSvg(contexto, buf) {
  const pagina = await contexto.newPage();
  // Servido por rota (nao pelo argumento do evaluate: 15 MB estouram o canal
  // do Playwright) e desenhado via data: URL, como o proprio html-to-image
  // faz - via blob: o Chrome marca o canvas como "tainted" (foreignObject).
  await pagina.route("http://svg.local/**", (rota) => {
    const caminho = new URL(rota.request().url()).pathname;
    if (caminho === "/arquivo.svg") return rota.fulfill({ contentType: "text/plain; charset=utf-8", body: buf });
    return rota.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" });
  });
  await pagina.goto("http://svg.local/");
  const base64 = await pagina.evaluate(async () => {
    const texto = await (await fetch("/arquivo.svg")).text();
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(texto);
    await img.decode();
    // canvas tem limite (16384 px por lado / ~268 Mpx): SVG de bot grande e
    // desenhado em escala menor - a mesma dos dois lados, entao a
    // comparacao continua valida.
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const escala = Math.min(1, 16000 / w, 16000 / h, Math.sqrt(150e6 / (w * h)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(w * escala);
    canvas.height = Math.floor(h * escala);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  });
  await pagina.close();
  return Buffer.from(base64, "base64");
}

async function compararSvg(contexto, nome, bufDesktop, bufExtensao) {
  writeFileSync(join(SAIDA, `${nome}.desktop.svg`), bufDesktop);
  writeFileSync(join(SAIDA, `${nome}.extensao.svg`), bufExtensao);
  const r = comparar(`${nome}.svg`, await rasterizarSvg(contexto, bufDesktop), await rasterizarSvg(contexto, bufExtensao));
  return { ...r, detalhe: `${r.detalhe} (SVG desenhado)` };
}

function comparar(nome, bufDesktop, bufExtensao) {
  const a = PNG.sync.read(bufDesktop);
  const b = PNG.sync.read(bufExtensao);
  writeFileSync(join(SAIDA, `${nome}.desktop.png`), bufDesktop);
  writeFileSync(join(SAIDA, `${nome}.extensao.png`), bufExtensao);
  if (a.width !== b.width || a.height !== b.height) {
    return { ok: false, detalhe: `tamanho diferente: desktop ${a.width}x${a.height}, extensao ${b.width}x${b.height}` };
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const diferentes = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0 });
  if (diferentes > 0) writeFileSync(join(SAIDA, `${nome}.diff.png`), PNG.sync.write(diff));
  return { ok: diferentes === 0, detalhe: `${a.width}x${a.height}, ${diferentes} px diferentes` };
}

mkdirSync(SAIDA, { recursive: true });
if (!existsSync(DESKTOP_HTML)) throw new Error(`build do desktop nao encontrado: ${DESKTOP_HTML}`);
if (!existsSync(join(VENDOR, "index.html"))) throw new Error("rode `npm run build` antes (vendor/fluxograma vazio)");

// Chrome instalado (o mesmo navegador onde a extensao roda) por padrao;
// PARIDADE_CANAL=chromium usa o Chromium baixado pelo Playwright.
const canal = process.env.PARIDADE_CANAL ?? "chrome";
const navegador = await chromium.launch(canal === "chromium" ? {} : { channel: canal });
console.log(`Navegador: ${canal} ${navegador.version()}\n`);
const contexto = await navegador.newContext({ viewport: { width: 1400, height: 860 } });
let falhas = 0;
for (const golden of goldens()) {
  const nome = golden.arquivo.replace(/\.json$/, "");
  try {
    const desktop = await capturaDesktop(contexto, golden);
    const extensao = await capturaExtensao(contexto, golden);
    const r = FORMATO === "png" ? comparar(nome, desktop.png, extensao.png) : await compararSvg(contexto, nome, desktop.png, extensao.png);
    if (!r.ok) falhas++;
    const avisoFonte = desktop.interOk ? "" : " (AVISO: Inter nao carregada no lado desktop)";
    console.log(`${r.ok ? "OK  " : "DIFF"} ${nome.padEnd(55)} ${r.detalhe}${avisoFonte}`);
  } catch (e) {
    falhas++;
    console.log(`ERRO ${nome.padEnd(55)} ${e.message.split("\n")[0]}`);
  }
}
await navegador.close();
console.log(falhas === 0 ? "\nTodos identicos ao desktop." : `\n${falhas} com diferenca. Imagens em ${SAIDA}`);
process.exit(falhas === 0 ? 0 : 1);
