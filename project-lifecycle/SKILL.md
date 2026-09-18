---
name: project-lifecycle
description: >-
  Gerenciamento completo do ciclo de vida de projetos. Cobre desde a inicialização
  estruturada (wizard de perguntas, criação de documentos base), passando pelo
  registro de decisões e progresso (execution-log), até a geração automática da
  documentação de entrega consolidada. Integra-se com spec-driven e
  spec-driven-integration. Use sempre que o usuário pedir para iniciar um projeto,
  registrar decisões ou progresso, atualizar o log, ou gerar a documentação final
  de entrega / handoff.
metadata:
  author: Orpen / Antigravity Agent
  version: 1.0.0
---

# project-lifecycle: Ciclo de Vida Completo de Projetos

Esta skill gerencia o ciclo de vida completo de um projeto — do zero à entrega — integrando-se com `spec-driven` (governança de features) e `spec-driven-integration` (contratos de integração).

---

## 🏁 Visão Geral do Ciclo

```
┌──────────┐   ┌───────────┐   ┌───────────┐   ┌──────────────┐   ┌─────────────┐
│  1. INIT  │ → │ 2. SPEC   │ → │ 3. EXEC   │ → │   4. LOG     │ → │  5. DELIVER │
└──────────┘   └───────────┘   └───────────┘   └──────────────┘   └─────────────┘
  Estrutura    spec-driven /     Código /          Decisões /         Doc. Final /
  + Metadata   integration       Integração         Progresso          Handoff
```

---

## 🤖 Protocolo do Agente

**Ao ser ativado com "iniciar projeto", "novo projeto" ou similar:**
1. Perguntar: nome do projeto, cliente/stakeholder, tipo (feature / integration / full), stack tecnológica, data de entrega prevista, descrição curta.
2. Rodar `project-init.mjs` com os parâmetros coletados.
3. Perguntar se o projeto envolve integração entre sistemas → se sim, ativar `spec-driven-integration`.
4. Perguntar se há features a especificar → se sim, ativar `spec-driven`.

**Ao ser ativado com "registrar decisão", "log", "progresso", "problema" ou similar:**
1. Identificar a categoria: decision / progress / issue / assumption / milestone / note.
2. Rodar `execution-log.mjs add --event="..." --category=<tipo>` para registrar no `.project/log.md`.

**Ao ser ativado com "gerar documentação", "finalizar", "entregar" ou similar:**
1. Verificar se existem Q-xxx sem resposta no spec — alertar o usuário se houver.
2. Rodar `delivery-doc.mjs` para consolidar todos os artefatos.
3. Apresentar o caminho do arquivo gerado em `.project/delivery/`.

**Bloqueios:**
- Se `.project/meta.md` não existir: rodar `init` antes de qualquer outra etapa.
- Nunca gerar documentação de entrega sem `.project/log.md` existente.

---

## 📁 Estrutura de Diretórios

```
.project/
├── meta.md              # Metadados do projeto (nome, cliente, datas, stack)
├── log.md               # Diário de bordo — decisões, eventos, progresso
└── delivery/
    └── [timestamp]-delivery.md   # Documentação final consolidada
.spec/                   # Gerenciado pela skill spec-driven
integration.spec.yaml    # Gerenciado pela skill spec-driven-integration
```

---

## ⚙️ Comandos

```bash
# Inicializa o projeto (modo interativo ou com flags)
node <skill-dir>/scripts/project-init.mjs
node <skill-dir>/scripts/project-init.mjs --name="Nome" --client="Cliente" --type=full --stack="Node.js + n8n" --delivery="31/12/2025" --desc="Descrição"

# Registra entradas no log de execução
node <skill-dir>/scripts/execution-log.mjs add --event="Descrição do evento" --category=decision --ref=AC-001
node <skill-dir>/scripts/execution-log.mjs list      # Lista últimas entradas
node <skill-dir>/scripts/execution-log.mjs status    # Resumo de progresso

# Gera a documentação de entrega consolidada
node <skill-dir>/scripts/delivery-doc.mjs
node <skill-dir>/scripts/delivery-doc.mjs --output="nome-do-arquivo"
```

---

## 📄 Templates

| Template | Arquivo Gerado | Descrição |
|---|---|---|
| `project-meta.template.md` | `.project/meta.md` | Metadados e contexto do projeto |
| `log.template.md` | `.project/log.md` | Diário de bordo de execução |
| `delivery.template.md` | `.project/delivery/*.md` | Documento de entrega consolidado |

---

## 🔗 Integração com Outras Skills

| Skill | Papel |
|---|---|
| `spec-driven` | Governa a especificação de features (US, AC, T) |
| `spec-driven-integration` | Define contratos de integração (integration.spec.yaml) |

```
project-lifecycle          ← camada externa (ciclo de vida)
├── spec-driven            ← governança de features
└── spec-driven-integration ← contratos de integração
```
---

## ⚡ Regras Mandatórias de Governança de Tokens e Contexto

1. **Regra 1 — Sumário Executivo no topo do `log.md`:**
   - Todo arquivo `.project/log.md` ou `.spec/logs.md` deve manter a seção `## 📌 Resumo Executivo do Estado Atual` nas primeiras 30 linhas.
   - Ao retomar um projeto ou feature, o agente deve ler **APENAS** as primeiras 30 linhas do log (`StartLine: 1`, `EndLine: 35`) para se situar, sendo terminantemente proibido reler o log inteiro repetidamente.
   - Ao concluir qualquer marco lógico ou tarefa, atualize esse cabeçalho com a última tarefa entregue e a próxima pendente.

2. **Regra 2 — Uso Obrigatório de `grep_search` antes de `view_file`:**
   - Proibido abrir arquivos inteiros (`view_file` irrestrito) em arquivos com mais de 80 linhas.
   - O fluxo padrão e mandatório para inspeção/edição é:
     1. Usar `grep_search` para localizar a linha da função, declaração ou variável alvo;
     2. Usar `view_file` com janela cirúrgica de até 40 linhas (`StartLine: N-10`, `EndLine: N+25`);
     3. Usar `replace_file_content` pontual e confiar no diff retornado sem releituras integrais posteriores.
