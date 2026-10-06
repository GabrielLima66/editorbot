// ---------------------------------------------------------------------------
// Copiar partes de um bot e colar em outro. Esta é a camada de tela; a lógica
// está em trechos.js (copiar, colar, validar) e o armazenamento em
// area-copia.js (chrome.storage.local).
//
// Estados: um único botão "Copiar / colar" na barra "Transições" abre o modal
//   - aba Copiar: lista com caixas de marcar e busca, resumo do que será copiado;
//   - aba Colar: lista "depois de qual estado" e o ensaio do que mudaria.
// Transições soltas: ícone de copiar na barra de cada transição e "Colar
//   transições" dentro do estado (ficam fora do modal).
// Colar só altera o bot em memória; nada vai para a Orpen até Salvar.
// ---------------------------------------------------------------------------
import { state } from './state.js';
import { $, escapeHtml, mostrarToast } from './utils.js';
import { criarIcones, empilharEsc, marcarCamposSemAutopreenchimento } from './dom-root.js';
import { ACTION_TYPE_LABELS, CAMPOS_PENDENCIA_POR_TIPO, CAMPOS_ESTADO_POR_TIPO } from './dictionaries.js';
import { extrairTrecho, colarTrecho, simularColagem } from './trechos.js';
import { salvarTrecho, lerTrecho, limparTrecho, observarTrecho } from './area-copia.js';
import { rerenderEstado, abrirPendenciasModal } from './bot-view-interactions.js';
import { abrirBotView, atualizarContadorRodape } from './bot-view-render.js';

let trechoAtual = null;

// estado do modal
const modal = { aberto: false, aba: 'copiar', filtro: '', marcados: new Set(), depoisDe: '', soltarEsc: null };

const ROTULO_CAMPO_ESTADO = {
  destiny: 'Estado de destino',
  callback_state: 'Estado de retorno (callback)',
  fallback_state: 'Estado de falha (fallback)',
};
const ROTULO_CAMPO_CONDICAO = {
  cadastro: 'Cadastro (fila, agente, entrada, calendário ou status)',
  labels: 'Labels',
  assistant_id: 'Assistente',
};

const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const lista = (itens) => (itens.length > 1 ? `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}` : String(itens[0] ?? ''));
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const porNumero = (a, b) => {
  const x = parseInt(a.STATE_NUMBER, 10);
  const y = parseInt(b.STATE_NUMBER, 10);
  if (Number.isNaN(x) && Number.isNaN(y)) return 0;
  if (Number.isNaN(x)) return 1;
  if (Number.isNaN(y)) return -1;
  return x - y;
};
const numerico = (n) => String(parseInt(n, 10)) === String(n);

const outroAmbiente = (t) => !!t.origem?.host && t.origem.host !== location.host;
const mesmoBot = (t) => !!t.origem?.botId && t.origem.host === location.host && String(t.origem.botId) === String(state.botCarregado?.ID);

function estadosOrdenados() {
  return [...(state.botCarregado?.BOT_STATES || [])].sort(porNumero);
}

function transicoesDoEstado(numero) {
  return (state.botCarregado?.BOT_TRANSITIONS || []).filter((t) => t.STATE === numero).length;
}

function descricao(trecho) {
  const o = trecho.origem || {};
  const de = `${o.botNome ? ` do bot "${o.botNome}"` : ''}${o.host ? ` (${o.host})` : ''}`;
  if (trecho.tipo === 'estados') {
    const numeros = trecho.linhas.estados.map((s) => s.STATE_NUMBER).sort((a, b) => a - b);
    return `${numeros.length === 1 ? 'estado' : 'estados'} ${lista(numeros)}${de}`;
  }
  return `${plural(trecho.linhas.transicoes.length, 'transição', 'transições')} do estado ${trecho.estadoOrigem}${de}`;
}

// ---- indicadores (botão da barra, aba, botões "Colar transições") ----------

function atualizarIndicadores(trecho) {
  trechoAtual = trecho;
  const overlay = $('#bot-view-overlay');
  if (overlay) {
    if (trecho?.tipo === 'transicoes') overlay.dataset.areaTipo = 'transicoes';
    else delete overlay.dataset.areaTipo;
  }
  $('#btn-copiar-colar')?.classList.toggle('tem-copia', !!trecho);
  $('#cc-aba-ponto')?.classList.toggle('hidden', !trecho);
  if (modal.aberto) desenhar();
}

// ---- modal -----------------------------------------------------------------

function abrirModal() {
  if (!state.botCarregado) return;
  modal.aba = trechoAtual?.tipo === 'estados' ? 'colar' : 'copiar';
  modal.filtro = '';
  modal.marcados = new Set();
  modal.depoisDe = '';
  modal.aberto = true;
  $('#copiar-overlay').classList.remove('hidden');
  if (!modal.soltarEsc) modal.soltarEsc = empilharEsc(fecharModal);
  desenhar();
  $('#cc-busca').focus();
}

function fecharModal() {
  modal.aberto = false;
  $('#copiar-overlay').classList.add('hidden');
  if (modal.soltarEsc) { modal.soltarEsc(); modal.soltarEsc = null; }
}

function trocarAba(aba) {
  modal.aba = aba;
  modal.filtro = '';
  $('#cc-busca').value = '';
  desenhar();
}

const passaNoFiltro = (s) => !modal.filtro || normalizar(`${s.STATE_NUMBER} ${s.ALIAS}`).includes(normalizar(modal.filtro));

function desenhar() {
  const copiando = modal.aba === 'copiar';
  const rolagem = $('#cc-lista').scrollTop;
  // A lista é refeita a cada clique: guarda qual item tinha o foco do teclado e devolve depois.
  const ativo = $('#copiar-overlay').getRootNode().activeElement;
  const chaveFoco = ativo?.dataset?.numero !== undefined ? `c:${ativo.dataset.numero}` : (ativo?.name === 'cc-depois' ? `r:${ativo.value}` : null);
  $('#copiar-overlay').querySelectorAll('.cc-aba').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.aba === modal.aba)));
  $('#cc-acoes-lista').classList.toggle('oculto', !copiando);
  $('#cc-busca').placeholder = copiando ? 'Buscar estado para copiar (número ou nome)' : 'Buscar o estado depois do qual colar';
  if (copiando) desenharCopiar();
  else desenharColar();
  $('#cc-lista').scrollTop = rolagem;
  if (chaveFoco) {
    const [tipo, valor] = [chaveFoco[0], chaveFoco.slice(2)];
    const alvo = [...$('#cc-lista').querySelectorAll(tipo === 'c' ? 'input[type="checkbox"]' : 'input[type="radio"]')].find((i) => (tipo === 'c' ? i.dataset.numero : i.value) === valor);
    alvo?.focus();
  }
  criarIcones();
}

// -- aba Copiar

function desenharCopiar() {
  const estados = estadosOrdenados();
  const visiveis = estados.filter(passaNoFiltro);
  $('#cc-lista').innerHTML = visiveis.length
    ? visiveis.map((s) => `
      <label class="cc-item${modal.marcados.has(s.STATE_NUMBER) ? ' sel' : ''}">
        <input type="checkbox" data-numero="${escapeHtml(s.STATE_NUMBER)}"${modal.marcados.has(s.STATE_NUMBER) ? ' checked' : ''}>
        <span class="cc-num">${escapeHtml(s.STATE_NUMBER)}</span>
        <span class="cc-alias" title="${escapeHtml(s.ALIAS)}">${escapeHtml(s.ALIAS || 'Sem nome')}</span>
        <span class="cc-meta">${plural(transicoesDoEstado(s.STATE_NUMBER), 'transição', 'transições')}</span>
      </label>`).join('')
    : '<p class="cc-vazio">Nenhum estado encontrado.</p>';

  const n = modal.marcados.size;
  const conf = $('#cc-confirmar');
  conf.textContent = n ? `Copiar ${plural(n, 'estado', 'estados')}` : 'Copiar';
  conf.disabled = n === 0;
  $('#cc-info').textContent = n ? `${plural(n, 'estado marcado', 'estados marcados')} de ${estados.length}` : `${estados.length} estados neste bot`;
  $('#cc-direita').innerHTML = resumoCopia();
}

function referenciasForaDaSelecao(bot, trecho, marcados) {
  const alvos = new Set();
  trecho.linhas.acoes.forEach((a) => {
    (CAMPOS_ESTADO_POR_TIPO[a.ACTION_TYPE] || []).forEach((campo) => {
      const v = a.ACTION_DATA?.[campo];
      if (v !== undefined && v !== '' && !marcados.has(String(v)) && /^\d+$/.test(String(v))) alvos.add(String(v));
    });
  });
  return [...alvos].sort((a, b) => a - b).map((numero) => {
    const e = (bot.BOT_STATES || []).find((s) => s.STATE_NUMBER === numero);
    return e ? `${numero} - ${e.ALIAS || 'Sem nome'}` : `${numero}`;
  });
}

function resumoCopia() {
  const bot = state.botCarregado;
  if (!modal.marcados.size) {
    return `<p class="cc-vazio-direita">Marque na lista os estados que quer levar para outro bot. Dá para marcar vários: as ligações entre eles (Troca Estado, retorno de OpenAI, áudio e automação) são mantidas na colagem.<br><br>Depois, abra o outro bot, clique em <strong>Copiar / colar</strong> e escolha depois de qual estado colar.</p>`;
  }
  const t = extrairTrecho(bot, { estados: [...modal.marcados] });
  const fora = referenciasForaDaSelecao(bot, t, modal.marcados);
  const numeros = [...modal.marcados].sort((a, b) => a - b);
  return `
    <h3>Vai ser copiado</h3>
    <div class="cc-bloco ok">
      ${plural(numeros.length, 'estado', 'estados')}: <strong>${escapeHtml(lista(numeros))}</strong><br>
      ${plural(t.linhas.transicoes.length, 'transição', 'transições')}, ${plural(t.linhas.condicoes.length, 'condição', 'condições')} e ${plural(t.linhas.acoes.length, 'ação', 'ações')}.
    </div>
    ${fora.length
      ? `<div class="cc-bloco aviso"><strong>${plural(fora.length, 'estado fora da seleção é apontado', 'estados fora da seleção são apontados')}</strong> por estes:
          <ul>${fora.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
          Em outro bot essas ligações ficam em branco para você escolher de novo. Neste mesmo bot elas continuam valendo.</div>`
      : '<div class="cc-bloco">Nenhum dos estados aponta para um estado fora da seleção.</div>'}`;
}

async function confirmarCopia() {
  const bot = state.botCarregado;
  if (!bot || !modal.marcados.size) return;
  let trecho;
  try {
    trecho = extrairTrecho(bot, { estados: [...modal.marcados] }, { host: location.host, botId: bot.ID, botNome: bot.NAME });
  } catch (e) {
    mostrarToast(e.message);
    return;
  }
  if (await salvarTrecho(trecho)) {
    atualizarIndicadores(trecho);
    fecharModal();
    mostrarToast(`${plural(trecho.linhas.estados.length, 'estado copiado', 'estados copiados')}. Abra o outro bot e use "Copiar / colar".`);
  } else {
    mostrarToast('Não foi possível guardar a cópia. Se a extensão foi atualizada, recarregue a página e tente de novo.');
  }
}

// -- aba Colar

function opcoesDeColagem() {
  const t = trechoAtual;
  return { depoisDe: modal.depoisDe === '' ? null : modal.depoisDe, mesmoBot: mesmoBot(t), esvaziarAmbiente: outroAmbiente(t) };
}

function desenharColar() {
  const conf = $('#cc-confirmar');
  conf.textContent = 'Colar';
  if (!trechoAtual) {
    $('#cc-lista').innerHTML = '';
    conf.disabled = true;
    $('#cc-info').textContent = 'Nada copiado ainda';
    $('#cc-direita').innerHTML = '<p class="cc-vazio-direita">Nada foi copiado ainda. Abra o bot de origem, clique em <strong>Copiar / colar</strong>, marque os estados na aba <strong>Copiar</strong> e volte aqui no bot de destino.</p>';
    return;
  }
  if (trechoAtual.tipo !== 'estados') {
    $('#cc-lista').innerHTML = '';
    conf.disabled = true;
    $('#cc-info').textContent = '';
    $('#cc-direita').innerHTML = `<div class="cc-bloco ok">Copiado: <strong>${escapeHtml(descricao(trechoAtual))}</strong></div><p class="cc-vazio-direita">São transições soltas, não estados. Para colar, abra o estado de destino e use <strong>Colar transições</strong> logo abaixo de "+ Transição".</p>`;
    return;
  }
  const estados = estadosOrdenados();
  const visiveis = estados.filter(passaNoFiltro);
  const noFim = `
    <label class="cc-item${modal.depoisDe === '' ? ' sel' : ''}">
      <input type="radio" name="cc-depois" value=""${modal.depoisDe === '' ? ' checked' : ''}>
      <span class="cc-alias"><strong>No fim da lista</strong> <span class="cc-meta">(nenhum estado é renumerado)</span></span>
    </label>`;
  const linhas = visiveis.map((s) => {
    const ok = numerico(s.STATE_NUMBER);
    const marcado = modal.depoisDe === s.STATE_NUMBER;
    return `
      <label class="cc-item${marcado ? ' sel' : ''}${ok ? '' : ' desativado'}"${ok ? '' : ' title="Estado com número não numérico: não dá para colar depois dele"'}>
        <input type="radio" name="cc-depois" value="${escapeHtml(s.STATE_NUMBER)}"${marcado ? ' checked' : ''}${ok ? '' : ' disabled'}>
        <span class="cc-meta">depois de</span>
        <span class="cc-num">${escapeHtml(s.STATE_NUMBER)}</span>
        <span class="cc-alias" title="${escapeHtml(s.ALIAS)}">${escapeHtml(s.ALIAS || 'Sem nome')}</span>
      </label>`;
  }).join('');
  $('#cc-lista').innerHTML = noFim + (linhas || '<p class="cc-vazio">Nenhum estado encontrado.</p>');
  $('#cc-direita').innerHTML = previaColagem(conf);
}

function previaColagem(conf) {
  const t = trechoAtual;
  const bot = state.botCarregado;
  const sim = simularColagem(bot, t, opcoesDeColagem());
  let html = `<h3>O que foi copiado <button type="button" class="cc-link" data-acao="limpar" style="margin-left:8px;text-transform:none;letter-spacing:0">Esquecer</button></h3>
    <div class="cc-bloco ok">${escapeHtml(descricao(t))}<br>${plural(t.linhas.transicoes.length, 'transição', 'transições')}, ${plural(t.linhas.condicoes.length, 'condição', 'condições')} e ${plural(t.linhas.acoes.length, 'ação', 'ações')}.</div>`;
  if (outroAmbiente(t)) {
    html += '<div class="cc-bloco aviso"><strong>Veio de outro ambiente.</strong> Fila, agente, anexo, conta OpenAI, labels e demais cadastros ficam em branco ao colar, porque os códigos deles são outros aqui. Você escolhe de novo depois.</div>';
  }
  html += '<h3>Como vai ficar</h3>';
  if (!sim.ok) {
    conf.disabled = true;
    $('#cc-info').textContent = 'A colagem não pode ser feita assim';
    return html + `<div class="cc-bloco erro"><strong>Não dá para colar neste ponto:</strong><ul>${sim.erros.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>`;
  }
  conf.disabled = false;
  const novos = sim.resultado.estadosNovos;
  $('#cc-info').textContent = modal.depoisDe === '' ? 'Os estados entram no fim' : `Os estados entram depois do ${modal.depoisDe}`;
  html += `<div class="cc-bloco ok">Entram como ${novos.length === 1 ? 'estado' : 'estados'} <strong>${escapeHtml(lista(novos))}</strong>. O estado 0, onde toda conversa nova começa, não muda.</div>`;
  const mudados = sim.mudancas?.mudados || [];
  if (mudados.length) {
    const mostra = mudados.slice(0, 10).map((m) => `<li>${escapeHtml(m.de)} → ${escapeHtml(m.para)}${m.alias ? ` (${escapeHtml(m.alias)})` : ''}</li>`).join('');
    html += `<div class="cc-bloco aviso"><strong>${plural(mudados.length, 'estado existente muda', 'estados existentes mudam')} de número</strong>, e as ligações dentro do bot (Troca Estado, timeout etc.) acompanham:
      <ul>${mostra}${mudados.length > 10 ? `<li>e mais ${mudados.length - 10}</li>` : ''}</ul>
      Ao salvar, o editor mostra o aviso de renumeração. Atendimentos em andamento parados nesses estados passam a seguir outro, e o failover de entradas e a inatividade (configurações do ContactCenter) guardam o número do estado e <strong>não são atualizados</strong>. Se isso for um problema, escolha "No fim da lista".</div>`;
  } else {
    html += '<div class="cc-bloco">Nenhum estado existente muda de número.</div>';
  }
  const soltas = sim.resultado.soltas.length;
  const amb = sim.resultado.ambiente.length;
  if (soltas || amb) {
    html += `<div class="cc-bloco aviso">Depois de colar, ${[
      soltas ? `${plural(soltas, 'ligação com estado que não foi copiado fica', 'ligações com estados que não foram copiados ficam')} em branco` : '',
      amb ? `${plural(amb, 'campo de cadastro fica', 'campos de cadastro ficam')} em branco` : '',
    ].filter(Boolean).join(' e ')}. Uma lista mostra onde.</div>`;
  }
  return html;
}

// Estado novo na tela: abre, rola até o topo e dá o destaque do "ir para o estado".
function mostrarEstadoNovo(numero) {
  const wrap = $(`#bv-estados .estado-wrap[data-estado-numero="${numero}"]`);
  if (!wrap) return;
  wrap.querySelector('.estado-body').classList.remove('hidden');
  wrap.classList.add('estado-expandido');
  wrap.querySelector('.estado-chevron').classList.add('rotate-180');
  wrap.classList.add('estado-destaque');
  setTimeout(() => wrap.classList.remove('estado-destaque'), 1500);
  wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function confirmarColagem() {
  const bot = state.botCarregado;
  if (!bot || !trechoAtual || trechoAtual.tipo !== 'estados') return;
  const opcoes = opcoesDeColagem();
  // Mesmo ensaio da prévia: só aplica no bot de verdade se continuar seguro.
  const sim = simularColagem(bot, trechoAtual, opcoes);
  if (!sim.ok) { desenhar(); return; }
  const r = colarTrecho(bot, trechoAtual, opcoes);
  fecharModal();
  abrirBotView(bot);
  atualizarContadorRodape(bot);
  mostrarEstadoNovo(r.estadosNovos[0]);
  const renumerou = (sim.mudancas?.mudados || []).length;
  mostrarToast(`${r.estadosNovos.length === 1 ? 'Estado colado' : `${r.estadosNovos.length} estados colados`}${renumerou ? `; ${plural(renumerou, 'estado mudou', 'estados mudaram')} de número` : ''}. Ainda não salvo.`);
  avisarPendencias(bot, r);
}

// ---- pendências do que acabou de ser colado --------------------------------

function pendenciasDaColagem(bot, r) {
  const transicao = (id) => (bot.BOT_TRANSITIONS || []).find((t) => t.ID === id);
  const posicao = (itens, transitionId, itemId) =>
    itens.filter((x) => x.TRANSITION_ID === transitionId).sort((a, b) => parseInt(a.ID, 10) - parseInt(b.ID, 10)).findIndex((x) => x.ID === itemId) + 1;
  const base = (transitionId) => {
    const t = transicao(transitionId);
    const e = (bot.BOT_STATES || []).find((s) => s.STATE_NUMBER === t?.STATE);
    return { estadoNumero: e?.STATE_NUMBER ?? '?', estadoAlias: e?.ALIAS ?? '', transicaoPrioridade: t?.PRIORITY ?? '?' };
  };
  const out = [];
  r.soltas.forEach((s) => {
    const a = (bot.BOT_ACTIONS || []).find((x) => x.ID === s.actionId);
    out.push({
      ...base(s.transitionId), tipoItem: 'Ação', posicao: posicao(bot.BOT_ACTIONS || [], s.transitionId, s.actionId),
      tipoLabel: ACTION_TYPE_LABELS[a?.ACTION_TYPE] || `Tipo ${a?.ACTION_TYPE}`,
      campoLabel: `${ROTULO_CAMPO_ESTADO[s.campo] || s.campo} (era o estado ${s.valorOriginal} no bot de origem, que não foi copiado)`,
    });
  });
  r.ambiente.forEach((m) => {
    const ehAcao = m.tipoItem === 'Ação';
    const itens = (ehAcao ? bot.BOT_ACTIONS : bot.BOT_CONDITIONS) || [];
    const item = itens.find((x) => x.ID === m.itemId);
    const rotulos = ehAcao ? Object.fromEntries(CAMPOS_PENDENCIA_POR_TIPO[item?.ACTION_TYPE] || []) : ROTULO_CAMPO_CONDICAO;
    out.push({
      ...base(m.transitionId), tipoItem: m.tipoItem, posicao: posicao(itens, m.transitionId, m.itemId),
      tipoLabel: ehAcao ? (ACTION_TYPE_LABELS[item?.ACTION_TYPE] || `Tipo ${item?.ACTION_TYPE}`) : 'Condição',
      campoLabel: rotulos[m.campo] || ROTULO_CAMPO_CONDICAO[m.campo] || m.campo,
    });
  });
  return out;
}

function avisarPendencias(bot, r) {
  const pendencias = pendenciasDaColagem(bot, r);
  if (!pendencias.length) return;
  abrirPendenciasModal(pendencias, {
    titulo: 'Para conferir depois de colar',
    dica: 'Estes campos ficaram em branco porque apontam para algo que não existe aqui: um estado do bot de origem que não foi copiado, ou um cadastro (fila, agente, anexo, conta OpenAI...) de outro ambiente. Abra cada um e escolha o valor certo deste bot. Nada foi salvo ainda.',
  });
}

// ---- transições soltas (fora do modal) -------------------------------------

async function copiarTransicao(transitionId) {
  const bot = state.botCarregado;
  if (!bot) return;
  let trecho;
  try {
    trecho = extrairTrecho(bot, { transicoes: [transitionId] }, { host: location.host, botId: bot.ID, botNome: bot.NAME });
  } catch (e) {
    mostrarToast(e.message);
    return;
  }
  if (await salvarTrecho(trecho)) {
    atualizarIndicadores(trecho);
    mostrarToast('Transição copiada. Abra outro estado (ou outro bot) e use "Colar transições".');
  } else {
    mostrarToast('Não foi possível guardar a cópia. Se a extensão foi atualizada, recarregue a página e tente de novo.');
  }
}

function colarTransicoes(estadoDestino) {
  const bot = state.botCarregado;
  if (!bot || !trechoAtual || trechoAtual.tipo !== 'transicoes') return;
  const r = colarTrecho(bot, trechoAtual, { estadoDestino, esvaziarAmbiente: outroAmbiente(trechoAtual), mesmoBot: mesmoBot(trechoAtual) });
  rerenderEstado(bot, estadoDestino);
  atualizarContadorRodape(bot);
  mostrarToast(`${plural(r.transicoesNovas.length, 'transição colada', 'transições coladas')} no fim do estado ${estadoDestino}. Ainda não salvo.`);
  avisarPendencias(bot, r);
}

// ---- ligação ---------------------------------------------------------------

export function initCopiarColar() {
  const overlay = $('#bot-view-overlay');
  const janela = $('#copiar-overlay');
  if (!overlay || !janela) {
    // Sem isso o botão fica morto sem nenhum sinal (já aconteceu: o modal não
    // era injetado pela extensão). orpen-bridge.js precisa montar #copiar-overlay.
    console.warn('[Editor de Bot] copiar/colar desligado: #bot-view-overlay ou #copiar-overlay não foram montados.');
    return;
  }

  $('#btn-copiar-colar')?.addEventListener('click', abrirModal);

  overlay.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="copiar-transicao"], [data-action="colar-transicoes"]');
    if (!btn) return;
    if (btn.dataset.action === 'copiar-transicao') copiarTransicao(btn.dataset.transitionId);
    else colarTransicoes(btn.dataset.state);
  });

  janela.addEventListener('click', (e) => {
    if (e.target === janela) { fecharModal(); return; }
    const aba = e.target.closest('.cc-aba');
    if (aba) { trocarAba(aba.dataset.aba); return; }
    if (e.target.closest('#cc-fechar, #cc-cancelar')) { fecharModal(); return; }
    if (e.target.closest('#cc-confirmar')) {
      if (modal.aba === 'copiar') confirmarCopia();
      else confirmarColagem();
      return;
    }
    const acao = e.target.closest('[data-acao]')?.dataset.acao;
    if (acao === 'sel-filtrados') {
      estadosOrdenados().filter(passaNoFiltro).forEach((s) => modal.marcados.add(s.STATE_NUMBER));
      desenhar();
    } else if (acao === 'sel-nenhum') {
      modal.marcados.clear();
      desenhar();
    } else if (acao === 'limpar') {
      limparTrecho().then(() => atualizarIndicadores(null));
    }
  });

  janela.addEventListener('change', (e) => {
    const el = e.target;
    if (el.matches('input[type="checkbox"][data-numero]')) {
      if (el.checked) modal.marcados.add(el.dataset.numero);
      else modal.marcados.delete(el.dataset.numero);
      desenhar();
    } else if (el.matches('input[type="radio"][name="cc-depois"]')) {
      modal.depoisDe = el.value;
      desenhar();
    }
  });

  const busca = $('#cc-busca');
  marcarCamposSemAutopreenchimento(busca);
  busca.addEventListener('input', () => { modal.filtro = busca.value; desenhar(); });

  lerTrecho().then(atualizarIndicadores);
  observarTrecho(atualizarIndicadores);
}
