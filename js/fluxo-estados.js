// ---------------------------------------------------------------------------
// Entradas e saídas de cada estado, para os chips "vem de / vai para" do
// cabeçalho. Mesmas regras do botão "Quem aponta para este estado"
// (origensDoEstado): campos de CAMPOS_ESTADO_POR_TIPO gravados com o número
// do estado e o timeout "Trocar estado". Uma passada só pelas ações, para
// recalcular o bot inteiro a cada edição. Só leitura.
// ---------------------------------------------------------------------------

import { CAMPOS_ESTADO_POR_TIPO, ACTION_TYPE_LABELS } from './dictionaries.js';
import { escapeHtml } from './utils.js';

// Ações que tiram a conversa do bot ou a encerram: aparecem como saída sem
// troca de estado. Transf. Agente, Transf. Fila e Finalizar.
export const TIPOS_SAIDA_FINAL = ['4', '5', '6'];

const temVariavel = (v) => String(v ?? '').includes('{$');

/**
 * Para cada estado do bot: { entradas, saidas, variaveis, finais }.
 * - entradas: de onde se chega (ações de OUTROS estados e o timeout), como
 *   origensDoEstado, na ordem de estado e transição.
 * - saidas: para onde as ações deste estado levam (inclui o próprio estado).
 * - variaveis: destinos {$...} das ações deste estado.
 * - finais: tipos de ação de TIPOS_SAIDA_FINAL presentes no estado.
 * Também devolve `porVariavel` (há alguma ação ou timeout com destino {$...}
 * no bot: qualquer estado pode ser alcançado por ela).
 */
export function fluxoDoBot(bot) {
  const porEstado = new Map();
  const vazio = () => ({ entradas: [], saidas: [], variaveis: [], finais: [] });
  (bot.BOT_STATES || []).forEach((s) => porEstado.set(String(s.STATE_NUMBER), vazio()));
  const doEstado = (n) => {
    if (!porEstado.has(n)) porEstado.set(n, vazio());
    return porEstado.get(n);
  };

  const transicaoPorId = {};
  (bot.BOT_TRANSITIONS || []).forEach((t) => { transicaoPorId[t.ID] = t; });
  let porVariavel = false;

  (bot.BOT_ACTIONS || []).forEach((a) => {
    const t = transicaoPorId[a.TRANSITION_ID];
    if (!t) return;
    const origem = String(t.STATE);
    const tipo = String(a.ACTION_TYPE);
    if (TIPOS_SAIDA_FINAL.includes(tipo) && !doEstado(origem).finais.includes(tipo)) doEstado(origem).finais.push(tipo);
    if (!a.ACTION_DATA) return;
    (CAMPOS_ESTADO_POR_TIPO[tipo] || []).forEach((campo) => {
      const valor = a.ACTION_DATA[campo];
      if (valor === undefined || valor === null || valor === '') return;
      const ponto = { estado: origem, transitionId: t.ID, prioridade: t.PRIORITY, actionId: a.ID, actionType: tipo, campo };
      if (temVariavel(valor)) {
        porVariavel = true;
        doEstado(origem).variaveis.push({ ...ponto, variavel: valor });
        return;
      }
      const destino = String(valor);
      doEstado(origem).saidas.push({ ...ponto, destino });
      if (destino !== origem && porEstado.has(destino)) doEstado(destino).entradas.push({ tipo: 'acao', ...ponto });
    });
  });

  if (bot.TIMEOUT_ACTION === 'bot') {
    if (temVariavel(bot.TIMEOUT_DESTINY)) porVariavel = true;
    else if (porEstado.has(String(bot.TIMEOUT_DESTINY ?? ''))) doEstado(String(bot.TIMEOUT_DESTINY)).entradas.push({ tipo: 'timeout' });
  }

  const num = (v) => parseInt(v, 10);
  const ordem = (a, b) => num(a.estado) - num(b.estado) || num(a.prioridade) - num(b.prioridade);
  porEstado.forEach((f) => {
    f.entradas.sort((a, b) => (a.tipo === 'timeout') - (b.tipo === 'timeout') || (a.tipo === 'timeout' ? 0 : ordem(a, b)));
    f.saidas.sort((a, b) => num(a.prioridade) - num(b.prioridade));
    f.variaveis.sort((a, b) => num(a.prioridade) - num(b.prioridade));
  });
  return { porEstado, porVariavel };
}

// ---------------------------------------------------------------- chips


const MAX_CHIPS = 5;
const CAMPO_CURTO = { callback_state: 'retorno', fallback_state: 'falha' };

// "Transição 1, Troca Estado" (ou "OpenAI (retorno)").
function descreverTransicao(p) {
  const acao = ACTION_TYPE_LABELS[p.actionType] || `Tipo ${p.actionType}`;
  return `Transição ${p.prioridade}, ${acao}${CAMPO_CURTO[p.campo] ? ` (${CAMPO_CURTO[p.campo]})` : ''}`;
}

// "3 · Menu — Transição 1, Troca Estado": de qual estado e por onde.
function descreverPonto(p, estadoPorNumero) {
  return `${p.estado} · ${estadoPorNumero[p.estado]?.ALIAS || 'Sem nome'} — ${descreverTransicao(p)}`;
}

// Até MAX_CHIPS chips; o resto vira "+N" com a lista no title.
function limitar(itens) {
  if (itens.length <= MAX_CHIPS) return itens.map((i) => i.html).join('');
  const resto = itens.slice(MAX_CHIPS - 1);
  return itens.slice(0, MAX_CHIPS - 1).map((i) => i.html).join('')
    + `<span class="fluxo-chip fluxo-mais" title="${escapeHtml(resto.map((i) => i.titulo).join('\n'))}">+${resto.length}</span>`;
}

function agrupar(pontos, chave) {
  const grupos = new Map();
  pontos.forEach((p) => {
    const k = chave(p);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(p);
  });
  return [...grupos.values()];
}

/** HTML dos chips "vem de / vai para" de um estado (cabeçalho). */
export function htmlFluxoEstado(numero, fluxo, estadoPorNumero, porVariavel) {
  const f = fluxo || { entradas: [], saidas: [], variaveis: [], finais: [] };
  const entra = [];
  if (numero === '0') entra.push({ titulo: 'Início', html: '<span class="fluxo-chip fluxo-inicio" title="Estado inicial: toda conversa nova começa aqui">início</span>' });
  agrupar(f.entradas.filter((o) => o.tipo === 'acao'), (o) => o.estado).forEach((grupo) => {
    const o = grupo[0];
    const titulo = grupo.map((p) => descreverPonto(p, estadoPorNumero)).join('\n');
    entra.push({ titulo, html: `<button type="button" class="fluxo-chip fluxo-entrada" data-action="ir-para-origem" data-origem="acao" data-state="${escapeHtml(o.estado)}" data-origem-acao="${escapeHtml(o.actionId)}" title="${escapeHtml(titulo)}">${escapeHtml(o.estado)}</button>` });
  });
  if (f.entradas.some((o) => o.tipo === 'timeout')) {
    entra.push({ titulo: 'Timeout do bot — Trocar estado', html: '<button type="button" class="fluxo-chip fluxo-entrada" data-action="ir-para-origem" data-origem="timeout" title="Timeout do bot — Trocar estado">timeout</button>' });
  }
  if (!entra.length) {
    entra.push(porVariavel
      ? { titulo: '', html: '<span class="fluxo-chip fluxo-variavel" title="Nenhuma ação aponta para este estado com número fixo, mas o bot tem destinos por {$variável}, que podem chegar aqui">só por {$}</span>' }
      : { titulo: '', html: '<span class="fluxo-chip fluxo-nenhum" title="Nenhuma ação nem o timeout apontam para este estado">ninguém</span>' });
  }

  const sai = [];
  agrupar(f.saidas, (s) => s.destino).forEach((grupo) => {
    const d = grupo[0].destino;
    const titulo = grupo.map((p) => `→ ${descreverTransicao(p)}`).join('\n');
    if (d === numero) {
      sai.push({ titulo: `↻ ${d}`, html: `<span class="fluxo-chip fluxo-proprio" title="${escapeHtml(`Volta para este mesmo estado\n${titulo}`)}">↻ ${escapeHtml(d)}</span>` });
    } else if (!estadoPorNumero[d]) {
      sai.push({ titulo: `${d} (não existe)`, html: `<span class="fluxo-chip fluxo-erro" title="${escapeHtml(`O estado ${d} não existe neste bot\n${titulo}`)}">${escapeHtml(d)}?</span>` });
    } else {
      const nome = `${d} · ${estadoPorNumero[d].ALIAS || 'Sem nome'}`;
      sai.push({ titulo: nome, html: `<button type="button" class="fluxo-chip fluxo-saida" data-action="ir-para-estado" data-state="${escapeHtml(d)}" title="${escapeHtml(`${nome}\n${titulo}`)}">${escapeHtml(d)}</button>` });
    }
  });
  agrupar(f.variaveis, (v) => v.variavel).forEach((grupo) => {
    const v = grupo[0].variavel;
    sai.push({ titulo: v, html: `<span class="fluxo-chip fluxo-variavel" title="${escapeHtml(`Destino definido na hora da conversa\n${grupo.map((p) => `→ ${descreverTransicao(p)}`).join('\n')}`)}">${escapeHtml(v)}</span>` });
  });
  f.finais.forEach((tipo) => {
    const rotulo = ACTION_TYPE_LABELS[tipo] || `Tipo ${tipo}`;
    sai.push({ titulo: rotulo, html: `<span class="fluxo-chip fluxo-final" title="${escapeHtml(`${rotulo}: a conversa sai do bot ou é encerrada aqui`)}">${escapeHtml(rotulo)}</span>` });
  });
  if (!sai.length) sai.push({ titulo: '', html: '<span class="fluxo-chip fluxo-nenhum-saida" title="Nenhuma ação deste estado troca de estado, transfere ou finaliza">—</span>' });

  return `<span class="fluxo-grupo"><span class="fluxo-rotulo">vem de</span>${limitar(entra)}</span>`
    + `<span class="fluxo-grupo"><span class="fluxo-rotulo">vai para</span>${limitar(sai)}</span>`;
}
