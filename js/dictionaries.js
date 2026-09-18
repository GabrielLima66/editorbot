// ---------------------------------------------------------------------------
// Rótulos e operadores conferidos em bot-engine-spec.md (código-fonte real de
// bot.php / Bot.class.php). Onde o código de um registro externo (fila, script,
// status de CRM, agente, entrada, calendário, checkpoint...) não está no JSON
// exportado, mostramos o ID bruto em vez de inventar um nome.
// ---------------------------------------------------------------------------
export const STATUS_LABELS = { '1': 'Ativo', '0': 'Inativo' };
export const TIMEOUT_ACTION_LABELS = { '': '(nenhuma)', bot: 'Trocar estado', queue: 'Transferir para fila', close: 'Encerrar o atendimento' };
export const CRM_STATUS_LABELS = { '322': 'Pesquisa de Satisfação', '350': 'Inatividade do Cliente - Pesquisa' };
export const SCRIPT_LABELS = { '81': 'Survey' };

export const VARIABLE_LABELS = {
  message: 'MENSAGEM',
  pref_agent: 'AG. PREFERIDO',
  name_pref_agent: 'NOME AG. PREFERIDO',
  contact: 'CONTATO',
  calendario: 'CALENDARIO (Verdadeiro)',
  calendario_falso: 'CALENDARIO (Falso)',
  error_count: 'Contador de Erros',
  opt_in: 'CONTATO possui OptIn',
  uci: 'CONTATO possui UCI',
  old_attendance: 'Teve atendimento em',
  agent_on_queue: 'AGENTES NA FILA',
  agent_online: 'AGENTE LOGADO',
  agent_available_on_chat: 'DISPONÍVEL CHAT',
  status_last_att: 'Status Último Atendimento',
  entrance_type: 'Tipo de entrada',
  sender: 'REMETENTE',
  entrance: 'ENTRADA',
  contact_number: 'NÚMERO DO CONTATO',
  agent_last_att: 'Último agente que atendeu',
  email_subject: 'ASSUNTO DO EMAIL',
  automate_message: '[Automação] Mensagem',
  automate_status: '[Automação] Status',
  automate_thread_id: '[Automação] Thread ID',
  assistant_analysis_status: 'Assistente OpenAI (status)',
  assistant_analysis_text: 'Assistente OpenAI (texto)',
};

export const TEXT_OPERATORS = {
  '1': 'Igual a', '2': 'Contém', '3': 'Diferente de', '4': 'Não contém', '5': 'É CPF',
  '6': 'Maior que', '7': 'Maior igual que', '8': 'Menor que', '9': 'Menor igual que',
  '11': 'É número', '12': 'É e-mail', '13': 'É CNPJ', '14': 'É CNPJ/CPF', '15': 'É data',
  '16': 'É menção de story', '17': 'É resposta de story', '22': 'É anexo/arquivo',
  '23': 'É áudio', '24': 'É forma de contato',
};
export const CONTACT_OPERATORS = { '10': 'É Vip', '21': 'Não é Vip', '18': 'Possui os labels', '19': 'Tem CPF', '20': 'Tem CNPJ' };
export const ERROR_COUNT_OPERATORS = { '1': 'Igual', '6': 'Maior', '7': 'Maior-igual', '8': 'Menor', '9': 'Menor-igual' };
export const OPT_IN_UCI_OPERATORS = { '1': 'Possui', '2': 'Não possui' };
export const OLD_ATTENDANCE_OPERATORS = { '1': 'Dias', '2': 'Horas', '3': 'Minutos', '4': 'Segundos' };
export const ENTRANCE_TYPE_OPERATORS = { '1': 'WhatsApp', '2': 'E-mail', '3': 'Facebook', '6': 'Webchat', '7': 'Instagram', '8': 'Telegram' };
export const SENDER_OPERATORS = { '1': 'Igual a', '2': 'Contém' };
export const CONTACT_NUMBER_OPERATORS = { '1': 'Começa com' };

export const ACTION_TYPE_LABELS = {
  '1': 'Mensagem', '2': 'Troca Estado', '4': 'Transf. Agente', '5': 'Transf. Fila',
  '6': 'Finalizar', '7': 'Executar Script', '8': 'Contador de Erros', '9': 'CheckPoint',
  '10': 'Mensagem Options', '11': 'Mensagem Form', '12': 'Enviar msg. à Entrance',
  '13': 'Armazenar variável', '14': 'Substatus', '15': 'Tags', '16': 'Atualizar contato',
  '17': 'Enviar anexo', '18': 'OpenAI', '19': 'Adicionar nota ao atendimento',
  '20': 'Enviar mensagem de áudio', '21': 'Adicionar forma de contato', '22': 'Executar Automação',
};
export const OPENAI_METHOD_LABELS = { call_assistant: 'Chamar assistente' };
export const UPDATE_CONTACT_LABELS = {
  'enable-opt-in': 'Habilitar Opt-in', 'disable-opt-in': 'Desabilitar Opt-in',
  'enable-opt-out': 'Habilitar Opt-out', 'disable-opt-out': 'Desabilitar Opt-out',
  'update-name': 'Atualizar nome', 'update-uci': 'Atualizar UCI',
  'update-observations': 'Atualizar observações', 'update-pref-agent': 'Atualizar agente preferido',
  'update-cpf': 'Atualizar CPF', 'update-cnpj': 'Atualizar CNPJ',
  'add-labels': 'Adicionar labels', 'add-contact-item': 'Adicionar forma de contato',
};

// Qual "família" de operadores uma variável usa (bot-engine-spec.md §4) — decide
// que lista completa aparece no <select> de operador quando a variável muda.
export const VARIABLE_KIND = {
  message: 'text', email_subject: 'text', automate_message: 'text', automate_status: 'text', automate_thread_id: 'text',
  contact: 'contact',
  error_count: 'error_count',
  opt_in: 'opt_in_uci', uci: 'opt_in_uci',
  old_attendance: 'old_attendance',
  entrance_type: 'entrance_type',
  sender: 'sender',
  contact_number: 'contact_number',
  calendario: 'ref_calendario', calendario_falso: 'ref_calendario', agent_on_queue: 'ref_fila', agent_online: 'ref_agente',
  agent_available_on_chat: 'ref_agente', status_last_att: 'ref_crm_status', entrance: 'ref_entrance',
  pref_agent: 'none', name_pref_agent: 'none', agent_last_att: 'none',
  assistant_analysis_status: 'openai_status', assistant_analysis_text: 'openai_text',
};

export const MENU_KIND_TABS = [
  { kind: 'whatsapp_list', label: 'WhatsApp — Lista' },
  { kind: 'whatsapp_button', label: 'WhatsApp — Botões' },
  { kind: 'webchat', label: 'WebChat' },
];

// Qual dicionário usar pra resolver texto→chave em cada campoBuscavel,
// identificado pelo id da sua <datalist> (data-dict).
export const DICTS_BUSCAVEIS = { 'update-contact-datalist': UPDATE_CONTACT_LABELS };

// ---------------------------------------------------------------------------
// Duplicação de estados e de transições inteiras (condição + ações), mutando
// o próprio bot carregado. As tabelas reais (bot-engine-spec.md §3) guardam
// cada linha com chave numérica E nomeada apontando pro mesmo valor (ex.:
// "0" e "ID" iguais) — replicamos isso aqui pra o JSON exportado continuar
// no formato que o sistema espera de volta.
// ---------------------------------------------------------------------------
export const TABLE_KEY_ORDER = {
  state: ['ID', 'STATE_NUMBER', 'ALIAS'],
  transition: ['ID', 'STATE', 'CONDITION', 'MESSAGE', 'TARGET_TYPE', 'TARGET', 'PRIORITY'],
  condition: ['ID', 'TRANSITION_ID', 'CONDITION_TYPE'],
  action: ['ID', 'TRANSITION_ID', 'ACTION_TYPE'],
};

// Campos de ACTION_DATA/CONDITION_DATA que só existem no ambiente de destino
// (fila, agente, script, OpenAI, etc.) — esta ferramenta não tem como saber
// o valor certo. Trocas de estado (destiny do tipo 2, callback_state,
// fallback_state) ficam de fora de propósito: já são 100% resolvíveis
// dentro do próprio bot (campoEstadoLivre), não dependem do ambiente.
export const CAMPOS_PENDENCIA_POR_TIPO = {
  '4': [['destiny', 'ID do agente destino']],
  '5': [['destiny', 'Número da fila / bot / agente']],
  '6': [['crm_status', 'Status CRM']],
  '7': [['script_name', 'Script']],
  '9': [['check_point', 'Checkpoint (ID)']],
  '12': [['entrances', 'Entrada destino (ID)']],
  '14': [['substatus', 'Substatus (ID)']],
  '15': [['message_text', 'Nome da tag']],
  '17': [['send_file', 'Arquivo (ID)']],
  '18': [['openai_account', 'Conta OpenAI'], ['assistant_id', 'Assistente (ID)']],
  '22': [['url', 'URL']],
};
