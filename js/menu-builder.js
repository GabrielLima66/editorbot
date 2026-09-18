import { state } from './state.js';
import { $, escapeHtml, setPath, mostrarToast } from './utils.js';
import { criarIcones } from './dom-root.js';
import {
  dividirMensagemDoMenu,
  mensagemAnteriorNaTransicao,
  absorverMensagemAnterior,
  reabrirPreservandoExpansao,
} from './bot-view-interactions.js';

// Limites reais da API do WhatsApp: lista aceita até 10 linhas no total
// (somando todas as seções) e menu de botões aceita até 3 botões.
export const WHATSAPP_LIST_MAX_ROWS = 10;
export const WHATSAPP_BUTTON_MAX = 3;

export function countListRows(model) {
  return model.sections.reduce((sum, s) => sum + s.rows.length, 0);
}

export function parseMenuModel(raw) {
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { /* não é JSON válido ainda */ }

  if (parsed && parsed.interactive && parsed.interactive.type === 'button') {
    const it = parsed.interactive;
    return {
      kind: 'whatsapp_button',
      header: it.header?.text || '', body: it.body?.text || '', footer: it.footer?.text || '',
      buttons: (it.action?.buttons || []).map(b => ({ id: b.reply?.id || '', title: b.reply?.title || '' })),
    };
  }
  if (parsed && parsed.interactive) {
    const it = parsed.interactive;
    return {
      kind: 'whatsapp_list',
      header: it.header?.text || '', body: it.body?.text || '', footer: it.footer?.text || '',
      button: it.action?.button || '',
      sections: (it.action?.sections || []).map(s => ({
        title: s.title || '',
        rows: (s.rows || []).map(r => ({ id: r.id || '', title: r.title || '', description: r.description || '' })),
      })),
    };
  }
  if (parsed && parsed.message_type === 'menu') {
    return {
      kind: 'webchat',
      options: (parsed.options || []).map(o => ({ text: o.text || '', value: o.value || '' })),
    };
  }
  return { kind: 'unknown', raw: raw || '' };
}

export function defaultMenuModel(kind) {
  if (kind === 'whatsapp_list') return { kind, header: '', body: '', footer: '', button: '', sections: [{ title: '', rows: [{ id: '', title: '', description: '' }] }] };
  if (kind === 'whatsapp_button') return { kind, header: '', body: '', footer: '', buttons: [{ id: '', title: '' }] };
  if (kind === 'webchat') return { kind, options: [{ text: '', value: '' }] };
  return { kind: 'unknown', raw: '' };
}

// Extrai a lista "achatada" de itens (linhas/botões/opções) de um modelo,
// independente do kind atual — é o que permite portar conteúdo entre os três
// formatos sem depender da forma específica de cada um. 'unknown' devolve []
// (não tem o que preservar; trocar de tipo a partir dele sempre começa vazio).
export function extrairItensMenu(model) {
  if (model.kind === 'whatsapp_list') {
    const itens = [];
    (model.sections || []).forEach(s => (s.rows || []).forEach(r => itens.push({ title: r.title || '', id: r.id || '', description: r.description || '' })));
    return itens;
  }
  if (model.kind === 'whatsapp_button') {
    return (model.buttons || []).map(b => ({ title: b.title || '', id: b.id || '', description: '' }));
  }
  if (model.kind === 'webchat') {
    return (model.options || []).map(o => ({ title: o.text || '', id: o.value || '', description: '' }));
  }
  return [];
}

// Quantos itens cada formato-alvo aceita (mesmos limites já usados nos
// contadores da UI; WebChat não tem teto).
export function limiteParaTipoMenu(kind) {
  if (kind === 'whatsapp_list') return WHATSAPP_LIST_MAX_ROWS;
  if (kind === 'whatsapp_button') return WHATSAPP_BUTTON_MAX;
  return Infinity;
}

// Monta o modelo do novo kind a partir de uma lista de itens já dentro do
// limite (quem chama decide se trunca ou não) e do texto comum herdado do
// modelo anterior. header/body/footer/button viajam pra whatsapp_list e
// whatsapp_button (é isso que faz eles reaparecerem intactos ao alternar
// entre esses dois). Pra webchat NÃO viajam mais: esse texto agora é
// separado de verdade numa ação "Mensagem" real (ver dividirMensagemDoMenu),
// então não sobra nada pra "voltar" se o usuário trocar de kind de novo —
// carregá-lo em memória só reintroduziria a ambiguidade que motivou o split.
// Perda de "description" ao ir pra whatsapp_button (que não tem esse campo)
// é estrutural, mas de menor impacto — sem tratamento especial por enquanto.
export function converterModeloMenu(model, novoKind, itens) {
  const base = { header: model.header || '', body: model.body || '', footer: model.footer || '', button: model.button || '' };
  if (novoKind === 'whatsapp_list') {
    return { kind: novoKind, ...base, sections: [{ title: '', rows: itens.length ? itens.map(i => ({ title: i.title, id: i.id, description: i.description || '' })) : [{ id: '', title: '', description: '' }] }] };
  }
  if (novoKind === 'whatsapp_button') {
    return { kind: novoKind, ...base, buttons: itens.length ? itens.map(i => ({ title: i.title, id: i.id })) : [{ id: '', title: '' }] };
  }
  if (novoKind === 'webchat') {
    return { kind: novoKind, options: itens.length ? itens.map(i => ({ text: i.title, value: i.id || i.title })) : [{ text: '', value: '' }] };
  }
  return defaultMenuModel(novoKind);
}

// Texto que fica sem lugar no JSON do WebChat (cabeçalho/corpo/rodapé não têm
// pra onde ir nesse formato). Chamado com o modelo ANTIGO, no instante da
// conversão pra webchat, pra virar o texto de uma ação "Mensagem" real
// inserida antes da ação de menu (ver dividirMensagemDoMenu) — depois da
// conversão o modelo webchat não carrega mais esses campos, então essa
// função não tem mais utilidade de exibição.
export function mensagemPerdidaWebchat(model) {
  return [model.header, model.body, model.footer].filter(Boolean).join('\n\n');
}

export function buildMenuJson(model) {
  if (model.kind === 'whatsapp_list') {
    const interactive = { type: 'list' };
    if (model.header) interactive.header = { type: 'text', text: model.header };
    interactive.body = { text: model.body || '' };
    if (model.footer) interactive.footer = { text: model.footer };
    interactive.action = {
      button: model.button || '',
      sections: model.sections.map(s => ({
        title: s.title || '',
        rows: s.rows.map(r => Object.assign({ id: r.id || '', title: r.title || '' }, r.description ? { description: r.description } : {})),
      })),
    };
    return JSON.stringify({ interactive }, null, 2);
  }
  if (model.kind === 'whatsapp_button') {
    const interactive = { type: 'button' };
    if (model.header) interactive.header = { type: 'text', text: model.header };
    interactive.body = { text: model.body || '' };
    if (model.footer) interactive.footer = { text: model.footer };
    interactive.action = { buttons: model.buttons.map(b => ({ type: 'reply', reply: { id: b.id || '', title: b.title || '' } })) };
    return JSON.stringify({ interactive }, null, 2);
  }
  if (model.kind === 'webchat') {
    return JSON.stringify({ message_type: 'menu', menu_type: 'list', options: model.options.map(o => ({ text: o.text || '', value: o.value || '' })) }, null, 2);
  }
  return model.raw || '';
}

export function renderMenuCommonFields(model) {
  return `
    <div class="mb-field-group"><label class="mb-field-label">Cabeçalho (opcional)</label><input class="field-view mb-builder-input" data-path="header" value="${escapeHtml(model.header)}"></div>
    <div class="mb-field-group"><label class="mb-field-label">Corpo</label><textarea class="textarea-view mb-builder-input" data-path="body" rows="3">${escapeHtml(model.body)}</textarea></div>
    <div class="mb-field-group"><label class="mb-field-label">Rodapé (opcional)</label><input class="field-view mb-builder-input" data-path="footer" value="${escapeHtml(model.footer)}"></div>`;
}

export function renderMenuFields(model) {
  if (model.kind === 'whatsapp_list') {
    const totalRows = countListRows(model);
    const atRowLimit = totalRows >= WHATSAPP_LIST_MAX_ROWS;
    let rowCounter = 0;
    const sectionsHtml = model.sections.map((s, si) => `
      <div class="mb-section-card">
        <p class="mb-section-eyebrow">Seção ${si + 1}</p>
        <div class="mb-field-group"><input class="field-view mb-builder-input" data-path="sections.${si}.title" placeholder="Título da seção" value="${escapeHtml(s.title)}"></div>
        ${s.rows.map((r, ri) => {
          rowCounter++;
          return `
          <div class="mb-row-card">
            <span class="mb-row-badge">${rowCounter}</span>
            <div class="mb-row-fields">
              <input class="field-view mb-builder-input" data-path="sections.${si}.rows.${ri}.title" placeholder="Título da opção" value="${escapeHtml(r.title)}">
              <input class="field-view mb-builder-input" data-path="sections.${si}.rows.${ri}.description" placeholder="Descrição (opcional)" value="${escapeHtml(r.description)}">
              <input class="field-view mb-builder-input" data-path="sections.${si}.rows.${ri}.id" placeholder="ID interno" value="${escapeHtml(r.id)}">
            </div>
            <button type="button" class="mb-builder-remove-btn" data-action="remove-row" data-si="${si}" data-ri="${ri}" title="Remover opção"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
          </div>`;
        }).join('')}
        <button type="button" class="mb-builder-add-btn" data-action="add-row" data-si="${si}"${atRowLimit ? ' disabled title="Limite de 10 opções no total atingido"' : ''}>+ Opção nesta seção</button>
      </div>`).join('');
    return `
      ${renderMenuCommonFields(model)}
      <div class="mb-field-group"><label class="mb-field-label">Texto do botão (abre a lista)</label><input class="field-view mb-builder-input" data-path="button" value="${escapeHtml(model.button)}"></div>
      <label class="mb-field-label">Seções e opções</label>
      ${sectionsHtml}
      <button type="button" class="mb-builder-add-btn" data-action="add-section"${atRowLimit ? ' disabled title="Limite de 10 opções no total atingido"' : ''}>+ Seção</button>
      <p class="mb-limit-counter">${totalRows}/${WHATSAPP_LIST_MAX_ROWS} opções no total — limite da API do WhatsApp</p>`;
  }
  if (model.kind === 'whatsapp_button') {
    const atButtonLimit = model.buttons.length >= WHATSAPP_BUTTON_MAX;
    const buttonsHtml = model.buttons.map((b, bi) => `
      <div class="mb-row-card">
        <span class="mb-row-badge">${bi + 1}</span>
        <div class="mb-row-fields">
          <input class="field-view mb-builder-input" data-path="buttons.${bi}.title" placeholder="Título do botão" value="${escapeHtml(b.title)}">
          <input class="field-view mb-builder-input" data-path="buttons.${bi}.id" placeholder="ID interno" value="${escapeHtml(b.id)}">
        </div>
        <button type="button" class="mb-builder-remove-btn" data-action="remove-button" data-bi="${bi}" title="Remover botão"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
      </div>`).join('');
    return `
      ${renderMenuCommonFields(model)}
      <label class="mb-field-label">Botões</label>
      ${buttonsHtml}
      <button type="button" class="mb-builder-add-btn" data-action="add-button"${atButtonLimit ? ' disabled title="Limite de 3 botões atingido"' : ''}>+ Botão</button>
      <p class="mb-limit-counter">${model.buttons.length}/${WHATSAPP_BUTTON_MAX} botões — limite da API do WhatsApp</p>`;
  }
  if (model.kind === 'webchat') {
    const optionsHtmlList = model.options.map((o, oi) => `
      <div class="mb-row-card">
        <span class="mb-row-badge">${oi + 1}</span>
        <div class="mb-row-fields">
          <input class="field-view mb-builder-input" data-path="options.${oi}.text" placeholder="Texto exibido" value="${escapeHtml(o.text)}">
          <input class="field-view mb-builder-input" data-path="options.${oi}.value" placeholder="Valor interno" value="${escapeHtml(o.value)}">
        </div>
        <button type="button" class="mb-builder-remove-btn" data-action="remove-option" data-oi="${oi}" title="Remover opção"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
      </div>`).join('');
    return `
      <p class="estado-empty text-xs mb-3">O menu de WebChat não tem mensagem embutida — a pergunta precisa vir de uma ação "Mensagem" separada, logo antes desta.</p>
      <label class="mb-field-label">Opções</label>
      ${optionsHtmlList}
      <button type="button" class="mb-builder-add-btn" data-action="add-option">+ Opção</button>`;
  }
  return `<p class="estado-empty text-xs">Formato não reconhecido — escolha um tipo acima pra começar do zero.</p>`;
}

export const MENU_KIND_TABS = [
  { kind: 'whatsapp_list', label: 'WhatsApp — Lista' },
  { kind: 'whatsapp_button', label: 'WhatsApp — Botões' },
  { kind: 'webchat', label: 'WebChat' },
];

// Painel de confirmação de truncamento — mesma família visual do painel de
// exclusão de estado (.estado-alert / .estado-alert-confirm), mostrado dentro
// do próprio Menu Builder quando o kind escolhido tem capacidade menor que a
// quantidade de itens já preenchidos no kind atual.
export function renderPainelTruncamentoMenu(labelAlvo, itensRemovidos) {
  const lista = itensRemovidos.map(i => `<li>${escapeHtml(i.title || '(sem título)')}${i.id ? ` <span class="estado-empty">— id: ${escapeHtml(i.id)}</span>` : ''}</li>`).join('');
  return `
    <div class="estado-alert estado-alert-confirm">
      <div class="estado-alert-head"><i data-lucide="alert-triangle" class="w-4 h-4"></i><p>Mudar pra "${escapeHtml(labelAlvo)}" descarta ${itensRemovidos.length} ${itensRemovidos.length === 1 ? 'opção' : 'opções'}</p></div>
      <p class="estado-alert-sub">Esse formato aceita menos opções que o atual. As opções abaixo não cabem e serão perdidas se você continuar:</p>
      <ul class="estado-alert-list">${lista}</ul>
      <div class="estado-alert-actions">
        <button type="button" class="estado-alert-btn-ghost" data-action="cancelar-truncamento-menu">Cancelar</button>
        <button type="button" class="estado-alert-btn-ghost" data-action="copiar-truncamento-menu">Copiar opções removidas</button>
        <button type="button" class="estado-alert-btn-danger" data-action="confirmar-truncamento-menu">Continuar mesmo assim</button>
      </div>
    </div>`;
}

export function renderMenuBuilderShell(uid, model, transitionId, actionId) {
  const tabsHtml = MENU_KIND_TABS.map(t => `<button type="button" class="mb-kind-btn${model.kind === t.kind ? ' active' : ''}" data-action="set-kind" data-kind="${t.kind}">${t.label}</button>`).join('')
    + (model.kind === 'unknown' ? `<button type="button" class="mb-kind-btn active" disabled>Formato não reconhecido</button>` : '');
  return `
    <div class="menu-builder" data-uid="${uid}" data-transition-id="${escapeHtml(transitionId)}" data-action-id="${escapeHtml(actionId)}">
      <div class="mb-kind-switch">${tabsHtml}</div>
      <div class="hidden mb-3" data-role="menu-truncate-panel"></div>
      <div class="menu-builder-fields">${renderMenuFields(model)}</div>
      <div class="mb-json-toggle-row">
        <button type="button" class="mb-json-toggle" data-action="toggle-json" aria-expanded="false">
          <i data-lucide="chevron-down" class="w-3.5 h-3.5 mb-json-chevron"></i>
          <span>Ver JSON gerado</span>
        </button>
        <button type="button" class="mb-builder-copy-btn" data-action="copy-json">Copiar</button>
      </div>
      <div class="menu-builder-json-panel hidden mt-2">
        <textarea readonly rows="8" class="textarea-view font-mono text-xs menu-builder-json">${escapeHtml(buildMenuJson(model))}</textarea>
      </div>
    </div>`;
}

// `root` permite escopar a um subtree recém-inserido (ver rerenderTransicao/
// rerenderEstado) em vez de escanear #bv-estados inteiro de novo — rebindar
// os .menu-builder que já existem e não mudaram acumularia listener duplicado.
export function initMenuBuilders(root) {
  (root || $('#bv-estados')).querySelectorAll('.menu-builder').forEach(container => {
    const uid = container.dataset.uid;
    const transitionId = container.dataset.transitionId;
    const actionId = container.dataset.actionId;

    function rerenderFields() {
      const model = state.MENU_MODELS[uid];
      container.querySelector('.menu-builder-fields').innerHTML = renderMenuFields(model);
      container.querySelector('.menu-builder-json').value = buildMenuJson(model);
      criarIcones();
    }

    function ocultarPainelTruncamento() {
      const painel = container.querySelector('[data-role="menu-truncate-panel"]');
      if (painel) { painel.classList.add('hidden'); painel.innerHTML = ''; }
    }

    function mostrarPainelTruncamento() {
      const pendente = state.MENU_PENDENTES_TRUNCAMENTO[uid];
      if (!pendente) return;
      const label = (MENU_KIND_TABS.find(t => t.kind === pendente.novoKind) || {}).label || pendente.novoKind;
      const painel = container.querySelector('[data-role="menu-truncate-panel"]');
      painel.innerHTML = renderPainelTruncamentoMenu(label, pendente.itensRemovidos);
      painel.classList.remove('hidden');
      criarIcones();
    }

    function rerenderKind() {
      const model = state.MENU_MODELS[uid];
      container.querySelectorAll('.mb-kind-btn').forEach(b => b.classList.toggle('active', b.dataset.kind === model.kind));
      rerenderFields();
    }

    container.addEventListener('input', (e) => {
      const el = e.target;
      if (!el.classList.contains('mb-builder-input') || el.tagName === 'SELECT') return;
      delete state.MENU_PENDENTES_TRUNCAMENTO[uid];
      ocultarPainelTruncamento();
      setPath(state.MENU_MODELS[uid], el.dataset.path, el.value);
      container.querySelector('.menu-builder-json').value = buildMenuJson(state.MENU_MODELS[uid]);
    });

    container.addEventListener('change', (e) => {
      const el = e.target;
      if (!el.classList.contains('mb-builder-input') || el.tagName !== 'SELECT') return;
      delete state.MENU_PENDENTES_TRUNCAMENTO[uid];
      ocultarPainelTruncamento();
      setPath(state.MENU_MODELS[uid], el.dataset.path, el.value);
      container.querySelector('.menu-builder-json').value = buildMenuJson(state.MENU_MODELS[uid]);
    });

    container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const model = state.MENU_MODELS[uid];
      const action = btn.dataset.action;
      if (action === 'set-kind') {
        const novoKind = btn.dataset.kind;
        delete state.MENU_PENDENTES_TRUNCAMENTO[uid];
        ocultarPainelTruncamento();
        if (novoKind === model.kind) return;
        const itens = extrairItensMenu(model);
        const limite = limiteParaTipoMenu(novoKind);
        if (itens.length > limite) {
          state.MENU_PENDENTES_TRUNCAMENTO[uid] = { novoKind, itensCabem: itens.slice(0, limite), itensRemovidos: itens.slice(limite) };
          mostrarPainelTruncamento();
          return;
        }
        const modeloConvertido = converterModeloMenu(model, novoKind, itens);
        if (novoKind === 'webchat') {
          const textoPerdido = mensagemPerdidaWebchat(model);
          if (textoPerdido && state.botCarregado && transitionId && actionId) {
            dividirMensagemDoMenu(state.botCarregado, transitionId, actionId, textoPerdido, { message_option_text: buildMenuJson(modeloConvertido) });
            reabrirPreservandoExpansao(state.botCarregado);
            mostrarToast('Ação "Mensagem" criada automaticamente com o texto do menu.');
            return;
          }
        } else if (model.kind === 'webchat' && (novoKind === 'whatsapp_list' || novoKind === 'whatsapp_button')) {
          const textoAnterior = (state.botCarregado && transitionId && actionId) ? mensagemAnteriorNaTransicao(state.botCarregado, transitionId, actionId) : null;
          if (textoAnterior !== null) {
            const modeloComTexto = { ...modeloConvertido, body: textoAnterior };
            absorverMensagemAnterior(state.botCarregado, transitionId, actionId, { message_option_text: buildMenuJson(modeloComTexto) });
            reabrirPreservandoExpansao(state.botCarregado);
            mostrarToast('Ação "Mensagem" anterior foi incorporada de volta ao menu.');
            return;
          }
        }
        state.MENU_MODELS[uid] = modeloConvertido;
        rerenderKind();
        return;
      }
      else if (action === 'cancelar-truncamento-menu') {
        delete state.MENU_PENDENTES_TRUNCAMENTO[uid];
        ocultarPainelTruncamento();
        return;
      }
      else if (action === 'copiar-truncamento-menu') {
        const pendente = state.MENU_PENDENTES_TRUNCAMENTO[uid];
        if (!pendente) return;
        navigator.clipboard?.writeText(JSON.stringify(pendente.itensRemovidos.map(i => ({ title: i.title, id: i.id })), null, 2));
        const original = btn.textContent;
        btn.textContent = 'Copiado!';
        setTimeout(() => { btn.textContent = original; }, 1200);
        return;
      }
      else if (action === 'confirmar-truncamento-menu') {
        const pendente = state.MENU_PENDENTES_TRUNCAMENTO[uid];
        if (!pendente) return;
        state.MENU_MODELS[uid] = converterModeloMenu(model, pendente.novoKind, pendente.itensCabem);
        delete state.MENU_PENDENTES_TRUNCAMENTO[uid];
        ocultarPainelTruncamento();
        rerenderKind();
        return;
      }
      else if (action === 'toggle-json') {
        const panel = container.querySelector('.menu-builder-json-panel');
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!expanded));
        panel.classList.toggle('hidden', expanded);
        return;
      }
      else if (action === 'add-section') { if (countListRows(model) >= WHATSAPP_LIST_MAX_ROWS) return; model.sections.push({ title: '', rows: [{ id: '', title: '', description: '' }] }); }
      else if (action === 'remove-section') model.sections.splice(+btn.dataset.si, 1);
      else if (action === 'add-row') { if (countListRows(model) >= WHATSAPP_LIST_MAX_ROWS) return; model.sections[+btn.dataset.si].rows.push({ id: '', title: '', description: '' }); }
      else if (action === 'remove-row') model.sections[+btn.dataset.si].rows.splice(+btn.dataset.ri, 1);
      else if (action === 'add-button') { if (model.buttons.length >= WHATSAPP_BUTTON_MAX) return; model.buttons.push({ id: '', title: '' }); }
      else if (action === 'remove-button') model.buttons.splice(+btn.dataset.bi, 1);
      else if (action === 'add-option') model.options.push({ text: '', value: '' });
      else if (action === 'remove-option') model.options.splice(+btn.dataset.oi, 1);
      else if (action === 'copy-json') {
        navigator.clipboard?.writeText(container.querySelector('.menu-builder-json').value);
        const original = btn.textContent;
        btn.textContent = 'Copiado!';
        setTimeout(() => { btn.textContent = original; }, 1200);
        return;
      } else return;
      delete state.MENU_PENDENTES_TRUNCAMENTO[uid];
      ocultarPainelTruncamento();
      rerenderFields();
    });
  });
}
