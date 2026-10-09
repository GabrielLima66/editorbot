// Análise estática do bot (js/analise-bot.js): um caso positivo e um negativo por regra.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botsDeExemplo, botSintetico as bot, js } from './apoio.mjs';

const { analisarBot } = await js('analise-bot.js');

const msg = (texto) => ['1', { message_text: texto }];
const troca = (n) => ['2', { destiny: String(n) }];
const fila = ['5', { destiny: '1' }];
const encerrar = ['6', { crm_status: '1' }];
const quando = (valor, tipo = 1) => ['message', tipo, valor];

const botoes = (...itens) => ['10', { message_option_text: JSON.stringify({ interactive: { type: 'button', body: { text: 'Escolha' }, action: { buttons: itens.map(([id, title]) => ({ type: 'reply', reply: { id, title } })) } } }) }];
const lista = (...itens) => ['10', { message_option_text: JSON.stringify({ interactive: { type: 'list', body: { text: 'Escolha' }, action: { button: 'Ver', sections: [{ title: '', rows: itens.map(([id, title]) => ({ id, title })) }] } } }) }];
const webchat = (...itens) => ['10', { message_option_text: JSON.stringify({ message_type: 'menu', menu_type: 'list', options: itens.map(([value, text]) => ({ text, value })) }) }];

const achados = (b, regra) => analisarBot(b).achados.filter((a) => a.regra === regra);
const regras = (b) => analisarBot(b).achados.map((a) => a.regra);

// Fluxo saudável de referência: menu com tratamento completo e saída.
function saudavel() {
  return bot({ estados: ['0', '1'], transicoes: [
    ['0', 1, [], [botoes(['vendas', 'Vendas'], ['suporte', 'Suporte']), troca(1)]],
    ['1', 1, [quando('vendas')], [fila]],
    ['1', 2, [quando('suporte')], [fila]],
    ['1', 3, [quando('', 2)], [msg('Não entendi'), botoes(['vendas', 'Vendas'], ['suporte', 'Suporte'])]],
  ] });
}

test('um bot saudável não tem erros nem avisos', () => {
  const { resumo, achados: todos } = analisarBot(saudavel());
  assert.deepEqual(todos.filter((a) => a.severidade !== 'info'), [], JSON.stringify(todos));
  assert.equal(resumo.erro + resumo.aviso, 0);
});

test('entrada vazia ou sem tabelas não quebra', () => {
  assert.deepEqual(analisarBot({}).achados.map((a) => a.regra), []);
  assert.equal(analisarBot(null).resumo.total, 0);
});

// ------------------------------------------------------------------ estrutura

test('E01: Troca Estado para estado que não existe, e destino vazio', () => {
  const b = bot({ transicoes: [['0', 1, [quando('a')], [troca(99)]], ['0', 2, [quando('b')], [['2', { destiny: '' }]]]] });
  const e = achados(b, 'E01');
  assert.equal(e.length, 2);
  assert.ok(e.every((a) => a.severidade === 'erro'));
  assert.match(e[0].titulo + e[1].titulo, /99/);
});

test('E01: destino do timeout inexistente; ação 18 ignora fallback_state', () => {
  const t = bot({ estados: ['0'], timeout: { TIMEOUT_ACTION: 'bot', TIMEOUT_DESTINY: '50' }, transicoes: [['0', 1, [quando('a')], [fila]]] });
  assert.equal(achados(t, 'E01').length, 1);
  const ia = bot({ estados: ['0', '1'], transicoes: [
    ['0', 1, [], [['18', { callback_state: '1', fallback_state: '77' }]]],
    ['1', 1, [quando('x')], [fila]],
  ] });
  assert.equal(achados(ia, 'E01').length, 0, 'fallback_state da ação 18 não é lido pelo motor');
});

test('E01: callback_state e fallback_state (20/22) inexistentes', () => {
  const b = bot({ estados: ['0'], transicoes: [['0', 1, [], [['22', { callback_state: '8', fallback_state: '9' }]]]] });
  assert.equal(achados(b, 'E01').length, 2);
});

test('E02: estado alcançado sem transições; estado solto vira só E04', () => {
  const b = bot({ estados: ['0', '1', '2'], transicoes: [['0', 1, [quando('a')], [troca(1)]]] });
  const e02 = achados(b, 'E02');
  assert.deepEqual(e02.map((a) => a.estadoNumero), ['1']);
  assert.deepEqual(achados(b, 'E04').map((a) => a.estadoNumero), ['2']);
});

test('E03: trecho sem transferência nem encerramento; com saída não avisa', () => {
  const preso = bot({ estados: ['0', '1'], transicoes: [
    ['0', 1, [quando('a')], [msg('x'), troca(1)]],
    ['1', 1, [quando('b')], [msg('y'), troca(0)]],
  ] });
  const e = achados(preso, 'E03');
  assert.equal(e.length, 1);
  assert.equal(e[0].severidade, 'aviso');
  assert.match(e[0].titulo, /0, 1/);

  const comSaida = bot({ estados: ['0', '1'], transicoes: [
    ['0', 1, [quando('a')], [troca(1)]],
    ['1', 1, [quando('b')], [encerrar]],
    ['1', 2, [quando('c')], [troca(0)]],
  ] });
  assert.equal(achados(comSaida, 'E03').length, 0);
});

test('E03: timeout para fila ou encerramento rebaixa para info; timeout para estado vira rota de fuga', () => {
  const t = (timeout) => bot({ estados: ['0', '9'], timeout, transicoes: [['0', 1, [quando('a')], [msg('x')]], ['9', 1, [quando('z')], [fila]]] });
  assert.equal(achados(t({ TIMEOUT_ACTION: 'queue', TIMEOUT_DESTINY: '3' }), 'E03')[0].severidade, 'info');
  assert.equal(achados(t({ TIMEOUT_ACTION: 'bot', TIMEOUT_DESTINY: '9' }), 'E03').length, 0);
});

test('E04: estado inalcançável é info; destino do timeout conta como raiz', () => {
  const b = bot({ estados: ['0', '5'], timeout: { TIMEOUT_ACTION: 'bot', TIMEOUT_DESTINY: '5' }, transicoes: [['0', 1, [quando('a')], [fila]], ['5', 1, [quando('a')], [fila]]] });
  assert.equal(achados(b, 'E04').length, 0);
  const sem = bot({ estados: ['0', '1', '5'], transicoes: [['0', 1, [quando('a')], [troca(1)]], ['1', 1, [quando('a')], [fila]], ['5', 1, [quando('a')], [fila]]] });
  const e = achados(sem, 'E04');
  assert.equal(e.length, 1);
  assert.equal(e[0].severidade, 'info');
});

test('E04: se o estado 0 não sai para lugar nenhum, não dá para afirmar quais estados estão soltos (a entrada pode não ser o 0)', () => {
  const b = bot({ estados: ['0', '1', '2'], transicoes: [['1', 1, [quando('a')], [troca(2)]], ['2', 1, [quando('a')], [fila]]] });
  assert.equal(achados(b, 'E04').length, 0);
  const e02 = achados(b, 'E02')[0];
  assert.equal(e02.estadoNumero, '0');
  assert.equal(e02.confianca, 'possivel', 'o estado 0 como entrada não está confirmado');
});

test('E01: estado com número não numérico que existe não é "inexistente"', () => {
  const b = bot({ estados: ['0', 'A1'], transicoes: [['0', 1, [quando('a')], [troca('A1')]], ['A1', 1, [quando('a')], [fila]]] });
  assert.equal(achados(b, 'E01').length, 0);
});

test('E05: destino com {$variavel} é info e não gera E01 nem E04 de estado inexistente', () => {
  const b = bot({ estados: ['0'], transicoes: [['0', 1, [quando('a')], [['2', { destiny: '{$proximo}' }]]]] });
  assert.equal(achados(b, 'E05').length, 1);
  assert.equal(achados(b, 'E05')[0].severidade, 'info');
  assert.equal(achados(b, 'E01').length, 0);
});

test('E00: bot sem estado 0 avisa como possível', () => {
  const b = bot({ estados: ['1'], transicoes: [['1', 1, [quando('a')], [fila]]] });
  const e = achados(b, 'E00');
  assert.equal(e.length, 1);
  assert.equal(e[0].confianca, 'possivel');
});

// ------------------------------------------------------------------ loops

test('L01: transição sem condição que reenvia no mesmo estado é erro certo', () => {
  const b = bot({ estados: ['0'], transicoes: [['0', 1, [], [msg('Olá')]]] });
  const l = achados(b, 'L01');
  assert.equal(l.length, 1);
  assert.equal(l[0].severidade, 'erro');
  assert.equal(l[0].confianca, 'certa');
});

test('L01: ação 2 para o próprio estado também repete; trocar de estado, esperar mensagem, pausar ou encerrar não', () => {
  assert.equal(achados(bot({ estados: ['0'], transicoes: [['0', 1, [], [msg('x'), troca(0)]]] }), 'L01').length, 1);
  assert.equal(achados(bot({ estados: ['0', '1'], transicoes: [['0', 1, [], [msg('x'), troca(1)]], ['1', 1, [quando('a')], [fila]]] }), 'L01').length, 0);
  assert.equal(achados(bot({ estados: ['0'], transicoes: [['0', 1, [quando('a')], [msg('x')]]] }), 'L01').length, 0);
  assert.equal(achados(bot({ estados: ['0', '1'], transicoes: [['0', 1, [], [['18', { callback_state: '1' }]]], ['1', 1, [quando('a')], [fila]]] }), 'L01').length, 0);
  assert.equal(achados(bot({ estados: ['0'], transicoes: [['0', 1, [], [msg('tchau'), encerrar]]] }), 'L01').length, 0);
});

test('L01: transição vazia (sem ações) é só info; sem envio não é "certa"; script pode trocar o estado', () => {
  const vazia = bot({ estados: ['0'], transicoes: [['0', 1, [], []]] });
  assert.equal(achados(vazia, 'L01')[0].severidade, 'info');
  assert.doesNotMatch(achados(vazia, 'L01')[0].detalhe, /timeout/);
  const semEnvio = bot({ estados: ['0'], transicoes: [['0', 1, [], [['13', { bot_variables_text: '{"a":"1"}' }]]]] });
  const l = achados(semEnvio, 'L01')[0];
  assert.equal(l.severidade, 'aviso');
  assert.equal(l.confianca, 'possivel');
  assert.doesNotMatch(l.detalhe, /reenvio/);
  const comScript = bot({ estados: ['0'], transicoes: [['0', 1, [], [msg('x'), ['7', { script_name: 'mover' }]]]] });
  const s = achados(comScript, 'L01')[0];
  assert.equal(s.confianca, 'possivel');
  assert.equal(s.severidade, 'aviso');
  assert.match(s.detalhe, /script/);
});

test('E03/E04: estado com script (ação 7) pode ser movido por ele e não é acusado de ficar sem saída', () => {
  const b = bot({ estados: ['0'], transicoes: [['0', 1, [quando('a')], [msg('x'), ['7', { script_name: 'mover' }]]]] });
  assert.equal(achados(b, 'E03').length, 0);
});

test('L01: depender de calendário é aviso possível; limite do contador de erros é info', () => {
  const cal = bot({ estados: ['0'], transicoes: [['0', 1, [['calendario', 7]], [msg('Fechado')]]] });
  const a = achados(cal, 'L01');
  assert.equal(a[0].severidade, 'aviso');
  assert.equal(a[0].confianca, 'possivel');

  const limite = bot({ estados: ['0'], transicoes: [['0', 1, [['error_count', 8, '3']], [msg('de novo'), ['8', { error_count: 'add' }]]]] });
  assert.equal(achados(limite, 'L01')[0].severidade, 'info');
});

test('L02: ciclo A → B → A sem esperar o cliente', () => {
  const b = bot({ estados: ['0', '1'], transicoes: [
    ['0', 1, [], [msg('a'), troca(1)]],
    ['1', 1, [], [msg('b'), troca(0)]],
  ] });
  const l = achados(b, 'L02');
  assert.equal(l.length, 1);
  assert.equal(l[0].severidade, 'erro');
  assert.match(l[0].titulo, /0 → 1 → 0/);
  // Basta um dos elos esperar mensagem para não haver ciclo.
  const quebrado = bot({ estados: ['0', '1'], transicoes: [
    ['0', 1, [], [msg('a'), troca(1)]],
    ['1', 1, [quando('voltar')], [msg('b'), troca(0)]],
  ] });
  assert.equal(achados(quebrado, 'L02').length, 0);
});

test('L02: elo com condição externa vira aviso possível', () => {
  const b = bot({ estados: ['0', '1'], transicoes: [
    ['0', 1, [['calendario', 7]], [troca(1)]],
    ['1', 1, [], [troca(0)]],
  ] });
  const l = achados(b, 'L02');
  assert.equal(l.length, 1);
  assert.equal(l[0].severidade, 'aviso');
});

// ------------------------------------------------------------------ menus

const menuComTratamento = (menu, tratadores) => bot({ estados: ['0', '1'], transicoes: [
  ['0', 1, [], [menu, troca(1)]],
  ...tratadores.map(([prio, conds, acoes], i) => ['1', prio ?? i + 1, conds, acoes ?? [fila]]),
] });

test('M01: opção sem transição que a trate; cai no genérico', () => {
  const b = menuComTratamento(botoes(['vendas', 'Vendas'], ['suporte', 'Suporte']), [
    [1, [quando('vendas')]],
    [2, [quando('', 2)], [msg('Não entendi')]],
  ]);
  const m = achados(b, 'M01');
  assert.equal(m.length, 1);
  assert.equal(m[0].severidade, 'aviso');
  assert.match(m[0].detalhe, /suporte/);
  assert.match(m[0].detalhe, /genérica/);
  assert.ok(m[0].acaoId, 'o achado fica no cartão do menu');
});

test('M01: menu sem nenhuma condição no estado de destino; tratamento no próprio estado (sem Troca Estado)', () => {
  const sem = menuComTratamento(botoes(['a', 'A']), []);
  assert.equal(achados(sem, 'M01').length, 1);
  const mesmo = bot({ estados: ['0'], transicoes: [
    ['0', 1, [quando('oi')], [botoes(['a', 'A'], ['b', 'B'])]],
    ['0', 2, [quando('a')], [fila]],
  ] });
  const m = achados(mesmo, 'M01');
  assert.equal(m.length, 1);
  assert.match(m[0].detalhe, /"B"/);
});

test('M01: Contém e várias linhas contam como tratamento; valor com {$var} é indecidível', () => {
  const b = menuComTratamento(lista(['10', 'Dez'], ['20', 'Vinte'], ['30', 'Trinta']), [
    [1, [quando('10', 2)]],
    [2, [quando('20\n21')]],
    [3, [quando('{$escolha}')]],
  ]);
  assert.equal(achados(b, 'M01').length, 0);
});

test('M01: genérica que segue para outro estado repassa qualquer resposta e não é "sem tratamento"', () => {
  const b = bot({ estados: ['0', '1', '2'], transicoes: [
    ['0', 1, [], [botoes(['a', 'A'], ['b', 'B']), troca(1)]],
    ['1', 1, [quando('atendente', 2)], [fila]],
    ['1', 2, [quando('', 2)], [troca(2)]],
    ['2', 1, [quando('a')], [fila]],
  ] });
  assert.equal(achados(b, 'M01').length, 0);
});

test('M01: lista o que o estado espera, para achar o ID trocado', () => {
  const b = menuComTratamento(botoes(['Agendar', 'Agendar']), [[1, [quando('69')]], [2, [quando('66')]], [3, [quando('', 2)], [msg('Não entendi')]]]);
  const m = achados(b, 'M01');
  assert.equal(m.length, 1);
  assert.match(m[0].detalhe, /espera "69", "66"/);
});

test('M01: estado de roteamento (transições automáticas) é seguido; se for condicional, a análise não opina', () => {
  // 0 -> menu -> 1 (roteador sem condição, vai para 2) -> a resposta é ouvida em 2
  const certo = bot({ estados: ['0', '1', '2'], transicoes: [
    ['0', 1, [], [botoes(['a', 'A']), troca(1)]],
    ['1', 1, [], [troca(2)]],
    ['2', 1, [quando('a')], [fila]],
  ] });
  assert.equal(achados(certo, 'M01').length, 0);
  const semTratar = bot({ estados: ['0', '1', '2'], transicoes: [
    ['0', 1, [], [botoes(['a', 'A']), troca(1)]],
    ['1', 1, [], [troca(2)]],
    ['2', 1, [quando('b')], [fila]],
  ] });
  assert.equal(achados(semTratar, 'M01')[0].estadoNumero, '0');
  // roteador condicional (variável/calendário): pode sair sem ouvir o cliente
  const incerto = bot({ estados: ['0', '1', '2'], transicoes: [
    ['0', 1, [], [botoes(['a', 'A']), troca(1)]],
    ['1', 1, [['calendario', 7]], [troca(2)]],
    ['1', 2, [quando('b')], [fila]],
  ] });
  assert.equal(achados(incerto, 'M01').length, 0);
});

test('M01: menu seguido de transferência não espera resposta; formato desconhecido não é analisado', () => {
  const b = bot({ estados: ['0'], transicoes: [['0', 1, [], [botoes(['a', 'A']), fila]]] });
  assert.equal(achados(b, 'M01').length, 0);
  const desconhecido = menuComTratamento(['10', { message_option_text: '{"foo":1}' }], []);
  assert.equal(achados(desconhecido, 'M01').length, 0);
  assert.equal(achados(desconhecido, 'M04')[0].severidade, 'info');
});

test('M02: condição espera a posição, o título ou outra caixa em vez do ID do menu', () => {
  const porPosicao = menuComTratamento(botoes(['opt_vendas', 'Vendas'], ['opt_suporte', 'Suporte']), [
    [1, [quando('1')]], [2, [quando('2')]],
  ]);
  const p = achados(porPosicao, 'M02');
  assert.equal(p.length, 2);
  assert.ok(p.every((a) => a.severidade === 'erro'));
  assert.match(p[0].titulo, /opt_vendas|opt_suporte/);
  assert.equal(achados(porPosicao, 'M01').length, 1, 'e as opções continuam sem tratamento');

  const porTitulo = menuComTratamento(botoes(['v1', 'Vendas']), [[1, [quando('Vendas')]]]);
  assert.match(achados(porTitulo, 'M02')[0].detalhe, /título/);

  const porCaixa = menuComTratamento(botoes(['vendas', 'Vendas']), [[1, [quando('Vendas')]]]);
  // "Vendas" é o título e difere do ID só na caixa; Igual a diferencia caixa.
  assert.equal(achados(porCaixa, 'M02')[0].severidade, 'erro');
  assert.match(achados(porCaixa, 'M02')[0].detalhe, /maiúsculas/);
});

test('M02: valor sem relação com o menu (texto livre, "voltar") não gera achado; grafia com acento/pontuação gera; opção já tratada rebaixa', () => {
  const livre = menuComTratamento(botoes(['a', 'A']), [[1, [quando('a')]], [2, [quando('voltar')]], [3, [quando('Atendente\nATENDENTE')]]]);
  assert.equal(achados(livre, 'M02').length, 0);
  const grafia = menuComTratamento(botoes(['Opção_1', 'Primeira']), [[1, [quando('opcao 1')]]]);
  assert.equal(achados(grafia, 'M02')[0].severidade, 'erro');
  const jaTratada = menuComTratamento(botoes(['a', 'Alfa']), [[1, [quando('a')]], [2, [quando('Alfa')]]]);
  assert.equal(achados(jaTratada, 'M02')[0].severidade, 'info');
});

test('M02: valor só de pontuação não casa com título só de emoji', () => {
  const b = menuComTratamento(botoes(['a', '👍']), [[1, [quando('?', 2)]]]);
  assert.equal(achados(b, 'M02').length, 0);
});

test('M02: WebChat compara o value, não o texto', () => {
  const b = menuComTratamento(webchat(['1', 'Vendas'], ['2', 'Suporte']), [[1, [quando('1')]], [2, [quando('2')]]]);
  assert.equal(achados(b, 'M02').length, 0);
  assert.equal(achados(b, 'M01').length, 0);
});

test('M03: transição genérica de prioridade melhor engole o tratamento', () => {
  const b = menuComTratamento(botoes(['a', 'A'], ['b', 'B']), [
    [1, [quando('', 2)], [msg('Não entendi')]],
    [2, [quando('a')]],
    [3, [quando('b')]],
  ]);
  const m = achados(b, 'M03');
  assert.equal(m.length, 2);
  assert.ok(m.every((a) => a.severidade === 'erro'));
  assert.equal(achados(b, 'M01').length, 0, 'não duplica como "sem tratamento"');
});

test('M03: genérica com prioridade pior (o fallback normal) não engole', () => {
  assert.equal(achados(saudavel(), 'M03').length, 0);
});

test('M04: mensagem interativa que não é lista nem botões (cta_url) não é menu', () => {
  const cta = ['10', { message_option_text: JSON.stringify({ interactive: { type: 'cta_url', body: { text: 'Veja' }, action: { name: 'cta_url', parameters: { url: 'https://x' } } } }) }];
  const b = bot({ estados: ['0'], transicoes: [['0', 1, [quando('x')], [cta, fila]]] });
  assert.equal(achados(b, 'M04').length, 1);
  assert.equal(achados(b, 'M04')[0].severidade, 'info');
});

test('M04: IDs vazios, repetidos, "0", com HTML, excesso de botões', () => {
  const ruim = (...itens) => bot({ estados: ['0'], transicoes: [['0', 1, [quando('x')], [botoes(...itens), fila]]] });
  assert.match(achados(ruim(['a', 'A'], ['a', 'B']), 'M04')[0].detalhe, /repetidos/);
  assert.match(achados(ruim(['', 'A']), 'M04')[0].detalhe, /sem ID/);
  assert.match(achados(ruim(['0', 'Zero']), 'M04')[0].detalhe, /"0"/);
  assert.match(achados(ruim(['a&b', 'A']), 'M04')[0].detalhe, /escapa/);
  assert.match(achados(ruim(['a', 'A'], ['b', 'B'], ['c', 'C'], ['d', 'D']), 'M04')[0].detalhe, /4 botões/);
  assert.equal(achados(ruim(['a', 'A'], ['b', 'B']), 'M04').length, 0);
});

// ------------------------------------------------------------------ transições

test('T01: Diferente de / Não contém em mensagem nunca casam', () => {
  const b = bot({ estados: ['0'], transicoes: [['0', 1, [quando('a', 3)], [fila]], ['0', 2, [quando('b', 4)], [fila]], ['0', 3, [quando('c', 1)], [fila]]] });
  assert.equal(achados(b, 'T01').length, 2);
  assert.ok(achados(b, 'T01').every((a) => a.severidade === 'erro'));
});

test('T02: transição sem condições sombreia as seguintes; a última sem condições não', () => {
  const b = bot({ estados: ['0'], transicoes: [['0', 1, [], [msg('x')]], ['0', 2, [quando('a')], [fila]], ['0', 3, [quando('b')], [fila]]] });
  const t = achados(b, 'T02');
  assert.equal(t.length, 1);
  assert.match(t[0].titulo, /^2 transições/);
  const ok = bot({ estados: ['0'], transicoes: [['0', 1, [quando('a')], [fila]], ['0', 2, [], [msg('x')]]] });
  assert.equal(achados(ok, 'T02').length, 0);
});

test('T02: condição de tipo 0 não é gravada pelo servidor, então a transição vale como sem condição', () => {
  const b = bot({ estados: ['0'], transicoes: [['0', 1, [['message', 0, '']], [msg('x')]], ['0', 2, [quando('a')], [fila]]] });
  assert.equal(achados(b, 'T02').length, 1);
});

test('T03: prioridade repetida é info', () => {
  const b = bot({ estados: ['0'], transicoes: [['0', 1, [quando('a')], [fila]], ['0', 1, [quando('b')], [fila]]] });
  assert.equal(achados(b, 'T03')[0].severidade, 'info');
  assert.equal(achados(saudavel(), 'T03').length, 0);
});

// ------------------------------------------------------------------ geral

test('ordena erro, aviso, info e conta o resumo', () => {
  const b = bot({ estados: ['0', '1'], transicoes: [['0', 1, [quando('a')], [troca(99)]], ['0', 1, [quando('b')], [fila]]] });
  const { achados: lista, resumo } = analisarBot(b);
  const ordem = lista.map((a) => a.severidade);
  assert.deepEqual(ordem, [...ordem].sort((x, y) => ['erro', 'aviso', 'info'].indexOf(x) - ['erro', 'aviso', 'info'].indexOf(y)));
  assert.equal(resumo.total, lista.length);
  assert.equal(resumo.erro + resumo.aviso + resumo.info, resumo.total);
  assert.equal(resumo.porRegra.E01, 1);
});

test('não altera o bot analisado', () => {
  const b = saudavel();
  const antes = JSON.stringify(b);
  analisarBot(b);
  assert.equal(JSON.stringify(b), antes);
});

test('bots reais de exemplo: roda sem quebrar e todo achado aponta para algo que existe', () => {
  const exemplos = botsDeExemplo();
  assert.ok(exemplos.length > 0);
  for (const { nome, bot: b } of exemplos) {
    const { achados: lista } = analisarBot(b);
    const estados = new Set(b.BOT_STATES.map((s) => String(s.STATE_NUMBER)));
    const transicoes = new Set(b.BOT_TRANSITIONS.map((t) => t.ID));
    const acoes = new Set(b.BOT_ACTIONS.map((a) => a.ID));
    for (const a of lista) {
      assert.ok(a.regra && a.titulo && a.severidade, `${nome}: achado incompleto`);
      if (a.estadoNumero !== null) assert.ok(estados.has(String(a.estadoNumero)), `${nome}: estado ${a.estadoNumero} (${a.regra})`);
      if (a.transicaoId) assert.ok(transicoes.has(a.transicaoId), `${nome}: transição ${a.transicaoId} (${a.regra})`);
      if (a.acaoId) assert.ok(acoes.has(a.acaoId), `${nome}: ação ${a.acaoId} (${a.regra})`);
    }
  }
});
