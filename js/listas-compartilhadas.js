// ---------------------------------------------------------------------------
// Listas de sugestões (<datalist>) compartilhadas pelos campos de busca do
// editor. Antes cada campo levava a própria cópia da lista: cada Transf. Agente
// repetia todos os agentes e bots do ambiente, cada Transf. Fila todas as
// filas, cada condição a sua lista de operadores. Num bot grande isso passava
// de 100 mil <option> escondidos na tela.
//
// Agora a lista é identificada pelo CONTEÚDO: campos com as mesmas opções
// apontam (atributo `list`) para a mesma <datalist>. Um campo cujo valor
// gravado não está no ambiente ("X (não encontrado no ambiente)", comValorAtual)
// tem conteúdo diferente e ganha uma lista só dele, como antes.
//
// As listas ficam em #bv-listas, fora de #bv-estados: os re-renders do bot não
// as recriam e os observers de #bv-estados não as veem. Quem precisa da lista
// de um campo continua usando datalistDe(input) (combobox.js), que procura pelo
// id. abrirBotView zera tudo antes de desenhar o bot (todos os campos são
// recriados) e fecharBotView zera ao fechar.
// ---------------------------------------------------------------------------

import { $, escapeHtml } from './utils.js';

const idPorConteudo = new Map();
const conteudoPorId = new Map();
// Nunca volta a zero: um id não é reaproveitado por outra lista.
let sequencia = 0;

// Mesmo <option> que cada campo montava: o texto exibido em `value`, o valor
// gravado em data-value e o tópico (quando há) em data-grupo.
export function htmlDasOpcoes(opcoes) {
  return opcoes
    .map((o) => `<option value="${escapeHtml(o.label)}" data-value="${escapeHtml(o.value)}"${o.grupo ? ` data-grupo="${escapeHtml(o.grupo)}"` : ''}>`)
    .join('');
}

/** Id da <datalist> com estas opções ({ value, label, grupo? }), criada na primeira vez. */
export function listaCompartilhada(opcoes) {
  const html = htmlDasOpcoes(opcoes);
  const existente = idPorConteudo.get(html);
  if (existente) return existente;
  const id = `bv-lista-${++sequencia}`;
  idPorConteudo.set(html, id);
  conteudoPorId.set(id, html);
  $('#bv-listas')?.insertAdjacentHTML('beforeend', `<datalist id="${id}">${html}</datalist>`);
  return id;
}

/** HTML das <option> de uma lista criada aqui, ou null (usado nos testes). */
export function opcoesDaLista(id) {
  return conteudoPorId.get(id) ?? null;
}

/** Apaga todas as listas (nenhum campo aponta mais para elas). */
export function zerarListasCompartilhadas() {
  idPorConteudo.clear();
  conteudoPorId.clear();
  const caixa = $('#bv-listas');
  if (caixa) caixa.innerHTML = '';
}
