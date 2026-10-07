// Simulador do motor de bots (js/simulador.js): regras copiadas de Bot.class.php.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botsDeExemplo, js } from './apoio.mjs';

const S = await js('simulador.js');
const { criarSessao, enviarMensagem, continuar, definirExterna, responderCallback, simularTimeout, requisitosDeContexto, LIMITE_RODADAS } = S;

// ---- construtor de bots de teste
let seq = 100;
function bot({ estados = ['0'], transicoes = [], timeout = {} } = {}) {
  const b = { BOT_STATES: estados.map((n, i) => ({ ID: String(i + 1), STATE_NUMBER: String(n), ALIAS: `E${n}` })), BOT_TRANSITIONS: [], BOT_CONDITIONS: [], BOT_ACTIONS: [], ...timeout };
  transicoes.forEach(([estado, prioridade, condicoes = [], acoes = []]) => {
    const tid = String(++seq);
    b.BOT_TRANSITIONS.push({ ID: tid, STATE: String(estado), PRIORITY: String(prioridade) });
    condicoes.forEach((c) => b.BOT_CONDITIONS.push({ ID: String(++seq), TRANSITION_ID: tid, CONDITION_TYPE: String(c[1]), CONDITION_DATA: { variable: c[0], value: c[2] ?? '', ...(c[3] || {}) } }));
    acoes.forEach((a) => b.BOT_ACTIONS.push({ ID: String(++seq), TRANSITION_ID: tid, ACTION_TYPE: String(a[0]), ACTION_DATA: a[1] || {} }));
  });
  return b;
}
const msg = (texto) => ['1', { message_text: texto }];
const troca = (n) => ['2', { destiny: String(n) }];
const textos = (sessao) => sessao.eventos.filter((e) => e.tipo === 'bot' && e.subtipo === 'texto').map((e) => e.texto);
const diz = (sessao, t) => { enviarMensagem(sessao, t); return textos(sessao); };

test('a primeira transição por prioridade cuja condição passa dispara (só uma)', () => {
  const b = bot({ transicoes: [
    ['0', 2, [['message', 1, 'oi']], [msg('B')]],
    ['0', 1, [['message', 1, 'oi']], [msg('A')]],
  ] });
  assert.deepEqual(diz(criarSessao(b), 'oi'), ['A']);
});

test('todas as condições precisam passar (AND) e o trace mostra onde falhou', () => {
  const b = bot({ transicoes: [['0', 1, [['message', 2, 'oi'], ['message', 2, 'zzz']], [msg('X')]]] });
  const s = criarSessao(b);
  assert.deepEqual(diz(s, 'oi'), []);
  const t = s.rodadas[0].tentativas[0];
  assert.equal(t.condicoes[0].resultado, true);
  assert.equal(t.condicoes[1].resultado, false);
  assert.equal(s.rodadas[0].disparada, null);
});

test('IGUAL A diferencia maiúsculas, compara por linha e usa == frouxo (01 == 1)', () => {
  const b = bot({ transicoes: [['0', 1, [['message', 1, 'Sim\nclaro\n7']], [msg('ok')]]] });
  assert.deepEqual(diz(criarSessao(b), 'sim'), []);
  assert.deepEqual(diz(criarSessao(b), 'claro'), ['ok']);
  assert.deepEqual(diz(criarSessao(b), '007'), ['ok'], '"007" == "7" no PHP');
  assert.deepEqual(diz(criarSessao(b), 'Sim'), ['ok']);
});

test('CONTÉM ignora maiúsculas só em ASCII; valor vazio sempre casa', () => {
  const b = bot({ transicoes: [['0', 1, [['message', 2, 'horario']], [msg('ok')]]] });
  assert.deepEqual(diz(criarSessao(b), 'qual o HORARIO?'), ['ok']);
  const acento = bot({ transicoes: [['0', 1, [['message', 2, 'OLÁ']], [msg('ok')]]] });
  assert.deepEqual(diz(criarSessao(acento), 'olá'), [], 'strtoupper do PHP 5.6 não maiusculiza "á"');
  const vazio = bot({ transicoes: [['0', 1, [['message', 2, '']], [msg('ok')]]] });
  assert.deepEqual(diz(criarSessao(vazio), 'qualquer coisa'), ['ok']);
});

test('"Diferente de" e "Não contém" nunca casam (bug do motor) e o trace avisa', () => {
  const b = bot({ transicoes: [['0', 1, [['message', 3, 'abc']], [msg('ok')]], ['0', 2, [['message', 4, 'abc']], [msg('ok2')]]] });
  const s = criarSessao(b);
  assert.deepEqual(diz(s, 'xyz'), []);
  assert.match(s.rodadas[0].avisos.join(' '), /nunca são verdadeiros/);
});

test('a mensagem chega escapada: "&" no valor não casa com "&" digitado (htmlspecialchars)', () => {
  const b = bot({ transicoes: [['0', 1, [['message', 1, 'a&b']], [msg('ok')]]] });
  assert.deepEqual(diz(criarSessao(b), 'a&b'), []);
});

test('nenhuma transição casa: nada acontece e a mensagem é consumida', () => {
  const b = bot({ estados: ['0', '1'], transicoes: [['0', 1, [['message', 1, 'oi']], [msg('A'), troca(1)]], ['1', 1, [['message', 1, 'tchau']], [msg('B')]]] });
  const s = criarSessao(b);
  assert.deepEqual(diz(s, 'oi'), ['A']);
  assert.equal(s.estado, '1');
  assert.deepEqual(diz(s, 'oi'), ['A'], 'no estado 1 "oi" não casa e nada novo é enviado');
  assert.deepEqual(diz(s, 'tchau'), ['A', 'B']);
});

test('troca de estado vale na rodada seguinte e transição sem condição encadeia sozinha', () => {
  const b = bot({ estados: ['0', '1', '2'], transicoes: [
    ['0', 1, [['message', 2, 'oi']], [msg('E0'), troca(1)]],
    ['1', 1, [], [msg('E1'), troca(2)]],
    ['2', 1, [['message', 1, 'x']], [msg('E2')]],
  ] });
  const s = criarSessao(b);
  assert.deepEqual(diz(s, 'oi'), ['E0', 'E1']);
  assert.equal(s.estado, '2', 'parou no estado que espera mensagem');
  assert.deepEqual(s.rodadas.map((r) => r.estado), ['0', '1', '2']);
  assert.deepEqual(s.caminho, ['0', '1', '2']);
});

test('estado 2 só vê a mensagem do cliente se ela chegar depois (o lote é consumido uma vez)', () => {
  const b = bot({ estados: ['0', '1'], transicoes: [['0', 1, [['message', 1, 'oi']], [troca(1)]], ['1', 1, [['message', 1, 'oi']], [msg('E1')]]] });
  const s = criarSessao(b);
  assert.deepEqual(diz(s, 'oi'), [], 'o "oi" já foi consumido no estado 0');
  assert.deepEqual(diz(s, 'oi'), ['E1']);
});

test('ciclo sem condição de mensagem para no limite com aviso', () => {
  const b = bot({ transicoes: [['0', 1, [], [msg('de novo')]]] });
  const s = criarSessao(b);
  enviarMensagem(s, 'oi');
  assert.equal(textos(s).length, LIMITE_RODADAS);
  assert.ok(s.eventos.some((e) => e.nivel === 'erro' && /a cada segundo/.test(e.texto)));
});

test('contador de erros: ação 8 soma, condição error_count compara', () => {
  const b = bot({ estados: ['0', '1'], transicoes: [
    ['0', 1, [['message', 1, 'ok']], [msg('certo'), troca(1)]],
    ['0', 2, [['error_count', 7, '2']], [msg('desisto')]],
    ['0', 3, [], [msg('errou'), ['8', { error_count: 'add' }]]],
  ] });
  const s = criarSessao(b);
  // sem condição de mensagem, a última transição repete até a segunda condição passar
  enviarMensagem(s, 'x');
  assert.equal(s.erros >= 2, true);
  assert.ok(textos(s).includes('desisto'));
});

test('variáveis {$x}: contato, mensagem escapada e armazenadas pela ação 13', () => {
  const b = bot({ estados: ['0', '1'], transicoes: [
    ['0', 1, [['message', 2, '']], [['13', { bot_variables_text: '{"nome":"{$message_escaped}"}' }], msg('Oi {$contact_first_name}, você disse {$nome}'), troca(1)]],
  ] });
  const s = criarSessao(b, { contato: { nome: 'Maria Silva' } });
  assert.deepEqual(diz(s, 'a"b'), ['Oi Maria, você disse a"b']);
});

test('condição de variável guardada (extra_data) usa os mesmos operadores', () => {
  const b = bot({ estados: ['0', '1', '2'], transicoes: [
    ['0', 1, [['message', 1, 'oi']], [['13', { bot_variables_text: '{"plano":"gold"}' }], troca(1)]],
    ['1', 1, [['plano', 1, 'gold']], [msg('é gold'), troca(2)]],
  ] });
  const s = criarSessao(b);
  assert.deepEqual(diz(s, 'oi'), ['é gold']);
});

test('clique em botão do menu: o motor recebe o ID (não o título)', () => {
  const menu = JSON.stringify({ interactive: { type: 'button', body: { text: 'Escolha' }, action: { buttons: [{ type: 'reply', reply: { id: 'btn_fin', title: 'Financeiro' } }] } } });
  const b = bot({ estados: ['0', '1'], transicoes: [
    ['0', 1, [['message', 1, 'oi']], [['10', { message_option_text: menu }], troca(1)]],
    ['1', 1, [['message', 1, 'btn_fin']], [msg('financeiro')]],
  ] });
  const s = criarSessao(b);
  enviarMensagem(s, 'oi');
  const m = s.eventos.find((e) => e.subtipo === 'menu');
  assert.equal(m.itens[0].id, 'btn_fin');
  assert.equal(m.itens[0].title, 'Financeiro');
  assert.deepEqual(diz(s, m.itens[0].id), ['financeiro']);
});

test('dados que o simulador não tem pausam a sessão em vez de virar "falso"; ao informar, continua', () => {
  const b = bot({ estados: ['0', '1'], transicoes: [['0', 1, [['calendario', 227, '']], [msg('aberto'), troca(1)]], ['0', 2, [], [msg('fechado'), troca(1)]]] });
  const s = criarSessao(b);
  enviarMensagem(s, 'oi');
  assert.equal(s.status, 'aguardando-contexto');
  assert.deepEqual(textos(s), []);
  assert.match(s.requisitos[0].rotulo, /Calendário 227/);
  definirExterna(s, 'calendario:227', 'sim');
  continuar(s);
  assert.deepEqual(textos(s), ['aberto']);
  assert.equal(s.status, 'ativa');
  // fora do período: cai na transição seguinte
  const s2 = criarSessao(b, { externas: { 'calendario:227': 'nao' } });
  assert.deepEqual(diz(s2, 'oi'), ['fechado']);
});

test('operador de contato que o simulador não reproduz (ex.: é VIP) pede a resposta e ela persiste', () => {
  const b = bot({ estados: ['0', '1'], transicoes: [['0', 1, [['contact', 10, '']], [msg('vip'), troca(1)]]] });
  const s = criarSessao(b);
  enviarMensagem(s, 'x');
  assert.equal(s.status, 'aguardando-contexto');
  assert.ok(requisitosDeContexto(b).some((r) => r.chave.startsWith('condicao:')), 'aparece na aba Contexto');
  definirExterna(s, s.requisitos[0].chave, 'sim');
  continuar(s);
  assert.deepEqual(textos(s), ['vip']);
});

test('operador por mensagem (é áudio): sem mensagem nova é falso e a resposta vale só para a rodada', () => {
  const b = bot({ estados: ['0', '1'], transicoes: [
    ['0', 1, [['message', 23, '']], [msg('áudio'), troca(1)]],
    ['0', 2, [['message', 2, '']], [msg('texto')]],
    ['1', 1, [['message', 23, '']], [msg('áudio no 1')]],
    ['1', 2, [['message', 2, '']], [msg('texto no 1')]],
  ] });
  const s = criarSessao(b);
  enviarMensagem(s, 'a');
  assert.equal(s.status, 'aguardando-contexto');
  assert.match(s.requisitos[0].chave, /:r1$/);
  definirExterna(s, s.requisitos[0].chave, 'sim');
  continuar(s);
  assert.deepEqual(textos(s), ['áudio']);
  assert.equal(s.status, 'ativa', 'a rodada automática (sem mensagem) não pergunta de novo: é falsa');
  enviarMensagem(s, 'texto normal');
  assert.equal(s.status, 'aguardando-contexto', 'a resposta anterior não vale para a mensagem nova');
  assert.doesNotMatch(s.requisitos[0].chave, /:r1$/, 'pergunta de novo, com chave de outra rodada');
  definirExterna(s, s.requisitos[0].chave, 'nao');
  continuar(s);
  assert.deepEqual(textos(s), ['áudio', 'texto no 1']);
  assert.ok(!requisitosDeContexto(b).some((r) => /:r\d+$/.test(r.chave)), 'não vira seleção fixa na aba Contexto');
});

test('condição de tipo 0 não é salva pelo servidor: no teste a transição vale sempre', () => {
  const b = bot({ estados: ['0', '1'], transicoes: [['0', 1, [['error_count', 0, '3']], [msg('sempre'), troca(1)]]] });
  const s = criarSessao(b);
  assert.deepEqual(diz(s, 'qualquer'), ['sempre']);
  const semTipo = bot({ estados: ['0', '1'], transicoes: [['0', 1, [['calendario', '', '']], [msg('sem pausa'), troca(1)]]] });
  const s2 = criarSessao(semTipo);
  assert.deepEqual(diz(s2, 'oi'), ['sem pausa']);
  assert.equal(s2.status, 'ativa', 'não pergunta pelo calendário "" (a condição nem seria gravada)');
});

test('a ordem das ações no teste é a do payload do salvar, também depois de mover uma ação', async () => {
  const { moverAcao } = await js('bot-view-interactions.js');
  const { toUpdateBotPayload } = await js('orpen-adapter.js');
  const b = bot({ estados: ['0', '1'], transicoes: [['0', 1, [['message', 2, '']], [msg('A'), msg('B'), msg('C'), troca(1)]]] });
  const tid = b.BOT_TRANSITIONS[0].ID;
  const idB = b.BOT_ACTIONS.find((a) => a.ACTION_DATA.message_text === 'B').ID;
  moverAcao(b, tid, idB, 1); // B desce: A, C, B
  const noPayload = Object.values(Object.values(toUpdateBotPayload(b).states)[0].transitions)[0].actions;
  const ordemPayload = Object.values(noPayload).filter((a) => a.type === 1).map((a) => a.data.message_text);
  assert.deepEqual(ordemPayload, ['A', 'C', 'B']);
  assert.deepEqual(diz(criarSessao(b), 'oi'), ordemPayload);
});

test('ação 18 (OpenAI) pausa até o callback; sucesso vai ao callback_state', () => {
  const b = bot({ estados: ['0', '1', '2'], transicoes: [
    ['0', 1, [['message', 2, '']], [['18', { openai: 'call_assistant', assistant_id: 'asst_1', callback_state: '1' }]]],
    ['1', 1, [['assistant_analysis_status', 1, 'success', { assistant_id: 'asst_1' }]], [msg('IA ok'), troca(2)]],
  ] });
  const s = criarSessao(b);
  enviarMensagem(s, 'oi');
  assert.equal(s.status, 'aguardando');
  enviarMensagem(s, 'outra');
  assert.ok(s.eventos.some((e) => e.nivel === 'aviso'), 'cliente não é lido enquanto espera o callback');
  responderCallback(s, { ok: true });
  assert.deepEqual(s.caminho, ['0', '1', '2'], 'foi ao callback_state (1) e a transição de lá seguiu para o 2');
  assert.deepEqual(textos(s), ['IA ok']);
});

test('transferência e finalização encerram a sessão (as ações seguintes da transição ainda rodam)', () => {
  const b = bot({ transicoes: [['0', 1, [['message', 2, '']], [['5', { destiny: 'Fila X' }], msg('te transferi')]]] });
  const s = criarSessao(b);
  assert.deepEqual(diz(s, 'oi'), ['te transferi']);
  assert.equal(s.status, 'encerrada');
});

test('timeout do bot: ação "bot" troca de estado; "queue" e "close" encerram', () => {
  const b = bot({ estados: ['0', '3'], transicoes: [['3', 1, [], [msg('timeout!'), ['8', { error_count: 'reset' }]]]], timeout: { TIMEOUT_ACTION: 'bot', TIMEOUT_DESTINY: '3' } });
  const s = criarSessao(b);
  simularTimeout(s);
  assert.equal(s.estado, '3');
  assert.ok(textos(s).includes('timeout!'));
  const fila = criarSessao(bot({ timeout: { TIMEOUT_ACTION: 'queue', TIMEOUT_DESTINY: 'Fila' } }));
  simularTimeout(fila);
  assert.equal(fila.status, 'encerrada');
});

test('o bot original nunca é alterado pelo teste', () => {
  const b = bot({ estados: ['0', '1'], transicoes: [['0', 1, [['message', 2, '']], [msg('A'), troca(1), ['8', { error_count: 'add' }]]]] });
  const antes = JSON.stringify(b);
  const s = criarSessao(b);
  enviarMensagem(s, 'oi');
  assert.equal(JSON.stringify(b), antes);
});

test('estado 0 inexistente ou destino inexistente avisa em vez de falhar em silêncio', () => {
  const sem0 = criarSessao(bot({ estados: ['1'] }));
  assert.equal(sem0.status, 'encerrada');
  const b = bot({ estados: ['0'], transicoes: [['0', 1, [['message', 2, '']], [troca(9)]]] });
  const s = criarSessao(b);
  enviarMensagem(s, 'oi');
  assert.ok(s.eventos.some((e) => /não existe/.test(e.texto)));
});

test('bots de exemplo: rodam uma conversa sem lançar erro', () => {
  const exemplos = botsDeExemplo();
  assert.ok(exemplos.length > 0);
  let totalRodadas = 0;
  for (const { nome, bot: b } of exemplos) {
    const s = criarSessao(b);
    ['oi', '1', '2', 'sim', 'x'].forEach((t) => {
      // pausas por falta de contexto são esperadas: preenche como "sim" e segue
      enviarMensagem(s, t);
      for (let i = 0; i < 40 && s.status === 'aguardando-contexto'; i++) {
        s.requisitos.forEach((r) => definirExterna(s, r.chave, r.tipo === 'bool' ? 'sim' : '1'));
        continuar(s);
      }
      if (s.status === 'aguardando') responderCallback(s, { ok: true });
    });
    // erros do simulador só podem ser os avisos esperados de bot com defeito (estado inexistente, ciclo)
    s.eventos.filter((e) => e.nivel === 'erro').forEach((e) => assert.match(e.texto, /não existe|a cada segundo|estado 0/, `${nome}: ${e.texto}`));
    totalRodadas += s.rodadas.length;
  }
  assert.ok(totalRodadas > 0, 'pelo menos uma rodada rodou nos bots de exemplo');
});

test('os três formatos de menu aparecem com os itens certos (botões e lista do WhatsApp, WebChat)', () => {
  const botoes = JSON.stringify({ interactive: { type: 'button', body: { text: 'Escolha' }, action: { buttons: [{ type: 'reply', reply: { id: 'b1', title: 'Um' } }, { type: 'reply', reply: { id: 'b2', title: 'Dois' } }] } } });
  const lista = JSON.stringify({ interactive: { type: 'list', header: { type: 'text', text: 'Cab' }, body: { text: 'Corpo' }, footer: { text: 'Rodapé' }, action: { button: 'Ver opções', sections: [{ title: 'Sec', rows: [{ id: 'l1', title: 'Linha 1', description: 'desc' }, { id: 'l2', title: 'Linha 2' }] }] } } });
  const webchat = JSON.stringify({ message_type: 'menu', menu_type: 'list', text: 'Menu web', options: [{ text: 'Opção A', value: 'a' }, { text: 'Opção B', value: 'b' }] });
  const menus = { botoes, lista, webchat };
  for (const [nome, json] of Object.entries(menus)) {
    const b = bot({ estados: ['0', '1'], transicoes: [['0', 1, [['message', 2, '']], [['10', { message_option_text: json }], troca(1)]]] });
    const s = criarSessao(b);
    enviarMensagem(s, 'oi');
    const m = s.eventos.find((e) => e.subtipo === 'menu');
    assert.ok(m, `${nome}: gerou um menu`);
    assert.notEqual(m.modelo.kind, 'unknown', `${nome}: formato reconhecido`);
    assert.equal(m.itens.length, 2, `${nome}: dois itens`);
    assert.ok(m.itens.every((i) => i.title), `${nome}: todos com título`);
  }
  const l = criarSessao(bot({ estados: ['0', '1'], transicoes: [['0', 1, [['message', 2, '']], [['10', { message_option_text: lista }], troca(1)]]] }));
  enviarMensagem(l, 'oi');
  const ml = l.eventos.find((e) => e.subtipo === 'menu');
  assert.deepEqual(ml.itens.map((i) => i.id), ['l1', 'l2']);
  assert.equal(ml.modelo.button, 'Ver opções');
  const w = criarSessao(bot({ estados: ['0', '1'], transicoes: [['0', 1, [['message', 2, '']], [['10', { message_option_text: webchat }], troca(1)]]] }));
  enviarMensagem(w, 'oi');
  const mw = w.eventos.find((e) => e.subtipo === 'menu');
  assert.deepEqual(mw.itens.map((i) => i.id), ['a', 'b'], 'o ID do item de WebChat é o value');
});

// ---- divergências apontadas na revisão (conferidas em Bot.class.php, PHP 5.6) ----

test('CONTÉM com linha vazia no valor não casa tudo (strpos com agulha vazia é falso)', () => {
  const b = bot({ transicoes: [['0', 1, [['message', 2, 'oi\n']], [msg('ok')]]] });
  assert.deepEqual(diz(criarSessao(b), 'xyz'), []);
  assert.deepEqual(diz(criarSessao(b), 'oi gente'), ['ok']);
  const meio = bot({ transicoes: [['0', 1, [['message', 2, 'oi\n\ntchau']], [msg('ok')]]] });
  assert.deepEqual(diz(criarSessao(meio), 'xyz'), []);
  assert.deepEqual(diz(criarSessao(meio), 'tchau!'), ['ok']);
});

test('a mensagem "0" é falsa no PHP e vira NULL: não casa com IGUAL A "0", mas 1-9 comparam como número', () => {
  const igual = bot({ transicoes: [['0', 1, [['message', 1, '0']], [msg('voltar')]]] });
  assert.deepEqual(diz(criarSessao(igual), '0'), []);
  const contem = bot({ transicoes: [['0', 1, [['message', 2, '0']], [msg('ok')]]] });
  assert.deepEqual(diz(criarSessao(contem), '10'), ['ok'], 'outros textos com 0 continuam casando');
  assert.deepEqual(diz(criarSessao(contem), '0'), []);
  const numero = bot({ transicoes: [['0', 1, [['message', 11, '']], [msg('é número')]]] });
  assert.deepEqual(diz(criarSessao(numero), '0'), []);
  assert.deepEqual(diz(criarSessao(numero), '5'), ['é número']);
});

test('numérico do PHP 5.6: espaço no fim não conta ("1 " != "1")', () => {
  const b = bot({ transicoes: [['0', 1, [['message', 1, '1 ']], [msg('ok')]]] });
  assert.deepEqual(diz(criarSessao(b), '1'), []);
  assert.deepEqual(diz(criarSessao(b), '1 '), ['ok'], 'igual como texto');
});

test('CPF: a lista de nulos do motor (12345678909) é recusada; CPF válido passa', () => {
  const b = bot({ transicoes: [['0', 1, [['message', 5, '']], [msg('cpf ok')]]] });
  assert.deepEqual(diz(criarSessao(b), '123.456.789-09'), []);
  assert.deepEqual(diz(criarSessao(b), '529.982.247-25'), ['cpf ok']);
});

test('CNPJ: aceita alfanumérico e não recusa dígitos repetidos, como o motor', () => {
  const b = bot({ transicoes: [['0', 1, [['message', 13, '']], [msg('cnpj ok')]]] });
  assert.deepEqual(diz(criarSessao(b), '00.000.000/0000-00'), ['cnpj ok']);
  assert.deepEqual(diz(criarSessao(b), '12.345.678/0001-95'), ['cnpj ok']);
  assert.deepEqual(diz(criarSessao(b), '12.345.678/0001-96'), []);
});

test('{$message_escaped} numa rodada automática (sem mensagem) é vazio, como no motor', () => {
  const b = bot({ estados: ['0', '1', '2'], transicoes: [
    ['0', 1, [['message', 2, '']], [troca(1)]],
    ['1', 1, [], [['13', { bot_variables_text: '{"x":"[{$message_escaped}]"}' }], troca(2)]],
    ['2', 1, [['x', 1, '[]']], [msg('x vazio'), troca(0)]],
  ] });
  assert.deepEqual(diz(criarSessao(b), 'oi'), ['x vazio']);
});

test('{$error_count} lê o contador depois que a condição error_count foi avaliada', () => {
  const b = bot({ estados: ['0', '1'], transicoes: [
    ['0', 1, [['message', 1, 'a']], [['8', { error_count: 'add' }], ['8', { error_count: 'add' }], troca(1)]],
    ['1', 1, [['error_count', 1, '2']], [msg('tentativa {$error_count}'), troca(0)]],
  ] });
  assert.deepEqual(diz(criarSessao(b), 'a'), ['tentativa 2']);
});

test('remetente: IGUAL A diferencia maiúsculas, o valor tem trim, tipo desconhecido é falso e não troca variáveis', () => {
  const ext = (v) => ({ externas: { sender: v } });
  const igual = bot({ estados: ['0', '1'], transicoes: [['0', 1, [['sender', 1, '  Joao@X.com \n']], [msg('ok'), troca(1)]]] });
  assert.deepEqual(diz(criarSessao(igual, ext('Joao@X.com')), 'x'), ['ok']);
  assert.deepEqual(diz(criarSessao(igual, ext('joao@x.com')), 'x'), []);
  const contem = bot({ estados: ['0', '1'], transicoes: [['0', 1, [['sender', 2, '@x.com\n']], [msg('ok'), troca(1)]]] });
  assert.deepEqual(diz(criarSessao(contem, ext('ANA@X.COM')), 'x'), ['ok']);
  assert.deepEqual(diz(criarSessao(contem, ext('ana@y.com')), 'x'), []);
  const outro = bot({ estados: ['0', '1'], transicoes: [['0', 1, [['sender', 5, 'x']], [msg('ok'), troca(1)]]] });
  assert.deepEqual(diz(criarSessao(outro, ext('x')), 'x'), []);
});

test('Timeout com a sessão esperando um dado do contexto não deixa a tela sem requisito', () => {
  const b = bot({ estados: ['0', '3'], transicoes: [
    ['0', 1, [['calendario', 227, '']], [msg('aberto')]],
    ['3', 1, [['message', 1, 'x']], [msg('no 3')]],
  ], timeout: { TIMEOUT_ACTION: 'bot', TIMEOUT_DESTINY: '3' } });
  const s = criarSessao(b);
  enviarMensagem(s, 'oi');
  assert.equal(s.status, 'aguardando-contexto');
  simularTimeout(s);
  assert.equal(s.status, 'ativa');
  assert.equal(s.estado, '3');
  assert.deepEqual(s.requisitos, []);
  assert.deepEqual(diz(s, 'x'), ['no 3']);
});
