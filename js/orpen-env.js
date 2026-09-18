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
export function opcoesAgentes() { return opcoesDe(state.ambienteOrpen?.agents); }
export function opcoesBots() { return opcoesDe(state.ambienteOrpen?.bots); }
export function opcoesCrmStatus() { return opcoesDe(state.ambienteOrpen?.crm_status); }
export function opcoesSubStatus() { return opcoesDe(state.ambienteOrpen?.subStatus); }
export function opcoesEntrancesEnvio() { return opcoesDe(state.ambienteOrpen?.entrances); }
export function opcoesScripts() { return opcoesDe(state.ambienteOrpen?.scripts); }
export function opcoesCheckpoints() { return opcoesDe(state.ambienteOrpen?.checkpoints); }
export function opcoesOpenAiContas() { return opcoesDe(state.ambienteOrpen?.openAiAccounts); }
export function opcoesCalendarios() { return opcoesDe(state.ambienteOrpen?.calendars); }

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
  if (valorAtual === undefined || valorAtual === null || valorAtual === '') return opcoes;
  if (opcoes.some((o) => String(o.value) === String(valorAtual))) return opcoes;
  return [...opcoes, { value: String(valorAtual), label: `${valorAtual} (não encontrado no ambiente)` }];
}
