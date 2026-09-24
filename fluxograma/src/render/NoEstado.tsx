import { Handle, Position, type NodeProps } from "reactflow";
import type { CSSProperties } from "react";
import type { NodeData } from "./types";
import { conteudoDoNo } from "./texto";
import { APARENCIA, APARENCIA_PADRAO, TIPOS_PILULA } from "./tiposNo";

// Um componente so cobre todos os tipos de no (estado + terminais) - a
// aparencia (cor/forma/icone) muda por categoria via APARENCIA
// (tiposNo.ts), a estrutura do card e a mesma pra todo mundo dentro de
// cada uma das duas familias: pilula (condicao/calendario - icone e kicker
// centralizados, empilhados) ou bloco (todo o resto - icone e kicker lado
// a lado, alinhados a esquerda).
export default function NoEstado({ data }: NodeProps<NodeData>) {
  const aparencia = APARENCIA[data.tipo] ?? APARENCIA_PADRAO;
  const { kicker, titulo, corpo, opcoes } = conteudoDoNo(data);
  const ehPilula = TIPOS_PILULA.has(data.tipo);
  // So sinaliza "nao resolvido" quando e a pilula (nao override manual)
  // quem esta sendo exibida - um override do usuario e sempre confiavel.
  const naoResolvido = ehPilula && data.naoResolvida && !data.overrideRotulo;
  const Icone = aparencia.Icone;

  const classes = [
    "no-fluxo",
    `no-fluxo--${aparencia.forma}`,
    naoResolvido && "no-fluxo--nao-resolvido",
    aparencia.tracejado && "no-fluxo--tracejado",
  ]
    .filter(Boolean)
    .join(" ");

  const kickerCor = naoResolvido ? "var(--cor-nao-resolvido)" : aparencia.acento;

  return (
    <div
      className={classes}
      style={{ background: aparencia.fundo, borderColor: aparencia.borda, "--cor-barra": aparencia.barra } as CSSProperties}
      title={data.mensagem ?? data.rotulo}
    >
      <Handle type="target" position={Position.Left} />

      <div className="no-fluxo__kicker-linha">
        {Icone && <Icone className="no-fluxo__icone" style={{ color: kickerCor }} />}
        <span className="no-fluxo__kicker" style={{ color: kickerCor }}>
          {kicker}
        </span>
      </div>

      {titulo && <div className="no-fluxo__titulo">{titulo}</div>}
      <div className="no-fluxo__texto">{corpo}</div>

      {opcoes.length > 0 && (
        <div className="no-fluxo__opcoes-caixa">
          <ul className="no-fluxo__opcoes">
            {opcoes.map((opcao, indice) => (
              <li key={indice}>{opcao}</li>
            ))}
          </ul>
        </div>
      )}

      <Handle type="source" position={Position.Right} />
    </div>
  );
}
