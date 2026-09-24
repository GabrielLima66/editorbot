// ---------------------------------------------------------------------------
// Menu de botões do WhatsApp (ACTION_TYPE 10, interactive.type "button"):
// resumo compacto na lista + modal com um celular simulado pra editar.
// Primeiro teste: só "Botões" (Lista e WebChat seguem no builder antigo).
//
// Fidelidade (o formato gravado não muda):
//  - Salvar EDITA o JSON original em vez de montar um novo: só textos e IDs
//    mexidos mudam; header/footer vazios que já existiam continuam, qualquer
//    outra chave é preservada e a indentação é a do original (4 espaços ou
//    nenhuma nos bots reais). O builder antigo, se gravasse, apagaria
//    header/footer vazios (14 de 39 menus de botões reais).
//  - Salvar sem mudar nada não grava nada (texto fica byte a byte).
//  - Salvar grava no bot na hora (o builder antigo nunca gravava as edições).
// ---------------------------------------------------------------------------

import { state } from './state.js';
import { escapeHtml, mostrarToast } from './utils.js';
import { getRootNode, criarIcones } from './dom-root.js';
import { parseMenuModel, defaultMenuModel, WHATSAPP_BUTTON_MAX } from './menu-builder.js';
import { rerenderTransicao } from './bot-view-interactions.js';

const CAMPO = 'message_option_text';
// Limites da API do WhatsApp para mensagem interativa de botões.
const LIMITE = { header: 60, body: 1024, footer: 60, titulo: 20, id: 256 };
// Base de um menu NOVO (ação ainda vazia): mesma estrutura dos menus reais,
// indentação de 4 espaços como a maioria deles. Cabeçalho/rodapé só entram
// se forem preenchidos (atualizarMenuPreservando).
const MODELO_NOVO_JSON = JSON.stringify({ interactive: { type: 'button', body: { text: '' }, action: { buttons: [] } } }, null, 4);

export function menuVazio(raw) {
  return typeof raw !== 'string' || raw.trim() === '';
}

export function ehMenuDeBotoes(raw) {
  return parseMenuModel(raw || '').kind === 'whatsapp_button';
}

// ---------------------------------------------------------------- fidelidade

function indentacaoDe(raw) {
  const m = /\n( +)"/.exec(raw);
  return m ? m[1].length : 0;
}

/** Aplica o modelo editado SOBRE o JSON original, preservando o resto. */
export function atualizarMenuPreservando(raw, model) {
  const obj = JSON.parse(raw);
  const it = obj.interactive;

  const campoTexto = (chave, valor, criar) => {
    if (it[chave] && typeof it[chave] === 'object') it[chave].text = valor;
    else if (valor) it[chave] = criar(valor);
  };
  campoTexto('header', model.header, (text) => ({ type: 'text', text }));
  it.body = { ...(it.body && typeof it.body === 'object' ? it.body : {}), text: model.body };
  campoTexto('footer', model.footer, (text) => ({ text }));

  if (!it.action || typeof it.action !== 'object') it.action = {};
  const originais = Array.isArray(it.action.buttons) ? it.action.buttons : [];
  it.action.buttons = model.buttons.map((b, i) => {
    const base = originais[i] && typeof originais[i] === 'object' ? originais[i] : { type: 'reply' };
    return { ...base, reply: { ...(base.reply && typeof base.reply === 'object' ? base.reply : {}), id: b.id, title: b.title } };
  });

  const ind = indentacaoDe(raw);
  return ind ? JSON.stringify(obj, null, ind) : JSON.stringify(obj);
}

// ---------------------------------------------------------------- resumo na lista

export function renderMenuResumo(model, transitionId, actionId) {
  const corpo = (model.body || '').replace(/\s+/g, ' ').trim();
  const chips = model.buttons.length
    ? model.buttons.map((b) => `<span class="menu-resumo-chip">${escapeHtml(b.title || '(sem texto)')}</span>`).join('')
    : '<span class="menu-resumo-vazio">Nenhum botão</span>';
  return `
    <div class="menu-resumo">
      <div class="menu-resumo-topo">
        <span class="menu-resumo-tipo"><i data-lucide="message-square"></i>WhatsApp · Botões</span>
        <button type="button" class="menu-resumo-editar" data-action="editar-menu" data-transition-id="${escapeHtml(transitionId)}" data-action-id="${escapeHtml(actionId)}"><i data-lucide="pencil"></i>Editar menu</button>
      </div>
      <p class="menu-resumo-corpo${corpo ? '' : ' menu-resumo-vazio'}">${escapeHtml(corpo ? (corpo.length > 160 ? corpo.slice(0, 160) + '…' : corpo) : 'Sem mensagem')}</p>
      <div class="menu-resumo-chips">${chips}</div>
    </div>`;
}

export function renderMenuVazio(transitionId, actionId) {
  return `
    <div class="menu-resumo">
      <div class="menu-resumo-topo">
        <span class="menu-resumo-tipo"><i data-lucide="message-square"></i>Menu</span>
        <button type="button" class="menu-resumo-editar" data-action="editar-menu" data-transition-id="${escapeHtml(transitionId)}" data-action-id="${escapeHtml(actionId)}"><i data-lucide="plus"></i>Criar menu</button>
      </div>
      <p class="menu-resumo-corpo menu-resumo-vazio">Menu ainda não configurado.</p>
    </div>`;
}

// ---------------------------------------------------------------- modal

function renderBotao(b, i, total) {
  return `
    <div class="mm-botao" data-i="${i}">
      <input type="text" class="mm-botao-titulo" data-campo="title" value="${escapeHtml(b.title)}" maxlength="${LIMITE.titulo}" placeholder="Texto do botão" aria-label="Texto do botão ${i + 1}">
      <label class="mm-botao-id" title="Identificador que as condições usam pra saber qual botão o cliente escolheu">
        ID <input type="text" data-campo="id" value="${escapeHtml(b.id)}" maxlength="${LIMITE.id}" spellcheck="false" aria-label="ID do botão ${i + 1}">
      </label>
      ${total > 1 ? `<button type="button" class="mm-botao-remover" data-mm="remover" data-i="${i}" title="Remover botão"><i data-lucide="x"></i></button>` : ''}
    </div>`;
}

function avisosDoModelo(m) {
  const lista = [];
  if (!m.body.trim()) lista.push('A mensagem (corpo) é obrigatória no WhatsApp.');
  if (m.buttons.some((b) => !b.title.trim())) lista.push('Há botão sem texto.');
  const ids = m.buttons.map((b) => b.id.trim());
  if (ids.some((id) => !id)) lista.push('Há botão sem ID: as condições não vão conseguir identificá-lo.');
  if (new Set(ids.filter(Boolean)).size !== ids.filter(Boolean).length) lista.push('Há IDs repetidos entre os botões.');
  const titulos = m.buttons.map((b) => b.title.trim().toLowerCase()).filter(Boolean);
  if (new Set(titulos).size !== titulos.length) lista.push('Há botões com o mesmo texto.');
  return lista;
}

function proximoId(buttons) {
  const usados = new Set(buttons.map((b) => b.id.trim()));
  let n = buttons.length + 1;
  while (usados.has(String(n))) n++;
  return String(n);
}

export function abrirModalMenu(transitionId, actionId) {
  const bot = state.botCarregado;
  const acao = (bot?.BOT_ACTIONS || []).find((a) => a.TRANSITION_ID === transitionId && a.ID === actionId);
  if (!acao) return;
  const novo = menuVazio(acao.ACTION_DATA?.[CAMPO]);
  const raw = novo ? MODELO_NOVO_JSON : acao.ACTION_DATA[CAMPO];
  const original = novo ? { ...defaultMenuModel('whatsapp_button'), buttons: [{ id: '1', title: '' }] } : parseMenuModel(raw);
  if (original.kind !== 'whatsapp_button') return;

  const modelo = JSON.parse(JSON.stringify(original));
  const assinatura = () => JSON.stringify([modelo.header, modelo.body, modelo.footer, modelo.buttons]);
  const assinaturaOriginal = assinatura();

  const root = getRootNode();
  const montagem = root === document ? document.body : root;
  const fundo = document.createElement('div');
  fundo.className = 'mm-fundo';
  fundo.setAttribute('role', 'dialog');
  fundo.setAttribute('aria-modal', 'true');
  fundo.setAttribute('aria-labelledby', 'mm-titulo');
  fundo.innerHTML = `
    <div class="mm-painel">
      <header class="mm-topo">
        <h3 id="mm-titulo" class="mm-titulo">${novo ? 'Criar menu' : 'Editar menu'}</h3>
        <div class="mm-tipos" role="tablist">
          <button type="button" class="mm-tipo mm-tipo-ativo" aria-selected="true">Botões</button>
          <button type="button" class="mm-tipo" disabled title="Em breve">Lista</button>
          <button type="button" class="mm-tipo" disabled title="Em breve">WebChat</button>
        </div>
        <button type="button" class="mm-fechar" data-mm="cancelar" title="Fechar"><i data-lucide="x"></i></button>
      </header>
      <div class="mm-corpo">
        <div class="mm-celular">
          <div class="mm-celular-topo"><i data-lucide="message-circle"></i>Pré-visualização do WhatsApp</div>
          <div class="mm-chat">
            <div class="mm-bolha">
              <input type="text" class="mm-header" data-campo="header" value="${escapeHtml(modelo.header)}" maxlength="${LIMITE.header}" placeholder="Cabeçalho (opcional)" aria-label="Cabeçalho">
              <textarea class="mm-body" data-campo="body" rows="4" maxlength="${LIMITE.body}" placeholder="Mensagem que o cliente vai receber" aria-label="Mensagem">${escapeHtml(modelo.body)}</textarea>
              <input type="text" class="mm-footer" data-campo="footer" value="${escapeHtml(modelo.footer)}" maxlength="${LIMITE.footer}" placeholder="Rodapé (opcional)" aria-label="Rodapé">
              <div class="mm-bolha-meta"><span class="mm-contador"></span><span>08:00</span></div>
            </div>
            <div class="mm-botoes"></div>
            <button type="button" class="mm-adicionar" data-mm="adicionar"><i data-lucide="plus"></i>Adicionar botão</button>
            <p class="mm-limite"></p>
          </div>
        </div>
      </div>
      <div class="mm-avisos" aria-live="polite"></div>
      <footer class="mm-rodape">
        <div class="mm-descartar hidden">
          <span>Descartar as alterações?</span>
          <button type="button" class="fx-btn-secundario" data-mm="voltar">Continuar editando</button>
          <button type="button" class="fx-btn-primario mm-btn-perigo" data-mm="descartar">Descartar</button>
        </div>
        <div class="mm-acoes">
          <button type="button" class="fx-btn-secundario" data-mm="cancelar">Cancelar</button>
          <button type="button" class="fx-btn-primario" data-mm="salvar">Salvar</button>
        </div>
      </footer>
    </div>`;

  const $m = (sel) => fundo.querySelector(sel);

  const desenharBotoes = () => {
    $m('.mm-botoes').innerHTML = modelo.buttons.map((b, i) => renderBotao(b, i, modelo.buttons.length)).join('');
    criarIcones();
  };
  const atualizarEstado = () => {
    $m('.mm-contador').textContent = `${modelo.body.length}/${LIMITE.body}`;
    const cheio = modelo.buttons.length >= WHATSAPP_BUTTON_MAX;
    $m('.mm-adicionar').disabled = cheio;
    $m('.mm-limite').textContent = `${modelo.buttons.length}/${WHATSAPP_BUTTON_MAX} botões — limite do WhatsApp`;
    $m('.mm-avisos').innerHTML = avisosDoModelo(modelo).map((a) => `<p>${escapeHtml(a)}</p>`).join('');
  };

  const fechar = () => fundo.remove();
  const pedirCancelar = () => {
    if (assinatura() === assinaturaOriginal) return fechar();
    $m('.mm-descartar').classList.remove('hidden');
    $m('.mm-acoes').classList.add('hidden');
    $m('[data-mm="voltar"]').focus();
  };
  const salvar = () => {
    if (assinatura() !== assinaturaOriginal) {
      const alvo = (state.botCarregado?.BOT_ACTIONS || []).find((a) => a.TRANSITION_ID === transitionId && a.ID === actionId);
      if (alvo) {
        alvo.ACTION_DATA = { ...alvo.ACTION_DATA, [CAMPO]: atualizarMenuPreservando(raw, modelo) };
        rerenderTransicao(state.botCarregado, transitionId);
        mostrarToast('Menu atualizado. Lembre de salvar o bot.');
      }
    }
    fechar();
  };

  fundo.addEventListener('input', (e) => {
    const el = e.target;
    const campo = el.dataset.campo;
    if (!campo) return;
    const botao = el.closest('.mm-botao');
    if (botao) modelo.buttons[+botao.dataset.i][campo] = el.value;
    else modelo[campo] = el.value;
    atualizarEstado();
  });

  fundo.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mm]');
    if (!btn) return;
    const acaoMm = btn.dataset.mm;
    if (acaoMm === 'cancelar') pedirCancelar();
    else if (acaoMm === 'voltar') {
      $m('.mm-descartar').classList.add('hidden');
      $m('.mm-acoes').classList.remove('hidden');
    } else if (acaoMm === 'descartar') fechar();
    else if (acaoMm === 'salvar') salvar();
    else if (acaoMm === 'adicionar' && modelo.buttons.length < WHATSAPP_BUTTON_MAX) {
      modelo.buttons.push({ id: proximoId(modelo.buttons), title: '' });
      desenharBotoes();
      atualizarEstado();
      fundo.querySelectorAll('.mm-botao-titulo')[modelo.buttons.length - 1].focus();
    } else if (acaoMm === 'remover' && modelo.buttons.length > 1) {
      modelo.buttons.splice(+btn.dataset.i, 1);
      desenharBotoes();
      atualizarEstado();
    }
  });

  // Esc = cancelar; stopPropagation pra não chegar no listener do document
  // que fecha o editor inteiro (orpen-bridge.js).
  fundo.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    pedirCancelar();
  });

  montagem.appendChild(fundo);
  desenharBotoes();
  atualizarEstado();
  criarIcones();
  $m('.mm-body').focus();
}
