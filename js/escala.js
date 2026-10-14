// ---------------------------------------------------------------------------
// Escala da interface: o usuário escolhe o quanto o editor (janela + fontes)
// cresce. Sem imports de propósito: as regras de passo e de limite por janela
// são puras e testáveis em Node; quem toca no DOM é orpen-bridge.js.
//
// 1 = tamanho de sempre (o painel já nasce com zoom 1.15 em css/styles.css).
// O valor chega ao CSS como a variável --ed-k, posta no host do Shadow DOM
// (só o bridge da extensão escreve; na standalone vale 1). O painel principal usa `zoom` (ver o comentário
// longo do .bv-panel); as janelas satélites (menu, diálogos, busca, dropdowns,
// toasts) usam transform: scale(var(--ed-k)), que não passa pelo bug do
// Chromium de centralizar um item com zoom.
// ---------------------------------------------------------------------------

export const PASSOS = [1, 1.25, 1.5, 1.75];

// Zoom que o painel principal já tinha antes do controle existir.
export const ZOOM_BASE = 1.15;

// Medidas do painel ANTES do zoom: abaixo disso as duas colunas
// (Condições | Ações) ficam apertadas demais e o corpo quase não rola.
const LARGURA_MIN_PAINEL = 720;
const ALTURA_MIN_PAINEL = 380;

// Mesmos limites do .bv-panel em css/styles.css (92vw / 1320px / 91vh).
const FRACAO_LARGURA = 0.92;
const LARGURA_MAX_PX = 1320;
const FRACAO_ALTURA = 0.91;

/** Aceita número ou texto e devolve o passo válido mais próximo (padrão 1). */
export function normalizarEscala(valor) {
  const n = typeof valor === 'number' ? valor : parseFloat(valor);
  if (!Number.isFinite(n)) return 1;
  return PASSOS.reduce((melhor, p) => (Math.abs(p - n) < Math.abs(melhor - n) ? p : melhor), PASSOS[0]);
}

/** Maior passo que ainda deixa o painel com o mínimo de largura e altura. */
export function maiorPassoPermitido(larguraJanela, alturaJanela) {
  let maior = PASSOS[0];
  for (const k of PASSOS) {
    const zoom = ZOOM_BASE * k;
    const largura = Math.min(larguraJanela * FRACAO_LARGURA, LARGURA_MAX_PX * k) / zoom;
    const altura = (alturaJanela * FRACAO_ALTURA) / zoom;
    if (largura < LARGURA_MIN_PAINEL || altura < ALTURA_MIN_PAINEL) break;
    maior = k;
  }
  return maior;
}

/** A preferência salva, limitada pelo que a janela comporta agora. */
export function escalaEfetiva(preferida, larguraJanela, alturaJanela) {
  return Math.min(normalizarEscala(preferida), maiorPassoPermitido(larguraJanela, alturaJanela));
}

/** Próximo passo (direcao +1) ou anterior (-1); null se não há. Respeita o teto. */
export function passoAdjacente(atual, direcao, teto = PASSOS[PASSOS.length - 1]) {
  const i = PASSOS.indexOf(normalizarEscala(atual));
  const alvo = PASSOS[i + (direcao < 0 ? -1 : 1)];
  if (alvo === undefined || alvo > teto) return null;
  return alvo;
}

export function rotuloEscala(k) {
  return `${Math.round(k * 100)}%`;
}

// ---- Preferência salva -----------------------------------------------------
// Mesmo esquema do tema: chrome.storage.local da extensão (vale para todos os
// ambientes e a página da Orpen não consegue apagar) e localStorage como
// reserva. Os dois armazenamentos entram por parâmetro para testar sem navegador.
export const CHAVE_ESCALA = 'editorbot:escala';

/** Lê a preferência. chrome.storage vence; sem ele (ou vazio), vale o localStorage; senão 100%. */
export async function lerPreferencia({ chromeLocal, webStorage } = {}) {
  try {
    const salvo = (await chromeLocal.get(CHAVE_ESCALA))[CHAVE_ESCALA];
    if (salvo !== undefined) return normalizarEscala(salvo);
  } catch {
    // sem chrome.storage (contexto invalidado): segue para a reserva
  }
  try {
    return normalizarEscala(webStorage.getItem(CHAVE_ESCALA));
  } catch {
    return 1;
  }
}

/** Grava nos dois; uma falha não impede a outra. Devolve true se algum gravou. */
export async function gravarPreferencia(valor, { chromeLocal, webStorage } = {}) {
  const passo = normalizarEscala(valor);
  let gravou = false;
  try {
    await chromeLocal.set({ [CHAVE_ESCALA]: passo });
    gravou = true;
  } catch {
    // contexto invalidado ou sem permissão: o localStorage ainda guarda
  }
  try {
    webStorage.setItem(CHAVE_ESCALA, String(passo));
    gravou = true;
  } catch {
    // sem localStorage (bloqueado pela página)
  }
  return gravou;
}

// Estado lido pelos módulos que posicionam coisas por coordenada (dropdowns).
let escalaAtual = 1;

export function definirEscalaAtual(k) {
  escalaAtual = normalizarEscala(k);
}

export function obterEscala() {
  return escalaAtual;
}
