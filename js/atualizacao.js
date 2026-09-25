// ---------------------------------------------------------------------------
// Aviso de versão nova (DOCUMENTACAO §9). Compara a versão instalada com o
// manifest.json da branch `release` do GitHub (repositório público; a branch
// só avança quando uma versão é fechada) e, se houver uma mais nova, mostra
// no rodapé do editor com o botão "Atualizar agora" (link
// editorbot-atualizar://, registrado pelo atualizar.ps1) e observa a pasta até
// a versão nova chegar. Consulta o GitHub no máximo uma vez por hora (cache no
// localStorage da página); sem internet ou com erro, não mostra nada.
// ---------------------------------------------------------------------------

import { escapeHtml } from './utils.js';
import { criarIcones } from './dom-root.js';

const REPO = 'GabrielLima66/editorbot';
const RAMO = 'release';
const URL_MANIFEST = `https://raw.githubusercontent.com/${REPO}/${RAMO}/manifest.json`;
const URL_NOVIDADES = `https://github.com/${REPO}/blob/${RAMO}/CHANGELOG.md`;
const CHAVE_CACHE = 'editorbot:versao-publicada';
// Com versão nova a avisar, 1 h de cache basta (o aviso já está na tela).
// Sem versão nova, consulta de novo a cada 5 min: senão quem abriu o editor
// pouco antes de uma publicação ficaria até 1 h sem ver o aviso.
const VALIDADE_COM_NOVIDADE_MS = 60 * 60 * 1000;
const VALIDADE_SEM_NOVIDADE_MS = 5 * 60 * 1000;

export function compararVersoes(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

function lerCache(versaoAtual) {
  try {
    const c = JSON.parse(localStorage.getItem(CHAVE_CACHE) || 'null');
    if (!c || !c.versao) return null;
    const novidade = versaoAtual && compararVersoes(c.versao, versaoAtual) > 0;
    const validade = novidade ? VALIDADE_COM_NOVIDADE_MS : VALIDADE_SEM_NOVIDADE_MS;
    if (Date.now() - c.quando < validade) return c.versao;
  } catch { /* sem storage: consulta de novo */ }
  return null;
}

function gravarCache(versao) {
  try { localStorage.setItem(CHAVE_CACHE, JSON.stringify({ versao, quando: Date.now() })); } catch { /* ignora */ }
}

/** Versão publicada na branch release, ou null se não deu para saber. */
export async function versaoPublicada(versaoAtual) {
  const emCache = lerCache(versaoAtual);
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

const LINK_ATUALIZADOR = 'editorbot-atualizar://atualizar';
const INTERVALO_MS = 2000;
const LIMITE_MS = 3 * 60 * 1000;
const DICA_APOS_MS = 20 * 1000;

// Pergunta ao background.js se a pasta já tem versão mais nova que a
// carregada. recarregar:false só consulta; true também recarrega a extensão.
function verificarDisco(recarregar) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ tipo: 'editorbot:verificar-disco', recarregar }, (resp) => {
        resolve(chrome.runtime.lastError ? null : resp);
      });
    } catch { resolve(null); }
  });
}

function concluir(aviso, versao) {
  aviso.innerHTML = `<i data-lucide="refresh-cw"></i>Versão ${escapeHtml(versao)} instalada. Recarregando…`;
  criarIcones();
  verificarDisco(true);
  setTimeout(() => window.location.reload(), 1200);
}

// Depois do clique em "Atualizar agora": o link abre o atualizar.ps1 (fora do
// Chrome) e aqui só observamos a pasta da extensão até a versão nova chegar.
function aguardarAtualizacao(aviso, publicada, temAlteracoesNaoSalvas) {
  const inicio = Date.now();
  let dicaMostrada = false;
  aviso.innerHTML = '<i data-lucide="loader-circle" class="bv-girando"></i>Atualizando… acompanhe na janela do atualizador';
  criarIcones();
  const passo = async () => {
    const resp = await verificarDisco(false);
    if (resp && resp.atualizar) {
      if (temAlteracoesNaoSalvas && temAlteracoesNaoSalvas()) {
        aviso.innerHTML = `<i data-lucide="check-circle"></i>Versão ${escapeHtml(resp.noDisco)} instalada. Salve o bot e clique em <button type="button" class="bv-atualizacao-btn" data-concluir>Concluir</button>`;
        criarIcones();
        aviso.querySelector('[data-concluir]').addEventListener('click', () => {
          if (temAlteracoesNaoSalvas()) {
            aviso.title = 'Ainda há alterações não salvas: salve o bot antes de concluir.';
            aviso.classList.add('bv-atualizacao-alerta');
            return;
          }
          concluir(aviso, resp.noDisco);
        });
        return;
      }
      concluir(aviso, resp.noDisco);
      return;
    }
    const decorrido = Date.now() - inicio;
    if (!dicaMostrada && decorrido > DICA_APOS_MS) {
      dicaMostrada = true;
      aviso.innerHTML = '<i data-lucide="loader-circle" class="bv-girando"></i>Nada aconteceu? Rode o <strong>Atualizar.bat</strong> uma vez na pasta da extensão: ele também ativa este botão.';
      criarIcones();
    }
    if (decorrido > LIMITE_MS) {
      desenharAviso(aviso, publicada, temAlteracoesNaoSalvas);
      return;
    }
    setTimeout(passo, INTERVALO_MS);
  };
  setTimeout(passo, INTERVALO_MS);
}

function desenharAviso(aviso, publicada, temAlteracoesNaoSalvas) {
  aviso.classList.remove('bv-atualizacao-alerta');
  aviso.title = 'O botão abre o atualizador no Windows (o Chrome pede confirmação na primeira vez). Se nada acontecer, rode o Atualizar.bat na pasta da extensão: ele atualiza e ativa o botão.';
  aviso.innerHTML = `
      <i data-lucide="arrow-up-circle"></i>Versão ${escapeHtml(publicada)} disponível
      <a class="bv-atualizacao-btn" href="${LINK_ATUALIZADOR}" data-atualizar>Atualizar agora</a>
      <a href="${URL_NOVIDADES}" target="_blank" rel="noopener">novidades</a>`;
  criarIcones();
  aviso.querySelector('[data-atualizar]').addEventListener('click', () => {
    // O href faz o Chrome abrir o atualizador; daqui em diante só observamos.
    setTimeout(() => aguardarAtualizacao(aviso, publicada, temAlteracoesNaoSalvas), 0);
  });
}

/**
 * Mostra o aviso ao lado da versão no rodapé, se houver versão nova.
 * temAlteracoesNaoSalvas: evita recarregar a página no meio de uma edição.
 */
export async function avisarSeHouverNovaVersao(raiz, versaoAtual, temAlteracoesNaoSalvas) {
  if (!versaoAtual) return;
  const publicada = await versaoPublicada(versaoAtual);
  if (!publicada || compararVersoes(publicada, versaoAtual) <= 0) return;
  const alvo = raiz.querySelector('#bv-versao');
  if (!alvo || raiz.querySelector('#bv-atualizacao')) return;
  alvo.insertAdjacentHTML('afterend', '<span id="bv-atualizacao" class="bv-atualizacao"></span>');
  desenharAviso(raiz.querySelector('#bv-atualizacao'), publicada, temAlteracoesNaoSalvas);
}
