// ---------------------------------------------------------------------------
// Simulador do motor de bots (Bot.class.php), para testar o rascunho no editor
// sem salvar nem criar atendimento. Módulo puro (sem DOM): a tela fica em
// teste-bot.js. Regras confirmadas no código da Orpen (ContactCenter/classes/
// Bot.class.php; números de linha de 2026-10, PHP 5.6):
//
//  - Uma "rodada" é um ciclo do daemon (~1 s). Por conversa, vale a PRIMEIRA
//    transição do estado (PRIORITY asc) cujas condições são todas verdadeiras
//    (AND, para na primeira falsa; BOT:278-291). Só uma por rodada; as ações
//    rodam em ordem de ID (BOT:293-295). Nenhuma casou: nada acontece, e a
//    mensagem do cliente já foi consumida (o cursor bot_last_message avança no
//    construtor, BOT:117-129).
//  - Troca de estado (ação 2) vale na PRÓXIMA rodada, e a conversa continua
//    sendo avaliada mesmo sem mensagem nova (o construtor não descarta conversa
//    de lote vazio, BOT:82-130): transição sem condição de mensagem dispara
//    sozinha, uma por rodada, sem limite. Aqui há um teto e um aviso.
//  - IGUAL A (1): == frouxo do PHP (strings numéricas iguais casam), diferencia
//    maiúsculas, por linha do valor (BOT:642-670). CONTÉM (2): strtoupper do
//    PHP 5.6 só maiusculiza ASCII, valor vazio sempre casa, por linha
//    (BOT:672-699). DIFERENTE DE (3) e NÃO CONTÉM (4) chamam check_condition
//    com um número no lugar da condição (BOT:701-705) e, no PHP 5.6, nunca são
//    verdadeiros. A mensagem do cliente chega com htmlspecialchars (& < > ").
//  - Condições que dependem de dados que o simulador não tem (calendário, fila,
//    agente online...) NUNCA viram "falso" em silêncio: a sessão pausa e pede o
//    valor (status 'aguardando-contexto').
//  - Ações 18, 20 e 22 pausam o bot até o callback (status 'aguardando').
// ---------------------------------------------------------------------------
import { VARIABLE_LABELS, TEXT_OPERATORS, CONTACT_OPERATORS, ERROR_COUNT_OPERATORS, ACTION_TYPE_LABELS, VARIABLE_KIND, CAMPOS_ESTADO_POR_TIPO } from './dictionaries.js';
import { parseMenuModel, extrairItensMenu } from './menu-builder.js';
import { tipoDaCondicao } from './orpen-adapter.js';

export const LIMITE_RODADAS = 25;

// Variáveis que têm tratamento próprio (não passam pelo operador de texto).
const VARIABLE_KIND_TODAS = {
  error_count: 1, calendario: 1, calendario_falso: 1, agent_on_queue: 1, agent_online: 1, agent_available_on_chat: 1,
  status_last_att: 1, opt_in: 1, uci: 1, entrance_type: 1, entrance: 1, sender: 1, contact_number: 1,
  assistant_analysis_status: 1, assistant_analysis_text: 1, old_attendance: 1, agent_last_att: 1, pref_agent: 1, name_pref_agent: 1,
};

const clone = (x) => JSON.parse(JSON.stringify(x));
const porId = (a, b) => (parseInt(a.ID, 10) || 0) - (parseInt(b.ID, 10) || 0);
const porPrioridade = (a, b) => (parseInt(a.PRIORITY, 10) || 0) - (parseInt(b.PRIORITY, 10) || 0) || porId(a, b);

// ---- helpers que imitam o PHP ----------------------------------------------

export const escaparHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const decodificarHtml = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&');
const tirarTags = (s) => String(s).replace(/<[^>]*>/g, '');
const maiusculaAscii = (s) => String(s).replace(/[a-z]/g, (c) => c.toUpperCase());
const NUMERICA = /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/; // PHP 5.6: espaço no fim não é numérico
const phpIgual = (a, b) => (NUMERICA.test(a) && NUMERICA.test(b) ? Number(a) === Number(b) : String(a) === String(b));
const inteiro = (s) => parseInt(String(s).trim(), 10) || 0;

function cpfValido(texto) {
  const n = String(texto).replace(/\D/g, '');
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n) || n === '12345678909') return false;
  for (const t of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(n[i]) * (t + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(n[t])) return false;
  }
  return true;
}
// Aceita CNPJ alfanumérico (valor = código do caractere - 48) e não rejeita dígitos repetidos, como o motor.
const alfanumerico = (s) => String(s).replace(/[^0-9a-zA-Z]/g, '');
function cnpjValido(texto) {
  const n = alfanumerico(texto).toUpperCase();
  if (n.length !== 14) return false;
  const v = (i) => n.charCodeAt(i) - 48;
  const digito = (pesos) => {
    const r = pesos.reduce((soma, p, i) => soma + v(i) * p, 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = digito([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digito([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return /\d/.test(n[12]) && /\d/.test(n[13]) && Number(n[12]) === d1 && Number(n[13]) === d2;
}
function dataValida(texto) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texto));
  if (!m) return false;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return d.getFullYear() === Number(m[3]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[1]);
}
const EMAIL = /^([\w-]+(?:\.[\w-]+)*)@((?:[\w-]+\.)*\w[\w-]{0,66})\.([a-zA-Z]{2,6}(?:\.[a-zA-Z]{2})?)$/;

// ---- sessão ----------------------------------------------------------------

/**
 * Cria uma sessão de teste a partir do bot (foto: o bot original não é alterado).
 * `contexto.externas` guarda o que o simulador não sabe (calendário, fila...);
 * `contexto.contato` guarda dados do cliente usados em {$variáveis}.
 * Testar só uma parte do fluxo: `contexto.inicio` (estado em que a conversa começa, padrão 0),
 * `contexto.variaveis` e `contexto.erros` (o que o cliente já teria guardado até ali) e
 * `contexto.parada` (estado em que o teste para ao chegar, antes de o bot rodar nele).
 */
export function criarSessao(bot, contexto = {}) {
  const foto = {
    BOT_STATES: clone(bot.BOT_STATES || []),
    BOT_TRANSITIONS: clone(bot.BOT_TRANSITIONS || []),
    // Mesma regra do salvar (orpen-adapter) e do servidor (Bot.class.php:225/240): condição ou
    // ação de tipo 0 não é gravada. A transição sem a condição passa a valer sempre.
    BOT_CONDITIONS: clone((bot.BOT_CONDITIONS || []).filter((c) => Number(tipoDaCondicao(c)) !== 0)),
    BOT_ACTIONS: clone((bot.BOT_ACTIONS || []).filter((a) => (parseInt(a.ACTION_TYPE, 10) || 0) !== 0)),
    TIMEOUT_ACTION: bot.TIMEOUT_ACTION ?? '',
    TIMEOUT_DESTINY: bot.TIMEOUT_DESTINY ?? '',
    TIMEOUT_MESSAGE: bot.TIMEOUT_MESSAGE ?? '',
  };
  const inicio = String(contexto.inicio ?? '0');
  const sessao = {
    bot: foto,
    estado: inicio,
    status: 'ativa', // ativa | aguardando | aguardando-contexto | encerrada
    motivoFim: null, // 'parada' quando o teste parou no ponto de parada
    parada: contexto.parada === undefined || contexto.parada === null || contexto.parada === '' ? null : String(contexto.parada),
    erros: Number(contexto.erros) || 0,
    extra: Object.fromEntries(Object.entries(contexto.variaveis || {}).filter(([, v]) => v !== '' && v !== undefined)),
    contexto: {
      variaveis: { ...(contexto.variaveis || {}) },
      externas: { ...(contexto.externas || {}) },
      contato: { nome: 'Cliente Teste', remetente: '5511999990000', ...(contexto.contato || {}) },
    },
    eventos: [],
    rodadas: [],
    caminho: [inicio],
    visitas: { [inicio]: 1 },
    pausa: null,
    pendentes: null,
    requisitos: [],
    rodadaN: 0,
  };
  if (!foto.BOT_STATES.some((s) => String(s.STATE_NUMBER) === inicio)) {
    sessao.status = 'encerrada';
    sistema(sessao, inicio === '0' ? 'Este bot não tem o estado 0, onde toda conversa nova começa.' : `Este bot não tem o estado ${inicio}, escolhido como início do teste.`, 'erro');
  }
  return sessao;
}

// Para o teste ao chegar no estado de parada, antes de o bot rodar nele.
function verificarParada(sessao) {
  if (sessao.parada === null || sessao.status === 'encerrada') return;
  if (String(sessao.estado) !== sessao.parada) return;
  sessao.status = 'encerrada';
  sessao.motivoFim = 'parada';
  sistema(sessao, `Chegou ao estado ${sessao.estado}, o ponto de parada do teste. O bot ainda não rodou nele.`);
}

/** Depois de parar no ponto de parada: segue a partir dele (o ponto de parada some). */
export function continuarDaParada(sessao) {
  if (sessao.motivoFim !== 'parada') return;
  sessao.parada = null;
  sessao.motivoFim = null;
  // A mesma transição que chegou ao estado de parada pode ter pausado o bot (IA, áudio, automação):
  // o callback continua pendente.
  if (sessao.pausa) { sessao.status = 'aguardando'; return; }
  sessao.status = 'ativa';
  processar(sessao, []);
}

function sistema(sessao, texto, nivel = 'info') {
  sessao.eventos.push({ tipo: 'sistema', texto, nivel });
}

function saida(sessao, subtipo, dados) {
  sessao.eventos.push({ tipo: 'bot', subtipo, ...dados });
}

// ---- variáveis {$x} ---------------------------------------------------------

function nomeCompleto(sessao) {
  return sessao.contexto.contato.nome || '';
}

export function trocarVariaveis(sessao, texto, mensagens = []) {
  if (typeof texto !== 'string') return texto;
  const c = sessao.contexto.contato;
  return texto.replace(/\{\$[a-zA-Z_0-9]*\}/g, (m) => {
    const nome = m.slice(2, -1);
    const nomeContato = nomeCompleto(sessao);
    switch (nome.toLowerCase()) {
      case 'name_pref_agent': return c.nomeAgentePref ?? '';
      case 'pref_agent': return c.agentePref ?? '';
      case 'sys_conversation': return '1001';
      case 'sys_attendance': return '2001';
      case 'sys_protocol': return '3001';
      case 'sys_agent': return '0';
      case 'sender': case 'source': case 'contact_number': return c.remetente ?? '';
      case 'contact': case 'contact_name': return nomeContato;
      case 'contact_first_name': return nomeContato.split(' ')[0];
      case 'contact_last_name': { const p = nomeContato.split(' '); return p.length > 1 ? nomeContato.split(' ').slice(1).join(' ') : p[0]; }
      case 'contact_observations': return c.observacoes ?? '';
      case 'email_subject': return c.assuntoEmail ?? '';
      case 'uci': return c.uci ?? '';
      case 'old_attendance': return sessao.extra.agent_last_att ?? '';
      case 'entrance_type': return sessao.contexto.externas.entrance_type ?? '';
      case 'entrance': return sessao.contexto.externas.entrance ?? '';
      case 'message_escaped': {
        const ultima = [...mensagens].reverse()[0] ?? ''; // rodada automática (lote vazio): o motor devolve ''
        return JSON.stringify(tirarTags(String(ultima)).trim()).slice(1, -1);
      }
      default: return sessao.extra[nome] ?? '';
    }
  });
}

// ---- condições --------------------------------------------------------------

class PrecisaDeContexto extends Error {
  constructor(requisito) { super(requisito.rotulo); this.requisito = requisito; }
}

function externa(sessao, chave, rotulo, tipo = 'bool') {
  const v = sessao.contexto.externas[chave];
  if (v === undefined || v === null || v === '') throw new PrecisaDeContexto({ chave, rotulo, tipo });
  return v;
}

function textoOperador(tipo, candidatos, valor, sessao, avisos, manual) {
  const linhas = String(valor).split('\n');
  const guardarMensagem = (c) => { sessao.extra.message = tirarTags(decodificarHtml(c)).trim(); };
  switch (tipo) {
    case '0': return true;
    case '1': // IGUAL A
      return candidatos.some((c) => { guardarMensagem(c); return phpIgual(c, valor) || linhas.some((l) => phpIgual(c, l)); });
    case '2': // CONTÉM
      return candidatos.some((c) => {
        guardarMensagem(c);
        if (valor === '') return true;
        const alvo = maiusculaAscii(c);
        return alvo.includes(maiusculaAscii(valor)) || linhas.some((l) => l !== '' && alvo.includes(maiusculaAscii(l)));
      });
    case '3': case '4':
      avisos.push('No motor, "Diferente de" e "Não contém" nunca são verdadeiros (Bot.class.php:701-705). Esta condição nunca casa em produção.');
      return false;
    case '5': return candidatos.some((c) => { const ok = cpfValido(tirarTags(decodificarHtml(c))); if (ok) sessao.extra.cpf = String(c).replace(/\D/g, ''); return ok; });
    case '6': return candidatos.some((c) => linhas.some((l) => inteiro(c) > inteiro(l)));
    case '7': return candidatos.some((c) => linhas.some((l) => inteiro(c) >= inteiro(l)));
    case '8': return candidatos.some((c) => linhas.some((l) => inteiro(c) < inteiro(l)));
    case '9': return candidatos.some((c) => linhas.some((l) => inteiro(c) <= inteiro(l)));
    case '11': return candidatos.some((c) => { const ok = NUMERICA.test(c); if (ok) sessao.extra.number = c; return ok; });
    case '12': return candidatos.some((c) => { const t = tirarTags(decodificarHtml(c)); const ok = EMAIL.test(t); if (ok) sessao.extra.email = t; return ok; });
    case '13': return candidatos.some((c) => { const t = tirarTags(decodificarHtml(c)); const ok = cnpjValido(t); if (ok) sessao.extra.cnpj = alfanumerico(t); return ok; });
    case '14': return candidatos.some((c) => { const t = tirarTags(decodificarHtml(c)); const ok = cpfValido(t) || cnpjValido(t); if (ok) sessao.extra.cpf_cnpj = alfanumerico(t); return ok; });
    case '15': return candidatos.some((c) => { const ok = dataValida(tirarTags(decodificarHtml(c))); if (ok) sessao.extra.date = c; return ok; });
    default:
      // Anexo, áudio, VIP, labels, story... dependem de dados que o simulador não tem:
      // o usuário diz se a condição é verdadeira.
      if (manual.nivelMensagem && candidatos.length === 0) return false;
      return externa(sessao, manual.chave, manual.rotulo) === 'sim';
  }
}

// Operadores de texto que o simulador reproduz; os demais pedem o resultado ao usuário.
// Operadores que olham a mensagem do cliente (story, arquivo, áudio, forma de contato): o motor
// percorre as mensagens do lote e, sem mensagem nova, devolve falso. A resposta dada ao simulador
// vale só para a rodada em que foi pedida.
const NIVEL_MENSAGEM = new Set(['16', '17', '22', '23', '24']);
const OPERADORES_SIMULADOS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '11', '12', '13', '14', '15']);

/** { resultado: boolean, avisos: [] }; lança PrecisaDeContexto quando falta dado. */
function avaliarCondicao(sessao, c, mensagens) {
  const d = c.CONDITION_DATA || {};
  const tipo = String(c.CONDITION_TYPE ?? '0').trim() || '0';
  const variavel = d.variable ?? '';
  const avisos = [];
  const valor = trocarVariaveis(sessao, d.value === undefined || d.value === null ? '' : String(d.value), mensagens);
  const ret = (resultado) => ({ resultado, avisos });
  const nivelMensagem = ['message', 'contact'].includes(variavel) && NIVEL_MENSAGEM.has(tipo);
  const manual = { nivelMensagem, chave: nivelMensagem ? `condicao:${c.ID}:r${sessao.rodadaN}` : `condicao:${c.ID}`, rotulo: `${descreverCondicao(c)}: o simulador ainda não reproduz este caso. Ela é verdadeira?` };

  switch (variavel) {
    case 'message': case 'contact': {
      // O motor lê message_text já com htmlspecialchars e usa `message_text ?: watson_sentiment`: a mensagem
      // "0" (falsa no PHP) vira o watson_sentiment, que é NULL, então "0" não casa com IGUAL A "0".
      const candidatos = mensagens.map((m) => (m === '' || m === '0' ? '' : escaparHtml(m)));
      return ret(textoOperador(tipo, candidatos, valor, sessao, avisos, manual));
    }
    case 'error_count': {
      const n = sessao.erros;
      sessao.extra.error_count = String(n); // Bot.class.php:481-483
      const v = Number(d.value);
      return ret({ 1: n == v, 6: n > v, 7: n >= v, 8: n < v, 9: n <= v }[tipo] ?? false);
    }
    case 'calendario': return ret(externa(sessao, `calendario:${tipo}`, `Calendário ${tipo}: o momento do teste está dentro do período?`) === 'sim');
    case 'calendario_falso': return ret(externa(sessao, `calendario:${tipo}`, `Calendário ${tipo}: o momento do teste está dentro do período?`) !== 'sim');
    case 'agent_on_queue': return ret(externa(sessao, `agent_on_queue:${tipo}`, `Fila ${tipo}: há agente logado e disponível?`) === 'sim');
    case 'agent_online': {
      const agente = /^\d+$/.test(tipo) && tipo !== '0' ? tipo : valor;
      return ret(externa(sessao, `agent_online:${agente}`, `Agente ${agente}: está logado?`) === 'sim');
    }
    case 'agent_available_on_chat': return ret(externa(sessao, `agent_available_on_chat:${tipo}`, `Agente ${tipo}: está disponível no chat?`) === 'sim');
    case 'status_last_att': return ret(String(externa(sessao, 'status_last_att', 'ID do status do último atendimento do cliente', 'texto')) === tipo);
    case 'opt_in': { const tem = externa(sessao, 'opt_in', 'O contato tem Opt-in?') === 'sim'; return ret(tipo === '1' ? tem : !tem); }
    case 'uci': { const tem = externa(sessao, 'uci', 'O contato tem UCI?') === 'sim'; return ret(tipo === '1' ? tem : !tem); }
    case 'entrance_type': return ret(String(externa(sessao, 'entrance_type', 'Tipo da entrada (1 WhatsApp, 2 E-mail, 3 Facebook, 6 Webchat, 7 Instagram, 8 Telegram)', 'texto')) === tipo);
    case 'entrance': return ret(String(externa(sessao, 'entrance', 'ID da entrada por onde o cliente chegou', 'texto')) === tipo);
    case 'sender': {
      // Bot.class.php:561-589: valor com trim, IGUAL A (1) diferencia maiúsculas, CONTÉM (2) não, outro tipo = falso.
      const origem = String(externa(sessao, 'sender', 'Remetente (número ou e-mail do cliente)', 'texto'));
      const v = String(d.value ?? '').trim();
      if (tipo === '1') return ret(phpIgual(v, origem) || v.split('\n').some((l) => phpIgual(origem, l)));
      if (tipo !== '2') return ret(false);
      const o = maiusculaAscii(origem);
      return ret(v === '' || o.includes(maiusculaAscii(v)) || v.split('\n').some((l) => l !== '' && o.includes(maiusculaAscii(l))));
    }
    case 'contact_number': {
      const numero = String(externa(sessao, 'contact_number', 'Número do contato', 'texto'));
      return ret(String(d.value ?? '').split(/\r\n|\n|\r/).some((p) => p !== '' && numero.startsWith(p)));
    }
    case 'assistant_analysis_status': case 'assistant_analysis_text': {
      if (String(sessao.extra.assistant_id ?? '') !== String(d.assistant_id ?? '')) return ret(false);
      if (variavel === 'assistant_analysis_status') return ret(String(sessao.extra.assistant_analysis_status ?? '') === String(d.value ?? ''));
      return ret(textoOperador(String(d.type ?? '1'), [String(sessao.extra.assistant_analysis_text ?? '')], valor, sessao, avisos, manual));
    }
    case 'old_attendance': case 'agent_last_att': case 'pref_agent': case 'name_pref_agent':
      return ret(externa(sessao, manual.chave, `${descreverCondicao(c)}: o simulador não tem esse dado. Ela é verdadeira?`) === 'sim');
    default: {
      // Qualquer outra variável: extra_data[variável] (ação 13, scripts, automação).
      const guardado = sessao.extra[variavel];
      return ret(textoOperador(tipo, [guardado === undefined ? '' : String(guardado)], valor, sessao, avisos, manual));
    }
  }
}

function descreverCondicao(c) {
  const d = c.CONDITION_DATA || {};
  const tipo = String(c.CONDITION_TYPE ?? '0');
  const rotuloVar = VARIABLE_LABELS[d.variable] || d.variable || 'Condição';
  const kind = VARIABLE_KIND[d.variable];
  let op = '';
  if (kind === 'error_count') op = ERROR_COUNT_OPERATORS[tipo] || '';
  else if (!kind || kind === 'text' || kind === 'contact') op = TEXT_OPERATORS[tipo] || CONTACT_OPERATORS[tipo] || (tipo === '0' ? 'sempre' : `tipo ${tipo}`);
  else op = `ID ${tipo}`;
  const valor = d.value !== undefined && d.value !== '' ? ` "${String(d.value).replace(/\n/g, ' / ')}"` : '';
  return `${rotuloVar} ${op}${valor}`.trim();
}

// ---- ações ------------------------------------------------------------------

function executarAcao(sessao, a, mensagens, rodada) {
  const d = a.ACTION_DATA || {};
  const tipo = String(a.ACTION_TYPE);
  const nome = ACTION_TYPE_LABELS[tipo] || `Tipo ${tipo}`;
  const t = (s) => trocarVariaveis(sessao, s, mensagens);
  const reg = (efeito) => rodada.acoes.push({ id: a.ID, tipo, nome, efeito });

  switch (tipo) {
    case '1': { const texto = t(d.message_text ?? ''); saida(sessao, 'texto', { texto }); reg(`Enviou: ${texto}`); return; }
    case '10': {
      const modelo = parseMenuModel(t(d.message_option_text ?? ''));
      saida(sessao, 'menu', { modelo, itens: extrairItensMenu(modelo) });
      reg('Enviou um menu');
      return;
    }
    case '11': saida(sessao, 'texto', { texto: '[formulário enviado]' }); reg('Enviou um formulário'); return;
    case '2': {
      const destino = String(t(String(d.destiny ?? ''))).trim();
      const existe = sessao.bot.BOT_STATES.some((s) => String(s.STATE_NUMBER) === destino);
      sessao.estado = destino;
      if (!existe) sistema(sessao, `A ação "Troca Estado" aponta para o estado "${destino}", que não existe: o bot fica parado.`, 'erro');
      reg(`Troca para o estado ${destino}${existe ? '' : ' (não existe)'} — vale na próxima rodada`);
      return;
    }
    case '4': case '5': {
      const alvo = t(String(d.destiny ?? ''));
      sistema(sessao, `${tipo === '4' ? 'Transferido para o agente' : 'Transferido para a fila/bot'} ${alvo}. Fim do bot nesta conversa.`);
      sessao.status = 'encerrada';
      reg(`Transferiu (${alvo}) e encerra a sessão`);
      return;
    }
    case '6': sistema(sessao, `Atendimento finalizado (status CRM ${d.crm_status || '—'}). Fim do bot nesta conversa.`); sessao.status = 'encerrada'; reg('Finalizou o atendimento'); return;
    case '7': {
      const retorno = sessao.contexto.externas[`script:${d.script_name}`];
      if (retorno) {
        try { Object.entries(JSON.parse(retorno)).forEach(([k, v]) => { sessao.extra[`${d.script_name}_${k}`] = String(v); }); reg(`Script ${d.script_name}: usou o retorno informado`); } catch { sistema(sessao, `O retorno informado do script ${d.script_name} não é um JSON válido.`, 'aviso'); reg('Script com retorno inválido'); }
      } else {
        sistema(sessao, `Script ${d.script_name} não foi executado (o simulador não roda scripts). Informe o retorno em "Contexto" se o fluxo depender dele.`, 'aviso');
        reg('Script não executado');
      }
      return;
    }
    case '8': {
      if (d.error_count === 'add') sessao.erros += 1; else if (d.error_count === 'reset') sessao.erros = 0;
      reg(`Contador de erros ${d.error_count === 'add' ? '+1' : 'zerado'} (agora ${sessao.erros})`);
      return;
    }
    case '13': {
      try {
        const obj = JSON.parse(t(d.bot_variables_text ?? ''));
        Object.entries(obj).forEach(([k, v]) => { sessao.extra[k] = typeof v === 'object' ? JSON.stringify(v) : String(v); });
        reg(`Guardou ${Object.keys(obj).join(', ') || 'nada'}`);
      } catch {
        sistema(sessao, 'Armazenar variável: o JSON, depois de trocar as variáveis, não é válido; nada foi guardado.', 'aviso');
        reg('JSON inválido: nada guardado');
      }
      return;
    }
    case '17': saida(sessao, 'arquivo', { texto: `Arquivo (ID ${d.send_file || '—'})` }); reg('Enviou um arquivo'); return;
    case '18': case '20': case '22': {
      if (tipo === '20') saida(sessao, 'audio', { texto: t(d.message_content ?? '') });
      sessao.status = 'aguardando';
      sessao.pausa = { acaoId: a.ID, tipo, nome, callback: String(d.callback_state ?? ''), fallback: String(d.fallback_state ?? ''), assistente: d.assistant_id ?? '' };
      sistema(sessao, `${nome}: o bot espera o retorno (callback).`);
      reg('Pausa até o callback');
      return;
    }
    case '9': case '12': case '14': case '15': case '16': case '19': case '21': reg('Registrado (sem efeito no teste)'); return;
    default: sistema(sessao, `Ação "${nome}" não é reproduzida pelo simulador.`, 'aviso'); reg('Não simulada');
  }
}

// ---- rodadas ----------------------------------------------------------------

function transicoesDoEstado(sessao) {
  return sessao.bot.BOT_TRANSITIONS.filter((t) => String(t.STATE) === String(sessao.estado)).sort(porPrioridade);
}

/** Uma rodada do motor. Devolve { disparou, pausaContexto }. */
function executarRodada(sessao, mensagens) {
  sessao.rodadaN += 1;
  const rodada = { n: sessao.rodadaN, estado: sessao.estado, mensagens: [...mensagens], tentativas: [], disparada: null, acoes: [], estadoDepois: sessao.estado, avisos: [] };
  const existe = sessao.bot.BOT_STATES.some((s) => String(s.STATE_NUMBER) === String(sessao.estado));
  let escolhida = null;

  for (const t of transicoesDoEstado(sessao)) {
    const tentativa = { transicaoId: t.ID, prioridade: t.PRIORITY, condicoes: [], aprovada: false };
    let ok = true;
    for (const c of sessao.bot.BOT_CONDITIONS.filter((x) => x.TRANSITION_ID === t.ID).sort(porId)) {
      let r;
      try {
        r = avaliarCondicao(sessao, c, mensagens);
      } catch (e) {
        if (!(e instanceof PrecisaDeContexto)) throw e;
        tentativa.condicoes.push({ id: c.ID, descricao: descreverCondicao(c), resultado: null, motivo: `Falta: ${e.requisito.rotulo}` });
        rodada.tentativas.push(tentativa);
        // Desfaz o que a rodada já fez nesta contagem: ela será refeita com a mesma mensagem.
        sessao.rodadaN -= 1;
        sessao.requisitos = [e.requisito];
        return { disparou: false, pausaContexto: true, rodada };
      }
      rodada.avisos.push(...r.avisos);
      tentativa.condicoes.push({ id: c.ID, descricao: descreverCondicao(c), resultado: r.resultado, motivo: r.resultado ? 'verdadeira' : 'falsa', avisos: r.avisos });
      if (!r.resultado) { ok = false; break; }
    }
    tentativa.aprovada = ok;
    rodada.tentativas.push(tentativa);
    if (ok) { escolhida = t; break; }
  }

  if (!existe) sistema(sessao, `O bot está no estado ${sessao.estado}, que não existe. Nada acontece.`, 'erro');
  if (escolhida) {
    rodada.disparada = escolhida.ID;
    for (const a of sessao.bot.BOT_ACTIONS.filter((x) => x.TRANSITION_ID === escolhida.ID).sort(porId)) executarAcao(sessao, a, mensagens, rodada);
    if (!sessao.bot.BOT_ACTIONS.some((x) => x.TRANSITION_ID === escolhida.ID)) rodada.acoes.push({ id: '', tipo: '', nome: 'Sem ações', efeito: 'A transição não tem ações' });
  }
  rodada.estadoDepois = sessao.estado;
  rodada.avisos = [...new Set(rodada.avisos)];
  sessao.rodadas.push(rodada);
  if (String(rodada.estadoDepois) !== String(rodada.estado)) {
    sessao.caminho.push(String(rodada.estadoDepois));
    sessao.visitas[rodada.estadoDepois] = (sessao.visitas[rodada.estadoDepois] || 0) + 1;
    verificarParada(sessao);
  }
  return { disparou: !!escolhida, pausaContexto: false, rodada };
}

function processar(sessao, mensagens) {
  let lote = mensagens;
  sessao.pendentes = null;
  sessao.requisitos = [];
  let repeticoes = 0;
  while (sessao.status === 'ativa') {
    const r = executarRodada(sessao, lote);
    if (r.pausaContexto) {
      sessao.status = 'aguardando-contexto';
      sessao.pendentes = lote;
      return;
    }
    lote = [];
    if (!r.disparou) break;
    repeticoes += 1;
    if (repeticoes >= LIMITE_RODADAS) {
      sistema(sessao, `Parei depois de ${LIMITE_RODADAS} rodadas seguidas sem o cliente falar. Em produção isso se repete a cada segundo, sem fim: confira o estado ${sessao.estado} (uma transição sem condição de mensagem que não troca de estado, ou um ciclo de estados).`, 'erro');
      break;
    }
  }
}

// ---- interface do simulador --------------------------------------------------

/** O cliente escreve (ou toca num botão: mande o ID dele e, em `exibir`, o título que ele vê). */
export function enviarMensagem(sessao, texto, exibir) {
  if (sessao.status === 'encerrada') return;
  if (sessao.status === 'aguardando') { sistema(sessao, 'O bot está esperando o callback: responda pelo botão "Callback" antes de continuar.', 'aviso'); return; }
  if (sessao.status === 'aguardando-contexto') { sistema(sessao, 'Defina o valor que o teste está pedindo (aba Contexto) antes de continuar.', 'aviso'); return; }
  sessao.eventos.push({ tipo: 'cliente', texto, exibir: exibir ?? texto });
  processar(sessao, [String(texto)]);
}

/** Depois de preencher o contexto pedido, refaz a rodada interrompida. */
export function continuar(sessao) {
  if (sessao.status !== 'aguardando-contexto') return;
  sessao.status = 'ativa';
  processar(sessao, sessao.pendentes || []);
}

export function definirExterna(sessao, chave, valor) {
  sessao.contexto.externas[chave] = valor;
}

/** Retorno da IA (18), do áudio (20) ou da automação (22): troca o estado e volta a rodar. */
export function responderCallback(sessao, { ok = true, status, texto = '' } = {}) {
  if (sessao.status !== 'aguardando' || !sessao.pausa) return;
  const p = sessao.pausa;
  if (p.tipo === '18') {
    sessao.extra.assistant_id = p.assistente;
    sessao.extra.assistant_analysis_status = status || (ok ? 'success' : 'error');
    sessao.extra.assistant_analysis_text = texto;
  }
  if (p.tipo === '22') { sessao.extra.automate_status = ok ? 'success' : 'error'; sessao.extra.automate_message = texto; }
  const destino = ok ? p.callback : (p.fallback || p.callback);
  sessao.pausa = null;
  sessao.status = 'ativa';
  sistema(sessao, `Callback ${ok ? 'com sucesso' : 'com falha'}: ${destino ? `vai para o estado ${destino}` : 'sem estado de destino configurado'}.`);
  if (destino) {
    sessao.estado = String(destino);
    sessao.caminho.push(String(destino));
    sessao.visitas[destino] = (sessao.visitas[destino] || 0) + 1;
    verificarParada(sessao);
  }
  processar(sessao, []);
}

/** Timeout do bot (o job deliveryChatConversation.php): aplica TIMEOUT_ACTION. */
export function simularTimeout(sessao) {
  if (sessao.status === 'encerrada') return;
  const { TIMEOUT_ACTION: acao, TIMEOUT_DESTINY: destino, TIMEOUT_MESSAGE: msg } = sessao.bot;
  if (acao === 'queue') { sistema(sessao, `Timeout: transferido para a fila ${destino}. Fim do bot nesta conversa.`); sessao.status = 'encerrada'; }
  else if (acao === 'close') { if (msg) saida(sessao, 'texto', { texto: msg }); sistema(sessao, `Timeout: atendimento finalizado (status CRM ${destino || '—'}).`); sessao.status = 'encerrada'; }
  else if (acao === 'bot') {
    sessao.estado = String(destino);
    sessao.caminho.push(String(destino));
    sessao.visitas[destino] = (sessao.visitas[destino] || 0) + 1;
    if (sessao.status === 'aguardando' || sessao.status === 'aguardando-contexto') {
      sessao.status = 'ativa';
      sessao.pausa = null;
      sessao.requisitos = [];
      sessao.pendentes = null;
    }
    sistema(sessao, `Timeout: o bot vai para o estado ${destino}.`);
    verificarParada(sessao);
    processar(sessao, []);
  } else sistema(sessao, 'Este bot não tem ação de timeout configurada.', 'aviso');
}

/** O que o bot depende de fora do simulador (para a aba Contexto). */
export function requisitosDeContexto(bot) {
  const out = new Map();
  const add = (chave, rotulo, tipo = 'bool') => { if (!out.has(chave)) out.set(chave, { chave, rotulo, tipo }); };
  (bot.BOT_CONDITIONS || []).forEach((c) => {
    const tipo = String(c.CONDITION_TYPE ?? '0');
    switch (c.CONDITION_DATA?.variable) {
      case 'calendario': case 'calendario_falso': add(`calendario:${tipo}`, `Calendário ${tipo}: dentro do período agora?`); break;
      case 'agent_on_queue': add(`agent_on_queue:${tipo}`, `Fila ${tipo}: há agente disponível?`); break;
      case 'agent_online': add(`agent_online:${tipo}`, `Agente ${tipo}: está logado?`); break;
      case 'agent_available_on_chat': add(`agent_available_on_chat:${tipo}`, `Agente ${tipo}: disponível no chat?`); break;
      case 'opt_in': add('opt_in', 'O contato tem Opt-in?'); break;
      case 'uci': add('uci', 'O contato tem UCI?'); break;
      case 'status_last_att': add('status_last_att', 'ID do status do último atendimento', 'texto'); break;
      case 'entrance_type': add('entrance_type', 'Tipo da entrada (1 WhatsApp, 6 Webchat...)', 'texto'); break;
      case 'entrance': add('entrance', 'ID da entrada', 'texto'); break;
      case 'sender': add('sender', 'Remetente (número ou e-mail)', 'texto'); break;
      case 'contact_number': add('contact_number', 'Número do contato', 'texto'); break;
      default:
    }
  });
  (bot.BOT_CONDITIONS || []).forEach((c) => {
    const v = c.CONDITION_DATA?.variable;
    const tipo = String(c.CONDITION_TYPE ?? '0');
    const textual = ['message', 'contact'].includes(v) || !(v in VARIABLE_KIND_TODAS);
    if (['old_attendance', 'agent_last_att', 'pref_agent', 'name_pref_agent'].includes(v) || (textual && !OPERADORES_SIMULADOS.has(tipo) && !NIVEL_MENSAGEM.has(tipo) && !v?.startsWith('assistant_analysis'))) {
      add(`condicao:${c.ID}`, `${descreverCondicao(c)} é verdadeira?`);
    }
  });
  (bot.BOT_ACTIONS || []).forEach((a) => { if (String(a.ACTION_TYPE) === '7' && a.ACTION_DATA?.script_name) add(`script:${a.ACTION_DATA.script_name}`, `Retorno (JSON) do script ${a.ACTION_DATA.script_name}`, 'json'); });
  return [...out.values()];
}

/** Estados citados por ações (para a tela destacar ligações). */
export function destinosDoEstado(bot, numero) {
  const ids = new Set((bot.BOT_TRANSITIONS || []).filter((t) => String(t.STATE) === String(numero)).map((t) => t.ID));
  const alvos = new Set();
  (bot.BOT_ACTIONS || []).filter((a) => ids.has(a.TRANSITION_ID)).forEach((a) => {
    (CAMPOS_ESTADO_POR_TIPO[a.ACTION_TYPE] || []).forEach((campo) => { const v = a.ACTION_DATA?.[campo]; if (v !== undefined && v !== '' && /^\d+$/.test(String(v))) alvos.add(String(v)); });
  });
  return [...alvos];
}

// Variáveis com valor próprio do motor (trocarVariaveis) e variáveis de condição com tratamento próprio.
const VARIAVEIS_DO_MOTOR = new Set([
  'name_pref_agent', 'pref_agent', 'sys_conversation', 'sys_attendance', 'sys_protocol', 'sys_agent', 'sender', 'source',
  'contact_number', 'contact', 'contact_name', 'contact_first_name', 'contact_last_name', 'contact_observations',
  'email_subject', 'uci', 'old_attendance', 'entrance_type', 'entrance', 'message_escaped', 'message', 'error_count',
]);

/**
 * Variáveis guardadas que o bot usa ({$x} nos textos e variáveis de condição que não são do motor):
 * é o que o cliente já teria acumulado ao chegar a um estado do meio do fluxo.
 */
export function variaveisUsadas(bot) {
  const nomes = new Set();
  const procurar = (v) => {
    if (typeof v === 'string') [...v.matchAll(/\{\$([a-zA-Z_0-9]+)\}/g)].forEach((m) => nomes.add(m[1]));
    else if (v && typeof v === 'object') Object.values(v).forEach(procurar);
  };
  (bot.BOT_ACTIONS || []).forEach((a) => procurar(a.ACTION_DATA));
  (bot.BOT_CONDITIONS || []).forEach((c) => {
    procurar(c.CONDITION_DATA?.value);
    const v = c.CONDITION_DATA?.variable;
    const daAutomacao = String(v).startsWith('automate_'); // automate_status/message/thread_id ficam em extra_data
    if (v && (!(v in VARIABLE_KIND) || daAutomacao) && !String(v).startsWith('assistant_analysis') && !VARIAVEIS_DO_MOTOR.has(v)) nomes.add(v);
  });
  return [...nomes].filter((n) => !VARIAVEIS_DO_MOTOR.has(n.toLowerCase())).sort();
}
