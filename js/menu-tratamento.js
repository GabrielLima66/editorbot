// ---------------------------------------------------------------------------
// "Gerar tratamento" do menu (SPEC-tratamento-menu.md): a partir de um menu
// configurado, cria o estado de controle "CTRL - <origem>" com uma transição
// por opção (MENSAGEM Igual a <ID>), o limite de erros e o fallback que
// reenvia o menu, e liga a origem a ele com um "Troca Estado" logo após o
// menu. Tudo com os registros comuns do editor (nextId/withMirrors), no mesmo
// formato que a Orpen exporta; nada novo é gravado no bot.
// ---------------------------------------------------------------------------

import { state } from './state.js';
import { escapeHtml, mostrarToast } from './utils.js';
import { getRootNode, criarIcones } from './dom-root.js';
import { parseMenuModel } from './menu-builder.js';
import { temAmbiente, opcoesFilas, opcoesCrmStatus } from './orpen-env.js';
import {
  nextId,
  withMirrors,
  adicionarEstado,
  adicionarTransicao,
  mensagemAnteriorNaTransicao,
  reabrirPreservandoExpansao,
} from './bot-view-interactions.js';

// Mensagem padrão do limite, por ação. Troca junto com a ação enquanto o
// usuário não tiver editado o texto.
const MENSAGEM_LIMITE = {
  fila: 'Não consegui identificar a opção escolhida. Vou te transferir para um de nossos atendentes.',
  finalizar: 'Não consegui identificar a opção escolhida. Seu atendimento será encerrado.',
  estado: 'Não consegui identificar a opção escolhida.',
  nenhuma: '',
};
const LIMITE_PADRAO = 2;

// ---------------------------------------------------------------- leitura

/** Opções do menu na ordem em que aparecem: { id, texto }. */
export function opcoesDoMenu(model) {
  if (model.kind === 'whatsapp_button') return model.buttons.map((b) => ({ id: b.id, texto: b.title }));
  if (model.kind === 'whatsapp_list') return model.sections.flatMap((s) => s.rows.map((r) => ({ id: r.id, texto: r.title })));
  if (model.kind === 'webchat') return model.options.map((o) => ({ id: o.value, texto: o.text }));
  return [];
}

/** Motivo pra não gerar (texto pro tooltip) ou null se pode. */
export function problemaParaGerar(model) {
  const opcoes = opcoesDoMenu(model);
  if (!opcoes.length) return 'O menu ainda não tem opções.';
  if (opcoes.some((o) => !String(o.id || '').trim())) return 'Há opção sem ID. Abra "Editar menu" e salve para gerar os IDs.';
  const ids = opcoes.map((o) => o.id);
  if (new Set(ids).size !== ids.length) return 'Há IDs repetidos no menu.';
  return null;
}

function acoesDaTransicao(bot, transitionId) {
  return (bot.BOT_ACTIONS || [])
    .filter((a) => a.TRANSITION_ID === transitionId)
    .sort((a, b) => parseInt(a.ID, 10) - parseInt(b.ID, 10));
}

/** "Troca Estado" que vem depois do menu na mesma transição (ou null). */
function trocaEstadoAposMenu(bot, transitionId, actionId) {
  const lista = acoesDaTransicao(bot, transitionId);
  const idx = lista.findIndex((a) => a.ID === actionId);
  return lista.slice(idx + 1).find((a) => a.ACTION_TYPE === '2') || null;
}

function estadoPorNumero(bot, numero) {
  return (bot.BOT_STATES || []).find((s) => s.STATE_NUMBER === numero) || null;
}

function nomeLivre(bot, base) {
  const usados = new Set((bot.BOT_STATES || []).map((s) => String(s.ALIAS || '').trim().toLowerCase()));
  if (!usados.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!usados.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

/** Tudo que o diálogo precisa saber antes de gerar. */
export function analisarMenu(bot, transitionId, actionId) {
  const acao = (bot.BOT_ACTIONS || []).find((a) => a.TRANSITION_ID === transitionId && a.ID === actionId);
  const transicao = (bot.BOT_TRANSITIONS || []).find((t) => t.ID === transitionId);
  if (!acao || !transicao) return null;
  const raw = acao.ACTION_DATA?.message_option_text || '';
  const model = parseMenuModel(raw);
  const origem = estadoPorNumero(bot, transicao.STATE);
  const nomeOrigem = String(origem?.ALIAS || '').trim() || `Estado ${transicao.STATE}`;
  const troca = trocaEstadoAposMenu(bot, transitionId, actionId);
  const destinoAtual = troca?.ACTION_DATA?.destiny ? String(troca.ACTION_DATA.destiny) : '';
  return {
    raw,
    model,
    opcoes: opcoesDoMenu(model),
    problema: problemaParaGerar(model),
    origemNumero: transicao.STATE,
    nomeSugerido: nomeLivre(bot, `CTRL - ${nomeOrigem}`),
    destinoAtual,
    destinoAtualEstado: destinoAtual ? estadoPorNumero(bot, destinoAtual) : null,
    // WebChat: o texto do menu é a ação "Mensagem" anterior; o reenvio copia os dois.
    textoWebchat: model.kind === 'webchat' ? mensagemAnteriorNaTransicao(bot, transitionId, actionId) : null,
  };
}

// ---------------------------------------------------------------- escrita

function novaCondicao(bot, transitionId, tipo, dados) {
  const c = withMirrors('condition', { ID: nextId(bot.BOT_CONDITIONS), TRANSITION_ID: transitionId, CONDITION_TYPE: tipo, CONDITION_DATA: dados });
  bot.BOT_CONDITIONS = (bot.BOT_CONDITIONS || []).concat([c]);
}

function novaAcao(bot, transitionId, tipo, dados) {
  const a = withMirrors('action', { ID: nextId(bot.BOT_ACTIONS), TRANSITION_ID: transitionId, ACTION_TYPE: tipo, ACTION_DATA: dados });
  bot.BOT_ACTIONS = (bot.BOT_ACTIONS || []).concat([a]);
}

// Insere uma ação logo depois de outra na mesma transição. A ordem de
// execução vem do ID, então (como em dividirMensagemDoMenu) a transição
// inteira é renumerada; ações de outras transições não mudam.
function inserirAcaoApos(bot, transitionId, actionIdRef, tipo, dados) {
  const daTransicao = acoesDaTransicao(bot, transitionId);
  const outras = (bot.BOT_ACTIONS || []).filter((a) => a.TRANSITION_ID !== transitionId);
  const ordem = [];
  daTransicao.forEach((a) => {
    ordem.push({ ...a });
    if (a.ID === actionIdRef) ordem.push({ ACTION_TYPE: tipo, ACTION_DATA: dados });
  });
  let base = outras.concat(daTransicao);
  const renumeradas = ordem.map((a) => {
    const comId = withMirrors('action', { ...a, ID: nextId(base), TRANSITION_ID: transitionId });
    base = base.concat([comId]);
    return comId;
  });
  bot.BOT_ACTIONS = outras.concat(renumeradas);
}

/**
 * Gera o estado de controle. cfg:
 *   nome, limite (número),
 *   acaoLimite: { tipo: 'fila'|'finalizar'|'estado'|'nenhuma', mensagem, destino, crmStatus }
 * Devolve o STATE_NUMBER criado.
 */
export function gerarTratamento(bot, transitionId, actionId, cfg) {
  const info = analisarMenu(bot, transitionId, actionId);
  if (!info || info.problema) throw new Error(info?.problema || 'Menu não encontrado.');

  // 1. Estado novo
  const numero = adicionarEstado(bot);
  const estado = estadoPorNumero(bot, numero);
  estado.ALIAS = String(cfg.nome || '').trim() || info.nomeSugerido;
  withMirrors('state', estado);

  // 2. Uma transição por opção, na ordem do menu
  info.opcoes.forEach((o) => {
    const t = adicionarTransicao(bot, numero);
    novaCondicao(bot, t, '1', { variable: 'message', type: '1', value: o.id });
  });

  // 3. Limite de erros (antes do fallback, senão nunca dispara)
  const tLimite = adicionarTransicao(bot, numero);
  novaCondicao(bot, tLimite, '2', { variable: 'message', type: '1', value: '' });
  novaCondicao(bot, tLimite, '7', { variable: 'error_count', type: '1', value: String(cfg.limite ?? LIMITE_PADRAO) });
  const al = cfg.acaoLimite || { tipo: 'nenhuma' };
  if (al.tipo !== 'nenhuma' && String(al.mensagem || '').trim()) novaAcao(bot, tLimite, '1', { message_text: al.mensagem });
  if (al.tipo === 'fila') novaAcao(bot, tLimite, '5', { destiny: String(al.destino || '') });
  if (al.tipo === 'finalizar') novaAcao(bot, tLimite, '6', { crm_status: String(al.crmStatus || '') });
  if (al.tipo === 'estado') novaAcao(bot, tLimite, '2', { destiny: String(al.destino || '') });

  // 4. Fallback: conta o erro e reenvia o menu (cópia do JSON)
  const tFallback = adicionarTransicao(bot, numero);
  novaCondicao(bot, tFallback, '2', { variable: 'message', type: '1', value: '' });
  novaAcao(bot, tFallback, '8', { error_count: 'add' });
  if (info.model.kind === 'webchat' && info.textoWebchat) novaAcao(bot, tFallback, '1', { message_text: info.textoWebchat });
  novaAcao(bot, tFallback, '10', { message_option_text: info.raw });

  // 5. Origem → estado novo (por último: pode renumerar as ações da origem)
  const troca = trocaEstadoAposMenu(bot, transitionId, actionId);
  if (troca) {
    if (!troca.ACTION_DATA) troca.ACTION_DATA = {};
    troca.ACTION_DATA.destiny = numero;
  } else {
    inserirAcaoApos(bot, transitionId, actionId, '2', { destiny: numero });
  }
  return numero;
}

// ---------------------------------------------------------------- diálogo

function opcoesHtml(lista, selecionado) {
  return lista.map((o) => `<option value="${escapeHtml(o.value)}"${o.value === selecionado ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('');
}

function campoDestino(nome, opcoes, placeholder) {
  if (opcoes.length) {
    return `<select class="mt-input" data-mt="${nome}"><option value="">Escolher depois (fica nas pendências)</option>${opcoesHtml(opcoes, '')}</select>`;
  }
  return `<input type="text" class="mt-input" data-mt="${nome}" placeholder="${escapeHtml(placeholder)}" spellcheck="false">`;
}

export function abrirModalTratamento(transitionId, actionId) {
  const bot = state.botCarregado;
  if (!bot) return;
  const info = analisarMenu(bot, transitionId, actionId);
  if (!info) return;
  if (info.problema) { mostrarToast(info.problema); return; }

  const estados = (bot.BOT_STATES || [])
    .slice()
    .sort((a, b) => parseInt(a.STATE_NUMBER, 10) - parseInt(b.STATE_NUMBER, 10))
    .map((s) => ({ value: s.STATE_NUMBER, label: `${s.STATE_NUMBER} · ${s.ALIAS || ''}` }));
  const filas = temAmbiente() ? opcoesFilas() : [];
  const status = temAmbiente() ? opcoesCrmStatus() : [];

  const conflito = info.destinoAtual
    ? `<p class="mt-aviso">Esta transição já leva para <strong>${escapeHtml(info.destinoAtual)} · ${escapeHtml(info.destinoAtualEstado?.ALIAS || 'estado inexistente')}</strong>. Ao gerar, o destino passa a ser o estado novo.</p>`
    : '';

  const fundo = document.createElement('div');
  fundo.className = 'mm-fundo';
  fundo.setAttribute('role', 'dialog');
  fundo.setAttribute('aria-modal', 'true');
  fundo.setAttribute('aria-labelledby', 'mt-titulo');
  fundo.innerHTML = `
    <div class="mm-painel mt-painel">
      <header class="mm-topo">
        <h3 id="mt-titulo" class="mm-titulo">Gerar tratamento do menu</h3>
        <button type="button" class="mm-fechar" data-mt-acao="cancelar" title="Fechar"><i data-lucide="x"></i></button>
      </header>
      <div class="mt-corpo">
        <p class="mt-intro">Cria um estado com uma transição por opção do menu, o limite de erros e o reenvio do menu para respostas inválidas.</p>
        ${conflito}
        <label class="mt-campo"><span>Nome do estado</span>
          <input type="text" class="mt-input" data-mt="nome" value="${escapeHtml(info.nomeSugerido)}" maxlength="80">
        </label>
        <label class="mt-campo mt-campo-curto"><span>Limite de erros</span>
          <input type="number" class="mt-input" data-mt="limite" value="${LIMITE_PADRAO}" min="1" max="20">
        </label>
        <fieldset class="mt-campo mt-limite">
          <legend>Ao atingir o limite</legend>
          <select class="mt-input" data-mt="tipo-limite">
            <option value="fila" selected>Mensagem + transferir para fila</option>
            <option value="finalizar">Mensagem + finalizar o atendimento</option>
            <option value="estado">Mensagem + trocar de estado</option>
            <option value="nenhuma">Deixar em branco (completo depois)</option>
          </select>
          <textarea class="mt-input" data-mt="mensagem" rows="2" placeholder="Mensagem (opcional)">${escapeHtml(MENSAGEM_LIMITE.fila)}</textarea>
          <div data-mt-painel="fila">${campoDestino('fila', filas, 'Número da fila (ou deixe vazio e complete depois)')}</div>
          <div data-mt-painel="finalizar" class="hidden">${campoDestino('crm', status, 'Status CRM (ou deixe vazio e complete depois)')}</div>
          <div data-mt-painel="estado" class="hidden"><select class="mt-input" data-mt="estado"><option value="">Escolher depois</option>${opcoesHtml(estados, '')}</select></div>
        </fieldset>
        <div class="mt-previa">
          <p class="mt-previa-titulo">Transições que serão criadas</p>
          <ol class="mt-previa-lista"></ol>
        </div>
      </div>
      <footer class="mm-rodape">
        <div class="mm-acoes">
          <button type="button" class="fx-btn-secundario" data-mt-acao="cancelar">Cancelar</button>
          <button type="button" class="fx-btn-primario" data-mt-acao="gerar">${info.destinoAtual ? 'Gerar e trocar destino' : 'Gerar'}</button>
        </div>
      </footer>
    </div>`;

  const $m = (sel) => fundo.querySelector(sel);
  const valor = (nome) => $m(`[data-mt="${nome}"]`);

  const desenharPrevia = () => {
    const tipo = valor('tipo-limite').value;
    const limite = valor('limite').value || LIMITE_PADRAO;
    const acaoLimite = {
      fila: 'mensagem + transferir para fila',
      finalizar: 'mensagem + finalizar',
      estado: 'mensagem + trocar de estado',
      nenhuma: '(em branco)',
    }[tipo];
    const reenvio = info.model.kind === 'webchat' && info.textoWebchat ? 'erros +1, reenvia mensagem e menu' : 'erros +1, reenvia o menu';
    $m('.mt-previa-lista').innerHTML = [
      ...info.opcoes.map((o) => `<li><code>${escapeHtml(o.id)}</code> <span class="mt-previa-texto">${escapeHtml(o.texto)}</span> → você completa</li>`),
      `<li>Erros ≥ ${escapeHtml(String(limite))} → ${acaoLimite}</li>`,
      `<li>Qualquer outra resposta → ${reenvio}</li>`,
    ].join('');
  };

  const trocarTipo = () => {
    const tipo = valor('tipo-limite').value;
    const msg = valor('mensagem');
    if (Object.values(MENSAGEM_LIMITE).includes(msg.value) && tipo !== 'nenhuma') msg.value = MENSAGEM_LIMITE[tipo];
    fundo.querySelectorAll('[data-mt-painel]').forEach((p) => p.classList.toggle('hidden', p.dataset.mtPainel !== tipo));
    valor('mensagem').classList.toggle('hidden', tipo === 'nenhuma');
    desenharPrevia();
  };

  const fechar = () => fundo.remove();
  const gerar = () => {
    const tipo = valor('tipo-limite').value;
    const limite = Math.max(1, parseInt(valor('limite').value, 10) || LIMITE_PADRAO);
    const destino = tipo === 'fila' ? valor('fila').value.trim() : tipo === 'estado' ? valor('estado').value : '';
    const cfg = {
      nome: valor('nome').value,
      limite,
      acaoLimite: { tipo, mensagem: valor('mensagem').value, destino, crmStatus: tipo === 'finalizar' ? valor('crm').value.trim() : '' },
    };
    const b = state.botCarregado;
    const numero = gerarTratamento(b, transitionId, actionId, cfg);
    fechar();
    reabrirPreservandoExpansao(b, numero);
    // Estado novo já aberto: é onde o usuário vai completar as opções.
    const wrap = getRootNode().querySelector(`#bv-estados .estado-wrap[data-estado-numero="${numero}"]`);
    if (wrap) {
      wrap.querySelector('.estado-body')?.classList.remove('hidden');
      wrap.classList.add('estado-expandido');
      wrap.querySelector('.estado-chevron')?.classList.add('rotate-180');
    }
    mostrarToast(`Estado "${estadoPorNumero(b, numero)?.ALIAS}" criado com ${info.opcoes.length + 2} transições. Complete o que cada opção faz e salve o bot.`);
  };

  fundo.addEventListener('input', desenharPrevia);
  fundo.addEventListener('change', (e) => { if (e.target.matches('[data-mt="tipo-limite"]')) trocarTipo(); else desenharPrevia(); });
  fundo.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mt-acao]');
    if (!btn) return;
    if (btn.dataset.mtAcao === 'cancelar') fechar();
    if (btn.dataset.mtAcao === 'gerar') gerar();
  });
  fundo.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    fechar();
  });

  const root = getRootNode();
  (root === document ? document.body : root).appendChild(fundo);
  trocarTipo();
  criarIcones();
  valor('nome').focus();
  valor('nome').select();
}
