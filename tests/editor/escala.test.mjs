// Escala da interface: passos, limite por tamanho de janela e preferência salva.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { js } from './apoio.mjs';

const {
  PASSOS, CHAVE_ESCALA, normalizarEscala, maiorPassoPermitido, escalaEfetiva, passoAdjacente, rotuloEscala,
  definirEscalaAtual, obterEscala, lerPreferencia, gravarPreferencia,
} = await js('escala.js');

test('os passos são 100, 125, 150 e 175%, e 100% é o tamanho de hoje', () => {
  assert.deepEqual(PASSOS, [1, 1.25, 1.5, 1.75]);
  assert.equal(rotuloEscala(1), '100%');
  assert.equal(rotuloEscala(1.25), '125%');
  assert.equal(rotuloEscala(1.75), '175%');
});

test('valor salvo inválido ou fora dos passos vira o passo válido mais próximo', () => {
  assert.equal(normalizarEscala(undefined), 1);
  assert.equal(normalizarEscala(null), 1);
  assert.equal(normalizarEscala('abc'), 1);
  assert.equal(normalizarEscala('1.5'), 1.5);
  assert.equal(normalizarEscala(1.3), 1.25);
  assert.equal(normalizarEscala(9), 1.75);
  assert.equal(normalizarEscala(-2), 1);
});

test('tela grande comporta todos os passos', () => {
  assert.equal(maiorPassoPermitido(1920, 1080), 1.75);
  assert.equal(maiorPassoPermitido(2560, 1440), 1.75);
});

test('notebook de 1366x768 chega a 150%, não a 175%', () => {
  // 175%: o painel ficaria com ~625px de largura antes do zoom (mínimo 720).
  assert.equal(maiorPassoPermitido(1366, 768), 1.5);
});

test('janela de navegador real (barras de aba e endereço comem altura)', () => {
  // viewport típico de um notebook 1366x768 e de um 1080p com Windows a 125%
  assert.equal(maiorPassoPermitido(1366, 650), 1.25);
  assert.equal(maiorPassoPermitido(1536, 730), 1.5);
  assert.equal(maiorPassoPermitido(1920, 950), 1.75);
});

test('1440x900 comporta até 150%', () => {
  assert.equal(maiorPassoPermitido(1440, 900), 1.5);
});

test('janela pequena fica em 100%', () => {
  assert.equal(maiorPassoPermitido(1024, 600), 1);
  assert.equal(maiorPassoPermitido(800, 500), 1);
});

test('a preferência salva é limitada pela janela, sem ser apagada', () => {
  assert.equal(escalaEfetiva(1.75, 1366, 768), 1.5);
  assert.equal(escalaEfetiva(1.75, 1366, 650), 1.25);
  assert.equal(escalaEfetiva(1.75, 1920, 1080), 1.75);
  assert.equal(escalaEfetiva(1, 1366, 768), 1);
  assert.equal(escalaEfetiva(undefined, 1920, 1080), 1);
});

test('passoAdjacente anda um passo e respeita o teto e os extremos', () => {
  assert.equal(passoAdjacente(1, 1), 1.25);
  assert.equal(passoAdjacente(1.25, 1), 1.5);
  assert.equal(passoAdjacente(1.5, -1), 1.25);
  assert.equal(passoAdjacente(1, -1), null);
  assert.equal(passoAdjacente(1.75, 1), null);
  assert.equal(passoAdjacente(1.25, 1, 1.25), null);
  assert.equal(passoAdjacente(1, 1, 1.25), 1.25);
});

test('escala atual começa em 100% e guarda só passos válidos', () => {
  assert.equal(obterEscala(), 1);
  definirEscalaAtual(1.5);
  assert.equal(obterEscala(), 1.5);
  definirEscalaAtual('lixo');
  assert.equal(obterEscala(), 1);
});

// ---- persistência ------------------------------------------------------------

function chromeFalso(inicial = {}) {
  const dados = { ...inicial };
  return {
    dados,
    async get(chave) { return chave in dados ? { [chave]: dados[chave] } : {}; },
    async set(obj) { Object.assign(dados, obj); },
  };
}

function webFalso(inicial = {}) {
  const dados = { ...inicial };
  return {
    dados,
    getItem: (k) => (k in dados ? dados[k] : null),
    setItem: (k, v) => { dados[k] = String(v); },
  };
}

const chromeQuebrado = {
  get() { throw new Error('Extension context invalidated.'); },
  set() { throw new Error('Extension context invalidated.'); },
};

test('o ajuste gravado volta na próxima abertura (chrome.storage e localStorage)', async () => {
  const chromeLocal = chromeFalso();
  const webStorage = webFalso();
  assert.equal(await gravarPreferencia(1.5, { chromeLocal, webStorage }), true);
  assert.equal(chromeLocal.dados[CHAVE_ESCALA], 1.5);
  assert.equal(webStorage.dados[CHAVE_ESCALA], '1.5');
  // "nova sessão": os mesmos armazenamentos, nenhum estado em memória
  assert.equal(await lerPreferencia({ chromeLocal, webStorage }), 1.5);
});

test('o ajuste sobrevive ao chrome.storage vazio: vale o localStorage', async () => {
  const preferencia = await lerPreferencia({ chromeLocal: chromeFalso(), webStorage: webFalso({ [CHAVE_ESCALA]: '1.25' }) });
  assert.equal(preferencia, 1.25);
});

test('com os dois preenchidos, o chrome.storage (da extensão) vence', async () => {
  const preferencia = await lerPreferencia({
    chromeLocal: chromeFalso({ [CHAVE_ESCALA]: 1.75 }),
    webStorage: webFalso({ [CHAVE_ESCALA]: '1.25' }),
  });
  assert.equal(preferencia, 1.75);
});

test('extensão recarregada com a aba aberta: lê e grava só no localStorage, sem lançar', async () => {
  const webStorage = webFalso({ [CHAVE_ESCALA]: '1.5' });
  assert.equal(await lerPreferencia({ chromeLocal: chromeQuebrado, webStorage }), 1.5);
  assert.equal(await gravarPreferencia(1.25, { chromeLocal: chromeQuebrado, webStorage }), true);
  assert.equal(webStorage.dados[CHAVE_ESCALA], '1.25');
});

test('localStorage bloqueado: grava só no chrome.storage', async () => {
  const chromeLocal = chromeFalso();
  const webQuebrado = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };
  assert.equal(await gravarPreferencia(1.75, { chromeLocal, webStorage: webQuebrado }), true);
  assert.equal(await lerPreferencia({ chromeLocal, webStorage: webQuebrado }), 1.75);
});

test('sem nenhum armazenamento: 100% e a gravação avisa que não gravou', async () => {
  assert.equal(await lerPreferencia({}), 1);
  assert.equal(await lerPreferencia(), 1);
  assert.equal(await gravarPreferencia(1.5, {}), false);
});

test('valor salvo corrompido volta a 100%; valor fora dos passos grava o passo válido', async () => {
  assert.equal(await lerPreferencia({ chromeLocal: chromeFalso({ [CHAVE_ESCALA]: 'lixo' }), webStorage: webFalso() }), 1);
  const chromeLocal = chromeFalso();
  await gravarPreferencia(1.3, { chromeLocal, webStorage: webFalso() });
  assert.equal(chromeLocal.dados[CHAVE_ESCALA], 1.25);
});
