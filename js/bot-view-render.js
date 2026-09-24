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
} from './dictionaries.js';
import { $, escapeHtml, optionsHtml, entriesToOptions } from './utils.js';
import { criarIcones } from './dom-root.js';
import { parseMenuModel, renderMenuBuilderShell, initMenuBuilders } from './menu-builder.js';
import {
  temAmbiente, opcoesFilas, opcoesAgentes, opcoesBots, opcoesCrmStatus, opcoesSubStatus,
  opcoesEntrancesEnvio, opcoesScripts, opcoesCheckpoints, opcoesOpenAiContas,
  opcoesCalendarios, comValorAtual,
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
    case 'openai_status': base = [{ value: 'success', label: 'Sucesso' }, { value: 'error', label: 'Erro' }]; break;
    case 'openai_text': base = entriesToOptions({ '1': 'Igual a', '2': 'Contém', '3': 'Diferente de', '4': 'Não contém' }); break;
    case 'ref_calendario': base = temAmbiente() ? comValorAtual(opcoesCalendarios(), currentValue) : [{ value: currentValue ?? '', label: `ID ${currentValue ?? '—'} (cadastro externo)` }]; break;
    case 'ref_fila': base = temAmbiente() ? comValorAtual(opcoesFilas(), currentValue) : [{ value: currentValue ?? '', label: `ID ${currentValue ?? '—'} (cadastro externo)` }]; break;
    case 'ref_agente': base = temAmbiente() ? comValorAtual(opcoesAgentes(), currentValue) : [{ value: currentValue ?? '', label: `ID ${currentValue ?? '—'} (cadastro externo)` }]; break;
    case 'ref_crm_status': base = temAmbiente() ? comValorAtual(opcoesCrmStatus(), currentValue) : [{ value: currentValue ?? '', label: `ID ${currentValue ?? '—'} (cadastro externo)` }]; break;
    case 'ref_entrance': base = temAmbiente() ? comValorAtual(opcoesEntrancesEnvio(), currentValue) : [{ value: currentValue ?? '', label: `ID ${currentValue ?? '—'} (cadastro externo)` }]; break;
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
  const kind = VARIABLE_KIND[variable] || 'text';

  // Assistente OpenAI: Bot.class.php lê o "status" (success/error) de
  // CONDITION_DATA.value e o "texto" (igual/contém/etc.) de CONDITION_DATA.type
  // — nenhum dos dois usa a raiz CONDITION_TYPE (ver bot-engine-spec.md §1 e
  // Bot.class.php:609-629). mudarCondicaoOperador/mudarCondicaoVariavel
  // espelham essa mesma leitura na escrita.
  const currentType = isAssistant
    ? (variable === 'assistant_analysis_status' ? (c.CONDITION_DATA.value ?? '') : (c.CONDITION_DATA.type ?? ''))
    : (c.CONDITION_TYPE ?? '');
  const operatorOptions = buildOperatorOptions(kind, currentType);

  const valorBruto = c.CONDITION_DATA?.value ?? '';
  const valor = Array.isArray(valorBruto) ? valorBruto.join(', ') : valorBruto;
  const assistantLine = isAssistant
    ? `<p class="estado-empty text-xs mb-1.5">Assistente (ID): ${escapeHtml(c.CONDITION_DATA.assistant_id)}</p>`
    : '';

  return `
    <div class="condicao-item">
      <div class="flex gap-1.5">
        <div class="reorder-stack shrink-0">
          <button type="button" class="reorder-btn" data-action="mover-condicao" data-transition-id="${escapeHtml(c.TRANSITION_ID)}" data-condition-id="${escapeHtml(c.ID)}" data-dir="-1"${indice === 0 ? ' disabled' : ''} title="Mover para cima"><i data-lucide="chevron-up" class="w-3 h-3 pointer-events-none"></i></button>
          <button type="button" class="reorder-btn" data-action="mover-condicao" data-transition-id="${escapeHtml(c.TRANSITION_ID)}" data-condition-id="${escapeHtml(c.ID)}" data-dir="1"${indice === total - 1 ? ' disabled' : ''} title="Mover para baixo"><i data-lucide="chevron-down" class="w-3 h-3 pointer-events-none"></i></button>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex gap-2 mb-1.5">
            <input type="text" list="variaveis-datalist" class="field-view condicao-variavel flex-1" value="${escapeHtml(VARIABLE_LABELS[variable] || variable)}" data-action="mudar-condicao-variavel" data-transition-id="${escapeHtml(c.TRANSITION_ID)}" data-condition-id="${escapeHtml(c.ID)}">
            <input type="text" list="operador-datalist-${escapeHtml(c.ID)}" class="field-view condicao-operador flex-1" value="${escapeHtml((operatorOptions.find(o => String(o.value) === String(currentType)) || {}).label ?? '')}" data-action="mudar-condicao-operador" data-kind="${escapeHtml(kind)}" data-transition-id="${escapeHtml(c.TRANSITION_ID)}" data-condition-id="${escapeHtml(c.ID)}">
            <datalist id="operador-datalist-${escapeHtml(c.ID)}">${operatorOptions.map(o => `<option value="${escapeHtml(o.label)}" data-value="${escapeHtml(o.value)}">`).join('')}</datalist>
          </div>
          ${assistantLine}
          <textarea rows="2" class="textarea-view${['openai_status', 'ref_calendario', 'ref_fila', 'ref_agente', 'ref_crm_status', 'ref_entrance', 'ref'].includes(kind) ? ' hidden' : ''}" data-action="mudar-condicao-valor" data-transition-id="${escapeHtml(c.TRANSITION_ID)}" data-condition-id="${escapeHtml(c.ID)}">${escapeHtml(valor)}</textarea>
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
  return campoBloco(label, `<input type="text" list="bv-estados-datalist" class="field-view" value="${escapeHtml(valorExibido)}" data-action="mudar-estado-acao" data-transition-id="${escapeHtml(transitionId)}" data-action-id="${escapeHtml(actionId)}" data-campo="${escapeHtml(campo)}">`);
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
  return campoBloco(label, `<input type="text" list="${escapeHtml(datalistId)}" class="field-view" value="${escapeHtml(texto)}" data-action="mudar-campo-acao-buscavel" data-dict="${escapeHtml(datalistId)}" data-transition-id="${escapeHtml(transitionId)}" data-action-id="${escapeHtml(actionId)}" data-campo="${escapeHtml(campo)}">`);
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

    const datalistHtml = `<datalist id="${escapeHtml(datalistId)}">${opcoes.map(o => `<option value="${escapeHtml(o.label)}" data-value="${escapeHtml(o.value)}">`).join('')}</datalist>`;
    const inputHtml = `<input type="text" list="${escapeHtml(datalistId)}" class="field-view" value="${escapeHtml(textoExibido)}" data-action="mudar-campo-acao-ambiente-buscavel" data-transition-id="${escapeHtml(transitionId)}" data-action-id="${escapeHtml(actionId)}" data-campo="${escapeHtml(campo)}">`;

    return campoBloco(label, inputHtml + datalistHtml);
  }
  return campoTextoEditavel(label + ' (ID)', transitionId, actionId, campo, selected);
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
    case '20': return { message_content: '', callback_state: '', fallback_state: '', model_audio: '', model_openai: '', speed: '' };
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
      corpo = campoAmbienteSelect('Agente / bot destino', () => [...opcoesAgentes(), ...opcoesBots()], a.TRANSITION_ID, a.ID, 'destiny', d.destiny);
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
      const uid = 'mb' + (++state.menuBuilderSeq);
      const model = parseMenuModel(d.message_option_text || '');
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
      corpo = campoAreaEditavel('Variáveis (JSON)', a.TRANSITION_ID, a.ID, 'bot_variables_text', d.bot_variables_text, 4, true);
      break;
    case '14':
      corpo = campoAmbienteSelect('Substatus', opcoesSubStatus, a.TRANSITION_ID, a.ID, 'substatus', d.substatus);
      break;
    case '15':
      corpo = campoTextoEditavel('Nome da tag', a.TRANSITION_ID, a.ID, 'message_text', d.message_text);
      break;
    case '16':
      corpo = campoBuscavel('Campo a atualizar', UPDATE_CONTACT_LABELS, 'update-contact-datalist', a.TRANSITION_ID, a.ID, 'update_contact_value', d.update_contact_value)
        + (d.labels !== undefined ? campoTextoEditavel('Labels (separadas por vírgula)', a.TRANSITION_ID, a.ID, 'labels', Array.isArray(d.labels) ? d.labels.join(', ') : d.labels) : '')
        + (d.contact_item_type !== undefined ? campoSelectEditavel('Tipo de contato', [{ value: 'phone', label: 'Telefone' }, { value: 'email', label: 'E-mail' }], a.TRANSITION_ID, a.ID, 'contact_item_type', d.contact_item_type) : '')
        + (d.message_text !== undefined ? campoTextoEditavel('Valor', a.TRANSITION_ID, a.ID, 'message_text', d.message_text) : '');
      break;
    case '17':
      corpo = campoTextoEditavel('Arquivo (ID)', a.TRANSITION_ID, a.ID, 'send_file', d.send_file);
      break;
    case '18':
      corpo = campoSelectEditavel('Método', entriesToOptions(OPENAI_METHOD_LABELS), a.TRANSITION_ID, a.ID, 'openai', d.openai)
        + campoAmbienteSelect('Conta OpenAI', opcoesOpenAiContas, a.TRANSITION_ID, a.ID, 'openai_account', d.openai_account)
        + campoTextoEditavel('Assistente (ID)', a.TRANSITION_ID, a.ID, 'assistant_id', d.assistant_id)
        + campoEstadoLivre('Estado de callback', estadoPorNumero, a.TRANSITION_ID, a.ID, 'callback_state', d.callback_state)
        + campoAreaEditavel('Conteúdo', a.TRANSITION_ID, a.ID, 'assistant_content', d.assistant_content, 3, true);
      break;
    case '19':
      corpo = campoAreaEditavel('Nota', a.TRANSITION_ID, a.ID, 'protocol_note', d.protocol_note, 2);
      break;
    case '20':
      corpo = campoAreaEditavel('Conteúdo (TTS)', a.TRANSITION_ID, a.ID, 'message_content', d.message_content, 2)
        + campoEstadoLivre('Estado de retorno', estadoPorNumero, a.TRANSITION_ID, a.ID, 'callback_state', d.callback_state)
        + campoEstadoLivre('Estado de falha', estadoPorNumero, a.TRANSITION_ID, a.ID, 'fallback_state', d.fallback_state)
        + campoTextoEditavel('Velocidade', a.TRANSITION_ID, a.ID, 'speed', d.speed);
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
          <input type="text" list="acao-tipo-datalist" class="field-view mb-1.5 acao-tipo" value="${escapeHtml(ACTION_TYPE_LABELS[a.ACTION_TYPE] || `Tipo ${a.ACTION_TYPE}`)}" data-action="mudar-tipo-acao" data-transition-id="${escapeHtml(a.TRANSITION_ID)}" data-action-id="${escapeHtml(a.ID)}">
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
  const dictVariaveis = { ...VARIABLE_LABELS };
  if (state.ambienteOrpen && state.ambienteOrpen.variables) {
    state.ambienteOrpen.variables.forEach(v => {
      if (v.id && !dictVariaveis[v.id]) {
        dictVariaveis[v.id] = v.name || v.id;
      }
    });
  }
  $('#variaveis-datalist').innerHTML = entriesToOptions(dictVariaveis).map(o => `<option value="${escapeHtml(o.label)}">`).join('');

  $('#bv-numero').value = bot.ID ?? '';
  // Número (ID) só é editável na criação de um bot novo — em edição, o ID já
  // é mostrado fixo no cabeçalho ("Editar Bot - #xxxxx") e não pode mudar
  // (mudar o ID aqui criaria um bot novo em vez de atualizar o existente).
  const numeroWrap = $('#bv-numero-wrap');
  if (numeroWrap) numeroWrap.classList.toggle('hidden', !bot._isNewBot);
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

  // Nenhum listener é ligado aqui — tudo dentro de #bv-estados (clique,
  // change, keydown, drag) é tratado por delegação, ligada UMA VEZ fora
  // desta função (initAcoesDelegadas/initEstadoReorderDnD/
  // initEstadoDeleteFlow/initItemDeleteFlow) — ver comentário em
  // initAcoesDelegadas pra entender por quê isso importa agora que
  // rerenderTransicao/rerenderEstado fazem re-render parcial.
  initMenuBuilders();

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

export function fecharBotView() {
  $('#bot-view-overlay').classList.add('hidden');
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
}
