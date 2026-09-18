// ---------------------------------------------------------------------------
// Catálogo de transformações. Cada uma tem id, categoria (aba), título,
// descrição curta (aparece na lista) e descrição longa (aparece abaixo da
// lista quando selecionada). `fn` é a função que recebe o JSON do bot e
// devolve { data, log } — o JSON transformado e um resumo do que mudou.
// ---------------------------------------------------------------------------
export const TRANSFORMACOES = [
  {
    id: 'whatsapp-para-webchat-menu',
    icone: 'message-square-diff',
    titulo: 'Portar menu WhatsApp → WebChat',
    descricaoCurta: 'Separa o texto do menu da lista de opções',
    descricaoLonga: 'Em toda ação de menu interativo (ACTION_TYPE 10) que ainda usa o formato antigo do WhatsApp ({"interactive": {...}}), extrai o texto da pergunta como uma ação de mensagem separada (ACTION_TYPE 1) e substitui o menu por {"message_type":"menu","menu_type":"list","options":[...]}, no formato aceito pelo WebChat.',
    badge: null,
    fn: transformarMenuWhatsappParaWebchat,
  },
  // Novas transformações entram aqui — mesma forma: { id, icone, titulo, descricaoCurta, descricaoLonga, fn }
];

export function extraiOpcoesInteractive(interactive) {
  const tipo = interactive.type;
  const opcoes = [];
  if (tipo === 'button') {
    (interactive.action?.buttons || []).forEach(btn => {
      opcoes.push({ text: btn.reply?.title || '', value: btn.reply?.id || '' });
    });
  } else if (tipo === 'list') {
    (interactive.action?.sections || []).forEach(sec => {
      (sec.rows || []).forEach(row => {
        opcoes.push({ text: row.title || '', value: row.id || '' });
      });
    });
  }
  return opcoes;
}

export function transformarMenuWhatsappParaWebchat(botOriginal) {
  const data = JSON.parse(JSON.stringify(botOriginal)); // clone profundo

  const acoesPorTransicao = {};
  data.BOT_ACTIONS.forEach(a => {
    (acoesPorTransicao[a.TRANSITION_ID] ||= []).push(a);
  });

  let maxId = Math.max(...data.BOT_ACTIONS.map(a => parseInt(a.ID, 10)));
  const novoId = () => String(++maxId);

  const convertidas = [];
  const acoesFinais = [];

  Object.entries(acoesPorTransicao).forEach(([tid, acoes]) => {
    const ordenadas = [...acoes].sort((a, b) => parseInt(a.ID) - parseInt(b.ID));

    let idxAlvo = -1;
    let interactive = null;
    for (let i = 0; i < ordenadas.length; i++) {
      const a = ordenadas[i];
      if (a.ACTION_TYPE === '10') {
        try {
          const parsed = JSON.parse(a.ACTION_DATA.message_option_text);
          if (parsed && parsed.interactive) {
            idxAlvo = i;
            interactive = parsed.interactive;
            break;
          }
        } catch (e) { /* não é JSON do formato antigo, ignora */ }
      }
    }

    if (idxAlvo === -1) {
      acoesFinais.push(...ordenadas);
      return;
    }

    const alvo = ordenadas[idxAlvo];
    const bodyText = interactive.body?.text || '';
    const opcoes = extraiOpcoesInteractive(interactive);

    const idNovaMsg = novoId();
    const novaMsg = {
      '0': idNovaMsg, 'ID': idNovaMsg,
      '1': tid, 'TRANSITION_ID': tid,
      '2': '1', 'ACTION_TYPE': '1',
      'ACTION_DATA': { message_text: bodyText },
    };

    const novoMenu = { message_type: 'menu', menu_type: 'list', options: opcoes };
    alvo.ACTION_DATA = { message_option_text: JSON.stringify(novoMenu, null, 2) };

    const novaOrdem = [...ordenadas.slice(0, idxAlvo), novaMsg, ...ordenadas.slice(idxAlvo)];
    novaOrdem.forEach(a => {
      const nid = novoId();
      a['0'] = nid; a.ID = nid;
    });

    acoesFinais.push(...novaOrdem);
    convertidas.push({ tid, texto: bodyText.slice(0, 50), nOpcoes: opcoes.length });
  });

  data.BOT_ACTIONS = acoesFinais;

  const log = convertidas.length
    ? convertidas.map(c => `Transição ${c.tid}: "${c.texto}${c.texto.length >= 50 ? '…' : ''}" (${c.nOpcoes} opções)`)
    : ['Nenhum menu no formato antigo do WhatsApp foi encontrado — nada para converter.'];

  return { data, log };
}
