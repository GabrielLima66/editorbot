// ---------------------------------------------------------------------------
// Inserir variável ({$nome}) nas caixas de texto do editor, como o botão
// direito do modal nativo (contextMenuHint, bot.php:3779-3860), com duas
// melhorias: insere onde está o cursor (o nativo sempre joga no fim) e
// também abre ao digitar "{$", filtrando pelo que vem depois.
//
// Lista, como no nativo (buildSelectVariablesBot): as variáveis do bot (as
// mesmas da condição, com as regras de script/Automação) e as gravadas pelo
// próprio bot na ação "Armazenar variável" (bot_variables_text). Mesmo
// visual das listas de busca (.cb-painel).
// ---------------------------------------------------------------------------

import { state } from './state.js';
import { getRootNode, empilharEsc, marcarSemAutopreenchimento } from './dom-root.js';
import { opcoesVariavelCondicao } from './bot-view-render.js';

const DICA = 'Botão direito ou {$ para inserir variável';
const PREFIXO_DIGITADO = /\{\$([A-Za-z0-9_]*)$/;

// Caixas de texto livres onde uma variável faz sentido. Campos de escolha em
// lista (combobox), nome de estado, nome de variável, busca e números ficam
// de fora.
function ehCampoDeTexto(el) {
  if (!el || !el.matches) return false;
  if (!el.matches('textarea, input[type="text"], input:not([type])')) return false;
  if (el.readOnly || el.disabled) return false;
  if (el.hasAttribute('list') || el.dataset.lista) return false;
  if (el.matches('.labels-busca, .estado-alias, .var-nome, .bs-termo, .vt-busca, #bv-nome, [data-action="mover-transicao"], [data-action="mover-estado"]')) return false;
  return !!el.closest('#bv-estados, .mm-fundo') || el.id === 'bv-msg-encerrar';
}

const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function variaveisDisponiveis(bot = state.botCarregado) {
  const itens = [];
  const vistos = new Set();
  const incluir = (valor, rotulo, grupo) => {
    if (!valor || vistos.has(valor)) return;
    vistos.add(valor);
    itens.push({ valor, rotulo: rotulo || valor, grupo });
  };
  opcoesVariavelCondicao(bot).filter((o) => !o.assistente).forEach((o) => incluir(o.value, o.label, o.grupo));
  (bot?.BOT_ACTIONS || []).filter((a) => String(a.ACTION_TYPE) === '13').forEach((a) => {
    try {
      Object.keys(JSON.parse(a.ACTION_DATA?.bot_variables_text || '{}') || {}).forEach((k) => incluir(k, k, 'Gravadas neste bot'));
    } catch { /* JSON incompleto: ignora */ }
  });
  return itens;
}

// ---- painel

let painel = null;
let lista = null;
let busca = null;
let alvo = null; // { campo, inicio, fim, modo: 'menu' | 'digitando' }
let marcado = -1;
let soltarEsc = null;

function criarPainel() {
  const raiz = getRootNode();
  painel = document.createElement('div');
  painel.className = 'cb-painel vt-painel hidden';
  painel.setAttribute('role', 'dialog');
  painel.setAttribute('aria-label', 'Inserir variável');
  busca = document.createElement('input');
  busca.type = 'search';
  busca.className = 'field-view vt-busca';
  busca.placeholder = 'Buscar variável';
  marcarSemAutopreenchimento(busca);
  busca.spellcheck = false;
  lista = document.createElement('div');
  lista.className = 'vt-lista';
  painel.append(busca, lista);
  // Não tirar o foco do campo ao clicar numa opção (modo digitando).
  painel.addEventListener('mousedown', (e) => { if (e.target !== busca) e.preventDefault(); });
  painel.addEventListener('click', (e) => {
    const b = e.target.closest('.cb-opcao');
    if (b) inserir(b.dataset.valor);
  });
  busca.addEventListener('input', () => desenhar(busca.value));
  busca.addEventListener('keydown', teclado);
  (raiz === document ? document.body : raiz).appendChild(painel);
}

function desenhar(filtro) {
  const f = normalizar(filtro).trim();
  const itens = variaveisDisponiveis().filter((i) => !f || normalizar(`${i.valor} ${i.rotulo} ${i.grupo}`).includes(f));
  lista.replaceChildren();
  if (!itens.length) {
    const vazio = document.createElement('p');
    vazio.className = 'cb-vazio';
    vazio.textContent = 'Nenhuma variável';
    lista.appendChild(vazio);
    marcado = -1;
    return;
  }
  let grupoAtual = null;
  itens.forEach((i) => {
    if (i.grupo && i.grupo !== grupoAtual) {
      const cab = document.createElement('p');
      cab.className = 'cb-grupo';
      cab.textContent = i.grupo;
      lista.appendChild(cab);
    }
    grupoAtual = i.grupo;
    const b = document.createElement('button');
    b.type = 'button';
    b.tabIndex = -1;
    b.className = 'cb-opcao';
    b.dataset.valor = i.valor;
    b.textContent = i.rotulo;
    const apoio = document.createElement('span');
    apoio.className = 'cb-apoio';
    apoio.textContent = `{$${i.valor}}`;
    b.appendChild(apoio);
    lista.appendChild(b);
  });
  marcar(0);
}

function marcar(i) {
  const opcoes = lista.querySelectorAll('.cb-opcao');
  if (!opcoes.length) { marcado = -1; return; }
  marcado = (i + opcoes.length) % opcoes.length;
  opcoes.forEach((o, k) => o.classList.toggle('cb-marcada', k === marcado));
  opcoes[marcado].scrollIntoView({ block: 'nearest' });
}

function posicionar(x, y, campo) {
  const r = campo.getBoundingClientRect();
  const largura = Math.max(260, Math.min(r.width, 360));
  const esquerda = Math.min(x ?? r.left, window.innerWidth - largura - 8);
  const topo = y ?? r.bottom + 4;
  const cabeAbaixo = window.innerHeight - topo >= 220;
  painel.style.left = `${Math.max(8, Math.round(esquerda))}px`;
  painel.style.width = `${Math.round(largura)}px`;
  painel.style.maxHeight = '300px';
  if (cabeAbaixo) { painel.style.top = `${Math.round(topo)}px`; painel.style.bottom = ''; }
  else { painel.style.top = ''; painel.style.bottom = `${Math.round(window.innerHeight - (y ?? r.top) + 4)}px`; }
}

function abrir(campo, modo, filtro, x, y) {
  if (!painel) criarPainel();
  const inicio = campo.selectionStart ?? campo.value.length;
  const fim = campo.selectionEnd ?? inicio;
  alvo = { campo, inicio, fim, modo };
  busca.value = modo === 'menu' ? '' : filtro;
  busca.classList.toggle('hidden', modo !== 'menu');
  desenhar(filtro);
  painel.classList.remove('hidden');
  posicionar(x, y, campo);
  if (modo === 'menu') busca.focus();
  if (!soltarEsc) soltarEsc = empilharEsc(() => fechar(true));
}

function fechar(devolverFoco) {
  if (painel) painel.classList.add('hidden');
  const campo = alvo?.campo ? reencontrar(alvo.campo) : null;
  alvo = null;
  if (soltarEsc) { soltarEsc(); soltarEsc = null; }
  if (devolverFoco && campo?.isConnected) campo.focus();
}

/**
 * Texto com a variável inserida e a nova posição do cursor. No modo
 * 'digitando', o "{$parcial" antes do cursor é trocado pela variável; no
 * modo 'menu', a variável entra no lugar da seleção (ou no cursor).
 */
export function textoComVariavel(texto, inicio, fim, valor, modo) {
  if (modo === 'digitando') {
    const m = PREFIXO_DIGITADO.exec(texto.slice(0, fim));
    inicio = m ? fim - m[0].length : fim;
  }
  const trecho = `{$${valor}}`;
  return { texto: texto.slice(0, inicio) + trecho + texto.slice(fim), cursor: inicio + trecho.length, inicio, fim, trecho };
}

// Insere como edição do navegador (execCommand 'insertText'): entra no
// histórico do campo, então Ctrl+Z desfaz a variável (e, no modo digitando,
// devolve o "{$parcial"). Também conta como digitação: o change sai ao sair
// do campo, sem redesenhar a transição agora (o que recriaria o campo e
// perderia o histórico). Sem suporte, cai na troca direta do valor.
// O campo pode ter sido recriado desde que a lista abriu: pelo botão
// direito, o foco vai para a busca, o campo perde o foco, o change grava o
// que foi digitado e a transição é redesenhada (campo novo, mesmo texto).
// Reencontra o campo novo pelos mesmos identificadores.
const IDENTIFICADORES = ['id', 'data-action', 'data-transition-id', 'data-action-id', 'data-condition-id', 'data-campo', 'data-caminho', 'data-mt'];

function reencontrar(campo) {
  if (campo.isConnected) return campo;
  const seletor = campo.tagName.toLowerCase() + IDENTIFICADORES
    .filter((a) => campo.hasAttribute(a))
    .map((a) => `[${a}="${CSS.escape(campo.getAttribute(a))}"]`)
    .join('');
  return getRootNode().querySelector(seletor) || campo;
}

function inserir(valor) {
  if (!alvo) return;
  const campo = reencontrar(alvo.campo);
  const { modo } = alvo;
  const fimAtual = modo === 'digitando' ? (campo.selectionStart ?? campo.value.length) : alvo.fim;
  const r = textoComVariavel(campo.value, alvo.inicio, fimAtual, valor, modo);
  fechar(false);
  campo.focus();
  campo.setSelectionRange?.(r.inicio, r.fim);
  let ok = false;
  try { ok = document.execCommand('insertText', false, r.trecho); } catch { ok = false; }
  if (ok && campo.value === r.texto) return;
  campo.value = r.texto;
  campo.setSelectionRange?.(r.cursor, r.cursor);
  campo.dispatchEvent(new Event('input', { bubbles: true }));
  campo.dispatchEvent(new Event('change', { bubbles: true }));
}

function teclado(e) {
  if (!alvo || painel.classList.contains('hidden')) return false;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    marcar(marcado + (e.key === 'ArrowDown' ? 1 : -1));
    return true;
  }
  if (e.key === 'Enter' || e.key === 'Tab') {
    const b = lista.querySelectorAll('.cb-opcao')[marcado];
    if (!b) return false;
    e.preventDefault();
    e.stopPropagation();
    inserir(b.dataset.valor);
    return true;
  }
  return false;
}

export function initVariaveisTexto(raiz) {
  // Dica nas caixas de texto sem placeholder.
  raiz.addEventListener('focusin', (e) => {
    const el = e.target;
    if (ehCampoDeTexto(el) && !el.placeholder) el.placeholder = DICA;
  });

  // Botão direito: abre no ponto do clique (como o nativo, que troca o menu
  // do navegador pela lista de variáveis).
  raiz.addEventListener('contextmenu', (e) => {
    if (!ehCampoDeTexto(e.target)) return;
    e.preventDefault();
    abrir(e.target, 'menu', '', e.clientX, e.clientY);
  });

  // Digitar "{$": abre filtrando pelo que vem depois; qualquer outro
  // caractere que encerre o nome fecha.
  raiz.addEventListener('input', (e) => {
    const el = e.target;
    if (el === busca || !ehCampoDeTexto(el)) return;
    const antes = el.value.slice(0, el.selectionStart ?? el.value.length);
    const m = PREFIXO_DIGITADO.exec(antes);
    if (m) {
      if (alvo?.campo === el && alvo.modo === 'digitando') desenhar(m[1]);
      else abrir(el, 'digitando', m[1]);
    } else if (alvo?.campo === el && alvo.modo === 'digitando') {
      fechar(false);
    }
  });

  // Setas/Enter/Tab no campo enquanto a lista (modo digitando) está aberta.
  raiz.addEventListener('keydown', (e) => {
    if (alvo?.modo === 'digitando' && e.target === alvo.campo) teclado(e);
  }, true);

  // Clique fora fecha.
  raiz.addEventListener('mousedown', (e) => {
    if (alvo && painel && !painel.contains(e.target) && e.target !== alvo.campo) fechar(false);
  }, true);

  raiz.addEventListener('focusout', (e) => {
    if (alvo?.modo === 'digitando' && e.target === alvo.campo && !painel.contains(e.relatedTarget)) fechar(false);
  });
}

export function fecharVariaveisTexto() {
  if (alvo) fechar(false);
}
