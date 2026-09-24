import { state } from './state.js';
import { TABLE_KEY_ORDER, ACTION_TYPE_LABELS, VARIABLE_LABELS, VARIABLE_KIND, UPDATE_CONTACT_LABELS, DICTS_BUSCAVEIS, CAMPOS_PENDENCIA_POR_TIPO } from './dictionaries.js';
import { $, escapeHtml, resolverPorLabel, resolverPorLabelLista, entriesToOptions } from './utils.js';
import { getRootNode, criarIcones } from './dom-root.js';
import {
  buildOperatorOptions,
  defaultActionData,
  renderTransicaoRow,
  renderEstado,
  renderPainelConfirmacaoItem,
  renderPainelBloqueio,
  renderPainelConfirmacao,
  abrirBotView,
  fecharBotView,
  atualizarSecaoDestino,
  lerContaTranscricao,
  atualizarContadorRodape,
} from './bot-view-render.js';
import { initMenuBuilders } from './menu-builder.js';
import { initVariaveisBuilders } from './variaveis-builder.js';
import { abrirModalMenu } from './menu-modal.js';
import { mostrarResumoBot } from './upload.js';

// ---------------------------------------------------------------------------
// Duplicação de estados e de transições inteiras (condição + ações), mutando
// o próprio bot carregado. As tabelas reais (bot-engine-spec.md §3) guardam
// cada linha com chave numérica E nomeada apontando pro mesmo valor (ex.:
// "0" e "ID" iguais) — replicamos isso aqui pra o JSON exportado continuar
// no formato que o sistema espera de volta.
// ---------------------------------------------------------------------------
export function withMirrors(kind, obj) {
  (TABLE_KEY_ORDER[kind] || []).forEach((namedKey, idx) => { obj[String(idx)] = obj[namedKey]; });
  return obj;
}
export function nextId(items) {
  return String((items || []).reduce((m, i) => Math.max(m, parseInt(i.ID, 10) || 0), 0) + 1);
}

// Igual ao original em tudo (STATE, CONDITION, MESSAGE, TARGET etc.), mas
// nasce logo depois da transição original na ordem de PRIORITY — não no
// fim da lista. Mesma receita de renumerar tudo do estado (moverTransicao),
// necessária porque o novo ID (sempre o maior do bot) sozinho empurraria a
// cópia pro fim se só desse a ela "prioridade máxima + 1".
export function duplicarTransicao(bot, transitionId) {
  const original = (bot.BOT_TRANSITIONS || []).find(t => t.ID === transitionId);
  if (!original) return;

  const novoTransitionId = nextId(bot.BOT_TRANSITIONS);
  const copia = withMirrors('transition', { ...original, ID: novoTransitionId, PRIORITY: original.PRIORITY });

  const doMesmoEstado = (bot.BOT_TRANSITIONS || [])
    .filter(t => t.STATE === original.STATE)
    .sort((a, b) => parseInt(a.PRIORITY, 10) - parseInt(b.PRIORITY, 10));
  const indiceOriginal = doMesmoEstado.findIndex(t => t.ID === transitionId);
  doMesmoEstado.splice(indiceOriginal + 1, 0, copia);
  doMesmoEstado.forEach((t, i) => {
    t.PRIORITY = String(i);
    t['6'] = t.PRIORITY;
  });

  bot.BOT_TRANSITIONS.push(copia);

  (bot.BOT_CONDITIONS || []).filter(c => c.TRANSITION_ID === transitionId).forEach(c => {
    const novoId = nextId(bot.BOT_CONDITIONS);
    bot.BOT_CONDITIONS.push(withMirrors('condition', { ...c, ID: novoId, TRANSITION_ID: novoTransitionId, CONDITION_DATA: JSON.parse(JSON.stringify(c.CONDITION_DATA)) }));
  });
  (bot.BOT_ACTIONS || []).filter(a => a.TRANSITION_ID === transitionId).forEach(a => {
    const novoId = nextId(bot.BOT_ACTIONS);
    bot.BOT_ACTIONS.push(withMirrors('action', { ...a, ID: novoId, TRANSITION_ID: novoTransitionId, ACTION_DATA: JSON.parse(JSON.stringify(a.ACTION_DATA)) }));
  });
}

// Exclui a transição inteira (condição + ações). Seguro sem checar
// referências externas: diferente de estado, o ID de uma transição nunca é
// referenciado por fora dela mesma (só STATE, que é outra coisa) — mesmo
// fato já usado em moverTransicao/duplicarTransicao. Depois de remover,
// renumera PRIORITY das transições restantes do estado pra fechar o buraco
// deixado (mesma receita de excluirEstado pro STATE_NUMBER).
export function excluirTransicao(bot, transitionId) {
  const original = (bot.BOT_TRANSITIONS || []).find(t => t.ID === transitionId);
  if (!original) return;

  bot.BOT_CONDITIONS = (bot.BOT_CONDITIONS || []).filter(c => c.TRANSITION_ID !== transitionId);
  bot.BOT_ACTIONS = (bot.BOT_ACTIONS || []).filter(a => a.TRANSITION_ID !== transitionId);
  bot.BOT_TRANSITIONS = (bot.BOT_TRANSITIONS || []).filter(t => t.ID !== transitionId);

  const doMesmoEstado = bot.BOT_TRANSITIONS
    .filter(t => t.STATE === original.STATE)
    .sort((a, b) => parseInt(a.PRIORITY, 10) - parseInt(b.PRIORITY, 10));
  doMesmoEstado.forEach((t, i) => {
    t.PRIORITY = String(i);
    t['6'] = t.PRIORITY;
  });
}

export function adicionarCondicao(bot, transitionId) {
  const novoId = nextId(bot.BOT_CONDITIONS);
  bot.BOT_CONDITIONS = (bot.BOT_CONDITIONS || []).concat([
    withMirrors('condition', {
      ID: novoId,
      TRANSITION_ID: transitionId,
      CONDITION_TYPE: '1',
      CONDITION_DATA: { variable: 'message', type: '1', value: '' },
    }),
  ]);
}

export function adicionarAcao(bot, transitionId) {
  const novoId = nextId(bot.BOT_ACTIONS);
  bot.BOT_ACTIONS = (bot.BOT_ACTIONS || []).concat([
    withMirrors('action', {
      ID: novoId,
      TRANSITION_ID: transitionId,
      ACTION_TYPE: '1',
      ACTION_DATA: { message_text: '' },
    }),
  ]);
}

// Ao converter um menu com cabeçalho/corpo/rodapé pra WebChat (formato cujo
// JSON não tem campo pra esse texto), separamos de verdade: cria uma ação
// real "Mensagem" (ACTION_TYPE '1') na MESMA transição, logo antes da ação de
// menu, com o texto que seria perdido — e já deixa a própria ação de menu com
// o novo ACTION_DATA (JSON do WebChat). É uma via de mão única: voltar de
// WebChat pra um kind do WhatsApp depois NÃO tenta fundir/restaurar uma ação
// "Mensagem" anterior — não há como saber se ela foi criada por aqui ou já
// existia por outro motivo.
//
// Reatribui ID novo e sequencial a TODAS as ações da transição informada, na
// ordem final desejada, porque a ordem de exibição/execução vem do sort por
// ID ascendente feito em abrirBotView — inserir no meio exige recolocar quem
// vem depois. Ações de outras transições nunca são tocadas. Seguro renumerar
// livremente: nenhuma outra tabela referencia o ID de uma ação (só
// TRANSITION_ID, que aponta pra BOT_TRANSITIONS — tabela diferente).
export function dividirMensagemDoMenu(bot, transitionId, actionId, textoMensagem, novoActionDataMenu) {
  if (!bot || !transitionId || !actionId) return;
  const todasAcoes = bot.BOT_ACTIONS || [];
  const daTransicao = todasAcoes.filter(a => a.TRANSITION_ID === transitionId)
    .sort((a, b) => parseInt(a.ID, 10) - parseInt(b.ID, 10));
  const idxMenu = daTransicao.findIndex(a => a.ID === actionId);
  if (idxMenu === -1) return;

  const outras = todasAcoes.filter(a => a.TRANSITION_ID !== transitionId);

  const ordemFinal = [];
  daTransicao.forEach((a, i) => {
    if (i === idxMenu) {
      ordemFinal.push({ ACTION_TYPE: '1', ACTION_DATA: { message_text: textoMensagem } });
      ordemFinal.push({ ...a, ACTION_DATA: novoActionDataMenu });
    } else {
      ordemFinal.push({ ...a });
    }
  });

  let baseParaId = outras.concat(daTransicao);
  const comIdsNovos = ordemFinal.map(a => {
    const novoId = nextId(baseParaId);
    const comId = withMirrors('action', { ...a, ID: novoId, TRANSITION_ID: transitionId });
    baseParaId = baseParaId.concat([comId]);
    return comId;
  });

  bot.BOT_ACTIONS = outras.concat(comIdsNovos);
}

// Texto da ação "Mensagem" imediatamente anterior a esta, na mesma
// transição, se houver — convenção usada pro caminho inverso de
// dividirMensagemDoMenu: um menu de WebChat sempre tem a mensagem em cima,
// então ao voltar pra um kind do WhatsApp esse texto vira o corpo do menu de
// novo. Só leitura, não muda nada no bot. Retorna `null` quando não há o que
// absorver (primeira ação da transição, ou a anterior não é uma Mensagem).
export function mensagemAnteriorNaTransicao(bot, transitionId, actionId) {
  const daTransicao = (bot.BOT_ACTIONS || []).filter(a => a.TRANSITION_ID === transitionId)
    .sort((a, b) => parseInt(a.ID, 10) - parseInt(b.ID, 10));
  const idx = daTransicao.findIndex(a => a.ID === actionId);
  if (idx <= 0) return null;
  const anterior = daTransicao[idx - 1];
  if (anterior.ACTION_TYPE !== '1') return null;
  return (anterior.ACTION_DATA && anterior.ACTION_DATA.message_text) || '';
}

// Inverso de dividirMensagemDoMenu: remove de verdade a ação "Mensagem"
// imediatamente anterior (já confirmada via mensagemAnteriorNaTransicao) e
// atualiza a ação de menu com o novo ACTION_DATA (que já deve incluir o
// texto absorvido no corpo). Renumera o resto da transição do mesmo jeito.
export function absorverMensagemAnterior(bot, transitionId, actionId, novoActionDataMenu) {
  const daTransicao = (bot.BOT_ACTIONS || []).filter(a => a.TRANSITION_ID === transitionId)
    .sort((a, b) => parseInt(a.ID, 10) - parseInt(b.ID, 10));
  const idx = daTransicao.findIndex(a => a.ID === actionId);
  if (idx <= 0 || daTransicao[idx - 1].ACTION_TYPE !== '1') return;

  const outras = (bot.BOT_ACTIONS || []).filter(a => a.TRANSITION_ID !== transitionId);
  const restante = daTransicao
    .filter((a, i) => i !== idx - 1)
    .map(a => a.ID === actionId ? { ...a, ACTION_DATA: novoActionDataMenu } : a);

  let baseParaId = outras.concat(restante);
  const comIdsNovos = restante.map(a => {
    const novoId = nextId(baseParaId);
    const comId = withMirrors('action', { ...a, ID: novoId, TRANSITION_ID: transitionId });
    baseParaId = baseParaId.concat([comId]);
    return comId;
  });

  bot.BOT_ACTIONS = outras.concat(comIdsNovos);
}

// ---------------------------------------------------------------------------
// Reordenar condições/ações dentro de uma transição (setas ▲▼). Mesma receita
// de dividirMensagemDoMenu/absorverMensagemAnterior: a ordem de exibição vem
// do sort por ID ascendente feito em abrirBotView, então trocar a posição de
// dois itens adjacentes é feito reordenando a lista em memória e recolocando
// IDs novos e sequenciais na ordem final. Seguro renumerar livremente: nenhuma
// outra tabela referencia o ID de uma condição ou de uma ação (só
// TRANSITION_ID, que aponta pra BOT_TRANSITIONS).
// ---------------------------------------------------------------------------
export function moverCondicao(bot, transitionId, conditionId, dir) {
  const outras = (bot.BOT_CONDITIONS || []).filter(c => c.TRANSITION_ID !== transitionId);
  const daTransicao = (bot.BOT_CONDITIONS || []).filter(c => c.TRANSITION_ID === transitionId)
    .sort((a, b) => parseInt(a.ID, 10) - parseInt(b.ID, 10));
  const indiceAtual = daTransicao.findIndex(c => c.ID === conditionId);
  const novoIndice = indiceAtual + dir;
  if (indiceAtual === -1 || novoIndice < 0 || novoIndice >= daTransicao.length) return;

  const [movida] = daTransicao.splice(indiceAtual, 1);
  daTransicao.splice(novoIndice, 0, movida);

  let baseParaIdCond = outras.concat(daTransicao);
  const comIdsNovosCond = daTransicao.map(c => {
    const novoId = nextId(baseParaIdCond);
    const comId = withMirrors('condition', { ...c, ID: novoId, TRANSITION_ID: transitionId });
    baseParaIdCond = baseParaIdCond.concat([comId]);
    return comId;
  });

  bot.BOT_CONDITIONS = outras.concat(comIdsNovosCond);
}

export function moverAcao(bot, transitionId, actionId, dir) {
  const outrasAcoes = (bot.BOT_ACTIONS || []).filter(a => a.TRANSITION_ID !== transitionId);
  const daTransicaoAcoes = (bot.BOT_ACTIONS || []).filter(a => a.TRANSITION_ID === transitionId)
    .sort((a, b) => parseInt(a.ID, 10) - parseInt(b.ID, 10));
  const indiceAtualAcao = daTransicaoAcoes.findIndex(a => a.ID === actionId);
  const novoIndiceAcao = indiceAtualAcao + dir;
  if (indiceAtualAcao === -1 || novoIndiceAcao < 0 || novoIndiceAcao >= daTransicaoAcoes.length) return;

  const [movidaAcao] = daTransicaoAcoes.splice(indiceAtualAcao, 1);
  daTransicaoAcoes.splice(novoIndiceAcao, 0, movidaAcao);

  let baseParaIdAcao = outrasAcoes.concat(daTransicaoAcoes);
  const comIdsNovosAcao = daTransicaoAcoes.map(a => {
    const novoId = nextId(baseParaIdAcao);
    const comId = withMirrors('action', { ...a, ID: novoId, TRANSITION_ID: transitionId });
    baseParaIdAcao = baseParaIdAcao.concat([comId]);
    return comId;
  });

  bot.BOT_ACTIONS = outrasAcoes.concat(comIdsNovosAcao);
}

// Excluir não muda a ordem relativa de quem sobra (só remove um item do
// meio), então diferente de moverCondicao/moverAcao não precisa renumerar
// nada — o sort por ID ascendente em abrirBotView já resolve.
export function excluirCondicao(bot, transitionId, conditionId) {
  bot.BOT_CONDITIONS = (bot.BOT_CONDITIONS || []).filter(c => !(c.TRANSITION_ID === transitionId && c.ID === conditionId));
}

// Trocar a variável reseta o operador pro primeiro válido da nova lista (o
// antigo pode nem existir mais pra essa variável) e mantém o valor — o
// usuário ajusta se precisar. CONDITION_TYPE sempre fica no nível raiz da
// condição (não dentro de CONDITION_DATA), mesmo formato usado pelo resto
// do arquivo (renderCondicao já lê de lá pro caso não-assistente).
export function mudarCondicaoVariavel(bot, transitionId, conditionId, novaVariavel) {
  const cond = (bot.BOT_CONDITIONS || []).find(c => c.TRANSITION_ID === transitionId && c.ID === conditionId);
  if (!cond) return;
  cond.CONDITION_DATA = { ...cond.CONDITION_DATA, variable: novaVariavel };
  if (novaVariavel.startsWith('assistant_analysis_')) {
    if (cond.CONDITION_DATA.assistant_id === undefined) {
      cond.CONDITION_DATA.assistant_id = '';
    }
  }
  const kind = VARIABLE_KIND[novaVariavel] || 'text';
  const primeiroTipo = buildOperatorOptions(kind, '')[0]?.value ?? '';
  cond.CONDITION_TYPE = primeiroTipo;
  if (cond.CONDITION_DATA && cond.CONDITION_DATA.assistant_id !== undefined) {
    if (novaVariavel === 'assistant_analysis_status') {
      cond.CONDITION_DATA.value = primeiroTipo;
    } else {
      cond.CONDITION_DATA.type = primeiroTipo;
    }
  }
  withMirrors('condition', cond);
}

export function mudarCondicaoOperador(bot, transitionId, conditionId, novoTipo) {
  const cond = (bot.BOT_CONDITIONS || []).find(c => c.TRANSITION_ID === transitionId && c.ID === conditionId);
  if (!cond) return;
  cond.CONDITION_TYPE = novoTipo;
  if (cond.CONDITION_DATA && cond.CONDITION_DATA.assistant_id !== undefined) {
    if (cond.CONDITION_DATA.variable === 'assistant_analysis_status') {
      cond.CONDITION_DATA.value = novoTipo;
    } else {
      cond.CONDITION_DATA.type = novoTipo;
    }
  }
  withMirrors('condition', cond);
}

export function mudarCondicaoValor(bot, transitionId, conditionId, novoValor) {
  const cond = (bot.BOT_CONDITIONS || []).find(c => c.TRANSITION_ID === transitionId && c.ID === conditionId);
  if (!cond) return;
  cond.CONDITION_DATA = { ...cond.CONDITION_DATA, value: novoValor };
}

export function excluirAcao(bot, transitionId, actionId) {
  bot.BOT_ACTIONS = (bot.BOT_ACTIONS || []).filter(a => !(a.TRANSITION_ID === transitionId && a.ID === actionId));
}

// Trocar o tipo de uma ação já existente descarta o ACTION_DATA antigo — os
// campos de um tipo raramente fazem sentido pra outro (ex.: message_text de
// Mensagem não vira destiny de Troca Estado), então nasce em branco (mesmo
// espírito do "default seguro e editável" de adicionarAcao).
export function mudarTipoAcao(bot, transitionId, actionId, novoTipo) {
  const acao = (bot.BOT_ACTIONS || []).find(a => a.TRANSITION_ID === transitionId && a.ID === actionId);
  if (!acao || acao.ACTION_TYPE === novoTipo) return;
  acao.ACTION_TYPE = novoTipo;
  acao.ACTION_DATA = defaultActionData(novoTipo);
  withMirrors('action', acao);
}

// Os campos "estado livre" (campoEstadoLivre) mostram "N - ALIAS" quando o
// valor bate com um estado conhecido, mas aceitam qualquer texto digitado.
// Se o valor digitado/escolhido começa com "<número> -", extrai só o número
// (é isso que ACTION_DATA espera); senão usa o texto puro (permite digitar
// um número de estado direto, ou até um valor que não existe neste bot).
export function extrairNumeroEstado(valorDigitado) {
  const texto = (valorDigitado ?? '').trim();
  const match = /^(\d+)\s*-/.exec(texto);
  return match ? match[1] : texto;
}

export function mudarCampoEstadoAcao(bot, transitionId, actionId, campo, valorDigitado) {
  const acao = (bot.BOT_ACTIONS || []).find(a => a.TRANSITION_ID === transitionId && a.ID === actionId);
  if (!acao) return;
  acao.ACTION_DATA = { ...acao.ACTION_DATA, [campo]: extrairNumeroEstado(valorDigitado) };
}

// Mesma ideia de mudarCampoEstadoAcao, mas pra campos de texto livre (sem
// resolver contra estados do bot) — ex.: destiny de Transf. Agente/Fila.
export function mudarCampoAcao(bot, transitionId, actionId, campo, valor) {
  const acao = (bot.BOT_ACTIONS || []).find(a => a.TRANSITION_ID === transitionId && a.ID === actionId);
  if (!acao) return;

  if (campo === 'update_contact_value') {
    acao.ACTION_DATA = { update_contact_value: valor };
    if (valor === 'add-labels') {
      acao.ACTION_DATA.labels = [];
    } else if (valor === 'add-contact-item') {
      acao.ACTION_DATA.contact_item_type = 'email';
      acao.ACTION_DATA.message_text = '';
    } else if (['update-name', 'update-uci', 'update-observations', 'update-pref-agent', 'update-cpf', 'update-cnpj'].includes(valor)) {
      acao.ACTION_DATA.message_text = '';
    }
    return;
  }

  // "labels" (Atualizar contato / add-labels) é a única ACTION_DATA que
  // guarda array em vez de string — o campo mostra/edita como texto
  // separado por vírgula, mas precisa voltar a virar array ao salvar.
  const valorFinal = campo === 'labels' ? valor.split(',').map(s => s.trim()).filter(Boolean) : valor;
  acao.ACTION_DATA = { ...acao.ACTION_DATA, [campo]: valorFinal };
}

// Reescreve toda referência a STATE_NUMBER (estado dos próprios estados,
// STATE das transições, destiny de ações "Troca Estado", callback_state/
// fallback_state de OpenAI/Áudio/Automação, e TIMEOUT_DESTINY quando o
// timeout troca de estado) conforme o mapa antigo->novo informado. Necessário
// sempre que um estado muda de número (inserção, exclusão ou reordenação) —
// senão os números deixam de bater com o que cada estado realmente representa.
export function remapStateNumbers(bot, mapa) {
  if (!mapa.size) return;
  (bot.BOT_STATES || []).forEach(s => {
    if (mapa.has(s.STATE_NUMBER)) { s.STATE_NUMBER = mapa.get(s.STATE_NUMBER); s['1'] = s.STATE_NUMBER; }
  });
  (bot.BOT_TRANSITIONS || []).forEach(t => {
    if (mapa.has(t.STATE)) { t.STATE = mapa.get(t.STATE); t['1'] = t.STATE; }
  });
  (bot.BOT_ACTIONS || []).forEach(a => {
    if (a.ACTION_TYPE === '2' && a.ACTION_DATA && mapa.has(a.ACTION_DATA.destiny)) {
      a.ACTION_DATA.destiny = mapa.get(a.ACTION_DATA.destiny);
    }
    // Tipos 18 (OpenAI), 20 (Áudio) e 22 (Automação) também guardam número de
    // estado, em callback_state/fallback_state (bot-engine-spec.md §5).
    if (['18', '20', '22'].includes(a.ACTION_TYPE) && a.ACTION_DATA) {
      ['callback_state', 'fallback_state'].forEach(campo => {
        if (mapa.has(a.ACTION_DATA[campo])) a.ACTION_DATA[campo] = mapa.get(a.ACTION_DATA[campo]);
      });
    }
  });
  if (bot.TIMEOUT_ACTION === 'bot' && mapa.has(bot.TIMEOUT_DESTINY)) {
    bot.TIMEOUT_DESTINY = mapa.get(bot.TIMEOUT_DESTINY);
    bot['7'] = bot.TIMEOUT_DESTINY;
  }
}

export function duplicarEstado(bot, stateNumber) {
  const indiceOriginal = (bot.BOT_STATES || []).findIndex(s => s.STATE_NUMBER === stateNumber);
  if (indiceOriginal === -1) return;
  const original = bot.BOT_STATES[indiceOriginal];

  // A cópia entra logo depois do original — todo estado com número maior
  // (e tudo que aponta pra ele) sobe uma casa pra abrir espaço.
  const origemNum = parseInt(stateNumber, 10);
  const novoStateNumber = String(origemNum + 1);
  const mapa = new Map();
  bot.BOT_STATES.forEach(s => {
    const n = parseInt(s.STATE_NUMBER, 10);
    if (n >= origemNum + 1) mapa.set(s.STATE_NUMBER, String(n + 1));
  });
  remapStateNumbers(bot, mapa);

  const novoStateId = nextId(bot.BOT_STATES);
  const novoEstado = withMirrors('state', { ...original, ID: novoStateId, STATE_NUMBER: novoStateNumber, ALIAS: (original.ALIAS || '') + ' (cópia)' });
  bot.BOT_STATES.splice(indiceOriginal + 1, 0, novoEstado);

  (bot.BOT_TRANSITIONS || []).filter(t => t.STATE === stateNumber).forEach(t => {
    const novoTransitionId = nextId(bot.BOT_TRANSITIONS);
    bot.BOT_TRANSITIONS.push(withMirrors('transition', { ...t, ID: novoTransitionId, STATE: novoStateNumber }));
    (bot.BOT_CONDITIONS || []).filter(c => c.TRANSITION_ID === t.ID).forEach(c => {
      const novoId = nextId(bot.BOT_CONDITIONS);
      bot.BOT_CONDITIONS.push(withMirrors('condition', { ...c, ID: novoId, TRANSITION_ID: novoTransitionId, CONDITION_DATA: JSON.parse(JSON.stringify(c.CONDITION_DATA)) }));
    });
    (bot.BOT_ACTIONS || []).filter(a => a.TRANSITION_ID === t.ID).forEach(a => {
      const novoId = nextId(bot.BOT_ACTIONS);
      bot.BOT_ACTIONS.push(withMirrors('action', { ...a, ID: novoId, TRANSITION_ID: novoTransitionId, ACTION_DATA: JSON.parse(JSON.stringify(a.ACTION_DATA)) }));
    });
  });
  return novoStateNumber;
}

// Reordena um estado pra uma nova posição (índice 0-based) e renumera TODOS
// os estados sequencialmente (0..N-1) conforme a nova ordem, corrigindo toda
// referência via remapStateNumbers. Usada tanto pelo drag-and-drop quanto
// pelo seletor de posição — mesma função, mesmo resultado final.
export function moverEstado(bot, stateNumber, novoIndice) {
  const ordenados = [...(bot.BOT_STATES || [])].sort((a, b) => parseInt(a.STATE_NUMBER, 10) - parseInt(b.STATE_NUMBER, 10));
  const indiceAtual = ordenados.findIndex(s => s.STATE_NUMBER === stateNumber);
  if (indiceAtual === -1) return stateNumber;
  novoIndice = Math.max(0, Math.min(novoIndice, ordenados.length - 1));
  if (novoIndice === indiceAtual) return stateNumber;

  const [movido] = ordenados.splice(indiceAtual, 1);
  ordenados.splice(novoIndice, 0, movido);

  const mapa = new Map();
  ordenados.forEach((s, i) => {
    const novoNumero = String(i);
    if (s.STATE_NUMBER !== novoNumero) mapa.set(s.STATE_NUMBER, novoNumero);
  });
  remapStateNumbers(bot, mapa);
  bot.BOT_STATES = ordenados;
  return mapa.get(stateNumber) ?? stateNumber;
}

// Mesma lógica de moverEstado, mas para transições dentro de um mesmo
// estado. Diferença chave: PRIORITY não dobra como chave estrangeira (só
// STATE é referenciado por fora — nenhuma tabela referencia PRIORITY), então
// não existe remap tipo remapStateNumbers aqui — basta renumerar PRIORITY
// (+ espelho numérico '6') de quem compartilha o mesmo STATE, mutando os
// objetos já vivos dentro de bot.BOT_TRANSITIONS (achados via find/filter) —
// sem precisar reatribuir o array.
// Cria uma transição em branco (sem condição/ações) num estado — necessário
// pra estados novos (adicionarEstado) que nascem sem nenhuma, já que
// duplicarTransicao só existe a partir de uma transição já existente pra
// copiar. Nasce sempre na última posição (PRIORITY) do estado.
export function adicionarTransicao(bot, stateNumber) {
  const novoId = nextId(bot.BOT_TRANSITIONS);
  const doMesmoEstado = (bot.BOT_TRANSITIONS || []).filter(t => t.STATE === stateNumber);
  const novaPrioridade = String(doMesmoEstado.reduce((m, t) => Math.max(m, parseInt(t.PRIORITY, 10) || 0), -1) + 1);
  bot.BOT_TRANSITIONS = (bot.BOT_TRANSITIONS || []).concat([
    withMirrors('transition', { ID: novoId, STATE: stateNumber, CONDITION: '', MESSAGE: '', TARGET_TYPE: '', TARGET: '', PRIORITY: novaPrioridade }),
  ]);
  return novoId;
}

export function moverTransicao(bot, transitionId, novoIndice) {
  const original = (bot.BOT_TRANSITIONS || []).find(t => t.ID === transitionId);
  if (!original) return;
  const doMesmoEstado = (bot.BOT_TRANSITIONS || [])
    .filter(t => t.STATE === original.STATE)
    .sort((a, b) => parseInt(a.PRIORITY, 10) - parseInt(b.PRIORITY, 10));
  const indiceAtual = doMesmoEstado.findIndex(t => t.ID === transitionId);
  if (indiceAtual === -1) return;
  novoIndice = Math.max(0, Math.min(novoIndice, doMesmoEstado.length - 1));
  if (novoIndice === indiceAtual) return;

  const [movida] = doMesmoEstado.splice(indiceAtual, 1);
  doMesmoEstado.splice(novoIndice, 0, movida);

  doMesmoEstado.forEach((t, i) => {
    t.PRIORITY = String(i);
    t['6'] = t.PRIORITY;
  });
}

// Varre o bot inteiro procurando referências a `stateNumber` vindas de FORA
// das próprias transições desse estado (ação "Troca Estado" de outro estado,
// callback_state/fallback_state de OpenAI/Áudio/Automação, ou o timeout do
// bot). Referências das próprias transições do estado (self-loop) não contam
// — elas seriam excluídas junto com ele. Retorna uma lista de descrições
// legíveis; lista vazia = seguro excluir.
export function referenciasParaEstado(bot, stateNumber) {
  const referencias = [];
  const estadoPorNumero = {};
  (bot.BOT_STATES || []).forEach(s => estadoPorNumero[s.STATE_NUMBER] = s);
  const transicaoPorId = {};
  (bot.BOT_TRANSITIONS || []).forEach(t => transicaoPorId[t.ID] = t);

  (bot.BOT_ACTIONS || []).forEach(a => {
    const transicao = transicaoPorId[a.TRANSITION_ID];
    if (!transicao || transicao.STATE === stateNumber) return; // self-loop do próprio estado — não bloqueia
    const estadoOrigem = estadoPorNumero[transicao.STATE];
    const nomeOrigem = `Estado "${escapeHtml(estadoOrigem ? estadoOrigem.ALIAS : '?')}" (nº ${escapeHtml(transicao.STATE)})`;

    if (a.ACTION_TYPE === '2' && a.ACTION_DATA && a.ACTION_DATA.destiny === stateNumber) {
      referencias.push(`${nomeOrigem} tem uma ação "Troca Estado" (transição prioridade ${escapeHtml(transicao.PRIORITY)}) que aponta para este estado.`);
    }
    if (['18', '20', '22'].includes(a.ACTION_TYPE) && a.ACTION_DATA) {
      ['callback_state', 'fallback_state'].forEach(campo => {
        if (a.ACTION_DATA[campo] === stateNumber) {
          referencias.push(`${nomeOrigem} tem uma ação "${ACTION_TYPE_LABELS[a.ACTION_TYPE] || a.ACTION_TYPE}" (transição prioridade ${escapeHtml(transicao.PRIORITY)}) que aponta para este estado via "${campo}".`);
        }
      });
    }
  });

  if (bot.TIMEOUT_ACTION === 'bot' && bot.TIMEOUT_DESTINY === stateNumber) {
    referencias.push('A configuração de timeout do bot ("Ações de timeout" → Trocar estado) aponta para este estado.');
  }

  return referencias;
}

// Exclui um estado e tudo que pertence só a ele (transições, condições,
// ações), depois renumera os estados seguintes pra baixo e corrige toda
// referência via remapStateNumbers. Espelho de duplicarEstado (remove em vez
// de inserir). Só deve ser chamada depois que referenciasParaEstado já
// confirmou lista vazia — não faz nenhuma checagem de segurança sozinha.
export function excluirEstado(bot, stateNumber) {
  const indice = (bot.BOT_STATES || []).findIndex(s => s.STATE_NUMBER === stateNumber);
  if (indice === -1) return;

  const idsTransicoes = new Set((bot.BOT_TRANSITIONS || []).filter(t => t.STATE === stateNumber).map(t => t.ID));
  bot.BOT_CONDITIONS = (bot.BOT_CONDITIONS || []).filter(c => !idsTransicoes.has(c.TRANSITION_ID));
  bot.BOT_ACTIONS = (bot.BOT_ACTIONS || []).filter(a => !idsTransicoes.has(a.TRANSITION_ID));
  bot.BOT_TRANSITIONS = (bot.BOT_TRANSITIONS || []).filter(t => t.STATE !== stateNumber);
  bot.BOT_STATES.splice(indice, 1);

  const numeroRemovido = parseInt(stateNumber, 10);
  const mapa = new Map();
  bot.BOT_STATES.forEach(s => {
    const n = parseInt(s.STATE_NUMBER, 10);
    if (n > numeroRemovido) mapa.set(s.STATE_NUMBER, String(n - 1));
  });
  remapStateNumbers(bot, mapa);
}

// Renomear só toca ALIAS (+ espelho). Não precisa de remap: nada referencia
// estado pelo nome, só por STATE_NUMBER (bot-engine-spec.md) — o nome novo
// aparece sozinho em todo lugar que já resolve "N - ALIAS"/"[N] ALIAS" a
// partir de estadoPorNumero, porque abrirBotView sempre reconstrói do zero.
export function renomearEstado(bot, stateNumber, novoNome) {
  const estado = (bot.BOT_STATES || []).find(s => s.STATE_NUMBER === stateNumber);
  if (!estado) return;
  estado.ALIAS = novoNome;
  withMirrors('state', estado);
}

// Cria um estado novo do zero (sem transições/condições/ações), sempre no
// final da numeração — mesma lógica de "próxima posição livre" usada em
// duplicarTransicao pra PRIORITY, só que aqui pra STATE_NUMBER. Sem
// remapStateNumbers: STATE_NUMBER novo é sempre maior que todos os
// existentes, não desloca ninguém.
export function adicionarEstado(bot) {
  const novoId = nextId(bot.BOT_STATES);
  const novoNumero = String((bot.BOT_STATES || []).reduce((m, s) => Math.max(m, parseInt(s.STATE_NUMBER, 10) || 0), -1) + 1);
  bot.BOT_STATES = (bot.BOT_STATES || []).concat([withMirrors('state', { ID: novoId, STATE_NUMBER: novoNumero, ALIAS: 'Novo Estado' })]);
  return novoNumero;
}

export function iniciarExclusaoEstado(bot, stateNumber) {
  const estado = (bot.BOT_STATES || []).find(s => s.STATE_NUMBER === stateNumber);
  const painel = $(`#bv-estados .estado-wrap[data-estado-numero="${stateNumber}"] [data-role="estado-delete-panel"]`);
  if (!estado || !painel) return;

  const referencias = referenciasParaEstado(bot, stateNumber);
  if (referencias.length) {
    painel.innerHTML = renderPainelBloqueio(estado, referencias);
  } else {
    const totalTransicoes = (bot.BOT_TRANSITIONS || []).filter(t => t.STATE === stateNumber).length;
    painel.innerHTML = renderPainelConfirmacao(estado, totalTransicoes);
  }
  painel.classList.remove('hidden');
  criarIcones();
}

// Reabre a tela mantendo os estados que já estavam expandidos (senão cada
// duplicação recolheria tudo de novo). `focarNumero`, se passado, só recebe
// scroll pra ficar visível — não é expandido automaticamente, pra não confundir
// (o estado novo fica fechado igual aos outros, o usuário abre se quiser).
export function reabrirPreservandoExpansao(bot, focarNumero) {
  const abertos = new Set();
  getRootNode().querySelectorAll('#bv-estados .estado-wrap').forEach(w => {
    if (!w.querySelector('.estado-body').classList.contains('hidden')) abertos.add(w.dataset.estadoNumero);
  });
  abrirBotView(bot);
  atualizarContadorRodape(bot);
  abertos.forEach(num => {
    const wrap = $(`#bv-estados .estado-wrap[data-estado-numero="${num}"]`);
    if (!wrap) return;
    wrap.querySelector('.estado-body').classList.remove('hidden');
        wrap.classList.add('estado-expandido');
        wrap.querySelector('.estado-chevron').classList.add('rotate-180');
  });
  if (focarNumero !== undefined) {
    $(`#bv-estados .estado-wrap[data-estado-numero="${focarNumero}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

export function transicaoParaEstado(bot, transitionId) {
  const t = (bot.BOT_TRANSITIONS || []).find(t => t.ID === transitionId);
  return t ? t.STATE : undefined;
}

// Re-render "cirúrgico": recria só o <div class="estado-row"> desta
// transição em vez do #bv-estados inteiro. Seguro pras mutações que só
// afetam o conteúdo INTERNO de uma transição (condições/ações) — nada fora
// dela muda (ID de condição/ação nunca é referenciado por fora, só
// TRANSITION_ID). Bots grandes ficam MUITO mais rápidos pra editar porque
// cada clique não recria mais milhares de nós de outras transições/estados
// que nem foram tocados. Se por algum motivo a linha não for encontrada no
// DOM (ex.: estado ainda fechado), cai pro reabrirPreservandoExpansao normal
// como fallback seguro.
export function rerenderTransicao(bot, transitionId) {
  const transicao = (bot.BOT_TRANSITIONS || []).find(t => t.ID === transitionId);
  const linhaAtual = $(`#bv-estados .estado-row[data-transition-id="${transitionId}"]`);
  if (!transicao || !linhaAtual) { reabrirPreservandoExpansao(bot); return; }

  const estadoPorNumero = {};
  (bot.BOT_STATES || []).forEach(e => estadoPorNumero[e.STATE_NUMBER] = e);
  const condicoesPorTransicao = {
    [transitionId]: (bot.BOT_CONDITIONS || []).filter(c => c.TRANSITION_ID === transitionId).sort((a, b) => parseInt(a.ID, 10) - parseInt(b.ID, 10)),
  };
  const acoesPorTransicao = {
    [transitionId]: (bot.BOT_ACTIONS || []).filter(a => a.TRANSITION_ID === transitionId).sort((a, b) => parseInt(a.ID, 10) - parseInt(b.ID, 10)),
  };
  const totalTransicoes = (bot.BOT_TRANSITIONS || []).filter(t => t.STATE === transicao.STATE).length;

  const temp = document.createElement('div');
  temp.innerHTML = renderTransicaoRow(transicao, condicoesPorTransicao, acoesPorTransicao, estadoPorNumero, totalTransicoes).trim();
  const novaLinha = temp.firstElementChild;
  linhaAtual.replaceWith(novaLinha);
  initMenuBuilders(novaLinha);
  initVariaveisBuilders(novaLinha);
  criarIcones();
}

// Mesma ideia, um nível acima: recria só o <div class="estado-wrap"> (o
// estado inteiro, todas as suas transições) em vez do bot inteiro. Seguro
// pras mutações que só mudam PRIORITY/quantidade de transições DENTRO de um
// único estado (duplicar/excluir/mover transição) — ID de transição nunca é
// referenciado por fora do próprio estado. Preserva se o estado estava
// expandido ou não.
export function rerenderEstado(bot, stateNumber) {
  const estado = (bot.BOT_STATES || []).find(s => s.STATE_NUMBER === stateNumber);
  const wrapAtual = $(`#bv-estados .estado-wrap[data-estado-numero="${stateNumber}"]`);
  if (!estado || !wrapAtual) { reabrirPreservandoExpansao(bot); return; }

  const estavaAberto = !wrapAtual.querySelector('.estado-body').classList.contains('hidden');

  const estadoPorNumero = {};
  (bot.BOT_STATES || []).forEach(e => estadoPorNumero[e.STATE_NUMBER] = e);
  const transicoesDoEstado = (bot.BOT_TRANSITIONS || []).filter(t => t.STATE === stateNumber).sort((a, b) => parseInt(a.PRIORITY, 10) - parseInt(b.PRIORITY, 10));
  const transicoesPorEstado = { [stateNumber]: transicoesDoEstado };
  const idsTransicoes = new Set(transicoesDoEstado.map(t => t.ID));
  const condicoesPorTransicao = {};
  (bot.BOT_CONDITIONS || []).filter(c => idsTransicoes.has(c.TRANSITION_ID)).forEach(c => (condicoesPorTransicao[c.TRANSITION_ID] ||= []).push(c));
  Object.values(condicoesPorTransicao).forEach(arr => arr.sort((a, b) => parseInt(a.ID, 10) - parseInt(b.ID, 10)));
  const acoesPorTransicao = {};
  (bot.BOT_ACTIONS || []).filter(a => idsTransicoes.has(a.TRANSITION_ID)).forEach(a => (acoesPorTransicao[a.TRANSITION_ID] ||= []).push(a));
  Object.values(acoesPorTransicao).forEach(arr => arr.sort((a, b) => parseInt(a.ID, 10) - parseInt(b.ID, 10)));
  const totalEstados = (bot.BOT_STATES || []).length;

  const temp = document.createElement('div');
  temp.innerHTML = renderEstado(estado, transicoesPorEstado, condicoesPorTransicao, acoesPorTransicao, estadoPorNumero, totalEstados).trim();
  const novoWrap = temp.firstElementChild;
  wrapAtual.replaceWith(novoWrap);
  if (estavaAberto) {
    novoWrap.querySelector('.estado-body').classList.remove('hidden');
      novoWrap.classList.add('estado-expandido');
      novoWrap.querySelector('.estado-chevron').classList.add('rotate-180');
  }
  initMenuBuilders(novoWrap);
  initVariaveisBuilders(novoWrap);
  atualizarContadorRodape(bot);
  criarIcones();
}

// Vinculados UMA VEZ (fora de abrirBotView), porque #bv-estados nunca é
// recriado — só seu innerHTML é substituído a cada render. Ligar isso dentro
// de abrirBotView acumularia um listener duplicado por render (drag solto
// disparando N vezes, painel de exclusão reagindo N vezes por clique etc.).
export function initEstadoReorderDnD() {
  const container = $('#bv-estados');

  // dragstart/dragend delegados (bubbla, então funciona igual num clique
  // comum) — necessário porque rerenderTransicao/rerenderEstado substituem
  // handles por elementos novos a qualquer momento; um bind direto por
  // render (o jeito antigo) ficaria "surdo" nesses handles recriados.
  container.addEventListener('dragstart', (e) => {
    const estadoHandle = e.target.closest('.estado-drag-handle');
    if (estadoHandle) {
      const wrap = estadoHandle.closest('.estado-wrap');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-mover-estado', '1');
      e.dataTransfer.setData('text/plain', wrap.dataset.estadoNumero);
      requestAnimationFrame(() => wrap.classList.add('estado-dragging'));
      return;
    }
    const transicaoHandle = e.target.closest('.transicao-drag-handle');
    if (transicaoHandle) {
      const row = transicaoHandle.closest('.estado-row');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-mover-transicao', '1');
      e.dataTransfer.setData('text/plain', row.dataset.transitionId);
      requestAnimationFrame(() => row.classList.add('estado-dragging'));
    }
  });

  container.addEventListener('dragend', (e) => {
    if (e.target.closest('.estado-drag-handle')) {
      container.querySelectorAll('.estado-wrap').forEach(w => w.classList.remove('estado-dragging', 'estado-drop-before', 'estado-drop-after'));
    } else if (e.target.closest('.transicao-drag-handle')) {
      container.querySelectorAll('.estado-row').forEach(r => r.classList.remove('estado-dragging', 'estado-drop-before', 'estado-drop-after'));
    }
  });

  container.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('application/x-mover-transicao')) {
      const alvoRow = e.target.closest('.estado-row');
      if (!alvoRow) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      container.querySelectorAll('.estado-drop-before, .estado-drop-after').forEach(el => el.classList.remove('estado-drop-before', 'estado-drop-after'));
      const rect = alvoRow.getBoundingClientRect();
      alvoRow.classList.add((e.clientY - rect.top) < rect.height / 2 ? 'estado-drop-before' : 'estado-drop-after');
      return;
    }
    if (e.dataTransfer.types.includes('application/x-mover-estado')) {
      const alvoWrap = e.target.closest('.estado-wrap');
      if (!alvoWrap) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      container.querySelectorAll('.estado-drop-before, .estado-drop-after').forEach(w => w.classList.remove('estado-drop-before', 'estado-drop-after'));
      const rect = alvoWrap.getBoundingClientRect();
      alvoWrap.classList.add((e.clientY - rect.top) < rect.height / 2 ? 'estado-drop-before' : 'estado-drop-after');
    }
  });

  container.addEventListener('drop', (e) => {
    if (e.dataTransfer.types.includes('application/x-mover-transicao')) {
      const alvoRow = e.target.closest('.estado-row');
      container.querySelectorAll('.estado-drop-before, .estado-drop-after').forEach(el => el.classList.remove('estado-drop-before', 'estado-drop-after'));
      if (!alvoRow || !state.botCarregado) return;
      e.preventDefault();
      const origemId = e.dataTransfer.getData('text/plain');
      const alvoId = alvoRow.dataset.transitionId;
      if (!origemId || origemId === alvoId) return;

      // Guarda contra arrastar entre estados diferentes expandidos ao mesmo
      // tempo: só prossegue se a linha de origem existir dentro do MESMO
      // .estado-body do alvo; senão, no-op.
      const bodyAlvo = alvoRow.closest('.estado-body');
      const rowOrigem = bodyAlvo?.querySelector(`.estado-row[data-transition-id="${origemId}"]`);
      if (!rowOrigem) return;

      const rect = alvoRow.getBoundingClientRect();
      const antes = (e.clientY - rect.top) < rect.height / 2;
      const ordemAtual = [...bodyAlvo.querySelectorAll('.estado-row')].map(r => r.dataset.transitionId);
      let indiceAlvo = ordemAtual.indexOf(alvoId) + (antes ? 0 : 1);
      const indiceOrigem = ordemAtual.indexOf(origemId);
      if (indiceOrigem < indiceAlvo) indiceAlvo -= 1;

      moverTransicao(state.botCarregado, origemId, indiceAlvo);
      reabrirPreservandoExpansao(state.botCarregado);
      return;
    }

    if (e.dataTransfer.types.includes('application/x-mover-estado')) {
      const alvoWrap = e.target.closest('.estado-wrap');
      container.querySelectorAll('.estado-drop-before, .estado-drop-after').forEach(w => w.classList.remove('estado-drop-before', 'estado-drop-after'));
      if (!alvoWrap || !state.botCarregado) return;
      e.preventDefault();
      const origemNumero = e.dataTransfer.getData('text/plain');
      const alvoNumero = alvoWrap.dataset.estadoNumero;
      if (!origemNumero || origemNumero === alvoNumero) return;

      const rect = alvoWrap.getBoundingClientRect();
      const antes = (e.clientY - rect.top) < rect.height / 2;
      const ordemAtual = [...container.querySelectorAll('.estado-wrap')].map(w => w.dataset.estadoNumero);
      let indiceAlvo = ordemAtual.indexOf(alvoNumero) + (antes ? 0 : 1);
      const indiceOrigem = ordemAtual.indexOf(origemNumero);
      if (indiceOrigem < indiceAlvo) indiceAlvo -= 1; // origem sai da lista antes de reentrar, desconta a própria posição

      const novoNumero = moverEstado(state.botCarregado, origemNumero, indiceAlvo);
      reabrirPreservandoExpansao(state.botCarregado, novoNumero);
    }
  });
}

// Delegação pra tudo que ANTES era religado a cada abrirBotView (clique,
// change, keydown). Ligado UMA VEZ, mesmo motivo do initEstadoReorderDnD/
// initEstadoDeleteFlow/initItemDeleteFlow: agora várias mutações fazem um
// re-render "cirúrgico" (rerenderTransicao/rerenderEstado, só a transição ou
// só o estado que mudou) em vez de recriar #bv-estados inteiro a cada
// clique — um bind "fresco" por render ficaria surdo nos elementos que não
// foram recriados (ou duplicaria listener nos poucos casos que ainda usam
// reabrirPreservandoExpansao). Delegação resolve isso de graça: funciona
// pra qualquer elemento presente agora OU inserido depois, sem religar nada.
export function initAcoesDelegadas() {
  const container = $('#bv-estados');
  const acoesComEnterParaBlur = new Set(['mover-transicao', 'mover-estado', 'renomear-estado', 'mudar-estado-acao', 'mudar-campo-acao', 'mudar-condicao-variavel', 'mudar-condicao-operador', 'mudar-tipo-acao', 'mudar-campo-acao-buscavel', 'mudar-campo-acao-ambiente-buscavel']);

  // Campos de busca (qualquer <input list="..."> com datalist — variável de
  // condição, operador, tipo de ação, estado de destino livre, campo
  // buscável) selecionam o texto todo ao ganhar foco. Sem isso, trocar um
  // valor pré-preenchido (ex.: uma ação nova já vem com "Mensagem" no campo
  // de tipo) exigia selecionar manualmente antes de digitar por cima.
  // 'focusin' bubla (diferente de 'focus'), então um listener delegado aqui
  // cobre também campos inseridos depois via rerenderTransicao/rerenderEstado.
  container.addEventListener('focusin', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.hasAttribute('list')) {
      e.target.select();
    }
  });

  container.addEventListener('click', (e) => {
    if (!state.botCarregado) return;
    const header = e.target.closest('.estado-header');
    if (header && !e.target.closest('button, select, input, .estado-drag-handle')) {
      const wrap = header.closest('.estado-wrap');
      wrap.querySelector('.estado-body').classList.toggle('hidden');
      wrap.classList.toggle('estado-expandido');
      header.querySelector('.estado-chevron').classList.toggle('rotate-180');
      return;
    }

    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const bot = state.botCarregado;
    switch (btn.dataset.action) {
      case 'editar-menu':
        abrirModalMenu(btn.dataset.transitionId, btn.dataset.actionId);
        break;
      case 'focar-nome-estado': {
        const campo = btn.closest('.estado-alias-wrap')?.querySelector('.estado-alias');
        if (campo) { campo.focus(); campo.select(); }
        break;
      }
      case 'duplicate-estado': {
        const novoNumero = duplicarEstado(bot, btn.dataset.state);
        reabrirPreservandoExpansao(bot, novoNumero);
        break;
      }
      case 'duplicate-transicao': {
        const stateNumber = transicaoParaEstado(bot, btn.dataset.transitionId);
        duplicarTransicao(bot, btn.dataset.transitionId);
        rerenderEstado(bot, stateNumber);
        break;
      }
      case 'add-transicao':
        adicionarTransicao(bot, btn.dataset.state);
        rerenderEstado(bot, btn.dataset.state);
        break;
      case 'mover-condicao':
        moverCondicao(bot, btn.dataset.transitionId, btn.dataset.conditionId, parseInt(btn.dataset.dir, 10));
        rerenderTransicao(bot, btn.dataset.transitionId);
        break;
      case 'mover-acao':
        moverAcao(bot, btn.dataset.transitionId, btn.dataset.actionId, parseInt(btn.dataset.dir, 10));
        rerenderTransicao(bot, btn.dataset.transitionId);
        break;
      case 'add-condicao':
        adicionarCondicao(bot, btn.dataset.transitionId);
        rerenderTransicao(bot, btn.dataset.transitionId);
        break;
      case 'add-acao':
        adicionarAcao(bot, btn.dataset.transitionId);
        rerenderTransicao(bot, btn.dataset.transitionId);
        break;
      case 'ir-para-estado': {
        const stateNumber = btn.dataset.state;
        if (!stateNumber) break;
        const wrap = $(`#bv-estados .estado-wrap[data-estado-numero="${stateNumber}"]`);
        if (!wrap) break;
        wrap.querySelector('.estado-body').classList.remove('hidden');
        wrap.classList.add('estado-expandido');
        wrap.querySelector('.estado-chevron').classList.add('rotate-180');
        wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
        wrap.classList.add('estado-destaque');
        setTimeout(() => wrap.classList.remove('estado-destaque'), 1200);
        break;
      }
    }
  });

  container.addEventListener('change', (e) => {
    if (!state.botCarregado) return;
    const el = e.target;
    if (!el.dataset.action) return;
    const bot = state.botCarregado;
    switch (el.dataset.action) {
      case 'mudar-condicao-variavel': {
        const chave = resolverPorLabel(VARIABLE_LABELS, el.value);
        if (!chave) { el.value = el.defaultValue; return; }
        mudarCondicaoVariavel(bot, el.dataset.transitionId, el.dataset.conditionId, chave);
        rerenderTransicao(bot, el.dataset.transitionId);
        break;
      }
      case 'mudar-condicao-operador': {
        const datalist = el.list;
        let chave;
        if (datalist) {
          const opt = Array.from(datalist.options).find(o => o.value === el.value);
          if (opt && opt.dataset.value !== undefined) {
            chave = opt.dataset.value;
          }
        }
        if (chave === undefined) {
          const opcoes = buildOperatorOptions(el.dataset.kind, '');
          chave = resolverPorLabelLista(opcoes, el.value);
        }
        if (chave === undefined) { el.value = el.defaultValue; return; }
        mudarCondicaoOperador(bot, el.dataset.transitionId, el.dataset.conditionId, chave);
        rerenderTransicao(bot, el.dataset.transitionId);
        break;
      }
      case 'mudar-condicao-valor':
        mudarCondicaoValor(bot, el.dataset.transitionId, el.dataset.conditionId, el.value);
        break;
      case 'mover-transicao': {
        const alvo = parseInt(el.value, 10);
        if (Number.isNaN(alvo)) { el.value = el.defaultValue; return; }
        const stateNumber = transicaoParaEstado(bot, el.dataset.transitionId);
        moverTransicao(bot, el.dataset.transitionId, alvo);
        rerenderEstado(bot, stateNumber);
        break;
      }
      case 'mover-estado': {
        const alvo = parseInt(el.value, 10);
        if (Number.isNaN(alvo)) { el.value = el.dataset.state; return; }
        const novoNumero = moverEstado(bot, el.dataset.state, alvo);
        reabrirPreservandoExpansao(bot, novoNumero);
        break;
      }
      case 'renomear-estado': {
        const novoNome = el.value.trim();
        if (!novoNome) { el.value = el.defaultValue; return; }
        if (novoNome === el.defaultValue) return;
        renomearEstado(bot, el.dataset.state, novoNome);
        reabrirPreservandoExpansao(bot, el.dataset.state);
        break;
      }
      case 'mudar-tipo-acao': {
        const chave = resolverPorLabel(ACTION_TYPE_LABELS, el.value);
        if (!chave) { el.value = el.defaultValue; return; }
        mudarTipoAcao(bot, el.dataset.transitionId, el.dataset.actionId, chave);
        rerenderTransicao(bot, el.dataset.transitionId);
        break;
      }
      case 'mudar-estado-acao':
        mudarCampoEstadoAcao(bot, el.dataset.transitionId, el.dataset.actionId, el.dataset.campo, el.value);
        rerenderTransicao(bot, el.dataset.transitionId);
        break;
      case 'mudar-campo-acao':
        mudarCampoAcao(bot, el.dataset.transitionId, el.dataset.actionId, el.dataset.campo, el.value);
        rerenderTransicao(bot, el.dataset.transitionId);
        break;
      case 'mudar-campo-acao-buscavel': {
        const dict = DICTS_BUSCAVEIS[el.dataset.dict];
        const chave = dict && resolverPorLabel(dict, el.value);
        if (!chave) { el.value = el.defaultValue; return; }
        mudarCampoAcao(bot, el.dataset.transitionId, el.dataset.actionId, el.dataset.campo, chave);
        rerenderTransicao(bot, el.dataset.transitionId);
        break;
      }
      // Campos do ambiente (agente/bot, fila, script, checkpoint, status
      // CRM/substatus, conta OpenAI etc.) — a <datalist> é montada por
      // campoAmbienteSelect com um data-value por <option> (o valor real
      // esperado por Bot::update(), a label é só o texto exibido/buscado).
      // el.list é a <datalist> associada nativamente via atributo list=.
      case 'mudar-campo-acao-ambiente-buscavel': {
        const datalist = el.list;
        const opt = datalist && Array.from(datalist.options).find(o => o.value === el.value);
        if (!opt) { el.value = el.defaultValue; return; }
        mudarCampoAcao(bot, el.dataset.transitionId, el.dataset.actionId, el.dataset.campo, opt.dataset.value);
        rerenderTransicao(bot, el.dataset.transitionId);
        break;
      }
    }
  });

  container.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA') return; // textarea precisa de Enter pra quebrar linha

    // Autocompletar pesquisa: ao apertar Enter num campo com datalist,
    // procura a opção que contenha o texto digitado (ex.: digitou "estado" ->
    // "Mudar de Estado"). Seleciona a primeira que bater e dispara change.
    if (e.target.tagName === 'INPUT' && e.target.hasAttribute('list') && e.target.list) {
      const digitado = e.target.value.toLowerCase().trim();
      if (digitado) {
        const options = Array.from(e.target.list.options);
        // Prioriza quem começa com o texto; se não, quem apenas contém
        let match = options.find(o => o.value.toLowerCase().startsWith(digitado));
        if (!match) match = options.find(o => o.value.toLowerCase().includes(digitado));

        if (match && match.value !== e.target.value) {
          e.target.value = match.value;
          e.target.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }

    const acao = e.target.dataset.action;
    if (acao && acoesComEnterParaBlur.has(acao)) e.target.blur();
  });
}

// Mesmo motivo do initEstadoReorderDnD: os botões do painel de exclusão são
// injetados via innerHTML direto (não via abrirBotView), então delegação de
// clique é o jeito certo de pegá-los sem precisar religar listener toda vez
// que o painel abre/fecha.
export function initEstadoDeleteFlow() {
  $('#bv-estados').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || !state.botCarregado) return;
    if (btn.dataset.action === 'delete-estado') {
      iniciarExclusaoEstado(state.botCarregado, btn.dataset.state);
    } else if (btn.dataset.action === 'fechar-alerta-estado' || btn.dataset.action === 'cancelar-exclusao-estado') {
      const painel = btn.closest('[data-role="estado-delete-panel"]');
      painel.classList.add('hidden');
      painel.innerHTML = '';
    } else if (btn.dataset.action === 'confirmar-exclusao-estado') {
      excluirEstado(state.botCarregado, btn.dataset.state);
      reabrirPreservandoExpansao(state.botCarregado);
    }
  });
}

// Mesmo motivo do initEstadoDeleteFlow: os botões do painel de confirmação
// de cada condição/ação são injetados via innerHTML direto (não recriados
// por abrirBotView), então delegação de clique no container é o jeito certo
// de pegá-los.
export function initItemDeleteFlow() {
  $('#bv-estados').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || !state.botCarregado) return;
    if (btn.dataset.action === 'delete-condicao') {
      const painel = btn.closest('.condicao-item').querySelector('[data-role="item-delete-panel"]');
      painel.innerHTML = renderPainelConfirmacaoItem('condição', 'confirmar-exclusao-condicao',
        `data-transition-id="${escapeHtml(btn.dataset.transitionId)}" data-condition-id="${escapeHtml(btn.dataset.conditionId)}"`);
      painel.classList.remove('hidden');
      criarIcones();
    } else if (btn.dataset.action === 'delete-acao') {
      const painel = btn.closest('.acao-item').querySelector('[data-role="item-delete-panel"]');
      painel.innerHTML = renderPainelConfirmacaoItem('ação', 'confirmar-exclusao-acao',
        `data-transition-id="${escapeHtml(btn.dataset.transitionId)}" data-action-id="${escapeHtml(btn.dataset.actionId)}"`);
      painel.classList.remove('hidden');
      criarIcones();
    } else if (btn.dataset.action === 'delete-transicao') {
      // :scope > pra não pegar o painel de uma condição/ação aninhada dentro
      // da mesma .estado-row (o painel da própria transição é filho direto).
      const painel = btn.closest('.estado-row').querySelector(':scope > [data-role="item-delete-panel"]');
      painel.innerHTML = renderPainelConfirmacaoItem('transição inteira (com todas as condições e ações)', 'confirmar-exclusao-transicao',
        `data-transition-id="${escapeHtml(btn.dataset.transitionId)}"`);
      painel.classList.remove('hidden');
      criarIcones();
    } else if (btn.dataset.action === 'cancelar-exclusao-item') {
      const painel = btn.closest('[data-role="item-delete-panel"]');
      painel.classList.add('hidden');
      painel.innerHTML = '';
    } else if (btn.dataset.action === 'confirmar-exclusao-condicao') {
      excluirCondicao(state.botCarregado, btn.dataset.transitionId, btn.dataset.conditionId);
      rerenderTransicao(state.botCarregado, btn.dataset.transitionId);
    } else if (btn.dataset.action === 'confirmar-exclusao-acao') {
      excluirAcao(state.botCarregado, btn.dataset.transitionId, btn.dataset.actionId);
      rerenderTransicao(state.botCarregado, btn.dataset.transitionId);
    } else if (btn.dataset.action === 'confirmar-exclusao-transicao') {
      const stateNumber = transicaoParaEstado(state.botCarregado, btn.dataset.transitionId);
      excluirTransicao(state.botCarregado, btn.dataset.transitionId);
      rerenderEstado(state.botCarregado, stateNumber);
    }
  });
}

// Vinculado UMA VEZ (fora de abrirBotView), pelo mesmo motivo do
// initEstadoReorderDnD/initEstadoDeleteFlow: #bv-numero é markup estático do
// modal (não é recriado a cada render, só seu .value é atualizado em
// abrirBotView) — ligar aqui dentro acumularia um listener duplicado por
// abertura do modal. bot.ID/bot['0'] são um par espelhado isolado no objeto
// raiz do bot (não têm TABLE_KEY_ORDER — não são linha de tabela), e nada
// mais no arquivo lê ou depende deles além do card de resumo, então uma
// atualização local + refresh do resumo bastam (sem reabrirPreservandoExpansao).
export function initBotNumeroEdit() {
  const input = $('#bv-numero');
  const commit = () => {
    if (!state.botCarregado) return;
    const novoValor = input.value.trim();
    if (!novoValor) { input.value = state.botCarregado.ID ?? ''; return; }
    if (novoValor === String(state.botCarregado.ID ?? '')) return;
    state.botCarregado.ID = novoValor;
    state.botCarregado['0'] = novoValor;
    input.value = novoValor;
    mostrarResumoBot();
  };
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
}

// Campos soltos no objeto raiz do bot (fora de qualquer tabela) também têm
// espelho numérico, na mesma ordem em que aparecem no JSON exportado
// (conferido contra um bot real): "0"=ID (já tratado à parte em
// initBotNumeroEdit), "1"=NAME, "2"=CONF_DELIVERY_TIME,
// "3"=CONF_DELIVERY_QUEUE, "4"=TIME_ANSWER, "5"=TIMEOUT_DELAY,
// "6"=TIMEOUT_ACTION, "7"=TIMEOUT_DESTINY, "8"=TIMEOUT_MESSAGE. STATUS não
// tem par numérico conhecido (nem sempre vem no JSON), fica de fora do mapa.
export const BOT_FIELD_MIRROR_INDEX = { NAME: '1', CONF_DELIVERY_TIME: '2', CONF_DELIVERY_QUEUE: '3', TIME_ANSWER: '4', TIMEOUT_DELAY: '5', TIMEOUT_ACTION: '6', TIMEOUT_DESTINY: '7', TIMEOUT_MESSAGE: '8' };
export function mudarCampoBot(bot, campo, valor) {
  bot[campo] = valor;
  const idx = BOT_FIELD_MIRROR_INDEX[campo];
  if (idx !== undefined) bot[idx] = valor;
}

// INTEGRATIONS pode vir como string JSON ou como objeto já parseado — grava
// de volta no mesmo formato em que veio, pra não mudar o "shape" do campo.
export function mudarContaTranscricao(bot, valor) {
  const eraString = typeof bot.INTEGRATIONS === 'string';
  const obj = eraString ? (() => { try { return JSON.parse(bot.INTEGRATIONS); } catch { return {}; } })() : (bot.INTEGRATIONS || {});
  obj.audio_transcription_account = valor;
  bot.INTEGRATIONS = eraString ? JSON.stringify(obj) : obj;
}

// Campos do cabeçalho do bot (fora de #bv-estados) são markup estático do
// modal — nunca recriados, então ligado UMA VEZ, mesmo motivo de
// initBotNumeroEdit/initEstadoReorderDnD.
export function initBotHeaderEdit() {
  const camposSimples = [
    ['bv-nome', 'NAME'],
    ['bv-tempo-resposta', 'TIME_ANSWER'],
    ['bv-tempo-entrega', 'CONF_DELIVERY_TIME'],
    ['bv-msg-encerrar', 'TIMEOUT_MESSAGE'],
  ];
  camposSimples.forEach(([id, campo]) => {
    const el = $('#' + id);
    el.addEventListener('change', () => {
      if (!state.botCarregado) return;
      mudarCampoBot(state.botCarregado, campo, el.value);
      mostrarResumoBot();
    });
    if (el.tagName !== 'TEXTAREA') el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur(); });
  });

  $('#bv-transcricao-wrap')?.addEventListener('change', (e) => {
    if (!state.botCarregado) return;
    if (e.target && e.target.id === 'bv-transcricao') {
      mudarContaTranscricao(state.botCarregado, e.target.value);
    }
  });
  $('#bv-transcricao-wrap')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target && e.target.id === 'bv-transcricao') {
      e.target.blur();
    }
  });

  $('#bv-status').addEventListener('change', () => {
    if (state.botCarregado) state.botCarregado.STATUS = $('#bv-status').value;
  });

  $('#bv-acao-timeout').addEventListener('change', () => {
    if (!state.botCarregado) return;
    mudarCampoBot(state.botCarregado, 'TIMEOUT_ACTION', $('#bv-acao-timeout').value);
    const estadoPorNumero = {};
    (state.botCarregado.BOT_STATES || []).forEach(e => estadoPorNumero[e.STATE_NUMBER] = e);
    atualizarSecaoDestino(state.botCarregado, estadoPorNumero);
    criarIcones();
  });

  // #bv-destino-valor tem o conteúdo trocado por atualizarSecaoDestino toda
  // vez que TIMEOUT_ACTION muda — delegação evita ter que religar listener
  // toda vez que esse innerHTML é substituído.
  $('#bv-destino-valor').addEventListener('change', (e) => {
    const campo = e.target.dataset.campoBot;
    if (state.botCarregado && campo) mudarCampoBot(state.botCarregado, campo, e.target.value);
  });

  $('#btn-adicionar-estado').addEventListener('click', () => {
    if (!state.botCarregado) return;
    const novoNumero = adicionarEstado(state.botCarregado);
    reabrirPreservandoExpansao(state.botCarregado, novoNumero);
    atualizarContadorRodape(state.botCarregado);
  });
}

// ---------------------------------------------------------------------------
// Pendências: varredura de campos que só existem no ambiente de destino
// (fila, agente, script, conta OpenAI etc.) e que esta ferramenta não tem
// como preencher sozinha. Mostrado como checklist depois do download do
// JSON editado, pra lembrar o usuário de revisar antes de subir pro Orpen.
// ---------------------------------------------------------------------------
export function campoVazio(v) {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

export function listarPendencias(bot) {
  const estadoPorNumero = {};
  (bot.BOT_STATES || []).forEach(s => estadoPorNumero[s.STATE_NUMBER] = s);
  const transicaoPorId = {};
  (bot.BOT_TRANSITIONS || []).forEach(t => transicaoPorId[t.ID] = t);

  const posicaoNaTransicao = (lista, transitionId, itemId) => {
    const daTransicao = lista.filter(x => x.TRANSITION_ID === transitionId).sort((a, b) => parseInt(a.ID, 10) - parseInt(b.ID, 10));
    return daTransicao.findIndex(x => x.ID === itemId) + 1;
  };

  const pendencias = [];
  const addPendencia = (transitionId, tipoItem, itemId, posicao, tipoLabel, campoLabel) => {
    const transicao = transicaoPorId[transitionId];
    const estado = transicao ? estadoPorNumero[transicao.STATE] : undefined;
    pendencias.push({
      estadoNumero: estado ? estado.STATE_NUMBER : '?',
      estadoAlias: estado ? estado.ALIAS : '(desconhecido)',
      transicaoPrioridade: transicao ? transicao.PRIORITY : '?',
      tipoItem, posicao, tipoLabel, campoLabel,
    });
  };

  (bot.BOT_ACTIONS || []).forEach(a => {
    const campos = CAMPOS_PENDENCIA_POR_TIPO[a.ACTION_TYPE];
    if (!campos) return;
    if (a.ACTION_TYPE === '16' && a.ACTION_DATA?.update_contact_value !== 'add-labels') return;
    const d = a.ACTION_DATA || {};
    campos.forEach(([campo, rotulo]) => {
      if (campoVazio(d[campo])) {
        const posicao = posicaoNaTransicao(bot.BOT_ACTIONS || [], a.TRANSITION_ID, a.ID);
        addPendencia(a.TRANSITION_ID, 'Ação', a.ID, posicao, ACTION_TYPE_LABELS[a.ACTION_TYPE] || `Tipo ${a.ACTION_TYPE}`, rotulo);
      }
    });
  });

  (bot.BOT_CONDITIONS || []).forEach(c => {
    const cd = c.CONDITION_DATA || {};
    if (cd.assistant_id !== undefined && campoVazio(cd.assistant_id)) {
      const posicao = posicaoNaTransicao(bot.BOT_CONDITIONS || [], c.TRANSITION_ID, c.ID);
      addPendencia(c.TRANSITION_ID, 'Condição', c.ID, posicao, 'Assistente OpenAI', 'Assistente (ID)');
    }
  });

  return pendencias;
}

export function renderPendencia(p) {
  return `
    <label class="pendencia-item flex items-start gap-2">
      <input type="checkbox">
      <span class="text-sm">Estado <strong>[${escapeHtml(p.estadoNumero)}] ${escapeHtml(p.estadoAlias)}</strong> → Transição nº <strong>${escapeHtml(p.transicaoPrioridade)}</strong> → ${escapeHtml(p.tipoItem)} nº <strong>${p.posicao}</strong> (${escapeHtml(p.tipoLabel)}): configurar <strong>${escapeHtml(p.campoLabel)}</strong></span>
    </label>`;
}

export function abrirPendenciasModal(pendencias) {
  $('#pendencias-lista').innerHTML = pendencias.map(renderPendencia).join('');
  $('#pendencias-overlay').classList.remove('hidden');
  criarIcones();
}
export function fecharPendenciasModal() { $('#pendencias-overlay').classList.add('hidden'); }

// Ligado UMA VEZ, mesmo motivo dos outros init* deste módulo: o modal de
// pendências é markup estático, não recriado por render nenhum.
export function initPendenciasWiring() {
  $('#btn-pendencias-fechar').addEventListener('click', fecharPendenciasModal);
  $('#btn-fechar-pendencias').addEventListener('click', fecharPendenciasModal);
  $('#pendencias-overlay').addEventListener('click', (e) => { if (e.target.id === 'pendencias-overlay') fecharPendenciasModal(); });
}

// Ponto único de inicialização da tela do bot: popula as três datalists
// fixas (não mudam por bot carregado — diferente de #bv-estados-datalist,
// que é recriada a cada abrirBotView), liga todos os delegados/DnD/edição de
// cabeçalho (uma vez só, mesmo motivo de cada init* individual) e o wiring
// de abrir/fechar o overlay `#bot-view-overlay`.
export function initBotViewWiring() {
  // #variaveis-datalist é repopulada a cada abrirBotView (mescla VARIABLE_LABELS
  // fixo com state.ambienteOrpen.variables, que só fica disponível depois do
  // bootstrap.js injetar os dados do ambiente) — aqui só as fixas, que não
  // dependem de bot carregado nem de ambiente.
  $('#acao-tipo-datalist').innerHTML = entriesToOptions(ACTION_TYPE_LABELS).map(o => `<option value="${escapeHtml(o.label)}">`).join('');
  $('#update-contact-datalist').innerHTML = entriesToOptions(UPDATE_CONTACT_LABELS).map(o => `<option value="${escapeHtml(o.label)}">`).join('');

  initAcoesDelegadas();
  initEstadoReorderDnD();
  initEstadoDeleteFlow();
  initItemDeleteFlow();
  initBotNumeroEdit();
  initBotHeaderEdit();
  initPendenciasWiring();

  // Opcional: só existe no fluxo standalone (bot_transform.html completo,
  // seção #bot-summary). No modo extensão só o esqueleto de #bot-view-overlay
  // + #pendencias-overlay é injetado (ver orpen-bridge.js) — sem isso, essa
  // linha sozinha lançaria e abortaria o resto de initBotViewWiring().
  $('#btn-ver-bot')?.addEventListener('click', () => { if (state.botCarregado) abrirBotView(state.botCarregado); });
  $('#btn-fechar-bot-view').addEventListener('click', fecharBotView);
  $('#btn-fechar-bot-view-2').addEventListener('click', fecharBotView);
  $('#bot-view-overlay').addEventListener('click', (e) => { if (e.target.id === 'bot-view-overlay') fecharBotView(); });
}
