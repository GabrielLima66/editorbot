// ---------------------------------------------------------------------------
// Área de cópia entre bots: guarda o último trecho copiado (trechos.js) no
// chrome.storage.local da EXTENSÃO. Vale para todos os domínios de cliente
// (o localStorage é um por domínio) e o onChanged avisa as outras abas abertas.
// Um único item: copiar de novo troca o anterior.
//
// Toda chamada ao chrome.* fica em try/catch: quando a extensão é atualizada
// as abas já abertas ficam com o contexto invalidado e qualquer chamada lança.
// Nesse caso `salvarTrecho` devolve false e quem chamou avisa o usuário.
// ---------------------------------------------------------------------------
import { trechoValido } from './trechos.js';

const CHAVE = 'editorbot_area_copia';

const api = () => (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local ? chrome.storage.local : null);

export async function salvarTrecho(trecho) {
  try {
    const s = api();
    if (!s) return false;
    await s.set({ [CHAVE]: trecho });
    return true;
  } catch {
    return false;
  }
}

export async function lerTrecho() {
  try {
    const s = api();
    if (!s) return null;
    const v = (await s.get(CHAVE))[CHAVE];
    return trechoValido(v) ? v : null;
  } catch {
    return null;
  }
}

export async function limparTrecho() {
  try {
    const s = api();
    if (!s) return false;
    await s.remove(CHAVE);
    return true;
  } catch {
    return false;
  }
}

/** Chama `aoMudar(trecho|null)` quando outra aba copia ou limpa. */
export function observarTrecho(aoMudar) {
  try {
    chrome.storage.onChanged.addListener((mudancas, area) => {
      if (area !== 'local' || !mudancas[CHAVE]) return;
      const v = mudancas[CHAVE].newValue;
      aoMudar(trechoValido(v) ? v : null);
    });
  } catch {
    /* contexto invalidado: segue sem aviso entre abas */
  }
}
