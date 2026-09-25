// ---------------------------------------------------------------------------
// Localizar no editor (SPEC-busca-editor.md): painel encaixado à direita do
// editor, fora do .bv-panel, com três modos EXCLUSIVOS pra nunca misturar o
// que o bot envia com o que o cliente digita:
//   - textos:    Mensagem, áudio, forma de contato e menus (cabeçalho, corpo,
//                rodapé, botões, opções, botão da lista)
//   - condicoes: valores das condições (o que o cliente digita)
//   - estados:   nomes dos estados
// A busca lê state.botCarregado (não o DOM) e refaz sozinha a cada edição.
// Sem acento e sem maiúscula por padrão ("horario" acha "Horário").
// ---------------------------------------------------------------------------

import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { getRootNode, criarIcones } from './dom-root.js';
import { parseMenuModel } from './menu-builder.js';
import { VARIABLE_LABELS, TEXT_OPERATORS } from './dictionaries.js';
import { abrirModalMenu } from './menu-modal.js';

const MODOS = [
  { id: 'textos', rotulo: 'Textos enviados', icone: 'message-square', dica: 'Mensagens e menus que o bot envia' },
  { id: 'condicoes', rotulo: 'Condições', icone: 'split', dica: 'Valores que o cliente digita' },
  { id: 'estados', rotulo: 'Estados', icone: 'circle-dot', dica: 'Nomes dos estados' },
];
// Campos de texto enviados ao cliente, por ACTION_TYPE.
const CAMPOS_TEXTO = {
  '1': [['message_text', 'Mensagem']],
  '20': [['message_content', 'Mensagem de áudio']],
  '21': [['message_text', 'Forma de contato']],
};
const TRECHO = 34;

const busca = {
  aberta: false,
  modo: 'textos',
  termo: '',
  diferenciarMaiusculas: false,
  palavraInteira: false,
  resultados: [],
  atual: -1,
};

// ---------------------------------------------------------------- correspondência

const MARCAS = /[̀-ͯ]/g;
const LETRA = /[\p{L}\p{N}_]/u;

// Normaliza caractere a caractere, guardando de onde veio cada um, pra
// devolver a posição da ocorrência no texto ORIGINAL (seleção no campo).
function normalizar(texto, diferenciar) {
  let norm = '';
  const origem = [];
  for (let i = 0; i < texto.length; i++) {
    let c = texto[i].normalize('NFD').replace(MARCAS, '');
    if (!diferenciar) c = c.toLowerCase();
    for (let k = 0; k < c.length; k++) { norm += c[k]; origem.push(i); }
  }
  origem.push(texto.length);
  return { norm, origem };
}

function ocorrencias(texto, termoNorm, opcoes) {
  if (!texto || !termoNorm) return [];
  const { norm, origem } = normalizar(String(texto), opcoes.diferenciarMaiusculas);
  const achados = [];
  let i = norm.indexOf(termoNorm);
  while (i !== -1) {
    const fim = i + termoNorm.length;
    const inteira = !opcoes.palavraInteira || ((i === 0 || !LETRA.test(norm[i - 1])) && (fim >= norm.length || !LETRA.test(norm[fim])));
    if (inteira) achados.push({ inicio: origem[i], fim: origem[fim - 1] + 1 });
    i = norm.indexOf(termoNorm, i + Math.max(1, termoNorm.length));
  }
  return achados;
}

// ---------------------------------------------------------------- coleta

function camposDoMenu(raw) {
  const m = parseMenuModel(raw || '');
  const campos = [];
  const add = (texto, rotulo) => { if (texto) campos.push({ texto, rotulo }); };
  if (m.kind === 'whatsapp_button' || m.kind === 'whatsapp_list') {
    add(m.header, 'cabeçalho');
    add(m.body, 'mensagem');
    add(m.footer, 'rodapé');
  }
  if (m.kind === 'whatsapp_button') m.buttons.forEach((b, i) => add(b.title, `botão ${i + 1}`));
  if (m.kind === 'whatsapp_list') {
    add(m.button, 'botão da lista');
    let n = 0;
    m.sections.forEach((s) => s.rows.forEach((r) => { n++; add(r.title, `opção ${n}`); add(r.description, `opção ${n} (descrição)`); }));
  }
  if (m.kind === 'webchat') m.options.forEach((o, i) => add(o.text, `opção ${i + 1}`));
  // Menu em formato não reconhecido: busca no JSON cru, pra não sumir nada.
  if (m.kind === 'unknown' && raw) add(raw, 'JSON');
  return campos;
}

// O editor só grava no bot no "change" (ao sair do campo). Pra busca refletir
// o que está sendo digitado, o valor na tela tem prioridade sobre o do bot.
function valoresNaTela() {
  const raiz = getRootNode();
  const mapa = new Map();
  raiz.querySelectorAll('#bv-estados [data-action="mudar-campo-acao"][data-campo]').forEach((el) => {
    if ('value' in el) mapa.set(`a:${el.dataset.actionId}:${el.dataset.campo}`, el.value);
  });
  raiz.querySelectorAll('#bv-estados [data-action="mudar-condicao-valor"]').forEach((el) => mapa.set(`c:${el.dataset.conditionId}`, el.value));
  raiz.querySelectorAll('#bv-estados .estado-alias[data-state]').forEach((el) => mapa.set(`e:${el.dataset.state}`, el.value));
  return mapa;
}

function coletar() {
  const bot = state.botCarregado;
  const termoNorm = normalizar(busca.termo.trim(), busca.diferenciarMaiusculas).norm;
  if (!bot || !termoNorm) return [];
  const tela = valoresNaTela();
  const aoVivo = (chave, valor) => (tela.has(chave) ? tela.get(chave) : valor);
  const opcoes = { diferenciarMaiusculas: busca.diferenciarMaiusculas, palavraInteira: busca.palavraInteira };
  const estados = [...(bot.BOT_STATES || [])].sort((a, b) => parseInt(a.STATE_NUMBER, 10) - parseInt(b.STATE_NUMBER, 10));
  const porId = (a, b) => parseInt(a.ID, 10) - parseInt(b.ID, 10);
  const saida = [];

  estados.forEach((est) => {
    const base = { estadoNumero: est.STATE_NUMBER, estadoAlias: est.ALIAS || '' };
    if (busca.modo === 'estados') {
      const nome = aoVivo(`e:${est.STATE_NUMBER}`, est.ALIAS);
      ocorrencias(nome, termoNorm, opcoes).forEach((o, n) =>
        saida.push({ ...base, alvo: { tipo: 'estado', id: est.STATE_NUMBER }, rotulo: 'Nome do estado', texto: nome, ...o, chave: `e:${est.STATE_NUMBER}:${n}` }));
      return;
    }
    const transicoes = (bot.BOT_TRANSITIONS || []).filter((t) => t.STATE === est.STATE_NUMBER)
      .sort((a, b) => parseInt(a.PRIORITY, 10) - parseInt(b.PRIORITY, 10));
    transicoes.forEach((t) => {
      const local = { ...base, transicaoId: t.ID, prioridade: t.PRIORITY };
      if (busca.modo === 'condicoes') {
        (bot.BOT_CONDITIONS || []).filter((c) => c.TRANSITION_ID === t.ID).sort(porId).forEach((c) => {
          const d = c.CONDITION_DATA || {};
          if (typeof d.value !== 'string') return;
          const valor = aoVivo(`c:${c.ID}`, d.value);
          const rotulo = `${VARIABLE_LABELS[d.variable] || d.variable || 'Condição'} ${TEXT_OPERATORS[c.CONDITION_TYPE] || ''}`.trim();
          ocorrencias(valor, termoNorm, opcoes).forEach((o, n) =>
            saida.push({ ...local, alvo: { tipo: 'condicao', id: c.ID }, rotulo, texto: valor, ...o, chave: `c:${c.ID}:${n}` }));
        });
        return;
      }
      (bot.BOT_ACTIONS || []).filter((a) => a.TRANSITION_ID === t.ID).sort(porId).forEach((a) => {
        const d = a.ACTION_DATA || {};
        if (a.ACTION_TYPE === '10') {
          camposDoMenu(d.message_option_text).forEach((campo) =>
            ocorrencias(campo.texto, termoNorm, opcoes).forEach((o, n) =>
              saida.push({ ...local, alvo: { tipo: 'menu', id: a.ID }, rotulo: `Menu › ${campo.rotulo}`, texto: campo.texto, ...o, chave: `m:${a.ID}:${campo.rotulo}:${n}` })));
          return;
        }
        (CAMPOS_TEXTO[a.ACTION_TYPE] || []).forEach(([campo, rotulo]) => {
          const texto = aoVivo(`a:${a.ID}:${campo}`, d[campo]);
          ocorrencias(texto, termoNorm, opcoes).forEach((o, n) =>
            saida.push({ ...local, alvo: { tipo: 'acao', id: a.ID, campo }, rotulo, texto, ...o, chave: `a:${a.ID}:${campo}:${n}` }));
        });
      });
    });
  });
  return saida;
}

// ---------------------------------------------------------------- DOM

const $r = (sel) => getRootNode().querySelector(sel);
const painel = () => $r('#bs-painel');

function elementoDoAlvo(r) {
  const cssId = (v) => String(v).replace(/"/g, '\\"');
  switch (r.alvo.tipo) {
    case 'acao': return $r(`#bv-estados [data-action="mudar-campo-acao"][data-action-id="${cssId(r.alvo.id)}"][data-campo="${cssId(r.alvo.campo)}"]`);
    case 'menu': return $r(`#bv-estados [data-action="editar-menu"][data-action-id="${cssId(r.alvo.id)}"]`)?.closest('.menu-resumo') || null;
    case 'condicao': return $r(`#bv-estados [data-action="mudar-condicao-valor"][data-condition-id="${cssId(r.alvo.id)}"]`);
    case 'estado': return $r(`#bv-estados .estado-alias[data-state="${cssId(r.alvo.id)}"]`);
    default: return null;
  }
}

function abrirEstado(numero) {
  const wrap = $r(`#bv-estados .estado-wrap[data-estado-numero="${String(numero).replace(/"/g, '\\"')}"]`);
  const corpo = wrap?.querySelector('.estado-body');
  if (!corpo || !corpo.classList.contains('hidden')) return;
  corpo.classList.remove('hidden');
  wrap.classList.add('estado-expandido');
  wrap.querySelector('.estado-chevron')?.classList.add('rotate-180');
}

/** Leva até o resultado. selecionar=true põe o foco no campo com o termo selecionado. */
function irPara(indice, selecionar) {
  const r = busca.resultados[indice];
  if (!r) return;
  busca.atual = indice;
  if (r.alvo.tipo !== 'estado') abrirEstado(r.estadoNumero);
  const el = elementoDoAlvo(r);
  if (el) {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.remove('bs-alvo');
    void el.offsetWidth; // reinicia a animação
    el.classList.add('bs-alvo');
    clearTimeout(el._bsTimer);
    el._bsTimer = setTimeout(() => el.classList.remove('bs-alvo'), 1600);
    if (selecionar && typeof el.setSelectionRange === 'function') {
      el.focus({ preventScroll: true });
      el.setSelectionRange(r.inicio, r.fim);
    }
  }
  desenharPosicao();
}

function proximo(delta) {
  const n = busca.resultados.length;
  if (!n) return;
  irPara(((busca.atual < 0 ? (delta > 0 ? -1 : 0) : busca.atual) + delta + n) % n, false);
}

// ---------------------------------------------------------------- painel

function trecho(r) {
  const t = String(r.texto);
  const ini = Math.max(0, r.inicio - TRECHO);
  const fim = Math.min(t.length, r.fim + TRECHO);
  const limpar = (s) => escapeHtml(s.replace(/\s+/g, ' '));
  return `${ini > 0 ? '…' : ''}${limpar(t.slice(ini, r.inicio))}<mark>${limpar(t.slice(r.inicio, r.fim))}</mark>${limpar(t.slice(r.fim, fim))}${fim < t.length ? '…' : ''}`;
}

function desenharPosicao() {
  const p = painel();
  if (!p) return;
  const n = busca.resultados.length;
  const temTermo = !!busca.termo.trim();
  p.querySelector('.bs-contagem').textContent = !temTermo ? '' : n ? `${busca.atual >= 0 ? busca.atual + 1 : '–'} de ${n}` : 'Nenhum resultado';
  p.querySelectorAll('[data-bs-nav]').forEach((b) => { b.disabled = !n; });
  p.querySelectorAll('.bs-item').forEach((li) => li.classList.toggle('bs-item-atual', Number(li.dataset.i) === busca.atual));
  p.querySelector('.bs-item-atual')?.scrollIntoView({ block: 'nearest' });
}

function desenharLista() {
  const p = painel();
  if (!p) return;
  const modo = MODOS.find((m) => m.id === busca.modo);
  p.dataset.modo = busca.modo;
  p.querySelectorAll('.bs-aba').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.modo === busca.modo)));
  const campo = p.querySelector('.bs-termo');
  campo.placeholder = `Buscar em ${modo.rotulo.toLowerCase()}`;

  const lista = p.querySelector('.bs-lista');
  if (!busca.termo.trim()) {
    lista.innerHTML = `<p class="bs-vazio">${escapeHtml(modo.dica)}. Digite para buscar.</p>`;
  } else if (!busca.resultados.length) {
    lista.innerHTML = '<p class="bs-vazio">Nenhum resultado neste modo.</p>';
  } else {
    let html = '';
    let grupo = null;
    busca.resultados.forEach((r, i) => {
      if (r.estadoNumero !== grupo) {
        if (grupo !== null) html += '</ol></section>';
        grupo = r.estadoNumero;
        const qtd = busca.resultados.filter((x) => x.estadoNumero === grupo).length;
        html += `<section class="bs-grupo"><h4 class="bs-grupo-titulo"><span class="bs-estado-num">${escapeHtml(r.estadoNumero)}</span>${escapeHtml(r.estadoAlias || 'Sem nome')}<span class="bs-grupo-qtd">${qtd}</span></h4><ol>`;
      }
      const onde = r.alvo.tipo === 'estado' ? '' : `T${escapeHtml(r.prioridade)} · `;
      const abrirMenu = r.alvo.tipo === 'menu'
        ? `<button type="button" class="bs-abrir-menu" data-bs-menu="${i}" title="Abrir no editor de menu"><i data-lucide="pencil"></i></button>`
        : '';
      html += `<li class="bs-item" data-i="${i}"><button type="button" class="bs-item-ir" data-bs-ir="${i}"><span class="bs-item-onde">${onde}${escapeHtml(r.rotulo)}</span><span class="bs-item-trecho">${trecho(r)}</span></button>${abrirMenu}</li>`;
    });
    html += '</ol></section>';
    lista.innerHTML = html;
    criarIcones();
  }
  desenharPosicao();
}

/** Refaz a busca mantendo a posição no mesmo resultado (ou no seguinte). */
function atualizar() {
  const anterior = busca.resultados[busca.atual]?.chave;
  const indiceAnterior = busca.atual;
  busca.resultados = coletar();
  const mesmo = anterior ? busca.resultados.findIndex((r) => r.chave === anterior) : -1;
  busca.atual = mesmo >= 0 ? mesmo : busca.resultados.length ? Math.min(Math.max(indiceAnterior, 0), busca.resultados.length - 1) : -1;
  if (indiceAnterior < 0 && mesmo < 0) busca.atual = -1;
  desenharLista();
  atualizarContadorRodape();
}

function atualizarContadorRodape() {
  const btn = $r('#btn-bv-buscar');
  if (!btn) return;
  const n = busca.termo.trim() ? busca.resultados.length : 0;
  btn.dataset.qtd = n ? String(n) : '';
}

let timerAtualizar = 0;
function agendarAtualizacao() {
  if (!busca.aberta && !busca.termo.trim()) return;
  clearTimeout(timerAtualizar);
  timerAtualizar = setTimeout(atualizar, 200);
}

function montarPainel() {
  const overlay = $r('#bot-view-overlay');
  if (!overlay || painel()) return;
  overlay.insertAdjacentHTML('beforeend', `
    <aside id="bs-painel" class="bs-painel hidden" role="search" aria-label="Localizar no bot">
      <header class="bs-topo">
        <i data-lucide="search"></i><h3>Localizar</h3>
        <button type="button" class="bs-fechar" data-bs="fechar" title="Fechar (Esc)"><i data-lucide="x"></i></button>
      </header>
      <div class="bs-abas" role="tablist">
        ${MODOS.map((m) => `<button type="button" class="bs-aba" role="tab" data-modo="${m.id}" title="${escapeHtml(m.dica)}"><i data-lucide="${m.icone}"></i>${m.rotulo}</button>`).join('')}
      </div>
      <div class="bs-campo">
        <input type="text" class="bs-termo" spellcheck="false" autocomplete="off" aria-label="Termo de busca">
        <button type="button" class="bs-opcao" data-bs="maiusculas" aria-pressed="false" title="Diferenciar maiúsculas e minúsculas">Aa</button>
        <button type="button" class="bs-opcao" data-bs="inteira" aria-pressed="false" title="Palavra inteira"><i data-lucide="whole-word"></i></button>
      </div>
      <div class="bs-nav">
        <span class="bs-contagem" aria-live="polite"></span>
        <button type="button" class="bs-seta" data-bs-nav="-1" title="Anterior (Shift+Enter / Shift+F3)"><i data-lucide="chevron-up"></i></button>
        <button type="button" class="bs-seta" data-bs-nav="1" title="Próximo (Enter / F3)"><i data-lucide="chevron-down"></i></button>
      </div>
      <div class="bs-lista"></div>
      <p class="bs-dica">Clique num resultado para editar o texto direto no campo.</p>
    </aside>`);
  const p = painel();
  const campo = p.querySelector('.bs-termo');

  campo.addEventListener('input', () => {
    busca.termo = campo.value;
    busca.atual = -1;
    atualizar();
  });
  campo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); proximo(e.shiftKey ? -1 : 1); }
  });
  p.addEventListener('click', (e) => {
    const alvo = e.target.closest('button');
    if (!alvo) return;
    if (alvo.dataset.bs === 'fechar') return fecharBusca();
    if (alvo.classList.contains('bs-aba')) {
      busca.modo = alvo.dataset.modo;
      busca.atual = -1;
      atualizar();
      campo.focus();
      return;
    }
    if (alvo.dataset.bs === 'maiusculas' || alvo.dataset.bs === 'inteira') {
      const chave = alvo.dataset.bs === 'maiusculas' ? 'diferenciarMaiusculas' : 'palavraInteira';
      busca[chave] = !busca[chave];
      alvo.setAttribute('aria-pressed', String(busca[chave]));
      atualizar();
      return;
    }
    if (alvo.dataset.bsNav) return proximo(Number(alvo.dataset.bsNav));
    if (alvo.dataset.bsIr !== undefined) return irPara(Number(alvo.dataset.bsIr), true);
    if (alvo.dataset.bsMenu !== undefined) {
      const r = busca.resultados[Number(alvo.dataset.bsMenu)];
      if (r) { irPara(Number(alvo.dataset.bsMenu), false); abrirModalMenu(r.transicaoId, r.alvo.id); }
    }
  });
  // Esc fecha só o painel (sem isso o listener do document fecharia o editor).
  p.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); fecharBusca(); }
  });
  criarIcones();
}

export function abrirBusca() {
  montarPainel();
  const p = painel();
  if (!p) return;
  busca.aberta = true;
  p.classList.remove('hidden');
  $r('#bot-view-overlay')?.classList.add('busca-aberta');
  $r('#btn-bv-buscar')?.setAttribute('aria-pressed', 'true');
  const campo = p.querySelector('.bs-termo');
  campo.value = busca.termo;
  atualizar();
  campo.focus();
  campo.select();
}

export function fecharBusca() {
  busca.aberta = false;
  painel()?.classList.add('hidden');
  $r('#bot-view-overlay')?.classList.remove('busca-aberta');
  $r('#btn-bv-buscar')?.setAttribute('aria-pressed', 'false');
}

function visivel() {
  const overlay = $r('#bot-view-overlay');
  return !!overlay && !overlay.classList.contains('hidden');
}

/** Ligado uma vez (initBotViewWiring): botão no cabeçalho, atalhos e atualização ao vivo. */
export function initBusca() {
  const header = $r('#bot-view-overlay .bv-header');
  const fechar = header?.querySelector('#btn-fechar-bot-view');
  if (fechar && !$r('#btn-bv-buscar')) {
    fechar.insertAdjacentHTML('beforebegin', `<button id="btn-bv-buscar" type="button" class="bv-btn-busca" title="Localizar (Ctrl+F)" aria-label="Localizar (Ctrl+F)" aria-pressed="false"><i data-lucide="search"></i></button>`);
    $r('#btn-bv-buscar').addEventListener('click', () => (busca.aberta ? fecharBusca() : abrirBusca()));
  }

  document.addEventListener('keydown', (e) => {
    if (!visivel()) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      abrirBusca();
    } else if (e.key === 'F3' && busca.aberta) {
      e.preventDefault();
      proximo(e.shiftKey ? -1 : 1);
    }
  }, true);

  // Ao vivo: digitação nos campos e qualquer re-render do #bv-estados
  // (excluir, duplicar, mover, salvar menu, gerar tratamento, reabrir o bot).
  const estados = $r('#bv-estados');
  if (estados) {
    estados.addEventListener('input', agendarAtualizacao);
    estados.addEventListener('change', agendarAtualizacao);
    new MutationObserver(agendarAtualizacao).observe(estados, { childList: true, subtree: true });
  }
  // Editor fechado = painel fechado (não reabre sozinho no próximo bot).
  const overlay = $r('#bot-view-overlay');
  if (overlay) {
    new MutationObserver(() => { if (!visivel() && busca.aberta) fecharBusca(); })
      .observe(overlay, { attributes: true, attributeFilter: ['class'] });
  }
}
