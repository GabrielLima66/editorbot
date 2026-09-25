// ---------------------------------------------------------------------------
// Aviso de versão nova (DOCUMENTACAO §9). Compara a versão instalada com o
// manifest.json da branch `release` do GitHub (repositório público; a branch
// só avança quando uma versão é fechada) e, se houver uma mais nova, mostra
// no rodapé do editor como atualizar: rodar o Atualizar.bat da pasta da
// extensão. Consulta no máximo uma vez por hora (cache no localStorage da
// página); sem internet ou com erro, simplesmente não mostra nada.
// ---------------------------------------------------------------------------

import { escapeHtml } from './utils.js';
import { criarIcones } from './dom-root.js';

const REPO = 'GabrielLima66/editorbot';
const RAMO = 'release';
const URL_MANIFEST = `https://raw.githubusercontent.com/${REPO}/${RAMO}/manifest.json`;
const URL_NOVIDADES = `https://github.com/${REPO}/blob/${RAMO}/CHANGELOG.md`;
const CHAVE_CACHE = 'editorbot:versao-publicada';
const VALIDADE_MS = 60 * 60 * 1000;

export function compararVersoes(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

function lerCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CHAVE_CACHE) || 'null');
    if (c && Date.now() - c.quando < VALIDADE_MS) return c.versao;
  } catch { /* sem storage: consulta de novo */ }
  return null;
}

function gravarCache(versao) {
  try { localStorage.setItem(CHAVE_CACHE, JSON.stringify({ versao, quando: Date.now() })); } catch { /* ignora */ }
}

/** Versão publicada na branch release, ou null se não deu para saber. */
export async function versaoPublicada() {
  const emCache = lerCache();
  if (emCache) return emCache;
  try {
    const r = await fetch(URL_MANIFEST, { cache: 'no-store' });
    if (!r.ok) return null;
    const versao = (await r.json()).version;
    if (versao) gravarCache(versao);
    return versao || null;
  } catch {
    return null;
  }
}

/** Mostra o aviso ao lado da versão no rodapé, se houver versão nova. */
export async function avisarSeHouverNovaVersao(raiz, versaoAtual) {
  if (!versaoAtual) return;
  const publicada = await versaoPublicada();
  if (!publicada || compararVersoes(publicada, versaoAtual) <= 0) return;
  const alvo = raiz.querySelector('#bv-versao');
  if (!alvo || raiz.querySelector('#bv-atualizacao')) return;
  alvo.insertAdjacentHTML('afterend', `
    <span id="bv-atualizacao" class="bv-atualizacao" title="Para atualizar: dê dois cliques em Atualizar.bat, na pasta da extensão, e recarregue esta página (F5). Se a versão no rodapé não mudar, clique em ↻ no cartão da extensão em chrome://extensions.">
      <i data-lucide="arrow-up-circle"></i>Versão ${escapeHtml(publicada)} disponível: rode o <strong>Atualizar.bat</strong>
      <a href="${URL_NOVIDADES}" target="_blank" rel="noopener">novidades</a>
    </span>`);
  criarIcones();
}
