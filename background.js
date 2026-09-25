// ---------------------------------------------------------------------------
// Service worker da extensão. Só existe pra atualização (DOCUMENTACAO §9):
// a extensão é instalada "sem compactação" e o Atualizar.bat troca os
// arquivos da pasta, mas o Chrome continua rodando a versão carregada até a
// extensão ser recarregada. O content script pergunta aqui, a cada carga da
// página da Orpen, se a versão no disco é mais nova que a carregada; se for,
// este worker recarrega a extensão (só ele pode chamar runtime.reload).
// ---------------------------------------------------------------------------

function comparar(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
  if (msg?.tipo !== 'editorbot:verificar-disco') return false;
  const carregada = chrome.runtime.getManifest().version;
  fetch(chrome.runtime.getURL('manifest.json'), { cache: 'no-store' })
    .then((r) => r.json())
    .then((m) => {
      const noDisco = m.version;
      const atualizar = comparar(noDisco, carregada) > 0;
      responder({ carregada, noDisco, atualizar });
      if (atualizar) setTimeout(() => chrome.runtime.reload(), 200);
    })
    .catch(() => responder({ carregada, noDisco: null, atualizar: false }));
  return true; // resposta assíncrona
});
