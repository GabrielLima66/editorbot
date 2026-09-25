// ---------------------------------------------------------------------------
// "Novidades": histórico de versões sempre acessível pelo botão da versão no
// rodapé do editor. Lê o CHANGELOG.md da PRÓPRIA instalação (funciona sem
// internet e mostra exatamente o que a pessoa tem) e desenha num modal.
// O formato do CHANGELOG é simples: "## [versão] - data" seguido de itens
// "* ..." com **negrito** e `código`, então o leitor aqui é mínimo.
// ---------------------------------------------------------------------------

import { escapeHtml } from './utils.js';
import { getRootNode, criarIcones } from './dom-root.js';

const URL_GITHUB = 'https://github.com/GabrielLima66/editorbot/blob/release/CHANGELOG.md';

function inline(texto) {
  return escapeHtml(texto)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

/** CHANGELOG em markdown -> [{ versao, data, itens: [html] }] */
export function lerChangelog(md) {
  const versoes = [];
  let atual = null;
  String(md || '').split(/\r?\n/).forEach((linha) => {
    const cab = /^##\s+\[([^\]]+)\]\s*-?\s*(.*)$/.exec(linha);
    if (cab) {
      atual = { versao: cab[1].trim(), data: cab[2].trim().replace(/^\*|\*$/g, ''), itens: [] };
      versoes.push(atual);
      return;
    }
    if (!atual) return;
    const item = /^\s*[*-]\s+(.*)$/.exec(linha);
    if (item) atual.itens.push(inline(item[1]));
    else if (linha.trim() && atual.itens.length) atual.itens[atual.itens.length - 1] += ' ' + inline(linha.trim());
  });
  return versoes;
}

function dataBr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export async function abrirNovidades(versaoInstalada) {
  const root = getRootNode();
  if (root.querySelector('.nv-fundo')) return;
  let versoes = [];
  let erro = false;
  try {
    const r = await fetch(chrome.runtime.getURL('CHANGELOG.md'), { cache: 'no-store' });
    versoes = lerChangelog(await r.text());
  } catch {
    erro = true;
  }

  const corpo = erro || !versoes.length
    ? `<p class="nv-vazio">Não consegui ler o histórico desta instalação. Veja no <a href="${URL_GITHUB}" target="_blank" rel="noopener">GitHub</a>.</p>`
    : versoes.map((v, i) => `
        <section class="nv-versao${v.versao === versaoInstalada ? ' nv-instalada' : ''}">
          <h4><span class="nv-numero">v${escapeHtml(v.versao)}</span>${v.data ? `<span class="nv-data">${escapeHtml(dataBr(v.data))}</span>` : ''}${v.versao === versaoInstalada ? '<span class="nv-selo">instalada</span>' : ''}</h4>
          ${v.itens.length ? `<ul>${v.itens.map((it) => `<li>${it}</li>`).join('')}</ul>` : ''}
        </section>${i === 4 && versoes.length > 5 ? '<p class="nv-antigas">Versões anteriores</p>' : ''}`).join('');

  const fundo = document.createElement('div');
  fundo.className = 'mm-fundo nv-fundo';
  fundo.setAttribute('role', 'dialog');
  fundo.setAttribute('aria-modal', 'true');
  fundo.setAttribute('aria-labelledby', 'nv-titulo');
  fundo.innerHTML = `
    <div class="mm-painel nv-painel">
      <header class="mm-topo">
        <h3 id="nv-titulo" class="mm-titulo">Novidades</h3>
        <a class="nv-github" href="${URL_GITHUB}" target="_blank" rel="noopener" title="Histórico da versão publicada, no GitHub">GitHub <i data-lucide="external-link"></i></a>
        <button type="button" class="mm-fechar" data-nv="fechar" title="Fechar (Esc)"><i data-lucide="x"></i></button>
      </header>
      <div class="nv-corpo">${corpo}</div>
    </div>`;
  const fechar = () => fundo.remove();
  fundo.addEventListener('click', (e) => {
    if (e.target === fundo || e.target.closest('[data-nv="fechar"]')) fechar();
  });
  fundo.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); fechar(); }
  });
  (root === document ? document.body : root).appendChild(fundo);
  criarIcones();
  fundo.querySelector('[data-nv="fechar"]').focus();
}
