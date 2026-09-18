import { state } from './state.js';
import { $ } from './utils.js';
import { abrirBotView } from './bot-view-render.js';

export function carregarArquivo(file) {
  if (!file.name.endsWith('.json')) {
    alert('Selecione um arquivo .json');
    return;
  }
  state.nomeArquivoOriginal = file.name;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      state.botCarregado = JSON.parse(e.target.result);
    } catch (err) {
      alert('Esse arquivo não é um JSON válido: ' + err.message);
      return;
    }
    mostrarResumoBot();
  };
  reader.readAsText(file);
}

// Cria um bot em branco, sem precisar importar nenhum JSON — agora que
// quase tudo é editável (estados/transições/condições/ações, cabeçalho do
// bot), dá pra montar um bot inteiro só com os botões "+ Adicionar" já
// existentes, partindo de um objeto vazio. ID e Nome ficam propositalmente
// em branco (não um placeholder tipo "1"/"Novo Bot") pra forçar o usuário a
// definir o ID de verdade antes de exportar, evitando colisão com outro bot
// no ambiente de destino.
export function criarBotVazio() {
  state.nomeArquivoOriginal = 'novo_bot.json';
  state.botCarregado = {
    ID: '', '0': '',
    NAME: '', '1': '',
    CONF_DELIVERY_TIME: '', '2': '',
    CONF_DELIVERY_QUEUE: '', '3': '',
    TIME_ANSWER: '', '4': '',
    TIMEOUT_DELAY: '', '5': '',
    TIMEOUT_ACTION: '', '6': '',
    TIMEOUT_DESTINY: '', '7': '',
    TIMEOUT_MESSAGE: '', '8': '',
    BOT_STATES: [], BOT_TRANSITIONS: [], BOT_CONDITIONS: [], BOT_ACTIONS: [],
  };
  mostrarResumoBot();
  abrirBotView(state.botCarregado);
}

export function mostrarResumoBot() {
  $('#upload-section').classList.add('hidden');
  $('#result-section').classList.add('hidden');
  $('#bot-summary').classList.remove('hidden');
  $('#bot-name').textContent = state.botCarregado.NAME || '(sem nome)';
  const nEstados = (state.botCarregado.BOT_STATES || []).length;
  const nAcoes = (state.botCarregado.BOT_ACTIONS || []).length;
  $('#bot-meta').textContent = `ID ${state.botCarregado.ID || '—'} · ${nEstados} estados · ${nAcoes} ações · ${state.nomeArquivoOriginal}`;
}

export function initUploadWiring() {
  const dropZone = $('#drop-zone');
  const fileInput = $('#file-input');

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('border-primary'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-primary'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-primary');
    if (e.dataTransfer.files.length) carregarArquivo(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) carregarArquivo(e.target.files[0]);
  });

  $('#btn-criar-bot-vazio').addEventListener('click', criarBotVazio);

  $('#btn-troca-arquivo').addEventListener('click', () => {
    state.botCarregado = null;
    fileInput.value = '';
    $('#bot-summary').classList.add('hidden');
    $('#result-section').classList.add('hidden');
    $('#upload-section').classList.remove('hidden');
  });
}
