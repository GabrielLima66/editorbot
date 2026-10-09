// ---------------------------------------------------------------------------
// Análise estática do bot ("Analisar bot"): percorre o grafo inteiro e aponta
// pontos soltos, sem executar nada. Módulo puro (sem DOM): a tela fica em
// analise.js. As regras do motor vêm do simulador.js e do bot-engine-spec.md
// (Bot.class.php):
//
//  - Estado só muda por ação 2 (destiny) ou por 18/20/22 (callback_state e
//    fallback_state); 4, 5 e 6 transferem/encerram; 18, 20 e 22 pausam o bot.
//  - Por conversa, a PRIMEIRA transição do estado (PRIORITY asc) cujas
//    condições passam dispara (AND). Transição sem condições sempre dispara.
//    Nada casou: nada acontece (não há fallback; só o timeout do bot resgata).
//  - "Esperar o cliente" é efeito de condição em `message`: sem mensagem nova
//    ela é falsa. Transição sem condição de mensagem que não pausa, não encerra
//    e fica no mesmo estado dispara a cada rodada (~1 s), sem fim.
//  - O cliente envia o ID da opção do menu (reply.id / rows[].id), nunca o
//    título. O motor compara com == frouxo (IGUAL A) ou contém (CONTÉM), depois
//    de escapar &, <, > e ". "Diferente de" e "Não contém" nunca são verdadeiros.
//
// Cada achado: { regra, severidade: erro|aviso|info, confianca: certa|possivel,
// estadoNumero, estadoAlias, transicaoId, acaoId, titulo, detalhe, sugestao }.
// `info` é tudo que depende de algo que a análise não enxerga (contexto
// externo, destino {$variável}): nunca vira erro por palpite.
// ---------------------------------------------------------------------------

import { phpIgual, maiusculaAscii, escaparHtml } from './simulador.js';
import { parseMenuModel, extrairItensMenu, WHATSAPP_LIST_MAX_ROWS, WHATSAPP_BUTTON_MAX } from './menu-builder.js';
import { CAMPOS_ESTADO_POR_TIPO, VARIABLE_KIND, ACTION_TYPE_LABELS } from './dictionaries.js';
import { tipoDaCondicao } from './orpen-adapter.js';

export const REGRAS = {
  E00: 'Bot sem estado inicial',
  E01: 'Destino inexistente',
  E02: 'Estado sem transições',
  E03: 'Conversa sem saída',
  E04: 'Estado inalcançável',
  E05: 'Destino dinâmico',
  L01: 'Repete sem esperar o cliente',
  L02: 'Ciclo sem esperar o cliente',
  M01: 'Opção de menu sem tratamento',
  M02: 'Condição diferente do ID do menu',
  M03: 'Opção engolida por outra transição',
  M04: 'Menu com problema nas opções',
  T01: 'Condição que nunca casa',
  T02: 'Transição que nunca executa',
  T03: 'Prioridade repetida',
};

const SEVERIDADES = ['erro', 'aviso', 'info'];
const ENVIA = new Set(['1', '10', '11', '17', '20']);
const TERMINAIS = new Set(['4', '5', '6']);
const PAUSAS = new Set(['18', '20', '22']);
const DINAMICO = /\{\$/;
const LITERAL = /^\d+$/;
const LIMITE_ID = { whatsapp_button: 256, whatsapp_list: 200 };

const str = (v) => String(v ?? '').trim();
const inteiro = (v) => parseInt(v, 10) || 0;
const porId = (a, b) => inteiro(a.ID) - inteiro(b.ID);
const porPrioridade = (a, b) => inteiro(a.PRIORITY) - inteiro(b.PRIORITY) || porId(a, b);
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// ------------------------------------------------------------------ índices

function indexar(bot) {
  const estados = new Map();
  (bot.BOT_STATES || []).forEach((s) => estados.set(str(s.STATE_NUMBER), s));

  // Mesma regra do salvar e do simulador: condição ou ação de tipo 0 não é gravada.
  const condicoes = new Map();
  (bot.BOT_CONDITIONS || []).filter((c) => Number(tipoDaCondicao(c)) !== 0).sort(porId).forEach((c) => {
    if (!condicoes.has(c.TRANSITION_ID)) condicoes.set(c.TRANSITION_ID, []);
    condicoes.get(c.TRANSITION_ID).push(c);
  });
  const acoes = new Map();
  (bot.BOT_ACTIONS || []).filter((a) => inteiro(a.ACTION_TYPE) !== 0).sort(porId).forEach((a) => {
    if (!acoes.has(a.TRANSITION_ID)) acoes.set(a.TRANSITION_ID, []);
    acoes.get(a.TRANSITION_ID).push(a);
  });

  const transicoes = new Map(); // estado -> [info] por prioridade
  [...(bot.BOT_TRANSITIONS || [])].sort(porPrioridade).forEach((t) => {
    const info = descrever(t, condicoes.get(t.ID) || [], acoes.get(t.ID) || []);
    const estado = str(t.STATE);
    if (!transicoes.has(estado)) transicoes.set(estado, []);
    transicoes.get(estado).push(info);
  });
  return { estados, transicoes };
}

function descrever(t, conds, acoes) {
  const msg = conds.filter((c) => c.CONDITION_DATA?.variable === 'message');
  const tipos = new Set(acoes.map((a) => String(a.ACTION_TYPE)));
  const trocas = acoes.filter((a) => String(a.ACTION_TYPE) === '2');
  const ultimaTroca = trocas[trocas.length - 1];
  return {
    t,
    estado: str(t.STATE),
    conds,
    msg,
    outras: conds.filter((c) => !msg.includes(c)),
    acoes,
    terminal: [...tipos].some((x) => TERMINAIS.has(x)),
    pausa: [...tipos].some((x) => PAUSAS.has(x)),
    envia: [...tipos].some((x) => ENVIA.has(x)),
    // Para onde a conversa vai depois das ações: a última "Troca Estado" vale (executam em ordem de ID).
    destino: ultimaTroca ? str(ultimaTroca.ACTION_DATA?.destiny) : null,
    trocaFinal: ultimaTroca || null,
    // Dispara com o lote de mensagens vazio (rodadas seguidas sem o cliente falar).
    autodisparavel: msg.length === 0,
    // Casa qualquer mensagem: sem condição de mensagem, ou só CONTÉM vazio.
    generica: msg.every((c) => String(tipoDaCondicao(c)) === '2' && (c.CONDITION_DATA?.value ?? '') === ''),
  };
}

// ------------------------------------------------------------------ achados

function criarRelator(idx) {
  const achados = [];
  const vistos = new Set();
  const rotulo = (n) => (n === null || n === undefined ? '' : String(n));
  return {
    achados,
    add(a) {
      const estadoNumero = a.estadoNumero === undefined ? null : a.estadoNumero;
      const achado = {
        confianca: 'certa', transicaoId: null, acaoId: null, sugestao: '', detalhe: '', ...a,
        estadoNumero,
        estadoAlias: estadoNumero === null ? '' : str(idx.estados.get(rotulo(estadoNumero))?.ALIAS),
      };
      achado.chave = [achado.regra, rotulo(estadoNumero), achado.transicaoId, achado.acaoId, achado.titulo].join('|');
      if (vistos.has(achado.chave)) return;
      vistos.add(achado.chave);
      achados.push(achado);
    },
  };
}

const nomeDoEstado = (idx, n) => {
  const alias = str(idx.estados.get(String(n))?.ALIAS);
  return alias ? `${n} (${alias})` : `${n}`;
};

// ------------------------------------------------------------------ grafo

/** Arestas "estado -> estado" vindas das ações (destiny, callback_state, fallback_state). */
function arestas(bot, idx, rel) {
  const lista = [];
  const dinamicos = new Set(); // estados com destino {$variável} ou script (ação 7)
  idx.transicoes.forEach((infos, estado) => infos.forEach((info) => {
    // Um script (ação 7) pode mover a conversa (UPDATE bot_state direto, padrão Guarida): destino que a análise não vê.
    if (info.acoes.some((a) => String(a.ACTION_TYPE) === '7')) dinamicos.add(estado);
    info.acoes.forEach((a) => {
      (CAMPOS_ESTADO_POR_TIPO[String(a.ACTION_TYPE)] || []).forEach((campo) => {
        // O motor lê só callback_state na ação 18 (Bot.class.php:1642; callGPT.php:165-166): fallback_state é ignorado.
        if (String(a.ACTION_TYPE) === '18' && campo === 'fallback_state') return;
        const valor = str(a.ACTION_DATA?.[campo]);
        const base = { regra: '', estadoNumero: estado, transicaoId: info.t.ID, acaoId: a.ID };
        if (DINAMICO.test(valor)) {
          dinamicos.add(estado);
          rel.add({ ...base, regra: 'E05', severidade: 'info', confianca: 'possivel',
            titulo: `Destino dinâmico em "${ACTION_TYPE_LABELS[a.ACTION_TYPE] || a.ACTION_TYPE}"`,
            detalhe: `O destino é "${valor}", resolvido só na execução. A análise não segue esse caminho e não pode afirmar o que acontece depois.` });
          return;
        }
        if (valor === '') {
          if (String(a.ACTION_TYPE) === '2') {
            rel.add({ ...base, regra: 'E01', severidade: 'erro', titulo: '"Troca Estado" sem estado de destino',
              detalhe: 'A ação não tem destino: a conversa passa a um estado vazio e o bot fica parado.', sugestao: 'Escolha o estado de destino.' });
          }
          return;
        }
        if (!idx.estados.has(valor)) {
          rel.add({ ...base, regra: 'E01', severidade: 'erro', titulo: `Destino inexistente: estado "${valor}"`,
            detalhe: `A ação "${ACTION_TYPE_LABELS[a.ACTION_TYPE] || a.ACTION_TYPE}" (${campo}) aponta para o estado "${valor}", que não existe neste bot. A conversa fica parada nele.`,
            sugestao: 'Aponte para um estado existente ou crie o estado.' });
          return;
        }
        lista.push({
          de: estado, para: valor, transicaoId: info.t.ID, acaoId: a.ID, campo,
          // Aresta que dispara sem o cliente falar: só a "Troca Estado" efetiva (a última) de uma transição autodisparável.
          auto: campo === 'destiny' && info.autodisparavel && !info.terminal && !info.pausa && info.trocaFinal === a,
        });
      });
    });
  }));
  return { lista, dinamicos };
}

function componentes(nos, adj) {
  // Tarjan.
  let contador = 0;
  const indice = new Map();
  const baixo = new Map();
  const pilha = [];
  const naPilha = new Set();
  const comps = [];
  const visitar = (v) => {
    indice.set(v, contador); baixo.set(v, contador); contador += 1;
    pilha.push(v); naPilha.add(v);
    (adj.get(v) || []).forEach((w) => {
      if (!indice.has(w)) { visitar(w); baixo.set(v, Math.min(baixo.get(v), baixo.get(w))); }
      else if (naPilha.has(w)) baixo.set(v, Math.min(baixo.get(v), indice.get(w)));
    });
    if (baixo.get(v) === indice.get(v)) {
      const comp = [];
      let w;
      do { w = pilha.pop(); naPilha.delete(w); comp.push(w); } while (w !== v);
      comps.push(comp);
    }
  };
  nos.forEach((v) => { if (!indice.has(v)) visitar(v); });
  return comps;
}

const adjacencia = (lista) => {
  const adj = new Map();
  lista.forEach((e) => { if (!adj.has(e.de)) adj.set(e.de, new Set()); adj.get(e.de).add(e.para); });
  return adj;
};

function alcancaveis(raizes, adj) {
  const vistos = new Set(raizes);
  const fila = [...raizes];
  while (fila.length) {
    const v = fila.shift();
    (adj.get(v) || []).forEach((w) => { if (!vistos.has(w)) { vistos.add(w); fila.push(w); } });
  }
  return vistos;
}

function analisarEstrutura(bot, idx, rel) {
  const { lista, dinamicos } = arestas(bot, idx, rel);
  const todos = [...idx.estados.keys()].sort((a, b) => inteiro(a) - inteiro(b));
  const timeoutAcao = str(bot.TIMEOUT_ACTION);
  const timeoutDestino = str(bot.TIMEOUT_DESTINY);
  const timeoutParaEstado = timeoutAcao === 'bot' && timeoutDestino !== '';

  if (timeoutParaEstado && !DINAMICO.test(timeoutDestino) && !idx.estados.has(timeoutDestino)) {
    rel.add({ regra: 'E01', severidade: 'erro', estadoNumero: null, titulo: `Destino do timeout inexistente: estado "${timeoutDestino}"`,
      detalhe: 'O timeout do bot manda a conversa para um estado que não existe neste bot.', sugestao: 'Ajuste o destino do timeout nas configurações do bot.' });
  }

  // Raízes: estado 0 (onde toda conversa nova começa) e o destino do timeout.
  const raizes = [];
  if (idx.estados.has('0')) raizes.push('0');
  else if (todos.length) {
    rel.add({ regra: 'E00', severidade: 'aviso', estadoNumero: null, confianca: 'possivel', titulo: 'O bot não tem o estado 0',
      detalhe: 'Toda conversa nova começa no estado 0 e este bot não tem esse estado. Sem ele, nenhum estado é alcançado a partir da entrada.',
      sugestao: 'Crie o estado 0 ou confirme se a entrada usa outro estado inicial.' });
  }
  if (timeoutParaEstado && idx.estados.has(timeoutDestino)) raizes.push(timeoutDestino);

  const adj = adjacencia(lista);
  const alcancados = alcancaveis(raizes, adj);

  // E04: estado que ninguém alcança. Se nada além das raízes é alcançado, a entrada pode não ser o estado 0
  // (valor inicial vem do banco, não confirmado): não dá para afirmar nada sobre os demais.
  const nadaAlemDasRaizes = alcancados.size <= raizes.length && todos.length > raizes.length;
  if (raizes.length && !nadaAlemDasRaizes) {
    todos.filter((n) => !alcancados.has(n)).forEach((n) => {
      rel.add({ regra: 'E04', severidade: 'info', confianca: 'possivel', estadoNumero: n, titulo: `Estado ${nomeDoEstado(idx, n)} não é alcançado`,
        detalhe: 'Nenhum "Troca Estado", retorno de IA/áudio/automação ou timeout deste bot leva a este estado (um script pode mover a conversa sem aparecer aqui). Ele só roda se a entrada, o failover ou a inatividade (configurados fora do bot) apontarem para ele.',
        sugestao: dinamicos.size ? 'Há destinos dinâmicos ({$variável}) ou scripts no bot: algum deles pode chegar aqui.' : 'Se não é usado, pode ser apagado.' });
    });
  }

  // E02: estado alcançado sem nenhuma transição.
  const semTransicao = new Set();
  todos.forEach((n) => {
    if (!(idx.transicoes.get(n) || []).length) {
      semTransicao.add(n);
      if (alcancados.has(n) || !raizes.length) {
        rel.add({ regra: 'E02', severidade: 'aviso', confianca: n === '0' ? 'possivel' : 'certa', estadoNumero: n, titulo: `Estado ${nomeDoEstado(idx, n)} não tem transições`,
          detalhe: 'A conversa que chega aqui fica parada para sempre: não há nada para o bot executar.', sugestao: 'Adicione uma transição (mensagem, transferência ou encerramento).' });
      }
    }
  });

  // E03: trecho de onde a conversa nunca sai do bot (nenhuma transferência/encerramento alcançável).
  const comTerminal = new Set(todos.filter((n) => (idx.transicoes.get(n) || []).some((i) => i.terminal)));
  const adjTimeout = adjacencia(lista);
  if (timeoutParaEstado && idx.estados.has(timeoutDestino)) {
    todos.forEach((n) => { if (!adjTimeout.has(n)) adjTimeout.set(n, new Set()); adjTimeout.get(n).add(timeoutDestino); });
  }
  const resgatadoPorTimeout = timeoutAcao === 'queue' || timeoutAcao === 'close';
  const considerados = todos.filter((n) => alcancados.has(n) && !semTransicao.has(n));
  const comps = componentes(considerados, adjTimeout);
  const compDe = new Map();
  comps.forEach((c, i) => c.forEach((n) => compDe.set(n, i)));
  comps.forEach((comp, i) => {
    const sai = comp.some((n) => [...(adjTimeout.get(n) || [])].some((w) => compDe.get(w) !== i));
    if (sai) return;
    if (comp.some((n) => comTerminal.has(n) || dinamicos.has(n))) return;
    const ordenado = [...comp].sort((a, b) => inteiro(a) - inteiro(b));
    rel.add({ regra: 'E03', severidade: resgatadoPorTimeout ? 'info' : 'aviso', confianca: 'possivel', estadoNumero: ordenado[0],
      titulo: ordenado.length > 1 ? `Os estados ${ordenado.join(', ')} não têm saída` : `O estado ${nomeDoEstado(idx, ordenado[0])} não tem saída`,
      detalhe: `Nenhuma transferência, encerramento ou saída para outro estado é alcançável a partir ${ordenado.length > 1 ? 'deste trecho' : 'deste estado'}. A conversa só termina por timeout, inatividade ou quando o cliente para de responder.${resgatadoPorTimeout ? ' O timeout do bot cobre este caso.' : ''}`,
      sugestao: 'Se o fluxo deveria acabar aqui, termine com transferência ou "Finalizar".' });
  });

  return { lista, dinamicos };
}

// ------------------------------------------------------------------ loops

function analisarLoops(bot, idx, rel, lista) {
  idx.transicoes.forEach((infos, estado) => {
    infos.forEach((info, pos) => {
      if (!info.autodisparavel || info.terminal || info.pausa) return;
      const fica = info.destino === null || info.destino === estado;
      if (!fica) return;
      if (info.destino !== null && DINAMICO.test(info.destino)) return;

      // Nada antes dela pode ter disparado primeiro, num lote vazio, se tudo que vem antes depende de mensagem.
      const preempcao = infos.slice(0, pos).some((x) => x.autodisparavel);
      const base = { regra: 'L01', estadoNumero: estado, transicaoId: info.t.ID };
      const nomeEnvio = info.envia ? ' e envia mensagem' : '';
      const detalheBase = `Esta transição não depende de mensagem do cliente e não troca de estado: o motor a repete a cada rodada (cerca de 1 segundo)${nomeEnvio}.${info.envia ? ' O reenvio renova o relógio do timeout, que por isso nunca dispara.' : ''}`;
      if (!info.acoes.length) {
        rel.add({ ...base, severidade: 'info', confianca: 'possivel', titulo: 'Transição sem ações dispara sem parar',
          detalhe: 'Esta transição não tem condição de mensagem nem ações: o motor a roda a cada segundo sem fazer nada. Provavelmente é uma transição inacabada.', sugestao: 'Complete a transição ou exclua.' });
        return;
      }
      // Script (ação 7) pode trocar o estado por conta própria: a repetição não é certa.
      const comScript = info.acoes.some((a) => String(a.ACTION_TYPE) === '7');
      const certa = info.envia && !preempcao && !comScript;

      if (info.outras.length === 0) {
        rel.add({ ...base, severidade: certa ? 'erro' : 'aviso', confianca: certa ? 'certa' : 'possivel',
          titulo: info.envia ? 'Repete a mensagem sem esperar o cliente' : 'Repete sem esperar o cliente',
          detalhe: `${detalheBase}${preempcao ? ' Uma transição de prioridade melhor também pode disparar antes.' : ''}${comScript ? ' O script desta transição pode trocar o estado, o que a análise não vê.' : ''}`,
          sugestao: 'Adicione uma condição em "Mensagem", troque de estado ou encerre/transfira o atendimento.' });
        return;
      }
      const variaveis = info.outras.map((c) => c.CONDITION_DATA?.variable);
      const tiposAcao = new Set(info.acoes.map((a) => String(a.ACTION_TYPE)));
      const soErros = variaveis.every((v) => v === 'error_count');
      const soGuardadas = variaveis.every((v) => v && !(v in VARIABLE_KIND) && !EXTERNAS.has(v));
      const contaErro = info.acoes.some((a) => String(a.ACTION_TYPE) === '8' && a.ACTION_DATA?.error_count === 'add');
      if (soErros && contaErro) {
        rel.add({ ...base, severidade: 'info', confianca: 'possivel', titulo: 'Repete até o limite do contador de erros',
          detalhe: 'A transição soma ao contador de erros e depende dele: deve parar sozinha ao chegar ao limite.' });
        return;
      }
      if (soGuardadas && (tiposAcao.has('13') || tiposAcao.has('7'))) {
        rel.add({ ...base, severidade: 'info', confianca: 'possivel', titulo: 'Repete enquanto uma variável não mudar',
          detalhe: 'A transição depende de variável guardada e altera variáveis: pode parar quando o valor mudar, mas isso não é garantido.' });
        return;
      }
      rel.add({ ...base, severidade: 'aviso', confianca: 'possivel', titulo: 'Pode repetir sem esperar o cliente',
        detalhe: `${detalheBase} Ela só para quando as condições (${variaveis.join(', ')}) deixarem de ser verdadeiras.` });
    });
  });

  // L02: ciclo de estados só por transições que disparam sem o cliente falar.
  const auto = lista.filter((e) => e.auto && e.de !== e.para);
  const adj = adjacencia(auto);
  const nos = [...new Set(auto.flatMap((e) => [e.de, e.para]))].sort((a, b) => inteiro(a) - inteiro(b));
  componentes(nos, adj).filter((c) => c.length > 1).forEach((comp) => {
    const dentro = new Set(comp);
    const inicio = [...comp].sort((a, b) => inteiro(a) - inteiro(b))[0];
    const caminho = acharCiclo(inicio, adj, dentro);
    const arestasDoCiclo = caminho.slice(0, -1).map((de, i) => auto.find((e) => e.de === de && e.para === caminho[i + 1]));
    const certa = arestasDoCiclo.every((e) => {
      const infos = idx.transicoes.get(e.de) || [];
      const pos = infos.findIndex((x) => x.t.ID === e.transicaoId);
      return infos[pos].conds.length === 0 && !infos.slice(0, pos).some((x) => x.autodisparavel);
    });
    rel.add({ regra: 'L02', severidade: certa ? 'erro' : 'aviso', confianca: certa ? 'certa' : 'possivel', estadoNumero: inicio,
      transicaoId: arestasDoCiclo[0]?.transicaoId || null, acaoId: arestasDoCiclo[0]?.acaoId || null,
      titulo: `Ciclo sem esperar o cliente: ${caminho.join(' → ')}`,
      detalhe: `Os estados ${caminho.slice(0, -1).map((n) => nomeDoEstado(idx, n)).join(', ')} se chamam em sequência por transições que não dependem de mensagem. O motor roda isso a cada segundo, sem parar, e o timeout nunca dispara.${certa ? '' : ' Alguma transição do ciclo tem condições ou perde a prioridade, então o ciclo só ocorre quando elas forem verdadeiras.'}`,
      sugestao: 'Quebre o ciclo com uma condição em "Mensagem" em alguma das transições.' });
  });
}

function acharCiclo(inicio, adj, dentro) {
  const caminho = [inicio];
  const visitados = new Set();
  const dfs = (v) => {
    for (const w of adj.get(v) || []) {
      if (!dentro.has(w)) continue;
      if (w === inicio) { caminho.push(w); return true; }
      if (visitados.has(w)) continue;
      visitados.add(w); caminho.push(w);
      if (dfs(w)) return true;
      caminho.pop();
    }
    return false;
  };
  visitados.add(inicio);
  dfs(inicio);
  return caminho.length > 1 ? caminho : [inicio, inicio];
}

// Variáveis de condição que vêm de fora do bot ou de cadastros (não de extra_data).
const EXTERNAS = new Set([
  'calendario', 'calendario_falso', 'agent_on_queue', 'agent_online', 'agent_available_on_chat', 'status_last_att', 'opt_in', 'uci',
  'entrance_type', 'entrance', 'sender', 'contact_number', 'old_attendance', 'agent_last_att', 'pref_agent', 'name_pref_agent',
  'contact', 'assistant_analysis_status', 'assistant_analysis_text', 'error_count',
]);

// ------------------------------------------------------------------ transições

function analisarTransicoes(bot, idx, rel) {
  idx.transicoes.forEach((infos, estado) => {
    infos.forEach((info) => {
      info.conds.forEach((c) => {
        const variavel = c.CONDITION_DATA?.variable;
        const tipo = String(tipoDaCondicao(c));
        const textual = variavel === 'message' || (variavel && !(variavel in VARIABLE_KIND) && !EXTERNAS.has(variavel));
        if (textual && (tipo === '3' || tipo === '4')) {
          rel.add({ regra: 'T01', severidade: 'erro', estadoNumero: estado, transicaoId: info.t.ID, titulo: `"${tipo === '3' ? 'Diferente de' : 'Não contém'}" nunca é verdadeiro`,
            detalhe: `No motor, "Diferente de" e "Não contém" nunca são verdadeiros (Bot.class.php:701-705). A condição sobre "${variavel}" nunca casa e a transição inteira nunca executa.`,
            sugestao: 'Inverta a lógica: trate o caso desejado com "Igual a"/"Contém" em outra transição, de prioridade melhor.' });
        }
      });
    });

    // T02: uma transição sem condições vem antes de outras (que nunca executam).
    const posicao = infos.findIndex((x) => x.conds.length === 0);
    if (posicao >= 0 && posicao < infos.length - 1) {
      const sombras = infos.slice(posicao + 1);
      rel.add({ regra: 'T02', severidade: 'aviso', estadoNumero: estado, transicaoId: infos[posicao].t.ID,
        titulo: `${plural(sombras.length, 'transição nunca executa', 'transições nunca executam')} neste estado`,
        detalhe: `Esta transição (prioridade ${infos[posicao].t.PRIORITY}) não tem condições e sempre dispara primeiro. As de prioridade ${sombras.map((x) => x.t.PRIORITY).join(', ')} ficam sem uso.`,
        sugestao: 'Dê a ela a pior prioridade do estado (a última) ou acrescente uma condição.' });
    }

    // T03: prioridade repetida (a ordem entre elas não é definida pelo motor).
    const porPrio = new Map();
    infos.forEach((x) => { const p = str(x.t.PRIORITY); if (!porPrio.has(p)) porPrio.set(p, []); porPrio.get(p).push(x); });
    porPrio.forEach((grupo, prioridade) => {
      if (grupo.length < 2) return;
      rel.add({ regra: 'T03', severidade: 'info', confianca: 'possivel', estadoNumero: estado, transicaoId: grupo[0].t.ID,
        titulo: `${grupo.length} transições com a mesma prioridade (${prioridade})`,
        detalhe: 'Quando mais de uma transição passa, o motor não define qual vale entre prioridades iguais.', sugestao: 'Dê uma prioridade diferente a cada uma.' });
    });
  });
}

// ------------------------------------------------------------------ menus

/** Resultado de uma condição `message` para o ID de uma opção: true, false ou null (indecidível). */
function casaOpcao(tipo, valor, id) {
  const v = String(valor ?? '');
  if (DINAMICO.test(v)) return null;
  const candidato = id === '' || id === '0' ? '' : escaparHtml(id); // o motor escapa e trata "0" como vazio
  const linhas = v.split('\n');
  switch (String(tipo)) {
    case '1': return phpIgual(candidato, v) || linhas.some((l) => phpIgual(candidato, l));
    case '2': {
      if (v === '') return true;
      const alvo = maiusculaAscii(candidato);
      return alvo.includes(maiusculaAscii(v)) || linhas.some((l) => l !== '' && alvo.includes(maiusculaAscii(l)));
    }
    case '3': case '4': return false;
    default: return null; // É número, É e-mail...: dependem do conteúdo
  }
}

function resultadoPara(info, id) {
  let resultado = true;
  for (const c of info.msg) {
    const r = casaOpcao(tipoDaCondicao(c), c.CONDITION_DATA?.value, id);
    if (r === false) return false;
    if (r === null) resultado = null;
  }
  return resultado;
}

/** parseMenuModel trata todo `interactive` que não é botão como lista; cta_url, produto etc. não são menus. */
function modeloDoMenu(raw) {
  const modelo = parseMenuModel(raw);
  if (modelo.kind === 'whatsapp_list') {
    let tipo;
    try { tipo = JSON.parse(raw)?.interactive?.type; } catch { tipo = undefined; }
    if (tipo && tipo !== 'list') return { kind: 'unknown', raw };
  }
  return modelo;
}

function coletarMenus(bot, idx) {
  const menus = [];
  idx.transicoes.forEach((infos, estado) => infos.forEach((info) => {
    info.acoes.forEach((a, i) => {
      if (String(a.ACTION_TYPE) !== '10') return;
      const modelo = modeloDoMenu(a.ACTION_DATA?.message_option_text || '');
      const depois = info.acoes.slice(i + 1);
      // Menu seguido de transferência/encerramento/pausa não espera resposta aqui.
      const naoEspera = depois.some((x) => TERMINAIS.has(String(x.ACTION_TYPE)) || PAUSAS.has(String(x.ACTION_TYPE)));
      const destino = info.destino === null ? estado : info.destino;
      menus.push({ estado, info, acao: a, modelo, itens: extrairItensMenu(modelo), destino, naoEspera });
    });
  }));
  return menus;
}

/**
 * Estado em que o bot de fato espera a resposta do menu. Transição que dispara sem o cliente falar
 * (sem condição de mensagem) roda antes de ouvi-lo: se for certa, a análise segue para o destino;
 * se for condicional, pode sair sem ouvir o cliente e a análise não opina (null).
 */
function estadoDeEspera(idx, inicio) {
  let h = inicio;
  const vistos = new Set();
  while (!vistos.has(h)) {
    vistos.add(h);
    const auto = (idx.transicoes.get(h) || []).find((x) => x.autodisparavel);
    if (!auto) return h;
    if (auto.conds.length > 0 || auto.terminal || auto.pausa) return null;
    if (auto.destino === null || auto.destino === h || DINAMICO.test(auto.destino) || !idx.estados.has(auto.destino)) return null;
    h = auto.destino;
  }
  return null;
}

// Grafia comparável: sem acento, caixa, espaço nem pontuação ("Opção_1" ~ "opcao 1").
const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function analisarMenus(bot, idx, rel) {
  const menus = coletarMenus(bot, idx);

  // M04: problemas nas opções, por menu.
  menus.forEach((m) => {
    const base = { regra: 'M04', estadoNumero: m.estado, transicaoId: m.info.t.ID, acaoId: m.acao.ID };
    if (m.modelo.kind === 'unknown') {
      rel.add({ ...base, severidade: 'info', confianca: 'possivel', titulo: 'Menu em formato não reconhecido',
        detalhe: 'O JSON deste menu não é lista nem botões do WhatsApp nem menu de WebChat. A análise não consegue ver as opções.' });
      return;
    }
    const problemas = [];
    const ids = m.itens.map((i) => i.id);
    if (!m.itens.length) problemas.push('o menu não tem opções');
    if (ids.some((x) => str(x) === '')) problemas.push('há opção sem ID');
    const repetidos = [...new Set(ids.filter((x, i) => str(x) !== '' && ids.indexOf(x) !== i))];
    if (repetidos.length) problemas.push(`IDs repetidos: ${repetidos.map((x) => `"${x}"`).join(', ')}`);
    if (ids.includes('0')) problemas.push('o ID "0" nunca casa (o motor trata a mensagem "0" como vazia)');
    const comHtml = ids.filter((x) => /[&<>"]/.test(x));
    if (comHtml.length) problemas.push(`IDs com & < > ou aspas (${comHtml.map((x) => `"${x}"`).join(', ')}): o motor escapa a mensagem antes de comparar, então o ID pode não casar`);
    const limite = LIMITE_ID[m.modelo.kind];
    if (limite && ids.some((x) => x.length > limite)) problemas.push(`ID com mais de ${limite} caracteres (limite do WhatsApp)`);
    if (m.modelo.kind === 'whatsapp_list' && m.itens.length > WHATSAPP_LIST_MAX_ROWS) problemas.push(`${m.itens.length} linhas (o WhatsApp aceita até ${WHATSAPP_LIST_MAX_ROWS})`);
    if (m.modelo.kind === 'whatsapp_button' && m.itens.length > WHATSAPP_BUTTON_MAX) problemas.push(`${m.itens.length} botões (o WhatsApp aceita até ${WHATSAPP_BUTTON_MAX})`);
    if (problemas.length) {
      rel.add({ ...base, severidade: 'aviso', titulo: 'Menu com problema nas opções', detalhe: `${problemas.join('; ')}.`, sugestao: 'Abra o menu e corrija as opções.' });
    }
  });

  // M01 / M03 / M02: cruzam as opções com as condições do estado onde o bot espera a resposta.
  const porDestino = new Map();
  menus.filter((m) => m.modelo.kind !== 'unknown' && m.itens.length && !m.naoEspera && idx.estados.has(m.destino)).forEach((m) => {
    const espera = estadoDeEspera(idx, m.destino);
    if (espera === null) return;
    if (!porDestino.has(espera)) porDestino.set(espera, []);
    porDestino.get(espera).push(m);
  });

  porDestino.forEach((grupo, destino) => {
    const infos = idx.transicoes.get(destino) || [];
    const tratadas = new Set(); // `${indiceDoMenu}:${id}` com tratador efetivo
    const engolidas = new Map(); // transição -> { info, opcoes[], por }

    grupo.forEach((m, mi) => {
      const semTratamento = [];
      m.itens.filter((it) => str(it.id) !== '').forEach((it) => {
        let efetivo = false;
        let incerto = false;
        let captura = null;
        for (const x of infos) {
          const r = resultadoPara(x, it.id);
          if (r === false) continue;
          if (r === null) { incerto = true; continue; }
          if (x.generica) {
            if (!x.outras.length) { captura = x; break; }
            continue;
          }
          efetivo = true;
          if (!x.outras.length) break;
        }
        // Tratadores específicos depois de uma captura genérica certa estão engolidos (M03, não M01).
        let engolida = false;
        if (captura) {
          const posCaptura = infos.indexOf(captura);
          infos.forEach((x, p) => {
            if (p <= posCaptura || x.generica || resultadoPara(x, it.id) !== true) return;
            engolida = true;
            if (!engolidas.has(x.t.ID)) engolidas.set(x.t.ID, { info: x, captura, opcoes: [] });
            engolidas.get(x.t.ID).opcoes.push(it.id);
          });
        }
        // Genérica que segue em frente (troca de estado, transfere, pausa) repassa qualquer resposta: o tratamento fica adiante.
        const repassa = captura && (captura.terminal || captura.pausa || (captura.destino !== null && captura.destino !== destino));
        if (efetivo || repassa) tratadas.add(`${mi}:${it.id}`);
        else if (!incerto && !engolida) semTratamento.push({ it, captura });
      });

      if (semTratamento.length) {
        const nomes = semTratamento.map(({ it }) => `"${it.title || it.id}" (ID ${it.id})`);
        const comFallback = semTratamento.find((s) => s.captura)?.captura;
        const esperados = [...new Set(infos.flatMap((x) => x.msg
          .filter((c) => ['1', '2'].includes(String(tipoDaCondicao(c))) && !DINAMICO.test(String(c.CONDITION_DATA?.value ?? '')))
          .flatMap((c) => String(c.CONDITION_DATA.value).split('\n').map((l) => l.trim()).filter(Boolean))))];
        const dica = esperados.length ? ` O estado espera ${esperados.slice(0, 6).map((v) => `"${v}"`).join(', ')}${esperados.length > 6 ? ' e outros' : ''}, e o menu envia ${m.itens.map((i) => `"${i.id}"`).join(', ')}.` : '';
        rel.add({ regra: 'M01', severidade: 'aviso', estadoNumero: m.estado, transicaoId: m.info.t.ID, acaoId: m.acao.ID,
          titulo: `${plural(semTratamento.length, 'opção', 'opções')} de ${m.itens.length} sem tratamento`,
          detalhe: `Nenhuma transição do estado ${nomeDoEstado(idx, destino)} trata ${semTratamento.length === 1 ? 'a opção' : 'as opções'} ${nomes.join(', ')}. ${infos.length ? (comFallback ? `A resposta cai na transição genérica de prioridade ${comFallback.t.PRIORITY}, que não sai do estado (em geral, o "não entendi").` : 'Nenhuma transição casa: o bot não responde e a conversa fica parada.') : 'O estado não tem transições.'}${dica}`,
          sugestao: 'Use "Gerar tratamento" no menu ou crie uma transição com "Mensagem Igual a <ID>".' });
      }
    });

    engolidas.forEach(({ info, captura, opcoes }) => {
      rel.add({ regra: 'M03', severidade: 'erro', estadoNumero: destino, transicaoId: info.t.ID,
        titulo: 'Tratamento de opção nunca executa',
        detalhe: `A transição de prioridade ${captura.t.PRIORITY} casa qualquer mensagem e vem antes desta (prioridade ${info.t.PRIORITY}), que trata ${opcoes.map((o) => `"${o}"`).join(', ')}. O cliente nunca chega aqui.`,
        sugestao: 'Dê à transição genérica a pior prioridade do estado.' });
    });

    // M02: condições `message` que não correspondem a nenhum ID do menu.
    const todasOpcoes = grupo.flatMap((m, mi) => m.itens.filter((it) => str(it.id) !== '').map((it) => ({ ...it, chave: `${mi}:${it.id}` })));
    infos.forEach((x) => {
      x.msg.forEach((c) => {
        const tipo = String(tipoDaCondicao(c));
        if (tipo !== '1' && tipo !== '2') return;
        String(c.CONDITION_DATA?.value ?? '').split('\n').map((l) => l.trim()).filter((l) => l !== '' && !DINAMICO.test(l)).forEach((linha) => {
          if (todasOpcoes.some((o) => casaOpcao(tipo, linha, o.id) === true)) return;
          // Só vira achado quando o valor é uma grafia diferente de uma opção; valor sem relação com o menu
          // (texto livre, "voltar", "atendente") é comum e legítimo.
          // Grafia normalizada vazia (só pontuação ou emoji) não identifica nada: sem isso "?" casaria com um título "👍".
          const grafia = normalizar(linha);
          const porGrafia = tipo === '1' && grafia ? todasOpcoes.find((o) => normalizar(o.id) === grafia) : null;
          const porTitulo = grafia ? todasOpcoes.find((o) => normalizar(o.title) === grafia) : null;
          const porPosicao = LITERAL.test(linha) ? grupo.map((m) => m.itens[inteiro(linha) - 1]).find((it) => it && str(it.id) !== '') : null;
          const alvo = porGrafia || porTitulo || (porPosicao && todasOpcoes.find((o) => o.id === porPosicao.id)) || null;
          if (!alvo) return;
          const base = { regra: 'M02', estadoNumero: destino, transicaoId: x.t.ID };
          const causa = alvo === porGrafia ? 'só difere em maiúsculas/minúsculas, acento, espaço ou pontuação' : alvo === porTitulo ? 'é o título da opção, mas o cliente envia o ID' : 'é a posição da opção, mas o cliente envia o ID';
          const jaTratada = tratadas.has(alvo.chave);
          rel.add({ ...base, severidade: jaTratada ? 'info' : 'erro', confianca: jaTratada ? 'possivel' : 'certa',
            titulo: `Condição espera "${linha}", mas o ID da opção é "${alvo.id}"`,
            detalhe: `A condição ${tipo === '1' ? 'Igual a' : 'Contém'} "${linha}" ${causa}. O menu envia "${alvo.id}" quando o cliente escolhe "${alvo.title || alvo.id}", então tocar na opção não dispara esta transição (só digitar "${linha}" à mão).${jaTratada ? ' A opção já tem outro tratamento.' : ''}`,
            sugestao: `Troque o valor da condição por "${alvo.id}".` });
        });
      });
    });
  });
}

// ------------------------------------------------------------------ entrada

/**
 * Analisa o bot e devolve { achados, resumo }. Não altera o bot.
 * `achados` vem ordenado: erro, aviso, info; depois estado e regra.
 */
export function analisarBot(bot) {
  const idx = indexar(bot || {});
  const rel = criarRelator(idx);
  const { lista } = analisarEstrutura(bot || {}, idx, rel);
  analisarLoops(bot || {}, idx, rel, lista);
  analisarTransicoes(bot || {}, idx, rel);
  analisarMenus(bot || {}, idx, rel);

  const achados = rel.achados.sort((a, b) =>
    SEVERIDADES.indexOf(a.severidade) - SEVERIDADES.indexOf(b.severidade)
    || (a.estadoNumero === null ? -1 : 0) - (b.estadoNumero === null ? -1 : 0)
    || inteiro(a.estadoNumero) - inteiro(b.estadoNumero)
    || a.regra.localeCompare(b.regra));
  const resumo = { erro: 0, aviso: 0, info: 0, total: achados.length, porRegra: {} };
  achados.forEach((a) => { resumo[a.severidade] += 1; resumo.porRegra[a.regra] = (resumo.porRegra[a.regra] || 0) + 1; });
  return { achados, resumo };
}
