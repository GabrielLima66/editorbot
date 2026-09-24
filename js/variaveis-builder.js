// ---------------------------------------------------------------------------
// "Armazenar variável" (ACTION_TYPE 13): edição visual em linhas
// "variável ← valor" no lugar do JSON cru. Por baixo NADA muda: o campo
// gravado continua sendo ACTION_DATA.bot_variables_text, a mesma string JSON
// {"nome":"valor",...} que a Orpen usa.
//
// Garantias:
//  - Abrir e salvar sem mexer mantém o texto original byte a byte: o campo só
//    é reescrito quando o usuário edita no componente.
//  - Visual só quando o JSON é um objeto com TODOS os valores string (99% dos
//    casos reais). Número, lista, JSON inválido ou nome repetido abrem direto
//    no modo JSON (editável como antes) - nunca converte tipo sem querer.
//  - A ordem das variáveis é a do texto original (JSON.parse do JS
//    reordenaria chaves com cara de número).
//  - Cada edição grava no bot na hora (não fica só na tela).
// ---------------------------------------------------------------------------

import { state } from './state.js';
import { $, escapeHtml } from './utils.js';
import { criarIcones } from './dom-root.js';

const CAMPO = 'bot_variables_text';
const TOKEN_MENSAGEM = '{$message}';
const RE_TOKEN = /\{\$([A-Za-z0-9_]+)\}/g;
const RE_TOKEN_INTEIRO = /^\{\$([A-Za-z0-9_]+)\}$/;
const RE_STRING_JSON = /"(?:[^"\\]|\\.)*"/g;

// ---------------------------------------------------------------- modelo

/** { modo: 'visual', linhas: [{nome, valor}] } ou { modo: 'json', motivo }. */
export function lerVariaveis(raw) {
  const texto = typeof raw === 'string' ? raw : '';
  if (texto.trim() === '') return { modo: 'visual', linhas: [{ nome: '', valor: '' }] };

  let obj;
  try {
    obj = JSON.parse(texto);
  } catch {
    return { modo: 'json', motivo: 'O conteúdo não é um JSON válido.' };
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { modo: 'json', motivo: 'O conteúdo não é um objeto {"nome": "valor"}.' };
  }
  const chaves = Object.keys(obj);
  if (chaves.some((k) => typeof obj[k] !== 'string')) {
    return { modo: 'json', motivo: 'Há valores que não são texto (número ou lista): edite pelo JSON pra não mudar o tipo.' };
  }

  // Todos os valores são string, então o texto é uma sequência de literais
  // string JSON: chave, valor, chave, valor... na ordem original.
  const literais = texto.match(RE_STRING_JSON) || [];
  if (literais.length !== chaves.length * 2) {
    return { modo: 'json', motivo: 'Há nomes de variável repetidos: edite pelo JSON.' };
  }
  const linhas = [];
  for (let i = 0; i < literais.length; i += 2) {
    linhas.push({ nome: JSON.parse(literais[i]), valor: JSON.parse(literais[i + 1]) });
  }
  return { modo: 'visual', linhas: linhas.length ? linhas : [{ nome: '', valor: '' }] };
}

/** Linhas -> texto gravado. Linha sem nome é ignorada; nada preenchido -> ''. */
export function montarVariaveis(linhas) {
  const validas = linhas.filter((l) => l.nome.trim() !== '');
  if (!validas.length) return '';
  return '{' + validas.map((l) => `${JSON.stringify(l.nome.trim())}:${JSON.stringify(l.valor)}`).join(',') + '}';
}

// ---------------------------------------------------------------- sugestões

function strings(obj, saida) {
  if (typeof obj === 'string') saida.push(obj);
  else if (obj && typeof obj === 'object') Object.values(obj).forEach((v) => strings(v, saida));
  return saida;
}

/** Tokens {$x} citados no bot + nomes gravados por outros "Armazenar variável". */
function variaveisDoBot(bot) {
  const tokens = new Set();
  const nomes = new Set();
  const textos = [];
  (bot?.BOT_ACTIONS || []).forEach((a) => strings(a.ACTION_DATA, textos));
  (bot?.BOT_CONDITIONS || []).forEach((c) => strings(c.CONDITION_DATA, textos));
  textos.forEach((t) => {
    for (const m of t.matchAll(RE_TOKEN)) tokens.add(m[1]);
  });
  (bot?.BOT_ACTIONS || []).forEach((a) => {
    if (String(a.ACTION_TYPE) !== '13') return;
    const lido = lerVariaveis(a.ACTION_DATA?.[CAMPO]);
    if (lido.modo === 'visual') lido.linhas.forEach((l) => l.nome.trim() && nomes.add(l.nome.trim()));
  });
  return { tokens, nomes };
}

function variaveisDoAmbiente() {
  const lista = Array.isArray(state.ambienteOrpen?.variables) ? state.ambienteOrpen.variables : [];
  return lista.filter((v) => v && v.id).map((v) => ({ id: String(v.id), nome: String(v.name || v.id) }));
}

/** Rótulo legível de um valor que é exatamente um {$token} conhecido. */
function legendaDoValor(valor, rotulos) {
  const m = RE_TOKEN_INTEIRO.exec(valor.trim());
  if (!m) return '';
  if (valor.trim() === TOKEN_MENSAGEM) return 'Mensagem do cliente';
  return rotulos.get(m[1]) || '';
}

let rotulosCache = new Map();

/** Recria as duas datalists (valores e nomes). Chamada a cada abrirBotView. */
export function atualizarDatalistsVariaveis(bot) {
  const ref = $('#variaveis-datalist');
  if (!ref) return;
  const pai = ref.parentNode;
  const garantir = (id) => {
    let el = $('#' + id);
    if (!el) {
      el = document.createElement('datalist');
      el.id = id;
      pai.appendChild(el);
    }
    return el;
  };

  const ambiente = variaveisDoAmbiente();
  const { tokens, nomes } = variaveisDoBot(bot);
  const rotulos = new Map(ambiente.map((v) => [v.id, v.nome]));
  rotulosCache = rotulos;

  const opcoesValor = [`<option value="${escapeHtml(TOKEN_MENSAGEM)}" label="Mensagem do cliente"></option>`];
  const vistos = new Set(['message']);
  ambiente.forEach((v) => {
    if (vistos.has(v.id)) return;
    vistos.add(v.id);
    opcoesValor.push(`<option value="${escapeHtml(`{$${v.id}}`)}" label="${escapeHtml(v.nome)}"></option>`);
  });
  [...tokens].sort().forEach((t) => {
    if (vistos.has(t)) return;
    vistos.add(t);
    opcoesValor.push(`<option value="${escapeHtml(`{$${t}}`)}" label="Usada neste bot"></option>`);
  });
  garantir('var-valores-datalist').innerHTML = opcoesValor.join('');

  const opcoesNome = [];
  const nomesVistos = new Set();
  [...nomes].sort().forEach((n) => {
    nomesVistos.add(n);
    opcoesNome.push(`<option value="${escapeHtml(n)}" label="Gravada neste bot"></option>`);
  });
  ambiente.forEach((v) => {
    if (nomesVistos.has(v.id)) return;
    nomesVistos.add(v.id);
    opcoesNome.push(`<option value="${escapeHtml(v.id)}" label="${escapeHtml(v.nome)}"></option>`);
  });
  garantir('var-nomes-datalist').innerHTML = opcoesNome.join('');
}

// ---------------------------------------------------------------- render

function renderLinha(linha, i) {
  const legenda = legendaDoValor(linha.valor, rotulosCache);
  return `
    <div class="var-linha" data-i="${i}">
      <input type="text" class="field-view var-nome" list="var-nomes-datalist" value="${escapeHtml(linha.nome)}" placeholder="nome_da_variavel" spellcheck="false" aria-label="Nome da variável">
      <span class="var-seta" aria-hidden="true">←</span>
      <div class="var-valor-wrap">
        <input type="text" class="field-view var-valor" list="var-valores-datalist" value="${escapeHtml(linha.valor)}" placeholder="valor ou {$variável}" spellcheck="false" aria-label="Valor">
        <p class="var-legenda${legenda ? '' : ' hidden'}">${escapeHtml(legenda)}</p>
      </div>
      <button type="button" class="mb-builder-remove-btn" data-var="remover" data-i="${i}" title="Remover variável"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
    </div>`;
}

function avisos(linhas) {
  const lista = [];
  if (linhas.some((l) => !l.nome.trim() && l.valor.trim())) lista.push('Há valor sem nome de variável: essa linha não será gravada.');
  const nomes = linhas.map((l) => l.nome.trim()).filter(Boolean);
  if (new Set(nomes).size !== nomes.length) lista.push('Há nomes repetidos: na plataforma, o último valor vence.');
  return lista.map((a) => `<p class="var-aviso">${escapeHtml(a)}</p>`).join('');
}

export function renderVariaveisBuilder(transitionId, actionId, raw) {
  const lido = lerVariaveis(raw);
  const ids = `data-transition-id="${escapeHtml(transitionId)}" data-action-id="${escapeHtml(actionId)}"`;
  if (lido.modo === 'json') {
    return `
      <div class="var-builder" ${ids} data-modo="json">
        <p class="var-aviso">${escapeHtml(lido.motivo)}</p>
        <textarea rows="4" class="textarea-view font-mono text-xs var-json-editavel" spellcheck="false">${escapeHtml(raw ?? '')}</textarea>
      </div>`;
  }
  return `
    <div class="var-builder" ${ids} data-modo="visual">
      <div class="var-cabecalho"><span>Variável</span><span></span><span>Valor</span></div>
      <div class="var-linhas">${lido.linhas.map(renderLinha).join('')}</div>
      <div class="var-avisos">${avisos(lido.linhas)}</div>
      <button type="button" class="mb-builder-add-btn" data-var="adicionar"><i data-lucide="plus" class="w-3 h-3 inline-block -mt-0.5 mr-1"></i>Variável</button>
      <div class="mb-json-toggle-row">
        <button type="button" class="mb-json-toggle" data-var="toggle-json" aria-expanded="false">
          <i data-lucide="chevron-down" class="w-3.5 h-3.5 mb-json-chevron"></i>
          <span>Ver JSON gravado</span>
        </button>
      </div>
      <div class="var-json-painel hidden mt-2">
        <textarea readonly rows="3" class="textarea-view font-mono text-xs var-json">${escapeHtml(raw ?? '')}</textarea>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- comportamento

function gravar(transitionId, actionId, texto) {
  const acao = (state.botCarregado?.BOT_ACTIONS || []).find((a) => a.TRANSITION_ID === transitionId && a.ID === actionId);
  if (!acao) return;
  acao.ACTION_DATA = { ...acao.ACTION_DATA, [CAMPO]: texto };
}

function linhasDoDom(container) {
  return [...container.querySelectorAll('.var-linha')].map((el) => ({
    nome: el.querySelector('.var-nome').value,
    valor: el.querySelector('.var-valor').value,
  }));
}

/** Liga os .var-builder de `root` (ou de todo #bv-estados). */
export function initVariaveisBuilders(root) {
  (root || $('#bv-estados'))?.querySelectorAll('.var-builder').forEach((container) => {
    if (container.dataset.ligado) return;
    container.dataset.ligado = '1';
    const { transitionId, actionId } = container.dataset;

    if (container.dataset.modo === 'json') {
      container.querySelector('.var-json-editavel').addEventListener('change', (e) => gravar(transitionId, actionId, e.target.value));
      return;
    }

    const sincronizar = () => {
      const linhas = linhasDoDom(container);
      const texto = montarVariaveis(linhas);
      gravar(transitionId, actionId, texto);
      container.querySelector('.var-json').value = texto;
      container.querySelector('.var-avisos').innerHTML = avisos(linhas);
      container.querySelectorAll('.var-linha').forEach((el) => {
        const legenda = legendaDoValor(el.querySelector('.var-valor').value, rotulosCache);
        const p = el.querySelector('.var-legenda');
        p.textContent = legenda;
        p.classList.toggle('hidden', !legenda);
      });
    };

    container.addEventListener('input', (e) => {
      if (e.target.matches('.var-nome, .var-valor')) sincronizar();
    });

    container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-var]');
      if (!btn) return;
      const acao = btn.dataset.var;
      if (acao === 'toggle-json') {
        const aberto = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!aberto));
        container.querySelector('.var-json-painel').classList.toggle('hidden', aberto);
        return;
      }
      const lista = container.querySelector('.var-linhas');
      if (acao === 'adicionar') {
        const i = lista.children.length;
        lista.insertAdjacentHTML('beforeend', renderLinha({ nome: '', valor: '' }, i));
        criarIcones();
        lista.lastElementChild.querySelector('.var-nome').focus();
        sincronizar();
      } else if (acao === 'remover') {
        btn.closest('.var-linha').remove();
        if (!lista.children.length) {
          lista.insertAdjacentHTML('beforeend', renderLinha({ nome: '', valor: '' }, 0));
          criarIcones();
        }
        sincronizar();
      }
    });
  });
}
