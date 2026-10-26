// Global error handler para Smart TVs (evita tela preta silenciosa)
window.onerror = function(msg, url, line, col, error) {
  console.error("Player Error:", msg, line, col, error);
  var statusDiv = document.getElementById('status');
  if (statusDiv) {
    statusDiv.style.display = 'block';
    statusDiv.style.background = '#7f1d1d';
    statusDiv.style.color = '#fecaca';
    statusDiv.innerHTML = '<div style="font-weight:bold;margin-bottom:4px;">Aviso do Player:</div><div style="font-size:12px;">' + (msg || 'Erro ao carregar') + '</div><button onclick="window.location.reload()" style="margin-top:8px;padding:6px 12px;background:#fff;color:#000;border:none;border-radius:4px;cursor:pointer;font-weight:bold;font-size:11px;">Recarregar Tela</button>';
  }
  return false;
};

function safeGetStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function safeSetStorage(key, val) {
  try {
    localStorage.setItem(key, val);
  } catch (e) {}
}

function generateHardwareFingerprint() {
  try {
    var components = [];
    if (typeof navigator !== 'undefined') {
      components.push(navigator.userAgent || '');
      components.push(navigator.platform || '');
      components.push(navigator.hardwareConcurrency || '');
      components.push(navigator.language || '');
    }
    if (typeof screen !== 'undefined') {
      components.push(screen.width + 'x' + screen.height + 'x' + screen.colorDepth);
    }
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      try {
        components.push(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
      } catch (_e) {}
    }
    try {
      var canvas = document.createElement('canvas');
      var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        var debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          components.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '');
        }
      }
    } catch (_e) {}

    var str = components.join('|||');
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    var hex = (hash >>> 0).toString(16);
    while (hex.length < 8) hex = '0' + hex;

    var prefix = 'dev_';
    var ua = (typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '').toLowerCase();
    if (ua.indexOf('tizen') !== -1) prefix = 'samsung_';
    else if (ua.indexOf('webos') !== -1 || ua.indexOf('netcast') !== -1) prefix = 'lg_';
    else if (ua.indexOf('android') !== -1 && ua.indexOf('tv') !== -1) prefix = 'androidtv_';
    else if (ua.indexOf('windows') !== -1) prefix = 'pc_';
    else if (ua.indexOf('macintosh') !== -1 || ua.indexOf('mac os') !== -1) prefix = 'mac_';
    else if (ua.indexOf('linux') !== -1) prefix = 'linux_';

    return prefix + hex;
  } catch (_e) {
    return 'dev_' + Math.random().toString(36).substring(2, 10);
  }
}

function getPersistentDeviceId() {
  var id = safeGetStorage('signage_device_id');
  if (!id) {
    try {
      if (typeof document !== 'undefined' && document.cookie) {
        var match = document.cookie.match(/(?:^|; )signage_device_id=([^;]*)/);
        if (match && match[1]) {
          id = decodeURIComponent(match[1]);
        }
      }
    } catch (_e) {}
  }
  if (!id) {
    id = generateHardwareFingerprint();
  }
  safeSetStorage('signage_device_id', id);
  try {
    if (typeof document !== 'undefined') {
      document.cookie = 'signage_device_id=' + encodeURIComponent(id) + '; max-age=315360000; path=/; SameSite=Lax';
    }
  } catch (e) {}
  return id;
}

const currentDeviceId = getPersistentDeviceId();

function playIdentifyChime() {
  try {
    var AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    var ctx = new AudioContextClass();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.65);
  } catch (_e) {}
}

var identifyTimer = null;
function showDeviceIdentifyOverlay(info) {
  var overlay = document.getElementById('device-identify-overlay');
  if (!overlay) return;

  playIdentifyChime();

  var titleEl = document.getElementById('identify-modal-title');
  var idEl = document.getElementById('identify-modal-id');
  var roomEl = document.getElementById('identify-modal-room');
  var ipEl = document.getElementById('identify-modal-ip');
  var resEl = document.getElementById('identify-modal-res');
  var secEl = document.getElementById('identify-timer-sec');

  if (titleEl) titleEl.textContent = info.name || "Aparelho Identificado";
  if (idEl) idEl.textContent = info.deviceId || currentDeviceId;
  if (roomEl) roomEl.textContent = info.room || (roomSlug ? roomSlug : "Nenhuma (Lobby)");
  if (ipEl) ipEl.textContent = info.ip || window.location.hostname;
  if (resEl) resEl.textContent = window.innerWidth + " x " + window.innerHeight;

  overlay.classList.add('visible');

  var remaining = info.duration || 15;
  if (secEl) secEl.textContent = remaining;

  if (identifyTimer) clearInterval(identifyTimer);
  identifyTimer = setInterval(function() {
    remaining--;
    if (secEl) secEl.textContent = remaining;
    if (remaining <= 0) {
      clearInterval(identifyTimer);
      identifyTimer = null;
      overlay.classList.remove('visible');
    }
  }, 1000);

  overlay.onclick = function() {
    if (identifyTimer) {
      clearInterval(identifyTimer);
      identifyTimer = null;
    }
    overlay.classList.remove('visible');
  };
}

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

// Player de Áudio Centralizado (conecta ao elemento do DOM)
let bgmPlayer = document.getElementById('bgm-player');
if (!bgmPlayer) {
  bgmPlayer = document.createElement('audio');
  bgmPlayer.id = 'bgm-player';
  bgmPlayer.preload = 'auto';
  bgmPlayer.crossOrigin = 'anonymous';
  bgmPlayer.playsInline = true;
  document.body.appendChild(bgmPlayer);
} else {
  bgmPlayer.preload = 'auto';
  bgmPlayer.crossOrigin = 'anonymous';
  bgmPlayer.playsInline = true;
}

// Controle de Desbloqueio Definitivo de Áudio (Autoplay Bypass)
let isAudioUnlocked = safeGetStorage('signage_audio_unlocked') === 'true';
let consecutiveAudioErrors = 0;
let audioRetryTimeout = null;

function unlockAudioSubsystem() {
  isAudioUnlocked = true;
  safeSetStorage('signage_audio_unlocked', 'true');
  console.log("[Audio] Subsistema de áudio desbloqueado com sucesso.");

  // 1. Desbloqueia Web Audio Context nativo
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      if (!window._masterAudioCtx) {
        window._masterAudioCtx = new AudioCtx();
      }
      if (window._masterAudioCtx.state === 'suspended') {
        window._masterAudioCtx.resume();
      }
      const buffer = window._masterAudioCtx.createBuffer(1, 1, 22050);
      const source = window._masterAudioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(window._masterAudioCtx.destination);
      source.start(0);
    }
  } catch (err) {
    console.warn("[AudioContext Unlock] Aviso:", err);
  }

  // 2. Desmuta o player principal e retoma som se necessário
  try {
    bgmPlayer.muted = false;
    if (!aIsPaused) {
      if (currentPlayingAudioType === 'yt') {
        if (ytAudioPlayer && ytAudioPlayer.unMute) ytAudioPlayer.unMute();
        if (ytAudioPlayer && ytAudioPlayer.playVideo) ytAudioPlayer.playVideo();
      } else if (currentRoomState.audioStreamUrl || audioItems.length > 0) {
        bgmPlayer.play().catch(e => console.warn("[bgmPlayer Play on Unlock]:", e));
      }
    }
  } catch (_e) {}

  // 3. Remove overlay de interação se estiver na tela
  const overlay = document.getElementById('interaction-overlay');
  if (overlay) {
    overlay.remove();
    overlayShown = false;
  }
}

// Qualquer toque, clique ou tecla em qualquer lugar da tela desbloqueia o áudio permanentemente
// Usamos capture: true para garantir captura antes de qualquer parada de propagação
['click', 'touchstart', 'keydown', 'pointerdown'].forEach(evt => {
  window.addEventListener(evt, unlockAudioSubsystem, { capture: true, passive: true });
  document.addEventListener(evt, unlockAudioSubsystem, { capture: true, passive: true });
});

bgmPlayer.onended = () => {
  if (aIsPaused) {
    console.log("[Audio] onended ignorado pois o áudio está pausado.");
    return;
  }
  if (currentPlayingAudioType !== 'html5') return;
  if (!bgmPlayer.src || !bgmPlayer.currentSrc) return;
  // Só considera finalizado se tocou por pelo menos 3 segundos (não foi corte/aborto de stream)
  if (bgmPlayer.currentTime < 3) {
    console.warn(`[Audio] onended ignorado: currentTime (${bgmPlayer.currentTime.toFixed(1)}s) < 3s.`);
    return;
  }
  // Se a duração total é conhecida e ainda falta mais de 5s, é corte de conexão, não fim
  if (bgmPlayer.duration && !isNaN(bgmPlayer.duration) && bgmPlayer.duration > 15) {
    if (bgmPlayer.currentTime < bgmPlayer.duration - 5) {
      console.warn(`[Audio] onended prematuro ignorado (${bgmPlayer.currentTime.toFixed(1)}s de ${bgmPlayer.duration.toFixed(1)}s).`);
      return;
    }
  }
  if (!currentRoomState.audioStreamUrl) {
    handleAudioEnded();
  }
};

bgmPlayer.onplaying = () => {
  consecutiveAudioErrors = 0;
};

bgmPlayer.onerror = (e) => {
  // Ignora se o áudio estiver pausado ou sem fonte
  if (aIsPaused) return;
  if (currentPlayingAudioType !== 'html5') return;
  if (!bgmPlayer.currentSrc && !bgmPlayer.getAttribute('src')) return;
  if (!bgmPlayer.src || bgmPlayer.src === window.location.href || bgmPlayer.src === "") return;

  const errCode = bgmPlayer.error ? bgmPlayer.error.code : 0;
  const errMsg = bgmPlayer.error ? bgmPlayer.error.message : "";
  console.warn(`[Audio Error] Código ${errCode}: ${errMsg}`, e);

  // Se falhou ao tocar uma faixa da playlist no HTML5:
  // Se for uma URL do YouTube stream (/api/youtube/stream/:ytId), tenta fallback no iframe do YT antes de desistir
  const currentSrc = bgmPlayer.currentSrc || bgmPlayer.src || "";
  const ytStreamMatch = currentSrc.match(/\/api\/youtube\/stream\/([a-zA-Z0-9_-]{11})/);
  if (ytStreamMatch && ytStreamMatch[1]) {
    console.log(`[Audio Fallback] Stream falhou para ${ytStreamMatch[1]}, acionando iframe do YouTube...`);
    playYoutubeIframe(ytStreamMatch[1]);
    return;
  }

  consecutiveAudioErrors++;
  if (consecutiveAudioErrors >= 3) {
    console.error("[Audio] Falhas consecutivas de áudio. Pausando para evitar avanço infinito.");
    if (audioRetryTimeout) {
      clearTimeout(audioRetryTimeout);
      audioRetryTimeout = null;
    }
    pauseCurrentAudio();
    consecutiveAudioErrors = 0;
    return;
  }

  if (currentRoomState.audioStreamUrl) {
    console.log("Tentando reconectar stream de áudio em 3s...");
    if (audioRetryTimeout) clearTimeout(audioRetryTimeout);
    audioRetryTimeout = setTimeout(() => {
      if (currentRoomState.audioStreamUrl && !aIsPaused) {
        bgmPlayer.src = normalizeAudioUrl(currentRoomState.audioStreamUrl);
        bgmPlayer.play().catch(() => {});
      }
    }, 3000);
  }
};

function handleAudioEnded() {
  if (aIsPaused || isStandbyActive) {
    console.log("[Audio] handleAudioEnded ignorado pois o áudio está pausado ou em standby.");
    return;
  }
  if (audioItems.length === 0) {
    pauseCurrentAudio();
    return;
  }
  
  const loopMode = currentRoomState.audioLoopMode || (audioPlaylist && audioPlaylist.loopMode) || "all";
  const shuffle = Boolean(currentRoomState.audioShuffle || (audioPlaylist && audioPlaylist.shuffle));

  if (loopMode === "one") {
    if (currentPlayingAudioType === 'yt') {
      if (ytAudioPlayer && ytAudioPlayer.seekTo) {
        ytAudioPlayer.seekTo(0);
        ytAudioPlayer.playVideo();
      }
    } else {
      bgmPlayer.currentTime = 0;
      bgmPlayer.play().catch(() => {});
    }
    return;
  }

  if (shuffle && audioItems.length > 1) {
    let nextIdx = aIndex;
    while (nextIdx === aIndex) {
      nextIdx = Math.floor(Math.random() * audioItems.length);
    }
    aIndex = nextIdx;
    currentRoomState.currentAudioIndex = aIndex;
    playNextAudio();
    emitCommand('audio', 'trackChanged', aIndex);
    return;
  }

  aIndex++;
  if (aIndex >= audioItems.length) {
    if (loopMode === "none") {
      pauseCurrentAudio();
      return;
    }
    aIndex = 0;
  }
  currentRoomState.currentAudioIndex = aIndex;
  playNextAudio();
  emitCommand('audio', 'trackChanged', aIndex);
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
      if (ytAudioPlayer && ytAudioPlayer.setVolume) {
        try { ytAudioPlayer.setVolume(Math.round(targetVolume * 100)); } catch (_e) {}
      }
      clearInterval(duckingInterval);
    } else {
      const nextVol = Math.max(0, Math.min(1, current + ((targetVolume > current) ? 0.05 : -0.05)));
      bgmPlayer.volume = nextVol;
      if (ytAudioPlayer && ytAudioPlayer.setVolume) {
        try { ytAudioPlayer.setVolume(Math.round(nextVol * 100)); } catch (_e) {}
      }
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
  if (aIsPaused) {
    syncAudioVolume();
  } else {
    fadeBgmVolume(calculateTargetAudioVolume());
  }
}

function getAudioYoutubeId(url) {
  if (!url) return null;
  const clean = url.trim();
  if (clean.startsWith("youtube:")) {
    const id = clean.replace("youtube:", "").trim();
    return id.length === 11 ? id : null;
  }
  return extractYtId(clean);
}

function normalizeAudioUrl(url) {
  if (!url) return url;
  let clean = url.trim();

  // Se já for uma URL do proxy interno do backend, retorna direto
  if (clean.includes("/api/youtube/stream/")) {
    return clean.startsWith("http") ? clean : `${API_BASE}${clean}`;
  }

  // Google Drive: converte link de compartilhamento para streaming direto
  const gdriveMatch = clean.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (gdriveMatch) {
    return `https://drive.google.com/uc?export=download&id=${gdriveMatch[1]}`;
  }
  return clean;
}

let ytAudioPlayer = null;
let currentPlayingAudioType = null; // 'yt' | 'html5' | null

function pauseCurrentAudio() {
  if (!bgmPlayer.paused) {
    bgmPlayer.pause();
  }
  if (ytAudioPlayer && ytAudioPlayer.pauseVideo) {
    try { ytAudioPlayer.pauseVideo(); } catch (_e) {}
  }
}

function resumeCurrentAudio() {
  if (isStandbyActive) return;
  syncAudioVolume();
  if (currentPlayingAudioType === 'yt') {
    if (ytAudioPlayer && ytAudioPlayer.playVideo) {
      try { ytAudioPlayer.playVideo(); } catch (_e) {}
    } else {
      startAudioPlayback();
    }
  } else if (bgmPlayer.src && bgmPlayer.src !== window.location.href) {
    bgmPlayer.play().catch(e => {
      console.warn("[Audio] resume play falhou, reiniciando faixa:", e);
      startAudioPlayback();
    });
  } else {
    startAudioPlayback();
  }
}

function syncAudioVolume() {
  const targetRatio = calculateTargetAudioVolume();
  bgmPlayer.volume = targetRatio;
  if (ytAudioPlayer && ytAudioPlayer.setVolume) {
    try { ytAudioPlayer.setVolume(Math.round(targetRatio * 100)); } catch (_e) {}
  }
}

let consecutiveYtErrors = 0;

function playYoutubeIframe(ytId) {
  currentPlayingAudioType = 'yt';
  if (!bgmPlayer.paused) {
    try { bgmPlayer.pause(); } catch (_e) {}
  }
  bgmPlayer.removeAttribute('src');

  if (audioRetryTimeout) {
    clearTimeout(audioRetryTimeout);
    audioRetryTimeout = null;
  }

  const targetVol = Math.round(calculateTargetAudioVolume() * 100);

  if (!isYtReady) {
    setTimeout(() => playYoutubeIframe(ytId), 150);
    return;
  }

  if (!ytAudioPlayer) {
    const container = document.getElementById('yt-audio-player');
    if (!container) {
      const c = document.createElement('div');
      c.id = 'yt-audio-container';
      c.style = 'position:fixed;bottom:0;right:0;width:240px;height:180px;opacity:0.005;pointer-events:none;z-index:0;overflow:hidden;';
      c.innerHTML = '<div id="yt-audio-player"></div>';
      document.body.appendChild(c);
    }

    try {
      ytAudioPlayer = new YT.Player('yt-audio-player', {
        height: '180',
        width: '240',
        videoId: ytId,
        playerVars: {
          'autoplay': 1,
          'controls': 0,
          'disablekb': 1,
          'fs': 0,
          'rel': 0,
          'playsinline': 1,
        },
        events: {
          'onReady': (event) => {
            event.target.setVolume(targetVol);
            if (!aIsPaused) {
              event.target.playVideo();
            }
          },
          'onStateChange': (event) => {
            if (event.data === YT.PlayerState.PLAYING) {
              consecutiveYtErrors = 0;
            } else if (event.data === YT.PlayerState.ENDED) {
              consecutiveYtErrors = 0;
              if (aIsPaused) {
                console.log("[YT Audio] ENDED ignorado pois áudio está pausado.");
                return;
              }
              if (currentPlayingAudioType === 'yt') {
                let curTime = 0;
                let dur = 0;
                try {
                  curTime = ytAudioPlayer.getCurrentTime ? ytAudioPlayer.getCurrentTime() : 0;
                  dur = ytAudioPlayer.getDuration ? ytAudioPlayer.getDuration() : 0;
                } catch (_e) {}
                if (curTime < 3 || (dur > 10 && curTime < dur - 5)) {
                  console.warn(`[YT Audio] ENDED prematuro ignorado (${curTime.toFixed(1)}s de ${dur.toFixed(1)}s).`);
                  return;
                }
                if (!currentRoomState.audioStreamUrl) {
                  handleAudioEnded();
                } else {
                  event.target.playVideo();
                }
              }
            }
          },
          'onError': (event) => {
            consecutiveYtErrors++;
            console.warn(`[YT Audio Iframe] Erro ${event.data} no vídeo ${ytId} (Falhas consecutivas: ${consecutiveYtErrors})`);

            if (consecutiveYtErrors >= 3) {
              console.error("[YT Audio] 3 falhas consecutivas no YouTube. Pausando para evitar avanço infinito.");
              pauseCurrentAudio();
              consecutiveYtErrors = 0;
            }
          }
        }
      });
    } catch (e) {
      console.warn("[YT Audio] Falha ao instanciar player iframe:", e);
    }
  } else {
    try {
      ytAudioPlayer.setVolume(targetVol);
      if (aIsPaused) {
        if (ytAudioPlayer.cueVideoById) {
          ytAudioPlayer.cueVideoById(ytId);
        } else if (ytAudioPlayer.pauseVideo) {
          ytAudioPlayer.pauseVideo();
        }
      } else {
        if (ytAudioPlayer.loadVideoById) {
          ytAudioPlayer.loadVideoById(ytId);
        }
      }
    } catch (e) {
      console.warn("[YT Audio] Falha ao carregar faixa no iframe:", e);
    }
  }
}

function playYoutubeAudio(ytId) {
  if (audioRetryTimeout) {
    clearTimeout(audioRetryTimeout);
    audioRetryTimeout = null;
  }

  // Se o iframe estiver rodando, pausa
  if (ytAudioPlayer && ytAudioPlayer.pauseVideo) {
    try { ytAudioPlayer.pauseVideo(); } catch (_e) {}
  }

  // Prioridade 1: Toca diretamente via streaming de áudio nativo do backend
  currentPlayingAudioType = 'html5';
  const streamUrl = `${API_BASE}/api/youtube/stream/${ytId}`;
  if (bgmPlayer.src !== streamUrl) {
    bgmPlayer.src = streamUrl;
  }
  bgmPlayer.volume = calculateTargetAudioVolume();

  if (!aIsPaused && !isStandbyActive) {
    const p = bgmPlayer.play();
    if (p !== undefined) {
      p.then(() => {
        consecutiveAudioErrors = 0;
        console.log(`[YT Audio] Streaming nativo iniciado para ${ytId}`);
      }).catch((err) => {
        // Ignora AbortError causado por troca rápida de faixa
        if (err && err.name === "AbortError") {
          return;
        }
        // Se uma outra faixa já assumiu o player, ignora erro da faixa antiga
        if (bgmPlayer.src && !bgmPlayer.src.includes(ytId)) {
          return;
        }
        console.warn("[YT Audio] Play nativo bloqueado ou indisponível:", err);
        if (err && err.name === "NotAllowedError") {
          isAudioUnlocked = false;
          bgmPlayer.muted = true;
          bgmPlayer.play().catch(() => {});
          requireUserInteraction("Clique para Iniciar o Áudio");
          return;
        }
        // Fallback para iframe apenas se for erro real de rede/codec na faixa atual
        playYoutubeIframe(ytId);
      });
    }
  }
}

function startAudioPlayback() {
  if (audioRetryTimeout) {
    clearTimeout(audioRetryTimeout);
    audioRetryTimeout = null;
  }

  if (currentRoomState.audioStreamUrl) {
    const rawSrc = currentRoomState.audioStreamUrl;
    const ytId = getAudioYoutubeId(rawSrc);

    if (ytId) {
      playYoutubeAudio(ytId);
      return;
    }

    // Áudio normal HTML5 (MP3 / Web Rádio / Stream direto)
    currentPlayingAudioType = 'html5';
    if (ytAudioPlayer && ytAudioPlayer.pauseVideo) {
      try { ytAudioPlayer.pauseVideo(); } catch (_e) {}
    }

    const src = normalizeAudioUrl(rawSrc);
    if (bgmPlayer.src !== src) {
      bgmPlayer.src = src;
    }
    bgmPlayer.volume = calculateTargetAudioVolume();
    if (!aIsPaused && !isStandbyActive) {
      const p = bgmPlayer.play();
      if (p !== undefined) {
        p.catch(e => {
          if (e && e.name === "AbortError") return;
          console.warn("Audio stream play blocked:", e);
          if (e && e.name === "NotAllowedError") {
            isAudioUnlocked = false;
            bgmPlayer.muted = true;
            bgmPlayer.play().catch(() => {});
            requireUserInteraction("Clique para Iniciar o Áudio / Rádio");
          }
        });
      }
    }
  } else {
    playNextAudio();
  }
}

function playNextAudio() {
  if (audioRetryTimeout) {
    clearTimeout(audioRetryTimeout);
    audioRetryTimeout = null;
  }

  if (currentRoomState.audioStreamUrl) {
    startAudioPlayback();
    return;
  }

  if (audioItems.length === 0) {
    pauseCurrentAudio();
    return;
  }
  
  if (aIndex >= audioItems.length || aIndex < 0) {
    if (audioPlaylist && audioPlaylist.loop !== false) {
      aIndex = 0;
    } else {
      pauseCurrentAudio();
      return;
    }
  }

  const item = audioItems[aIndex];
  if (!item) return;
  const rawSrc = item.url.startsWith('http') ? item.url : `${API_BASE}${item.url}`;
  const ytId = getAudioYoutubeId(rawSrc);

  if (ytId) {
    playYoutubeAudio(ytId);
    return;
  }

  // Áudio normal HTML5 (MP3 / URL de áudio)
  currentPlayingAudioType = 'html5';
  if (ytAudioPlayer && ytAudioPlayer.pauseVideo) {
    try { ytAudioPlayer.pauseVideo(); } catch (_e) {}
  }

  const src = normalizeAudioUrl(rawSrc);
  if (bgmPlayer.src !== src) {
    bgmPlayer.src = src;
  }
  
  bgmPlayer.volume = calculateTargetAudioVolume();

  if (!aIsPaused && !isStandbyActive) {
    const p = bgmPlayer.play();
    if (p !== undefined) {
      p.catch(e => {
        if (e && e.name === "AbortError") return;
        console.warn("BGM autoplay blocked:", e);
        if (e && e.name === "NotAllowedError") {
          isAudioUnlocked = false;
          bgmPlayer.muted = true;
          bgmPlayer.play().catch(() => {});
          requireUserInteraction("Clique para Iniciar o Áudio");
        }
      });
    }
  }
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

// --- MODO STANDBY / BLACKOUT COM RELÓGIO, DATA E CLIMA (Uberaba - MG) ---
const STANDBY_SVGS = {
  sun: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,
  moon: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
  cloudSun: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fcd34d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/></svg>`,
  cloudMoon: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#bfdbfe" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.188 8.5A6 6 0 0 1 16 4a6 6 0 0 0-6 6c0 1.25.383 2.41 1.036 3.376"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/></svg>`,
  cloud: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`,
  cloudRain: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>`,
  cloudLightning: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973"/><path d="m13 12-3 5h4l-3 5"/></svg>`,
  cloudFog: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 17H7"/><path d="M17 21H9"/></svg>`,
};

function getStandbyWeatherVisuals(code, isDay) {
  if (code === 0) {
    return {
      description: isDay ? "Céu limpo" : "Noite estrelada",
      iconSvg: isDay ? STANDBY_SVGS.sun : STANDBY_SVGS.moon,
    };
  }
  if (code === 1 || code === 2) {
    return {
      description: "Parcialmente nublado",
      iconSvg: isDay ? STANDBY_SVGS.cloudSun : STANDBY_SVGS.cloudMoon,
    };
  }
  if (code === 3) {
    return {
      description: "Nublado",
      iconSvg: STANDBY_SVGS.cloud,
    };
  }
  if (code === 45 || code === 48) {
    return {
      description: "Nevoeiro",
      iconSvg: STANDBY_SVGS.cloudFog,
    };
  }
  if (code >= 51 && code <= 57) {
    return {
      description: "Garoa / Chuvisco",
      iconSvg: STANDBY_SVGS.cloudRain,
    };
  }
  if (code >= 61 && code <= 67) {
    return {
      description: code >= 65 ? "Chuva forte" : "Chuva",
      iconSvg: STANDBY_SVGS.cloudRain,
    };
  }
  if (code >= 80 && code <= 82) {
    return {
      description: "Pancadas de chuva",
      iconSvg: STANDBY_SVGS.cloudRain,
    };
  }
  if (code >= 95) {
    return {
      description: "Tempestade",
      iconSvg: STANDBY_SVGS.cloudLightning,
    };
  }
  return {
    description: "Tempo estável",
    iconSvg: isDay ? STANDBY_SVGS.sun : STANDBY_SVGS.moon,
  };
}

function formatStandbyDate(date) {
  const weekdayNames = [
    "Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira",
    "Quinta-feira", "Sexta-feira", "Sábado"
  ];
  const monthNames = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
  ];
  return `${weekdayNames[date.getDay()]}, ${date.getDate()} de ${monthNames[date.getMonth()]} de ${date.getFullYear()}`;
}

function tickStandbyClock() {
  const now = new Date();
  const hm = document.getElementById('standby-clock-hm');
  const sec = document.getElementById('standby-clock-sec');
  const dateEl = document.getElementById('standby-date');
  if (hm) {
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    hm.textContent = `${hours}:${minutes}`;
  }
  if (sec) {
    sec.textContent = `:${String(now.getSeconds()).padStart(2, '0')}`;
  }
  if (dateEl) {
    dateEl.textContent = formatStandbyDate(now);
  }
}

function shiftStandbyAntiBurnIn() {
  const content = document.getElementById('standby-content');
  if (!content) return;
  // Deslocamento sutil entre -15px e +15px para proteção contínua de painéis OLED/LED
  const x = Math.floor(Math.random() * 31) - 15;
  const y = Math.floor(Math.random() * 21) - 10;
  content.style.transform = `translate(${x}px, ${y}px)`;
}

let lastStandbyWeatherFetch = 0;
async function fetchStandbyWeather(force = false) {
  const now = Date.now();
  if (!force && now - lastStandbyWeatherFetch < 10 * 60 * 1000) {
    return;
  }
  lastStandbyWeatherFetch = now;

  let weather = null;
  // 1. Tenta buscar pelo backend local (/api/weather/uberaba com cache de 15 min)
  try {
    const res = await fetch(`${API_BASE}/api/weather/uberaba`);
    if (res.ok) {
      weather = await res.json();
    }
  } catch (err) {
    console.warn("Falha ao consultar clima pelo backend, tentando rota direta:", err);
  }

  // 2. Fallback direto caso o backend falhe
  if (!weather || weather.temperature === null || weather.temperature === undefined) {
    try {
      const url = "https://api.open-meteo.com/v1/forecast?latitude=-19.7483&longitude=-47.9319&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=America%2FSao_Paulo&forecast_days=1";
      const directRes = await fetch(url);
      if (directRes.ok) {
        const raw = await directRes.json();
        var cur = raw && raw.current ? raw.current : {};
        var dly = raw && raw.daily ? raw.daily : {};
        var maxArr = dly.temperature_2m_max;
        var minArr = dly.temperature_2m_min;
        weather = {
          city: "Uberaba",
          state: "MG",
          temperature: Math.round(cur.temperature_2m !== undefined ? cur.temperature_2m : 0),
          apparentTemperature: Math.round(cur.apparent_temperature !== undefined ? cur.apparent_temperature : 0),
          humidity: Math.round(cur.relative_humidity_2m !== undefined ? cur.relative_humidity_2m : 0),
          weatherCode: cur.weather_code !== undefined ? cur.weather_code : 0,
          isDay: cur.is_day !== undefined ? cur.is_day : 1,
          tempMax: Math.round(maxArr && maxArr[0] !== undefined ? maxArr[0] : (cur.temperature_2m || 0)),
          tempMin: Math.round(minArr && minArr[0] !== undefined ? minArr[0] : (cur.temperature_2m || 0)),
        };
      }
    } catch (e) {
      console.error("Falha ao obter clima diretamente de Open-Meteo:", e);
    }
  }

  if (!weather || weather.temperature === null || weather.temperature === undefined) {
    var descEl = document.getElementById('standby-weather-desc');
    if (descEl) descEl.textContent = "Clima indisponível";
    return;
  }

  var visuals = getStandbyWeatherVisuals(weather.weatherCode, weather.isDay !== 0);

  var iconEl = document.getElementById('standby-weather-icon');
  var tempEl = document.getElementById('standby-weather-temp');
  var descEl = document.getElementById('standby-weather-desc');
  var feelsEl = document.getElementById('standby-weather-feels');
  var maxEl = document.getElementById('standby-temp-max');
  var minEl = document.getElementById('standby-temp-min');
  var humEl = document.getElementById('standby-humidity');

  if (iconEl) iconEl.innerHTML = visuals.iconSvg;
  if (tempEl) tempEl.textContent = weather.temperature + "°";
  if (descEl) descEl.textContent = visuals.description;
  var feelsTemp = (weather.apparentTemperature !== undefined && weather.apparentTemperature !== null) ? weather.apparentTemperature : weather.temperature;
  if (feelsEl) feelsEl.textContent = "Sensação " + feelsTemp + "°C";
  if (maxEl) maxEl.textContent = weather.tempMax + "°";
  if (minEl) minEl.textContent = weather.tempMin + "°";
  if (humEl) humEl.textContent = weather.humidity + "%";
}

let isStandbyActive = false;
let standbyClockInterval = null;
let standbyWeatherInterval = null;
let standbyJitterInterval = null;

function applyStandbyMode(active) {
  isStandbyActive = active;
  let overlay = document.getElementById('standby-blackout-overlay');
  
  if (active) {
    if (overlay) {
      overlay.style.display = 'flex';
      void overlay.offsetWidth;
      overlay.classList.add('standby-visible');
    }

    // Inicia relógio imediatamente e configura intervalo de 1s
    tickStandbyClock();
    if (standbyClockInterval) clearInterval(standbyClockInterval);
    standbyClockInterval = setInterval(tickStandbyClock, 1000);

    // Consulta clima imediatamente e a cada 10 minutos
    fetchStandbyWeather();
    if (standbyWeatherInterval) clearInterval(standbyWeatherInterval);
    standbyWeatherInterval = setInterval(() => fetchStandbyWeather(), 10 * 60 * 1000);

    // Anti-burn-in jitter a cada 2.5 minutos
    if (standbyJitterInterval) clearInterval(standbyJitterInterval);
    standbyJitterInterval = setInterval(shiftStandbyAntiBurnIn, 150000);

    // Pausa som de fundo
    pauseCurrentAudio();
  } else {
    if (overlay) {
      overlay.classList.remove('standby-visible');
      setTimeout(() => {
        if (!isStandbyActive && overlay) {
          overlay.style.display = 'none';
        }
      }, 600);
    }

    if (standbyClockInterval) {
      clearInterval(standbyClockInterval);
      standbyClockInterval = null;
    }
    if (standbyWeatherInterval) {
      clearInterval(standbyWeatherInterval);
      standbyWeatherInterval = null;
    }
    if (standbyJitterInterval) {
      clearInterval(standbyJitterInterval);
      standbyJitterInterval = null;
    }

    // Restaura áudio caso não esteja pausado pelo operador
    if (!aIsPaused && (currentRoomState.audioStreamUrl || audioItems.length > 0)) {
      resumeCurrentAudio();
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

  // Monitoramento quando reproduzindo YouTube
  if (currentPlayingAudioType === 'yt') {
    if (ytAudioPlayer && ytAudioPlayer.getPlayerState) {
      try {
        const state = ytAudioPlayer.getPlayerState();
        // BUFFERING = 3
        if (state === 3) {
          audioStallSecs += 3;
          if (audioStallSecs >= 18) {
            console.warn("[Audio Watchdog] Buffering de YouTube prolongado (18s). Retomando...");
            audioStallSecs = 0;
            ytAudioPlayer.playVideo();
          }
        } else {
          audioStallSecs = 0;
        }
      } catch (_e) {}
    }
    return;
  }

  // Detecta se o navegador pausou o áudio em background
  if (bgmPlayer.paused && !aIsPaused && !isStandbyActive && bgmPlayer.src) {
    audioStallSecs += 3;
    if (audioStallSecs >= 6) {
      console.log("[Audio Watchdog] Áudio pausado involuntariamente pelo sistema. Retomando...");
      bgmPlayer.play().catch(e => console.warn("[Watchdog] Play:", e));
      audioStallSecs = 0;
    }
    return;
  }

  // Detecta se a posição do áudio HTML5 congelou no mesmo ponto (buffering infinito)
  if (currentPlayingAudioType === 'html5' && !bgmPlayer.paused) {
    const currentPos = bgmPlayer.currentTime;
    if (currentPos > 1 && Math.abs(currentPos - lastObservedAudioTime) < 0.15) {
      audioStallSecs += 3;
      if (audioStallSecs >= 20) {
        console.warn(`[Audio Watchdog] Buffering de áudio travado em ${currentPos.toFixed(1)}s. Retomando reprodução...`);
        audioStallSecs = 0;
        lastObservedAudioTime = -1;
        bgmPlayer.play().catch(() => {});
      }
    } else {
      audioStallSecs = 0;
      lastObservedAudioTime = currentPos;
    }
  } else {
    audioStallSecs = 0;
    lastObservedAudioTime = -1;
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
                if (!isAudioUnlocked && ytPlayer && ytPlayer.getPlayerState && ytPlayer.getPlayerState() === YT.PlayerState.UNSTARTED) {
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
      if (e && e.name === "NotAllowedError" && !isAudioUnlocked) {
        requireUserInteraction("Clique para Iniciar Vídeo");
      }
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
      if (!currentRoomState.audioStreamUrl) {
        const targetIdx = Number(value);
        currentRoomState.currentAudioIndex = targetIdx;
        aIsPaused = false;
        const btn = document.getElementById('btn-a-play');
        if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
        if (targetIdx >= 0 && targetIdx < audioItems.length) {
          aIndex = targetIdx;
          playNextAudio();
        } else {
          // Caso a faixa tenha acabado de ser adicionada à playlist, recarrega a lista e toca imediatamente
          fetch(`${API_BASE}/api/playlists`).then(r => r.json()).then(allPl => {
            const p = allPl.find(x => x.id === currentRoomState.audioPlaylist);
            if (p && p.items && p.items.length > 0) {
              audioPlaylist = p;
              audioItems = p.items;
              aIndex = (targetIdx >= 0 && targetIdx < audioItems.length) ? targetIdx : audioItems.length - 1;
              playNextAudio();
            }
          }).catch(() => {});
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
        currentRoomState.currentAudioIndex = aIndex;
        playNextAudio();
        const btn = document.getElementById('btn-a-play');
        if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
      }
    } else if (cmd === 'prev') {
      if (!currentRoomState.audioStreamUrl && audioItems.length > 0) {
        aIsPaused = false;
        aIndex--; if (aIndex < 0) aIndex = audioItems.length - 1;
        currentRoomState.currentAudioIndex = aIndex;
        playNextAudio();
        const btn = document.getElementById('btn-a-play');
        if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
      }
    } else if (cmd === 'pause') {
      aIsPaused = true;
      pauseCurrentAudio();
      const btn = document.getElementById('btn-a-play');
      if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
    } else if (cmd === 'play') {
      aIsPaused = false;
      resumeCurrentAudio();
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

var btnVPrev = document.getElementById('btn-v-prev');
if (btnVPrev) btnVPrev.addEventListener('click', function() { emitCommand('visual', 'prev'); });
var btnVPlay = document.getElementById('btn-v-play');
if (btnVPlay) btnVPlay.addEventListener('click', function() { emitCommand('visual', vIsPaused ? 'play' : 'pause'); });
var btnVNext = document.getElementById('btn-v-next');
if (btnVNext) btnVNext.addEventListener('click', function() { emitCommand('visual', 'next'); });
var btnSiteReload = document.getElementById('btn-site-reload');
if (btnSiteReload) btnSiteReload.addEventListener('click', function() { reloadSiteFrame(); });

var btnAPrev = document.getElementById('btn-a-prev');
if (btnAPrev) btnAPrev.addEventListener('click', function() { emitCommand('audio', 'prev'); });
var btnAPlay = document.getElementById('btn-a-play');
if (btnAPlay) btnAPlay.addEventListener('click', function() { emitCommand('audio', aIsPaused ? 'play' : 'pause'); });
var btnANext = document.getElementById('btn-a-next');
if (btnANext) btnANext.addEventListener('click', function() { emitCommand('audio', 'next'); });

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
      aIsPaused = data.audioStatus !== "playing";
      startAudioPlayback();
    } else if (data.audioPlaylist) {
      currentRoomState.audioStreamUrl = null;
      const p = allPlaylists.find(x => x.id === data.audioPlaylist);
      if (p && p.items.length > 0) {
        audioPlaylist = p;
        audioItems = p.items;
        const savedIdx = Number(data.currentAudioIndex ?? 0);
        aIndex = (savedIdx >= 0 && savedIdx < p.items.length) ? savedIdx : 0;
        aIsPaused = data.audioStatus !== "playing";
        playNextAudio();
      } else {
        pauseCurrentAudio();
      }
    } else {
      currentRoomState.audioStreamUrl = null;
      audioItems = [];
      pauseCurrentAudio();
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
          showStatus("Playlist vazia.");
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

async function updateStateSilently(providedState) {
  try {
    const data = providedState || await (await fetch(`${API_BASE}/api/state/${roomSlug}`)).json();
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
        pauseCurrentAudio();
        if (data.audioPlaylist) {
          const p = allPlaylists.find(x => x.id === data.audioPlaylist);
          if (p && p.items.length > 0) {
            audioPlaylist = p;
            audioItems = p.items;
            const savedIdx = Number(data.currentAudioIndex ?? 0);
            aIndex = (savedIdx >= 0 && savedIdx < p.items.length) ? savedIdx : 0;
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
            const savedIdx = Number(data.currentAudioIndex ?? 0);
            aIndex = (savedIdx >= 0 && savedIdx < p.items.length) ? savedIdx : 0;
            aIsPaused = data.audioStatus !== "playing";
            playNextAudio();
          } else {
            audioPlaylist = null;
            audioItems = [];
            pauseCurrentAudio();
          }
        } else {
          audioPlaylist = null;
          audioItems = [];
          pauseCurrentAudio();
        }
      } else if (data.audioPlaylist) {
        // Atualiza itens da playlist de áudio se ela foi editada
        const p = allPlaylists.find(x => x.id === data.audioPlaylist);
        if (p) {
          const wasEmpty = audioItems.length === 0;
          audioPlaylist = p;
          audioItems = p.items || [];
          const targetIdx = data.currentAudioIndex !== undefined ? Number(data.currentAudioIndex) : aIndex;
          const indexChanged = targetIdx !== aIndex && targetIdx >= 0 && targetIdx < audioItems.length;
          if (indexChanged) {
            aIndex = targetIdx;
          }
          if ((wasEmpty || indexChanged) && audioItems.length > 0 && data.audioStatus === "playing") {
            aIsPaused = false;
            playNextAudio();
          }
        }
      }
    }

    if (data.audioLoopMode !== undefined) currentRoomState.audioLoopMode = data.audioLoopMode;
    if (data.audioShuffle !== undefined) currentRoomState.audioShuffle = data.audioShuffle;

    if (data.audioStatus === "paused" && !aIsPaused) {
      aIsPaused = true;
      pauseCurrentAudio();
    } else if (data.audioStatus === "playing" && aIsPaused) {
      aIsPaused = false;
      resumeCurrentAudio();
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
  pauseCurrentAudio();
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
  const ws = new WebSocket(`${wsUrl}/ws/${roomSlug}?deviceId=${encodeURIComponent(currentDeviceId)}`);
  let pingTimer = null;
  
  ws.onopen = () => {
    console.log("WebSocket conectado à sala", roomSlug, "Aparelho:", currentDeviceId);
    // Heartbeat ping a cada 25 segundos para impedir que o Render ou proxy encerrem a conexão
    pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 25000);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "pong") {
        return;
      } else if (data.type === "identify") {
        showDeviceIdentifyOverlay(data);
        return;
      } else if (data.type === "bindRoom") {
        if (data.roomSlug && data.roomSlug !== roomSlug) {
          safeSetStorage('signage_last_room', data.roomSlug);
          window.location.replace('/player/index.html?room=' + encodeURIComponent(data.roomSlug));
        } else if (!data.roomSlug && roomSlug) {
          safeSetStorage('signage_last_room', '');
          window.location.replace('/player/index.html');
        }
        return;
      } else if (data.type === "clientAssigned") {
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
        updateStateSilently(data.state);
      } else if (data.type === "control") {
        handleCommand(data.target, data.command, data.value);
      }
    } catch (e) {
      console.warn("WS parse error", e);
    }
  };
  
  ws.onclose = (event) => {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
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
  if (isAudioUnlocked) return;
  if (overlayShown) return;
  if (document.getElementById('interaction-overlay')) return;
  overlayShown = true;
  
  const overlay = document.createElement('div');
  overlay.id = 'interaction-overlay';
  overlay.style = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.88);z-index:99999;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:20px;cursor:pointer;backdrop-filter:blur(6px);padding:24px;box-sizing:border-box;text-align:center;";
  overlay.innerHTML = `
    <div style="background:#18181b;border:1px solid #27272a;border-radius:16px;padding:32px 28px;max-width:440px;width:100%;display:flex;flex-direction:column;align-items:center;gap:18px;box-shadow:0 20px 40px rgba(0,0,0,0.8);pointer-events:auto;">
      <div style="width:56px;height:56px;border-radius:50%;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);display:flex;align-items:center;justify-content:center;color:#10b981;">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
      </div>
      <h2 style="color:white;font-size:1.35rem;font-weight:700;margin:0;line-height:1.3;">${reason || "Clique para Iniciar o Áudio"}</h2>
      <p style="color:#a1a1aa;font-size:0.95rem;margin:0;line-height:1.5;">Navegadores exigem uma interação inicial para reproduzir som automaticamente.</p>
      <button id="btn-unlock-media" style="margin-top:6px;padding:14px 32px;font-size:1.1rem;background:#10b981;color:#09090b;border:none;border-radius:10px;font-weight:700;cursor:pointer;width:100%;">Iniciar Mídia</button>
      <span style="color:#71717a;font-size:0.8rem;">(Toque na tela ou aperte qualquer botão no controle remoto)</span>
    </div>
  `;
  
  const dismissAndUnlock = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    overlay.remove();
    overlayShown = false;
    unlockAudioSubsystem();
    requestWakeLock();
    // Resumo de Áudio
    if (!aIsPaused) {
      if (currentRoomState.audioStreamUrl || audioItems.length > 0) {
        resumeCurrentAudio();
      }
    }
    // Resumo de Vídeo/YouTube
    const vItem = visualItems[vIndex];
    if (vItem && vItem.type === 'youtube' && ytPlayer && ytPlayer.playVideo) {
      try { ytPlayer.playVideo(); } catch (_e) {}
    } else if (vItem && vItem.type === 'video') {
      const vid = container.querySelector('video');
      if (vid) vid.play().catch(e => console.warn(e));
    }
  };

  overlay.onclick = dismissAndUnlock;
  overlay.ontouchstart = dismissAndUnlock;
  const btn = overlay.querySelector('#btn-unlock-media');
  if (btn) btn.onclick = dismissAndUnlock;
  document.body.appendChild(overlay);
}

let hubWs = null;
let hubPingInterval = null;

function connectHubWebSocket() {
  if (roomSlug || hubWs) return;
  const wsUrl = API_BASE.replace('http', 'ws');
  const url = `${wsUrl}/ws/hub?deviceId=${encodeURIComponent(currentDeviceId)}&path=${encodeURIComponent(window.location.pathname)}&res=${window.screen.width}x${window.screen.height}`;
  
  try {
    hubWs = new WebSocket(url);
    hubWs.onopen = function() {
      console.log("[Hub WS] Conectado como aparelho no lobby:", currentDeviceId);
      if (hubPingInterval) clearInterval(hubPingInterval);
      hubPingInterval = setInterval(function() {
        if (hubWs && hubWs.readyState === WebSocket.OPEN) {
          hubWs.send(JSON.stringify({ type: "ping" }));
        }
      }, 25000);
    };
    hubWs.onmessage = function(event) {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "identify") {
          showDeviceIdentifyOverlay(data);
        } else if (data.type === "bindRoom") {
          if (data.roomSlug) {
            safeSetStorage('signage_last_room', data.roomSlug);
            window.location.replace('/player/index.html?room=' + encodeURIComponent(data.roomSlug));
          }
        } else if (data.type === "reload") {
          window.location.reload();
        }
      } catch (_e) {}
    };
    hubWs.onclose = function() {
      if (hubPingInterval) clearInterval(hubPingInterval);
      hubWs = null;
      if (!roomSlug) {
        setTimeout(connectHubWebSocket, 3000);
      }
    };
  } catch (e) {
    console.warn("Hub WS connection error:", e);
    setTimeout(connectHubWebSocket, 5000);
  }
}

async function registerDeviceWithServer() {
  try {
    const res = await fetch(`${API_BASE}/api/devices/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: currentDeviceId,
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        path: window.location.pathname + window.location.search,
        assignedRoomSlug: roomSlug || null,
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (!roomSlug && data && data.device && data.device.assignedRoomSlug) {
        console.log("Aparelho vinculado remotamente à sala:", data.device.assignedRoomSlug);
        safeSetStorage('signage_last_room', data.device.assignedRoomSlug);
        window.location.replace('/player/index.html?room=' + encodeURIComponent(data.device.assignedRoomSlug));
      }
    }
  } catch (e) {
    console.warn("Falha no registro inicial do dispositivo:", e);
  }
}

let reconnectCountdownTimer = null;

async function showRoomSelection(notice, skipCountdown = false) {
  try {
    if (reconnectCountdownTimer) {
      clearInterval(reconnectCountdownTimer);
      reconnectCountdownTimer = null;
    }

    showStatus("Carregando salas disponíveis...");
    const res = await fetch(`${API_BASE}/api/rooms`);
    if (!res.ok) throw new Error("Status " + res.status);
    const rooms = await res.json();

    // Remove menu anterior caso já exista
    const oldMenu = document.querySelector('.room-menu');
    if (oldMenu) oldMenu.remove();
    
    const menu = document.createElement('div');
    menu.className = 'room-menu';

    let noticeHtml = '';
    if (notice) {
      noticeHtml = `<div style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; padding: 12px 16px; border-radius: 8px; font-size: 13px; margin-bottom: 20px; line-height: 1.4; display: flex; align-items: center; gap: 8px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span>${notice}</span></div>`;
    }

    const lastRoomSlug = safeGetStorage('signage_last_room');
    const lastRoom = (!skipCountdown && !notice && lastRoomSlug) ? rooms.find(r => r.slug === lastRoomSlug) : null;
    const lastRoomCount = (lastRoom && lastRoom.clientsCount !== undefined) ? lastRoom.clientsCount : 0;
    const lastRoomMax = (lastRoom && lastRoom.maxClients !== undefined) ? lastRoom.maxClients : 2;
    const canAutoReconnect = Boolean(lastRoom && lastRoomCount < lastRoomMax);

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
      <div style="margin-top: 24px; padding: 12px 16px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; font-size: 12px; color: #9ca3af; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
        <div>Identificação deste aparelho: <strong style="color: #34d399; font-family: monospace; font-size: 13px;">${currentDeviceId}</strong></div>
        <div style="font-size: 11px; color: #6b7280;">Pode ser vinculado remotamente pelo Painel Admin</div>
      </div>
    `;

    const enterRoom = (room) => {
      if (reconnectCountdownTimer) {
        clearInterval(reconnectCountdownTimer);
        reconnectCountdownTimer = null;
      }
      safeSetStorage('signage_last_room', room.slug);
      window.history.pushState({}, '', '?room=' + room.slug);
      roomSlug = room.slug;
      autoReconnect = true;
      if (hubWs) {
        try { hubWs.close(); } catch (_e) {}
        hubWs = null;
      }
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

      const cancelBtn = menu.querySelector('#btn-cancel-countdown');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          if (reconnectCountdownTimer) {
            clearInterval(reconnectCountdownTimer);
            reconnectCountdownTimer = null;
          }
          const card = document.getElementById('auto-reconnect-card');
          if (card) card.remove();
        });
      }

      const nowBtn = menu.querySelector('#btn-now-countdown');
      if (nowBtn) {
        nowBtn.addEventListener('click', () => {
          enterRoom(lastRoom);
        });
      }
    }

    const list = menu.querySelector('.room-list');
    
    if (rooms.length === 0) {
      list.innerHTML = '<p style="color: #888; font-size: 14px;">Nenhuma sala configurada no sistema.</p>';
    }
    rooms.forEach(room => {
      const count = room.clientsCount !== undefined ? room.clientsCount : 0;
      const max = room.maxClients !== undefined ? room.maxClients : 2;
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
    statusEl.style.display = 'none';
    document.body.appendChild(menu);
  } catch (_e) {
    showStatus("Buscando salas disponíveis no servidor... (Reconectando em 3s)");
    setTimeout(() => {
      showRoomSelection(notice, skipCountdown);
    }, 3500);
  }
}

// --- BOOTSTRAP INICIAL DO PLAYER ---
try {
  requestWakeLock();
} catch (_e) {}

try {
  registerDeviceWithServer().catch(function(err) {
    console.warn("Falha no registro inicial do dispositivo:", err);
  });
} catch (_e) {}

if (!roomSlug) {
  try {
    connectHubWebSocket();
  } catch (_e) {}
  showRoomSelection().catch(function(err) {
    console.error("Erro fatal ao carregar lobby:", err);
    showStatus("Erro ao abrir lobby: " + (err.message || err));
  });
} else {
  safeSetStorage('signage_last_room', roomSlug);
  fetchState().catch(function(err) {
    console.error("Erro ao carregar estado:", err);
  });
  connectWebSocket();
}

