import { initUploadWiring } from './upload.js';
import { initTransformModalWiring } from './transform-modal.js';
import { initBotViewWiring } from './bot-view-interactions.js';
import { criarIcones } from './dom-root.js';

function init() {
  initUploadWiring();
  initTransformModalWiring();
  initBotViewWiring();
  criarIcones();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
