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
      // Condição "ENTRADA": a variável `entrances` da página traz { ID, NAME }
      // de todas as entradas (bot.php:42, 1073) e o nativo grava o ID
      // (bot.php:3570-3576).
      entradasCondicao: toArray(window.entrances).map(function (e) {
        var id = e.ID !== undefined ? e.ID : e.id;
        var nome = e.NAME || e.name;
        return { id: id, name: nome ? nome : 'ID: ' + id };
      }),
      // Ação "Enviar msg. à Entrance" (12): lista própria, montada dentro do
      // formulário da ação (bot.php:4155-4164), preenchida abaixo.
      entrances: [],
      calendars: toArray(window.calendario).map(function (c) {
        return { id: c.id || c.ID, name: c.name || c.NAME || c.id };
      }),
      scripts: [],
      checkpoints: [],
      variables: [],
      openAiAccounts: toArray(window.openAiAccounts).map(function (a) {
        return { id: a.ID, name: a.NAME || a.ID };
      }),
      // null = ainda não carregou ou a API não respondeu (o editor cai no
      // campo de IDs); [] = carregou e o ambiente não tem label.
      labels: labelsCarregadas,
      // Anexos do bot (ação "Enviar anexo"); null = não carregou.
      anexos: anexosCarregados
    };

    if (window.options_ws) {
      for (var k in window.options_ws) {
        var opt = window.options_ws[k];
        if (opt && opt.ID) dados.scripts.push({ id: opt.ID, name: opt.NAME || opt.ID });
      }
    }

    // bot_variables do modal nativo (bot.php:3065-3308): fixas, variáveis do
    // bot (getBotVars) e de scripts (getBotWs, parent = id do script, só
    // aparecem com a ação "Executar Script" daquele script) e da Automação
    // (parent 'automate'). As de getBotVars/getBotWs chegam por ajax depois
    // do carregamento: por isso a coleta é refeita ao abrir o editor
    // (evento __ORPEN_REQ_ENV_DATA__, content/bootstrap.js).
    if (window.bot_variables) {
      for (var k2 in window.bot_variables) {
        var v = window.bot_variables[k2];
        if (v && v.value) {
          dados.variables.push({
            id: v.value,
            name: v.name || v.value,
            parent: v.parent !== undefined && v.parent !== null ? String(v.parent) : null,
            fixa: !!v.fixed_var,
            tipo: v.data_type || 'text'
          });
        }
      }
    }

    // Listas que o nativo só monta dentro do formulário da ação: pede ao
    // próprio createAction (fora da tela) e lê as <option>. Checkpoints (9) e
    // entradas de envio (12, value = a entrada, texto "[Tipo] entrada").
    function opcoesDoFormularioNativo(tipo, nomeSelect, destino, rotulo) {
      if (typeof window.createAction !== 'function' || typeof window.$ === 'undefined') return;
      try {
        var dummy = window.$('<div><div class="actions"></div></div>');
        window.createAction(dummy, tipo, {});
        dummy.find('select[name="' + nomeSelect + '"]').first().find('option').each(function () {
          var val = window.$(this).val();
          if (val) destino.push({ id: val, name: window.$(this).text() });
        });
      } catch (e) {
        console.warn('[EDITOR_BOT] Aviso ao obter ' + rotulo + ' via createAction:', e);
      }
    }
    opcoesDoFormularioNativo('9', 'check_point', dados.checkpoints, 'checkpoints');
    opcoesDoFormularioNativo('12', 'entrances', dados.entrances, 'entradas de envio');

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

  // Labels de contato: a página não guarda a lista, o modal nativo busca na
  // API REST da Orpen (bot.php:1106-1174, `${BASE_URL_API}/labels`) com o
  // token da sessão. BASE_URL_API e userToken são `const` globais da página
  // (bot.php:1083-1086): visíveis daqui pelo nome, mas não em window.* e
  // nunca do lado da extensão. A busca roda aqui, no contexto da página, e só
  // a lista { id, name } vai para o DOM; o token não sai da página.
  var labelsCarregadas = null;

  // O formato da resposta da API não está no repositório da Orpen (serviço
  // separado); aceita lista direta ou embrulhada, e os nomes de campo mais
  // comuns.
  function listaDaResposta(res) {
    if (Array.isArray(res)) return res;
    if (!res || typeof res !== 'object') return null;
    var chaves = ['data', 'labels', 'items', 'rows', 'result', 'results'];
    for (var i = 0; i < chaves.length; i++) {
      var v = res[chaves[i]];
      if (Array.isArray(v)) return v;
      if (v && typeof v === 'object') {
        var dentro = listaDaResposta(v);
        if (dentro) return dentro;
      }
    }
    return null;
  }

  function normalizarLabels(res) {
    var lista = listaDaResposta(res) || [];
    return lista
      .map(function (l) {
        if (!l || typeof l !== 'object') return null;
        var id = l.id !== undefined ? l.id : (l.ID !== undefined ? l.ID : l.label_id);
        var nome = l.name != null ? l.name : (l.NAME != null ? l.NAME : (l.label != null ? l.label : (l.text != null ? l.text : l.title)));
        return id === undefined || id === null || nome == null ? null : { id: id, name: nome };
      })
      .filter(Boolean);
  }

  function aplicarLabels(res, origem) {
    var labels = normalizarLabels(res);
    if (!labels.length && listaDaResposta(res) === null) {
      console.warn('[EDITOR_BOT] Labels: resposta em formato inesperado (' + origem + '). Chaves:', res && typeof res === 'object' ? Object.keys(res) : typeof res);
      return false;
    }
    labelsCarregadas = labels.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    console.log('[EDITOR_BOT] Labels de contato carregadas (' + origem + '):', labelsCarregadas.length);
    gravarNoDOM();
    return true;
  }

  function lerGlobal(ler) {
    try { return ler(); } catch (e) { return undefined; }
  }

  // Busca página a página até acabar. `proxima(res, itens, pagina)` diz se
  // ainda há mais. Junta sem repetir (por id) e para em MAX_PAGINAS.
  var MAX_PAGINAS = 40;
  function buscarTodas(buscar, montarUrl, proxima) {
    var todas = [];
    var vistos = {};
    function pagina(n) {
      return buscar(montarUrl(n)).then(function (res) {
        var lista = listaDaResposta(res);
        if (lista === null) throw new Error('formato inesperado (chaves: ' + (res && typeof res === 'object' ? Object.keys(res).join(', ') : typeof res) + ')');
        var novos = 0;
        lista.forEach(function (l) {
          var id = l && (l.id !== undefined ? l.id : l.ID);
          if (id === undefined || vistos[id]) return;
          vistos[id] = true;
          todas.push(l);
          novos++;
        });
        // Sem nada novo: a API ignorou a paginação; evita laço infinito.
        if (novos && n < MAX_PAGINAS && proxima(res, lista, n)) return pagina(n + 1);
        return todas;
      });
    }
    return pagina(1);
  }

  function carregarLabels() {
    /* global BASE_URL_API, userToken, contactLabelsList */
    var base = lerGlobal(function () { return typeof BASE_URL_API !== 'undefined' ? BASE_URL_API : undefined; });
    var token = lerGlobal(function () { return typeof userToken !== 'undefined' ? userToken : undefined; });
    var daPagina = function (motivo) {
      // Último recurso: a lista que a própria página carrega ao abrir
      // (bot.php:1108-1119, 1511) vem de /labels/listall sem paginar, só a
      // primeira página (20 itens, `pagination.more`).
      var lista = lerGlobal(function () { return typeof contactLabelsList !== 'undefined' ? contactLabelsList : undefined; });
      console.warn('[EDITOR_BOT] Labels: ' + motivo + '; usando a lista da página, que pode estar incompleta.');
      if (lista) aplicarLabels(lista, 'lista da página');
    };
    if (!base || !token) {
      daPagina('BASE_URL_API/userToken não visíveis (' + typeof base + '/' + typeof token + ')');
      return;
    }
    var cabecalhos = { Authorization: 'Bearer ' + token };
    var buscar = function (url) {
      return fetch(url, { headers: cabecalhos }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' em ' + url.replace(base, ''));
        return r.json();
      });
    };
    var LIMITE = 500;
    // Indicadores comuns de "tem mais página" (o formato da API não está no
    // repositório): pagination.more (visto em /labels/listall), hasNextPage,
    // page < totalPages, ou a página veio cheia.
    var temMais = function (res, lista) {
      if (!res || typeof res !== 'object') return false;
      var meta = res.meta || res.pagination || res.data || res;
      if (res.pagination && res.pagination.more) return true;
      if (meta.hasNextPage || res.hasNextPage) return true;
      var pag = Number(meta.page || meta.currentPage || res.page);
      var total = Number(meta.totalPages || meta.lastPage || res.totalPages);
      if (pag && total) return pag < total;
      return lista.length >= LIMITE;
    };
    // 1) O mesmo endpoint do select do modal nativo (bot.php:1139-1158).
    buscarTodas(buscar, function (n) { return base + '/labels?page=' + n + '&limit=' + LIMITE + '&sortBy=name:ASC'; }, temMais)
      .then(function (todas) { aplicarLabels(todas, '/labels'); })
      .catch(function (err) {
        console.warn('[EDITOR_BOT] Labels: /labels falhou (' + err.message + '); tentando /labels/listall.');
        // 2) O endpoint que a página usa, seguindo `pagination.more`.
        return buscarTodas(buscar, function (n) { return base + '/labels/listall?page=' + n; }, temMais)
          .then(function (todas) { aplicarLabels(todas, '/labels/listall'); });
      })
      .catch(function (err) {
        daPagina('não foi possível buscar na API (' + err.message + ')');
      });
  }

  // Anexos do bot para a ação "Enviar anexo" (17): mesma chamada e mesmo
  // rótulo do select do modal nativo (bot.php:4348-4386):
  // `${BASE_URL_API}/bot/bot-attachment`, id = fileStorageId (o que o motor
  // lê em send_file, Bot.class.php:1563), texto "<tipo> - <título>".
  var anexosCarregados = null;
  var TIPO_ARQUIVO = { image: 'imagem', video: 'vídeo', audio: 'áudio' };

  function carregarAnexos() {
    /* global BASE_URL_API, userToken */
    var base = lerGlobal(function () { return typeof BASE_URL_API !== 'undefined' ? BASE_URL_API : undefined; });
    var token = lerGlobal(function () { return typeof userToken !== 'undefined' ? userToken : undefined; });
    if (!base) return;
    var cabecalhos = token ? { Authorization: 'Bearer ' + token } : {};
    fetch(base + '/bot/bot-attachment?search=&limit=99999', { headers: cabecalhos })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (res) {
        var lista = res && Array.isArray(res.data) ? res.data : (listaDaResposta(res) || []);
        anexosCarregados = lista
          .filter(function (f) { return f && f.fileStorageId != null; })
          .map(function (f) {
            var tipo = f.fileStorage && TIPO_ARQUIVO[f.fileStorage.fileType];
            return { id: f.fileStorageId, name: (tipo || '') + ' - ' + (f.title || f.fileStorageId) };
          });
        console.log('[EDITOR_BOT] Anexos do bot carregados:', anexosCarregados.length);
        gravarNoDOM();
      })
      .catch(function (err) {
        console.warn('[EDITOR_BOT] Não foi possível carregar os anexos do bot:', err);
      });
  }

  // Executa ao carregar
  gravarNoDOM();
  setTimeout(carregarAnexos, 1500);
  // Um pequeno atraso: o recurso final (a lista da própria página) só existe
  // depois que a página termina de carregar.
  setTimeout(carregarLabels, 1500);

  // Permite re-sincronizar quando requisitado
  document.addEventListener('__ORPEN_REQ_ENV_DATA__', gravarNoDOM);
})();
