# ---------------------------------------------------------------------------
# Atualiza a extensão "Orpen — Editor de Bot" a partir do GitHub.
# Chamado pelo Atualizar.bat (dois cliques). Baixa a branch `release` (a
# última versão fechada), copia só os arquivos da extensão para esta pasta e
# pronto: ao recarregar a página da Orpen (F5), a extensão se recarrega sozinha
# na versão nova (background.js).
# ---------------------------------------------------------------------------
param([string]$Ramo = 'release')

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
$Repo = 'GabrielLima66/editorbot'
$Pasta = $PSScriptRoot

# Pastas inteiras (espelhadas) e arquivos da extensão. O manifest.json vai por
# último: se algo falhar no meio, a versão instalada continua a antiga.
$PastasExtensao = @('content', 'js', 'css', 'icons', 'vendor')
$ArquivosExtensao = @('bot_transform.html', 'background.js', 'CHANGELOG.md', 'DOCUMENTACAO_EXTENSAO.md', 'atualizar.ps1')

function Versao-De($manifest) {
  return (Get-Content $manifest -Raw -Encoding UTF8 | ConvertFrom-Json).version
}

Write-Host ''
Write-Host 'Orpen - Editor de Bot: atualização' -ForegroundColor Cyan
Write-Host ''

if (Test-Path (Join-Path $Pasta '.git')) {
  Write-Host 'Esta pasta é o repositório de desenvolvimento (tem .git).' -ForegroundColor Yellow
  Write-Host 'Aqui use "git pull" em vez do Atualizar.bat, para não sobrescrever trabalho local.'
  exit 1
}
if (-not (Test-Path (Join-Path $Pasta 'manifest.json'))) {
  Write-Host 'Não encontrei o manifest.json nesta pasta. O Atualizar.bat precisa ficar na pasta da extensão.' -ForegroundColor Red
  exit 1
}

$Instalada = Versao-De (Join-Path $Pasta 'manifest.json')
Write-Host "Versão instalada: $Instalada"

$Tmp = Join-Path $env:TEMP ('editorbot-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $Tmp | Out-Null
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Write-Host 'Baixando a versão mais recente...'
  $Zip = Join-Path $Tmp 'editorbot.zip'
  try {
    Invoke-WebRequest -Uri "https://github.com/$Repo/archive/refs/heads/$Ramo.zip" -OutFile $Zip -UseBasicParsing
  }
  catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 404) {
      throw 'Ainda não há versão publicada para atualização automática no GitHub. Tente de novo quando o aviso de versão nova aparecer no editor.'
    }
    throw "Sem acesso ao GitHub ($($_.Exception.Message)). Verifique a internet e tente de novo."
  }
  Expand-Archive -Path $Zip -DestinationPath $Tmp
  $Origem = (Get-ChildItem -Path $Tmp -Directory | Select-Object -First 1).FullName

  $Nova = Versao-De (Join-Path $Origem 'manifest.json')
  if ([version]$Nova -le [version]$Instalada) {
    Write-Host ''
    Write-Host "Você já está na versão mais recente ($Instalada)." -ForegroundColor Green
    exit 0
  }

  Write-Host "Atualizando para a versão $Nova..."
  foreach ($d in $PastasExtensao) {
    $de = Join-Path $Origem $d
    if (-not (Test-Path $de)) { continue }
    robocopy $de (Join-Path $Pasta $d) /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Falha ao copiar a pasta $d (robocopy $LASTEXITCODE)" }
  }
  foreach ($f in $ArquivosExtensao) {
    $de = Join-Path $Origem $f
    if (Test-Path $de) { Copy-Item -Path $de -Destination $Pasta -Force }
  }
  Copy-Item -Path (Join-Path $Origem 'manifest.json') -Destination $Pasta -Force

  Write-Host ''
  Write-Host "Pronto: $Instalada -> $Nova" -ForegroundColor Green
  Write-Host 'Agora recarregue a página da Orpen (F5). A extensão se atualiza sozinha.'
}
catch {
  Write-Host ''
  Write-Host "Não foi possível atualizar: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Nada foi alterado na versão instalada se o erro ocorreu antes da cópia.'
  exit 1
}
finally {
  Remove-Item -Path $Tmp -Recurse -Force -ErrorAction SilentlyContinue
}
