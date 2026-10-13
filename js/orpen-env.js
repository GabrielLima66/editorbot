// ---------------------------------------------------------------------------
// Leitura dos cadastros do ambiente Orpen (filas, agentes, bots, status CRM,
// scripts, checkpoints, substatus, entradas, contas OpenAI, variáveis extras)
// — só existem quando rodando como extensão em cima de ContactCenter/bot.php
// (state.ambienteOrpen vem de content/bootstrap.js, ver abrirEditorOrpen em
// orpen-bridge.js). No modo standalone (bot_transform.html sozinho, sem
// servidor) state.ambienteOrpen fica null e toda função aqui devolve lista
// vazia — quem chama sempre trata isso como "sem cadastro, mostra só o valor
// bruto", nunca quebra.
// ---------------------------------------------------------------------------
import { state } from './state.js';

function opcoesDe(lista, chaveId = 'id', chaveNome = 'name') {
  if (!Array.isArray(lista)) return [];
  return lista
    .filter((item) => item && item[chaveId] !== undefined && item[chaveId] !== null && item[chaveId] !== '')
    .map((item) => ({ value: String(item[chaveId]), label: String(item[chaveNome] ?? item[chaveId]) }));
}

export function temAmbiente() {
  return !!state.ambienteOrpen;
}

export function opcoesFilas() { return opcoesDe(state.ambienteOrpen?.queues); }
// Agentes e bots aparecem sempre com o ID junto do nome ("[Agente 12] Maria"):
// nomes se repetem, e a busca (campo e lista) passa a achar também pelo ID.
// O coletor entrega "[Agente] Maria"/"[Bot] Nome"; o prefixo é refeito aqui,
// sem mexer em state.ambienteOrpen (o fluxograma lê o nome como veio).
export function rotuloComId(tipo, id, nome) {
  const limpo = String(nome ?? '').replace(/^\[(?:Agente|Bot)(?:\s+[^\]]*)?\]\s*/u, '').trim();
  const prefixo = `[${tipo} ${id}]`;
  return limpo && limpo !== String(id) ? `${prefixo} ${limpo}` : prefixo;
}
export function opcoesAgentes() {
  return opcoesDe(state.ambienteOrpen?.agents).map((o) => ({ ...o, label: rotuloComId('Agente', o.value, o.label) }));
}
export function opcoesBots() {
  return opcoesDe(state.ambienteOrpen?.bots).map((o) => ({ ...o, label: rotuloComId('Bot', o.value, o.label) }));
}
export function opcoesCrmStatus() { return opcoesDe(state.ambienteOrpen?.crm_status); }
export function opcoesSubStatus() { return opcoesDe(state.ambienteOrpen?.subStatus); }
// Condição "ENTRADA": todas as entradas, gravando o ID (como no nativo).
export function opcoesEntradasCondicao() { return opcoesDe(state.ambienteOrpen?.entradasCondicao); }

// Ação "Enviar msg. à Entrance": entradas de WhatsApp/Facebook/Instagram,
// agrupadas pelo tipo (o nome vem como "[Tipo] entrada", como no nativo).
export function opcoesEntrancesEnvio() {
  return opcoesDe(state.ambienteOrpen?.entrances)
    .map((o) => {
      const tipo = /^\[([^\]]+)\]\s/.exec(o.label);
      return tipo ? { ...o, grupo: tipo[1] } : o;
    })
    // Um tópico por tipo: a lista precisa vir ordenada pelo grupo.
    .sort((a, b) => String(a.grupo ?? '').localeCompare(String(b.grupo ?? '')));
}
export function opcoesScripts() { return opcoesDe(state.ambienteOrpen?.scripts); }
export function opcoesCheckpoints() { return opcoesDe(state.ambienteOrpen?.checkpoints); }
export function opcoesOpenAiContas() { return opcoesDe(state.ambienteOrpen?.openAiAccounts); }
export function opcoesCalendarios() { return opcoesDe(state.ambienteOrpen?.calendars); }
export function opcoesLabels() { return opcoesDe(state.ambienteOrpen?.labels); }

// Assistentes OpenAI de todas as contas, com o mesmo rótulo que o modal
// nativo usa na lista de variáveis da condição (bot.php:3491-3500).
export function assistentesOpenAi() {
  return (state.ambienteOrpen?.openAiAccounts || []).flatMap((conta) =>
    (conta.assistants || []).map((a) => ({
      id: String(a.id),
      contaId: String(conta.id),
      rotulo: `[${conta.name}] Assistente: ${a.name}`,
      nome: a.name,
    })));
}

// Anexos do bot (ação "Enviar anexo"), vindos da API como no nativo; null
// quando não carregaram (aí o editor mostra o campo de ID).
export function opcoesAnexos() { return opcoesDe(state.ambienteOrpen?.anexos); }
export function temAnexos() { return Array.isArray(state.ambienteOrpen?.anexos); }

// Contas que têm assistentes: as únicas que o nativo oferece na ação OpenAI
// (bot.php:4426). A conta de transcrição de áudio usa opcoesOpenAiContas.
export function opcoesContasComAssistentes() {
  return opcoesDe((state.ambienteOrpen?.openAiAccounts || []).filter((c) => (c.assistants || []).length));
}

// Assistentes de uma conta (ação OpenAI: escolhe a conta, depois o assistente).
export function opcoesAssistentesDaConta(contaId) {
  const conta = (state.ambienteOrpen?.openAiAccounts || []).find((c) => String(c.id) === String(contaId));
  return (conta?.assistants || []).map((a) => ({ value: String(a.id), label: a.name }));
}

// Labels vêm da API REST da Orpen, de forma assíncrona (page-env-collector.js):
// null quando não carregaram. Sem a lista, o editor mostra o campo de IDs.
export function temLabels() {
  return Array.isArray(state.ambienteOrpen?.labels);
}

// Variáveis extras do ambiente (scripts/webservices + variáveis customizadas
// cadastradas em ctc_bot_var) — NÃO substitui VARIABLE_LABELS (dictionaries.js),
// só soma: as fixas do motor continuam vindo do dicionário estático, essas
// aqui são as que só existem neste ambiente específico.
export function variaveisAmbiente() {
  return Array.isArray(state.ambienteOrpen?.variables) ? state.ambienteOrpen.variables : [];
}

// Garante que o valor atual sempre aparece como opção selecionável, mesmo
// que não bata com nenhum cadastro do ambiente (bot vindo de outro ambiente,
// JSON importado, cadastro removido depois etc.) — sem isso o <select>
// mudaria silenciosamente o valor pro primeiro item da lista.
export function comValorAtual(opcoes, valorAtual) {
  if (valorAtual === undefined || valorAtual === null || valorAtual === '') return rotulosUnicos(opcoes);
  if (opcoes.some((o) => String(o.value) === String(valorAtual))) return rotulosUnicos(opcoes);
  return rotulosUnicos([...opcoes, { value: String(valorAtual), label: `${valorAtual} (não encontrado no ambiente)` }]);
}

// A escolha num campo de busca (input + datalist) volta como TEXTO e é
// resolvida para o ID pelo rótulo. Dois cadastros com o mesmo nome (dois
// agentes "Maria Silva", filas repetidas) gravavam sempre o ID do primeiro.
// Só os rótulos que se repetem ganham o ID; os demais ficam como estão.
export function rotulosUnicos(opcoes) {
  const contagem = new Map();
  for (const o of opcoes) contagem.set(o.label, (contagem.get(o.label) || 0) + 1);
  if (![...contagem.values()].some((n) => n > 1)) return opcoes;
  return opcoes.map((o) => (contagem.get(o.label) > 1 ? { ...o, label: `${o.label} (ID ${o.value})` } : o));
}
