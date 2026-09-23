// JSON do bot -> grafo React Flow do fluxograma, no Modo Cliente: mesma
// sequencia que Fluxo BOT backend/ui/janela.py:_atualizar executa.
import { construirGrafo } from "./grafo";
import { filtrarGrafoModoCliente } from "./filtro";
import { grafoParaReactflow, type GrafoReactFlow } from "./grafoParaReactflow";
import { aplicarNomesAmbiente, type NomesAmbiente } from "./nomesAmbiente";
import { montarBot } from "./parser";
import { pyStr } from "./pythonCompat";

export interface ResultadoPipeline extends GrafoReactFlow {
  botNome: string;
}

/** Lanca ParserError (mensagem em portugues) se o bot tiver erro estrutural
 * - nunca devolve grafo parcial. */
export function gerarGrafoReactFlow(dadosBot: unknown, nomes?: NomesAmbiente | null): ResultadoPipeline {
  const bot = montarBot(dadosBot);
  const grafo = filtrarGrafoModoCliente(bot, construirGrafo(bot));
  const dados = grafoParaReactflow(bot, grafo);
  if (nomes) aplicarNomesAmbiente(dados, nomes);
  return { ...dados, botNome: pyStr(bot.name) };
}
