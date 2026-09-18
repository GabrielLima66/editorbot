import { state } from './state.js';
import { getRootNode, criarIcones } from './dom-root.js';

// Busca sempre no root ativo (document em modo standalone, o shadowRoot da
// extensão quando injetado em cima do bot.php da Orpen) — ver js/dom-root.js.
export const $ = (sel) => getRootNode().querySelector(sel);

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function optionsHtml(options, selectedValue) {
  return options.map(o => `<option value="${escapeHtml(o.value)}"${String(o.value) === String(selectedValue) ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('');
}

export function entriesToOptions(map) {
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}

// Resolve o texto exibido/digitado num campo "busca por texto" (input +
// datalist sobre um conjunto fechado de valores, ex.: variável da condição,
// tipo de ação) de volta pra chave interna — undefined se não bater com
// nenhum rótulo conhecido (aí quem chamou reverte o campo).
export function resolverPorLabel(dict, textoDigitado) {
  const alvo = (textoDigitado ?? '').trim().toLowerCase();
  const entrada = Object.entries(dict).find(([, label]) => label.trim().toLowerCase() === alvo);
  return entrada ? entrada[0] : undefined;
}

// Mesma ideia, mas pra uma lista [{value,label}] já pronta (ex.:
// buildOperatorOptions) em vez de um dicionário {chave: rótulo}.
export function resolverPorLabelLista(lista, textoDigitado) {
  const alvo = (textoDigitado ?? '').trim().toLowerCase();
  const encontrada = lista.find(o => o.label.trim().toLowerCase() === alvo);
  return encontrada ? encontrada.value : undefined;
}

export function setPath(root, path, value) {
  const parts = path.split('.');
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts[parts.length - 1]] = value;
}

// Notificação transitória (auto-some sozinha), usada quando o app faz uma
// mutação real no bot "por baixo dos panos" sem pedir confirmação — pelo
// split/junção automática de menu WebChat (dividirMensagemDoMenu /
// absorverMensagemAnterior). Anexada direto na raiz ativa (document.body em
// modo standalone; o próprio shadowRoot na extensão — ShadowRoot aceita
// appendChild direto, não tem <body>): #bot-view-overlay/#bv-estados são
// recriados por abrirBotView, então um toast pendurado ali dentro sumiria
// junto no instante do re-render.
export function mostrarToast(texto) {
  const root = getRootNode();
  const montagem = root === document ? document.body : root;
  let container = montagem.querySelector('#mb-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'mb-toast-container';
    montagem.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'mb-toast';
  toast.id = 'mb-toast-' + (++state.mbToastSeq);
  toast.innerHTML = `<i data-lucide="check-circle-2" class="w-4 h-4"></i><span></span>`;
  toast.querySelector('span').textContent = texto;
  container.appendChild(toast);
  criarIcones();
  requestAnimationFrame(() => toast.classList.add('mb-toast-show'));
  setTimeout(() => {
    toast.classList.remove('mb-toast-show');
    setTimeout(() => toast.remove(), 200);
  }, 3200);
}
