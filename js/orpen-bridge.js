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
import { $, mostrarToast, escapeHtml } from './utils.js';
import { setRootNode, criarIcones, getRootNode, empilharEsc } from './dom-root.js';
import { avisarSeHouverNovaVersao } from './atualizacao.js';
import { abrirNovidades } from './novidades.js';
import { fromGetBotResponse, toUpdateBotPayload, serializeBracketNotation, payloadEsperadoNoServidor } from './orpen-adapter.js';
import { problemaAntesDeSalvar } from './validacao-salvar.js';
import { fotografarNumeros, mudancasDeNumero } from './renumeracao.js';
import { abrirBotView, pedirFecharBotView, definirGuardaFechar } from './bot-view-render.js';
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
  btn.disabled = state.fluxogramaGerando;
  btn.title = 'Gerar o fluxograma deste bot (como está salvo na plataforma)';
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
  // cima de uma tela que já tem o próprio teclado/foco da Orpen). Fica no
  // fundo da pilha: janelas e painéis abertos por cima tratam o Esc antes.
  // Com o editor escondido devolve false e o Esc segue pra página.
  empilharEsc(() => {
    const overlay = shadowRoot.getElementById('bot-view-overlay');
    if (!overlay || overlay.classList.contains('hidden')) return false;
    pedirFecharBotView();
  });
  definirGuardaFechar(confirmarFechar);
}

// Guarda do fechamento (X, clique fora, Esc): sem alteração não salva, fecha
// direto; com alteração, pergunta. Resolve true pra fechar.
let confirmacaoFecharAberta = false;
function confirmarFechar() {
  if (!temAlteracoesNaoSalvas()) return true;
  if (confirmacaoFecharAberta) return false;
  confirmacaoFecharAberta = true;

  return new Promise((resolve) => {
    const root = getRootNode();
    const fundo = document.createElement('div');
    fundo.className = 'fx-confirmacao';
    fundo.setAttribute('role', 'dialog');
    fundo.setAttribute('aria-modal', 'true');
    fundo.setAttribute('aria-labelledby', 'fc-titulo');
    fundo.innerHTML = `
      <div class="fx-confirmacao-painel">
        <h3 id="fc-titulo" class="fx-confirmacao-titulo">Fechar sem salvar?</h3>
        <p class="fx-confirmacao-texto">Este bot tem alterações que ainda não foram salvas na plataforma. Se fechar sem salvar, elas serão perdidas.</p>
        <div class="fx-confirmacao-acoes">
          <button type="button" data-acao="voltar" class="fx-btn-secundario">Continuar editando</button>
          <button type="button" data-acao="descartar" class="fx-btn-secundario">Descartar</button>
          <button type="button" data-acao="salvar" class="fx-btn-primario">Salvar e fechar</button>
        </div>
      </div>`;

    const terminar = (fechar) => {
      fundo.remove();
      soltarEsc();
      confirmacaoFecharAberta = false;
      resolve(fechar);
    };
    let salvando = false;
    const soltarEsc = empilharEsc(() => { if (!salvando) terminar(false); });

    fundo.addEventListener('click', async (e) => {
      const acao = e.target.closest('[data-acao]')?.dataset.acao;
      if (!acao) {
        if (e.target === fundo) terminar(false);
        return;
      }
      if (acao === 'voltar') return terminar(false);
      if (acao === 'descartar') return terminar(true);
      // Salvar: o painel some enquanto salva, pra o botão "Salvar" do rodapé
      // mostrar o andamento. Com erro (o toast já explica) ou com pendências
      // abertas pelo salvamento, o editor continua aberto.
      salvando = true;
      fundo.remove();
      const ok = await salvarBotNaOrpen();
      const pendencias = $('#pendencias-overlay');
      soltarEsc();
      confirmacaoFecharAberta = false;
      // Editou algo enquanto salvava? Isso não foi gravado: fica aberto.
      const editouDurante = ok && temAlteracoesNaoSalvas();
      if (editouDurante) mostrarToast('Houve alterações durante o salvamento. Salve de novo antes de fechar.');
      resolve(ok && !editouDurante && (!pendencias || pendencias.classList.contains('hidden')));
    });

    (root === document ? document.body : root).appendChild(fundo);
    fundo.querySelector('[data-acao="salvar"]').focus();
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

async function buscarBotCru(botId) {
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
  return raw;
}

// O "success" do updateBot não garante a gravação: Bot::update
// (Bot.class.php:199-264) apaga estados/transições/condições/ações e
// reinsere um a um, mas queryWithVariables não lança erro quando um INSERT
// falha — só devolve a mensagem —, então o que falhar some e o resto recebe
// commit, com "success" do mesmo jeito. Aqui o bot é relido e remontado no
// mesmo payload do envio: se não bater, algo não foi gravado.
// Condição/ação com tipo 0 (sem tipo) o servidor pula de propósito; elas
// saem do esperado e são contadas à parte (payloadEsperadoNoServidor).
async function conferirGravacao(botId, payloadEnviado) {
  const { esperado, descartados } = payloadEsperadoNoServidor(payloadEnviado);

  let raw;
  try {
    raw = await buscarBotCru(botId);
  } catch (err) {
    console.warn('[EDITOR_BOT] Não foi possível reler o bot para conferir o salvamento:', err);
    return { resultado: 'sem-conferir', descartados };
  }

  const gravado = serializeBracketNotation(toUpdateBotPayload(fromGetBotResponse(raw)));
  const enviado = serializeBracketNotation(esperado);
  if (gravado === enviado) return { resultado: 'ok', descartados };

  const partesG = gravado.split('&');
  const partesE = enviado.split('&');
  const i = partesE.findIndex((p, k) => p !== partesG[k]);
  console.error('[EDITOR_BOT] Bot gravado difere do enviado. Primeira diferença:', {
    enviado: decodeURIComponent(partesE[i] ?? '(fim)'),
    gravado: decodeURIComponent(partesG[i] ?? '(fim)'),
  });
  return { resultado: 'diferente', descartados };
}

// Foto dos números dos estados no último salvamento (ou carga): base do
// aviso de renumeração (js/renumeracao.js).
let numerosSalvos = null;

function registrarNumerosSalvos(bot) {
  numerosSalvos = fotografarNumeros(bot);
}

let renumeracaoAberta = false;
function confirmarRenumeracao({ mudados, excluidos, entrada }) {
  // Segundo clique em Salvar com o aviso aberto não abre outro.
  if (renumeracaoAberta) return Promise.resolve(false);
  renumeracaoAberta = true;
  return new Promise((resolve) => {
    const root = getRootNode();
    const LIMITE = 8;
    const linhas = [
      ...excluidos.map((e) => `<li><strong>${escapeHtml(e.alias || '(sem nome)')}</strong> (nº ${escapeHtml(e.numero)}) foi excluído</li>`),
      ...mudados.map((m) => `<li><strong>${escapeHtml(m.alias || '(sem nome)')}</strong>: nº ${escapeHtml(m.de)} → nº ${escapeHtml(m.para)}</li>`),
    ];
    const extras = linhas.length > LIMITE ? `<li>… e mais ${linhas.length - LIMITE}</li>` : '';

    const fundo = document.createElement('div');
    fundo.className = 'fx-confirmacao';
    fundo.setAttribute('role', 'alertdialog');
    fundo.setAttribute('aria-modal', 'true');
    fundo.setAttribute('aria-labelledby', 'rn-titulo');
    fundo.innerHTML = `
      <div class="fx-confirmacao-painel fx-alerta">
        <h3 id="rn-titulo" class="fx-confirmacao-titulo fx-alerta-titulo">Atenção: estados mudaram de número</h3>
        ${entrada ? `<p class="fx-alerta-entrada"><strong>A entrada do bot muda.</strong> Toda conversa nova começa no estado nº 0, que ${entrada.depois === null ? 'deixa de existir' : `passa a ser <strong>${escapeHtml(entrada.depois || '(sem nome)')}</strong>`} (era <strong>${escapeHtml(entrada.antes || '(sem nome)')}</strong>).</p>` : ''}
        <p class="fx-confirmacao-texto">Cada atendimento em andamento guarda <strong>só o número</strong> do estado em que o cliente está. Até 1 minuto depois de salvar, quem estiver parado num destes números passa a seguir o estado que ficou com aquele número, ou fica sem resposta se o número deixar de existir.</p>
        <ul class="fx-alerta-lista">${linhas.slice(0, LIMITE).join('')}${extras}</ul>
        <p class="fx-confirmacao-texto">Configurações <strong>fora do bot</strong> que apontam para um número de estado dele <strong>não são atualizadas</strong>. Confira depois: o failover das entradas com destino "estado" (inclusive integração com Facebook) e a inatividade do cliente e do agente nas configurações do ContactCenter.</p>
        <p class="fx-confirmacao-texto fx-alerta-dica">Se o bot está em uso agora, prefira salvar fora do horário de atendimento.</p>
        <div class="fx-confirmacao-acoes">
          <button type="button" data-acao="cancelar" class="fx-btn-secundario">Cancelar</button>
          <button type="button" data-acao="salvar" class="fx-btn-primario fx-btn-perigo">Salvar mesmo assim</button>
        </div>
      </div>`;

    const terminar = (salvar) => {
      fundo.remove();
      soltarEsc();
      renumeracaoAberta = false;
      resolve(salvar);
    };
    const soltarEsc = empilharEsc(() => terminar(false));
    fundo.addEventListener('click', (e) => {
      const acao = e.target.closest('[data-acao]')?.dataset.acao;
      if (acao) terminar(acao === 'salvar');
      else if (e.target === fundo) terminar(false);
    });

    (root === document ? document.body : root).appendChild(fundo);
    fundo.querySelector('[data-acao="cancelar"]').focus();
  });
}

// Devolve true se o bot foi gravado, false em qualquer falha — o botão
// "Salvar" ignora o retorno; o "Gerar fluxograma" usa pra só gerar depois de
// salvar com sucesso.
async function salvarBotNaOrpen() {
  const bot = state.botCarregado;
  if (!bot) return false;

  if (!bot.NAME || !String(bot.NAME).trim()) {
    mostrarToast('Preencha o Nome do Bot.');
    const input = $('#bv-nome');
    if (input) input.focus();
    return false;
  }

  const problema = problemaAntesDeSalvar(bot);
  if (problema) {
    mostrarToast('Não foi possível salvar: ' + problema);
    return false;
  }

  const renumeracao = mudancasDeNumero(bot, numerosSalvos);
  if (renumeracao && !(await confirmarRenumeracao(renumeracao))) return false;
  if (state.botCarregado !== bot) return false;

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

    // Falha de rede ou HTTP não diz se gravou: a requisição pode ter chegado
    // e sido processada. Resposta fora de JSON (aviso/erro do PHP impresso
    // antes do JSON) também não. Nos três casos a conferência decide.
    let falhaEnvio = null;
    let data = null;
    try {
      const res = await fetch('ajax.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body,
      });
      if (!res.ok) falhaEnvio = `HTTP ${res.status}`;
      else {
        try {
          data = await res.json();
        } catch { /* segue pra conferência */ }
      }
    } catch (err) {
      falhaEnvio = err.message;
      console.error('[EDITOR_BOT] Falha no envio do salvamento:', err);
    }

    if (data && data.status !== 'success') {
      const msg = data.message === 'duplicated'
        ? 'Conflito: já existe outro bot com esse número.'
        : data.message || 'Erro ao salvar (o servidor não deu detalhes).';
      mostrarToast('Erro ao salvar: ' + msg);
      return false;
    }

    label.textContent = 'Conferindo…';
    const conferencia = await conferirGravacao(bot.ID, payload);
    const motivo = falhaEnvio ? ` (${falhaEnvio})` : '';

    if (conferencia.resultado === 'diferente') {
      mostrarToast(falhaEnvio
        ? `Falha ao salvar${motivo}. O bot na plataforma não é o que está no editor: salve de novo antes de fechar.`
        : 'Atenção: a plataforma respondeu, mas o bot gravado não bate com o enviado. Não feche o editor: baixe o backup (Baixar) e salve de novo.');
      return false;
    }
    if (conferencia.resultado === 'sem-conferir' && (falhaEnvio || !data)) {
      mostrarToast(`Falha ao salvar${motivo}. Não foi possível confirmar se o bot foi gravado: salve de novo antes de fechar.`);
      return false;
    }

    const avisos = [];
    if (falhaEnvio) avisos.push(`A resposta do servidor falhou${motivo}, mas o bot foi conferido e está salvo.`);
    else if (conferencia.resultado === 'sem-conferir') avisos.push('Bot salvo, mas não foi possível conferir o que ficou gravado. Para confirmar, reabra o bot.');
    else avisos.push(conferencia.descartados ? 'Bot salvo.' : 'Bot salvo com sucesso na plataforma.');
    if (conferencia.descartados) {
      const n = conferencia.descartados;
      avisos.push(`${n} ${n === 1 ? 'condição/ação sem tipo foi ignorada' : 'condições/ações sem tipo foram ignoradas'} pela plataforma e não ${n === 1 ? 'aparecerá' : 'aparecerão'} ao reabrir.`);
    }
    mostrarToast(avisos.join(' '));
    // Se outro bot foi aberto enquanto este salvava, o que foi gravado não
    // é referência nem pendência dele.
    if (state.botCarregado !== bot) return true;
    // O que acabou de ser gravado é a nova referência de "sem alterações".
    state.baselineSalvo = body;
    registrarNumerosSalvos(bot);
    const pendencias = listarPendencias(bot);
    if (pendencias.length) abrirPendenciasModal(pendencias);
    return true;
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
let carregamentoAtual = 0;
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

  // O bot anterior sai de cena já: enquanto o novo carrega, a tela ainda
  // mostra o antigo, e um Salvar (ou "Salvar e fechar") ali gravaria edições
  // que a pessoa descartou ao fechar.
  state.botCarregado = null;
  state.baselineSalvo = null;
  numerosSalvos = null;
  const carregamento = ++carregamentoAtual;

  try {
    const raw = await buscarBotCru(botId);
    // Outro "Editar" foi clicado enquanto este carregava: vale o mais recente.
    if (carregamento !== carregamentoAtual) return;

    if (raw.openai_accounts) {
      if (!state.ambienteOrpen) state.ambienteOrpen = {};
      // Mesma fonte do modal nativo (bot.php:2792): cada conta traz os
      // assistentes em SETTINGS.assistants, usados na condição e na ação de I.A.
      state.ambienteOrpen.openAiAccounts = raw.openai_accounts.map((a) => ({
        id: a.ID,
        name: a.NAME || (a.SETTINGS && a.SETTINGS.name) || a.ID,
        assistants: (a.SETTINGS?.assistants || [])
          .filter((s) => s && s.id)
          .map((s) => ({ id: String(s.id), name: s.name || s.id })),
      }));
    }

    state.botCarregado = fromGetBotResponse(raw);
    abrirBotView(state.botCarregado);
    // Depois do abrirBotView: se o render normalizar algum campo, isso não
    // conta como alteração do usuário.
    state.baselineSalvo = assinaturaBot(state.botCarregado);
    registrarNumerosSalvos(state.botCarregado);
    atualizarBotaoFluxograma();
    if (titulo) titulo.innerHTML = `Editar Bot <span class="bv-badge-header-id">#${escapeHtml(state.botCarregado.ID)} — ${escapeHtml(state.botCarregado.NAME || '(sem nome)')}</span>`;
  } catch (err) {
    if (carregamento !== carregamentoAtual) return;
    console.error('[EDITOR_BOT] Falha ao carregar bot:', err);
    mostrarToast('Falha ao carregar bot: ' + err.message);
    overlay.classList.add('hidden');
  } finally {
    if (badge && carregamento === carregamentoAtual) badge.classList.add('hidden');
  }
}
