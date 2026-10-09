// ---------------------------------------------------------------------------
// "Analisar bot": painel à direita (mesmo encaixe do Localizar) com os pontos
// soltos que js/analise-bot.js acha no bot aberto: destino inexistente, estado
// sem saída, loop que reenvia sem esperar o cliente, opção de menu sem
// tratamento, condição que espera outro ID. Clicar num achado leva ao estado,
// à transição ou à ação. Só leitura: nada é alterado nem bloqueia o salvar.
// A análise lê state.botCarregado e refaz sozinha a cada edição. Erros e avisos
// aparecem abertos; "informativos" (dependem do que a análise não enxerga)
// ficam recolhidos.
// ---------------------------------------------------------------------------

import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { getRootNode, criarIcones, empilharEsc } from './dom-root.js';
import { analisarBot, REGRAS } from './analise-bot.js';

const SEVERIDADES = [
  { id: 'erro', rotulo: 'Erros', um: 'erro', icone: 'circle-x', dica: 'Quebram o fluxo: o bot trava, repete sem parar ou nunca executa o que foi configurado.' },
  { id: 'aviso', rotulo: 'Avisos', um: 'aviso', icone: 'triangle-alert', dica: 'Provável problema, ou algo que só dá certo em parte dos casos.' },
  { id: 'info', rotulo: 'Informativos', um: 'informativo', icone: 'info', dica: 'Dependem de algo que a análise não enxerga (destino {$variável}, entrada, timeout). Confira, mas podem estar certos.' },
];
const EVENTO_PAINEL = 'editor:painel-aberto';

const analise = {
  aberta: false,
  achados: [],
  resumo: { erro: 0, aviso: 0, info: 0, total: 0, porRegra: {} },
  falha: '',
  atual: null, // chave do achado em foco
  filtro: null, // 'erro' | 'aviso' | 'info' | null (todos)
  infoAberto: false,
};

const $r = (sel) => getRootNode().querySelector(sel);
const painel = () => $r('#an-painel');

// ---------------------------------------------------------------- analisar

function executar() {
  try {
    const { achados, resumo } = analisarBot(state.botCarregado || {});
    analise.achados = achados;
    analise.resumo = resumo;
    analise.falha = '';
  } catch (e) {
    console.error('[EDITOR_BOT] A análise do bot falhou:', e);
    analise.achados = [];
    analise.resumo = { erro: 0, aviso: 0, info: 0, total: 0, porRegra: {} };
    analise.falha = 'A análise não conseguiu ler este bot. O erro está no console do navegador.';
  }
  if (analise.atual && !analise.achados.some((a) => a.chave === analise.atual)) analise.atual = null;
  desenhar();
  atualizarContador();
}

function atualizarContador() {
  const btn = $r('#btn-bv-analisar');
  if (!btn) return;
  const n = analise.resumo.erro + analise.resumo.aviso;
  btn.dataset.qtd = n ? String(n) : '';
  btn.dataset.gravidade = analise.resumo.erro ? 'erro' : n ? 'aviso' : '';
  const titulo = analise.falha || (n ? `Analisar bot: ${analise.resumo.erro} erro(s), ${analise.resumo.aviso} aviso(s)` : 'Analisar bot');
  btn.title = titulo;
  btn.setAttribute('aria-label', titulo);
}

let timer = 0;
function agendar() {
  clearTimeout(timer);
  timer = setTimeout(executar, 400);
}

// ---------------------------------------------------------------- navegar

const cssId = (v) => String(v).replace(/"/g, '\\"');

function abrirEstado(numero) {
  const wrap = $r(`#bv-estados .estado-wrap[data-estado-numero="${cssId(numero)}"]`);
  const corpo = wrap?.querySelector('.estado-body');
  if (!corpo || !corpo.classList.contains('hidden')) return;
  corpo.classList.remove('hidden');
  wrap.classList.add('estado-expandido');
  wrap.querySelector('.estado-chevron')?.classList.add('rotate-180');
}

/** O elemento mais específico do achado: a ação, senão a transição, senão o nome do estado. */
function elementoDoAchado(a) {
  if (a.acaoId) {
    const el = $r(`#bv-estados [data-action-id="${cssId(a.acaoId)}"]`);
    const cartao = el?.closest('.acao-item');
    if (cartao) return cartao;
  }
  if (a.transicaoId) {
    const linha = $r(`#bv-estados .estado-row[data-transition-id="${cssId(a.transicaoId)}"]`);
    if (linha) return linha;
  }
  if (a.estadoNumero !== null) return $r(`#bv-estados .estado-alias[data-state="${cssId(a.estadoNumero)}"]`);
  return null;
}

function irPara(chave) {
  const a = analise.achados.find((x) => x.chave === chave);
  if (!a) return;
  analise.atual = chave;
  if (a.estadoNumero !== null) abrirEstado(a.estadoNumero);
  const el = elementoDoAchado(a);
  if (el) {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.remove('bs-alvo');
    void el.offsetWidth; // reinicia a animação
    el.classList.add('bs-alvo');
    clearTimeout(el._anTimer);
    el._anTimer = setTimeout(() => el.classList.remove('bs-alvo'), 1600);
  }
  desenhar();
  painel()?.querySelector('.an-item-atual')?.scrollIntoView({ block: 'nearest' });
}

// ---------------------------------------------------------------- painel

function itemHtml(a) {
  const aberto = a.chave === analise.atual;
  const onde = a.estadoNumero === null ? 'Configuração do bot' : `Estado ${escapeHtml(a.estadoNumero)}${a.estadoAlias ? ` · ${escapeHtml(a.estadoAlias)}` : ''}`;
  const possivel = a.confianca === 'possivel' && a.severidade !== 'info' ? '<span class="an-tag" title="Depende de dados que a análise não vê (calendário, fila, variáveis...).">possível</span>' : '';
  const corpo = aberto
    ? `<div class="an-detalhe"><p>${escapeHtml(a.detalhe)}</p>${a.sugestao ? `<p class="an-sugestao"><b>Como resolver:</b> ${escapeHtml(a.sugestao)}</p>` : ''}</div>`
    : '';
  return `<li class="an-item${aberto ? ' an-item-atual' : ''}" data-sev="${a.severidade}">
    <button type="button" class="an-item-ir" data-an-ir="${escapeHtml(a.chave)}" aria-expanded="${aberto}">
      <span class="an-item-topo"><span class="an-regra" title="${escapeHtml(REGRAS[a.regra] || a.regra)}">${escapeHtml(a.regra)}</span><span class="an-item-onde">${onde}</span>${possivel}</span>
      <span class="an-item-titulo">${escapeHtml(a.titulo)}</span>
    </button>${corpo}</li>`;
}

function desenhar() {
  const p = painel();
  if (!p) return;
  const { resumo } = analise;
  if (analise.filtro && !resumo[analise.filtro]) analise.filtro = null; // o último achado do filtro foi corrigido

  p.querySelectorAll('.an-chip').forEach((b) => {
    const s = b.dataset.sev;
    b.querySelector('.an-chip-qtd').textContent = String(resumo[s]);
    b.setAttribute('aria-pressed', String(analise.filtro === s));
    b.disabled = !resumo[s];
  });

  const lista = p.querySelector('.bs-lista');
  if (analise.falha) {
    lista.innerHTML = `<p class="bs-vazio">${escapeHtml(analise.falha)}</p>`;
    return;
  }
  if (!state.botCarregado) {
    lista.innerHTML = '<p class="bs-vazio">Abra um bot para analisar.</p>';
    return;
  }
  if (!resumo.total) {
    lista.innerHTML = '<div class="an-tudo-certo"><i data-lucide="circle-check"></i><p>Nenhum ponto solto encontrado.</p><span>A análise não substitui o "Testar bot": ela não vê o que depende de calendário, fila ou dados do cliente.</span></div>';
    criarIcones();
    return;
  }

  let html = '';
  SEVERIDADES.forEach((s) => {
    if (analise.filtro && analise.filtro !== s.id) return;
    const itens = analise.achados.filter((a) => a.severidade === s.id);
    if (!itens.length) return;
    const recolhido = s.id === 'info' && !analise.infoAberto && !analise.filtro;
    html += `<section class="an-bloco" data-sev="${s.id}">
      <h4 class="an-bloco-titulo" title="${escapeHtml(s.dica)}"><i data-lucide="${s.icone}"></i>${s.rotulo}<span class="an-bloco-qtd">${itens.length}</span>
        ${s.id === 'info' && !analise.filtro ? `<button type="button" class="an-recolher" data-an-info aria-expanded="${!recolhido}">${recolhido ? 'Mostrar' : 'Ocultar'}</button>` : ''}</h4>
      ${recolhido ? '' : `<ol>${itens.map(itemHtml).join('')}</ol>`}</section>`;
  });
  lista.innerHTML = html;
  criarIcones();
}

function montarPainel() {
  const overlay = $r('#bot-view-overlay');
  if (!overlay || painel()) return;
  overlay.insertAdjacentHTML('beforeend', `
    <aside id="an-painel" class="bs-painel an-painel hidden" aria-label="Analisar bot">
      <header class="bs-topo">
        <i data-lucide="shield-alert"></i><h3>Analisar bot</h3>
        <button type="button" class="bs-fechar" data-an="fechar" title="Fechar (Esc)"><i data-lucide="x"></i></button>
      </header>
      <div class="an-chips" role="group" aria-label="Filtrar por gravidade">
        ${SEVERIDADES.map((s) => `<button type="button" class="an-chip" data-sev="${s.id}" aria-pressed="false" title="${escapeHtml(s.dica)} Clique para ver só estes."><i data-lucide="${s.icone}"></i>${s.rotulo}<span class="an-chip-qtd">0</span></button>`).join('')}
      </div>
      <div class="bs-lista"></div>
      <p class="bs-dica">Clique num ponto para ir até ele. A lista se atualiza enquanto você edita.</p>
    </aside>`);
  const p = painel();
  p.addEventListener('click', (e) => {
    const alvo = e.target.closest('button');
    if (!alvo) return;
    if (alvo.dataset.an === 'fechar') return fecharAnalise();
    if (alvo.classList.contains('an-chip')) {
      analise.filtro = analise.filtro === alvo.dataset.sev ? null : alvo.dataset.sev;
      return desenhar();
    }
    if (alvo.dataset.anInfo !== undefined) {
      analise.infoAberto = !analise.infoAberto;
      return desenhar();
    }
    if (alvo.dataset.anIr !== undefined) {
      // Segundo clique no mesmo achado só recolhe o detalhe.
      if (analise.atual === alvo.dataset.anIr) { analise.atual = null; return desenhar(); }
      irPara(alvo.dataset.anIr);
    }
  });
  // Esc fecha só o painel (pilha de Esc, dom-root.js).
  empilharEsc(() => {
    if (!analise.aberta || !visivel()) return false;
    const teste = $r('#tb-overlay');
    if (teste && !teste.classList.contains('hidden') && !teste.classList.contains('minimizado')) return false; // o modal de teste, aberto por cima, trata o Esc
    fecharAnalise();
  });
  criarIcones();
}

export function abrirAnalise() {
  montarPainel();
  const p = painel();
  if (!p) return;
  document.dispatchEvent(new CustomEvent(EVENTO_PAINEL, { detail: 'analise' })); // fecha o Localizar (mesmo encaixe)
  analise.aberta = true;
  p.classList.remove('hidden');
  $r('#bot-view-overlay')?.classList.add('analise-aberta');
  $r('#btn-bv-analisar')?.setAttribute('aria-pressed', 'true');
  executar();
}

export function fecharAnalise() {
  analise.aberta = false;
  painel()?.classList.add('hidden');
  $r('#bot-view-overlay')?.classList.remove('analise-aberta');
  $r('#btn-bv-analisar')?.setAttribute('aria-pressed', 'false');
}

function visivel() {
  const overlay = $r('#bot-view-overlay');
  return !!overlay && !overlay.classList.contains('hidden');
}

/** Ligado uma vez (initBotViewWiring): botão no cabeçalho e atualização ao vivo. */
export function initAnalise() {
  const header = $r('#bot-view-overlay .bv-header');
  const ancora = header?.querySelector('#btn-bv-buscar') || header?.querySelector('#btn-fechar-bot-view');
  if (ancora && !$r('#btn-bv-analisar')) {
    ancora.insertAdjacentHTML('beforebegin', '<button id="btn-bv-analisar" type="button" class="bv-btn-busca bv-btn-analisar" title="Analisar bot" aria-label="Analisar bot" aria-pressed="false"><i data-lucide="shield-alert"></i></button>');
    $r('#btn-bv-analisar').addEventListener('click', () => (analise.aberta ? fecharAnalise() : abrirAnalise()));
  }

  // O Localizar ocupa o mesmo lado: abrir um fecha o outro.
  document.addEventListener(EVENTO_PAINEL, (e) => { if (e.detail !== 'analise' && analise.aberta) fecharAnalise(); });

  // Ao vivo: qualquer edição no editor (estados e também timeout/destino do cabeçalho) e todo re-render do #bv-estados.
  const overlay = $r('#bot-view-overlay');
  const foraDosPaineis = (e) => !e.target.closest?.('#an-painel, #bs-painel, #tb-overlay');
  if (overlay) {
    overlay.addEventListener('input', (e) => { if (foraDosPaineis(e)) agendar(); });
    overlay.addEventListener('change', (e) => { if (foraDosPaineis(e)) agendar(); });
  }
  const estados = $r('#bv-estados');
  if (estados) new MutationObserver(agendar).observe(estados, { childList: true, subtree: true });
  // Editor fechado = painel fechado (não reabre sozinho no próximo bot).
  if (overlay) {
    new MutationObserver(() => { if (!visivel() && analise.aberta) fecharAnalise(); })
      .observe(overlay, { attributes: true, attributeFilter: ['class'] });
  }
  atualizarContador();
}
