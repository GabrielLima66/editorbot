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

import { getRootNode, empilharEsc, marcarSemAutopreenchimento } from './dom-root.js';
import { obterEscala } from './escala.js';
import { normalizar, classificar, FAIXA_EXATA, FAIXA_PARECIDA } from './fuzzy.js';

export function datalistDe(input) {
  const id = input?.dataset?.lista || input?.getAttribute?.('list');
  if (!id) return null;
  const raiz = getRootNode();
  return raiz.getElementById ? raiz.getElementById(id) : raiz.querySelector(`#${CSS.escape(id)}`);
}

// O texto digitado é a opção inteira ou o nome dela sem o "N - " do começo (as
// opções de estado são "N - ALIAS"). O Enter escolhe essa antes de qualquer
// outra que apenas contenha o texto: "Menu" é o estado "5 - Menu", não o
// "2 - Menu principal".
export function correspondeExato(valor, texto) {
  const alvo = normalizar(texto).trim();
  if (!alvo) return false;
  return normalizar(valor).trim() === alvo || normalizar(String(valor).replace(/^\d+\s*-\s*/, '')).trim() === alvo;
}

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
  // Com a escala da interface o painel é desenhado com transform: scale(k):
  // largura e altura da caixa valem antes dela, e o que se vê é k vezes isso.
  // O r vem em px da tela, então a largura da caixa é r.width / k.
  const k = obterEscala();
  const alturaMax = 260;
  const cabeAbaixo = window.innerHeight - r.bottom >= Math.min(alturaMax, 160) * k || r.top < alturaMax * k;
  painel.style.left = `${Math.round(r.left)}px`;
  painel.style.width = `${Math.round(Math.max(r.width / k, 180))}px`;
  painel.style.maxHeight = `${alturaMax}px`;
  painel.style.transformOrigin = cabeAbaixo ? 'top left' : 'bottom left';
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
// texto de apoio, ex.: nome amigável de uma variável {$id}).
export function lerOpcoes(datalist) {
  return Array.from(datalist?.options || []).map((o) => ({
    valor: o.value,
    grupo: o.dataset.grupo || '',
    id: o.dataset.value ?? '',
    apoio: o.getAttribute('label') && o.getAttribute('label') !== o.value ? o.getAttribute('label') : '',
  }));
}

// O que a lista mostra para o texto digitado. O filtro olha valor, apoio e
// grupo. Primeiro vêm as opções que contêm o texto (ou todas as palavras dele),
// na ordem da lista; depois, marcadas `parecido`, as que só se aproximam dele
// (fuzzy.js), da mais próxima para a mais distante.
export function filtrarOpcoes(opcoes, filtro) {
  const alvo = normalizar(filtro).trim();
  const validas = opcoes.filter((o) => o.valor);
  if (!alvo) return validas;
  const principais = [];
  const parecidas = [];
  validas.forEach((o) => {
    const r = classificar(`${o.valor} ${o.apoio} ${o.grupo}`, alvo);
    if (!r) return;
    if (r.faixa === FAIXA_PARECIDA) parecidas.push({ ...o, parecido: true, pontos: r.pontos });
    else principais.push({ ...o, faixa: r.faixa });
  });
  // Digitou um ID inteiro ("12"): o cadastro com esse ID vem antes dos que só
  // contêm o número ("[Agente 112]").
  principais.sort((a, b) => Number(normalizar(b.id) === alvo) - Number(normalizar(a.id) === alvo));
  parecidas.sort((a, b) => a.pontos - b.pontos);
  return [...principais, ...parecidas];
}

function opcoesDoCampo(filtro) {
  const lista = datalistDe(campoAtual);
  return lista ? filtrarOpcoes(lerOpcoes(lista), filtro) : [];
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
  opcoes.forEach(({ valor: v, grupo: grupoDaOpcao, apoio, parecido }) => {
    // As aproximadas ficam juntas no fim, sob um cabeçalho próprio, e não
    // dentro dos tópicos da lista.
    const grupo = parecido ? 'Parecidos' : grupoDaOpcao;
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
  marcar(escolhaPadrao(opcoes, campoAtual.value, filtro));
}

// O que o Enter escolhe: o valor atual, se estiver na lista; senão, com algo
// digitado, o nome exato, a que começa com o texto, a primeira que contém o
// texto inteiro e, por fim, a primeira que contém suas palavras. Os "parecidos"
// nunca são escolhidos sozinhos (só pela seta, vendo o que é): sem nenhum
// resultado de verdade, o Enter não escolhe nada, e o texto livre (nome de
// variável, valor literal, ID digitado) segue o fluxo de sempre. Sem nada
// digitado e valor livre, também nada.
export function escolhaPadrao(opcoes, valorAtual, filtro) {
  let i = opcoes.findIndex((o) => o.valor === valorAtual);
  const alvo = normalizar(filtro).trim();
  if (i < 0 && alvo) {
    i = opcoes.findIndex((o) => !o.parecido && correspondeExato(o.valor, filtro));
    if (i < 0) i = opcoes.findIndex((o) => !o.parecido && normalizar(o.valor).startsWith(alvo));
    if (i < 0) i = opcoes.findIndex((o) => o.faixa === FAIXA_EXATA);
    if (i < 0) i = opcoes.findIndex((o) => !o.parecido);
  }
  return i;
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

// O campo trocou de <datalist> (alternar-lista-variaveis): mostra a lista
// nova inteira. Com o campo já em foco a lista aberta é redesenhada; sem foco,
// o focusin abre.
export function reabrirCombobox(campo) {
  if (campoAtual === campo && painel) {
    indiceMarcado = -1;
    desenhar('');
    posicionar();
  } else if ((getRootNode().activeElement ?? document.activeElement) === campo) {
    // Já em foco, com a lista fechada (Esc, rolagem): focus() não dispara
    // focusin, então abre direto.
    abrir(campo, '');
  } else {
    campo.focus();
  }
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
    marcarSemAutopreenchimento(el);
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
