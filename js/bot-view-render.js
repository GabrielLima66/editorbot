import { state } from './state.js';
import {
  STATUS_LABELS,
  TIMEOUT_ACTION_LABELS,
  CRM_STATUS_LABELS,
  VARIABLE_LABELS,
  TEXT_OPERATORS,
  CONTACT_OPERATORS,
  ERROR_COUNT_OPERATORS,
  OPT_IN_UCI_OPERATORS,
  OLD_ATTENDANCE_OPERATORS,
  ENTRANCE_TYPE_OPERATORS,
  SENDER_OPERATORS,
  CONTACT_NUMBER_OPERATORS,
  ACTION_TYPE_LABELS,
  OPENAI_METHOD_LABELS,
  UPDATE_CONTACT_LABELS,
  VARIABLE_KIND,
  GRUPOS_VARIAVEL,
  agruparOpcoes,
} from './dictionaries.js';
import { $, escapeHtml, optionsHtml, entriesToOptions } from './utils.js';
import { criarIcones, marcarCamposSemAutopreenchimento } from './dom-root.js';
import { fecharCombobox } from './combobox.js';
import { fecharVariaveisTexto } from './variaveis-texto.js';
import { parseMenuModel, renderMenuBuilderShell, initMenuBuilders } from './menu-builder.js';
import { renderVariaveisBuilder, initVariaveisBuilders, atualizarDatalistsVariaveis } from './variaveis-builder.js';
import { renderMenuResumo, renderMenuVazio, menuVazio, tipoDoModal } from './menu-modal.js';
import {
  temAmbiente, opcoesFilas, opcoesAgentes, opcoesBots, opcoesCrmStatus, opcoesSubStatus,
  opcoesEntrancesEnvio, opcoesEntradasCondicao, opcoesScripts, opcoesCheckpoints, opcoesOpenAiContas,
  opcoesCalendarios, comValorAtual, opcoesLabels, temLabels,
  assistentesOpenAi, opcoesAssistentesDaConta, opcoesContasComAssistentes,
  opcoesAnexos, temAnexos,
} from './orpen-env.js';

// Kinds cuja variável cai no switch genérico de check_condition() (Bot.class.php,
// bloco final "case 0: return true") — só nesses "Sempre verdadeiro" de fato
// sempre retorna true. Toda variável com elseif dedicado que retorna dentro do
// próprio bloco (entrance_type, calendario/calendario_falso, agent_on_queue,
// agent_online, agent_available_on_chat, status_last_att, entrance, sender,
// old_attendance) ou que ignora CONDITION_TYPE (contact_number,
// assistant_analysis_status) NUNCA chega nesse case — na melhor das hipóteses
// a opção é ignorada, na pior retorna sempre falso (sender, status_last_att,
// entrance) ou produz resultado indefinido (old_attendance com $where não
// setado). Confirmado lendo Bot.class.php::check_condition() por completo —
// ver bot-engine-spec.md §1. Removida do dropdown pra essas kinds.
const KINDS_COM_SEMPRE_VERDADEIRO = new Set(['text', 'contact', 'error_count', 'opt_in_uci', 'openai_text', 'none']);

// Monta a lista completa de operadores pra uma variável ("Sempre verdadeiro
// (else)" no topo só quando funcional pra essa kind — ver
// KINDS_COM_SEMPRE_VERDADEIRO acima) e garante que o valor atual apareça mesmo
// se for de um cadastro externo (fila/agente/entrada/calendário) que não
// temos aqui.
export const IA_OPERADORES = [{ value: '1', label: 'Status da análise' }, { value: '2', label: 'Conteúdo da análise' }];
export const IA_STATUS = [{ value: 'success', label: 'Sucesso' }, { value: 'error', label: 'Falha' }];
export const IA_CONTEUDO = [{ value: '1', label: 'Igual a' }, { value: '2', label: 'Contém' }, { value: '3', label: 'Diferente de' }, { value: '4', label: 'Não contém' }];

export function buildOperatorOptions(kind, currentValue) {
  const sempre = { value: '0', label: 'Sempre verdadeiro (else)' };
  let base;
  switch (kind) {
    case 'text': base = entriesToOptions(TEXT_OPERATORS); break;
    case 'contact': base = entriesToOptions(CONTACT_OPERATORS); break;
    case 'error_count': base = entriesToOptions(ERROR_COUNT_OPERATORS); break;
    case 'opt_in_uci': base = entriesToOptions(OPT_IN_UCI_OPERATORS); break;
    case 'old_attendance': base = entriesToOptions(OLD_ATTENDANCE_OPERATORS); break;
    case 'entrance_type': base = entriesToOptions(ENTRANCE_TYPE_OPERATORS); break;
    case 'sender': base = entriesToOptions(SENDER_OPERATORS); break;
    case 'contact_number': base = entriesToOptions(CONTACT_NUMBER_OPERATORS); break;
    // Condição de I.A. como no nativo (bot.php:3691-3717): o operador é o
    // tipo da análise; Sucesso/Falha ou Igual a/Contém… vêm num campo abaixo.
    case 'openai': base = IA_OPERADORES; break;
    case 'openai_status': base = IA_STATUS; break;
    case 'openai_text': base = entriesToOptions({ '1': 'Igual a', '2': 'Contém', '3': 'Diferente de', '4': 'Não contém' }); break;
    case 'ref_calendario': base = temAmbiente() ? comValorAtual(opcoesCalendarios(), currentValue) : [{ value: currentValue ?? '', label: `ID ${currentValue ?? '—'} (cadastro externo)` }]; break;
    case 'ref_fila': base = temAmbiente() ? comValorAtual(opcoesFilas(), currentValue) : [{ value: currentValue ?? '', label: `ID ${currentValue ?? '—'} (cadastro externo)` }]; break;
    case 'ref_agente': base = temAmbiente() ? comValorAtual(opcoesAgentes(), currentValue) : [{ value: currentValue ?? '', label: `ID ${currentValue ?? '—'} (cadastro externo)` }]; break;
    case 'ref_crm_status': base = temAmbiente() ? comValorAtual(opcoesCrmStatus(), currentValue) : [{ value: currentValue ?? '', label: `ID ${currentValue ?? '—'} (cadastro externo)` }]; break;
    case 'ref_entrance': base = temAmbiente() ? comValorAtual(opcoesEntradasCondicao(), currentValue) : [{ value: currentValue ?? '', label: `ID ${currentValue ?? '—'} (cadastro externo)` }]; break;
    case 'ref': base = [{ value: currentValue ?? '', label: `ID ${currentValue ?? '—'} (cadastro externo, não disponível no JSON)` }]; break;
    case 'none': base = [{ value: currentValue ?? '', label: '— (variável sem operador)' }]; break;
    default: base = [];
  }
  const list = KINDS_COM_SEMPRE_VERDADEIRO.has(kind) ? [sempre, ...base] : [...base];
  if (currentValue !== undefined && currentValue !== null && currentValue !== '' && !list.some(o => String(o.value) === String(currentValue))) {
    list.push({ value: currentValue, label: `Tipo ${currentValue}` });
  }
  return list;
}

export function renderCondicao(c, indice, total) {
  const variable = c.CONDITION_DATA?.variable ?? '';
  const isAssistant = c.CONDITION_DATA && c.CONDITION_DATA.assistant_id !== undefined;
  const iaStatus = isAssistant && variable === 'assistant_analysis_status';
  const kind = isAssistant ? 'openai' : (VARIABLE_KIND[variable] || 'text');
  const attrsCond = `data-transition-id="${escapeHtml(c.TRANSITION_ID)}" data-condition-id="${escapeHtml(c.ID)}"`;

  // Assistente OpenAI, no formato do modal nativo (bot.php:3691-3740): a
  // variável é o assistente ("[Conta] Assistente: Nome"), o operador é o tipo
  // da análise (Status/Conteúdo) e o detalhe vem abaixo. check_condition lê
  // o status de CONDITION_DATA.value e o operador de conteúdo de
  // CONDITION_DATA.type (Bot.class.php:609-629).
  const currentType = isAssistant ? (iaStatus ? '1' : '2') : (c.CONDITION_TYPE ?? '');
  const operatorOptions = buildOperatorOptions(kind, currentType);

  // Mesmo nome da lista (nome do nativo quando há ambiente).
  let textoVariavel = nomeVariavelCondicao(variable);
  let assistantLine = '';
  if (isAssistant) {
    const idAssistente = String(c.CONDITION_DATA.assistant_id ?? '');
    const assistente = assistentesOpenAi().find((a) => a.id === idAssistente);
    textoVariavel = assistente ? assistente.rotulo : (idAssistente ? `Assistente ${idAssistente} (não encontrado)` : '');
    const detalheOpcoes = iaStatus ? IA_STATUS : IA_CONTEUDO;
    const detalheAtual = String((iaStatus ? c.CONDITION_DATA.value : c.CONDITION_DATA.type) ?? '');
    const detalheTexto = detalheOpcoes.find((o) => o.value === detalheAtual)?.label ?? detalheAtual;
    const listaId = `ia-detalhe-${c.ID}`;
    assistantLine = `<div class="mb-1.5"><input type="search" list="${escapeHtml(listaId)}" class="field-view" value="${escapeHtml(detalheTexto)}" data-action="mudar-condicao-ia-detalhe" ${attrsCond}><datalist id="${escapeHtml(listaId)}">${detalheOpcoes.map((o) => `<option value="${escapeHtml(o.label)}" data-value="${escapeHtml(o.value)}">`).join('')}</datalist></div>`;
  }

  const valorBruto = c.CONDITION_DATA?.value ?? '';
  const valor = Array.isArray(valorBruto) ? valorBruto.join(', ') : valorBruto;

  const ehLabels = String(c.CONDITION_TYPE) === '18' && !isAssistant;
  const esconderValor = iaStatus || ['openai_status', 'ref_calendario', 'ref_fila', 'ref_agente', 'ref_crm_status', 'ref_entrance', 'ref'].includes(kind);
  const textareaHtml = `<textarea rows="2" class="textarea-view${esconderValor ? ' hidden' : ''}"${ehLabels ? ' placeholder="IDs das labels, separados por vírgula"' : ''} data-action="mudar-condicao-valor" data-transition-id="${escapeHtml(c.TRANSITION_ID)}" data-condition-id="${escapeHtml(c.ID)}">${escapeHtml(valor)}</textarea>`;
  const valorHtml = ehLabels
    ? campoLabels(null, valorBruto, `data-alvo="condicao" data-transition-id="${escapeHtml(c.TRANSITION_ID)}" data-condition-id="${escapeHtml(c.ID)}"`, textareaHtml)
    : textareaHtml;

  return `
    <div class="condicao-item">
      <div class="flex gap-1.5">
        <div class="reorder-stack shrink-0">
          <button type="button" class="reorder-btn" data-action="mover-condicao" data-transition-id="${escapeHtml(c.TRANSITION_ID)}" data-condition-id="${escapeHtml(c.ID)}" data-dir="-1"${indice === 0 ? ' disabled' : ''} title="Mover para cima"><i data-lucide="chevron-up" class="w-3 h-3 pointer-events-none"></i></button>
          <button type="button" class="reorder-btn" data-action="mover-condicao" data-transition-id="${escapeHtml(c.TRANSITION_ID)}" data-condition-id="${escapeHtml(c.ID)}" data-dir="1"${indice === total - 1 ? ' disabled' : ''} title="Mover para baixo"><i data-lucide="chevron-down" class="w-3 h-3 pointer-events-none"></i></button>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex gap-2 mb-1.5">
            <input type="search" list="variaveis-datalist" class="field-view condicao-variavel flex-1" value="${escapeHtml(textoVariavel)}"${isAssistant ? ' placeholder="Escolha o assistente"' : ''} data-action="mudar-condicao-variavel" data-transition-id="${escapeHtml(c.TRANSITION_ID)}" data-condition-id="${escapeHtml(c.ID)}">
            <input type="search" list="operador-datalist-${escapeHtml(c.ID)}" class="field-view condicao-operador flex-1" value="${escapeHtml((operatorOptions.find(o => String(o.value) === String(currentType)) || {}).label ?? '')}" data-action="mudar-condicao-operador" data-kind="${escapeHtml(kind)}" data-transition-id="${escapeHtml(c.TRANSITION_ID)}" data-condition-id="${escapeHtml(c.ID)}">
            <datalist id="operador-datalist-${escapeHtml(c.ID)}">${operatorOptions.map(o => `<option value="${escapeHtml(o.label)}" data-value="${escapeHtml(o.value)}">`).join('')}</datalist>
          </div>
          ${assistantLine}
          ${valorHtml}
        </div>
        <button type="button" class="item-delete-btn shrink-0" data-action="delete-condicao" data-transition-id="${escapeHtml(c.TRANSITION_ID)}" data-condition-id="${escapeHtml(c.ID)}" title="Excluir condição"><i data-lucide="trash-2" class="w-3.5 h-3.5 pointer-events-none"></i></button>
      </div>
      <div class="item-delete-panel hidden mt-2" data-role="item-delete-panel"></div>
    </div>`;
}

export function campoBloco(label, valorHtml) {
  return `<div class="mb-2 last:mb-0"><p class="estado-empty text-[11px] mb-1">${escapeHtml(label)}</p>${valorHtml}</div>`;
}

// Campo de referência a outro estado do bot (destiny/callback_state/
// fallback_state) — lista todos os estados via datalist (autocomplete "N -
// ALIAS"), mas continua um <input> de texto normal: dá pra escolher da lista
// OU digitar qualquer valor (inclusive um número de estado que não existe
// neste bot, ex. referência cruzada). data-campo identifica qual chave de
// ACTION_DATA esse input edita; a extração do número na hora de salvar
// acontece em mudarCampoEstadoAcao.
export function campoEstadoLivre(label, estadoPorNumero, transitionId, actionId, campo, selected) {
  const estado = estadoPorNumero[selected];
  const valorExibido = estado ? `${estado.STATE_NUMBER} - ${estado.ALIAS}` : (selected ?? '');
  return campoBloco(label, `<input type="search" list="bv-estados-datalist" class="field-view" value="${escapeHtml(valorExibido)}" data-action="mudar-estado-acao" data-transition-id="${escapeHtml(transitionId)}" data-action-id="${escapeHtml(actionId)}" data-campo="${escapeHtml(campo)}">`);
}

// Troca Estado (ACTION_TYPE 2) precisa ser sempre um dos estados reais do
// bot — diferente de callback_state/fallback_state (que podem legitimamente
// apontar pra algo fora do bot), aqui não faz sentido digitar valor livre,
// então é um <select> travado na lista, sem datalist/texto livre. Ganha
// também um botão de atalho pra pular direto pro estado apontado (abre o
// card dele, mesmo se estiver fechado/fora da tela) — só faz sentido aqui,
// já que é o único campo de estado com garantia de sempre apontar pra um
// estado que existe de verdade no bot.
export function campoEstadoDestinoComAtalho(estadoPorNumero, transitionId, actionId, selected) {
  const opcoes = Object.values(estadoPorNumero).map(e => ({ value: e.STATE_NUMBER, label: `[${e.STATE_NUMBER}] ${e.ALIAS}` }));
  const selectHtml = `<select class="field-view flex-1" data-action="mudar-campo-acao" data-transition-id="${escapeHtml(transitionId)}" data-action-id="${escapeHtml(actionId)}" data-campo="destiny">${optionsHtml(opcoes, selected)}</select>`;
  const temEstado = selected !== undefined && selected !== null && selected !== '' && estadoPorNumero[selected];
  const btnHtml = `<button type="button" class="ir-para-estado-btn shrink-0" data-action="ir-para-estado" data-state="${escapeHtml(selected ?? '')}" title="Ir para este estado"${temEstado ? '' : ' disabled'}><i data-lucide="arrow-right" class="w-3.5 h-3.5 pointer-events-none"></i></button>`;
  return campoBloco('Estado de destino', `<div class="flex gap-1.5">${selectHtml}${btnHtml}</div>`);
}

// Campo de texto livre e editável de uma ACTION_DATA qualquer (ex.: destiny
// de Transf. Agente/Fila) — diferente de campoTexto (somente leitura), este
// é usado quando o valor pode/deve ser digitado direto aqui, mesmo sendo um
// ID de cadastro externo (fila/agente): a ferramenta não sabe o valor certo,
// mas deixa preencher um placeholder/mock em vez de travar como readonly.
export function campoTextoEditavel(label, transitionId, actionId, campo, valor) {
  return campoBloco(label, `<input type="text" class="field-view" value="${escapeHtml(valor ?? '')}" data-action="mudar-campo-acao" data-transition-id="${escapeHtml(transitionId)}" data-action-id="${escapeHtml(actionId)}" data-campo="${escapeHtml(campo)}">`);
}

// Igual campoArea, mas editável — mesma mutação genérica (mudarCampoAcao)
// dos outros campos "de texto livre" de uma ação.
export function campoAreaEditavel(label, transitionId, actionId, campo, valor, rows, mono) {
  return campoBloco(label, `<textarea rows="${rows || 2}" class="textarea-view${mono ? ' font-mono text-xs' : ''}" data-action="mudar-campo-acao" data-transition-id="${escapeHtml(transitionId)}" data-action-id="${escapeHtml(actionId)}" data-campo="${escapeHtml(campo)}">${escapeHtml(valor ?? '')}</textarea>`);
}

// Igual campoSelect, mas editável — mesma mutação genérica (mudarCampoAcao).
export function campoSelectEditavel(label, options, transitionId, actionId, campo, selected) {
  return campoBloco(label, `<select class="field-view" data-action="mudar-campo-acao" data-transition-id="${escapeHtml(transitionId)}" data-action-id="${escapeHtml(actionId)}" data-campo="${escapeHtml(campo)}">${optionsHtml(options, selected)}</select>`);
}

// Igual campoSelectEditavel, mas com busca por texto em vez de lista aberta
// (input + datalist) — pra listas longas (ex.: "Campo a atualizar" de
// Atualizar contato, 12 opções). `datalistId` precisa ter uma entrada
// correspondente em DICTS_BUSCAVEIS pro handler resolver o texto de volta
// pra chave interna.
export function campoBuscavel(label, dict, datalistId, transitionId, actionId, campo, selected) {
  const texto = dict[selected] ?? selected ?? '';
  return campoBloco(label, `<input type="search" list="${escapeHtml(datalistId)}" class="field-view" value="${escapeHtml(texto)}" data-action="mudar-campo-acao-buscavel" data-dict="${escapeHtml(datalistId)}" data-transition-id="${escapeHtml(transitionId)}" data-action-id="${escapeHtml(actionId)}" data-campo="${escapeHtml(campo)}">`);
}

// Helper para renderizar dropdown nativo de campos do ambiente, com fallback
// pra input de texto quando roda em standalone (sem dados vivos do Orpen).
export function campoAmbienteSelect(label, optionsFn, transitionId, actionId, campo, selected) {
  if (temAmbiente()) {
    const opcoes = comValorAtual(optionsFn(), selected);
    // Para listas grandes (agentes, filas, scripts, etc.), uma barra de busca
    // (<input list="...">) é muito superior a um <select> comum.
    const datalistId = `dl-${actionId}-${campo}`;
    const selectedOpt = opcoes.find(o => String(o.value) === String(selected));
    const textoExibido = selectedOpt ? selectedOpt.label : (selected ?? '');

    const datalistHtml = `<datalist id="${escapeHtml(datalistId)}">${opcoes.map(o => `<option value="${escapeHtml(o.label)}" data-value="${escapeHtml(o.value)}"${o.grupo ? ` data-grupo="${escapeHtml(o.grupo)}"` : ''}>`).join('')}</datalist>`;
    const inputHtml = `<input type="search" list="${escapeHtml(datalistId)}" class="field-view" value="${escapeHtml(textoExibido)}" data-action="mudar-campo-acao-ambiente-buscavel" data-transition-id="${escapeHtml(transitionId)}" data-action-id="${escapeHtml(actionId)}" data-campo="${escapeHtml(campo)}">`;

    return campoBloco(label, inputHtml + datalistHtml);
  }
  return campoTextoEditavel(label + ' (ID)', transitionId, actionId, campo, selected);
}

// Labels de contato ("Possui os labels" na condição 18 e "Adicionar labels"
// na ação 16): o motor grava/compara IDs (Bot.class.php:1015, 1518), mas a
// pessoa escolhe pelo nome, como no select do modal nativo. Cada label
// escolhida vira um chip com ×; o campo de busca (datalist) adiciona.
// `alvoAttrs` identifica onde gravar (condição ou ação). Sem a lista de
// labels (API da Orpen fora, modo avulso), cai no campo de IDs.
// Mesmo comportamento do select2 múltiplo do modal nativo (bot.php:1136-1174):
// o campo mostra as labels escolhidas (× remove); clicar abre a lista das que
// faltam, com busca no topo; escolher uma adiciona e fecha. Eventos em
// bot-view-interactions.js (abrir-labels, escolher-label, remover-label,
// busca em data-role="labels-busca").
export function campoLabels(rotulo, ids, alvoAttrs, fallbackHtml) {
  if (!temLabels()) return fallbackHtml;
  const opcoes = opcoesLabels();
  const selecionadas = (Array.isArray(ids) ? ids : String(ids ?? '').split(',')).map((s) => String(s).trim()).filter(Boolean);
  const nomeDe = (id) => opcoes.find((o) => o.value === id)?.label ?? `ID ${id} (não encontrada)`;
  const chips = selecionadas.map((id) => `<span class="label-chip">${escapeHtml(nomeDe(id))}<button type="button" class="label-chip-remover" data-action="remover-label" data-label-id="${escapeHtml(id)}" ${alvoAttrs} title="Remover" aria-label="Remover ${escapeHtml(nomeDe(id))}"><i data-lucide="x" class="w-3 h-3 pointer-events-none"></i></button></span>`).join('');
  const disponiveis = opcoes.filter((o) => !selecionadas.includes(o.value));
  const itens = disponiveis.length
    ? disponiveis.map((o) => `<li><button type="button" class="labels-opcao" data-action="escolher-label" data-label-id="${escapeHtml(o.value)}" data-busca="${escapeHtml(o.label.toLowerCase())}" ${alvoAttrs}>${escapeHtml(o.label)}</button></li>`).join('')
    : '';
  const campo = `
    <div class="labels-campo">
      <div class="labels-caixa field-view" data-action="abrir-labels" role="button" tabindex="0" aria-haspopup="listbox">${chips}${selecionadas.length ? '' : '<span class="labels-placeholder">Selecione as labels</span>'}</div>
      <div class="labels-lista hidden">
        <input type="search" class="field-view labels-busca" data-role="labels-busca" placeholder="Buscar" spellcheck="false" autocomplete="off">
        <ul role="listbox">${itens}</ul>
        <p class="labels-sem-resultado${disponiveis.length ? ' hidden' : ''}">Nenhum resultado</p>
      </div>
    </div>`;
  return rotulo ? campoBloco(rotulo, campo) : campo;
}

// Variáveis que uma condição pode usar, como na lista do modal nativo: as
// fixas do motor, as do ambiente (bot_variables/ctc_bot_var) e os
// assistentes OpenAI. As genéricas assistant_analysis_* não aparecem (no
// nativo a condição de I.A. se escolhe pelo assistente).
//
// Na Orpen a lista vem da própria página (bot_variables do nativo, via
// page-env-collector.js), com os nomes e as regras de exibição do nativo
// (bot.php:3323-3364): variáveis de script só com a ação "Executar Script"
// daquele script no bot; as da Automação só com "Executar Automação".
// Sem ambiente (modo avulso), usa o dicionário fixo.
function variaveisDoAmbienteCondicao() {
  return (state.ambienteOrpen?.variables || []).filter((v) => v && v.id && !String(v.id).startsWith('asst_'));
}

export function opcoesVariavelCondicao(bot = state.botCarregado) {
  const doAmbiente = variaveisDoAmbienteCondicao();
  let opcoes;
  if (!doAmbiente.length) {
    const fixas = { ...VARIABLE_LABELS };
    delete fixas.assistant_analysis_status;
    delete fixas.assistant_analysis_text;
    opcoes = agruparOpcoes(fixas, GRUPOS_VARIAVEL);
  } else {
    const acoes = bot?.BOT_ACTIONS || [];
    const temAutomacao = acoes.some((a) => String(a.ACTION_TYPE) === '22');
    const scripts = new Set(acoes.filter((a) => String(a.ACTION_TYPE) === '7').map((a) => String(a.ACTION_DATA?.script_name ?? '')));
    const grupoFixo = {};
    GRUPOS_VARIAVEL.forEach(([grupo, chaves]) => chaves.forEach((k) => { grupoFixo[k] = grupo; }));
    const fixas = [];
    const doBot = [];
    const deScripts = [];
    doAmbiente.forEach((v) => {
      const item = { value: String(v.id), label: v.name || String(v.id) };
      if (v.parent === 'automate') {
        if (temAutomacao) fixas.push({ ...item, grupo: 'Automação' });
      } else if (v.parent) {
        if (scripts.has(v.parent)) deScripts.push({ ...item, grupo: 'Scripts' });
      } else if (VARIABLE_LABELS[v.id] !== undefined) {
        fixas.push({ ...item, grupo: grupoFixo[v.id] || 'Outras' });
      } else {
        doBot.push({ ...item, grupo: 'Variáveis do bot' });
      }
    });
    // Fixas na ordem dos tópicos (GRUPOS_VARIAVEL), depois as do bot e dos scripts.
    const ordemGrupo = [...GRUPOS_VARIAVEL.map(([g]) => g), 'Outras'];
    fixas.sort((a, b) => ordemGrupo.indexOf(a.grupo) - ordemGrupo.indexOf(b.grupo));
    opcoes = [...fixas, ...doBot, ...deScripts];
  }
  assistentesOpenAi().forEach((a) => opcoes.push({ value: a.id, label: a.rotulo, grupo: 'Assistentes OpenAI', assistente: true }));
  return opcoes;
}

// Nome da variável como aparece na lista; também para as que estão
// escondidas agora (ex.: script removido do fluxo), para não virar código.
export function nomeVariavelCondicao(variavel) {
  const doAmbiente = variaveisDoAmbienteCondicao().find((v) => String(v.id) === String(variavel));
  return doAmbiente?.name || VARIABLE_LABELS[variavel] || variavel;
}

// A lista de variáveis depende das ações do bot (scripts e Automação):
// refeita ao abrir o bot e a cada mudança numa transição.
export function atualizarListaVariaveisCondicao(bot = state.botCarregado) {
  const lista = $('#variaveis-datalist');
  if (!lista) return;
  lista.innerHTML = opcoesVariavelCondicao(bot)
    .map((o) => `<option value="${escapeHtml(o.label)}" data-value="${escapeHtml(o.value)}" data-grupo="${escapeHtml(o.grupo)}"${o.assistente ? ' data-assistente="1"' : ''}>`)
    .join('');
}

// Ação "Enviar mensagem de áudio" (20), igual ao modal nativo
// (bot.php:4521-4583): vozes da OpenAI agrupadas por idioma e botão para
// ouvir o exemplo. Só o nome da voz é gravado (model_audio); o idioma serve
// para escolher qual exemplo tocar, como no nativo.
export const AUDIO_VOZES = ['alloy', 'echo', 'fable', 'nova', 'onyx', 'shimmer'];
export const AUDIO_IDIOMAS = [{ rotulo: 'Português', pasta: 'pt' }, { rotulo: 'Inglês', pasta: 'us' }, { rotulo: 'Espanhol', pasta: 'es' }];
export const AUDIO_MODELOS = [{ value: 'tts-1', label: 'TTS-1' }, { value: 'tts-1-hd', label: 'TTS-1-HD' }];

function campoVozAudio(a, voz) {
  const atual = voz || AUDIO_VOZES[0];
  let marcada = false;
  const grupos = AUDIO_IDIOMAS.map((idioma) => `<optgroup label="${escapeHtml(idioma.rotulo)}">${AUDIO_VOZES.map((v) => {
    // Mesma voz aparece nos três idiomas; marca só a primeira, como o .val() do nativo.
    const sel = !marcada && v === atual;
    if (sel) marcada = true;
    return `<option value="${escapeHtml(v)}" data-pasta="${escapeHtml(idioma.pasta)}"${sel ? ' selected' : ''}>${escapeHtml(v)}</option>`;
  }).join('')}</optgroup>`).join('');
  const extra = marcada ? '' : `<option value="${escapeHtml(atual)}" selected>${escapeHtml(atual)}</option>`;
  return campoBloco('Voz', `<div class="flex gap-2"><select class="field-view flex-1" data-action="mudar-campo-acao" data-transition-id="${escapeHtml(a.TRANSITION_ID)}" data-action-id="${escapeHtml(a.ID)}" data-campo="model_audio">${extra}${grupos}</select><button type="button" class="ir-para-estado-btn shrink-0" data-action="ouvir-voz" title="Ouvir exemplo da voz" aria-label="Ouvir exemplo da voz"><i data-lucide="play" class="w-4 h-4 pointer-events-none"></i></button></div>`);
}

// ACTION_DATA em branco pra cada tipo, usado quando o usuário troca o tipo de
// uma ação já existente (bot-engine-spec.md §5 — nomes de campo 1:1 com
// execute_action(), sem inventar nada além do que o motor real usa).
export function defaultActionData(tipo) {
  switch (tipo) {
    case '1': return { message_text: '' };
    case '2': return { destiny: '' };
    case '4': return { destiny: '' };
    case '5': return { destiny: '' };
    case '6': return { crm_status: '' };
    case '7': return { script_name: '' };
    case '8': return { error_count: 'add' };
    case '9': return { check_point: '' };
    case '10': return { message_option_text: '' };
    case '11': return { message_option_form: '' };
    case '12': return { entrances: '' };
    case '13': return { bot_variables_text: '' };
    case '14': return { substatus: '' };
    case '15': return { message_text: '' };
    case '16': return { update_contact_value: '' };
    case '17': return { send_file: '' };
    case '18': return { openai: 'call_assistant', openai_account: '', assistant_id: '', assistant_content: '', callback_state: '' };
    case '19': return { protocol_note: '' };
    case '20': return { message_content: '', callback_state: '', fallback_state: '', model_audio: 'alloy', model_openai: 'tts-1', speed: '1' };
    case '21': return { contact_item_type: 'EMAIL', message_text: '' };
    case '22': return { url: '', payload: '', callback_state: '', fallback_state: '', timeout: '' };
    default: return {};
  }
}

export function renderAcao(a, estadoPorNumero, indice, total) {
  const d = a.ACTION_DATA || {};
  let corpo;
  switch (a.ACTION_TYPE) {
    case '1':
      corpo = campoAreaEditavel('Mensagem', a.TRANSITION_ID, a.ID, 'message_text', d.message_text, 2);
      break;
    case '2':
      corpo = campoEstadoDestinoComAtalho(estadoPorNumero, a.TRANSITION_ID, a.ID, d.destiny);
      break;
    case '4':
      // Ação nativa "Transf. Agente" (Action 4) na Orpen popula tanto agentes
      // quanto bots no mesmo select (ver optGroupAgents/optGroupBots em
      // ContactCenter/bot.php:3820-3840) — replica aqui pra manter paridade.
      corpo = campoAmbienteSelect('Agente / bot destino', () => [
        ...opcoesAgentes().map((o) => ({ ...o, grupo: 'Agentes' })),
        ...opcoesBots().map((o) => ({ ...o, grupo: 'Bots' })),
      ], a.TRANSITION_ID, a.ID, 'destiny', d.destiny);
      break;
    case '5':
      // Fila é o destino mais comum, mas o campo historicamente aceita
      // número de fila/bot/agente — junta as três listas do ambiente.
      corpo = campoAmbienteSelect('Fila / bot / agente destino', () => [...opcoesFilas(), ...opcoesBots(), ...opcoesAgentes()], a.TRANSITION_ID, a.ID, 'destiny', d.destiny);
      break;
    case '6': {
      if (temAmbiente()) {
        corpo = campoAmbienteSelect('Status CRM', opcoesCrmStatus, a.TRANSITION_ID, a.ID, 'crm_status', d.crm_status);
      } else {
        const opcoesCrm = entriesToOptions(CRM_STATUS_LABELS);
        if (d.crm_status && !opcoesCrm.some(o => o.value === d.crm_status)) opcoesCrm.push({ value: d.crm_status, label: d.crm_status });
        corpo = campoSelectEditavel('Status CRM', opcoesCrm, a.TRANSITION_ID, a.ID, 'crm_status', d.crm_status);
      }
      break;
    }
    case '7':
      corpo = campoAmbienteSelect('Script', opcoesScripts, a.TRANSITION_ID, a.ID, 'script_name', d.script_name);
      break;
    case '8':
      corpo = campoSelectEditavel('Ação', [{ value: 'add', label: 'Incrementar' }, { value: 'reset', label: 'Zerar' }], a.TRANSITION_ID, a.ID, 'error_count', d.error_count);
      break;
    case '9':
      corpo = campoAmbienteSelect('Checkpoint', opcoesCheckpoints, a.TRANSITION_ID, a.ID, 'check_point', d.check_point);
      break;
    case '10': {
      const model = parseMenuModel(d.message_option_text || '');
      // Botões, Lista e WebChat: resumo + modal (js/menu-modal.js).
      if (tipoDoModal(model.kind)) {
        corpo = renderMenuResumo(model, a.TRANSITION_ID, a.ID);
        break;
      }
      // Ação nova/vazia: cartão "Criar menu" (abre o modal já em Botões).
      // Conteúdo não reconhecido NÃO cai aqui: segue no builder antigo, pra
      // nada ser sobrescrito.
      if (menuVazio(d.message_option_text)) {
        corpo = renderMenuVazio(a.TRANSITION_ID, a.ID);
        break;
      }
      const uid = 'mb' + (++state.menuBuilderSeq);
      state.MENU_MODELS[uid] = model;
      corpo = renderMenuBuilderShell(uid, model, a.TRANSITION_ID, a.ID);
      break;
    }
    case '11':
      corpo = campoAreaEditavel('Formulário (JSON)', a.TRANSITION_ID, a.ID, 'message_option_form', d.message_option_form, 6, true);
      break;
    case '12':
      corpo = campoAmbienteSelect('Entrada destino', opcoesEntrancesEnvio, a.TRANSITION_ID, a.ID, 'entrances', d.entrances);
      break;
    case '13':
      corpo = campoBloco('Variáveis a armazenar', renderVariaveisBuilder(a.TRANSITION_ID, a.ID, d.bot_variables_text));
      break;
    case '14':
      corpo = campoAmbienteSelect('Substatus', opcoesSubStatus, a.TRANSITION_ID, a.ID, 'substatus', d.substatus);
      break;
    case '15':
      corpo = campoTextoEditavel('Nome da tag', a.TRANSITION_ID, a.ID, 'message_text', d.message_text);
      break;
    case '16':
      corpo = campoBuscavel('Campo a atualizar', UPDATE_CONTACT_LABELS, 'update-contact-datalist', a.TRANSITION_ID, a.ID, 'update_contact_value', d.update_contact_value)
        + (d.labels !== undefined
          ? campoLabels(
            'Labels',
            d.labels,
            `data-alvo="acao" data-transition-id="${escapeHtml(a.TRANSITION_ID)}" data-action-id="${escapeHtml(a.ID)}"`,
            campoTextoEditavel('IDs das labels (separados por vírgula)', a.TRANSITION_ID, a.ID, 'labels', Array.isArray(d.labels) ? d.labels.join(', ') : d.labels),
          )
          : '')
        + (d.contact_item_type !== undefined ? campoSelectEditavel('Tipo de contato', [{ value: 'phone', label: 'Telefone' }, { value: 'email', label: 'E-mail' }], a.TRANSITION_ID, a.ID, 'contact_item_type', d.contact_item_type) : '')
        + (d.message_text !== undefined ? campoTextoEditavel('Valor', a.TRANSITION_ID, a.ID, 'message_text', d.message_text) : '');
      break;
    case '17':
      // Lista de anexos do bot como no nativo (bot.php:4348-4386); o campo de
      // ID só aparece se a lista não carregou.
      corpo = temAnexos()
        ? campoAmbienteSelect('Arquivo', opcoesAnexos, a.TRANSITION_ID, a.ID, 'send_file', d.send_file)
        : campoTextoEditavel('Arquivo (ID)', a.TRANSITION_ID, a.ID, 'send_file', d.send_file);
      break;
    case '18':
      corpo = campoSelectEditavel('Método', entriesToOptions(OPENAI_METHOD_LABELS), a.TRANSITION_ID, a.ID, 'openai', d.openai)
        // Como no nativo (bot.php:4419-4449): conta (só as que têm
        // assistentes) e depois o assistente daquela conta.
        + campoAmbienteSelect('Conta OpenAI', opcoesContasComAssistentes, a.TRANSITION_ID, a.ID, 'openai_account', d.openai_account)
        + campoAmbienteSelect('Assistente', () => opcoesAssistentesDaConta(d.openai_account), a.TRANSITION_ID, a.ID, 'assistant_id', d.assistant_id)
        + campoEstadoLivre('Estado de callback', estadoPorNumero, a.TRANSITION_ID, a.ID, 'callback_state', d.callback_state)
        + campoAreaEditavel('Conteúdo', a.TRANSITION_ID, a.ID, 'assistant_content', d.assistant_content, 3, true);
      break;
    case '19':
      corpo = campoAreaEditavel('Nota', a.TRANSITION_ID, a.ID, 'protocol_note', d.protocol_note, 2);
      break;
    case '20':
      corpo = campoVozAudio(a, d.model_audio)
        + campoSelectEditavel('Modelo', AUDIO_MODELOS, a.TRANSITION_ID, a.ID, 'model_openai', d.model_openai || AUDIO_MODELOS[0].value)
        + campoBloco('Velocidade (0,25 a 4)', `<input type="number" step=".01" min=".25" max="4" class="field-view" value="${escapeHtml(d.speed || '1')}" data-action="mudar-campo-acao" data-transition-id="${escapeHtml(a.TRANSITION_ID)}" data-action-id="${escapeHtml(a.ID)}" data-campo="speed">`)
        + campoAreaEditavel('Mensagem', a.TRANSITION_ID, a.ID, 'message_content', d.message_content, 2)
        + campoEstadoLivre('Estado de retorno (callback)', estadoPorNumero, a.TRANSITION_ID, a.ID, 'callback_state', d.callback_state)
        + campoEstadoLivre('Estado de falha (fallback)', estadoPorNumero, a.TRANSITION_ID, a.ID, 'fallback_state', d.fallback_state);
      break;
    case '21':
      corpo = campoSelectEditavel('Tipo', [{ value: 'EMAIL', label: 'E-mail' }, { value: 'PHONE', label: 'Telefone' }], a.TRANSITION_ID, a.ID, 'contact_item_type', d.contact_item_type)
        + campoTextoEditavel('Valor', a.TRANSITION_ID, a.ID, 'message_text', d.message_text);
      break;
    case '22':
      corpo = campoTextoEditavel('URL', a.TRANSITION_ID, a.ID, 'url', d.url)
        + campoAreaEditavel('Payload', a.TRANSITION_ID, a.ID, 'payload', d.payload, 3, true)
        + campoEstadoLivre('Estado de retorno', estadoPorNumero, a.TRANSITION_ID, a.ID, 'callback_state', d.callback_state)
        + campoEstadoLivre('Estado de falha (timeout)', estadoPorNumero, a.TRANSITION_ID, a.ID, 'fallback_state', d.fallback_state)
        + campoTextoEditavel('Timeout (seg, vazio = 120 padrão)', a.TRANSITION_ID, a.ID, 'timeout', d.timeout);
      break;
    default:
      // Tipo de ação desconhecido (fora da tabela 1-22 do bot-engine-spec.md)
      // — sem forma definida de campos, não dá pra editar com segurança.
      corpo = `<textarea readonly rows="2" class="textarea-view">${escapeHtml(JSON.stringify(d))}</textarea>`;
  }
  return `
    <div class="acao-item">
      <div class="flex gap-1.5">
        <div class="reorder-stack shrink-0">
          <button type="button" class="reorder-btn" data-action="mover-acao" data-transition-id="${escapeHtml(a.TRANSITION_ID)}" data-action-id="${escapeHtml(a.ID)}" data-dir="-1"${indice === 0 ? ' disabled' : ''} title="Mover para cima"><i data-lucide="chevron-up" class="w-3 h-3 pointer-events-none"></i></button>
          <button type="button" class="reorder-btn" data-action="mover-acao" data-transition-id="${escapeHtml(a.TRANSITION_ID)}" data-action-id="${escapeHtml(a.ID)}" data-dir="1"${indice === total - 1 ? ' disabled' : ''} title="Mover para baixo"><i data-lucide="chevron-down" class="w-3 h-3 pointer-events-none"></i></button>
        </div>
        <div class="flex-1 min-w-0">
          <input type="search" list="acao-tipo-datalist" class="field-view mb-1.5 acao-tipo" value="${escapeHtml(ACTION_TYPE_LABELS[a.ACTION_TYPE] || `Tipo ${a.ACTION_TYPE}`)}" data-action="mudar-tipo-acao" data-transition-id="${escapeHtml(a.TRANSITION_ID)}" data-action-id="${escapeHtml(a.ID)}">
          ${corpo}
        </div>
        <button type="button" class="item-delete-btn shrink-0" data-action="delete-acao" data-transition-id="${escapeHtml(a.TRANSITION_ID)}" data-action-id="${escapeHtml(a.ID)}" title="Excluir ação"><i data-lucide="trash-2" class="w-3.5 h-3.5 pointer-events-none"></i></button>
      </div>
      <div class="item-delete-panel hidden mt-2" data-role="item-delete-panel"></div>
    </div>`;
}

function resumoTransicao(nCondicoes, nAcoes) {
  const cond = nCondicoes === 0 ? 'sem condição' : `${nCondicoes} ${nCondicoes === 1 ? 'condição' : 'condições'}`;
  const acao = nAcoes === 0 ? 'nenhuma ação' : `${nAcoes} ${nAcoes === 1 ? 'ação' : 'ações'}`;
  return `${cond} · ${acao}`;
}

// Barra no topo da transição (mesmo padrão do header do estado): alça,
// prioridade e resumo à esquerda; duplicar/excluir à direita. Deixa claro que
// os controles valem pra transição inteira (antes pareciam da 1ª condição) e
// devolve a largura toda pra coluna de condições. O painel de exclusão
// continua filho direto de .estado-row (bot-view-interactions.js depende disso).
export function renderTransicaoRow(t, condicoesPorTransicao, acoesPorTransicao, estadoPorNumero, totalTransicoes) {
  const condicoes = condicoesPorTransicao[t.ID] || [];
  const acoes = acoesPorTransicao[t.ID] || [];
  return `
    <div class="estado-row border-t" data-transition-id="${escapeHtml(t.ID)}">
      <div class="transicao-barra">
        <span class="transicao-drag-handle shrink-0" draggable="true" title="Arraste para reordenar"><i data-lucide="grip-vertical" class="w-3.5 h-3.5 pointer-events-none"></i></span>
        <span class="transicao-rotulo">Transição</span>
        <input type="number" class="transicao-numero-input transicao-numero-badge shrink-0" min="0" max="${totalTransicoes - 1}" value="${escapeHtml(t.PRIORITY)}" data-action="mover-transicao" data-transition-id="${escapeHtml(t.ID)}" title="Digite a posição desejada (0 a ${totalTransicoes - 1}) e aperte Enter">
        <span class="transicao-resumo">${resumoTransicao(condicoes.length, acoes.length)}</span>
        <button type="button" class="transicao-barra-btn obd-btn-warn" data-action="duplicate-transicao" data-transition-id="${escapeHtml(t.ID)}" title="Duplicar esta transição (condições + ações)"><i data-lucide="copy"></i></button>
        <button type="button" class="transicao-barra-btn obd-btn-copiar" data-action="copiar-transicao" data-transition-id="${escapeHtml(t.ID)}" title="Copiar esta transição para colar em outro estado ou bot"><i data-lucide="clipboard-copy"></i></button>
        <button type="button" class="transicao-barra-btn obd-btn-danger" data-action="delete-transicao" data-transition-id="${escapeHtml(t.ID)}" title="Excluir esta transição (condições + ações)"><i data-lucide="trash-2"></i></button>
      </div>
      <div class="transicao-corpo grid grid-cols-2 gap-4">
        <div class="min-w-0">
          ${condicoes.length ? condicoes.map((c, i) => renderCondicao(c, i, condicoes.length)).join('') : '<p class="estado-empty text-xs italic mb-1.5">Sem condição (padrão)</p>'}
          <button type="button" class="mb-builder-add-btn" data-action="add-condicao" data-transition-id="${escapeHtml(t.ID)}"><i data-lucide="plus" class="w-3 h-3 inline-block -mt-0.5 mr-1"></i>Condição</button>
        </div>
        <div class="min-w-0">
          ${acoes.length ? acoes.map((a, i) => renderAcao(a, estadoPorNumero, i, acoes.length)).join('') : '<p class="estado-empty text-xs italic mb-1.5">Nenhuma ação</p>'}
          <button type="button" class="mb-builder-add-btn" data-action="add-acao" data-transition-id="${escapeHtml(t.ID)}"><i data-lucide="plus" class="w-3 h-3 inline-block -mt-0.5 mr-1"></i>Ação</button>
        </div>
      </div>
      <div class="item-delete-panel hidden px-4 pb-4" data-role="item-delete-panel"></div>
    </div>`;
}

export function renderEstado(estado, transicoesPorEstado, condicoesPorTransicao, acoesPorTransicao, estadoPorNumero, totalEstados) {
  const transicoes = transicoesPorEstado[estado.STATE_NUMBER] || [];
  return `
    <div class="estado-wrap mb-4 rounded-xl overflow-hidden border" data-estado-numero="${escapeHtml(estado.STATE_NUMBER)}">
      <div class="estado-header flex items-center gap-3 px-4 py-3 cursor-pointer select-none">
        <span class="estado-drag-handle shrink-0" draggable="true" title="Arraste para reordenar"><i data-lucide="grip-vertical" class="w-4 h-4 pointer-events-none"></i></span>
        <input type="number" class="estado-numero-input shrink-0 obd-badge-solid text-xs font-bold rounded px-1 py-1.5 border-0" min="0" max="${totalEstados - 1}" value="${escapeHtml(estado.STATE_NUMBER)}" data-action="mover-estado" data-state="${escapeHtml(estado.STATE_NUMBER)}" title="Digite a posição desejada (0 a ${totalEstados - 1}) e aperte Enter">
        <span class="estado-alias-wrap">
          <input type="text" class="estado-alias" value="${escapeHtml(estado.ALIAS)}" placeholder="Sem nome" data-action="renomear-estado" data-state="${escapeHtml(estado.STATE_NUMBER)}" title="Nome do estado (clique para renomear)">
          <button type="button" class="estado-alias-lapis" data-action="focar-nome-estado" tabindex="-1" title="Renomear estado"><i data-lucide="pencil"></i></button>
        </span>
        <span class="estado-resumo">${transicoes.length === 0 ? 'sem transições' : `${transicoes.length} ${transicoes.length === 1 ? 'transição' : 'transições'}`}</span>
        <span class="estado-header-espaco" aria-hidden="true"></span>
        <button class="w-8 h-8 rounded-lg bg-[var(--success)] text-white flex items-center justify-center shrink-0 opacity-70" disabled title="Elemento decorativo (réplica visual do ORPEN) — sem campo correspondente no JSON"><i data-lucide="check" class="w-4 h-4"></i></button>
        <button type="button" class="w-8 h-8 rounded-lg obd-btn-warn flex items-center justify-center shrink-0 transition-colors" data-action="duplicate-estado" data-state="${escapeHtml(estado.STATE_NUMBER)}" title="Duplicar estado (com todas as transições, condições e ações)"><i data-lucide="copy" class="w-4 h-4"></i></button>
        <button type="button" class="w-8 h-8 rounded-lg obd-btn-danger flex items-center justify-center shrink-0 transition-colors" data-action="delete-estado" data-state="${escapeHtml(estado.STATE_NUMBER)}" title="Excluir estado"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        <i data-lucide="chevron-down" class="estado-chevron w-4 h-4 shrink-0 transition-transform"></i>
      </div>
      <div class="estado-delete-panel hidden" data-role="estado-delete-panel"></div>
      <div class="estado-body hidden">
        <div class="grid grid-cols-2 gap-4 px-4 pt-4">
          <p class="estado-col-title text-sm font-semibold">Condições</p>
          <p class="estado-col-title text-sm font-semibold">Ações</p>
        </div>
        ${transicoes.length ? transicoes.map(t => renderTransicaoRow(t, condicoesPorTransicao, acoesPorTransicao, estadoPorNumero, transicoes.length)).join('') : '<p class="estado-empty text-xs italic p-4">Nenhuma transição para este estado.</p>'}
        <div class="px-4 py-3">
          <button type="button" class="mb-builder-add-btn" data-action="add-transicao" data-state="${escapeHtml(estado.STATE_NUMBER)}"><i data-lucide="plus" class="w-3 h-3 inline-block -mt-0.5 mr-1"></i>Transição</button>
          <button type="button" class="mb-builder-add-btn btn-colar btn-colar-transicoes" data-action="colar-transicoes" data-state="${escapeHtml(estado.STATE_NUMBER)}"><i data-lucide="clipboard-paste" class="w-3 h-3 inline-block -mt-0.5 mr-1"></i>Colar transições</button>
        </div>
      </div>
    </div>`;
}

export function renderPainelConfirmacaoItem(rotulo, acaoConfirmar, dadosExtraHtml) {
  return `
    <div class="estado-alert estado-alert-confirm">
      <div class="estado-alert-head"><i data-lucide="trash-2" class="w-4 h-4"></i><p>Excluir esta ${rotulo}?</p></div>
      <p class="estado-alert-sub">Essa ação não pode ser desfeita.</p>
      <div class="estado-alert-actions">
        <button type="button" class="estado-alert-btn-ghost" data-action="cancelar-exclusao-item">Cancelar</button>
        <button type="button" class="estado-alert-btn-danger" data-action="${acaoConfirmar}" ${dadosExtraHtml}>Excluir</button>
      </div>
    </div>`;
}

export function renderPainelBloqueio(estado, referencias) {
  return `
    <div class="estado-alert estado-alert-blocked">
      <div class="estado-alert-head"><i data-lucide="shield-alert" class="w-4 h-4"></i><p>Não é possível excluir o estado "${escapeHtml(estado.ALIAS)}" (nº ${escapeHtml(estado.STATE_NUMBER)})</p></div>
      <p class="estado-alert-sub">Este estado ainda é referenciado em ${referencias.length} ${referencias.length === 1 ? 'lugar' : 'lugares'}:</p>
      <ul class="estado-alert-list">${referencias.map(r => `<li>${r}</li>`).join('')}</ul>
      <div class="estado-alert-actions"><button type="button" class="estado-alert-btn-ghost" data-action="fechar-alerta-estado">Entendi</button></div>
    </div>`;
}

export function renderPainelConfirmacao(estado, totalTransicoes) {
  return `
    <div class="estado-alert estado-alert-confirm">
      <div class="estado-alert-head"><i data-lucide="trash-2" class="w-4 h-4"></i><p>Excluir o estado "${escapeHtml(estado.ALIAS)}" (nº ${escapeHtml(estado.STATE_NUMBER)})?</p></div>
      <p class="estado-alert-sub">Isso vai excluir ${totalTransicoes === 1 ? 'a transição' : `as ${totalTransicoes} transições`} dentro dele. Essa ação não pode ser desfeita.</p>
      <div class="estado-alert-actions">
        <button type="button" class="estado-alert-btn-ghost" data-action="cancelar-exclusao-estado">Cancelar</button>
        <button type="button" class="estado-alert-btn-danger" data-action="confirmar-exclusao-estado" data-state="${escapeHtml(estado.STATE_NUMBER)}">Excluir</button>
      </div>
    </div>`;
}

export function lerContaTranscricao(bot) {
  const integracoes = typeof bot.INTEGRATIONS === 'string' ? (() => { try { return JSON.parse(bot.INTEGRATIONS); } catch { return {}; } })() : (bot.INTEGRATIONS || {});
  return integracoes.audio_transcription_account ?? '';
}

// O campo de destino do timeout muda de significado conforme TIMEOUT_ACTION
// (bot-engine-spec.md §2): "bot" troca de estado, "queue" transfere fila,
// "close" encerra com um status de CRM + mensagem. Só "bot" tem uma lista
// completa disponível aqui (os próprios estados do bot); fila é cadastro
// externo (texto livre); CRM tem uma lista pequena e conhecida (select).
// Chamada tanto no render inicial quanto sempre que TIMEOUT_ACTION muda.
export function atualizarSecaoDestino(bot, estadoPorNumero) {
  const destinoWrap = $('#bv-destino-wrap');
  const msgWrap = $('#bv-msg-encerrar-wrap');
  if (bot.TIMEOUT_ACTION === 'bot') {
    const opcoesEstado = Object.values(estadoPorNumero).map(e => ({ value: e.STATE_NUMBER, label: `[${e.STATE_NUMBER}] ${e.ALIAS}` }));
    $('#bv-destino-label').textContent = 'Estado do bot (timeout)';
    $('#bv-destino-valor').innerHTML = `<select id="bv-destino-select" class="field-view" data-campo-bot="TIMEOUT_DESTINY">${optionsHtml(opcoesEstado, bot.TIMEOUT_DESTINY)}</select>`;
    destinoWrap.classList.remove('hidden');
    msgWrap.classList.add('hidden');
  } else if (bot.TIMEOUT_ACTION === 'queue') {
    $('#bv-destino-label').textContent = 'Fila para entrega (timeout)';
    if (temAmbiente()) {
      const opcoesFila = comValorAtual(opcoesFilas(), bot.CONF_DELIVERY_QUEUE);
      if (!opcoesFila.some(o => o.value === '')) opcoesFila.unshift({ value: '', label: 'Selecione a fila...' });
      $('#bv-destino-valor').innerHTML = `<select id="bv-destino-select" class="field-view" data-campo-bot="CONF_DELIVERY_QUEUE">${optionsHtml(opcoesFila, bot.CONF_DELIVERY_QUEUE)}</select>`;
    } else {
      $('#bv-destino-valor').innerHTML = `<input class="field-view" data-campo-bot="CONF_DELIVERY_QUEUE" value="${escapeHtml(bot.CONF_DELIVERY_QUEUE ?? '')}">`;
    }
    destinoWrap.classList.remove('hidden');
    msgWrap.classList.add('hidden');
  } else if (bot.TIMEOUT_ACTION === 'close') {
    $('#bv-destino-label').textContent = 'Encerrar Atendimento — Status CRM';
    let opcoesCrm;
    if (temAmbiente()) {
      opcoesCrm = comValorAtual(opcoesCrmStatus(), bot.TIMEOUT_DESTINY);
    } else {
      opcoesCrm = entriesToOptions(CRM_STATUS_LABELS);
      if (bot.TIMEOUT_DESTINY && !opcoesCrm.some(o => o.value === bot.TIMEOUT_DESTINY)) opcoesCrm.push({ value: bot.TIMEOUT_DESTINY, label: bot.TIMEOUT_DESTINY });
    }
    if (!opcoesCrm.some(o => o.value === '')) opcoesCrm.unshift({ value: '', label: 'Selecione o status...' });
    $('#bv-destino-valor').innerHTML = `<select id="bv-destino-select" class="field-view" data-campo-bot="TIMEOUT_DESTINY">${optionsHtml(opcoesCrm, bot.TIMEOUT_DESTINY)}</select>`;
    $('#bv-msg-encerrar').value = bot.TIMEOUT_MESSAGE ?? '';
    destinoWrap.classList.remove('hidden');
    msgWrap.classList.remove('hidden');
  } else {
    destinoWrap.classList.add('hidden');
    msgWrap.classList.add('hidden');
  }
}


export function atualizarContadorRodape(bot) {
  const numEstados = (bot.BOT_STATES || []).length;
  const numTransicoes = (bot.BOT_TRANSITIONS || []).length;
  const label = `${numEstados} estado${numEstados === 1 ? '' : 's'} · ${numTransicoes} transiç${numTransicoes === 1 ? 'ão' : 'ões'}`;
  const el = $('#bv-contador-estados-transicoes');
  if (el) el.textContent = label;
}

export function abrirBotView(bot) {
  state.MENU_MODELS = {};
  state.MENU_PENDENTES_TRUNCAMENTO = {};
  state.menuBuilderSeq = 0;

  const estados = [...(bot.BOT_STATES || [])].sort((a, b) => parseInt(a.STATE_NUMBER) - parseInt(b.STATE_NUMBER));
  const estadoPorNumero = {};
  estados.forEach(e => estadoPorNumero[e.STATE_NUMBER] = e);

  // Datalist compartilhada por todos os campos "estado livre" (destiny de Troca
  // Estado, callback_state/fallback_state de OpenAI/Áudio/Automação): lista
  // todos os estados do bot pro autocomplete, mas o campo continua um <input>
  // de texto normal — dá pra escolher da lista OU digitar qualquer valor.
  $('#bv-estados-datalist').innerHTML = estados.map(e => `<option value="${escapeHtml(e.STATE_NUMBER)} - ${escapeHtml(e.ALIAS)}">`).join('');

  // Atualiza as variáveis na datalist combinando o dicionário fixo com as variáveis do ambiente
  // Condição de I.A.: como no modal nativo (bot.php:3491-3500), cada
  // assistente das contas OpenAI entra na lista como "[Conta] Assistente:
  // Nome", no lugar das entradas genéricas assistant_analysis_*.
  // Cada <option> leva a chave em data-value (a escolha é conferida por ela,
  // em mudar-condicao-variavel) e o tópico em data-grupo.
  atualizarListaVariaveisCondicao(bot);
  atualizarDatalistsVariaveis(bot);

  $('#bv-numero').value = bot.ID ?? '';
  $('#bv-nome').value = bot.NAME ?? '';
  const statusOptions = entriesToOptions(STATUS_LABELS);
  if (bot.STATUS === undefined || bot.STATUS === null) statusOptions.unshift({ value: '', label: '(não presente no JSON)' });
  $('#bv-status').innerHTML = optionsHtml(statusOptions, bot.STATUS ?? '');
  $('#bv-tempo-resposta').value = bot.TIME_ANSWER ?? '';
  $('#bv-acao-timeout').innerHTML = optionsHtml(entriesToOptions(TIMEOUT_ACTION_LABELS), bot.TIMEOUT_ACTION ?? '');
  $('#bv-tempo-entrega').value = bot.CONF_DELIVERY_TIME ?? '';

  atualizarSecaoDestino(bot, estadoPorNumero);

  const transcricaoWrap = $('#bv-transcricao-wrap');
  const valorTranscricao = lerContaTranscricao(bot);
  if (temAmbiente()) {
    const opcoes = comValorAtual(opcoesOpenAiContas(), valorTranscricao);
    if (!opcoes.some(o => o.value === '')) opcoes.unshift({ value: '', label: 'Nenhuma / Padrão' });
    transcricaoWrap.innerHTML = `<label class="bv-label text-xs font-medium block mb-1">Conta para transcrição de áudio</label><select id="bv-transcricao" class="field-view">${optionsHtml(opcoes, valorTranscricao)}</select>`;
  } else {
    transcricaoWrap.innerHTML = `<label class="bv-label text-xs font-medium block mb-1">Conta para transcrição de áudio (ID)</label><input id="bv-transcricao" class="field-view" value="${escapeHtml(valorTranscricao)}">`;
  }

  const transicoesPorEstado = {};
  (bot.BOT_TRANSITIONS || []).forEach(t => (transicoesPorEstado[t.STATE] ||= []).push(t));
  Object.values(transicoesPorEstado).forEach(arr => arr.sort((a, b) => parseInt(a.PRIORITY) - parseInt(b.PRIORITY)));

  const condicoesPorTransicao = {};
  (bot.BOT_CONDITIONS || []).forEach(c => (condicoesPorTransicao[c.TRANSITION_ID] ||= []).push(c));
  Object.values(condicoesPorTransicao).forEach(arr => arr.sort((a, b) => parseInt(a.ID) - parseInt(b.ID)));

  const acoesPorTransicao = {};
  (bot.BOT_ACTIONS || []).forEach(a => (acoesPorTransicao[a.TRANSITION_ID] ||= []).push(a));
  Object.values(acoesPorTransicao).forEach(arr => arr.sort((a, b) => parseInt(a.ID) - parseInt(b.ID)));

  $('#bv-estados').innerHTML = estados.length
    ? estados.map(e => renderEstado(e, transicoesPorEstado, condicoesPorTransicao, acoesPorTransicao, estadoPorNumero, estados.length)).join('')
    : '<p class="estado-empty text-xs italic p-4">Nenhum estado neste bot.</p>';
  // No mesmo instante da inserção, antes que gerenciadores de senha
  // classifiquem os campos (o observador deles roda depois deste código).
  marcarCamposSemAutopreenchimento($('#bv-estados'));

  // Nenhum listener é ligado aqui — tudo dentro de #bv-estados (clique,
  // change, keydown, drag) é tratado por delegação, ligada UMA VEZ fora
  // desta função (initAcoesDelegadas/initEstadoReorderDnD/
  // initEstadoDeleteFlow/initItemDeleteFlow) — ver comentário em
  // initAcoesDelegadas pra entender por quê isso importa agora que
  // rerenderTransicao/rerenderEstado fazem re-render parcial.
  initMenuBuilders();
  initVariaveisBuilders();

  criarIcones();
  $('#bot-view-overlay').classList.remove('hidden');
  // Trava o scroll da página de fundo (a tela nativa da Orpen, no caso da
  // extensão; a própria bot_transform.html no modo standalone) enquanto o
  // overlay estiver aberto — sem isso dava pra rolar os dois ao mesmo tempo,
  // o que descolava o clique dos botões do footer da posição visual real.
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';
  atualizarContadorRodape(bot);
}

// Quem monta o editor pode barrar o fechamento: a extensão pergunta quando há
// alteração não salva. Sem guarda (modo standalone), fecha direto. X, clique
// fora e Esc passam por aqui; fecharBotView() fecha sem perguntar.
let guardaFechar = null;
export function definirGuardaFechar(fn) {
  guardaFechar = fn;
}
export async function pedirFecharBotView() {
  if (guardaFechar && !(await guardaFechar())) return;
  fecharBotView();
}

export function fecharBotView() {
  fecharCombobox();
  fecharVariaveisTexto();
  $('#bot-view-overlay').classList.add('hidden');
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
}
