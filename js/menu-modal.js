// ---------------------------------------------------------------------------
// Menus (ACTION_TYPE 10): resumo compacto na lista + modal com um celular
// simulado pra editar. Cobre WhatsApp Botões, WhatsApp Lista e WebChat, com
// troca de tipo. Conteúdo não reconhecido segue no builder antigo.
//
// Fidelidade (o formato gravado não muda):
//  - Salvar EDITA o JSON original em vez de montar um novo: só textos e IDs
//    mexidos mudam; header/footer vazios que já existiam continuam, campos
//    opcionais só são criados se já existiam ou forem preenchidos, qualquer
//    outra chave é preservada e a indentação é a do original. (O builder
//    antigo apagava header/footer vazios e inventava campos vazios.)
//  - Salvar sem mudar nada não grava nada (texto fica byte a byte).
//  - ID (botão/opção da lista) e valor (WebChat) vazios são gerados do texto,
//    com espaços trocados por "_".
//  - Troca de tipo só vira mudança estrutural no Salvar: pra WebChat o texto
//    do menu vira uma ação "Mensagem" antes dele; de WebChat pra WhatsApp a
//    "Mensagem" anterior é reincorporada (mesmas regras do builder antigo).
// ---------------------------------------------------------------------------

import { state } from './state.js';
import { escapeHtml, mostrarToast, setPath } from './utils.js';
import { getRootNode, criarIcones } from './dom-root.js';
import {
  parseMenuModel,
  defaultMenuModel,
  extrairItensMenu,
  limiteParaTipoMenu,
  converterModeloMenu,
  mensagemPerdidaWebchat,
  countListRows,
  WHATSAPP_BUTTON_MAX,
  WHATSAPP_LIST_MAX_ROWS,
} from './menu-builder.js';
import {
  rerenderTransicao,
  reabrirPreservandoExpansao,
  dividirMensagemDoMenu,
  mensagemAnteriorNaTransicao,
  absorverMensagemAnterior,
} from './bot-view-interactions.js';

const CAMPO = 'message_option_text';
// Texto padrão do botão que abre a lista (editável; vazio grava este).
const BOTAO_LISTA_PADRAO = 'Ver opções';
// Limites da API do WhatsApp.
const LIMITE = {
  header: 60, body: 1024, footer: 60,
  botaoTitulo: 20, botaoId: 256,
  listaBotao: 20, linhaTitulo: 24, linhaDescricao: 72, linhaId: 200,
};
const TIPOS = [
  { kind: 'whatsapp_button', label: 'Botões', resumo: 'WhatsApp · Botões' },
  { kind: 'whatsapp_list', label: 'Lista', resumo: 'WhatsApp · Lista' },
  { kind: 'webchat', label: 'WebChat', resumo: 'WebChat · Menu' },
];
// Estrutura mínima de cada tipo, usada quando o menu é novo ou mudou de tipo
// (não há original do mesmo tipo pra preservar).
const BASE_JSON = {
  whatsapp_button: () => ({ interactive: { type: 'button', body: { text: '' }, action: { buttons: [] } } }),
  whatsapp_list: () => ({ interactive: { type: 'list', body: { text: '' }, action: { button: '', sections: [] } } }),
  webchat: () => ({ message_type: 'menu', menu_type: 'list', options: [] }),
};

export function menuVazio(raw) {
  return typeof raw !== 'string' || raw.trim() === '';
}

export function tipoDoModal(kind) {
  return Object.hasOwn(BASE_JSON, kind);
}

// ID gerado a partir do texto: espaços viram "_" ("Falar com atendente" ->
// "Falar_com_atendente"). ID/valor preenchido fica como está.
function idDoTexto(texto) {
  return String(texto || '').trim().replace(/\s+/g, '_');
}
function idFinal(id, texto) {
  return String(id || '').trim() ? id : idDoTexto(texto);
}

function ehObjeto(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

// ---------------------------------------------------------------- fidelidade

function indentacaoDe(raw) {
  const m = /\n( +)"/.exec(raw || '');
  return m ? m[1].length : 0;
}

/** Campo opcional: só grava se já existia no original ou se veio preenchido. */
function definirOpcional(obj, chave, valor) {
  if (Object.hasOwn(obj, chave) || valor) obj[chave] = valor;
}

/** Aplica o modelo editado SOBRE o JSON original, preservando o resto. */
export function atualizarMenuPreservando(raw, model) {
  const original = menuVazio(raw) ? null : parseMenuModel(raw);
  const mesmoTipo = original && original.kind === model.kind;
  const obj = mesmoTipo ? JSON.parse(raw) : BASE_JSON[model.kind]();

  if (model.kind === 'webchat') {
    const antigas = Array.isArray(obj.options) ? obj.options : [];
    obj.options = model.options.map((o, i) => ({ ...(ehObjeto(antigas[i]) ? antigas[i] : {}), text: o.text, value: o.value }));
  } else {
    const it = obj.interactive;
    const texto = (chave, valor, criar) => {
      if (ehObjeto(it[chave])) it[chave].text = valor;
      else if (valor) it[chave] = criar(valor);
    };
    texto('header', model.header, (text) => ({ type: 'text', text }));
    it.body = { ...(ehObjeto(it.body) ? it.body : {}), text: model.body };
    texto('footer', model.footer, (text) => ({ text }));
    if (!ehObjeto(it.action)) it.action = {};

    if (model.kind === 'whatsapp_button') {
      const antigos = Array.isArray(it.action.buttons) ? it.action.buttons : [];
      it.action.buttons = model.buttons.map((b, i) => {
        const base = ehObjeto(antigos[i]) ? antigos[i] : { type: 'reply' };
        return { ...base, reply: { ...(ehObjeto(base.reply) ? base.reply : {}), id: b.id, title: b.title } };
      });
    } else {
      definirOpcional(it.action, 'button', model.button);
      const antigas = Array.isArray(it.action.sections) ? it.action.sections : [];
      it.action.sections = model.sections.map((s, si) => {
        const base = ehObjeto(antigas[si]) ? antigas[si] : {};
        const secao = { ...base };
        definirOpcional(secao, 'title', s.title);
        const linhasAntigas = Array.isArray(base.rows) ? base.rows : [];
        secao.rows = s.rows.map((r, ri) => {
          const linha = { ...(ehObjeto(linhasAntigas[ri]) ? linhasAntigas[ri] : {}), id: r.id, title: r.title };
          definirOpcional(linha, 'description', r.description);
          return linha;
        });
        return secao;
      });
    }
  }

  const ind = mesmoTipo ? indentacaoDe(raw) : (indentacaoDe(raw) || 4);
  return ind ? JSON.stringify(obj, null, ind) : JSON.stringify(obj);
}

// ---------------------------------------------------------------- resumo na lista

function chips(textos, vazio) {
  return textos.length
    ? textos.map((t) => `<span class="menu-resumo-chip">${escapeHtml(t || '(sem texto)')}</span>`).join('')
    : `<span class="menu-resumo-vazio">${escapeHtml(vazio)}</span>`;
}

export function renderMenuResumo(model, transitionId, actionId) {
  const tipo = TIPOS.find((t) => t.kind === model.kind);
  let corpo = '';
  let opcoes = '';
  if (model.kind === 'webchat') {
    corpo = '<p class="menu-resumo-corpo menu-resumo-vazio">Texto na ação "Mensagem" acima.</p>';
    opcoes = chips(model.options.map((o) => o.text), 'Nenhuma opção');
  } else {
    const texto = (model.body || '').replace(/\s+/g, ' ').trim();
    corpo = `<p class="menu-resumo-corpo${texto ? '' : ' menu-resumo-vazio'}">${escapeHtml(texto ? (texto.length > 160 ? texto.slice(0, 160) + '…' : texto) : 'Sem mensagem')}</p>`;
    if (model.kind === 'whatsapp_button') {
      opcoes = chips(model.buttons.map((b) => b.title), 'Nenhum botão');
    } else {
      const linhas = model.sections.flatMap((s) => s.rows.map((r) => r.title));
      opcoes = (model.button ? `<span class="menu-resumo-chip menu-resumo-chip-lista">≡ ${escapeHtml(model.button)}</span>` : '') + chips(linhas, 'Nenhuma opção');
    }
  }
  return `
    <div class="menu-resumo">
      <div class="menu-resumo-topo">
        <span class="menu-resumo-tipo"><i data-lucide="message-square"></i>${escapeHtml(tipo ? tipo.resumo : 'Menu')}</span>
        <button type="button" class="menu-resumo-editar" data-action="editar-menu" data-transition-id="${escapeHtml(transitionId)}" data-action-id="${escapeHtml(actionId)}"><i data-lucide="pencil"></i>Editar menu</button>
      </div>
      ${corpo}
      <div class="menu-resumo-chips">${opcoes}</div>
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

// ---------------------------------------------------------------- modal: conteúdo por tipo

const campo = (caminho, valor, attrs) => `data-caminho="${caminho}" value="${escapeHtml(valor)}" ${attrs}`;

function campoId(caminhoId, id, texto, max, rotulo) {
  return `
    <label class="mm-botao-id" title="Identificador que as condições usam pra saber o que o cliente escolheu. Vazio = gerado do texto.">
      ${rotulo} <input type="text" ${campo(caminhoId, id, `placeholder="${escapeHtml(idDoTexto(texto) || 'gerado do texto')}" maxlength="${max}" spellcheck="false" aria-label="${rotulo}"`)}>
    </label>`;
}

function bolhaWhatsapp(m, extra) {
  return `
    <div class="mm-bolha">
      <input type="text" class="mm-header" ${campo('header', m.header, `maxlength="${LIMITE.header}" placeholder="Cabeçalho (opcional)" aria-label="Cabeçalho"`)}>
      <textarea class="mm-body" data-caminho="body" rows="4" maxlength="${LIMITE.body}" placeholder="Mensagem que o cliente vai receber" aria-label="Mensagem">${escapeHtml(m.body)}</textarea>
      <input type="text" class="mm-footer" ${campo('footer', m.footer, `maxlength="${LIMITE.footer}" placeholder="Rodapé (opcional)" aria-label="Rodapé"`)}>
      <div class="mm-bolha-meta"><span class="mm-contador">${m.body.length}/${LIMITE.body}</span><span>08:00</span></div>
      ${extra || ''}
    </div>`;
}

function conteudoBotoes(m) {
  const cheio = m.buttons.length >= WHATSAPP_BUTTON_MAX;
  const botoes = m.buttons.map((b, i) => `
    <div class="mm-botao">
      <input type="text" class="mm-botao-titulo" ${campo(`buttons.${i}.title`, b.title, `maxlength="${LIMITE.botaoTitulo}" placeholder="Texto do botão" aria-label="Texto do botão ${i + 1}"`)}>
      ${campoId(`buttons.${i}.id`, b.id, b.title, LIMITE.botaoId, 'ID')}
      ${m.buttons.length > 1 ? `<button type="button" class="mm-botao-remover" data-mm="remover-botao" data-i="${i}" title="Remover botão"><i data-lucide="x"></i></button>` : ''}
    </div>`).join('');
  return `
    ${bolhaWhatsapp(m)}
    <div class="mm-botoes">${botoes}</div>
    <button type="button" class="mm-adicionar" data-mm="adicionar-botao"${cheio ? ' disabled' : ''}><i data-lucide="plus"></i>Adicionar botão</button>
    <p class="mm-limite">${m.buttons.length}/${WHATSAPP_BUTTON_MAX} botões — limite do WhatsApp</p>`;
}

// Lista: só opções, sem o conceito de seção na tela. Por baixo o JSON segue
// com seções (o WhatsApp exige ao menos uma): opção nova entra na última,
// e título/divisão de seções que já existiam são preservados sem aparecer.
function conteudoLista(m) {
  const total = countListRows(m);
  const cheio = total >= WHATSAPP_LIST_MAX_ROWS;
  const linhas = m.sections.map((s, si) => s.rows.map((r, ri) => `
        <div class="mm-linha">
          <input type="text" class="mm-linha-titulo" ${campo(`sections.${si}.rows.${ri}.title`, r.title, `maxlength="${LIMITE.linhaTitulo}" placeholder="Opção" aria-label="Opção"`)}>
          <input type="text" class="mm-linha-descricao" ${campo(`sections.${si}.rows.${ri}.description`, r.description, `maxlength="${LIMITE.linhaDescricao}" placeholder="Descrição (opcional)" aria-label="Descrição"`)}>
          ${campoId(`sections.${si}.rows.${ri}.id`, r.id, r.title, LIMITE.linhaId, 'ID')}
          ${total > 1 ? `<button type="button" class="mm-botao-remover" data-mm="remover-linha" data-si="${si}" data-ri="${ri}" title="Remover opção"><i data-lucide="x"></i></button>` : ''}
        </div>`).join('')).join('');
  const botaoLista = `
    <div class="mm-lista-botao"><i data-lucide="list"></i>
      <input type="text" ${campo('button', m.button, `maxlength="${LIMITE.listaBotao}" placeholder="${BOTAO_LISTA_PADRAO}" aria-label="Texto do botão que abre a lista"`)}>
    </div>`;
  return `
    ${bolhaWhatsapp(m, botaoLista)}
    <div class="mm-lista">
      <p class="mm-lista-rotulo">Opções da lista</p>
      ${linhas}
      <button type="button" class="mm-adicionar mm-adicionar-leve" data-mm="adicionar-linha"${cheio ? ' disabled' : ''}><i data-lucide="plus"></i>Adicionar opção</button>
    </div>
    <p class="mm-limite">${total}/${WHATSAPP_LIST_MAX_ROWS} opções no total — limite do WhatsApp</p>`;
}

// WebChat não tem texto no JSON do menu: o texto é a ação "Mensagem" logo
// antes dele. No modal ele aparece como campo normal da bolha; o Salvar
// grava na "Mensagem" existente ou cria uma (dividirMensagemDoMenu).
function conteudoWebchat(m, texto) {
  const anterior = `
    <div class="mm-bolha">
      <textarea class="mm-body" data-webchat-texto rows="4" placeholder="Mensagem que o cliente vai receber antes das opções" aria-label="Mensagem">${escapeHtml(texto)}</textarea>
      <div class="mm-bolha-meta"><span>Vai numa ação "Mensagem" antes do menu</span><span>08:00</span></div>
    </div>`;
  const opcoes = m.options.map((o, i) => `
    <div class="mm-botao">
      <input type="text" class="mm-botao-titulo" ${campo(`options.${i}.text`, o.text, 'placeholder="Texto da opção" aria-label="Texto da opção"')}>
      ${campoId(`options.${i}.value`, o.value, o.text, 256, 'Valor')}
      ${m.options.length > 1 ? `<button type="button" class="mm-botao-remover" data-mm="remover-opcao" data-i="${i}" title="Remover opção"><i data-lucide="x"></i></button>` : ''}
    </div>`).join('');
  return `
    ${anterior}
    <div class="mm-botoes">${opcoes}</div>
    <button type="button" class="mm-adicionar" data-mm="adicionar-opcao"><i data-lucide="plus"></i>Adicionar opção</button>`;
}

function avisosDoModelo(m) {
  const lista = [];
  const repetidos = (valores) => {
    const v = valores.filter(Boolean);
    return new Set(v).size !== v.length;
  };
  if (m.kind === 'webchat') {
    if (m.options.some((o) => !o.text.trim())) lista.push('Há opção sem texto.');
    if (repetidos(m.options.map((o) => idFinal(o.value, o.text)))) lista.push('Há valores repetidos entre as opções.');
    return lista;
  }
  if (!m.body.trim()) lista.push('A mensagem (corpo) é obrigatória no WhatsApp.');
  if (m.kind === 'whatsapp_button') {
    if (m.buttons.some((b) => !b.title.trim())) lista.push('Há botão sem texto.');
    if (repetidos(m.buttons.map((b) => idFinal(b.id, b.title)))) lista.push('Há IDs repetidos entre os botões.');
    if (repetidos(m.buttons.map((b) => b.title.trim().toLowerCase()))) lista.push('Há botões com o mesmo texto.');
  } else {
    const linhas = m.sections.flatMap((s) => s.rows);
    if (!linhas.length) lista.push('Adicione pelo menos uma opção.');
    if (linhas.some((r) => !r.title.trim())) lista.push('Há opção sem texto.');
    if (repetidos(linhas.map((r) => idFinal(r.id, r.title)))) lista.push('Há IDs repetidos entre as opções.');
  }
  return lista;
}

/** Modelo final: IDs/valores vazios gerados do texto. */
function comIdsFinais(m) {
  const c = JSON.parse(JSON.stringify(m));
  if (c.kind === 'whatsapp_button') c.buttons.forEach((b) => { b.id = idFinal(b.id, b.title); });
  if (c.kind === 'whatsapp_list' && !c.button.trim()) c.button = BOTAO_LISTA_PADRAO;
  if (c.kind === 'whatsapp_list') c.sections.forEach((s) => s.rows.forEach((r) => { r.id = idFinal(r.id, r.title); }));
  if (c.kind === 'webchat') c.options.forEach((o) => { o.value = idFinal(o.value, o.text); });
  return c;
}

function assinaturaDe(m) {
  return JSON.stringify(m);
}

// ---------------------------------------------------------------- modal

export function abrirModalMenu(transitionId, actionId) {
  const bot = state.botCarregado;
  const acao = (bot?.BOT_ACTIONS || []).find((a) => a.TRANSITION_ID === transitionId && a.ID === actionId);
  if (!acao) return;
  const novo = menuVazio(acao.ACTION_DATA?.[CAMPO]);
  const raw = novo ? '' : acao.ACTION_DATA[CAMPO];
  const original = novo ? { ...defaultMenuModel('whatsapp_button'), buttons: [{ id: '', title: '' }] } : parseMenuModel(raw);
  if (!tipoDoModal(original.kind)) return;

  const tipoOriginal = novo ? null : original.kind;
  const textoAnterior = mensagemAnteriorNaTransicao(bot, transitionId, actionId);
  let modelo = JSON.parse(JSON.stringify(original));
  const assinaturaOriginal = assinaturaDe(modelo);
  // WebChat: o texto é o da ação "Mensagem" anterior (se houver).
  const textoOriginalWebchat = tipoOriginal === 'webchat' ? (textoAnterior ?? '') : '';
  let textoWebchat = textoOriginalWebchat;
  // Ao ir pro WebChat guarda header/body/footer/botão pra voltar sem perder,
  // se o texto não tiver sido editado no meio do caminho.
  let textoWhatsappAntesDoWebchat = null;
  let trocaPendente = null; // { kind, itensCabem, itensRemovidos }
  const vaiAbsorver = () => modelo.kind !== 'webchat' && tipoOriginal === 'webchat' && textoAnterior !== null;
  const vaiUsarMensagemExistente = () => tipoOriginal === 'webchat' && textoAnterior !== null;

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
          ${TIPOS.map((t) => `<button type="button" class="mm-tipo" role="tab" data-mm="tipo" data-kind="${t.kind}">${t.label}</button>`).join('')}
        </div>
        <button type="button" class="mm-fechar" data-mm="cancelar" title="Fechar"><i data-lucide="x"></i></button>
      </header>
      <div class="mm-troca hidden"></div>
      <div class="mm-corpo">
        <div class="mm-celular">
          <div class="mm-celular-topo"><i data-lucide="message-circle"></i><span class="mm-celular-titulo"></span></div>
          <div class="mm-chat"></div>
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
  const houveMudanca = () => assinaturaDe(modelo) !== assinaturaOriginal || (modelo.kind === 'webchat' && textoWebchat !== textoOriginalWebchat);

  const desenharConteudo = () => {
    fundo.querySelectorAll('.mm-tipo').forEach((b) => {
      const ativo = b.dataset.kind === modelo.kind;
      b.classList.toggle('mm-tipo-ativo', ativo);
      b.setAttribute('aria-selected', String(ativo));
    });
    $m('.mm-celular-titulo').textContent = modelo.kind === 'webchat' ? 'Pré-visualização do WebChat' : 'Pré-visualização do WhatsApp';
    $m('.mm-celular').classList.toggle('mm-celular-webchat', modelo.kind === 'webchat');
    $m('.mm-chat').innerHTML =
      modelo.kind === 'whatsapp_button' ? conteudoBotoes(modelo)
        : modelo.kind === 'whatsapp_list' ? conteudoLista(modelo)
          : conteudoWebchat(modelo, textoWebchat);
    criarIcones();
    atualizarAvisos();
  };

  const atualizarAvisos = () => {
    const contador = $m('.mm-contador');
    if (contador && modelo.kind !== 'webchat') contador.textContent = `${modelo.body.length}/${LIMITE.body}`;
    const avisos = avisosDoModelo(modelo).map((a) => `<p>${escapeHtml(a)}</p>`);
    if (modelo.kind === 'webchat' && !vaiUsarMensagemExistente() && textoWebchat.trim()) avisos.unshift(`<p class="mm-aviso-info">Ao salvar, este texto vira uma ação "Mensagem" logo antes do menu (é assim que o WebChat funciona).</p>`);
    if (vaiAbsorver()) avisos.unshift(`<p class="mm-aviso-info">Ao salvar, a ação "Mensagem" anterior vira a mensagem deste menu e é removida.</p>`);
    $m('.mm-avisos').innerHTML = avisos.join('');
  };

  // ---- troca de tipo
  const aplicarTroca = (novoKind, itens) => {
    if (novoKind === 'webchat') {
      textoWebchat = mensagemPerdidaWebchat(modelo);
      textoWhatsappAntesDoWebchat = { header: modelo.header, body: modelo.body, footer: modelo.footer, button: modelo.button, gerado: textoWebchat };
      modelo = converterModeloMenu(modelo, 'webchat', itens);
    } else if (modelo.kind === 'webchat') {
      const convertido = converterModeloMenu(modelo, novoKind, itens);
      const salvo = textoWhatsappAntesDoWebchat;
      if (salvo && salvo.gerado === textoWebchat) {
        Object.assign(convertido, { header: salvo.header, body: salvo.body, footer: salvo.footer, button: salvo.button });
      } else {
        convertido.body = textoWebchat;
        if (salvo) convertido.button = salvo.button;
      }
      modelo = convertido;
    } else {
      modelo = converterModeloMenu(modelo, novoKind, itens);
    }
    if (modelo.kind === 'whatsapp_list' && !modelo.button.trim()) modelo.button = BOTAO_LISTA_PADRAO;
    trocaPendente = null;
    $m('.mm-troca').classList.add('hidden');
    desenharConteudo();
  };

  const pedirTroca = (novoKind) => {
    if (novoKind === modelo.kind) return;
    const itens = extrairItensMenu(modelo);
    const limite = limiteParaTipoMenu(novoKind);
    if (itens.length <= limite) return aplicarTroca(novoKind, itens);
    trocaPendente = { kind: novoKind, itensCabem: itens.slice(0, limite), itensRemovidos: itens.slice(limite) };
    const rotulo = TIPOS.find((t) => t.kind === novoKind).label;
    const n = trocaPendente.itensRemovidos.length;
    $m('.mm-troca').innerHTML = `
      <p>Mudar para <strong>${escapeHtml(rotulo)}</strong> descarta ${n} ${n === 1 ? 'opção' : 'opções'} (limite do WhatsApp):
      ${trocaPendente.itensRemovidos.map((i) => `<em>${escapeHtml(i.title || '(sem texto)')}</em>`).join(', ')}.</p>
      <div><button type="button" class="fx-btn-secundario" data-mm="cancelar-troca">Manter como está</button>
      <button type="button" class="fx-btn-primario mm-btn-perigo" data-mm="confirmar-troca">Mudar mesmo assim</button></div>`;
    $m('.mm-troca').classList.remove('hidden');
  };

  // ---- fechar / salvar
  const fechar = () => fundo.remove();
  const pedirCancelar = () => {
    if (!houveMudanca()) return fechar();
    $m('.mm-descartar').classList.remove('hidden');
    $m('.mm-acoes').classList.add('hidden');
    $m('[data-mm="voltar"]').focus();
  };
  const salvar = () => {
    if (!houveMudanca()) return fechar();
    const alvo = (state.botCarregado?.BOT_ACTIONS || []).find((a) => a.TRANSITION_ID === transitionId && a.ID === actionId);
    if (!alvo) return fechar();
    const b = state.botCarregado;
    const menuMudou = assinaturaDe(modelo) !== assinaturaOriginal;
    const json = menuMudou ? atualizarMenuPreservando(raw, comIdsFinais(modelo)) : raw;
    // Edição no próprio objeto: as chaves espelho ("0", "1"...) apontam pra ele.
    const gravarNoLugar = () => {
      if (menuMudou) alvo.ACTION_DATA[CAMPO] = json;
      rerenderTransicao(b, transitionId);
      mostrarToast('Menu atualizado. Lembre de salvar o bot.');
    };
    if (modelo.kind === 'webchat') {
      const daTransicao = b.BOT_ACTIONS.filter((a) => a.TRANSITION_ID === transitionId).sort((x, y) => parseInt(x.ID, 10) - parseInt(y.ID, 10));
      const idx = daTransicao.findIndex((a) => a.ID === actionId);
      const anterior = idx > 0 && daTransicao[idx - 1].ACTION_TYPE === '1' ? daTransicao[idx - 1] : null;
      if (vaiUsarMensagemExistente() && anterior) {
        if (!anterior.ACTION_DATA) anterior.ACTION_DATA = {};
        if ((anterior.ACTION_DATA.message_text || '') !== textoWebchat) anterior.ACTION_DATA.message_text = textoWebchat;
        gravarNoLugar();
      } else if (textoWebchat.trim()) {
        dividirMensagemDoMenu(b, transitionId, actionId, textoWebchat, { ...alvo.ACTION_DATA, [CAMPO]: json });
        reabrirPreservandoExpansao(b);
        mostrarToast('Menu atualizado; o texto virou uma ação "Mensagem" antes dele. Lembre de salvar o bot.');
      } else {
        gravarNoLugar();
      }
    } else if (vaiAbsorver()) {
      absorverMensagemAnterior(b, transitionId, actionId, { ...alvo.ACTION_DATA, [CAMPO]: json });
      reabrirPreservandoExpansao(b);
      mostrarToast('Menu atualizado; a ação "Mensagem" anterior foi incorporada. Lembre de salvar o bot.');
    } else {
      gravarNoLugar();
    }
    fechar();
  };

  // ---- eventos
  fundo.addEventListener('input', (e) => {
    const el = e.target;
    if (el.hasAttribute('data-webchat-texto')) {
      textoWebchat = el.value;
      atualizarAvisos();
      return;
    }
    const caminho = el.dataset.caminho;
    if (!caminho) return;
    setPath(modelo, caminho, el.value);
    // ID/valor vazio mostra, em cinza, o que será gerado do texto
    const m = /^(.*)\.(title|text)$/.exec(caminho);
    if (m) {
      const irmao = fundo.querySelector(`[data-caminho="${m[1]}.${m[2] === 'text' ? 'value' : 'id'}"]`);
      if (irmao) irmao.placeholder = idDoTexto(el.value) || 'gerado do texto';
    }
    atualizarAvisos();
  });

  fundo.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mm]');
    if (!btn || btn.disabled) return;
    const acaoMm = btn.dataset.mm;
    const focarUltimo = (sel) => { const els = fundo.querySelectorAll(sel); if (els.length) els[els.length - 1].focus(); };
    switch (acaoMm) {
      case 'cancelar': pedirCancelar(); break;
      case 'voltar':
        $m('.mm-descartar').classList.add('hidden');
        $m('.mm-acoes').classList.remove('hidden');
        break;
      case 'descartar': fechar(); break;
      case 'salvar': salvar(); break;
      case 'tipo': pedirTroca(btn.dataset.kind); break;
      case 'confirmar-troca': if (trocaPendente) aplicarTroca(trocaPendente.kind, trocaPendente.itensCabem); break;
      case 'cancelar-troca':
        trocaPendente = null;
        $m('.mm-troca').classList.add('hidden');
        break;
      case 'adicionar-botao':
        if (modelo.buttons.length < WHATSAPP_BUTTON_MAX) { modelo.buttons.push({ id: '', title: '' }); desenharConteudo(); focarUltimo('.mm-botao-titulo'); }
        break;
      case 'remover-botao': modelo.buttons.splice(+btn.dataset.i, 1); desenharConteudo(); break;
      case 'adicionar-linha':
        if (countListRows(modelo) < WHATSAPP_LIST_MAX_ROWS) {
          if (!modelo.sections.length) modelo.sections.push({ title: '', rows: [] });
          modelo.sections[modelo.sections.length - 1].rows.push({ id: '', title: '', description: '' });
          desenharConteudo();
          focarUltimo('.mm-linha-titulo');
        }
        break;
      case 'remover-linha': {
        const secao = modelo.sections[+btn.dataset.si];
        secao.rows.splice(+btn.dataset.ri, 1);
        if (!secao.rows.length && modelo.sections.length > 1) modelo.sections.splice(+btn.dataset.si, 1);
        desenharConteudo();
        break;
      }
      case 'adicionar-opcao': modelo.options.push({ text: '', value: '' }); desenharConteudo(); focarUltimo('.mm-botao-titulo'); break;
      case 'remover-opcao': modelo.options.splice(+btn.dataset.i, 1); desenharConteudo(); break;
      default: break;
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
  desenharConteudo();
  criarIcones();
  const primeiro = $m('.mm-body') || $m('.mm-botao-titulo');
  if (primeiro) primeiro.focus();
}
