// Formato do JSON dos menus (ação 10) que a extensão grava: o mesmo que a Orpen aceita (modal nativo e
// outras ferramentas). Menu NOVO: header e footer sempre presentes (mesmo vazios), quebra de linha como
// \r\n e título de seção na lista. Menu EXISTENTE: o JSON original é preservado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { js } from './apoio.mjs';

const { atualizarMenuPreservando } = await js('menu-modal.js');
const { buildMenuJson, quebrasWhatsapp, textoFiel, tamanhoDoCorpo } = await js('menu-builder.js');

// Menu de lista que funciona na Orpen (gerado por outra ferramenta).
const FUNCIONA = {
  interactive: {
    type: 'list',
    header: { type: 'text', text: '' },
    body: { text: 'oi 123\r\n\r\n22222\r\n\r\n\r\n44444' },
    footer: { text: '' },
    action: { button: 'Opções', sections: [{ title: 'Opções', rows: [{ id: 'asdasdasd', title: 'asdasdasd' }] }] },
  },
};

const lista = (extra = {}) => ({
  kind: 'whatsapp_list', header: '', body: 'oi 123\n\n22222\n\n\n44444', footer: '', button: 'Opções',
  sections: [{ title: '', rows: [{ id: 'asdasdasd', title: 'asdasdasd', description: '' }] }], ...extra,
});

test('lista nova: sai idêntica ao menu que funciona (header/footer vazios, \\r\\n, título de seção)', () => {
  assert.deepEqual(JSON.parse(atualizarMenuPreservando('', lista())), FUNCIONA);
  assert.deepEqual(JSON.parse(buildMenuJson(lista())), FUNCIONA);
});

test('botões novos: header e footer presentes e quebra como \\r\\n', () => {
  const m = { kind: 'whatsapp_button', header: '', body: 'a\nb', footer: '', buttons: [{ id: 'x', title: 'X' }] };
  for (const json of [atualizarMenuPreservando('', m), buildMenuJson(m)]) {
    const it = JSON.parse(json).interactive;
    assert.deepEqual(it.header, { type: 'text', text: '' });
    assert.deepEqual(it.footer, { text: '' });
    assert.equal(it.body.text, 'a\r\nb');
    assert.deepEqual(it.action.buttons, [{ type: 'reply', reply: { id: 'x', title: 'X' } }]);
  }
});

test('o JSON sai em texto único e válido: nenhuma quebra de linha crua dentro das strings', () => {
  const json = atualizarMenuPreservando('', lista());
  const dentroDeString = json.replace(/"(?:[^"\\]|\\.)*"/g, '""'); // tira o conteúdo das strings
  assert.doesNotMatch(dentroDeString, /\r/);
  assert.equal(JSON.parse(json).interactive.body.text, 'oi 123\r\n\r\n22222\r\n\r\n\r\n44444');
});

test('descrição só aparece quando preenchida (como no menu que funciona)', () => {
  const sem = JSON.parse(atualizarMenuPreservando('', lista()));
  assert.ok(!('description' in sem.interactive.action.sections[0].rows[0]));
  const com = JSON.parse(atualizarMenuPreservando('', lista({ sections: [{ title: '', rows: [{ id: 'a', title: 'A', description: 'detalhe' }] }] })));
  assert.equal(com.interactive.action.sections[0].rows[0].description, 'detalhe');
});

test('menu existente sem header/footer continua sem eles, e o texto com \\n não é reescrito se não mudou', () => {
  const original = JSON.stringify({ interactive: { type: 'button', body: { text: 'Olá\nescolha' }, action: { buttons: [{ type: 'reply', reply: { id: 'a', title: 'A' } }] } } }, null, 4);
  const model = { kind: 'whatsapp_button', header: '', body: 'Olá\nescolha', footer: '', buttons: [{ id: 'a', title: 'AA' }] };
  const novo = JSON.parse(atualizarMenuPreservando(original, model)).interactive;
  assert.ok(!('header' in novo) && !('footer' in novo), 'não inventa header/footer em menu que já existe');
  assert.equal(novo.body.text, 'Olá\nescolha', 'texto intocado mantém o estilo de quebra original');
  assert.equal(novo.action.buttons[0].reply.title, 'AA');
});

test('menu existente com \\r\\n: texto editado vira \\r\\n, texto intocado fica como estava', () => {
  const original = JSON.stringify(FUNCIONA, null, 4);
  const intocado = JSON.parse(atualizarMenuPreservando(original, lista({ sections: [{ title: 'Opções', rows: [{ id: 'novo', title: 'Novo', description: '' }] }] }))).interactive;
  assert.equal(intocado.body.text, 'oi 123\r\n\r\n22222\r\n\r\n\r\n44444');
  assert.equal(intocado.action.sections[0].title, 'Opções', 'título de seção existente preservado');
  const editado = JSON.parse(atualizarMenuPreservando(original, lista({ body: 'outro\ntexto' }))).interactive;
  assert.equal(editado.body.text, 'outro\r\ntexto');
});

test('lista existente com título de seção vazio mantém vazio (não impõe o padrão)', () => {
  const original = JSON.stringify({ interactive: { type: 'list', body: { text: 'x' }, action: { button: 'Ver', sections: [{ title: '', rows: [{ id: 'a', title: 'A' }] }] } } });
  const model = lista({ body: 'x', button: 'Ver', sections: [{ title: '', rows: [{ id: 'a', title: 'A', description: '' }] }] });
  assert.equal(JSON.parse(atualizarMenuPreservando(original, model)).interactive.action.sections[0].title, '');
});

test('quebrasWhatsapp e textoFiel', () => {
  assert.equal(quebrasWhatsapp('a\nb\r\nc'), 'a\r\nb\r\nc');
  assert.equal(quebrasWhatsapp(undefined), '');
  assert.equal(textoFiel('a\nb', 'a\nb'), 'a\nb');
  assert.equal(textoFiel('a\r\nb', 'a\nb'), 'a\r\nb', 'só a quebra difere: mantém o original');
  assert.equal(textoFiel('a\nb', 'a\nc'), 'a\r\nc');
  assert.equal(textoFiel(undefined, 'x\ny'), 'x\r\ny');
});

test('tamanhoDoCorpo conta cada quebra de linha como 2 (\\r\\n gravado)', () => {
  assert.equal(tamanhoDoCorpo('abc'), 3);
  assert.equal(tamanhoDoCorpo('a\nb'), 4);
  assert.equal(tamanhoDoCorpo('a\r\nb'), 4, 'texto que já veio com \\r\\n não conta em dobro');
  assert.equal(tamanhoDoCorpo('x\n'.repeat(600)), 1800);
});

test('WebChat não muda: lista de opções simples', () => {
  const m = { kind: 'webchat', options: [{ text: 'Sim', value: 'sim' }] };
  assert.deepEqual(JSON.parse(atualizarMenuPreservando('', m)), { message_type: 'menu', menu_type: 'list', options: [{ text: 'Sim', value: 'sim' }] });
});
