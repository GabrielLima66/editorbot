// ---------------------------------------------------------------------------
// Resumo da regra na barra de cada transição: "se MENSAGEM Igual a 1 → 9 -
// Segunda via". Com a transição na tela, dá para ler o estado de cima a baixo
// sem percorrer os campos. Só exibição: nada é gravado.
//
// O texto é montado a partir dos próprios campos da transição (o que a tela
// mostra), e não do JSON: assim usa os mesmos nomes de variável, operador e
// estado dos campos e acompanha qualquer edição sem duplicar a lógica de
// renderCondicao/renderAcao.
// ---------------------------------------------------------------------------

import { getRootNode } from './dom-root.js';

const MAX_VALOR = 40;

function encurtar(texto, max) {
  const t = String(texto ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Texto da regra a partir do que os campos mostram.
 * condicoes: [{ variavel, operador, valor }] (valor '' quando o campo está oculto)
 * acoes: [{ tipo, destino }] (destino só em Troca Estado)
 */
export function textoRegra(condicoes, acoes) {
  let se;
  if (!condicoes.length) {
    se = 'sempre (sem condição)';
  } else {
    const c = condicoes[0];
    const partes = [c.variavel || '(sem variável)', c.operador, encurtar(c.valor, MAX_VALOR)].filter(Boolean);
    se = `se ${partes.join(' ')}`;
    if (condicoes.length > 1) se += ` e +${condicoes.length - 1}`;
  }
  const troca = acoes.find((a) => a.destino !== undefined);
  let entao;
  if (troca) entao = `→ ${troca.destino || '(sem destino)'}`;
  else if (acoes.length) entao = `· ${[...new Set(acoes.map((a) => a.tipo).filter(Boolean))].join(', ')}`;
  else entao = '· nenhuma ação';
  return `${se} ${entao}`;
}

function lerLinha(linha) {
  const condicoes = [...linha.querySelectorAll('.condicao-item')].map((item) => {
    const valor = item.querySelector('textarea[data-action="mudar-condicao-valor"]');
    return {
      variavel: item.querySelector('.condicao-variavel')?.value ?? '',
      operador: item.querySelector('.condicao-operador')?.value ?? '',
      valor: valor && !valor.classList.contains('hidden') ? valor.value : '',
    };
  });
  const acoes = [...linha.querySelectorAll('.acao-item')].map((item) => {
    const destino = item.querySelector('[data-action="mudar-destino-estado"]');
    return { tipo: item.querySelector('.acao-tipo')?.value ?? '', ...(destino ? { destino: destino.value } : {}) };
  });
  return textoRegra(condicoes, acoes);
}

/** Atualiza o resumo de uma transição. Só escreve quando muda. */
export function atualizarRegra(linha) {
  const alvo = linha?.isConnected && linha.querySelector(':scope > .transicao-barra .transicao-regra');
  if (!alvo) return;
  const texto = lerLinha(linha);
  if (alvo.textContent !== texto) {
    alvo.textContent = texto;
    alvo.title = texto;
  }
}

// Transições tocadas por um lote de mutações: a linha onde algo mudou e as
// linhas que entraram na tela (abrir o bot, rerenderTransicao, rerenderEstado).
function linhasDasMutacoes(registros) {
  const linhas = new Set();
  for (const r of registros) {
    const dentro = r.target.closest?.('.estado-row');
    if (dentro) linhas.add(dentro);
    for (const no of r.addedNodes) {
      if (no.nodeType !== 1) continue;
      if (no.matches('.estado-row')) linhas.add(no);
      else no.querySelectorAll('.estado-row').forEach((l) => linhas.add(l));
    }
  }
  return linhas;
}

/** Ligado uma vez (initBotViewWiring): toda edição e todo re-render do #bv-estados. */
export function initRegrasTransicao() {
  const estados = getRootNode()?.querySelector('#bv-estados');
  if (!estados) return;
  // Edição de campo: só a transição editada, depois dos outros ouvintes de
  // change (que gravam o valor e às vezes recriam a linha; aí o observer cuida).
  estados.addEventListener('change', (e) => {
    const linha = e.target.closest?.('.estado-row');
    if (linha) setTimeout(() => atualizarRegra(linha), 0);
  });
  // O observer roda antes da pintura: a linha recriada já aparece com o
  // resumo. A escrita do próprio resumo também dispara, mas a segunda passada
  // não muda nada.
  new MutationObserver((registros) => linhasDasMutacoes(registros).forEach(atualizarRegra))
    .observe(estados, { childList: true, subtree: true });
}
