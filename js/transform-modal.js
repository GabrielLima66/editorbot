import { state } from './state.js';
import { $ } from './utils.js';
import { criarIcones } from './dom-root.js';
import { TRANSFORMACOES } from './transformations.js';
import { listarPendencias, abrirPendenciasModal } from './bot-view-interactions.js';

function renderLista() {
  const lista = $('#options-list');
  const filtradas = TRANSFORMACOES.filter(t =>
    t.titulo.toLowerCase().includes(state.termoBusca) || t.descricaoCurta.toLowerCase().includes(state.termoBusca)
  );

  if (filtradas.length === 0) {
    lista.innerHTML = `
      <li class="h-full flex items-center justify-center text-sm text-[#8b899b] px-6 text-center">
        ${state.termoBusca ? `Nenhum resultado pra "${state.termoBusca}".` : 'Nenhuma transformação disponível ainda.'}
      </li>`;
    return;
  }

  lista.innerHTML = filtradas.map(t => `
    <li>
      <button role="option" data-id="${t.id}" data-selected="${state.transformacaoSelecionada === t.id}"
        class="opt-item w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/60 transition-colors">
        <div class="w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center shrink-0">
          <i data-lucide="${t.icone}" class="w-4 h-4 text-primary"></i>
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium truncate">${t.titulo}</p>
          <p class="text-xs text-[#8b899b] truncate">${t.descricaoCurta}</p>
        </div>
        ${state.transformacaoSelecionada === t.id ? '<i data-lucide="check" class="w-4 h-4 text-primary shrink-0"></i>' : ''}
      </button>
    </li>
  `).join('');

  criarIcones();

  lista.querySelectorAll('.opt-item').forEach(btn => {
    btn.addEventListener('click', () => {
      state.transformacaoSelecionada = btn.dataset.id;
      renderLista();
      atualizaDetalheSelecionado();
      $('#btn-aplicar').disabled = false;
    });
  });
}

function atualizaDetalheSelecionado() {
  const t = TRANSFORMACOES.find(t => t.id === state.transformacaoSelecionada);
  $('#selected-detail').textContent = t ? t.descricaoLonga : '';
}

function fecharModal() { $('#modal-overlay').classList.add('hidden'); }

export function baixarBotJson() {
  if (!state.botCarregado) return;
  const blob = new Blob([JSON.stringify(state.botCarregado, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (state.nomeArquivoOriginal || 'bot').replace(/\.json$/i, '') + '_editado.json';
  a.click();
  URL.revokeObjectURL(url);
}

export function initTransformModalWiring() {
  const overlay = $('#modal-overlay');

  $('#btn-abrir-modal').addEventListener('click', () => {
    state.transformacaoSelecionada = null;
    state.termoBusca = '';
    $('#search-input').value = '';
    $('#btn-aplicar').disabled = true;
    renderLista();
    overlay.classList.remove('hidden');
  });

  $('#btn-fechar-modal').addEventListener('click', fecharModal);
  $('#btn-cancelar').addEventListener('click', fecharModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) fecharModal(); });

  $('#search-input').addEventListener('input', (e) => {
    state.termoBusca = e.target.value.toLowerCase();
    renderLista();
  });

  $('#btn-aplicar').addEventListener('click', () => {
    if (!state.transformacaoSelecionada || !state.botCarregado) return;
    const t = TRANSFORMACOES.find(t => t.id === state.transformacaoSelecionada);

    $('#btn-aplicar-spinner').classList.remove('hidden');
    $('#btn-aplicar-label').textContent = 'Aplicando…';
    $('#btn-aplicar').disabled = true;

    setTimeout(() => { // pequeno delay só pra dar feedback visual do spinner
      const { data, log } = t.fn(state.botCarregado);
      state.botTransformado = data;

      $('#result-log').innerHTML = log.map(l => `<p>• ${l}</p>`).join('');
      $('#result-section').classList.remove('hidden');

      $('#btn-aplicar-spinner').classList.add('hidden');
      $('#btn-aplicar-label').textContent = 'Aplicar transformação';
      $('#btn-aplicar').disabled = false;
      fecharModal();
    }, 300);
  });

  $('#btn-bv-baixar').addEventListener('click', () => {
    if (!state.botCarregado) return;
    const pendencias = listarPendencias(state.botCarregado);
    baixarBotJson();
    if (pendencias.length) abrirPendenciasModal(pendencias);
  });

  $('#btn-download').addEventListener('click', () => {
    if (!state.botTransformado) return;
    const blob = new Blob([JSON.stringify(state.botTransformado, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = state.nomeArquivoOriginal.replace(/\.json$/i, '') + '_convertido.json';
    a.click();
    URL.revokeObjectURL(url);
  });
}
