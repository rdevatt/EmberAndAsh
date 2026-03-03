'use strict';

// Compatibility loader for legacy references to /public/game.js
(() => {
  const load = (src) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    document.body.appendChild(script);
  };

  load('game/core.js');
  load('game/creation.js');
})();
