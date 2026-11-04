// ---------------------------------------------------------------------------
// Ctrl+S (Cmd+S no Mac) salva o bot, pelo mesmo caminho do botão "Salvar"
// (orpen-bridge.js, só na extensão). Os outros atalhos do editor ficam com
// quem os usa: Ctrl+F e F3 no Localizar (busca.js), Esc na pilha de
// dom-root.js.
//
// Aqui só a parte que não depende da tela: qual tecla conta, se há uma janela
// aberta por cima do editor e como achar de novo o campo em que a pessoa
// digitava (confirmar o texto redesenha a transição e troca o elemento).
// ---------------------------------------------------------------------------

/** Ctrl+S ou Cmd+S, sem Shift nem Alt (Ctrl+Shift+S fica para o navegador). */
export function ehAtalhoSalvar(e) {
  return !!e && (!!e.ctrlKey || !!e.metaKey) && !e.altKey && !e.shiftKey && String(e.key ?? '').toLowerCase() === 's';
}

/**
 * Há uma janela aberta por cima do editor? Menu, tratamento, copiar/colar,
 * teste (o mini-chat minimizado não conta), Novidades, pendências e as
 * confirmações. Com ela aberta o Ctrl+S não salva: o que se edita ali ainda
 * não foi aplicado ao bot.
 */
export function janelaPorCima(raiz) {
  if (!raiz) return false;
  const pendencias = raiz.querySelector('#pendencias-overlay');
  if (pendencias && !pendencias.classList.contains('hidden')) return true;
  return [...raiz.querySelectorAll('[aria-modal="true"]')]
    .some((el) => el.getClientRects().length > 0 && !el.closest('.minimizado'));
}

// Atributos que identificam um campo do editor (o mesmo que os handlers de
// bot-view-interactions.js leem para saber o que gravar).
const IDENTIDADE = ['action', 'campoBot', 'transitionId', 'conditionId', 'actionId', 'state', 'campo'];
const kebab = (k) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const valorDeAtributo = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/**
 * Seletor que acha o mesmo campo depois de um redesenho: o id, senão a tag e
 * os data-* de IDENTIDADE. Null quando não há como identificá-lo.
 */
export function localizadorDoCampo(campo) {
  if (!campo?.tagName) return null;
  if (campo.id) return `#${campo.id.replace(/[^\w-]/g, (c) => `\\${c}`)}`;
  const dados = campo.dataset || {};
  const usados = IDENTIDADE.filter((k) => dados[k] !== undefined && dados[k] !== '');
  if (!usados.length) return null;
  return campo.tagName.toLowerCase() + usados.map((k) => `[data-${kebab(k)}="${valorDeAtributo(dados[k])}"]`).join('');
}

/**
 * Campos que recebem o cursor de volta. Os de busca com lista ficam de fora:
 * ao ganhar foco eles selecionam o texto todo e abrem as sugestões, e a
 * próxima tecla apagaria o valor.
 */
export function campoVoltaAoFoco(campo) {
  if (!campo?.tagName) return false;
  if (campo.tagName === 'TEXTAREA') return true;
  if (campo.tagName !== 'INPUT') return false;
  if (campo.hasAttribute?.('list') || campo.dataset?.lista) return false;
  return ['text', 'number', ''].includes(String(campo.getAttribute?.('type') ?? '').toLowerCase());
}
