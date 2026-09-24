// ---------------------------------------------------------------------------
// Estado da aplicação, centralizado num objeto mutável em vez de `let`s
// soltos pelo módulo (era assim no monólito original) — outros módulos
// importam `{ state }` e mutam as propriedades diretamente, mesmo estilo
// mutável de antes, só que num lugar só, sem poluir `window`.
// ---------------------------------------------------------------------------
export const state = {
  botCarregado: null,
  botTransformado: null,
  nomeArquivoOriginal: '',
  transformacaoSelecionada: null,
  termoBusca: '',
  ambienteOrpen: null, // Variáveis do Main World extraídas (queues, agents, etc.)

  // Exportar fluxograma (SPEC-exportar-fluxograma.md). baselineSalvo é o
  // payload de updateBot (serializado) do bot como está salvo na plataforma:
  // se o payload atual for diferente, há alteração não salva.
  baselineSalvo: null,
  fluxogramaGerando: false,

  // Menu Builder (ACTION_TYPE 10) — ver js/menu-builder.js
  MENU_MODELS: {},
  menuBuilderSeq: 0,
  MENU_PENDENTES_TRUNCAMENTO: {}, // uid -> { novoKind, itensCabem, itensRemovidos } enquanto o painel está aberto

  // Toast (notificação transitória) — ver mostrarToast em js/utils.js
  mbToastSeq: 0,
};
