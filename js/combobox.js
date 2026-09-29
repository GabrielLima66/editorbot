// ---------------------------------------------------------------------------
// Lista de sugestões própria para os campos de busca do editor (<input
// list="...">), no lugar do popup nativo do <datalist>, que no Chrome abre
// escuro e fora do tema. Mesmo visual da lista de labels (campoLabels).
//
// Não muda o que cada campo aceita: o <datalist> continua sendo a fonte das
// opções, escolher uma opção só preenche o campo e dispara `change`, e os
// handlers de cada campo (bot-view-interactions.js) decidem como antes. Na
// primeira vez que o campo recebe foco, o atributo `list` vira `data-lista`
// (sem ele o navegador não abre o popup nativo); quem precisar da <datalist>
// usa datalistDe(input).
// ---------------------------------------------------------------------------

import { getRootNode, empilharEsc } from './dom-root.js';

export function datalistDe(input) {
  const id = input?.dataset?.lista || input?.getAttribute?.('list');
  if (!id) return null;
  const raiz = getRootNode();
  return raiz.getElementById ? raiz.getElementById(id) : raiz.querySelector(`#${CSS.escape(id)}`);
}

const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

let painel = null;
let campoAtual = null;
let indiceMarcado = -1;
let soltarEsc = null;

function criarPainel() {
  const raiz = getRootNode();
  const montagem = raiz === document ? document.body : raiz;
  painel = document.createElement('div');
  painel.className = 'cb-painel hidden';
  painel.setAttribute('role', 'listbox');
  // mousedown não pode tirar o foco do campo (senão o blur fecha antes do clique).
  painel.addEventListener('mousedown', (e) => e.preventDefault());
  painel.addEventListener('click', (e) => {
    const opcao = e.target.closest('.cb-opcao');
    if (opcao) escolher(opcao.dataset.valor);
  });
  montagem.appendChild(painel);
}

function posicionar() {
  if (!painel || !campoAtual) return;
  const r = campoAtual.getBoundingClientRect();
  const alturaMax = 260;
  const cabeAbaixo = window.innerHeight - r.bottom >= Math.min(alturaMax, 160) || r.top < alturaMax;
  painel.style.left = `${Math.round(r.left)}px`;
  painel.style.width = `${Math.round(Math.max(r.width, 180))}px`;
  painel.style.maxHeight = `${alturaMax}px`;
  if (cabeAbaixo) {
    painel.style.top = `${Math.round(r.bottom + 4)}px`;
    painel.style.bottom = '';
  } else {
    painel.style.top = '';
    painel.style.bottom = `${Math.round(window.innerHeight - r.top + 4)}px`;
  }
}

// Cada <option> pode ter data-grupo (vira um cabeçalho de tópico na lista,
// na ordem em que aparece) e um `label` diferente do valor (aparece como
// texto de apoio, ex.: nome amigável de uma variável {$id}). O filtro olha
// valor, apoio e grupo.
function opcoesDoCampo(filtro) {
  const lista = datalistDe(campoAtual);
  if (!lista) return [];
  const alvo = normalizar(filtro).trim();
  return Array.from(lista.options)
    .map((o) => ({
      valor: o.value,
      grupo: o.dataset.grupo || '',
      apoio: o.getAttribute('label') && o.getAttribute('label') !== o.value ? o.getAttribute('label') : '',
    }))
    .filter((o) => o.valor && (!alvo || normalizar(`${o.valor} ${o.apoio} ${o.grupo}`).includes(alvo)));
}

function desenhar(filtro) {
  const opcoes = opcoesDoCampo(filtro);
  const valores = opcoes.map((o) => o.valor);
  painel.replaceChildren();
  if (!valores.length) {
    const vazio = document.createElement('p');
    vazio.className = 'cb-vazio';
    vazio.textContent = 'Nenhum resultado';
    painel.appendChild(vazio);
    indiceMarcado = -1;
    return;
  }
  let grupoAtual = null;
  opcoes.forEach(({ valor: v, grupo, apoio }) => {
    if (grupo && grupo !== grupoAtual) {
      const cab = document.createElement('p');
      cab.className = 'cb-grupo';
      cab.textContent = grupo;
      painel.appendChild(cab);
    }
    grupoAtual = grupo;
    const b = document.createElement('button');
    b.type = 'button';
    b.tabIndex = -1;
    b.className = 'cb-opcao';
    b.dataset.valor = v;
    b.textContent = v;
    if (apoio) {
      const s = document.createElement('span');
      s.className = 'cb-apoio';
      s.textContent = apoio;
      b.appendChild(s);
    }
    if (v === campoAtual.value) b.classList.add('cb-atual');
    b.setAttribute('role', 'option');
    painel.appendChild(b);
  });
  // O que o Enter escolhe: o valor atual, se estiver na lista; senão, com
  // algo digitado, a primeira que começa com o texto (ou a primeira que
  // contém). Sem nada digitado e valor livre, nada: o Enter não troca texto
  // livre (nome de variável etc.) pela primeira opção.
  const alvo = normalizar(filtro).trim();
  let padrao = valores.indexOf(campoAtual.value);
  if (padrao < 0 && alvo) {
    padrao = valores.findIndex((v) => normalizar(v).startsWith(alvo));
    if (padrao < 0) padrao = 0;
  }
  marcar(padrao);
}

function marcar(i) {
  const opcoes = painel.querySelectorAll('.cb-opcao');
  if (!opcoes.length || i < 0) {
    indiceMarcado = -1;
    opcoes.forEach((o) => o.classList.remove('cb-marcada'));
    return;
  }
  indiceMarcado = i % opcoes.length;
  opcoes.forEach((o, k) => o.classList.toggle('cb-marcada', k === indiceMarcado));
  opcoes[indiceMarcado].scrollIntoView({ block: 'nearest' });
}

function abrir(campo, filtro) {
  if (!painel) criarPainel();
  campoAtual = campo;
  indiceMarcado = -1;
  desenhar(filtro);
  painel.classList.remove('hidden');
  posicionar();
  if (!soltarEsc) soltarEsc = empilharEsc(() => fechar());
}

export function fecharCombobox() {
  fechar();
}

function fechar() {
  if (painel) painel.classList.add('hidden');
  campoAtual = null;
  indiceMarcado = -1;
  if (soltarEsc) { soltarEsc(); soltarEsc = null; }
}

// `input` também é disparado: o construtor de variáveis sincroniza por ele
// (variaveis-builder.js). `escolhendo` evita que esse input reabra a lista.
let escolhendo = false;
function escolher(valor) {
  const campo = campoAtual;
  fechar();
  if (!campo) return;
  campo.value = valor;
  escolhendo = true;
  try {
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    campo.dispatchEvent(new Event('change', { bubbles: true }));
  } finally {
    escolhendo = false;
  }
}

const ehCampoDeBusca = (el) => el?.tagName === 'INPUT' && (el.hasAttribute('list') || el.dataset.lista);

// Liga a lista em todos os campos de busca dentro de `container` (delegação:
// vale também para campos criados depois, a cada re-render).
export function initCombobox(container) {
  container.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!ehCampoDeBusca(el)) return;
    if (el.hasAttribute('list')) {
      el.dataset.lista = el.getAttribute('list');
      el.removeAttribute('list');
    }
    el.setAttribute('autocomplete', 'off');
    abrir(el, '');
  });

  container.addEventListener('input', (e) => {
    if (escolhendo) return;
    if (e.target !== campoAtual) {
      if (ehCampoDeBusca(e.target)) abrir(e.target, e.target.value);
      return;
    }
    indiceMarcado = -1;
    desenhar(e.target.value);
    posicionar();
  });

  container.addEventListener('focusout', (e) => {
    if (e.target === campoAtual) fechar();
  });

  // Em captura: roda antes dos keydown dos campos (Enter que tira o foco etc.).
  container.addEventListener('keydown', (e) => {
    const el = e.target;
    if (!ehCampoDeBusca(el)) return;
    const aberto = campoAtual === el && painel && !painel.classList.contains('hidden');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!aberto) { abrir(el, ''); return; }
      const total = painel.querySelectorAll('.cb-opcao').length;
      if (!total) return;
      const proximo = indiceMarcado < 0 ? (e.key === 'ArrowDown' ? 0 : total - 1) : (indiceMarcado + (e.key === 'ArrowDown' ? 1 : -1) + total) % total;
      marcar(proximo);
    } else if (e.key === 'Enter' && aberto) {
      const marcada = painel.querySelectorAll('.cb-opcao')[indiceMarcado];
      if (!marcada) return;
      e.preventDefault();
      e.stopPropagation();
      escolher(marcada.dataset.valor);
    } else if (e.key === 'Tab' && aberto) {
      fechar();
    }
  }, true);

  // Campo redesenhado com a lista aberta (re-render da transição): o
  // elemento antigo sai do DOM sem focusout confiável; fecha no próximo clique.
  container.addEventListener('mousedown', () => {
    if (campoAtual && !campoAtual.isConnected) fechar();
  }, true);

  // Rolar a tela desalinha a lista do campo: fecha, como o popup nativo.
  container.addEventListener('scroll', () => { if (campoAtual) fechar(); }, true);
  window.addEventListener('resize', () => { if (campoAtual) fechar(); });
}
