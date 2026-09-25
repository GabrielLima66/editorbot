// ---------------------------------------------------------------------------
// Orquestração do overlay quando o editor roda como extensão de navegador,
// injetado em cima de ContactCenter/bot.php da Orpen (ver content/bootstrap.js,
// que é quem chama abrirEditorOrpen() a partir da interceptação de clique).
//
// Responsabilidades deste módulo (só ele, os outros módulos do editor não
// sabem que estão rodando dentro de uma extensão):
//   1. Montar o host + shadow root na primeira vez que o overlay for aberto
//      (memorizado — clique em "Editar" de novo reaproveita o mesmo overlay).
//   2. Injetar o CSS (vendor/tailwind.css + css/styles.css) só dentro do
//      shadow root, isolado do Bootstrap/Metronic da página.
//   3. Buscar o esqueleto HTML do overlay (#bot-view-overlay +
//      #pendencias-overlay) a partir do próprio bot_transform.html — via
//      fetch + DOMParser, não copiado à mão aqui, pra não ter duas fontes de
//      verdade divergindo conforme o editor evolui (ver README/plano).
//   4. action=getBot (leitura, zero side effect) → fromGetBotResponse() →
//      abrirBotView() — reaproveita 100% do render/interações já existentes.
//   5. action=updateBot (escrita) a partir do botão "Salvar" acrescentado
//      só nesta cópia do esqueleto (a standalone continua só com "Baixar
//      JSON" — não tem servidor pra salvar de volta).
//
// Nunca toca em código da Orpen — só fetch() same-origin (herda o cookie de
// sessão PHPSESSID automaticamente) contra o ajax.php que a própria página já
// carrega.
// ---------------------------------------------------------------------------

import { state } from './state.js';
import { $, mostrarToast } from './utils.js';
import { setRootNode, criarIcones } from './dom-root.js';
import { avisarSeHouverNovaVersao } from './atualizacao.js';
import { abrirNovidades } from './novidades.js';
import { fromGetBotResponse, toUpdateBotPayload, serializeBracketNotation } from './orpen-adapter.js';
import { abrirBotView, fecharBotView } from './bot-view-render.js';
import { initBotViewWiring, listarPendencias, abrirPendenciasModal } from './bot-view-interactions.js';

const HOST_ID = 'orpen-editor-bot-host';

// Promessa memorizada: garante que a montagem (fetch de CSS/HTML + wiring)
// só acontece uma vez, mesmo se o usuário clicar em "Editar" várias vezes
// seguidas antes da primeira montagem terminar.
let montagemPromise = null;

function urlExtensao(caminho) {
  return chrome.runtime.getURL(caminho);
}

// Busca o próprio bot_transform.html (vendorizado dentro da extensão) e
// extrai só os dois overlays que interessam aqui — #bot-view-overlay e
// #pendencias-overlay. O resto da página standalone (upload, modal de
// transformação de JSON) não faz sentido no fluxo de edição ao vivo e não é
// injetado.
async function extrairEsqueletoOverlay() {
  const html = await fetch(urlExtensao('bot_transform.html')).then((r) => r.text());
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const botViewOverlay = doc.querySelector('#bot-view-overlay');
  const pendenciasOverlay = doc.querySelector('#pendencias-overlay');
  if (!botViewOverlay || !pendenciasOverlay) {
    throw new Error('bot_transform.html não tem a estrutura esperada (#bot-view-overlay/#pendencias-overlay não encontrados).');
  }

  // document.importNode: os elementos vieram de um Document criado pelo
  // DOMParser, diferente do document real — precisam ser "adotados" antes de
  // poder ser anexados na página de verdade.
  const botView = document.importNode(botViewOverlay, true);
  const pendencias = document.importNode(pendenciasOverlay, true);

  // z-index alto o bastante pra ficar acima de qualquer coisa que a tela do
  // Orpen já tenha (o valor original do standalone, z-50/z-[60], é baixo
  // demais pra garantir isso numa página host desconhecida).
  botView.classList.add('!z-[2147483000]');
  pendencias.classList.add('!z-[2147483001]');

  // Header ganha um indicador de carregamento — não existe no standalone
  // (lá os dados já estão em memória antes do usuário abrir o overlay; aqui
  // o fetch ainda está em voo no instante em que o overlay aparece).
  const header = botView.querySelector('.bv-header');
  const titulo = header?.querySelector('h2');
  if (titulo) titulo.id = 'bv-titulo-header';
  if (header) {
    header.insertAdjacentHTML(
      'beforeend',
      '<span id="bv-loading-badge" class="hidden text-xs bg-amber-500/20 text-amber-300 px-2.5 py-1 rounded-full font-medium ml-1">Carregando…</span>'
    );
    // insertAdjacentHTML acrescentou o badge no fim do header, depois do
    // botão de fechar (que também é o último filho) — reordena pra manter
    // "fechar" sempre por último, colado na borda direita (classe ml-auto).
    const fechar = header.querySelector('#btn-fechar-bot-view');
    const badge = header.querySelector('#bv-loading-badge');
    if (fechar && badge) header.insertBefore(badge, fechar);

    // Alternar tema claro/escuro (SPEC-tema-claro.md): logo antes do
    // "fechar". Os dois ícones ficam no DOM; o CSS mostra o do tema destino.
    if (fechar) {
      fechar.insertAdjacentHTML(
        'beforebegin',
        `<button id="btn-bv-tema" type="button" class="bv-btn-tema">
          <i data-lucide="sun" class="bv-icone-sol"></i>
          <i data-lucide="moon" class="bv-icone-lua"></i>
        </button>`
      );
    }
  }

  // Botão "Salvar", só existe nesta cópia (standalone não tem servidor pra
  // salvar de volta — só "Baixar JSON", que continua existindo aqui também
  // como backup manual antes de aplicar a mudança).
  const btnBaixar = botView.querySelector('#btn-bv-baixar');
  if (btnBaixar) {
    // Exportar fluxograma (SPEC-exportar-fluxograma.md): formato + botão, à
    // esquerda do "Backup JSON". Estilo próprio em css/styles.css — as
    // variantes disabled:/hover: do Tailwind não estão no CSS vendorizado.
    btnBaixar.insertAdjacentHTML(
      'beforebegin',
      `<div id="bv-fluxograma-grupo" class="bv-fluxograma-grupo">
        <select id="bv-fluxograma-formato" class="bv-fluxograma-formato" title="Formato do fluxograma. SVG: melhor para abrir no navegador.">
          <option value="png">PNG</option>
          <option value="svg">SVG</option>
        </select>
        <button id="btn-bv-fluxograma" type="button" class="bv-btn-fluxograma">
          <i data-lucide="workflow" id="btn-bv-fluxograma-icon"></i>
          <span id="btn-bv-fluxograma-spinner" class="bv-fluxograma-spinner hidden"></span>
          <span id="btn-bv-fluxograma-label">Gerar fluxograma</span>
        </button>
      </div>`
    );
    btnBaixar.innerHTML = '<i data-lucide="download" class="w-4.5 h-4.5"></i> Backup JSON';
    btnBaixar.title = 'Baixar uma cópia de segurança deste bot em JSON antes de salvar';
    btnBaixar.insertAdjacentHTML(
      'afterend',
      `<button id="btn-bv-salvar" type="button" class="flex items-center gap-2 text-sm font-medium text-white bg-primary rounded-lg px-5 py-2.5 transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed">
        <i data-lucide="save" class="w-4.5 h-4.5" id="btn-bv-salvar-icon"></i>
        <span id="btn-bv-salvar-spinner" class="hidden w-4.5 h-4.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
        <span id="btn-bv-salvar-label">Salvar</span>
      </button>`
    );
  }

  // Dica de atalho no rodapé — específica da extensão (Shift+clique só
  // existe aqui, standalone não intercepta clique nenhum).
  // Versão lida direto do manifest.json (fonte única de verdade — nunca
  // hardcoded aqui, pra não desalinhar do número real da extensão instalada
  // quando alguém esquecer de atualizar um dos dois lugares). Ver
  // CHANGELOG.md na raiz do EDITOR_BOT para o histórico de cada versão.
  const versao = chrome?.runtime?.getManifest?.().version;
  // A versão é também o botão "Novidades" (js/novidades.js): o histórico de
  // versões fica sempre a um clique, lido do CHANGELOG.md desta instalação.
  const versaoHtml = versao ? `<button type="button" id="bv-versao" class="bv-versao-btn" title="Ver as novidades de cada versão"><i data-lucide="sparkles"></i>v${versao} · Novidades</button><span class="text-[var(--text-faint)]">·</span>` : '';

  const footerLeft = botView.querySelector('#bv-footer-left');
  if (footerLeft) {
    footerLeft.innerHTML = `<div class="flex items-center gap-3"><span id="bv-contador-estados-transicoes" class="text-sm font-semibold text-[var(--text)]"></span>${versaoHtml}<span class="text-xs text-[var(--text-faint)]">Shift + clique em "Editar" abre o modal nativo antigo.</span></div>`;
  } else {
    const footer = botView.querySelector('.bv-footer');
    if (footer) {
      footer.insertAdjacentHTML(
        'afterbegin',
        `<div class="flex items-center gap-3"><span id="bv-contador-estados-transicoes" class="text-sm font-semibold text-[var(--text)]"></span>${versaoHtml}<span class="text-xs text-[var(--text-faint)]">Shift + clique em "Editar" abre o modal nativo antigo.</span></div>`
      );
    }
  }
  // Versão nova publicada? Aviso ao lado do número da versão (assíncrono,
  // não atrasa a montagem; sem internet não mostra nada).
  avisarSeHouverNovaVersao(botView, versao, temAlteracoesNaoSalvas);
  botView.querySelector('#bv-versao')?.addEventListener('click', () => abrirNovidades(versao));

  // O texto de #pendencias-overlay foi escrito pensando no fluxo de
  // import/export manual de JSON ("o JSON já foi baixado... depois de
  // importar"), que não existe aqui — o bot já está sendo editado ao vivo
  // neste mesmo ambiente. Ajusta só o texto, sem duplicar o resto do markup.
  const hint = pendencias.querySelector('.bv-hint');
  if (hint) {
    hint.textContent = 'Estes campos referenciam cadastros deste ambiente (fila, agente, script, conta OpenAI, etc.) e ficaram vazios. Revise antes de considerar o bot pronto:';
  }

  return { botView, pendencias };
}

async function montarOverlay() {
  if (montagemPromise) return montagemPromise;

  montagemPromise = (async () => {
    let host = document.getElementById(HOST_ID);
    if (host && host.shadowRoot) {
      return host.shadowRoot;
    }

    // Tema lido e aplicado antes de qualquer coisa ser desenhada: sem piscar
    // o escuro antes de virar claro.
    temaAtual = await carregarTemaSalvo();
    host = document.createElement('div');
    host.id = HOST_ID;
    if (temaAtual === 'claro') host.setAttribute('data-tema', 'claro');
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });

    // Registrado ANTES de qualquer $()/criarIcones() — o resto do editor lê
    // getRootNode() dinamicamente a cada chamada (ver js/dom-root.js).
    setRootNode(shadowRoot);

    const [twCss, stylesCss, { botView, pendencias }] = await Promise.all([
      fetch(urlExtensao('vendor/tailwind.css')).then((r) => r.text()),
      fetch(urlExtensao('css/styles.css')).then((r) => r.text()),
      extrairEsqueletoOverlay(),
    ]);

    const style = document.createElement('style');
    // Reset mínimo pro host em si — a página da Orpen não tem motivo pra
    // reservar espaço pro nosso <div> host fora do fluxo normal do layout.
    style.textContent = `:host { all: initial; }\n${twCss}\n${stylesCss}`;
    shadowRoot.appendChild(style);
    shadowRoot.appendChild(botView);
    shadowRoot.appendChild(pendencias);

    initBotViewWiring();
    ligarBotoesExtensao(shadowRoot);
    criarIcones();
    aplicarTema(); // título/aria do botão sol/lua

    return shadowRoot;
  })();

  return montagemPromise;
}

// ---------------------------------------------------------------------------
// Tema claro/escuro (SPEC-tema-claro.md). O atributo data-tema no host do
// Shadow DOM troca os valores dos tokens em css/styles.css, então editor,
// pendências, diálogo e toasts mudam juntos. Padrão: escuro.
//
// A escolha fica no chrome.storage.local da EXTENSÃO (permissão "storage"):
// vale para todos os ambientes (cada cliente é um domínio, e o localStorage
// é por domínio) e a página da Orpen não consegue apagar (ela pode limpar o
// próprio localStorage no login/logout). O localStorage continua como
// reserva e como origem da migração de quem já tinha escolhido o tema.
// ---------------------------------------------------------------------------
const CHAVE_TEMA = 'editorbot:tema';
let temaAtual = lerTemaLocal() || 'escuro';

function lerTemaLocal() {
  try {
    const v = localStorage.getItem(CHAVE_TEMA);
    return v === 'claro' || v === 'escuro' ? v : null;
  } catch {
    return null;
  }
}

async function carregarTemaSalvo() {
  try {
    const salvo = (await chrome.storage.local.get(CHAVE_TEMA))[CHAVE_TEMA];
    if (salvo === 'claro' || salvo === 'escuro') return salvo;
    // Primeira vez com o storage da extensão: leva a escolha antiga junto.
    const antigo = lerTemaLocal();
    if (antigo) await chrome.storage.local.set({ [CHAVE_TEMA]: antigo });
    return antigo || 'escuro';
  } catch {
    return lerTemaLocal() || 'escuro';
  }
}

// Trocou o tema em outra aba/ambiente: acompanha aqui também.
try {
  chrome.storage.onChanged.addListener((mudancas, area) => {
    const novo = area === 'local' && mudancas[CHAVE_TEMA]?.newValue;
    if ((novo === 'claro' || novo === 'escuro') && novo !== temaAtual) {
      temaAtual = novo;
      aplicarTema({ animar: true });
    }
  });
} catch {
  // sem chrome.storage (contexto invalidado): segue só com o localStorage
}

function aplicarTema({ animar = false } = {}) {
  const host = document.getElementById(HOST_ID);
  if (!host) return;
  if (animar) {
    host.classList.add('tema-trocando');
    setTimeout(() => host.classList.remove('tema-trocando'), 250);
  }
  if (temaAtual === 'claro') host.setAttribute('data-tema', 'claro');
  else host.removeAttribute('data-tema');

  const btn = host.shadowRoot?.getElementById('btn-bv-tema');
  if (btn) {
    const claro = temaAtual === 'claro';
    btn.title = claro ? 'Mudar para o tema escuro' : 'Mudar para o tema claro';
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('aria-pressed', String(claro));
  }
}

function alternarTema() {
  temaAtual = temaAtual === 'claro' ? 'escuro' : 'claro';
  try { chrome.storage.local.set({ [CHAVE_TEMA]: temaAtual }); } catch { /* contexto invalidado */ }
  try { localStorage.setItem(CHAVE_TEMA, temaAtual); } catch { /* sem localStorage */ }
  aplicarTema({ animar: true });
}

// Exatamente o que o "Salvar" enviaria ao servidor — comparar com a versão
// gravada em state.baselineSalvo diz se há alteração não salva, sem flag de
// "sujo" espalhada pelo editor.
function assinaturaBot(bot) {
  return serializeBracketNotation(toUpdateBotPayload(bot));
}

function temAlteracoesNaoSalvas() {
  const bot = state.botCarregado;
  return !!bot && assinaturaBot(bot) !== state.baselineSalvo;
}

function atualizarBotaoFluxograma() {
  const btn = $('#btn-bv-fluxograma');
  if (!btn) return;
  const novo = !!state.botCarregado?._isNewBot;
  btn.disabled = novo || state.fluxogramaGerando;
  btn.title = novo
    ? 'Salve o bot pela primeira vez para gerar o fluxograma'
    : 'Gerar o fluxograma deste bot (como está salvo na plataforma)';
}

function ligarBotoesExtensao(shadowRoot) {
  shadowRoot.getElementById('btn-bv-salvar').addEventListener('click', salvarBotNaOrpen);
  shadowRoot.getElementById('btn-bv-baixar').addEventListener('click', baixarBotJson);
  shadowRoot.getElementById('btn-bv-tema')?.addEventListener('click', alternarTema);

  // Módulo carregado só no primeiro clique: quem nunca gera fluxograma não
  // paga nada (nem o iframe de vendor/fluxograma/ é criado).
  shadowRoot.getElementById('btn-bv-fluxograma').addEventListener('click', () => {
    import('./fluxograma-export.js')
      .then((m) =>
        m.gerarFluxograma({
          formato: shadowRoot.getElementById('bv-fluxograma-formato').value,
          salvar: salvarBotNaOrpen,
          temAlteracoesNaoSalvas,
          atualizarBotao: atualizarBotaoFluxograma,
        })
      )
      .catch((err) => {
        console.error('[EDITOR_BOT] Falha ao carregar o gerador de fluxograma:', err);
        mostrarToast('Não foi possível carregar o gerador de fluxograma.');
      });
  });

  // Esc fecha o overlay — só faz sentido no modo extensão (injetado por
  // cima de uma tela que já tem o próprio teclado/foco da Orpen).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const overlay = shadowRoot.getElementById('bot-view-overlay');
    if (overlay && !overlay.classList.contains('hidden')) fecharBotView();
  });
}

function baixarBotJson() {
  const bot = state.botCarregado;
  if (!bot) return;
  const nomeArquivo = `bot_${bot.ID || 'sem-id'}_${(bot.NAME || 'sem-nome').replace(/[^a-zA-Z0-9_-]+/g, '_')}.json`;
  const blob = new Blob([JSON.stringify(bot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
  mostrarToast('Backup baixado: ' + nomeArquivo);
}

// Devolve true se o bot foi gravado, false em qualquer falha — o botão
// "Salvar" ignora o retorno; o "Gerar fluxograma" usa pra só gerar depois de
// salvar com sucesso.
async function salvarBotNaOrpen() {
  const bot = state.botCarregado;
  if (!bot) return false;

  if (!bot.ID || !String(bot.ID).trim()) {
    mostrarToast('Preencha o Número do Bot (ID).');
    const input = $('#bv-numero');
    if (input) input.focus();
    return false;
  }

  if (!bot.NAME || !String(bot.NAME).trim()) {
    mostrarToast('Preencha o Nome do Bot.');
    const input = $('#bv-nome');
    if (input) input.focus();
    return false;
  }

  const botaoSalvar = $('#btn-bv-salvar');
  const label = $('#btn-bv-salvar-label');
  const textoOriginal = label.textContent;
  botaoSalvar.disabled = true;
  label.textContent = 'Salvando…';
  const icon = $('#btn-bv-salvar-icon');
  const spinner = $('#btn-bv-salvar-spinner');
  if (icon) icon.classList.add('hidden');
  if (spinner) spinner.classList.remove('hidden');

  try {
    const payload = toUpdateBotPayload(bot);
    const body = serializeBracketNotation(payload);

    const res = await fetch('ajax.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error('Resposta do servidor não veio em JSON — provável erro PHP (veja a aba Network).');
    }

    if (data && data.status === 'success') {
      // O que acabou de ser gravado é a nova referência de "sem alterações".
      state.baselineSalvo = body;
      mostrarToast('Bot salvo com sucesso na plataforma.');
      if (bot._isNewBot) {
        bot._isNewBot = false;
        // Recarrega a página para o bot novo aparecer na listagem da Orpen
        setTimeout(() => window.location.reload(), 1500);
      } else {
        const pendencias = listarPendencias(bot);
        if (pendencias.length) abrirPendenciasModal(pendencias);
      }
      return true;
    } else {
      const msg = data && data.message === 'duplicated'
        ? 'Conflito: já existe outro bot com esse número.'
        : (data && data.message) || 'Erro ao salvar (o servidor não deu detalhes).';
      mostrarToast('Erro ao salvar: ' + msg);
      return false;
    }
  } catch (err) {
    mostrarToast('Falha ao salvar: ' + err.message);
    console.error('[EDITOR_BOT] Falha em salvarBotNaOrpen:', err);
    return false;
  } finally {
    botaoSalvar.disabled = false;
    label.textContent = textoOriginal;
    const icon = $('#btn-bv-salvar-icon');
    const spinner = $('#btn-bv-salvar-spinner');
    if (icon) icon.classList.remove('hidden');
    if (spinner) spinner.classList.add('hidden');
  }
}

// ---------------------------------------------------------------------------
// Ponto de entrada chamado pelo content script (content/bootstrap.js) a cada
// clique em "Editar". Idempotente em relação à montagem (montarOverlay() é
// barata depois da primeira vez); NÃO é idempotente em relação ao fetch do
// bot — cada chamada busca a versão atual do bot no servidor.
// ---------------------------------------------------------------------------
export async function abrirEditorOrpenNovo(envData = null) {
  if (envData) {
    state.ambienteOrpen = envData;
  }

  await montarOverlay();

  const overlay = $('#bot-view-overlay');
  const badge = $('#bv-loading-badge');
  const titulo = $('#bv-titulo-header');

  overlay.classList.remove('hidden');
  if (badge) badge.classList.add('hidden'); // Sem load de fetch

  // Cria a estrutura vazia de um bot novo
  state.botCarregado = fromGetBotResponse({
    ID: '',
    NAME: '',
    STATUS: '1',
    TIME_ANSWER: '300',
    TIMEOUT_DELAY: '1800',
    CONF_DELIVERY_TIME: '1800',
    openai_accounts: state.ambienteOrpen?.openAiAccounts || []
  });

  // Flag puramente local pro UI saber como se comportar
  state.botCarregado._isNewBot = true;
  state.baselineSalvo = null;

  abrirBotView(state.botCarregado);
  atualizarBotaoFluxograma();
  if (titulo) titulo.innerHTML = `Novo Bot <span class="bv-badge-header-id">Preencha os dados básicos</span>`;
}
export async function abrirEditorOrpen(botId, envData = null) {
  if (envData) {
    state.ambienteOrpen = envData;
  }

  await montarOverlay();

  const overlay = $('#bot-view-overlay');
  const badge = $('#bv-loading-badge');
  const titulo = $('#bv-titulo-header');

  // Mostra o overlay já em estado de carregamento (em vez de esperar o
  // fetch terminar) — feedback imediato pro clique do usuário.
  overlay.classList.remove('hidden');
  if (badge) badge.classList.remove('hidden');
  if (titulo) titulo.textContent = `Carregando bot #${botId}…`;

  try {
    const res = await fetch('ajax.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: `action=getBot&id=${encodeURIComponent(botId)}`,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    let raw;
    try {
      raw = await res.json();
    } catch {
      throw new Error('Resposta do servidor não veio em JSON.');
    }
    if (!raw || raw.ID === undefined) {
      throw new Error('Bot não encontrado ou resposta em formato inesperado.');
    }

    if (raw.openai_accounts) {
      if (!state.ambienteOrpen) state.ambienteOrpen = {};
      state.ambienteOrpen.openAiAccounts = raw.openai_accounts.map((a) => ({
        id: a.ID,
        name: a.NAME || (a.SETTINGS && a.SETTINGS.name) || a.ID,
      }));
    }

    state.botCarregado = fromGetBotResponse(raw);
    abrirBotView(state.botCarregado);
    // Depois do abrirBotView: se o render normalizar algum campo, isso não
    // conta como alteração do usuário.
    state.baselineSalvo = assinaturaBot(state.botCarregado);
    atualizarBotaoFluxograma();
    if (titulo) titulo.innerHTML = `Editar Bot <span class="bv-badge-header-id">#${state.botCarregado.ID} — ${state.botCarregado.NAME || '(sem nome)'}</span>`;
  } catch (err) {
    console.error('[EDITOR_BOT] Falha ao carregar bot:', err);
    mostrarToast('Falha ao carregar bot: ' + err.message);
    overlay.classList.add('hidden');
  } finally {
    if (badge) badge.classList.add('hidden');
  }
}
