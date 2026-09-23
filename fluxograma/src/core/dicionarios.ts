// Port de Fluxo BOT backend/core/dicionarios.py - so o que o pipeline do
// fluxograma usa (ver ORIGEM.md).
import { pyStr } from "./pythonCompat";

export const CONDITION_TYPES: Record<string, string> = {
  "0": "Sempre verdadeiro",
  "1": "Igual a",
  "2": "Contém",
  "3": "Diferente de",
  "4": "Não contém",
  "5": "É CPF",
  "6": "Maior que",
  "7": "Maior ou igual a",
  "8": "Menor que",
  "9": "Menor ou igual a",
  "10": "Contato é VIP",
  "11": "Mensagem é número",
  "12": "É e-mail",
  "13": "É CNPJ",
  "14": "É CPF ou CNPJ",
  "15": "É data (d/m/Y)",
  "16": "É menção de story",
  "17": "É story",
  "18": "Contato possui label do CRM",
  "19": "Contato tem CPF cadastrado",
  "20": "Contato tem CNPJ cadastrado",
  "21": "Contato NÃO é VIP",
  "22": "Mensagem é arquivo",
  "23": "Mensagem é áudio",
  "24": "Forma de contato existente (código morto na plataforma)",
};

export const CALENDARIO_ROTULOS: Record<string, string> = {
  calendario: "Dentro do horário",
  calendario_falso: "Fora do horário",
};

/** dict.get com chave possivelmente nao-string: no Python, um
 * CONDITION_TYPE numerico (5) nao casa com a chave "5". */
export function rotuloConditionType(tipo: unknown): string {
  if (typeof tipo === "string" && Object.hasOwn(CONDITION_TYPES, tipo)) return CONDITION_TYPES[tipo];
  return `Condição desconhecida (tipo ${pyStr(tipo)})`;
}

export function rotuloCalendario(variavel: string, conditionType: unknown): string {
  return `${CALENDARIO_ROTULOS[variavel]} (calendário ${pyStr(conditionType)})`;
}
