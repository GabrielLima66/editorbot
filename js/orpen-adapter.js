// ---------------------------------------------------------------------------
// Ponte pura (sem DOM, sem fetch) entre a API real da Orpen (ajax.php do
// módulo ContactCenter) e o formato "state.botCarregado" que abrirBotView()/
// bot-view-interactions.js já sabem consumir (mesmo shape achatado do JSON
// de exportBotJSON, documentado em TABLE_KEY_ORDER — js/dictionaries.js).
//
// Contrato conferido lendo (somente leitura) C:\Users\RCX\Desktop\Orpen:
//   - ContactCenter/classes/Bot.class.php:133-184  → Bot::getBot()
//   - ContactCenter/classes/Bot.class.php:199-264  → Bot::update()
//   - ContactCenter/ajax.php:2519-2565             → parsing de updateBot/getBot
//   - ContactCenter/bot.php:2890-2955              → editBot() (leitor nativo)
//   - ContactCenter/bot.php:2300-2585              → builder nativo de "states"
//     + payload nativo de updateBot (inclui a excentricidade replicada de
//     propósito abaixo: "conf_queue" e "timeout_queue" sempre viajam com o
//     mesmo valor — não é bug nosso, é como o modal nativo já se comporta).
//
// Nunca usa action=exportBotJSON (grava arquivo em
// /var/www/html/rcx/ContactCenter/botsJSON/ no servidor a cada chamada) nem
// action=importBotJSON — só getBot (leitura, zero side effect) e updateBot.
// ---------------------------------------------------------------------------

import { withMirrors } from './bot-view-interactions.js';
import { lerContaTranscricao } from './bot-view-render.js';

function agruparPor(lista, campo) {
  const mapa = {};
  (lista || []).forEach((item) => {
    const chave = item[campo];
    (mapa[chave] ||= []).push(item);
  });
  return mapa;
}

function parseJsonSeguro(texto) {
  if (texto == null) return {};
  if (typeof texto === 'object') return texto; // já veio decodificado (ex.: INTEGRATIONS)
  try {
    const v = JSON.parse(texto);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

// Mesmo mapa de espelho numérico que initBotNumeroEdit/mudarCampoBot usam em
// bot-view-interactions.js (BOT_FIELD_MIRROR_INDEX) — replicado aqui só pra
// popular o objeto já nascendo simétrico; nada depende disso pra funcionar.
const BOT_FIELD_MIRROR_INDEX = { NAME: '1', CONF_DELIVERY_TIME: '2', CONF_DELIVERY_QUEUE: '3', TIME_ANSWER: '4', TIMEOUT_DELAY: '5', TIMEOUT_ACTION: '6', TIMEOUT_DESTINY: '7', TIMEOUT_MESSAGE: '8' };

// ---------------------------------------------------------------------------
// Leitura: resposta crua de action=getBot → state.botCarregado
// ---------------------------------------------------------------------------
export function fromGetBotResponse(getBotJson) {
  const bot = {
    ID: getBotJson.ID ?? '',
    NAME: getBotJson.NAME ?? '',
    STATUS: getBotJson.STATUS ?? '',
    TIME_ANSWER: getBotJson.TIME_ANSWER ?? '',
    TIMEOUT_DELAY: getBotJson.TIMEOUT_DELAY ?? '',
    CONF_DELIVERY_TIME: getBotJson.CONF_DELIVERY_TIME ?? getBotJson.TIMEOUT_DELAY ?? '',
    CONF_DELIVERY_QUEUE: getBotJson.CONF_DELIVERY_QUEUE ?? '',
    TIMEOUT_ACTION: getBotJson.TIMEOUT_ACTION ?? '',
    TIMEOUT_DESTINY: getBotJson.TIMEOUT_DESTINY ?? '',
    TIMEOUT_MESSAGE: getBotJson.TIMEOUT_MESSAGE ?? '',
    // INTEGRATIONS já vem decodificado (Bot::getBot faz json_decode); mantém
    // como objeto — lerContaTranscricao/mudarContaTranscricao aceitam os dois.
    INTEGRATIONS: getBotJson.INTEGRATIONS ?? {},
    openai_accounts: getBotJson.openai_accounts ?? [],
  };
  Object.entries(BOT_FIELD_MIRROR_INDEX).forEach(([campo, idx]) => { bot[idx] = bot[campo]; });
  bot['0'] = bot.ID;

  // states: getBot só traz {STATE, ALIAS} (sem id de linha — a query usa
  // "state_number as state", sem selecionar o id da tabela ctc_bot_state).
  // Nada no editor depende do id real dessa linha pra lógica (só
  // STATE_NUMBER liga estado↔transição), então o próprio número do estado
  // serve de id estável e sequencial — inclusive pra nextId() continuar
  // gerando o próximo id corretamente quando um novo estado for adicionado.
  const states = getBotJson.states || [];
  bot.BOT_STATES = states.map((s) => withMirrors('state', {
    ID: String(s.STATE),
    STATE_NUMBER: String(s.STATE),
    ALIAS: s.ALIAS ?? '',
  }));

  // transitions: getBot já traz aninhado (transition.conditions/.actions).
  // "Achata" pra BOT_TRANSITIONS/BOT_CONDITIONS/BOT_ACTIONS no nível raiz,
  // exatamente como exportBotJSON faz — CONDITION_DATA/ACTION_DATA chegam
  // aqui como texto (htmlspecialchars_decode, não json_decode — ver
  // Bot.class.php:170-171/179-180), então precisam de JSON.parse aqui.
  const transitions = getBotJson.transitions || [];
  const botTransitions = [];
  const botConditions = [];
  const botActions = [];

  transitions.forEach((t) => {
    botTransitions.push(withMirrors('transition', {
      ID: String(t.ID),
      STATE: String(t.STATE),
      CONDITION: t.CONDITION ?? '',
      MESSAGE: t.MESSAGE ?? '',
      TARGET_TYPE: t.TARGET_TYPE ?? '',
      TARGET: t.TARGET ?? '',
      PRIORITY: String(t.PRIORITY ?? '0'),
    }));

    (t.conditions || []).forEach((c) => {
      botConditions.push(withMirrors('condition', {
        ID: String(c.ID),
        TRANSITION_ID: String(c.TRANSITION_ID ?? t.ID),
        CONDITION_TYPE: String(c.CONDITION_TYPE ?? '0'),
        CONDITION_DATA: parseJsonSeguro(c.CONDITION_DATA),
      }));
    });

    (t.actions || []).forEach((a) => {
      botActions.push(withMirrors('action', {
        ID: String(a.ID),
        TRANSITION_ID: String(a.TRANSITION_ID ?? t.ID),
        ACTION_TYPE: String(a.ACTION_TYPE ?? '0'),
        ACTION_DATA: parseJsonSeguro(a.ACTION_DATA),
      }));
    });
  });

  bot.BOT_TRANSITIONS = botTransitions;
  bot.BOT_CONDITIONS = botConditions;
  bot.BOT_ACTIONS = botActions;

  return bot;
}

// ---------------------------------------------------------------------------
// Escrita: state.botCarregado → payload de campos pro POST de action=updateBot
// (ainda não serializado — ver serializeBracketNotation abaixo). Reconstrói
// a árvore aninhada que Bot::update() espera, sempre a árvore inteira: ela
// faz DELETE + INSERT em loop dentro de uma transação (Bot.class.php:210-213
// em diante), nunca um diff parcial.
// ---------------------------------------------------------------------------
export function toUpdateBotPayload(bot) {
  const transicoesPorEstado = agruparPor(bot.BOT_TRANSITIONS, 'STATE');
  const condicoesPorTransicao = agruparPor(bot.BOT_CONDITIONS, 'TRANSITION_ID');
  const acoesPorTransicao = agruparPor(bot.BOT_ACTIONS, 'TRANSITION_ID');

  const estados = [...(bot.BOT_STATES || [])].sort((a, b) => parseInt(a.STATE_NUMBER, 10) - parseInt(b.STATE_NUMBER, 10));

  const states = estados.map((s) => {
    const transicoes = (transicoesPorEstado[s.STATE_NUMBER] || [])
      .slice()
      .sort((a, b) => parseInt(a.PRIORITY, 10) - parseInt(b.PRIORITY, 10));

    return {
      state_number: s.STATE_NUMBER,
      alias: s.ALIAS ?? '',
      transitions: transicoes.map((t) => {
        const condicoes = (condicoesPorTransicao[t.ID] || []).slice().sort((a, b) => parseInt(a.ID, 10) - parseInt(b.ID, 10));
        const acoes = (acoesPorTransicao[t.ID] || []).slice().sort((a, b) => parseInt(a.ID, 10) - parseInt(b.ID, 10));
        return {
          priority: parseInt(t.PRIORITY, 10) || 0,
          conditions: condicoes.map((c) => ({
            type: isNaN(Number(c.CONDITION_TYPE)) ? (c.CONDITION_TYPE || 0) : Number(c.CONDITION_TYPE),
            data: c.CONDITION_DATA || {},
          })),
          actions: acoes.map((a) => ({
            type: parseInt(a.ACTION_TYPE, 10) || 0,
            data: a.ACTION_DATA || {},
          })),
        };
      }),
    };
  });

  const timeoutAction = bot.TIMEOUT_ACTION ?? '';

  return {
    action: 'updateBot',
    number: bot.ID ?? '',
    name: bot.NAME ?? '',
    status: bot.STATUS ?? '',
    conf_time: bot.CONF_DELIVERY_TIME ?? '',
    // Excentricidade do modal nativo (bot.php:2555): "conf_queue" sempre
    // viaja com o mesmo valor do campo de fila de timeout — nosso editor
    // já modela isso com um campo único (CONF_DELIVERY_QUEUE, ver
    // atualizarSecaoDestino em bot-view-render.js), então replicar aqui é
    // só espelhar o mesmo valor nos dois campos POST.
    conf_queue: bot.CONF_DELIVERY_QUEUE ?? '',
    time_answer_edit: bot.TIME_ANSWER ?? '',
    timeout_action: timeoutAction,
    audio_transcription_account: lerContaTranscricao(bot),
    // O servidor calcula TIMEOUT_DESTINY a partir de um destes três campos,
    // escolhido pelo próprio timeout_action (ajax.php:2536-2551) — manda os
    // três, cada um só "vale" quando bate com o action atual.
    timeout_bot_state: timeoutAction === 'bot' ? (bot.TIMEOUT_DESTINY ?? '') : '',
    timeout_queue: bot.CONF_DELIVERY_QUEUE ?? '',
    timeout_close_status: timeoutAction === 'close' ? (bot.TIMEOUT_DESTINY ?? '') : '',
    timeout_close_message: timeoutAction === 'close' ? (bot.TIMEOUT_MESSAGE ?? '') : '',
    // Se for bot novo, manda 'duplicate' pra proteger contra sobrescrita
    // silenciosa (ajax.php bloqueia e avisa se o ID já existir). Se for edição,
    // manda 'edit' pra permitir sobrescrever o existente.
    actionForm: bot._isNewBot ? 'duplicate' : 'edit',
    states,
  };
}

// ---------------------------------------------------------------------------
// Serializador bracket-notation (equivalente ao que $.ajax faria sozinho a
// partir de um objeto JS, via jQuery.param) — precisa ser próprio porque o
// content script roda em isolated world e não enxerga o jQuery da página.
// Produz application/x-www-form-urlencoded com notação de array PHP:
// states[0][transitions][0][conditions][0][data][variable]=... — é assim
// que $_REQUEST['states'] chega no PHP já como array aninhado.
// ---------------------------------------------------------------------------
export function serializeBracketNotation(payload) {
  const partes = [];

  function andar(valor, prefixo) {
    if (valor === null || valor === undefined) {
      partes.push(`${encodeURIComponent(prefixo)}=`);
      return;
    }
    if (typeof valor === 'object') {
      const chaves = Object.keys(valor);
      if (chaves.length === 0) {
        // Objeto vazio deve enviar string vazia para preservar a chave
        partes.push(`${encodeURIComponent(prefixo)}=`);
        return;
      }
      chaves.forEach((chave) => {
        const proximoPrefixo = `${prefixo}[${chave}]`;
        andar(valor[chave], proximoPrefixo);
      });
      return;
    }
    partes.push(`${encodeURIComponent(prefixo)}=${encodeURIComponent(valor)}`);
  }

  Object.keys(payload).forEach((chave) => {
    const valor = payload[chave];
    if (valor !== null && typeof valor === 'object') {
      Object.keys(valor).forEach((subchave) => andar(valor[subchave], `${chave}[${subchave}]`));
    } else if (valor === null || valor === undefined) {
      partes.push(`${encodeURIComponent(chave)}=`);
    } else {
      partes.push(`${encodeURIComponent(chave)}=${encodeURIComponent(valor)}`);
    }
  });

  return partes.join('&');
}
