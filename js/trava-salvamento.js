// ---------------------------------------------------------------------------
// Só um salvamento por vez. Quem chama durante um em andamento (Salvar de novo,
// "Salvar e fechar" depois do Esc, "Gerar fluxograma") recebe o mesmo
// resultado, em vez de disparar um segundo updateBot em paralelo: o servidor
// apaga e reinsere estados, transições, condições e ações a cada gravação.
// Módulo puro (sem DOM) pra ser testado em tests/editor/.
// ---------------------------------------------------------------------------

export function criarTravaDeSalvamento(executar) {
  let andamento = null;
  return {
    salvar() {
      if (andamento) return andamento;
      const atual = Promise.resolve().then(executar).finally(() => {
        if (andamento === atual) andamento = null;
      });
      andamento = atual;
      return atual;
    },
    /** A promessa do salvamento em curso, ou null. */
    emAndamento: () => andamento,
  };
}
