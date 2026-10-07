# 07 · Atualização e Novidades

Status: implementada (referência: `js/atualizacao.js`, `js/novidades.js`, `background.js`, `atualizar.ps1`, `Atualizar.bat`, `CHANGELOG.md`, `manifest.json`). Spec de nível **geral**, mas com os protocolos exatos, porque envolvem três programas diferentes (página, service worker, script do Windows).

Pré-requisito: `00-contrato-de-entrada.md` (convenções do rodapé do editor, `empilharEsc`, `getRootNode`).

---

## 1. Objetivo

A extensão é distribuída **sem loja**: a pessoa instala a pasta "sem compactação" no Chrome. Este módulo resolve duas coisas:

1. **Avisar e instalar versão nova** com um clique, sem a pessoa baixar nada à mão.
2. **Mostrar o histórico de versões** ("Novidades") dentro do próprio editor.

### Fora do escopo
- Publicação na Chrome Web Store.
- Atualização em macOS/Linux (o atualizador é PowerShell/Windows).
- Atualização silenciosa sem a pessoa saber.

---

## 2. Peças e fonte da verdade

| Peça | Papel |
|---|---|
| `manifest.json` (campo `version`) | versão da extensão; `X.Y.Z` com números |
| Branch **`release`** do GitHub (repositório público) | **única fonte** do que é "versão publicada"; só avança quando uma versão é fechada |
| `CHANGELOG.md` | histórico de versões; vem dentro da instalação |
| Página do editor (`atualizacao.js`, `novidades.js`) | avisa, dispara o atualizador, observa, recarrega |
| Service worker (`background.js`) | compara a versão carregada com a do disco; é o único que pode `chrome.runtime.reload()` |
| `atualizar.ps1` / `Atualizar.bat` | baixa a `release`, copia os arquivos para a pasta, registra o link `editorbot-atualizar://` |

Repositório e ramo são **constantes** no código: `REPO = 'GabrielLima66/editorbot'` e `RAMO = 'release'` (em `atualizacao.js` e `atualizar.ps1`, `$Repo`/`$Ramo`). Trocar de repositório exige editar os dois arquivos juntos. URLs derivadas: manifest publicado em `https://raw.githubusercontent.com/<REPO>/release/manifest.json`; histórico em `https://github.com/<REPO>/blob/release/CHANGELOG.md`; pacote em `https://github.com/<REPO>/archive/refs/heads/release.zip`.

**Permissões da extensão que isto exige (`manifest.json`):** `permissions: ["storage"]` (usada pela área de cópia; a atualização usa o `localStorage` da página), `background.service_worker = "background.js"`, e `web_accessible_resources` incluindo `CHANGELOG.md` (senão o Novidades não consegue ler o histórico dentro da página da Orpen). A consulta ao GitHub é um `fetch` simples a `raw.githubusercontent.com`; não há `host_permissions`.

---

## 3. Comparar versões

`compararVersoes(a, b)`: separa por `.`, converte cada parte com `parseInt(parte, 10)` (**sem número no começo vira 0**; `"8abc"` vira 8, `"0-beta"` vira 0; parte ausente vira 0), compara da esquerda para a direita e devolve negativo/zero/positivo. `0.8.19 > 0.8.9`; `1.0 == 1.0.0`. A **mesma** função existe em `background.js` (copiada, porque o worker não importa módulos da página) e a regra tem de ser idêntica nas duas.

---

## 4. Aviso de versão nova (rodapé do editor)

### 4.1 Quando e o que consulta
Ao abrir o editor, se a versão instalada é conhecida: busca `https://raw.githubusercontent.com/<REPO>/release/manifest.json` com `cache: 'no-store'` e lê `version`. **Qualquer falha** (sem internet, 404, JSON inválido, resposta sem `version`) resulta em **nenhum aviso e nenhuma mensagem de erro**.

### 4.2 Cache da consulta
Guardado em `localStorage` (chave `editorbot:versao-publicada`, `{versao, quando}`), por domínio, com `try/catch` em tudo:
- se a versão publicada **é mais nova** que a instalada → vale **1 hora**;
- se **não é** → vale só **5 minutos** (para quem abriu o editor pouco antes de uma publicação ver o aviso logo).
Cache ilegível ou expirado → consulta de novo.

### 4.3 Aviso
Se `publicada > instalada`: inserir logo depois do elemento da versão do rodapé (`#bv-versao`) um bloco `#bv-atualizacao` (uma vez só):
> ↑ **Versão X disponível** · [Atualizar agora] · [novidades]

- "Atualizar agora" é um link `editorbot-atualizar://atualizar` (abre o atualizador do Windows).
- "novidades" abre o `CHANGELOG.md` da `release` no GitHub, em nova aba (`rel="noopener"`).
- Dica (`title`) do aviso: explica que o botão abre o atualizador do Windows, que o Chrome pede confirmação na primeira vez e que, se nada acontecer, é para rodar o `Atualizar.bat` na pasta da extensão.
- O texto da versão passa por `escapeHtml`.

---

## 5. Depois do clique em "Atualizar agora"

O link faz o Chrome abrir o `atualizar.ps1` (fora do navegador). O editor **só observa**:

1. Troca o aviso por "Atualizando… acompanhe na janela do atualizador" (ícone girando).
2. A cada **2 s** pergunta ao service worker (`runtime.sendMessage({tipo:'editorbot:verificar-disco', recarregar:false})`) se a pasta já tem versão mais nova que a carregada. **Só consulta; não recarrega.**
3. Se **passaram 20 s** sem novidade (uma vez só): troca o texto por "Nada aconteceu? Rode o **Atualizar.bat** uma vez na pasta da extensão: ele também ativa este botão." (o link ainda não está registrado no Windows).
4. Se **passaram 3 min** sem novidade: desiste e **volta ao aviso original** ("Versão X disponível").
5. Quando a versão nova chega ao disco (`atualizar:true`):
   - **Sem alterações não salvas:** conclui na hora.
   - **Com alterações não salvas:** mostra "Versão Y instalada. Salve o bot e clique em **Concluir**". O botão Concluir **não faz nada** enquanto houver alteração (marca o aviso em alerta e dica "Ainda há alterações não salvas: salve o bot antes de concluir"); depois de salvar, conclui.
6. **Concluir** = mostra "Versão Y instalada. Recarregando…", manda o service worker **recarregar a extensão** (`recarregar:true`) e **recarrega a página** após 1,2 s.

> A regra de ouro: **nunca recarregar a página nem a extensão no meio de uma edição não salva.** O editor informa quando há alteração não salva por uma função fornecida por quem chama (`temAlteracoesNaoSalvas`).

Se o contexto da extensão foi invalidado (atualização anterior sem recarregar a aba), o `sendMessage` pode lançar ou devolver `lastError`: tratar como "sem resposta" e seguir o fluxo (item 3/4), nunca quebrar.

---

## 6. Service worker (`background.js`)

Escuta a mensagem `{tipo:'editorbot:verificar-disco', recarregar}`; qualquer outra é ignorada. **Atenção ao padrão:** se `recarregar` for omitido ou qualquer valor diferente de `false`, o worker **recarrega a extensão** quando houver versão nova no disco. Quem só quer consultar precisa enviar `recarregar:false` explicitamente (é o que o editor faz durante a espera). A própria página da Orpen, ao carregar, envia a mensagem sem `recarregar:false` de propósito: assim a extensão se atualiza sozinha na próxima abertura. Faz:
1. `carregada` = `chrome.runtime.getManifest().version` (a versão **em execução**).
2. Lê `manifest.json` **do disco** (`fetch(chrome.runtime.getURL('manifest.json'), {cache:'no-store'})`) → `noDisco`.
3. `atualizar = noDisco > carregada`.
4. Responde `{carregada, noDisco, atualizar}`. Se `atualizar` e `recarregar !== false`, agenda `chrome.runtime.reload()` em 200 ms (depois de responder).
5. Se a leitura falhar: responde `{carregada, noDisco:null, atualizar:false}`.

Importante: o Chrome continua rodando a versão **carregada** mesmo depois de os arquivos da pasta mudarem; só o `runtime.reload()` faz a nova valer. Por isso a pergunta "o disco está mais novo que o carregado?".

---

## 7. O atualizador do Windows (`atualizar.ps1`)

Duas formas de rodar: **`Atualizar.bat`** (dois cliques na pasta) e o link `editorbot-atualizar://atualizar` (vem com `-Auto`: a janela fecha sozinha se deu certo, espera Enter se deu erro).

`Atualizar.bat` tem só isto: desliga o eco, roda `powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0atualizar.ps1"`, e faz `pause` no fim.

**Registro do protocolo** (só usuário atual, sem administrador): chave `HKCU\Software\Classes\editorbot-atualizar` com valor padrão `URL:Atualizador do Editor de Bot` e propriedade `URL Protocol` (vazia); subchave `shell\open\command` com valor padrão `"<PSHOME>\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "<pasta>\atualizar.ps1" -Auto`. Recriado a cada execução (idempotente). Remover: `atualizar.ps1 -RemoverAtalho`.

Passos:
1. **Recusa** rodar se a pasta tem `.git` (é o repositório de desenvolvimento: mandar usar `git pull`), ou se não há `manifest.json` ao lado. Nos dois casos, mensagem e código de saída 1.
2. **Registra o link** `editorbot-atualizar` em `HKCU\Software\Classes` (só usuário atual, sem administrador), apontando para este script com `-NoProfile -ExecutionPolicy Bypass -File "<script>" -Auto`. Idempotente. Falhar aqui só avisa.
3. Lê a versão instalada (`manifest.json` local).
4. Baixa `https://github.com/<REPO>/archive/refs/heads/release.zip` (TLS 1.2) em pasta temporária; 404 → "Ainda não há versão publicada..."; outro erro → "Sem acesso ao GitHub...".
5. Se a versão baixada **não é maior** que a instalada → "Você já está na versão mais recente" (sucesso, nada copiado).
6. Copia **só os arquivos da extensão**: pastas espelhadas (`robocopy /MIR`) `content`, `js`, `css`, `icons`, `vendor`; arquivos `bot_transform.html`, `background.js`, `CHANGELOG.md`, `DOCUMENTACAO_EXTENSAO.md`, `atualizar.ps1`; e **por último** o `manifest.json` (se algo falhar no meio, a versão instalada continua a antiga). `robocopy` com código ≥ 8 é falha.
7. Apaga a pasta temporária sempre.
8. Parâmetro `-RemoverAtalho` remove o link do registro.

**Manutenção:** ao criar uma pasta ou arquivo novo que a extensão precise (ex.: nova pasta de código), incluí-lo nas listas `PastasExtensao` / `ArquivosExtensao`; senão a atualização fica incompleta.

---

## 8. Novidades (histórico de versões)

### 8.1 Abrir
O botão da versão no rodapé abre a janela "Novidades". Fecha com X, clique no fundo e **Esc** (pilha de Esc). Foco inicial no botão de fechar. Só uma janela por vez (ignora cliques enquanto o histórico carrega).

### 8.2 Fonte
Lê o `CHANGELOG.md` **da própria instalação** (`chrome.runtime.getURL`, `cache:'no-store'`): funciona sem internet e mostra exatamente o que a pessoa tem. Falha ou nenhuma versão lida: "Não consegui ler o histórico desta instalação. Veja no GitHub." (link). O cabeçalho tem um link "GitHub" para o histórico da versão publicada.

### 8.3 Formato do CHANGELOG
- Versão: linha `## [X.Y.Z] - AAAA-MM-DD` (o hífen e a data são opcionais; asteriscos nas pontas da data são removidos).
- Itens: linhas que começam com `*` ou `-`.
- Uma linha não vazia depois de um item sem marcador é **continuação** do item anterior (junta com espaço).
- Qualquer coisa antes da primeira versão é ignorada.
- No texto: `` `código` `` vira `<code>` e `**negrito**` vira `<strong>`; **todo o resto passa por `escapeHtml` primeiro**.
- Data exibida como DD/MM/AAAA quando vier em AAAA-MM-DD; senão, como veio.

### 8.4 Apresentação
Uma seção por versão (mais nova primeiro, na ordem do arquivo): `vX.Y.Z`, data, e a etiqueta **"instalada"** (com destaque) na versão igual à instalada. Depois da 5ª versão, quando há mais de 5, um separador "Versões anteriores".

---

## 9. Regras de publicação (o que o processo precisa garantir)

- O `version` do `manifest.json` e a primeira versão do `CHANGELOG.md` **têm de ser iguais** em cada versão publicada (o validador do projeto confere).
- A branch `release` só recebe versões **fechadas**; é ela que dispara o aviso para todo mundo.
- Formato de versão: apenas números separados por ponto.

---

## 10. Critérios de aceitação

1. `compararVersoes`: `0.8.19 > 0.8.9`, `1.0 == 1.0.0`, `0.9 < 0.10`, parte não numérica conta 0, entrada vazia não lança.
2. Versão publicada igual ou menor que a instalada: nenhum aviso. Sem internet, 404 ou JSON sem `version`: nenhum aviso e nenhum erro no console visível ao usuário.
3. Com versão publicada maior: aviso aparece uma única vez ao lado da versão, mesmo se a função for chamada duas vezes.
4. Cache: com novidade, não consulta de novo antes de 1 h; sem novidade, não consulta antes de 5 min; storage indisponível não impede a consulta.
5. Depois do clique, o aviso muda para "Atualizando…"; aos 20 s mostra a dica do `Atualizar.bat`; aos 3 min volta ao aviso original.
6. Sem alterações não salvas, ao chegar a versão nova: mostra "Recarregando…", pede o recarregamento da extensão e recarrega a página.
7. **Com alterações não salvas, nada é recarregado** até a pessoa salvar e clicar em Concluir; Concluir com alteração pendente não faz nada além de sinalizar.
8. Service worker: responde `atualizar:true` só se `noDisco > carregada`; com `recarregar:false` **não** recarrega; com falha de leitura responde `noDisco:null`.
9. `atualizar.ps1`: recusa pasta com `.git`; recusa pasta sem `manifest.json`; "já na versão mais recente" quando iguais; copia o `manifest.json` por último; falha de download não altera a instalação.
10. Novidades: abrir duas vezes seguidas cria uma só janela; Esc fecha; versão instalada recebe a etiqueta; `<script>` no texto de um item aparece como texto; CHANGELOG ilegível mostra a mensagem com o link.
11. Leitura do CHANGELOG: continuação de linha, data com asteriscos, versão sem data, lixo antes da primeira versão.

---

## 11. Riscos e pontos em aberto

| Item | Situação |
|---|---|
| Só Windows | O botão "Atualizar agora" depende do protocolo registrado no Windows. Em outro sistema, o aviso funciona, mas a atualização é manual. |
| Primeira vez | Antes de rodar o `Atualizar.bat` uma vez, o link não existe: o botão não faz nada (a dica dos 20 s cobre isso). |
| Confirmação do Chrome | O Chrome pede confirmação ao abrir o protocolo na primeira vez. |
| Conta no GitHub | Repositório e ramo estão fixos no código e precisam continuar públicos; privado = 404 para todo mundo e nenhuma atualização. |
| Pasta de desenvolvimento | O atualizador se recusa a rodar em pasta com `.git` (proteção de trabalho local). |
| Reload e abas abertas | Depois de `runtime.reload()`, abas abertas ficam com o contexto antigo invalidado até serem recarregadas (o fluxo recarrega a atual; as outras avisam erro de `chrome.*`). |
| Duas cópias da comparação | `compararVersoes` existe em dois lugares; se mudar uma, mudar a outra. |
