// ---------------------------------------------------------------------------
// Exportar fluxograma (SPEC-exportar-fluxograma.md, Fase 3). Carregado só no
// primeiro clique em "Gerar fluxograma" (import dinâmico em orpen-bridge.js).
//
// Fluxo: alteração não salva? → confirmação → salvarBotNaOrpen() → snapshot
// do bot → iframe vendor/fluxograma/ (port do Fluxo BOT, render + captura) →
// download do PNG/SVG + toast. Roda em segundo plano: o editor continua
// utilizável e fechar o modal não cancela a geração.
//
// O iframe fica NA TELA e invisível (opacity 0): fora da tela o Chrome
// congela iframe de outra origem e o fluxograma nunca termina de desenhar
// (Fase 0). A conversa usa um MessageChannel entregue com nonce — scripts da
// página da Orpen não leem o arquivo gerado.
// ---------------------------------------------------------------------------

import { state } from './state.js';
import { $, mostrarToast } from './utils.js';
import { getRootNode } from './dom-root.js';

const PAGINA = chrome.runtime.getURL('vendor/fluxograma/index.html');
const ORIGEM_EXTENSAO = new URL(chrome.runtime.getURL('')).origin;
const TIMEOUT_CONEXAO_MS = 15_000;
const TIMEOUT_GERACAO_MS = 120_000;
const ESTILO_IFRAME =
  'position:fixed;left:0;top:0;width:1280px;height:800px;border:0;opacity:0;pointer-events:none;z-index:0;';

const TEXTO_ETAPA = {
  grafo: 'Montando o fluxograma…',
  layout: 'Organizando…',
  render: 'Desenhando…',
  captura: 'Gerando a imagem…',
};

let conexao = null; // Promise<MessagePort>, reaproveitada entre gerações
let seq = 0;

// getRandomValues (não randomUUID): randomUUID só existe em página https.
function gerarNonce() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function conectar() {
  if (conexao) return conexao;
  conexao = new Promise((resolve, reject) => {
    const nonce = gerarNonce();
    const iframe = document.createElement('iframe');
    iframe.setAttribute('style', ESTILO_IFRAME);
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('tabindex', '-1');
    iframe.title = 'Gerador de fluxograma (Editor de Bot)';
    iframe.src = `${PAGINA}#n=${nonce}`;

    const timeout = setTimeout(() => {
      iframe.remove();
      reject(new Error('o gerador não respondeu'));
    }, TIMEOUT_CONEXAO_MS);

    iframe.addEventListener(
      'load',
      () => {
        const canal = new MessageChannel();
        canal.port1.onmessage = (ev) => {
          if (ev.data?.tipo !== 'conectado') return;
          clearTimeout(timeout);
          canal.port1.onmessage = null;
          resolve(canal.port1);
        };
        iframe.contentWindow.postMessage({ tipo: 'conectar', nonce }, ORIGEM_EXTENSAO, [canal.port2]);
      },
      { once: true }
    );

    // Fora do overlay do editor: continua vivo se o modal for fechado.
    document.body.appendChild(iframe);
  });
  // Falhou? A próxima tentativa cria outro iframe.
  conexao.catch(() => {
    conexao = null;
  });
  return conexao;
}

function pedir(porta, pedido, onEtapa) {
  return new Promise((resolve) => {
    const ouvir = (ev) => {
      const m = ev.data;
      if (m?.id !== pedido.id) return;
      if (m.tipo === 'progresso') {
        onEtapa(m.etapa);
        return;
      }
      clearTimeout(timeout);
      porta.removeEventListener('message', ouvir);
      resolve(m);
    };
    const timeout = setTimeout(() => {
      porta.removeEventListener('message', ouvir);
      resolve({ tipo: 'erro', mensagem: 'o fluxograma demorou demais para ser gerado.' });
    }, TIMEOUT_GERACAO_MS);
    porta.addEventListener('message', ouvir);
    porta.start();
    porta.postMessage(pedido);
  });
}

function mostrarGerando(gerando, texto) {
  const label = $('#btn-bv-fluxograma-label');
  const icone = $('#btn-bv-fluxograma-icon');
  const spinner = $('#btn-bv-fluxograma-spinner');
  if (label) label.textContent = gerando ? texto : 'Gerar fluxograma';
  if (icone) icone.classList.toggle('hidden', gerando);
  if (spinner) spinner.classList.toggle('hidden', !gerando);
}

function confirmarSalvar() {
  return new Promise((resolve) => {
    const root = getRootNode();
    const montagem = root === document ? document.body : root;
    const fundo = document.createElement('div');
    fundo.id = 'fluxograma-confirmacao';
    fundo.className = 'fx-confirmacao';
    fundo.setAttribute('role', 'dialog');
    fundo.setAttribute('aria-modal', 'true');
    fundo.setAttribute('aria-labelledby', 'fx-confirmacao-titulo');
    fundo.innerHTML = `
      <div class="fx-confirmacao-painel">
        <h3 id="fx-confirmacao-titulo" class="fx-confirmacao-titulo">Salvar antes de gerar?</h3>
        <p class="fx-confirmacao-texto">Este bot tem alterações que ainda não foram salvas. Para gerar o fluxograma, elas serão salvas na plataforma primeiro.</p>
        <div class="fx-confirmacao-acoes">
          <button type="button" data-acao="cancelar" class="fx-btn-secundario">Cancelar</button>
          <button type="button" data-acao="salvar" class="fx-btn-primario">Salvar e gerar</button>
        </div>
      </div>`;

    const fechar = (aceitou) => {
      fundo.remove();
      resolve(aceitou);
    };
    fundo.addEventListener('click', (e) => {
      const acao = e.target.closest('[data-acao]')?.dataset.acao;
      if (acao) fechar(acao === 'salvar');
      else if (e.target === fundo) fechar(false);
    });
    // stopPropagation: o Esc não pode chegar no listener do document que
    // fecha o editor inteiro (orpen-bridge.js).
    fundo.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      fechar(false);
    });

    montagem.appendChild(fundo);
    fundo.querySelector('[data-acao="cancelar"]').focus();
  });
}

function nomeDoArquivo(bot, formato) {
  const nome = (bot.NAME || 'sem-nome').replace(/[^a-zA-Z0-9_-]+/g, '_');
  return `fluxograma_${bot.ID || 'sem-id'}_${nome}.${formato}`;
}

function baixar(arquivo, formato, nome) {
  const blob = new Blob([arquivo], { type: formato === 'png' ? 'image/png' : 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function cadastrosDoAmbiente() {
  const amb = state.ambienteOrpen;
  if (!amb) return null;
  return { queues: amb.queues || [], bots: amb.bots || [], calendars: amb.calendars || [] };
}

export async function gerarFluxograma({ formato, salvar, temAlteracoesNaoSalvas, atualizarBotao }) {
  if (state.fluxogramaGerando) return;
  const bot = state.botCarregado;
  if (!bot || bot._isNewBot) return;

  // Bot sem estados: não há fluxograma. Checado antes de tudo (inclusive do
  // "salvar antes") pra não aparecer o erro técnico do parser.
  if (!(bot.BOT_STATES || []).length) {
    mostrarToast('Este bot ainda não tem estados: não há fluxograma para gerar.');
    return;
  }

  // O fluxograma sempre representa o bot como está SALVO (decisão P1).
  if (temAlteracoesNaoSalvas()) {
    if (!(await confirmarSalvar())) return;
    if (!(await salvar())) return; // salvarBotNaOrpen já mostrou o erro
    if (state.botCarregado !== bot) return;
  }

  const snapshot = structuredClone(bot);
  const nome = nomeDoArquivo(snapshot, formato);

  state.fluxogramaGerando = true;
  atualizarBotao();
  mostrarGerando(true, 'Gerando fluxograma…');
  try {
    const porta = await conectar();
    const r = await pedir(
      porta,
      { tipo: 'gerar', id: ++seq, bot: snapshot, formato, ambiente: cadastrosDoAmbiente() },
      (etapa) => mostrarGerando(true, TEXTO_ETAPA[etapa] || 'Gerando fluxograma…')
    );
    if (r.tipo === 'pronto') {
      baixar(r.arquivo, formato, nome);
      mostrarToast(
        r.semNomes
          ? `Fluxograma pronto: ${nome} (sem os nomes de fila/bot/calendário: cadastros da Orpen não carregados)`
          : `Fluxograma pronto: ${nome}`
      );
    } else {
      if (r.detalhe) console.error('[EDITOR_BOT] Fluxograma:', r.detalhe);
      mostrarToast('Erro ao gerar o fluxograma: ' + r.mensagem);
    }
  } catch (err) {
    console.error('[EDITOR_BOT] Falha ao gerar fluxograma:', err);
    mostrarToast('Não foi possível gerar o fluxograma: ' + err.message);
  } finally {
    state.fluxogramaGerando = false;
    mostrarGerando(false);
    atualizarBotao();
  }
}
