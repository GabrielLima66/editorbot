// ---------------------------------------------------------------------------
// Coletor de dados do ambiente Orpen — executa no contexto principal (MAIN WORLD).
// Tem acesso direto às variáveis globais da página (window.queue, window.agent, etc.)
// e grava os dados em um elemento <script id="__orpen_bot_env_data__" type="application/json">
// no DOM para o content script (ISOLATED WORLD) ler de forma segura e sem violar CSP.
// ---------------------------------------------------------------------------

(function () {
  'use strict';

  function toArray(obj) {
    if (!obj) return [];
    if (Array.isArray(obj)) return obj;
    // Elemento DOM sombreando a variável global (ver obterListaBots abaixo) —
    // nunca é a lista de dados, então trata como "vazio" em vez de tentar
    // iterar propriedades de um HTMLElement.
    if (obj.nodeType) return [];
    try {
      return Object.keys(obj).map(function (k) { return obj[k]; });
    } catch (e) {
      return [];
    }
  }

  // Fallback: extrai `var <nome> = [...]` direto do texto de um <script>
  // inline da própria página. Necessário pra window.bot, que pode ficar
  // sombreado por `<optgroup id="bot">` (ContactCenter/bot.php:3831,
  // criado ao montar o formulário nativo da ação "Transf. Agente") — named
  // property shadowing troca o array pelo elemento na busca em window.*.
  // Os <script> continuam no DOM mesmo depois de executados, então dá pra
  // reler o JSON original do zero, sem depender do estado atual de window.
  function lerVarInlineScript(nome) {
    try {
      var regex = new RegExp('var\\s+' + nome + '\\s*=\\s*(\\[[\\s\\S]*?\\]|\\{[\\s\\S]*?\\})\\s*;');
      var scripts = document.getElementsByTagName('script');
      for (var i = 0; i < scripts.length; i++) {
        var txt = scripts[i].textContent;
        if (!txt || txt.indexOf('var ' + nome) === -1) continue;
        var m = txt.match(regex);
        if (m) {
          try { return JSON.parse(m[1]); } catch (e2) { /* tenta próximo script */ }
        }
      }
    } catch (e) { /* ignora — cai no fallback vazio */ }
    return null;
  }

  function obterListaBots() {
    var lista = toArray(window.bot);
    var valida = lista.length > 0 && lista.every(function (b) {
      return b && (b.ID !== undefined || b.id !== undefined);
    });
    if (!valida) {
      var viaScript = lerVarInlineScript('bot');
      if (viaScript) lista = toArray(viaScript);
    }
    return lista;
  }

  function coletarDados() {
    var dados = {
      queues: toArray(window.queue).map(function (q) {
        var label = q.NAME;
        if (q.BEE_NAME && q.BEE_NAME !== q.NAME) {
          label = '[' + q.NAME + '] ' + q.BEE_NAME;
        }
        return { id: q.NAME, name: label };
      }),
      agents: toArray(window.agent).map(function (a) {
        var id = a.ID || a.id;
        var name = a.NAME || a.name || id;
        return { id: id, name: '[Agente] ' + name };
      }),
      bots: obterListaBots().map(function (b) {
        var id = b.ID || b.id;
        var name = b.NAME || b.name || id;
        return { id: id, name: '[Bot] ' + name };
      }),
      crm_status: toArray(window.crm_status).map(function (c) {
        return { id: c.ID, name: c.NAME || c.ID };
      }),
      subStatus: toArray(window.subStatus).map(function (s) {
        return { id: s.ID, name: s.NAME || s.ID };
      }),
      entrances: toArray(window.entrances).map(function (e) {
        var prefix = e.ENTRANCE_TYPE ? '[' + e.ENTRANCE_TYPE + '] ' : '';
        return { id: e.ENTRANCE, name: prefix + e.ENTRANCE };
      }),
      calendars: toArray(window.calendario).map(function (c) {
        return { id: c.id || c.ID, name: c.name || c.NAME || c.id };
      }),
      scripts: [],
      checkpoints: [],
      variables: [],
      openAiAccounts: toArray(window.openAiAccounts).map(function (a) {
        return { id: a.ID, name: a.NAME || a.ID };
      })
    };

    if (window.options_ws) {
      for (var k in window.options_ws) {
        var opt = window.options_ws[k];
        if (opt && opt.ID) dados.scripts.push({ id: opt.ID, name: opt.NAME || opt.ID });
      }
    }

    if (window.bot_variables) {
      for (var k2 in window.bot_variables) {
        var v = window.bot_variables[k2];
        if (v && v.value) dados.variables.push({ id: v.value, name: v.name || v.value });
      }
    }

    // Checkpoints via createAction nativa
    if (typeof window.createAction === 'function' && typeof window.$ !== 'undefined') {
      try {
        var dummy = window.$('<div><div class="actions"></div></div>');
        window.createAction(dummy, '9', {});
        var selects = dummy.find('select[name="check_point"]');
        if (selects.length > 0) {
          selects.first().find('option').each(function () {
            var val = window.$(this).val();
            var text = window.$(this).text();
            if (val) dados.checkpoints.push({ id: val, name: text });
          });
        }
      } catch (e) {
        console.warn('[EDITOR_BOT] Aviso ao obter checkpoints via createAction:', e);
      }
    }

    return dados;
  }

  function gravarNoDOM() {
    try {
      var dados = coletarDados();
      var id = '__orpen_bot_env_data__';
      var el = document.getElementById(id);
      if (!el) {
        el = document.createElement('script');
        el.id = id;
        el.type = 'application/json';
        (document.head || document.documentElement).appendChild(el);
      }
      el.textContent = JSON.stringify(dados);
      console.log('[EDITOR_BOT] Cadastros do ambiente Orpen sincronizados:', {
        filas: dados.queues.length,
        agentes: dados.agents.length,
        bots: dados.bots.length,
        crm_status: dados.crm_status.length,
        scripts: dados.scripts.length,
        checkpoints: dados.checkpoints.length,
        entrances: dados.entrances.length,
        subStatus: dados.subStatus.length
      });
    } catch (err) {
      console.error('[EDITOR_BOT] Erro ao gravar dados do ambiente:', err);
    }
  }

  // Executa ao carregar
  gravarNoDOM();

  // Permite re-sincronizar quando requisitado
  document.addEventListener('__ORPEN_REQ_ENV_DATA__', gravarNoDOM);
})();
