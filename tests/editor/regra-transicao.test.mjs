// Resumo da regra na barra da transição (js/regra-transicao.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { js } from './apoio.mjs';

const { textoRegra } = await js('regra-transicao.js');

const cond = (variavel, operador, valor = '') => ({ variavel, operador, valor });

test('condição e Troca Estado: se ... → destino', () => {
  assert.equal(textoRegra([cond('MENSAGEM', 'Igual a', '1')], [{ tipo: 'Troca Estado', destino: '9 - Segunda via' }]), 'se MENSAGEM Igual a 1 → 9 - Segunda via');
});

test('sem condição: sempre', () => {
  assert.equal(textoRegra([], [{ tipo: 'Troca Estado', destino: '3 - Menu' }]), 'sempre (sem condição) → 3 - Menu');
});

test('várias condições: mostra a primeira e quantas faltam', () => {
  assert.equal(textoRegra([cond('MENSAGEM', 'Contém', 'boleto'), cond('CONTATO', 'É Vip'), cond('ENTRADA', 'Igual a', '5')], []), 'se MENSAGEM Contém boleto e +2 · nenhuma ação');
});

test('valor oculto (operador sem valor) não deixa espaço sobrando', () => {
  assert.equal(textoRegra([cond('CONTATO', 'É Vip')], [{ tipo: 'Transf. Fila' }]), 'se CONTATO É Vip · Transf. Fila');
});

test('sem Troca Estado: lista os tipos de ação sem repetir', () => {
  assert.equal(textoRegra([], [{ tipo: 'Mensagem' }, { tipo: 'Mensagem' }, { tipo: 'Finalizar' }]), 'sempre (sem condição) · Mensagem, Finalizar');
});

test('primeira Troca Estado vale, mesmo depois de outras ações', () => {
  assert.equal(textoRegra([], [{ tipo: 'Mensagem' }, { tipo: 'Troca Estado', destino: '7 - Financeiro' }]), 'sempre (sem condição) → 7 - Financeiro');
});

test('Troca Estado vazia e variável vazia aparecem como tal', () => {
  assert.equal(textoRegra([cond('', 'Igual a', 'x')], [{ tipo: 'Troca Estado', destino: '' }]), 'se (sem variável) Igual a x → (sem destino)');
});

test('valor longo é encurtado e quebras de linha viram espaço', () => {
  const texto = textoRegra([cond('MENSAGEM', 'Igual a', `1\n${'a'.repeat(60)}`)], []);
  assert.ok(texto.length < 80);
  assert.match(texto, /^se MENSAGEM Igual a 1 a+… · nenhuma ação$/);
});
