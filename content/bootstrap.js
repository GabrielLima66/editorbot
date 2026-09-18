// ---------------------------------------------------------------------------
// Entry point non-module do content script (MV3 isolated world). Não usa
// import estático de propósito — content_scripts com "type": "module" tem
// suporte inconsistente entre versões/browsers; aqui é um script clássico
// que só faz import() dinâmico do resto do editor sob demanda, na hora do
// primeiro clique real em "Editar" (ver js/orpen-bridge.js).
//
// Único ponto de contato entre a extensão e o DOM real da Orpen: o listener
// de clique abaixo. Tudo que ele faz com a página nativa é (a) ler o
// atributo onclick="editBot(<id>);" do botão pra extrair o id, e (b) chamar
// stopImmediatePropagation() pra impedir o handler nativo de rodar — nunca
// edita nenhum arquivo do repo Orpen.
// ---------------------------------------------------------------------------

(function () {
  'use strict';

  // Confirmação em runtime de que estamos na página de bot do ContactCenter
  function paginaEhBotAdmin() {
    return (
      window.location.pathname.indexOf('/ContactCenter/bot.php') !== -1 ||
      window.location.pathname.indexOf('bot.php') !== -1
    );
  }

  if (!paginaEhBotAdmin()) return;

  console.log('[EDITOR_BOT] Content script ativado nesta página.');

  const SELECTOR_EDITAR = 'button[onclick*="editBot("], a[onclick*="editBot("]';
  const SELECTOR_ADICIONAR = 'a[href="#addBotModal"], a[data-target="#addBotModal"], button[data-target="#addBotModal"]';
  const REGEX_ID = /editBot\(\s*(\d+)\s*\)/;

  let bridgePromise = null;
  function carregarBridge() {
    if (!bridgePromise) {
      bridgePromise = import(chrome.runtime.getURL('js/orpen-bridge.js'));
    }
    return bridgePromise;
  }

  // O CSP da página bloqueia script inline injetado por nós (script-src 'self'
  // sem 'unsafe-inline'), então a coleta dos cadastros roda num script externo
  // separado, injetado no MAIN world via manifest.json
  // (content/page-env-collector.js, "world": "MAIN" — recurso da própria
  // extensão, portanto isento do CSP da página). Ele grava o resultado em
  // <script id="__orpen_bot_env_data__" type="application/json"> no <head>;
  // aqui só lemos esse elemento, que já é texto plano — sem eval, sem inline.
  function lerDadosAmbiente() {
    const el = document.getElementById('__orpen_bot_env_data__');
    if (!el) {
      console.warn('[EDITOR_BOT] page-env-collector.js ainda não gravou os dados do ambiente (elemento não encontrado).');
      return null;
    }
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      console.error('[EDITOR_BOT] Falha ao parsear dados do ambiente:', e);
      return null;
    }
  }

  document.addEventListener(
    'click',
    function (evento) {
      const botao = evento.target.closest(SELECTOR_EDITAR);
      if (!botao) return;

      if (evento.shiftKey) return;

      const match = (botao.getAttribute('onclick') || '').match(REGEX_ID);
      if (!match) return;

      evento.stopImmediatePropagation();
      evento.preventDefault();

      const botId = match[1];
      console.log('[EDITOR_BOT] Interceptado clique em Editar para bot ID', botId);

      const envData = lerDadosAmbiente();

      carregarBridge()
        .then((mod) => {
          mod.abrirEditorOrpen(botId, envData);
        })
        .catch((err) => {
          console.error('[EDITOR_BOT] Falha ao carregar o editor:', err);
        });
    },
    true
  );

  // Mesmo padrão do "Editar": intercepta o botão "Adicionar" (abre
  // #addBotModal — form nativo mínimo id/nome/tempo, sem estados/transições)
  // e abre o overlay novo já no editor completo, em modo de criação.
  // Shift+clique preserva o modal nativo como escape hatch.
  document.addEventListener(
    'click',
    function (evento) {
      const botao = evento.target.closest(SELECTOR_ADICIONAR);
      if (!botao) return;

      if (evento.shiftKey) return;

      evento.stopImmediatePropagation();
      evento.preventDefault();

      console.log('[EDITOR_BOT] Interceptado clique em Adicionar — abrindo editor em modo criação.');

      const envData = lerDadosAmbiente();

      carregarBridge()
        .then((mod) => {
          mod.abrirEditorOrpenNovo(envData);
        })
        .catch((err) => {
          console.error('[EDITOR_BOT] Falha ao carregar o editor:', err);
        });
    },
    true
  );
})();
