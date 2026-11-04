// Selo de erros/avisos do "Analisar bot" no cabeçalho do estado (js/selos-analise.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botSintetico, js } from './apoio.mjs';

const { selosPorEstado, resumoDoSelo, htmlSeloEstado } = await js('selos-analise.js');
const { analisarBot } = await js('analise-bot.js');
const { renderEstado } = await js('bot-view-render.js');

const achado = (estadoNumero, severidade, titulo = `${severidade} em ${estadoNumero}`) => ({ estadoNumero, severidade, titulo, regra: 'X', chave: `${estadoNumero}|${titulo}` });

test('conta erros e avisos por estado; informativos e configuração do bot ficam de fora', () => {
  const selos = selosPorEstado([
    achado('3', 'erro'), achado('3', 'aviso'), achado('3', 'aviso', 'outro aviso'),
    achado('0', 'aviso'),
    achado('5', 'info'),
    achado(null, 'erro', 'timeout inexistente'),
  ]);
  assert.deepEqual([...selos.keys()].sort(), ['0', '3']);
  assert.equal(selos.get('3').erro, 1);
  assert.equal(selos.get('3').aviso, 2);
  assert.deepEqual(selos.get('3').achados.map((a) => a.titulo), ['erro em 3', 'aviso em 3', 'outro aviso']);
  assert.equal(selos.get('0').erro, 0);
  assert.equal(selos.has('5'), false, 'só informativo: sem selo');
});

test('número do estado vira texto (a análise pode devolver número)', () => {
  const selos = selosPorEstado([achado(7, 'erro')]);
  assert.equal(selos.get('7').erro, 1);
});

test('resumo no singular e no plural', () => {
  assert.equal(resumoDoSelo({ erro: 1, aviso: 0 }), '1 erro');
  assert.equal(resumoDoSelo({ erro: 2, aviso: 1 }), '2 erros e 1 aviso');
  assert.equal(resumoDoSelo({ erro: 0, aviso: 3 }), '3 avisos');
});

test('sem erro nem aviso o selo é vazio', () => {
  assert.equal(htmlSeloEstado('1', undefined), '');
  assert.equal(htmlSeloEstado('1', { erro: 0, aviso: 0, achados: [] }), '');
});

test('o selo leva ao Analisar, mostra só as contagens que existem e a gravidade maior', () => {
  const soAviso = htmlSeloEstado('4', selosPorEstado([achado('4', 'aviso')]).get('4'));
  assert.match(soAviso, /data-action="ir-para-analise"/);
  assert.match(soAviso, /data-state="4"/);
  assert.match(soAviso, /data-gravidade="aviso"/);
  assert.doesNotMatch(soAviso, /estado-selo-erro/);
  assert.match(soAviso, /estado-selo-aviso"><i data-lucide="triangle-alert"><\/i>1</);

  const misto = htmlSeloEstado('4', selosPorEstado([achado('4', 'erro'), achado('4', 'erro', 'b'), achado('4', 'aviso')]).get('4'));
  assert.match(misto, /data-gravidade="erro"/);
  assert.match(misto, /estado-selo-erro"><i data-lucide="circle-x"><\/i>2</);
  assert.match(misto, /estado-selo-aviso"><i data-lucide="triangle-alert"><\/i>1</);
  assert.match(misto, /aria-label="2 erros e 1 aviso neste estado\. Abrir no Analisar bot"/);
});

test('o title lista os problemas (até 6) e escapa o texto', () => {
  const muitos = Array.from({ length: 8 }, (_, i) => achado('2', 'aviso', `Aviso <${i}> "x"`));
  const html = htmlSeloEstado('2', selosPorEstado(muitos).get('2'));
  const title = /title="([^"]*)"/.exec(html)[1];
  assert.match(title, /^8 avisos neste estado/);
  assert.match(title, /• Aviso &lt;0&gt; &quot;x&quot;/);
  assert.match(title, /• Aviso &lt;5&gt;/);
  assert.doesNotMatch(title, /Aviso &lt;6&gt;/);
  assert.match(title, /… e mais 2$/);
  assert.doesNotMatch(html, /<0>/);
});

test('com a análise de verdade: destino inexistente marca o estado de origem', () => {
  const bot = botSintetico({
    estados: ['0', '1'],
    transicoes: [
      ['0', 0, [], [['1', { message_text: 'oi' }], ['2', { destiny: '9' }]]],
      ['1', 0, [], [['5', { destiny: '1' }]]],
    ],
  });
  const { achados } = analisarBot(bot);
  const selos = selosPorEstado(achados);
  assert.ok(selos.get('0')?.erro >= 1, 'estado 0 aponta para o 9, que não existe');
  assert.ok(selos.get('0').achados.some((a) => a.regra === 'E01'));
  assert.match(htmlSeloEstado('0', selos.get('0')), /data-gravidade="erro"/);
});

test('o cabeçalho do estado tem o encaixe do selo, depois do resumo de transições', () => {
  const estado = { ID: '1', STATE_NUMBER: '0', ALIAS: 'Início' };
  const html = renderEstado(estado, {}, {}, {}, { 0: estado }, 1);
  const cabecalho = html.slice(html.indexOf('estado-header'), html.indexOf('estado-delete-panel'));
  assert.match(cabecalho, /<span class="estado-selo-wrap" data-role="estado-selo"><\/span>/);
  assert.ok(cabecalho.indexOf('estado-resumo') < cabecalho.indexOf('estado-selo-wrap'));
});
