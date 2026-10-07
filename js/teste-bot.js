// ---------------------------------------------------------------------------
// Testar o bot no editor: modal com a lista de estados (onde a conversa está e
// por onde já passou) e três abas: Conversa, Detalhes (o que o motor avaliou em
// cada rodada) e Contexto (dados que o simulador não tem). A lógica está em
// simulador.js; nada daqui altera ou salva o bot.
//
// O modal é criado por aqui (como o painel do Localizar), então não depende da
// lista de blocos que orpen-bridge.js injeta a partir do bot_transform.html.
// ---------------------------------------------------------------------------
import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { getRootNode, criarIcones, empilharEsc, marcarCamposSemAutopreenchimento } from './dom-root.js';
import {
  criarSessao, enviarMensagem, continuar, continuarDaParada, definirExterna, responderCallback, simularTimeout, requisitosDeContexto, variaveisUsadas,
} from './simulador.js';
import { opcoesCrmStatus, opcoesEntradasCondicao } from './orpen-env.js';

const $r = (sel) => getRootNode().querySelector(sel);
const modalEl = () => $r('#tb-overlay');

// webchatEnvia: o que o bot recebe quando o visitante clica numa opção de menu do WebChat. Não se sabe
// pelo código da Orpen (o widget fica fora do repositório), então é escolha de quem testa.
// inicio: ponto de partida do teste (estado, parada, variáveis e erros que o cliente já teria); vale ao reiniciar.
const tb = { aberto: false, sessao: null, assinatura: '', aba: 'conversa', soltarEsc: null, webchatEnvia: 'value', inicio: { botId: null, estado: '0', parada: null, variaveis: {}, erros: 0 } };

const ABAS = [
  { id: 'conversa', rotulo: 'Conversa' },
  { id: 'detalhes', rotulo: 'Detalhes' },
  { id: 'contexto', rotulo: 'Contexto' },
];

const TIPOS_ENTRADA = [
  { value: '1', label: 'WhatsApp' }, { value: '2', label: 'E-mail' }, { value: '3', label: 'Facebook' },
  { value: '6', label: 'Webchat' }, { value: '7', label: 'Instagram' }, { value: '8', label: 'Telegram' },
];
const SIM_NAO = [{ value: 'sim', label: 'Sim' }, { value: 'nao', label: 'Não' }];

/** Escolhas predefinidas do dado pedido (viram botões); null = texto livre. */
function opcoesDoRequisito(r) {
  if (r.tipo === 'bool') return SIM_NAO;
  if (r.chave === 'entrance_type') return TIPOS_ENTRADA;
  if (r.chave === 'status_last_att') { const o = opcoesCrmStatus(); return o.length ? o : null; }
  if (r.chave === 'entrance') { const o = opcoesEntradasCondicao(); return o.length ? o : null; }
  return null;
}

const assinaturaDoBot = (bot) => JSON.stringify([bot.BOT_STATES, bot.BOT_TRANSITIONS, bot.BOT_CONDITIONS, bot.BOT_ACTIONS, bot.TIMEOUT_ACTION, bot.TIMEOUT_DESTINY, bot.TIMEOUT_MESSAGE]);
const porNumero = (a, b) => (parseInt(a.STATE_NUMBER, 10) || 0) - (parseInt(b.STATE_NUMBER, 10) || 0);
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// ---- ciclo -----------------------------------------------------------------

function iniciar() {
  const bot = state.botCarregado;
  // Mantém o contexto escolhido, menos as respostas dadas só para uma rodada (chave ...:rN).
  const externas = tb.sessao ? Object.fromEntries(Object.entries(tb.sessao.contexto.externas).filter(([k]) => !/:r\d+$/.test(k))) : {};
  tb.sessao = criarSessao(bot, {
    externas,
    contato: tb.sessao ? tb.sessao.contexto.contato : undefined,
    inicio: tb.inicio.estado,
    parada: tb.inicio.parada,
    variaveis: tb.inicio.variaveis,
    erros: tb.inicio.erros,
  });
  tb.assinatura = assinaturaDoBot(bot);
  const estado = (bot.BOT_STATES || []).find((s) => String(s.STATE_NUMBER) === String(tb.inicio.estado));
  if (estado) {
    const meio = String(tb.inicio.estado) !== '0';
    const partes = [meio ? `Teste começando no meio do fluxo, no estado ${tb.inicio.estado} (${estado.ALIAS || 'sem nome'}).` : `Conversa nova no estado 0 (${estado.ALIAS || 'sem nome'}).`];
    const nVars = Object.keys(tb.inicio.variaveis).length;
    if (nVars) partes.push(`Com ${plural(nVars, 'variável já guardada', 'variáveis já guardadas')}.`);
    if (tb.inicio.erros) partes.push(`Contador de erros em ${tb.inicio.erros}.`);
    if (tb.inicio.parada !== null) partes.push(`O teste para ao chegar no estado ${tb.inicio.parada}.`);
    partes.push('Escreva como o cliente.');
    tb.sessao.eventos.push({ tipo: 'sistema', nivel: 'info', texto: partes.join(' ') });
  }
}

export function abrirTeste() {
  const bot = state.botCarregado;
  if (!bot) return;
  montar();
  tb.aberto = true;
  tb.aba = 'conversa';
  tb.sessao = null;
  // O ponto de partida é de um bot só: ao abrir outro, começa do zero (senão estado, parada e variáveis vazariam).
  const idBot = String(bot.ID ?? '');
  if (tb.inicio.botId !== idBot) tb.inicio = { botId: idBot, estado: '0', parada: null, variaveis: {}, erros: 0 };
  // O bot pode ter mudado desde a última vez: início e parada que não existem mais voltam ao padrão.
  const existe = (n) => (bot.BOT_STATES || []).some((s) => String(s.STATE_NUMBER) === String(n));
  if (!existe(tb.inicio.estado)) tb.inicio.estado = '0';
  if (tb.inicio.parada !== null && !existe(tb.inicio.parada)) tb.inicio.parada = null;
  iniciar();
  modalEl().classList.remove('hidden');
  if (!tb.soltarEsc) tb.soltarEsc = empilharEsc(fechar);
  desenhar();
  $r('#tb-entrada')?.focus();
}

function fechar() {
  tb.aberto = false;
  modalEl()?.classList.add('hidden');
  if (tb.soltarEsc) { tb.soltarEsc(); tb.soltarEsc = null; }
}

// ---- montagem --------------------------------------------------------------

function montar() {
  if (modalEl()) return;
  const overlay = $r('#bot-view-overlay');
  if (!overlay) return;
  overlay.insertAdjacentHTML('beforeend', `
    <div id="tb-overlay" class="tb-overlay hidden">
      <div class="tb-painel" role="dialog" aria-modal="true" aria-labelledby="tb-titulo">
        <div class="tb-topo">
          <h2 id="tb-titulo" class="tb-titulo">Testar bot</h2>
          <span id="tb-alterado" class="tb-alterado hidden">O bot mudou depois do início do teste</span>
          <button type="button" class="tb-btn" data-tb="reiniciar" title="Começa uma conversa nova (mantém o contexto)"><i data-lucide="rotate-ccw"></i> Reiniciar</button>
          <button type="button" class="tb-btn" data-tb="timeout" title="Simula o tempo esgotado do bot (ação configurada em Timeout)"><i data-lucide="timer"></i> Timeout</button>
          <button type="button" class="tb-fechar" data-tb="fechar" title="Fechar (Esc)" aria-label="Fechar"><i data-lucide="x"></i></button>
        </div>
        <div class="tb-corpo">
          <aside class="tb-estados">
            <h3>Estados</h3>
            <ol id="tb-lista" class="tb-lista"></ol>
          </aside>
          <section class="tb-direita">
            <div id="tb-caminho" class="tb-caminho"></div>
            <div class="tb-abas" role="tablist">${ABAS.map((a) => `<button type="button" class="tb-aba" role="tab" data-aba="${a.id}" aria-selected="false">${a.rotulo}</button>`).join('')}</div>
            <div class="tb-aba-corpo" data-aba-corpo="conversa">
              <div id="tb-chat" class="tb-chat" aria-live="polite"></div>
              <div id="tb-banner" class="tb-banner hidden"></div>
              <form id="tb-form" class="tb-form" autocomplete="off">
                <input id="tb-entrada" class="tb-entrada" type="text" placeholder="Escreva como o cliente" aria-label="Mensagem do cliente">
                <button type="submit" class="tb-enviar">Enviar</button>
              </form>
            </div>
            <div class="tb-aba-corpo hidden" data-aba-corpo="detalhes"><div id="tb-detalhes" class="tb-detalhes"></div></div>
            <div class="tb-aba-corpo hidden" data-aba-corpo="contexto"><div id="tb-contexto" class="tb-contexto"></div></div>
          </section>
        </div>
      </div>
    </div>`);
  const m = modalEl();
  marcarCamposSemAutopreenchimento(m);

  let comecouNoFundo = false;
  m.addEventListener('mousedown', (e) => { comecouNoFundo = e.target === m; });
  m.addEventListener('click', (e) => {
    if (e.target === m) { if (comecouNoFundo) fechar(); return; }
    const aba = e.target.closest('.tb-aba');
    if (aba) { tb.aba = aba.dataset.aba; desenhar(); return; }
    // Testar só um trecho: ▶ começa neste estado, ⚑ marca onde parar. Os dois reiniciam a conversa.
    const comecar = e.target.closest('[data-tb-inicio]');
    if (comecar) { tb.inicio.estado = comecar.dataset.tbInicio; iniciar(); desenhar(); devolverFoco('data-tb-inicio', comecar.dataset.tbInicio); return; }
    const parar = e.target.closest('[data-tb-parada]');
    if (parar) { const n = parar.dataset.tbParada; tb.inicio.parada = tb.inicio.parada === n ? null : n; iniciar(); desenhar(); devolverFoco('data-tb-parada', n); return; }
    const acao = e.target.closest('[data-tb]')?.dataset.tb;
    if (acao === 'fechar') fechar();
    else if (acao === 'reiniciar') { tb.aba = 'conversa'; iniciar(); desenhar(); $r('#tb-entrada')?.focus(); }
    else if (acao === 'timeout') { simularTimeout(tb.sessao); desenhar(); }
    else if (acao === 'continuar-parada') { continuarDaParada(tb.sessao); desenhar(); }
    else if (acao === 'cb-ok' || acao === 'cb-falha') callback(acao === 'cb-ok', $r('#tb-cb-texto')?.value.trim() || '');
    else if (acao === 'ctx-opcao') responderContexto(e.target.closest('[data-tb]').dataset.valor);
    else if (acao === 'ctx-texto') responderContexto($r('#tb-ctx-valor')?.value.trim());
    const botao = e.target.closest('[data-tb-id]');
    if (botao) enviar(botao.dataset.tbId, botao.dataset.tbTitulo);
    const web = e.target.closest('[data-tb-webchat]');
    if (web) {
      tb.webchatEnvia = web.dataset.tbWebchat;
      web.parentElement.querySelectorAll('[data-tb-webchat]').forEach((b) => b.setAttribute('aria-pressed', String(b === web)));
      desenharChat(tb.sessao);
    }
    // Aba Contexto: escolha por botões. Clicar de novo no marcado desfaz ("perguntar quando precisar").
    const op = e.target.closest('[data-ctx-valor]');
    if (op) {
      const grupo = op.closest('[data-ctx]');
      const chave = grupo.dataset.ctx;
      const marcado = op.getAttribute('aria-pressed') === 'true';
      if (marcado) delete tb.sessao.contexto.externas[chave];
      else definirExterna(tb.sessao, chave, op.dataset.ctxValor);
      grupo.querySelectorAll('[data-ctx-valor]').forEach((b) => b.setAttribute('aria-pressed', String(!marcado && b === op)));
    }
  });

  // Enter confirma o campo em que você está, como no WhatsApp; em branco não faz nada.
  m.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    if (e.target.id === 'tb-cb-texto') {
      e.preventDefault();
      const t = e.target.value.trim();
      if (t) callback(true, t);
    } else if (e.target.id === 'tb-ctx-valor') {
      e.preventDefault();
      responderContexto(e.target.value.trim());
    }
  });

  // Nada em branco: o Enviar só liga com texto, e "Continuar" também.
  m.addEventListener('input', (e) => {
    if (e.target.id === 'tb-entrada') atualizarEnviar();
    else if (e.target.id === 'tb-ctx-valor') {
      const b = m.querySelector('[data-tb="ctx-texto"]');
      if (b) b.disabled = !e.target.value.trim();
    }
  });

  m.querySelector('#tb-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const campo = $r('#tb-entrada');
    const texto = campo.value.trim(); // o WhatsApp tira os espaços das pontas e não manda mensagem vazia
    if (!texto) return;
    campo.value = '';
    enviar(texto);
  });

  m.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.ctx) {
      const v = el.value;
      if (v === '') delete tb.sessao.contexto.externas[el.dataset.ctx];
      else definirExterna(tb.sessao, el.dataset.ctx, v);
    } else if (el.dataset.contato) {
      tb.sessao.contexto.contato[el.dataset.contato] = el.value;
    } else if (el.dataset.inicioVar !== undefined) {
      const v = el.value.trim();
      if (v === '') delete tb.inicio.variaveis[el.dataset.inicioVar];
      else tb.inicio.variaveis[el.dataset.inicioVar] = v;
    } else if (el.dataset.inicioErros !== undefined) {
      tb.inicio.erros = Math.max(0, parseInt(el.value, 10) || 0);
      el.value = String(tb.inicio.erros);
    }
  });
  criarIcones();
}

// A lista é refeita a cada clique em ▶/⚑: devolve o foco do teclado ao botão que foi acionado.
function devolverFoco(atributo, valor) {
  [...modalEl().querySelectorAll(`[${atributo}]`)].find((b) => b.getAttribute(atributo) === valor)?.focus();
}

function callback(ok, texto) {
  responderCallback(tb.sessao, { ok, texto });
  desenhar();
}

function responderContexto(valor) {
  if (!valor) return;
  definirExterna(tb.sessao, tb.sessao.requisitos[0]?.chave, valor);
  continuar(tb.sessao);
  desenhar();
}

function atualizarEnviar() {
  const campo = $r('#tb-entrada');
  const botao = modalEl()?.querySelector('.tb-enviar');
  if (campo && botao) botao.disabled = campo.disabled || !campo.value.trim();
}

function enviar(texto, exibir) {
  if (!tb.sessao) return;
  enviarMensagem(tb.sessao, texto, exibir);
  desenhar();
  $r('#tb-entrada')?.focus();
}

// ---- desenho ---------------------------------------------------------------

function desenhar() {
  const m = modalEl();
  if (!m || !tb.sessao) return;
  const s = tb.sessao;
  m.querySelectorAll('.tb-aba').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.aba === tb.aba)));
  m.querySelectorAll('[data-aba-corpo]').forEach((c) => c.classList.toggle('hidden', c.dataset.abaCorpo !== tb.aba));
  $r('#tb-alterado').classList.toggle('hidden', assinaturaDoBot(state.botCarregado) === tb.assinatura);
  desenharEstados(s);
  desenharCaminho(s);
  desenharChat(s);
  desenharBanner(s);
  desenharDetalhes(s);
  desenharContexto(s);
  const livre = s.status === 'ativa';
  $r('#tb-entrada').disabled = !livre;
  atualizarEnviar();
  criarIcones();
}

function desenharEstados(s) {
  const estados = [...s.bot.BOT_STATES].sort(porNumero);
  const lista = $r('#tb-lista');
  lista.innerHTML = estados.map((e) => {
    const n = String(e.STATE_NUMBER);
    const atual = String(s.estado) === n;
    const vezes = s.visitas[n] || 0;
    const classe = `tb-estado${atual ? ' atual' : ''}${vezes ? ' visitado' : ''}`;
    const marca = atual
      ? `<span class="tb-aqui">${s.motivoFim === 'parada' ? 'parou' : s.status === 'encerrada' ? 'fim' : s.status === 'aguardando' ? 'espera' : 'aqui'}</span>`
      : (vezes ? `<span class="tb-visitas" title="Passou por aqui ${plural(vezes, 'vez', 'vezes')}">${vezes > 1 ? `×${vezes}` : '✓'}</span>` : '');
    const ehInicio = String(tb.inicio.estado) === n;
    const ehParada = tb.inicio.parada === n;
    const tags = `${ehInicio && n !== '0' ? '<span class="tb-tag" title="O teste começou aqui">início</span>' : ''}${s.parada === n ? '<span class="tb-tag parada" title="O teste para ao chegar aqui">parada</span>' : ''}`;
    const acoesEstado = `<span class="tb-acoes-estado"><button type="button" class="tb-mini${ehInicio ? ' ativo' : ''}" data-tb-inicio="${escapeHtml(n)}" title="Começar o teste neste estado (reinicia a conversa)" aria-label="Começar o teste no estado ${escapeHtml(n)}">▶</button><button type="button" class="tb-mini${ehParada ? ' ativo' : ''}" data-tb-parada="${escapeHtml(n)}" aria-pressed="${ehParada}" title="${ehParada ? 'Tirar o ponto de parada (reinicia a conversa)' : 'Parar o teste ao chegar neste estado (reinicia a conversa)'}" aria-label="Ponto de parada no estado ${escapeHtml(n)}">⚑</button></span>`;
    return `<li class="${classe}" data-estado="${escapeHtml(n)}"><span class="tb-num">${escapeHtml(n)}</span><span class="tb-alias" title="${escapeHtml(e.ALIAS)}">${escapeHtml(e.ALIAS || 'Sem nome')}</span>${tags}${acoesEstado}${marca}</li>`;
  }).join('');
  lista.querySelector('.atual')?.scrollIntoView({ block: 'nearest' });
}

function desenharCaminho(s) {
  const c = s.caminho;
  const ultimos = c.length > 14 ? ['…', ...c.slice(-13)] : c;
  $r('#tb-caminho').innerHTML = `<span class="tb-caminho-rotulo">Caminho</span>${ultimos.map((n, i) => (n === '…' ? '<span class="tb-passo">…</span>' : `<span class="tb-passo${i === ultimos.length - 1 ? ' atual' : ''}">${escapeHtml(n)}</span>`)).join('<i data-lucide="chevron-right" class="tb-seta"></i>')}`;
}

function bolhaMenu(e) {
  const mod = e.modelo;
  const titulo = (txt, cls) => (txt ? `<div class="${cls}">${escapeHtml(txt)}</div>` : '');
  const enviado = (it) => (mod.kind === 'webchat' && tb.webchatEnvia === 'texto' ? it.title : (it.id || it.title));
  const chips = e.itens.map((it) => `<button type="button" class="tb-chip" data-tb-id="${escapeHtml(enviado(it))}" data-tb-titulo="${escapeHtml(it.title)}" title="Envia: ${escapeHtml(enviado(it))}">${escapeHtml(it.title || '(sem título)')}${it.description ? `<small>${escapeHtml(it.description)}</small>` : ''}</button>`).join('');
  if (mod.kind === 'unknown') return `<div class="tb-bolha bot"><em>Menu em formato não reconhecido</em></div>`;
  return `<div class="tb-bolha bot">${titulo(mod.header, 'tb-menu-cab')}${titulo(mod.body, 'tb-menu-corpo')}${titulo(mod.footer, 'tb-menu-rodape')}${mod.kind === 'whatsapp_list' && mod.button ? `<div class="tb-menu-lista">${escapeHtml(mod.button)}</div>` : ''}<div class="tb-chips">${chips}</div></div>`;
}

function desenharChat(s) {
  const chat = $r('#tb-chat');
  const rolouAoFim = chat.scrollTop + chat.clientHeight >= chat.scrollHeight - 30;
  chat.innerHTML = s.eventos.map((e) => {
    if (e.tipo === 'cliente') return `<div class="tb-bolha cliente">${escapeHtml(e.exibir ?? e.texto)}${e.exibir !== e.texto ? `<small>enviou o ID ${escapeHtml(e.texto)}</small>` : ''}</div>`;
    if (e.tipo === 'sistema') return `<div class="tb-sistema ${escapeHtml(e.nivel || 'info')}">${escapeHtml(e.texto)}</div>`;
    if (e.subtipo === 'menu') return bolhaMenu(e);
    const rotulo = e.subtipo === 'arquivo' ? '📎 ' : e.subtipo === 'audio' ? '🔊 ' : '';
    return `<div class="tb-bolha bot">${rotulo}${escapeHtml(e.texto).replace(/\n/g, '<br>')}</div>`;
  }).join('');
  if (rolouAoFim || s.eventos.length < 3) chat.scrollTop = chat.scrollHeight;
}

function desenharBanner(s) {
  const b = $r('#tb-banner');
  let html = '';
  if (s.status === 'aguardando' && s.pausa) {
    const comTexto = s.pausa.tipo === '18' || s.pausa.tipo === '22';
    html = `<div><strong>${escapeHtml(s.pausa.nome)}</strong>: o bot espera o retorno. ${comTexto ? `<input id="tb-cb-texto" class="tb-entrada tb-pequeno" placeholder="${s.pausa.tipo === '18' ? 'Resposta da IA + Enter (sucesso)' : 'Mensagem devolvida + Enter (sucesso)'}">` : ''}</div>
      <div class="tb-banner-acoes"><button type="button" class="tb-btn" data-tb="cb-ok">Callback: sucesso</button><button type="button" class="tb-btn" data-tb="cb-falha">Callback: falha</button></div>`;
  } else if (s.status === 'aguardando-contexto') {
    const r = s.requisitos[0];
    if (!r) { b.innerHTML = ''; b.classList.add('hidden'); return; }
    const opcoes = opcoesDoRequisito(r);
    html = opcoes
      ? `<div><strong>Falta um dado para continuar:</strong> ${escapeHtml(r.rotulo)}</div><div class="tb-banner-acoes">${opcoes.map((o) => `<button type="button" class="tb-btn" data-tb="ctx-opcao" data-valor="${escapeHtml(o.value)}">${escapeHtml(o.label)}</button>`).join('')}</div>`
      : `<div><strong>Falta um dado para continuar:</strong> ${escapeHtml(r.rotulo)} <input id="tb-ctx-valor" class="tb-entrada tb-pequeno" placeholder="Digite e aperte Enter"></div><div class="tb-banner-acoes"><button type="button" class="tb-btn" data-tb="ctx-texto" disabled>Continuar</button></div>`;
  } else if (s.status === 'encerrada' && s.motivoFim === 'parada') {
    html = `<div><strong>Parou no estado ${escapeHtml(s.estado)}</strong>, o ponto de parada do teste. O bot ainda não rodou nele.</div><div class="tb-banner-acoes"><button type="button" class="tb-btn" data-tb="continuar-parada">Continuar daqui</button><button type="button" class="tb-btn" data-tb="reiniciar">Reiniciar</button></div>`;
  } else if (s.status === 'encerrada') {
    html = '<div><strong>Conversa encerrada.</strong> O bot não responde mais nesta conversa.</div><div class="tb-banner-acoes"><button type="button" class="tb-btn" data-tb="reiniciar">Reiniciar</button></div>';
  }
  b.innerHTML = html;
  b.classList.toggle('hidden', !html);
  if (html) marcarCamposSemAutopreenchimento(b);
}

function desenharDetalhes(s) {
  const el = $r('#tb-detalhes');
  if (!s.rodadas.length) { el.innerHTML = '<p class="tb-vazio">Nada avaliado ainda. Envie uma mensagem na aba Conversa.</p>'; return; }
  const icone = (r) => (r === true ? '<span class="tb-ok">✓</span>' : r === false ? '<span class="tb-nao">✗</span>' : '<span class="tb-talvez">?</span>');
  el.innerHTML = [...s.rodadas].reverse().map((r) => `
    <section class="tb-rodada">
      <h4>Rodada ${r.n} · estado ${escapeHtml(r.estado)}${r.estadoDepois !== r.estado ? ` → ${escapeHtml(r.estadoDepois)}` : ''}</h4>
      ${r.mensagens.length ? `<p class="tb-msgs">Cliente: ${r.mensagens.map((m) => `“${escapeHtml(m)}”`).join(', ')}</p>` : '<p class="tb-msgs">Sem mensagem nova do cliente (rodada automática)</p>'}
      ${r.tentativas.map((t) => `
        <div class="tb-trans${t.aprovada ? ' disparou' : ''}">
          <div class="tb-trans-cab">Transição ${escapeHtml(t.prioridade)} ${t.aprovada ? '<b>disparou</b>' : '<span class="tb-nao-disparou">não casou</span>'}</div>
          ${t.condicoes.length ? t.condicoes.map((c) => `<div class="tb-cond">${icone(c.resultado)} ${escapeHtml(c.descricao)} <small>${escapeHtml(c.motivo)}</small></div>`).join('') : '<div class="tb-cond"><span class="tb-ok">✓</span> sem condições (sempre)</div>'}
        </div>`).join('') || '<p class="tb-vazio">Este estado não tem transições.</p>'}
      ${r.acoes.length ? `<ul class="tb-acoes">${r.acoes.map((a) => `<li>${escapeHtml(a.nome)}: ${escapeHtml(a.efeito)}</li>`).join('')}</ul>` : ''}
      ${r.avisos.map((a) => `<p class="tb-aviso-item">${escapeHtml(a)}</p>`).join('')}
    </section>`).join('');
}

function desenharContexto(s) {
  const el = $r('#tb-contexto');
  const ativo = getRootNode().activeElement;
  if (ativo && el.contains(ativo)) return; // não refaz enquanto digita
  const reqs = requisitosDeContexto(s.bot);
  const c = s.contexto.contato;
  const campo = (r) => {
    const v = s.contexto.externas[r.chave] ?? '';
    const opcoes = opcoesDoRequisito(r);
    if (opcoes) return `<div class="tb-ctx"><span>${escapeHtml(r.rotulo)}</span><div class="tb-grupo" role="group" data-ctx="${escapeHtml(r.chave)}">${opcoes.map((o) => `<button type="button" class="tb-op" data-ctx-valor="${escapeHtml(o.value)}" aria-pressed="${String(v) === String(o.value)}">${escapeHtml(o.label)}</button>`).join('')}</div></div>`;
    if (r.tipo === 'json') return `<label class="tb-ctx"><span>${escapeHtml(r.rotulo)}</span><textarea data-ctx="${escapeHtml(r.chave)}" rows="3" placeholder='{"campo":"valor"}'>${escapeHtml(v)}</textarea></label>`;
    return `<label class="tb-ctx"><span>${escapeHtml(r.rotulo)}</span><input data-ctx="${escapeHtml(r.chave)}" value="${escapeHtml(v)}"></label>`;
  };
  el.innerHTML = `
    <p class="tb-dica">O simulador não tem acesso ao banco da Orpen. O que o bot consulta de fora (calendário, fila, agente...) você define aqui, escolhendo nos botões (clique de novo para desmarcar). Se faltar, o teste pausa e pergunta, sem assumir "falso".</p>
    <h4>Cliente</h4>
    <label class="tb-ctx"><span>Nome ({$contact}, {$contact_first_name})</span><input data-contato="nome" value="${escapeHtml(c.nome ?? '')}"></label>
    <label class="tb-ctx"><span>Número ou e-mail ({$sender})</span><input data-contato="remetente" value="${escapeHtml(c.remetente ?? '')}"></label>
    <h4>Menu do WebChat</h4>
    <div class="tb-ctx"><span>Ao clicar numa opção, o bot recebe:</span><div class="tb-grupo" role="group">
      <button type="button" class="tb-op" data-tb-webchat="value" aria-pressed="${tb.webchatEnvia === 'value'}">O value da opção (ID)</button>
      <button type="button" class="tb-op" data-tb-webchat="texto" aria-pressed="${tb.webchatEnvia === 'texto'}">O texto da opção</button>
    </div><small class="tb-dica">Não confirmado no código da Orpen. Confira num WebChat real e escolha como ele se comporta. No WhatsApp o bot sempre recebe o ID do botão.</small></div>
    <h4>Ponto de partida</h4>
    <p class="tb-dica">Para testar só um trecho, use ▶ (começar neste estado) e ⚑ (parar ao chegar) na lista de estados. Aqui você diz o que o cliente já teria guardado ao chegar no estado inicial. Vale quando a conversa é reiniciada.</p>
    <label class="tb-ctx"><span>Contador de erros</span><input type="number" min="0" data-inicio-erros value="${escapeHtml(String(tb.inicio.erros))}"></label>
    ${variaveisUsadas(s.bot).map((nome) => `<label class="tb-ctx"><span>Variável {$${escapeHtml(nome)}}</span><input data-inicio-var="${escapeHtml(nome)}" value="${escapeHtml(tb.inicio.variaveis[nome] ?? '')}"></label>`).join('')}
    <div class="tb-ctx"><button type="button" class="tb-btn" data-tb="reiniciar">Aplicar e reiniciar</button></div>
    <h4>O que este bot consulta</h4>
    ${reqs.length ? reqs.map(campo).join('') : '<p class="tb-vazio">Este bot não consulta nada fora dele.</p>'}`;
  marcarCamposSemAutopreenchimento(el);
}

// ---- ligação ---------------------------------------------------------------

/** Ligado uma vez (initBotViewWiring): botão no cabeçalho do editor. */
export function initTesteBot() {
  const header = $r('#bot-view-overlay .bv-header');
  const antes = header?.querySelector('#btn-bv-buscar') || header?.querySelector('#btn-fechar-bot-view');
  if (!antes || $r('#btn-bv-testar')) return;
  antes.insertAdjacentHTML('beforebegin', '<button id="btn-bv-testar" type="button" class="bv-btn-testar" title="Testar o bot (simula uma conversa, sem salvar)" aria-label="Testar o bot"><i data-lucide="bot-message-square"></i></button>');
  $r('#btn-bv-testar').addEventListener('click', abrirTeste);
}
