import { test } from 'node:test';
import assert from 'node:assert/strict';
import { js } from './apoio.mjs';

const { classificar, FAIXA_EXATA, FAIXA_PALAVRAS, FAIXA_PARECIDA } = await js('fuzzy.js');
const { filtrarOpcoes } = await js('combobox.js');

const faixa = (texto, consulta) => classificar(texto, consulta)?.faixa ?? null;

test('contém o texto: faixa exata, sem acento e sem maiúscula', () => {
  assert.equal(faixa('SUPORTE - Cobrança N2', 'cobr'), FAIXA_EXATA);
  assert.equal(faixa('Horário de atendimento', 'HORARIO'), FAIXA_EXATA);
});

test('todas as palavras, em qualquer ordem: faixa de palavras', () => {
  assert.equal(faixa('SUPORTE - Cobrança N2', 'sup cob'), FAIXA_PALAVRAS);
  assert.equal(faixa('SUPORTE - Cobrança N2', 'cobranca suporte'), FAIXA_PALAVRAS);
  assert.equal(faixa('SUPORTE - Cobrança N2', 'sup xyz'), null);
});

test('parecidos: letras em sequência no começo da palavra', () => {
  assert.equal(faixa('Transferir para fila', 'trnsf'), FAIXA_PARECIDA);
  assert.equal(faixa('Transferir para fila', 'trnf'), FAIXA_PARECIDA);
  assert.equal(classificar('Transferir', 'trf'), null); // buracos demais para 3 letras
});

test('parecidos: um erro de digitação em palavra de 5+ letras', () => {
  // "fina" não é subsequência de "fila" (falta o n): só a tolerância a erro
  // casaria, e ela não vale em palavra de 4 letras.
  assert.equal(classificar('Fila', 'fina'), null);
  // Estes só casam pela distância de edição (as letras não ficam em sequência):
  assert.equal(faixa('Transferir para fila', 'trasnferir'), FAIXA_PARECIDA); // letras trocadas
  assert.equal(faixa('Transferir para fila', 'transferrir'), FAIXA_PARECIDA); // letra a mais
  assert.equal(faixa('Transferir para fila', 'transferer'), FAIXA_PARECIDA); // letra errada
  assert.equal(faixa('Atendimento', 'atendxmeyto'), null); // dois erros
});

test('parecidos: número digitado só vale exato (ID não vira "parecido" de outro ID)', () => {
  assert.equal(classificar('[Agente 1203] Maria', '123'), null);
  assert.equal(faixa('[Agente 1203] Maria', '120'), FAIXA_EXATA);
  assert.equal(classificar('Fila 9', 'fila 91'), null);
});

test('palavras: uma letra sozinha não faz tudo casar', () => {
  // com letras soltas no meio ("Taxy" tem x e y) não casa; só as iniciais de palavras, e como parecido
  assert.equal(classificar('Taxy', 'x y'), null);
  assert.equal(classificar('Cobrança', 'x y'), null);
  assert.equal(faixa('Xerox e Yoga', 'x y'), FAIXA_PARECIDA);
  assert.equal(faixa('SUPORTE - Cobrança N2', 'sup c'), FAIXA_PALAVRAS);
});

test('menos de 3 caracteres não ativa o fuzzy', () => {
  assert.equal(classificar('Cobrança', 'cb'), null);
  assert.equal(classificar('Cobrança', 'ab'), null);
  assert.notEqual(classificar('Cobrança', 'co'), null); // contém: faixa exata
});

test('letras soltas no meio da palavra não casam (sem ruído)', () => {
  const nomes = ['Financeiro', 'Suporte N1', 'Comercial', 'Retenção', 'Cobrança', 'Pós-venda', 'Triagem', 'Agendamento', 'Fidelização', 'Fatura', 'Falar com atendente'];
  // "fila": nenhum nome tem as letras f-i-l-a em sequência a partir do começo de uma palavra
  assert.deepEqual(nomes.filter((n) => classificar(n, 'fila')), []);
  assert.equal(classificar('Pós-venda', 'sev'), null); // letras existem, mas não no começo de uma palavra
});

test('consulta só de pontuação não casa com tudo', () => {
  assert.equal(classificar('Cobrança', '---'), null);
});

test('consulta vazia: tudo aparece', () => {
  assert.equal(classificar('Cobrança', '  ').faixa, FAIXA_EXATA);
});

test('lista: exatos na ordem de sempre, parecidos no fim, o ID exato primeiro', () => {
  const opcoes = [
    { valor: '[Agente 112] Maria', grupo: '', id: '112', apoio: '' },
    { valor: '[Agente 12] Marta', grupo: '', id: '12', apoio: '' },
    { valor: '[Agente 30] Transferir', grupo: '', id: '30', apoio: '' },
  ];
  assert.deepEqual(filtrarOpcoes(opcoes, '12').map((o) => o.id), ['12', '112']);
  const lista = filtrarOpcoes(opcoes, 'trasnferir');
  assert.deepEqual(lista.map((o) => o.id), ['30']);
  assert.equal(lista[0].parecido, true);
  const todas = filtrarOpcoes(opcoes, 'mar');
  assert.deepEqual(todas.map((o) => o.id), ['112', '12']);
  assert.ok(todas.every((o) => !o.parecido));
});

const op = (valor, extra = {}) => ({ valor, grupo: '', id: '', apoio: '', ...extra });

test('lista: parecidos vêm depois dos que contêm o texto', () => {
  const opcoes = [op('Trans'), op('Transferencia'), op('Transferir')];
  const lista = filtrarOpcoes(opcoes, 'trans');
  assert.deepEqual(lista.map((o) => o.valor), ['Trans', 'Transferencia', 'Transferir']);
  assert.ok(lista.every((o) => !o.parecido));
  // "transf" não está em "Trans" (uma letra a menos): vem no fim, como parecido.
  const mista = filtrarOpcoes(opcoes, 'transf');
  assert.deepEqual(mista.map((o) => o.valor), ['Transferencia', 'Transferir', 'Trans']);
  assert.deepEqual(mista.map((o) => !!o.parecido), [false, false, true]);
});

test('lista: os parecidos saem ordenados pela proximidade, não pela ordem de entrada', () => {
  // "trnf": "Tronf" tem 1 buraco, "Transferir" tem 2.
  const lista = filtrarOpcoes([op('Transferir'), op('Tronf')], 'trnf');
  assert.deepEqual(lista.map((o) => o.valor), ['Tronf', 'Transferir']);
  assert.ok(lista.every((o) => o.parecido));
});

test('Enter: sem resultado de verdade, não escolhe nenhum "parecido"', async () => {
  const { escolhaPadrao } = await js('combobox.js');
  // nome novo ("tentativa2") é parecido de "tentativa1": o Enter não pode trocá-lo
  const nomes = filtrarOpcoes([op('tentativa1')], 'tentativa2');
  assert.equal(nomes.length, 1);
  assert.equal(nomes[0].parecido, true);
  assert.equal(escolhaPadrao(nomes, 'tentativa2', 'tentativa2'), -1);
  // valor literal digitado ("sim") não vira a variável parecida
  assert.equal(escolhaPadrao(filtrarOpcoes([op('{$sistema}')], 'sim'), 'sim', 'sim'), -1);
});

test('Enter: prefere o nome exato, depois quem começa com o texto, depois quem contém o texto inteiro', async () => {
  const { escolhaPadrao } = await js('combobox.js');
  const escolhe = (opcoes, digitado) => {
    const lista = filtrarOpcoes(opcoes, digitado);
    return lista[escolhaPadrao(lista, digitado, digitado)]?.valor;
  };
  assert.equal(escolhe([op('2 - Menu principal'), op('5 - Menu')], 'Menu'), '5 - Menu');
  assert.equal(escolhe([op('[Agente 112] Maria'), op('[Agente 12] Marta')], 'agente 12'), '[Agente 12] Marta');
  assert.equal(escolhe([op('2 - Principal do menu'), op('5 - Menu principal')], 'menu princ'), '5 - Menu principal');
  assert.equal(escolhe([op('Transferir'), op('Transferencia')], 'transf'), 'Transferir');
});

test('Enter: o valor atual da lista continua marcado e texto livre sem busca não escolhe nada', async () => {
  const { escolhaPadrao } = await js('combobox.js');
  const lista = [op('A'), op('B')];
  assert.equal(escolhaPadrao(lista, 'B', ''), 1);
  assert.equal(escolhaPadrao(lista, 'livre', ''), -1);
});

test('lista: sem texto, mostra tudo na ordem original e ignora opção sem valor', () => {
  const opcoes = [{ valor: 'B', grupo: '', id: '', apoio: '' }, { valor: '', grupo: '', id: '', apoio: '' }, { valor: 'A', grupo: '', id: '', apoio: '' }];
  assert.deepEqual(filtrarOpcoes(opcoes, '').map((o) => o.valor), ['B', 'A']);
});
