const urlParams = new URLSearchParams(window.location.search);
let roomSlug = urlParams.get('room');
const API_BASE = window.location.origin;

const statusEl = document.getElementById('status');
const container = document.getElementById('media-container');
const siteFrame = document.getElementById('site-frame');

// --- YOUTUBE API ---
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

let ytPlayer = null;
let isYtReady = false;

window.onYouTubeIframeAPIReady = function() {
  isYtReady = true;
};

function extractYtId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// --- APP STATE ---
let currentRoomState = {
  playlist: null,
  audioPlaylist: null,
  audioStreamUrl: null,
  siteUrl: null,
  mode: "playlist",
  visualStatus: "idle",
  audioStatus: "idle",
  audioVolume: 100,
};

// --- VISUAL ENGINE ---
let visualPlaylist = null;
let visualItems = [];
let vIndex = 0;
let vIsPaused = false;
let vTimeoutId = null;
let vImageStartTime = 0;
let vImageRemainingMs = 0;

// --- AUDIO ENGINE ---
let audioPlaylist = null;
let audioItems = [];
let aIndex = 0;
let aIsPaused = false;
let duckingActive = false;
let duckingInterval = null;
let masterVolume = 100; // 0 a 100

const bgmPlayer = new Audio();
bgmPlayer.onended = () => {
  if (!currentRoomState.audioStreamUrl) {
    handleAudioEnded();
  }
};
bgmPlayer.onerror = (e) => {
  console.warn("Audio Error:", e);
  if (currentRoomState.audioStreamUrl) {
    console.log("Tentando reconectar stream de áudio em 3s...");
    setTimeout(() => {
      if (currentRoomState.audioStreamUrl && !aIsPaused) {
        bgmPlayer.src = normalizeAudioUrl(currentRoomState.audioStreamUrl);
        bgmPlayer.play().catch(() => {});
      }
    }, 3000);
  } else {
    handleAudioEnded();
  }
};

function handleAudioEnded() {
  if (audioItems.length === 0) {
    bgmPlayer.pause();
    return;
  }
  
  const loopMode = currentRoomState.audioLoopMode || (audioPlaylist && audioPlaylist.loopMode) || "all";
  const shuffle = Boolean(currentRoomState.audioShuffle || (audioPlaylist && audioPlaylist.shuffle));

  if (loopMode === "one") {
    bgmPlayer.currentTime = 0;
    bgmPlayer.play().catch(() => {});
    return;
  }

  if (shuffle && audioItems.length > 1) {
    let nextIdx = aIndex;
    while (nextIdx === aIndex) {
      nextIdx = Math.floor(Math.random() * audioItems.length);
    }
    aIndex = nextIdx;
    playNextAudio();
    return;
  }

  aIndex++;
  if (aIndex >= audioItems.length) {
    if (loopMode === "none") {
      bgmPlayer.pause();
      return;
    }
    aIndex = 0;
  }
  playNextAudio();
}

function calculateTargetAudioVolume() {
  let itemVol = 1;
  if (!currentRoomState.audioStreamUrl && audioItems[aIndex] && audioItems[aIndex].volume !== undefined) {
    itemVol = audioItems[aIndex].volume / 100;
  }
  const masterRatio = masterVolume / 100;
  let finalVol = itemVol * masterRatio;
  if (duckingActive && currentRoomState.mode !== "site") {
    finalVol *= 0.1;
  }
  return Math.max(0, Math.min(1, finalVol));
}

function fadeBgmVolume(targetVolume) {
  if (duckingInterval) clearInterval(duckingInterval);
  duckingInterval = setInterval(() => {
    let current = bgmPlayer.volume;
    if (Math.abs(current - targetVolume) < 0.05) {
      bgmPlayer.volume = targetVolume;
      clearInterval(duckingInterval);
    } else {
      bgmPlayer.volume += (targetVolume > current) ? 0.05 : -0.05;
    }
  }, 80);
}

function updateDucking(active) {
  duckingActive = active;
  if (aIsPaused) return;
  fadeBgmVolume(calculateTargetAudioVolume());
}

function setMasterVolume(vol) {
  masterVolume = Math.max(0, Math.min(100, Number(vol)));
  if (!aIsPaused) {
    fadeBgmVolume(calculateTargetAudioVolume());
  }
}

function normalizeAudioUrl(url) {
  if (!url) return url;
  let clean = url.trim();
  // Dropbox: converte link de visualização ?dl=0 para ?raw=1
  if (clean.includes("dropbox.com")) {
    clean = clean.replace(/[?&]dl=[01]/g, "");
    clean += (clean.includes("?") ? "&raw=1" : "?raw=1");
    return clean;
  }
  // Google Drive: converte link de compartilhamento para streaming direto
  const gdriveMatch = clean.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (gdriveMatch) {
    return `https://drive.google.com/uc?export=download&id=${gdriveMatch[1]}`;
  }
  return clean;
}

function startAudioPlayback() {
  if (currentRoomState.audioStreamUrl) {
    const src = normalizeAudioUrl(currentRoomState.audioStreamUrl);
    if (bgmPlayer.src !== src) {
      bgmPlayer.src = src;
    }
    bgmPlayer.volume = calculateTargetAudioVolume();
    if (!aIsPaused) {
      bgmPlayer.play().catch(e => {
        console.warn("Audio stream autoplay blocked:", e);
        requireUserInteraction("Clique para Iniciar o Áudio / Rádio");
      });
    }
  } else {
    playNextAudio();
  }
}

function playNextAudio() {
  if (currentRoomState.audioStreamUrl) {
    startAudioPlayback();
    return;
  }

  if (audioItems.length === 0) {
    bgmPlayer.pause();
    return;
  }
  
  if (aIndex >= audioItems.length) {
    if (audioPlaylist && audioPlaylist.loop !== false) {
      aIndex = 0;
    } else {
      bgmPlayer.pause();
      return;
    }
  }

  const item = audioItems[aIndex];
  if (!item) return;
  const rawSrc = item.url.startsWith('http') ? item.url : `${API_BASE}${item.url}`;
  const src = normalizeAudioUrl(rawSrc);
  
  if (bgmPlayer.src !== src) {
    bgmPlayer.src = src;
  }
  
  bgmPlayer.volume = calculateTargetAudioVolume();

  if (!aIsPaused) {
    bgmPlayer.play().catch(e => {
      console.warn("BGM autoplay blocked:", e);
      requireUserInteraction("Clique para Iniciar o Áudio");
    });
  }
  emitCommand('audio', 'trackChanged', aIndex);
}

// --- SCREEN WAKE LOCK (Impede suspensão/apagar de tela na Smart TV) ---
let wakeLock = null;
async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('[WakeLock] Tela ativa (suspensão prevenida).');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    } catch (err) {
      console.warn('[WakeLock] Não disponível ou recusado:', err);
    }
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !wakeLock) {
    requestWakeLock();
  }
});

// --- ATALHOS DE TELA CHEIA (Tecla F e Duplo Clique) ---
function toggleFullScreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') {
    toggleFullScreen();
  }
});

document.addEventListener('dblclick', (e) => {
  if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
    toggleFullScreen();
  }
});

// --- MODO STANDBY / BLACKOUT VIRTUAL (Pausa / Fim de Expediente) ---
let isStandbyActive = false;
function applyStandbyMode(active) {
  isStandbyActive = active;
  let overlay = document.getElementById('standby-blackout-overlay');
  if (active) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'standby-blackout-overlay';
      overlay.style = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:#000000;z-index:99990;display:flex;align-items:center;justify-content:center;transition:opacity 0.6s ease;';
      overlay.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;opacity:0.3;color:#ffffff;font-size:13px;font-family:sans-serif;letter-spacing:0.25em;text-transform:uppercase;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
          <span>Standby • Sala em Pausa</span>
        </div>
      `;
      document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
    if (!bgmPlayer.paused) {
      bgmPlayer.pause();
    }
  } else {
    if (overlay) {
      overlay.style.display = 'none';
    }
    if (!aIsPaused && (currentRoomState.audioStreamUrl || audioItems.length > 0)) {
      bgmPlayer.play().catch(e => console.warn(e));
    }
  }
}

// --- AUDIO WATCHDOG (Anti-buffering infinito / Recuperação suave de travamentos) ---
let audioStallSecs = 0;
let lastObservedAudioTime = -1;

setInterval(() => {
  // Ignora se o áudio estiver pausado pelo operador ou em modo Standby
  if (aIsPaused || isStandbyActive) {
    audioStallSecs = 0;
    lastObservedAudioTime = -1;
    return;
  }
  if (!currentRoomState.audioStreamUrl && audioItems.length === 0) {
    audioStallSecs = 0;
    lastObservedAudioTime = -1;
    return;
  }

  // Detecta se o navegador pausou o áudio em background
  if (bgmPlayer.paused && !aIsPaused && !isStandbyActive) {
    audioStallSecs += 3;
    if (audioStallSecs >= 6) {
      console.log("[Audio Watchdog] Áudio pausado involuntariamente pelo sistema. Retomando...");
      bgmPlayer.play().catch(e => console.warn("[Watchdog] Play:", e));
      audioStallSecs = 0;
    }
    return;
  }

  // Detecta se a posição do áudio congelou no mesmo ponto (buffering infinito de rede/Dropbox)
  const currentPos = bgmPlayer.currentTime;
  if (currentPos > 0 && Math.abs(currentPos - lastObservedAudioTime) < 0.15) {
    audioStallSecs += 3;
    if (audioStallSecs >= 9) { // 9 segundos congelado
      console.warn(`[Audio Watchdog] Congelamento de áudio detectado em ${currentPos.toFixed(1)}s. Recuperando suavemente...`);
      audioStallSecs = 0;
      lastObservedAudioTime = -1;
      if (currentRoomState.audioStreamUrl) {
        // Rádio/Stream: reconecta o fluxo
        bgmPlayer.src = normalizeAudioUrl(currentRoomState.audioStreamUrl);
        bgmPlayer.play().catch(e => console.warn(e));
      } else {
        // Playlist Dropbox: avança suavemente para a próxima faixa sem parar o sistema
        handleAudioEnded();
      }
    }
  } else {
    audioStallSecs = 0;
    lastObservedAudioTime = currentPos;
  }
}, 3000);

// --- SITE ENGINE ---
function activateSiteMode(url) {
  if (!url) return;
  currentRoomState.mode = "site";
  currentRoomState.siteUrl = url;

  // Limpa reprodução visual para economizar memória/CPU
  if (vTimeoutId) { clearTimeout(vTimeoutId); vTimeoutId = null; }
  if (ytPlayer && ytPlayer.destroy) {
    try { ytPlayer.destroy(); } catch (e) {}
    ytPlayer = null;
  }
  container.innerHTML = '';
  updateDucking(false); // O site não abaixa o áudio de fundo

  // Configura e exibe o iframe
  if (siteFrame.src !== url) {
    siteFrame.src = url;
  }
  siteFrame.classList.add('visible');
  statusEl.style.display = 'none';

  // Atualiza controles do overlay
  const reloadBtn = document.getElementById('btn-site-reload');
  if (reloadBtn) reloadBtn.style.display = 'flex';
}

function deactivateSiteMode() {
  siteFrame.classList.remove('visible');
  siteFrame.src = 'about:blank';
  const reloadBtn = document.getElementById('btn-site-reload');
  if (reloadBtn) reloadBtn.style.display = 'none';
  currentRoomState.mode = "playlist";
}

function reloadSiteFrame() {
  if (siteFrame && siteFrame.classList.contains('visible') && currentRoomState.siteUrl) {
    console.log("Recarregando site remoto:", currentRoomState.siteUrl);
    siteFrame.src = currentRoomState.siteUrl;
  }
}

// --- VISUAL PLAYLIST ENGINE ---
function playNextVisual() {
  // Se estiver em modo site, não roda visual
  if (currentRoomState.mode === "site" && currentRoomState.siteUrl) {
    return;
  }

  statusEl.style.display = 'none';
  if (visualItems.length === 0) {
    container.innerHTML = '';
    showStatus("Aguardando conteúdo...");
    return;
  }
  
  if (vIndex >= visualItems.length) {
    if (visualPlaylist && visualPlaylist.loop !== false) {
      vIndex = 0;
    } else {
      container.innerHTML = '';
      showStatus("Fim da exibição.");
      return;
    }
  }

  const item = visualItems[vIndex];
  if (!item) return;

  // Limpa player anterior de YouTube se existir
  if (ytPlayer && ytPlayer.destroy) {
    try { ytPlayer.destroy(); } catch (e) {}
    ytPlayer = null;
  }
  container.innerHTML = '';

  const src = item.url.startsWith('http') ? item.url : `${API_BASE}${item.url}`;

  if (vIsPaused) handleCommand('visual', 'play');

  if (item.type === 'youtube') {
    updateDucking(item.muted !== true);
    
    const ytContainer = document.createElement('div');
    ytContainer.id = 'yt-player';
    ytContainer.className = 'active';
    container.appendChild(ytContainer);

    const videoId = extractYtId(item.url) || 'dQw4w9WgXcQ';
    
    const tryPlayYt = () => {
      if (!isYtReady) {
        setTimeout(tryPlayYt, 100);
        return;
      }
      ytPlayer = new YT.Player('yt-player', {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
          'autoplay': 1, 'controls': 0, 'disablekb': 1, 'fs': 0, 'rel': 0,
          'enablejsapi': 1, 'origin': window.location.origin, 'mute': item.muted ? 1 : 0
        },
        events: {
          'onReady': (event) => {
             event.target.setVolume(item.volume !== undefined ? item.volume : 100);
             event.target.playVideo();
          },
          'onStateChange': (event) => {
            if (event.data === YT.PlayerState.ENDED) {
              vIndex++;
              playNextVisual();
            } else if (event.data === YT.PlayerState.UNSTARTED) {
              setTimeout(() => {
                if (ytPlayer && ytPlayer.getPlayerState && ytPlayer.getPlayerState() === YT.PlayerState.UNSTARTED) {
                  requireUserInteraction("Autoplay Bloqueado");
                }
              }, 2000);
            }
          },
          'onError': () => {
            vIndex++;
            playNextVisual();
          }
        }
      });
    };
    tryPlayYt();

  } else if (item.type === 'video') {
    updateDucking(item.muted !== true);
    
    const video = document.createElement('video');
    video.src = src;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = item.muted === true;
    video.volume = item.volume !== undefined ? item.volume / 100 : 1;
    video.className = 'active';
    video.onended = () => { vIndex++; playNextVisual(); };
    video.onerror = () => { vIndex++; playNextVisual(); };
    container.appendChild(video);
    video.play().catch(e => {
      console.warn("Video autoplay blocked", e);
      requireUserInteraction("Clique para Iniciar Vídeo");
    });

  } else if (item.type === 'web' || item.type === 'website') {
    // Suporte a item do tipo website dentro de uma playlist visual
    updateDucking(false);
    const iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.className = 'active';
    iframe.allow = "autoplay; fullscreen; encrypted-media";
    iframe.sandbox = "allow-same-origin allow-scripts allow-forms allow-popups";
    container.appendChild(iframe);

    vImageRemainingMs = item.duration ? item.duration * 1000 : 15000;
    vImageStartTime = Date.now();
    
    if (!vIsPaused) {
      if (vTimeoutId) clearTimeout(vTimeoutId);
      vTimeoutId = setTimeout(() => {
        vIndex++;
        playNextVisual();
      }, vImageRemainingMs);
    }

  } else {
    // Imagem
    updateDucking(false);
    
    const img = document.createElement('img');
    img.src = src;
    img.className = 'active';
    container.appendChild(img);
    
    vImageRemainingMs = item.duration ? item.duration * 1000 : 8000;
    vImageStartTime = Date.now();
    
    if (!vIsPaused) {
      if (vTimeoutId) clearTimeout(vTimeoutId);
      vTimeoutId = setTimeout(() => {
        vIndex++;
        playNextVisual();
      }, vImageRemainingMs);
    }
  }
}

// --- COMANDOS & ESTADO REMOTO ---
function handleCommand(target, cmd, value) {
  if (target === 'site') {
    if (cmd === 'reload') {
      reloadSiteFrame();
    }
  } else if (target === 'visual') {
    if (cmd === 'next') {
      vIsPaused = false;
      if (vTimeoutId) { clearTimeout(vTimeoutId); vTimeoutId = null; }
      vIndex++; playNextVisual();
    } else if (cmd === 'prev') {
      vIsPaused = false;
      if (vTimeoutId) { clearTimeout(vTimeoutId); vTimeoutId = null; }
      vIndex--; if (vIndex < 0) vIndex = visualItems.length - 1;
      playNextVisual();
    } else if (cmd === 'pause') {
      vIsPaused = true;
      const item = visualItems[vIndex];
      if (item && item.type === 'video') {
        const vid = container.querySelector('video');
        if (vid) vid.pause();
      } else if (item && item.type === 'youtube' && ytPlayer && ytPlayer.pauseVideo) {
        ytPlayer.pauseVideo();
      } else if (item && vTimeoutId) {
        clearTimeout(vTimeoutId); vTimeoutId = null;
        vImageRemainingMs -= (Date.now() - vImageStartTime);
      }
      const btn = document.getElementById('btn-v-play');
      if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
    } else if (cmd === 'play') {
      vIsPaused = false;
      const item = visualItems[vIndex];
      if (item && item.type === 'video') {
        const vid = container.querySelector('video');
        if (vid) vid.play();
      } else if (item && item.type === 'youtube' && ytPlayer && ytPlayer.playVideo) {
        ytPlayer.playVideo();
      } else if (item) {
        vImageStartTime = Date.now();
        vTimeoutId = setTimeout(() => { vIndex++; playNextVisual(); }, vImageRemainingMs > 0 ? vImageRemainingMs : 1000);
      }
      const btn = document.getElementById('btn-v-play');
      if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
    }
  } else if (target === 'audio') {
    if (cmd === 'setVolume' && value !== undefined) {
      setMasterVolume(value);
    } else if (cmd === 'setLoopMode' && value !== undefined) {
      currentRoomState.audioLoopMode = value;
    } else if (cmd === 'setShuffle' && value !== undefined) {
      currentRoomState.audioShuffle = Boolean(value);
    } else if (cmd === 'setTrackIndex' && value !== undefined) {
      if (!currentRoomState.audioStreamUrl && audioItems.length > 0) {
        const targetIdx = Number(value);
        if (targetIdx >= 0 && targetIdx < audioItems.length) {
          aIndex = targetIdx;
          aIsPaused = false;
          playNextAudio();
          const btn = document.getElementById('btn-a-play');
          if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
        }
      }
    } else if (cmd === 'trackChanged' && value !== undefined) {
      currentRoomState.currentAudioIndex = Number(value);
    } else if (cmd === 'next') {
      if (!currentRoomState.audioStreamUrl && audioItems.length > 0) {
        aIsPaused = false;
        const shuffle = Boolean(currentRoomState.audioShuffle || (audioPlaylist && audioPlaylist.shuffle));
        if (shuffle && audioItems.length > 1) {
          let nextIdx = aIndex;
          while (nextIdx === aIndex) {
            nextIdx = Math.floor(Math.random() * audioItems.length);
          }
          aIndex = nextIdx;
        } else {
          aIndex = (aIndex + 1) % audioItems.length;
        }
        playNextAudio();
        const btn = document.getElementById('btn-a-play');
        if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
      }
    } else if (cmd === 'prev') {
      if (!currentRoomState.audioStreamUrl && audioItems.length > 0) {
        aIsPaused = false;
        aIndex--; if (aIndex < 0) aIndex = audioItems.length - 1;
        playNextAudio();
        const btn = document.getElementById('btn-a-play');
        if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
      }
    } else if (cmd === 'pause') {
      aIsPaused = true;
      bgmPlayer.pause();
      const btn = document.getElementById('btn-a-play');
      if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
    } else if (cmd === 'play') {
      aIsPaused = false;
      if (currentRoomState.audioStreamUrl && !bgmPlayer.src) {
        bgmPlayer.src = normalizeAudioUrl(currentRoomState.audioStreamUrl);
      }
      bgmPlayer.play().catch(e => console.warn(e));
      const btn = document.getElementById('btn-a-play');
      if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
    }
  } else if (target === 'room') {
    if (cmd === 'setStandby') {
      applyStandbyMode(Boolean(value));
    }
  }
}

// Remote Overlay UI Logic
let remoteTimeoutId = null;
const remoteOverlay = document.getElementById('remote-overlay');

function showRemote() {
  if (!remoteOverlay) return;
  remoteOverlay.classList.add('visible');
  if (remoteTimeoutId) clearTimeout(remoteTimeoutId);
  remoteTimeoutId = setTimeout(() => {
    remoteOverlay.classList.remove('visible');
  }, 3500);
}

document.addEventListener('mousemove', showRemote);
document.addEventListener('touchstart', showRemote);

async function emitCommand(target, cmd, value) {
  try {
    await fetch(`${API_BASE}/api/control/${roomSlug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, command: cmd, value })
    });
  } catch (e) {
    console.error('Failed to emit command', e);
  }
}

document.getElementById('btn-v-prev')?.addEventListener('click', () => emitCommand('visual', 'prev'));
document.getElementById('btn-v-play')?.addEventListener('click', () => emitCommand('visual', vIsPaused ? 'play' : 'pause'));
document.getElementById('btn-v-next')?.addEventListener('click', () => emitCommand('visual', 'next'));
document.getElementById('btn-site-reload')?.addEventListener('click', () => reloadSiteFrame());

document.getElementById('btn-a-prev')?.addEventListener('click', () => emitCommand('audio', 'prev'));
document.getElementById('btn-a-play')?.addEventListener('click', () => emitCommand('audio', aIsPaused ? 'play' : 'pause'));
document.getElementById('btn-a-next')?.addEventListener('click', () => emitCommand('audio', 'next'));

// --- INICIALIZAÇÃO & SINCRONIZAÇÃO SILENCIOSA ---
async function fetchState() {
  try {
    const res = await fetch(`${API_BASE}/api/state/${roomSlug}`);
    const data = await res.json();
    currentRoomState = { ...currentRoomState, ...data };

    // Sincroniza Modo Standby / Blackout
    applyStandbyMode(Boolean(data.standby));

    if (data.audioVolume !== undefined) {
      masterVolume = data.audioVolume;
    }

    const plRes = await fetch(`${API_BASE}/api/playlists`);
    const allPlaylists = await plRes.json();

    // 1. Processa Áudio de Fundo (Stream URL ou Playlist BGM)
    if (data.audioStreamUrl) {
      currentRoomState.audioStreamUrl = data.audioStreamUrl;
      aIsPaused = data.audioStatus === "paused";
      startAudioPlayback();
    } else if (data.audioPlaylist) {
      currentRoomState.audioStreamUrl = null;
      const p = allPlaylists.find(x => x.id === data.audioPlaylist);
      if (p && p.items.length > 0) {
        audioPlaylist = p;
        audioItems = p.items;
        aIndex = 0;
        aIsPaused = data.audioStatus === "paused";
        playNextAudio();
      } else {
        bgmPlayer.pause();
      }
    } else {
      currentRoomState.audioStreamUrl = null;
      audioItems = [];
      bgmPlayer.pause();
    }

    // 2. Processa Modo Site vs Modo Playlist Visual
    if (data.mode === "site" && data.siteUrl) {
      activateSiteMode(data.siteUrl);
    } else {
      deactivateSiteMode();
      if (data.playlist) {
        const p = allPlaylists.find(x => x.id === data.playlist);
        if (p && p.items.length > 0) {
          visualPlaylist = p;
          visualItems = p.items;
          vIndex = 0;
          vIsPaused = data.visualStatus === "paused";
          playNextVisual();
        } else {
          container.innerHTML = '';
          showStatus("Playlist visual vazia.");
        }
      } else {
        visualItems = [];
        container.innerHTML = '';
        showStatus("Sala inativa (Idle).");
      }
    }
  } catch (err) {
    console.error(err);
    showStatus("Erro ao sincronizar estado da sala.");
  }
}

async function updateStateSilently() {
  try {
    const res = await fetch(`${API_BASE}/api/state/${roomSlug}`);
    const data = await res.json();
    const oldState = { ...currentRoomState };
    currentRoomState = { ...currentRoomState, ...data };

    // Sincroniza Modo Standby / Blackout
    if (data.standby !== undefined) {
      applyStandbyMode(Boolean(data.standby));
    }

    // Sincroniza Volume Mestre de Áudio
    if (data.audioVolume !== undefined && data.audioVolume !== masterVolume) {
      setMasterVolume(data.audioVolume);
    }

    const plRes = await fetch(`${API_BASE}/api/playlists`);
    const allPlaylists = await plRes.json();

    // Sincroniza Áudio (Stream URL vs Playlist)
    if (data.audioStreamUrl !== oldState.audioStreamUrl) {
      currentRoomState.audioStreamUrl = data.audioStreamUrl;
      if (data.audioStreamUrl) {
        startAudioPlayback();
      } else {
        bgmPlayer.pause();
        if (data.audioPlaylist) {
          const p = allPlaylists.find(x => x.id === data.audioPlaylist);
          if (p && p.items.length > 0) {
            audioPlaylist = p;
            audioItems = p.items;
            aIndex = 0;
            playNextAudio();
          }
        }
      }
    } else if (!data.audioStreamUrl) {
      // Sincroniza Playlist de Áudio
      if (data.audioPlaylist !== (audioPlaylist ? audioPlaylist.id : null)) {
        if (data.audioPlaylist) {
          const p = allPlaylists.find(x => x.id === data.audioPlaylist);
          if (p && p.items.length > 0) {
            audioPlaylist = p;
            audioItems = p.items;
            aIndex = 0;
            aIsPaused = data.audioStatus === "paused";
            playNextAudio();
          } else {
            audioPlaylist = null;
            audioItems = [];
            bgmPlayer.pause();
          }
        } else {
          audioPlaylist = null;
          audioItems = [];
          bgmPlayer.pause();
        }
      } else if (data.audioPlaylist) {
        // Atualiza itens da playlist de áudio se ela foi editada
        const p = allPlaylists.find(x => x.id === data.audioPlaylist);
        if (p) {
          const wasEmpty = audioItems.length === 0;
          audioPlaylist = p;
          audioItems = p.items || [];
          if (wasEmpty && audioItems.length > 0 && !aIsPaused) {
            aIndex = 0;
            playNextAudio();
          }
        }
      }
    }

    if (data.audioLoopMode !== undefined) currentRoomState.audioLoopMode = data.audioLoopMode;
    if (data.audioShuffle !== undefined) currentRoomState.audioShuffle = data.audioShuffle;

    if (data.audioStatus === "paused" && !aIsPaused) {
      aIsPaused = true;
      bgmPlayer.pause();
    } else if (data.audioStatus === "playing" && aIsPaused) {
      aIsPaused = false;
      if (currentRoomState.audioStreamUrl && !bgmPlayer.src) {
        bgmPlayer.src = normalizeAudioUrl(currentRoomState.audioStreamUrl);
      }
      bgmPlayer.play().catch(e => console.warn(e));
    }

    // Sincroniza Modo Site vs Visual
    if (data.mode === "site" && data.siteUrl) {
      if (oldState.mode !== "site" || oldState.siteUrl !== data.siteUrl) {
        activateSiteMode(data.siteUrl);
      }
    } else {
      // Modo Playlist
      if (oldState.mode === "site") {
        deactivateSiteMode();
      }

      // Verifica alterações na Playlist Visual
      if (data.playlist !== (visualPlaylist ? visualPlaylist.id : null)) {
        if (data.playlist) {
          const p = allPlaylists.find(x => x.id === data.playlist);
          if (p && p.items.length > 0) {
            visualPlaylist = p;
            visualItems = p.items;
            vIndex = 0;
            vIsPaused = data.visualStatus === "paused";
            playNextVisual();
          } else {
            visualPlaylist = null;
            visualItems = [];
            container.innerHTML = '';
            showStatus("Playlist vazia.");
          }
        } else {
          visualPlaylist = null;
          visualItems = [];
          container.innerHTML = '';
          showStatus("Sala inativa (Idle).");
        }
      } else if (data.playlist) {
        // A playlist visual foi atualizada ao vivo
        const p = allPlaylists.find(x => x.id === data.playlist);
        if (p) {
          visualPlaylist = p;
          visualItems = p.items || [];
          if (vIndex >= visualItems.length) {
            vIndex = 0;
            playNextVisual();
          }
        }
      }
    }
  } catch (e) {
    console.error("Hot reload silently failed", e);
  }
}

function showStatus(text) {
  statusEl.textContent = text;
  statusEl.style.display = 'block';
}

let autoReconnect = true;
let clientId = null;
let deviceLabel = null;

function returnToLobby(noticeMessage) {
  console.log("Retornando ao lobby:", noticeMessage);
  autoReconnect = false;

  // 1. Interrompe reproduções imediatamente
  aIsPaused = true;
  bgmPlayer.pause();
  bgmPlayer.src = '';

  if (vTimeoutId) { clearTimeout(vTimeoutId); vTimeoutId = null; }
  if (ytPlayer && ytPlayer.destroy) {
    try { ytPlayer.destroy(); } catch (_e) {}
    ytPlayer = null;
  }
  container.innerHTML = '';
  deactivateSiteMode();

  // 2. Remove o parâmetro ?room= da URL sem recarregar a página
  roomSlug = '';
  window.history.pushState({}, '', window.location.pathname);

  // 3. Exibe o menu do lobby com aviso (sem contagem automática de reconexão se foi retirado)
  showRoomSelection(noticeMessage, true);
}

function connectWebSocket() {
  if (!roomSlug) return;
  const wsUrl = API_BASE.replace('http', 'ws');
  const ws = new WebSocket(`${wsUrl}/ws/${roomSlug}`);
  
  ws.onopen = () => {
    console.log("WebSocket conectado à sala", roomSlug);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "clientAssigned") {
        clientId = data.clientId;
        deviceLabel = data.deviceLabel;
        console.log(`[Player] Conectado como ${deviceLabel} [ID: ${clientId}]`);
      } else if (data.type === "roomFull") {
        autoReconnect = false;
        try { ws.close(4002, "Room Full"); } catch (_e) {}
        showStatus(data.message || "Limite de 2 dispositivos atingido para esta sala.");
        setTimeout(() => returnToLobby(data.message), 3000);
      } else if (data.type === "kickToLobby") {
        autoReconnect = false;
        try { ws.close(4001, "Kicked to lobby"); } catch (_e) {}
        returnToLobby(data.reason || "Você foi retirado da sala pelo administrador.");
      } else if (data.type === "reload") {
        location.reload();
      } else if (data.type === "reloadSite") {
        reloadSiteFrame();
      } else if (data.type === "roomDeleted") {
        showStatus("Esta sala foi excluída no painel.");
        setTimeout(() => returnToLobby("Esta sala foi excluída no painel."), 3000);
      } else if (data.type === "updateState") {
        updateStateSilently();
      } else if (data.type === "control") {
        handleCommand(data.target, data.command, data.value);
      }
    } catch (e) {
      console.warn("WS parse error", e);
    }
  };
  
  ws.onclose = (event) => {
    if (!autoReconnect || event.code === 4001 || event.code === 4002) {
      console.log(`WebSocket desconectado (código ${event.code}). Aguardando no lobby.`);
      return;
    }
    console.warn("WebSocket fechado. Reconectando em 3s...");
    setTimeout(() => {
      if (autoReconnect && roomSlug) {
        connectWebSocket();
      }
    }, 3000);
  };
}

// Interaction Overlay (Desbloqueio de Autoplay)
let overlayShown = false;
function requireUserInteraction(reason) {
  if (overlayShown) return;
  overlayShown = true;
  
  const overlay = document.createElement('div');
  overlay.id = 'interaction-overlay';
  overlay.style = "position:absolute;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:20px;";
  overlay.innerHTML = `
    <h2 style="color:white;font-size:1.5rem;">${reason}</h2>
    <p style="color:#aaa;font-size:1rem;">Navegadores exigem interação para permitir áudio automático.</p>
    <button style="padding:15px 32px;font-size:1.25rem;background:#10b981;color:black;border:none;border-radius:8px;font-weight:bold;cursor:pointer;">Iniciar Mídia</button>
  `;
  
  overlay.querySelector('button').onclick = () => {
    overlay.remove();
    overlayShown = false;
    requestWakeLock();
    // Resumo de Áudio
    if (!aIsPaused) {
      if (currentRoomState.audioStreamUrl || audioItems.length > 0) {
        bgmPlayer.play().catch(e => console.warn(e));
      }
    }
    // Resumo de Vídeo/YouTube
    const vItem = visualItems[vIndex];
    if (vItem && vItem.type === 'youtube' && ytPlayer && ytPlayer.playVideo) {
      ytPlayer.playVideo();
    } else if (vItem && vItem.type === 'video') {
      const vid = container.querySelector('video');
      if (vid) vid.play().catch(e => console.warn(e));
    }
  };
  document.body.appendChild(overlay);
}

// --- BOOTSTRAP ---
requestWakeLock();

if (!roomSlug) {
  showRoomSelection();
} else {
  localStorage.setItem('signage_last_room', roomSlug);
  fetchState();
  connectWebSocket();
}

let reconnectCountdownTimer = null;

async function showRoomSelection(notice, skipCountdown = false) {
  if (reconnectCountdownTimer) {
    clearInterval(reconnectCountdownTimer);
    reconnectCountdownTimer = null;
  }

  showStatus("Carregando salas disponíveis...");
  try {
    const res = await fetch(`${API_BASE}/api/rooms`);
    const rooms = await res.json();
    statusEl.style.display = 'none';

    // Remove menu anterior caso já exista
    const oldMenu = document.querySelector('.room-menu');
    if (oldMenu) oldMenu.remove();
    
    const menu = document.createElement('div');
    menu.className = 'room-menu';

    let noticeHtml = '';
    if (notice) {
      noticeHtml = `<div style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; padding: 12px 16px; border-radius: 8px; font-size: 13px; margin-bottom: 20px; line-height: 1.4; display: flex; align-items: center; gap: 8px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span>${notice}</span></div>`;
    }

    const lastRoomSlug = localStorage.getItem('signage_last_room');
    const lastRoom = (!skipCountdown && !notice && lastRoomSlug) ? rooms.find(r => r.slug === lastRoomSlug) : null;
    const canAutoReconnect = Boolean(lastRoom && (lastRoom.clientsCount ?? 0) < (lastRoom.maxClients ?? 2));

    let autoReconnectHtml = '';
    if (canAutoReconnect) {
      autoReconnectHtml = `
        <div id="auto-reconnect-card" style="background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 10px; padding: 14px 18px; margin-bottom: 22px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
          <div>
            <div style="color: #10b981; font-weight: bold; font-size: 13px; display: flex; align-items: center; gap: 6px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
              <span>Reconexão Automática da TV</span>
            </div>
            <div style="color: #cbd5e1; font-size: 13px; margin-top: 3px;">
              Reconectando a <strong style="color: #fff;">${lastRoom.name}</strong> em <span id="countdown-val" style="color: #10b981; font-weight: bold; font-size: 15px;">5</span>s...
            </div>
          </div>
          <div style="display: flex; gap: 8px; margin-left: auto;">
            <button id="btn-cancel-countdown" style="background: #262626; border: 1px solid #404040; color: #d4d4d4; padding: 8px 14px; border-radius: 6px; font-size: 12px; cursor: pointer;">
              Trocar de Sala
            </button>
            <button id="btn-now-countdown" style="background: #10b981; border: none; color: black; font-weight: bold; padding: 8px 16px; border-radius: 6px; font-size: 12px; cursor: pointer;">
              Entrar Agora
            </button>
          </div>
        </div>
      `;
    }

    menu.innerHTML = `
      ${noticeHtml}
      ${autoReconnectHtml}
      <h1>Lobby - Selecione uma Tela / Sala</h1>
      <p style="color: #888; font-size: 13px; margin-top: -12px; margin-bottom: 24px;">Limite de 2 telas simultâneas por sala</p>
      <div class="room-list"></div>
    `;

    const enterRoom = (room) => {
      if (reconnectCountdownTimer) {
        clearInterval(reconnectCountdownTimer);
        reconnectCountdownTimer = null;
      }
      localStorage.setItem('signage_last_room', room.slug);
      window.history.pushState({}, '', '?room=' + room.slug);
      roomSlug = room.slug;
      autoReconnect = true;
      fetchState();
      connectWebSocket();
      menu.remove();
    };

    if (canAutoReconnect) {
      let secondsRemaining = 5;
      reconnectCountdownTimer = setInterval(() => {
        secondsRemaining--;
        const el = document.getElementById('countdown-val');
        if (el) el.textContent = secondsRemaining;
        if (secondsRemaining <= 0) {
          clearInterval(reconnectCountdownTimer);
          reconnectCountdownTimer = null;
          enterRoom(lastRoom);
        }
      }, 1000);

      menu.querySelector('#btn-cancel-countdown')?.addEventListener('click', () => {
        if (reconnectCountdownTimer) {
          clearInterval(reconnectCountdownTimer);
          reconnectCountdownTimer = null;
        }
        document.getElementById('auto-reconnect-card')?.remove();
      });

      menu.querySelector('#btn-now-countdown')?.addEventListener('click', () => {
        enterRoom(lastRoom);
      });
    }

    const list = menu.querySelector('.room-list');
    
    if (rooms.length === 0) {
      list.innerHTML = '<p style="color: #888; font-size: 14px;">Nenhuma sala configurada no sistema.</p>';
    }
    rooms.forEach(room => {
      const count = room.clientsCount ?? 0;
      const max = room.maxClients ?? 2;
      const isFull = count >= max;

      const btn = document.createElement('button');
      btn.className = 'room-btn';
      if (isFull) {
        btn.style.background = '#262626';
        btn.style.color = '#737373';
        btn.style.border = '1px solid #404040';
      }
      btn.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap: 12px;">
          <span>${room.name}</span>
          <span style="font-size:12px; font-weight:normal; background:rgba(0,0,0,0.4); padding:3px 10px; border-radius:6px; flex-shrink:0;">
            ${count}/${max} telas ${isFull ? '• Cheia' : ''}
          </span>
        </div>
      `;
      btn.onclick = () => {
        if (isFull) {
          alert(`A sala "${room.name}" já atingiu o limite de ${max} telas conectadas. Retire um dispositivo pelo painel ou aguarde uma vaga.`);
          return;
        }
        enterRoom(room);
      };
      list.appendChild(btn);
    });
    document.body.appendChild(menu);
  } catch (_e) {
    showStatus("Erro ao conectar ao servidor.");
  }
}
