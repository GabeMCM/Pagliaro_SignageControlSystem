// ============================================================================
// SIGNAGE TV PLAYER (100% ES5 - OTIMIZADO PARA FIRE STICK VEGA OS & HISENSE)
// ============================================================================
// - Zero sintaxe ES6+/ES2020 (sem ??, sem spread {...}, sem async/await, sem =>)
// - Modo TV Leve automático para Fire Stick (Vega OS / Silk), Hisense (VIDAA),
//   Samsung (Tizen), LG (webOS) ou via /tv (?tv=1), desativando motor de áudio
// - Aceleração automática para links Adiaŭ via /api/adiau/render (3.8MB -> 4KB)
// - Navegação completa por Controle Remoto (D-Pad: Setas + OK/Enter)
// - Sincronização híbrida: WebSocket + Fallback HTTP Polling automático
// ============================================================================

window.onerror = function(msg, url, line, col) {
  if (window.console && console.error) {
    console.error("Player Error:", msg, line, col);
  }
  var statusDiv = document.getElementById('status');
  if (statusDiv) {
    statusDiv.style.display = 'block';
    statusDiv.style.background = '#7f1d1d';
    statusDiv.style.color = '#fecaca';
    statusDiv.innerHTML =
      '<div style="font-weight:bold;margin-bottom:4px;">Aviso do Player:</div>' +
      '<div style="font-size:12px;">' + (msg || 'Erro ao carregar') + '</div>' +
      '<button onclick="window.location.reload()" style="margin-top:8px;padding:6px 12px;background:#fff;color:#000;border:none;border-radius:4px;cursor:pointer;font-weight:bold;font-size:11px;">Recarregar Tela</button>';
  }
  return false;
};

// --- UTILITÁRIOS ES5 PUROS ---
function pad2(n) {
  var s = String(n);
  return s.length < 2 ? '0' + s : s;
}

function assignObj(target, source) {
  var out = {};
  var k;
  if (target) {
    for (k in target) {
      if (Object.prototype.hasOwnProperty.call(target, k)) {
        out[k] = target[k];
      }
    }
  }
  if (source) {
    for (k in source) {
      if (Object.prototype.hasOwnProperty.call(source, k)) {
        out[k] = source[k];
      }
    }
  }
  return out;
}

function getQueryParam(name) {
  var search = window.location.search || '';
  if (search.charAt(0) === '?') search = search.substring(1);
  if (!search) return null;
  var pairs = search.split('&');
  for (var i = 0; i < pairs.length; i++) {
    var parts = pairs[i].split('=');
    var k = decodeURIComponent(parts[0] || '');
    if (k === name) {
      return decodeURIComponent(parts.slice(1).join('=') || '');
    }
  }
  return null;
}

function safeGetStorage(key) {
  try {
    return window.localStorage ? window.localStorage.getItem(key) : null;
  } catch (e) {
    return null;
  }
}

function safeSetStorage(key, val) {
  try {
    if (window.localStorage) window.localStorage.setItem(key, val);
  } catch (e) {}
}

function httpJson(method, url, bodyObj, callback) {
  try {
    var xhr = new XMLHttpRequest();
    var sep = url.indexOf('?') !== -1 ? '&' : '?';
    var fullUrl = method === 'GET' ? (url + sep + '_t=' + (new Date().getTime())) : url;
    xhr.open(method, fullUrl, true);
    xhr.timeout = 15000;
    if (bodyObj !== null && bodyObj !== undefined) {
      xhr.setRequestHeader('Content-Type', 'application/json');
    }
    xhr.onreadystatechange = function() {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        var parsed = null;
        try {
          parsed = xhr.responseText ? JSON.parse(xhr.responseText) : {};
        } catch (err) {
          if (callback) callback(err, null);
          return;
        }
        if (callback) callback(null, parsed);
      } else {
        if (callback) callback(new Error('HTTP ' + xhr.status), null);
      }
    };
    xhr.onerror = function() {
      if (callback) callback(new Error('Network Error'), null);
    };
    xhr.ontimeout = function() {
      if (callback) callback(new Error('Timeout'), null);
    };
    if (bodyObj !== null && bodyObj !== undefined) {
      xhr.send(JSON.stringify(bodyObj));
    } else {
      xhr.send();
    }
  } catch (e) {
    if (callback) callback(e, null);
  }
}

// --- DETECÇÃO DE SMART TV / FIRE STICK E IDENTIFICAÇÃO DO APARELHO ---
function detectSmartTvBrowser() {
  var ua = (typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '').toLowerCase();
  return (
    ua.indexOf('vidaa') !== -1 ||
    ua.indexOf('hisense') !== -1 ||
    ua.indexOf('aft') !== -1 ||
    ua.indexOf('silk') !== -1 ||
    ua.indexOf('vega') !== -1 ||
    ua.indexOf('amazon') !== -1 ||
    ua.indexOf('tizen') !== -1 ||
    ua.indexOf('webos') !== -1 ||
    ua.indexOf('web0s') !== -1 ||
    ua.indexOf('netcast') !== -1 ||
    ua.indexOf('smarttv') !== -1 ||
    ua.indexOf('smart-tv') !== -1 ||
    ua.indexOf('hbbtv') !== -1 ||
    ua.indexOf('opera tv') !== -1 ||
    ua.indexOf('bravia') !== -1 ||
    ua.indexOf('viera') !== -1 ||
    ua.indexOf('philips') !== -1 ||
    (ua.indexOf('android') !== -1 && ua.indexOf('tv') !== -1)
  );
}

function generateHardwareFingerprint() {
  try {
    var components = [];
    if (typeof navigator !== 'undefined') {
      components.push(navigator.userAgent || '');
      components.push(navigator.platform || '');
      components.push(navigator.language || '');
    }
    if (typeof screen !== 'undefined') {
      components.push((screen.width || 0) + 'x' + (screen.height || 0) + 'x' + (screen.colorDepth || 24));
    }
    var str = components.join('|||');
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    var hex = (hash >>> 0).toString(16);
    while (hex.length < 8) hex = '0' + hex;

    var prefix = 'tv_';
    var ua = (typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '').toLowerCase();
    if (ua.indexOf('tizen') !== -1) prefix = 'samsung_';
    else if (ua.indexOf('webos') !== -1 || ua.indexOf('netcast') !== -1) prefix = 'lg_';
    else if (ua.indexOf('vidaa') !== -1 || ua.indexOf('hisense') !== -1) prefix = 'hisense_';
    else if (ua.indexOf('aft') !== -1 || ua.indexOf('silk') !== -1 || ua.indexOf('vega') !== -1 || ua.indexOf('amazon') !== -1) prefix = 'firestick_';
    else if (ua.indexOf('android') !== -1 && ua.indexOf('tv') !== -1) prefix = 'androidtv_';
    else if (ua.indexOf('windows') !== -1) prefix = 'pc_';
    else if (ua.indexOf('macintosh') !== -1 || ua.indexOf('mac os') !== -1) prefix = 'mac_';
    else if (ua.indexOf('linux') !== -1) prefix = 'linux_';

    return prefix + hex;
  } catch (e) {
    return 'tv_' + Math.random().toString(36).substring(2, 10);
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
    } catch (e) {}
  }
  if (!id) {
    id = generateHardwareFingerprint();
  }
  safeSetStorage('signage_device_id', id);
  try {
    if (typeof document !== 'undefined') {
      document.cookie = 'signage_device_id=' + encodeURIComponent(id) + '; max-age=315360000; path=/';
    }
  } catch (e) {}
  return id;
}

var currentDeviceId = getPersistentDeviceId();
var roomSlug = getQueryParam('room');
var FORCE_DIRECT_IFRAME = getQueryParam('direct') === '1';
var API_BASE = window.location.origin || (window.location.protocol + '//' + window.location.host);

// Determina se o áudio deve ficar ativo (padrão ATIVO em todas as TVs e aparelhos;
// só desativa se ?audio=0 ou se o usuário desativar manualmente no botão do Lobby)
function resolveAudioEnabled() {
  var qAudio = getQueryParam('audio');
  if (qAudio === '1') {
    safeSetStorage('signage_audio_disabled', '0');
    return true;
  }
  if (qAudio === '0') {
    safeSetStorage('signage_audio_disabled', '1');
    return false;
  }
  if (safeGetStorage('signage_audio_disabled') === '1') return false;
  return true;
}

var ENABLE_AUDIO = resolveAudioEnabled();

var statusEl = document.getElementById('status');
var container = document.getElementById('media-container');
var siteFrame = document.getElementById('site-frame');

if (ENABLE_AUDIO) {
  var aDiv = document.getElementById('audio-controls-divider');
  var aGrp = document.getElementById('audio-controls-group');
  if (aDiv) aDiv.style.display = 'block';
  if (aGrp) aGrp.style.display = 'flex';
}

// --- MODAL DE IDENTIFICAÇÃO REMOTA ---
var identifyTimer = null;
var isIdentifyModalOpen = false;

function dismissIdentifyOverlay() {
  var overlay = document.getElementById('device-identify-overlay');
  if (identifyTimer) {
    clearInterval(identifyTimer);
    identifyTimer = null;
  }
  isIdentifyModalOpen = false;
  if (overlay) {
    overlay.className = overlay.className.replace(/\bvisible\b/g, '').replace(/\s+/g, ' ');
  }
}

function showDeviceIdentifyOverlay(info) {
  var overlay = document.getElementById('device-identify-overlay');
  if (!overlay) return;

  var titleEl = document.getElementById('identify-modal-title');
  var idEl = document.getElementById('identify-modal-id');
  var roomEl = document.getElementById('identify-modal-room');
  var ipEl = document.getElementById('identify-modal-ip');
  var resEl = document.getElementById('identify-modal-res');
  var secEl = document.getElementById('identify-timer-sec');

  if (titleEl) titleEl.textContent = (info && info.name) ? info.name : 'Aparelho Identificado';
  if (idEl) idEl.textContent = (info && info.deviceId) ? info.deviceId : currentDeviceId;
  if (roomEl) roomEl.textContent = (info && info.room) ? info.room : (roomSlug ? roomSlug : 'Nenhuma (Lobby)');
  if (ipEl) ipEl.textContent = (info && info.ip) ? info.ip : window.location.hostname;
  if (resEl) resEl.textContent = (window.innerWidth || screen.width) + ' x ' + (window.innerHeight || screen.height);

  if (overlay.className.indexOf('visible') === -1) {
    overlay.className += ' visible';
  }
  isIdentifyModalOpen = true;

  var remaining = (info && info.duration) ? info.duration : 15;
  if (secEl) secEl.textContent = String(remaining);

  if (identifyTimer) clearInterval(identifyTimer);
  identifyTimer = setInterval(function() {
    remaining--;
    if (secEl) secEl.textContent = String(remaining);
    if (remaining <= 0) {
      dismissIdentifyOverlay();
    }
  }, 1000);

  overlay.onclick = dismissIdentifyOverlay;
}

// --- FILA DE EVENTOS FIFO (100% ES5) ---
var currentStateVersion = 0;
var fifoQueue = [];
var isProcessingQueue = false;

function processNextInQueue() {
  if (isProcessingQueue || fifoQueue.length === 0) return;
  isProcessingQueue = true;
  var taskFn = fifoQueue.shift();
  try {
    taskFn(function() {
      isProcessingQueue = false;
      processNextInQueue();
    });
  } catch (err) {
    if (window.console && console.warn) {
      console.warn("[PlayerEventQueue] Erro:", err);
    }
    isProcessingQueue = false;
    processNextInQueue();
  }
}

function enqueuePlayerEvent(taskFn) {
  fifoQueue.push(taskFn);
  processNextInQueue();
}

var currentRoomState = {
  playlist: null,
  audioPlaylist: null,
  audioStreamUrl: null,
  siteUrl: null,
  mode: 'playlist',
  visualStatus: 'idle',
  audioStatus: 'idle',
  audioVolume: 0,
  standby: false,
  version: 0
};

// --- VARIÁVEIS VISUAIS & YOUTUBE ---
var visualPlaylist = null;
var visualItems = [];
var vIndex = 0;
var vIsPaused = false;
var vTimeoutId = null;
var vImageStartTime = 0;
var vImageRemainingMs = 0;
var ytPlayer = null;
var isYtReady = false;
var isYtScriptLoaded = false;

function ensureYouTubeApiLoaded() {
  if (isYtScriptLoaded) return;
  isYtScriptLoaded = true;
  window.onYouTubeIframeAPIReady = function() {
    isYtReady = true;
  };
  var tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  var firstScriptTag = document.getElementsByTagName('script')[0];
  if (firstScriptTag && firstScriptTag.parentNode) {
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
  } else {
    document.head.appendChild(tag);
  }
}

function extractYtId(url) {
  if (!url) return null;
  var regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  var match = String(url).match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// --- MOTOR DE ÁUDIO ROBUSTO (100% ES5 - MODELO DE RECONCILIAÇÃO) ---
// O servidor define o ESTADO DESEJADO (faixa, play/pause, volume) e este motor
// garante continuamente que o elemento <audio> real corresponda a ele:
//  - Desbloqueio de autoplay por QUALQUER interação (toque, clique, tecla OK do controle)
//  - Aviso visível na tela quando o navegador da TV bloquear o som inicial
//  - Não abre conexão de stream enquanto pausado (evita stream "morto" ao dar Play depois)
//  - Watchdog: detecta travamento/silêncio e reconecta o stream na MESMA posição
//  - Repetição automática em erros de rede com backoff (sem pular faixas indevidamente)
//  - Reporta o estado REAL (playing / paused / loading / blocked / error) ao painel Admin
var audioPlaylist = null;
var audioItems = [];
var aIndex = 0;
var aIsPaused = true;
var masterVolume = 0;
var currentPlayingAudioType = 'html5';
var bgmPlayer = document.getElementById('bgm-player');
var audioCtx = null;
var SILENT_WAV_URI = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

var AE = {
  key: '',            // faixa atualmente carregada no elemento <audio>
  lastKey: '',        // última faixa carregada (para diferenciar retry de troca)
  src: '',
  desiredKey: '',     // faixa que o servidor quer tocando
  desiredSrc: '',
  primed: false,      // elemento <audio> já foi desbloqueado por gesto do usuário
  blocked: false,     // navegador bloqueou autoplay (aguardando interação)
  errorCount: 0,
  retryTimer: null,
  pendingResume: 0,   // posição para retomar após reconexão
  resumeAt: 0,
  lastPlayAttempt: 0,
  playAttemptsNoProgress: 0,
  lastTime: 0,
  lastProgressAt: 0,
  localAdvanceAt: 0,  // avanço local de faixa ainda não confirmado pelo servidor
  localAdvanceFrom: -1,
  localAdvanceTo: -1,
  reported: '',
  prefetchedKey: ''
};

function nowMs() { return new Date().getTime(); }

if (bgmPlayer) {
  try {
    bgmPlayer.preload = 'auto';
    bgmPlayer.setAttribute('playsinline', '');
    bgmPlayer.setAttribute('webkit-playsinline', '');
  } catch (e) {}
}

function calculateTargetAudioVolume() {
  if (!ENABLE_AUDIO) return 0;
  var itemVol = 1;
  if (!currentRoomState.audioStreamUrl && audioItems[aIndex] && audioItems[aIndex].volume !== undefined) {
    itemVol = Number(audioItems[aIndex].volume) / 100;
    if (isNaN(itemVol)) itemVol = 1;
  }
  var finalVol = itemVol * (masterVolume / 100);
  if (finalVol < 0) finalVol = 0;
  if (finalVol > 1) finalVol = 1;
  return finalVol;
}

function syncAudioVolume() {
  if (!ENABLE_AUDIO || !bgmPlayer) return;
  try { bgmPlayer.volume = calculateTargetAudioVolume(); } catch (e) {}
}

function setMasterVolume(vol) {
  var n = Number(vol);
  if (isNaN(n)) n = 0;
  masterVolume = Math.max(0, Math.min(100, n));
  syncAudioVolume();
}

function pauseCurrentAudio() {
  if (!ENABLE_AUDIO || !bgmPlayer) return;
  if (!bgmPlayer.paused) {
    try { bgmPlayer.pause(); } catch (e) {}
  }
}

function getAudioYoutubeId(url) {
  if (!url) return null;
  var clean = String(url).replace(/^\s+|\s+$/g, '');
  if (clean.indexOf('youtube:') === 0) {
    var id = clean.replace('youtube:', '').replace(/^\s+|\s+$/g, '');
    return id.length === 11 ? id : null;
  }
  var m = clean.match(/\/api\/youtube\/stream\/([a-zA-Z0-9_-]{11})/);
  if (m) return m[1];
  return extractYtId(clean);
}

function normalizeAudioUrl(url) {
  if (!url) return url;
  var clean = String(url).replace(/^\s+|\s+$/g, '');
  var gdriveMatch = clean.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (gdriveMatch) {
    return 'https://drive.google.com/uc?export=download&id=' + gdriveMatch[1];
  }
  return clean;
}

// Converte qualquer URL de faixa no endereço final servido por ESTE servidor
function resolveAudioSrc(raw, isLiveStream) {
  if (!raw) return '';
  var ytId = getAudioYoutubeId(raw);
  if (ytId) return API_BASE + '/api/youtube/stream/' + ytId;
  var s = String(raw).replace(/^\s+|\s+$/g, '');
  if (isLiveStream) {
    if (s.indexOf('/api/radio/stream') !== -1) {
      return s.indexOf('http') === 0 ? s : API_BASE + (s.charAt(0) === '/' ? '' : '/') + s;
    }
    if (s.indexOf('/media/') === 0) {
      return API_BASE + s;
    }
    if (s.indexOf('http') !== 0) {
      s = 'https://' + s;
    }
    return API_BASE + '/api/radio/stream?url=' + encodeURIComponent(s);
  }
  if (s.indexOf('http') !== 0) {
    s = API_BASE + (s.charAt(0) === '/' ? '' : '/') + s;
  }
  return normalizeAudioUrl(s);
}

function computeDesiredAudio() {
  var raw = null;
  var key = '';
  var isLiveStream = false;
  if (currentRoomState.audioStreamUrl) {
    raw = currentRoomState.audioStreamUrl;
    key = 'stream|' + raw;
    isLiveStream = true;
  } else if (audioItems && audioItems.length > 0) {
    if (aIndex < 0 || aIndex >= audioItems.length) aIndex = 0;
    var it = audioItems[aIndex];
    var itUrl = it ? (typeof it === 'string' ? it : it.url) : null;
    if (itUrl) {
      raw = itUrl;
      key = 'pl|' + (audioPlaylist ? audioPlaylist.id : '') + '|' + aIndex + '|' + itUrl;
    }
  }
  AE.desiredSrc = raw ? resolveAudioSrc(raw, isLiveStream) : '';
  AE.desiredKey = raw ? key : '';
}

// --- Relatório do estado REAL do áudio para o painel ---
function sendRoomWsMessage(obj) {
  try {
    if (activeRoomWs && activeRoomWs.readyState === 1) {
      activeRoomWs.send(JSON.stringify(obj));
    }
  } catch (e) {}
}

function setAudioReport(state, detail) {
  var sig = state + '|' + (detail || '') + '|' + aIndex;
  if (sig === AE.reported) return;
  AE.reported = sig;
  sendRoomWsMessage({ type: 'audioState', state: state, detail: detail || '', track: aIndex });
}

function reportCurrentAudioState(force) {
  if (force) AE.reported = '';
  if (!ENABLE_AUDIO) { setAudioReport('disabled', 'Som desativado nesta tela'); return; }
  if (!AE.desiredKey) { setAudioReport('idle'); return; }
  if (aIsPaused) { setAudioReport('paused'); return; }
  if (AE.blocked) { setAudioReport('blocked', 'Toque na tela ou pressione OK no controle da TV'); return; }
  if (bgmPlayer && !bgmPlayer.paused) { setAudioReport('playing'); return; }
  setAudioReport('loading');
}

// --- Aviso de desbloqueio na tela ---
function showAudioUnlockOverlay() {
  var el = document.getElementById('audio-unlock-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'audio-unlock-overlay';
    el.setAttribute('tabindex', '0');
    el.style.cssText = 'position:fixed;left:0;right:0;bottom:6%;z-index:1000001;text-align:center;cursor:pointer;';
    el.innerHTML =
      '<div style="display:inline-block;max-width:90%;background:rgba(0,0,0,0.92);border:3px solid #facc15;color:#fff;padding:18px 32px;border-radius:16px;font-family:sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.75);">' +
        '<div style="font-size:24px;font-weight:bold;margin-bottom:6px;">&#128266; Toque aqui ou pressione OK no controle</div>' +
        '<div style="font-size:16px;color:#fde047;">para liberar o som desta tela</div>' +
      '</div>';
    el.onclick = function() { unlockAudioFromGesture(); };
    if (document.body) document.body.appendChild(el);
  }
  el.style.display = 'block';
  try { el.focus(); } catch (e) {}
}

function hideAudioUnlockOverlay() {
  var el = document.getElementById('audio-unlock-overlay');
  if (el) el.style.display = 'none';
}

function setAudioBlocked(flag) {
  AE.blocked = Boolean(flag);
  if (AE.blocked && !aIsPaused && AE.desiredKey) {
    showAudioUnlockOverlay();
  } else {
    hideAudioUnlockOverlay();
  }
  reportCurrentAudioState();
}

// Qualquer interação do usuário (toque, clique, tecla do controle remoto) libera o som.
// IMPORTANTE: play() é chamado de forma SÍNCRONA dentro do evento para valer como gesto.
function unlockAudioFromGesture() {
  if (!ENABLE_AUDIO || !bgmPlayer) return;
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended' && audioCtx.resume) audioCtx.resume();
    }
  } catch (e) {}

  computeDesiredAudio();

  if (AE.desiredKey && !aIsPaused) {
    AE.primed = true;
    if (bgmPlayer.paused || AE.blocked || !AE.key) {
      AE.blocked = false;
      hideAudioUnlockOverlay();
      if (AE.key !== AE.desiredKey) {
        audioLoad();
      }
      audioTryPlay();
    }
  } else if (!AE.primed && !AE.key) {
    // Destrava o elemento <audio> com um WAV silencioso de 44 bytes (necessário em TVs / Safari / Silk / Android)
    AE.primed = true;
    try {
      bgmPlayer.volume = 0;
      bgmPlayer.src = SILENT_WAV_URI;
      var pp = bgmPlayer.play();
      var restorePrime = function() {
        if (!AE.key) {
          try { bgmPlayer.pause(); } catch (e2) {}
        }
        syncAudioVolume();
      };
      if (pp && typeof pp.then === 'function') {
        pp.then(restorePrime, restorePrime);
      } else {
        setTimeout(restorePrime, 60);
      }
    } catch (e) {}
  }
}

(function bindAudioUnlockGestures() {
  var evts = ['click', 'touchstart', 'touchend', 'mousedown', 'pointerdown', 'keydown'];
  for (var i = 0; i < evts.length; i++) {
    try {
      document.addEventListener(evts[i], unlockAudioFromGesture, true);
    } catch (e) {}
  }
})();

// --- Carregamento / reprodução ---
function audioLoad() {
  var isLiveRadio = Boolean(currentRoomState.audioStreamUrl);
  var isRetry = AE.lastKey === AE.desiredKey;
  if (!isRetry) {
    AE.errorCount = 0;
    AE.pendingResume = 0;
  }
  AE.key = AE.desiredKey;
  AE.lastKey = AE.desiredKey;
  AE.src = AE.desiredSrc;
  AE.resumeAt = (!isLiveRadio && isRetry) ? AE.pendingResume : 0;
  AE.pendingResume = 0;
  AE.lastTime = 0;
  AE.lastProgressAt = nowMs();
  AE.playAttemptsNoProgress = 0;

  var url = AE.src;
  if (isLiveRadio) {
    url += (url.indexOf('?') === -1 ? '?' : '&') + '_ts=' + nowMs();
  } else if (isRetry && AE.errorCount > 0) {
    url += (url.indexOf('?') === -1 ? '?' : '&') + 'r=' + AE.errorCount + '_' + nowMs();
  }
  try {
    bgmPlayer.src = url;
    bgmPlayer.load();
  } catch (e) {}
  syncAudioVolume();
  setAudioReport('loading', isRetry && AE.errorCount > 0 ? 'Reconectando (tentativa ' + AE.errorCount + ')' : '');
}

function handlePlayRejection(err) {
  var name = err && err.name ? err.name : '';
  if (name === 'NotAllowedError') {
    setAudioBlocked(true);
    return;
  }
  if (name === 'AbortError') return;
  if (!aIsPaused && AE.desiredKey) {
    audioHandleFailure(name || 'Falha ao iniciar áudio');
  }
}

function audioTryPlay() {
  if (!bgmPlayer || !AE.key) return;
  AE.lastPlayAttempt = nowMs();
  AE.playAttemptsNoProgress++;
  syncAudioVolume();
  var p;
  try {
    p = bgmPlayer.play();
  } catch (e) {
    handlePlayRejection(e);
    return;
  }
  if (p && typeof p.then === 'function') {
    p.then(function() {
      AE.primed = true;
      if (AE.blocked) setAudioBlocked(false);
    }, handlePlayRejection);
  }
}

function audioHandleFailure(reason) {
  if (!AE.desiredKey || !bgmPlayer) return;
  if (AE.retryTimer) return; // já existe uma reconexão agendada
  AE.errorCount++;
  var isLiveRadio = Boolean(currentRoomState.audioStreamUrl);
  if (isLiveRadio) {
    AE.pendingResume = 0;
  } else {
    var pos = 0;
    try { pos = bgmPlayer.currentTime || 0; } catch (e) {}
    if (AE.lastTime > pos) pos = AE.lastTime;
    AE.pendingResume = pos;
  }
  setAudioReport('error', reason + ' (tentativa ' + AE.errorCount + ')');

  // Após 5 falhas seguidas NA MESMA faixa de playlist, avança para a próxima
  if (AE.errorCount >= 5 && !isLiveRadio && audioItems.length > 1) {
    AE.errorCount = 0;
    AE.pendingResume = 0;
    advanceToNextTrack(true);
    return;
  }
  var delay = Math.min(isLiveRadio ? 8000 : 12000, 1200 * Math.pow(2, Math.min(4, AE.errorCount - 1)));
  AE.retryTimer = setTimeout(function() {
    AE.retryTimer = null;
    if (!AE.desiredKey) return;
    AE.key = ''; // força recarregar a mesma faixa / rádio
    reconcileAudio();
  }, delay);
}

function computeNextAudioIndex(ignoreLoopNone) {
  if (!audioItems || audioItems.length === 0) return -1;
  var loopMode = currentRoomState.audioLoopMode || (audioPlaylist && audioPlaylist.loopMode) || 'all';
  if (currentRoomState.audioShuffle && audioItems.length > 1) {
    var r = aIndex;
    while (r === aIndex) r = Math.floor(Math.random() * audioItems.length);
    return r;
  }
  var next = aIndex + 1;
  if (next >= audioItems.length) {
    if (loopMode === 'none' && !ignoreLoopNone) return -1;
    next = 0;
  }
  return next;
}

function advanceToNextTrack(fromError) {
  var next = computeNextAudioIndex(fromError);
  if (next < 0) {
    pauseCurrentAudio();
    setAudioReport('idle', 'Fim da playlist');
    return;
  }
  AE.localAdvanceAt = nowMs();
  AE.localAdvanceFrom = aIndex;
  AE.localAdvanceTo = next;
  aIndex = next;
  currentRoomState.currentAudioIndex = next;
  reconcileAudio();
  emitCommand('audio', 'trackChanged', next);
}

function prefetchNextAudioTrack() {
  if (currentRoomState.audioStreamUrl || !audioItems || audioItems.length < 2) return;
  if (AE.prefetchedKey === AE.key) return;
  AE.prefetchedKey = AE.key;
  var nextIdx = (aIndex + 1) % audioItems.length;
  var it = audioItems[nextIdx];
  var u = it ? (typeof it === 'string' ? it : it.url) : null;
  var ytId = getAudioYoutubeId(u);
  if (ytId) {
    httpJson('GET', API_BASE + '/api/youtube/prefetch/' + ytId, null, function() {});
  }
}

/**
 * Faz o <audio> real corresponder ao estado desejado. Idempotente: pode (e deve)
 * ser chamado a qualquer momento — mudanças de estado, comando remoto, polling, watchdog.
 */
function reconcileAudio() {
  if (!ENABLE_AUDIO || !bgmPlayer) {
    reportCurrentAudioState();
    return;
  }
  computeDesiredAudio();
  syncAudioVolume();

  if (!AE.desiredKey) {
    if (AE.retryTimer) { clearTimeout(AE.retryTimer); AE.retryTimer = null; }
    if (AE.key) {
      try { bgmPlayer.pause(); } catch (e) {}
      try { bgmPlayer.removeAttribute('src'); bgmPlayer.load(); } catch (e) {}
      AE.key = '';
      AE.src = '';
    }
    AE.blocked = false;
    hideAudioUnlockOverlay();
    reportCurrentAudioState();
    return;
  }

  // Enquanto estiver PAUSADO, não inicia carregamento de novo stream para não deixar
  // conexão HTTP pendurada/expirada antes do usuário apertar Play.
  if (aIsPaused) {
    if (AE.retryTimer) { clearTimeout(AE.retryTimer); AE.retryTimer = null; }
    if (!bgmPlayer.paused) {
      try { bgmPlayer.pause(); } catch (e) {}
    }
    if (currentRoomState.audioStreamUrl && AE.key) {
      // Em Web Rádio ao vivo, encerrar o socket ao pausar para reconectar ao vivo no próximo Play
      try { bgmPlayer.removeAttribute('src'); bgmPlayer.load(); } catch (e) {}
      AE.key = '';
      AE.lastKey = '';
      AE.lastTime = 0;
      AE.pendingResume = 0;
    } else if (AE.key && AE.key !== AE.desiredKey) {
      AE.key = '';
      AE.lastKey = '';
      AE.lastTime = 0;
      AE.pendingResume = 0;
    }
    if (AE.blocked) {
      AE.blocked = false;
      hideAudioUnlockOverlay();
    }
    reportCurrentAudioState();
    return;
  }

  // Quando DEVE TOCAR (!aIsPaused):
  var mediaBroken = Boolean(bgmPlayer.error || bgmPlayer.networkState === 3);
  if (AE.key !== AE.desiredKey || mediaBroken) {
    if (AE.retryTimer && AE.lastKey !== AE.desiredKey) {
      clearTimeout(AE.retryTimer);
      AE.retryTimer = null;
    }
    if (!AE.retryTimer) {
      if (mediaBroken && AE.key === AE.desiredKey && !currentRoomState.audioStreamUrl) {
        AE.pendingResume = AE.lastTime;
      }
      audioLoad();
    }
  }

  if (bgmPlayer.paused && !AE.retryTimer && AE.key) {
    audioTryPlay();
  }
  reportCurrentAudioState();
}

// Compatibilidade com chamadas antigas
function playNextAudio() { reconcileAudio(); }
function startAudioPlayback() { reconcileAudio(); }
function resumeCurrentAudio() { reconcileAudio(); }

if (ENABLE_AUDIO && bgmPlayer) {
  bgmPlayer.addEventListener('loadedmetadata', function() {
    if (AE.resumeAt > 1 && !currentRoomState.audioStreamUrl) {
      var d = bgmPlayer.duration;
      if (d && isFinite(d) && d > AE.resumeAt + 2) {
        try { bgmPlayer.currentTime = AE.resumeAt; } catch (e) {}
      }
    }
    AE.resumeAt = 0;
  });

  bgmPlayer.addEventListener('playing', function() {
    AE.primed = true;
    AE.lastProgressAt = nowMs();
    if (AE.blocked) setAudioBlocked(false);
    if (aIsPaused) {
      try { bgmPlayer.pause(); } catch (e) {}
      return;
    }
    reportCurrentAudioState();
    prefetchNextAudioTrack();
  });

  bgmPlayer.addEventListener('timeupdate', function() {
    var ct = bgmPlayer.currentTime || 0;
    AE.lastProgressAt = nowMs();
    AE.playAttemptsNoProgress = 0;
    if (ct !== AE.lastTime) {
      AE.lastTime = ct;
      if (AE.errorCount > 0 && ct > 15) AE.errorCount = 0;
    }
  });

  bgmPlayer.addEventListener('waiting', function() {
    if (!aIsPaused && AE.key) setAudioReport('loading', 'Carregando...');
  });

  bgmPlayer.addEventListener('error', function() {
    if (!AE.key || aIsPaused) return;
    var code = bgmPlayer.error ? bgmPlayer.error.code : 0;
    audioHandleFailure('Erro de mídia ' + code);
  });

  bgmPlayer.addEventListener('ended', function() {
    if (!AE.desiredKey || !AE.key || aIsPaused) return;
    if (currentRoomState.audioStreamUrl) {
      audioHandleFailure('Stream ao vivo reconectando');
      return;
    }
    var dur = bgmPlayer.duration;
    var ct = bgmPlayer.currentTime || 0;
    // Ignora 'ended' prematuro se tocou menos de 3s ou se caiu antes do fim real
    if (ct < 3 || (dur && isFinite(dur) && dur > 10 && ct < dur - 5)) {
      audioHandleFailure('Stream interrompido');
      return;
    }
    var loopMode = currentRoomState.audioLoopMode || (audioPlaylist && audioPlaylist.loopMode) || 'all';
    if (loopMode === 'one' || audioItems.length === 1) {
      try { bgmPlayer.currentTime = 0; } catch (e) {}
      audioTryPlay();
      return;
    }
    advanceToNextTrack(false);
  });

  // Watchdog: garante a cada 2s que o som realmente esteja saindo quando deveria
  setInterval(function() {
    if (!AE.desiredKey || aIsPaused || AE.retryTimer) return;
    var t = nowMs();
    if (AE.key !== AE.desiredKey) { reconcileAudio(); return; }
    if (bgmPlayer.paused) {
      if (bgmPlayer.ended || AE.blocked) return;
      if (t - AE.lastPlayAttempt > 3500) audioTryPlay();
      if (AE.playAttemptsNoProgress >= 3 && bgmPlayer.readyState >= 2) setAudioBlocked(true);
      return;
    }
    var ct = bgmPlayer.currentTime || 0;
    if (ct !== AE.lastTime) {
      AE.lastTime = ct;
      AE.lastProgressAt = t;
      return;
    }
    var stallLimit = currentRoomState.audioStreamUrl ? 25000 : 15000;
    if (t - AE.lastProgressAt > stallLimit) {
      audioHandleFailure('Áudio travado');
    }
  }, 2000);
}

// --- MOTOR DE SITE & PROXY ADIAŬ ---
function resolveEffectiveSiteUrl(rawUrl) {
  if (!rawUrl) return '';
  var str = String(rawUrl).replace(/^\s+|\s+$/g, '');
  if (!FORCE_DIRECT_IFRAME && /adiau\.com\.br\/v2\/information/i.test(str)) {
    return API_BASE + '/api/adiau/render?url=' + encodeURIComponent(str);
  }
  return str;
}

var activeIframeEffectiveUrl = '';

function activateSiteMode(url) {
  if (!url) return;
  currentRoomState.mode = 'site';
  currentRoomState.siteUrl = url;

  if (vTimeoutId) {
    clearTimeout(vTimeoutId);
    vTimeoutId = null;
  }
  if (ytPlayer && ytPlayer.destroy) {
    try { ytPlayer.destroy(); } catch (e) {}
    ytPlayer = null;
  }
  if (container) container.innerHTML = '';

  var effectiveUrl = resolveEffectiveSiteUrl(url);
  if (siteFrame) {
    if (activeIframeEffectiveUrl !== effectiveUrl) {
      activeIframeEffectiveUrl = effectiveUrl;
      siteFrame.src = effectiveUrl;
    }
    if (siteFrame.className.indexOf('visible') === -1) {
      siteFrame.className += ' visible';
    }
  }
  if (statusEl) statusEl.style.display = 'none';

  var reloadBtn = document.getElementById('btn-site-reload');
  if (reloadBtn) reloadBtn.style.display = 'flex';
}

function deactivateSiteMode() {
  if (siteFrame) {
    siteFrame.className = siteFrame.className.replace(/\bvisible\b/g, '').replace(/\s+/g, ' ');
    siteFrame.src = 'about:blank';
  }
  activeIframeEffectiveUrl = '';
  var reloadBtn = document.getElementById('btn-site-reload');
  if (reloadBtn) reloadBtn.style.display = 'none';
  currentRoomState.mode = 'playlist';
}

function reloadSiteFrame() {
  if (siteFrame && currentRoomState.siteUrl) {
    var effectiveUrl = resolveEffectiveSiteUrl(currentRoomState.siteUrl);
    var sep = effectiveUrl.indexOf('?') !== -1 ? '&' : '?';
    siteFrame.src = effectiveUrl + sep + '_r=' + (new Date().getTime());
  }
}

// --- MOTOR DE PLAYLIST VISUAL ---
function playNextVisual() {
  if (currentRoomState.mode === 'site' && currentRoomState.siteUrl) {
    return;
  }

  if (statusEl) statusEl.style.display = 'none';
  if (!visualItems || visualItems.length === 0) {
    if (container) container.innerHTML = '';
    showStatus('Aguardando conteúdo...');
    return;
  }

  if (vIndex >= visualItems.length) {
    if (visualPlaylist && visualPlaylist.loop !== false) {
      vIndex = 0;
    } else {
      if (container) container.innerHTML = '';
      showStatus('Fim da exibição.');
      return;
    }
  }

  var item = visualItems[vIndex];
  if (!item) return;

  if (ytPlayer && ytPlayer.destroy) {
    try { ytPlayer.destroy(); } catch (e) {}
    ytPlayer = null;
  }
  if (container) container.innerHTML = '';

  var rawItemUrl = String(item.url || '');
  var src = rawItemUrl.indexOf('http') === 0 ? rawItemUrl : (API_BASE + rawItemUrl);

  if (item.type === 'youtube') {
    ensureYouTubeApiLoaded();
    var ytContainer = document.createElement('div');
    ytContainer.id = 'yt-player';
    ytContainer.className = 'active';
    container.appendChild(ytContainer);

    var videoId = extractYtId(item.url) || 'dQw4w9WgXcQ';
    var tryPlayYt = function() {
      if (!isYtReady || typeof YT === 'undefined' || !YT.Player) {
        setTimeout(tryPlayYt, 150);
        return;
      }
      ytPlayer = new YT.Player('yt-player', {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          enablejsapi: 1,
          mute: 1
        },
        events: {
          onReady: function(event) {
            try { event.target.playVideo(); } catch (e) {}
          },
          onStateChange: function(event) {
            if (event.data === YT.PlayerState.ENDED) {
              vIndex++;
              playNextVisual();
            }
          },
          onError: function() {
            vIndex++;
            playNextVisual();
          }
        }
      });
    };
    tryPlayYt();
  } else if (item.type === 'video') {
    var video = document.createElement('video');
    video.src = src;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.className = 'active';
    video.onended = function() { vIndex++; playNextVisual(); };
    video.onerror = function() { vIndex++; playNextVisual(); };
    container.appendChild(video);
    try {
      var p = video.play();
      if (p && p.catch) p.catch(function() {});
    } catch (e) {}
  } else if (item.type === 'web' || item.type === 'website') {
    var iframe = document.createElement('iframe');
    iframe.src = resolveEffectiveSiteUrl(src);
    iframe.className = 'active';
    iframe.allow = 'autoplay; fullscreen; encrypted-media';
    container.appendChild(iframe);

    vImageRemainingMs = item.duration ? item.duration * 1000 : 15000;
    vImageStartTime = new Date().getTime();

    if (!vIsPaused) {
      if (vTimeoutId) clearTimeout(vTimeoutId);
      vTimeoutId = setTimeout(function() {
        vIndex++;
        playNextVisual();
      }, vImageRemainingMs);
    }
  } else {
    var img = document.createElement('img');
    img.src = src;
    img.className = 'active';
    container.appendChild(img);

    vImageRemainingMs = item.duration ? item.duration * 1000 : 8000;
    vImageStartTime = new Date().getTime();

    if (!vIsPaused) {
      if (vTimeoutId) clearTimeout(vTimeoutId);
      vTimeoutId = setTimeout(function() {
        vIndex++;
        playNextVisual();
      }, vImageRemainingMs);
    }
  }
}

// --- MODO STANDBY / BLACKOUT COM RELÓGIO E CLIMA UBERABA-MG ---
var STANDBY_SVGS = {
  sun: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
  moon: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
  cloudSun: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fcd34d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/></svg>',
  cloudMoon: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#bfdbfe" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.188 8.5A6 6 0 0 1 16 4a6 6 0 0 0-6 6c0 1.25.383 2.41 1.036 3.376"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/></svg>',
  cloud: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>',
  cloudRain: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>',
  cloudLightning: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973"/><path d="m13 12-3 5h4l-3 5"/></svg>',
  cloudFog: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 17H7"/><path d="M17 21H9"/></svg>'
};

function getStandbyWeatherVisuals(code, isDay) {
  if (code === 0) return { description: isDay ? 'Céu limpo' : 'Noite estrelada', iconSvg: isDay ? STANDBY_SVGS.sun : STANDBY_SVGS.moon };
  if (code === 1 || code === 2) return { description: 'Parcialmente nublado', iconSvg: isDay ? STANDBY_SVGS.cloudSun : STANDBY_SVGS.cloudMoon };
  if (code === 3) return { description: 'Nublado', iconSvg: STANDBY_SVGS.cloud };
  if (code === 45 || code === 48) return { description: 'Nevoeiro', iconSvg: STANDBY_SVGS.cloudFog };
  if (code >= 51 && code <= 57) return { description: 'Garoa / Chuvisco', iconSvg: STANDBY_SVGS.cloudRain };
  if (code >= 61 && code <= 67) return { description: code >= 65 ? 'Chuva forte' : 'Chuva', iconSvg: STANDBY_SVGS.cloudRain };
  if (code >= 80 && code <= 82) return { description: 'Pancadas de chuva', iconSvg: STANDBY_SVGS.cloudRain };
  if (code >= 95) return { description: 'Tempestade', iconSvg: STANDBY_SVGS.cloudLightning };
  return { description: 'Tempo estável', iconSvg: isDay ? STANDBY_SVGS.sun : STANDBY_SVGS.moon };
}

function formatStandbyDate(date) {
  var weekdayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  var monthNames = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return weekdayNames[date.getDay()] + ', ' + date.getDate() + ' de ' + monthNames[date.getMonth()] + ' de ' + date.getFullYear();
}

function tickStandbyClock() {
  var now = new Date();
  var hm = document.getElementById('standby-clock-hm');
  var sec = document.getElementById('standby-clock-sec');
  var dateEl = document.getElementById('standby-date');
  if (hm) hm.textContent = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
  if (sec) sec.textContent = ':' + pad2(now.getSeconds());
  if (dateEl) dateEl.textContent = formatStandbyDate(now);
}

function shiftStandbyAntiBurnIn() {
  var content = document.getElementById('standby-content');
  if (!content) return;
  var x = Math.floor(Math.random() * 25) - 12;
  var y = Math.floor(Math.random() * 17) - 8;
  var t = 'translate(' + x + 'px, ' + y + 'px)';
  content.style.webkitTransform = t;
  content.style.transform = t;
}

var lastStandbyWeatherFetch = 0;

function renderWeatherDom(weather) {
  if (!weather || weather.temperature === null || weather.temperature === undefined) {
    var dEl = document.getElementById('standby-weather-desc');
    if (dEl) dEl.textContent = 'Clima indisponível';
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
  if (tempEl) tempEl.textContent = weather.temperature + '°';
  if (descEl) descEl.textContent = visuals.description;
  var feelsTemp = (weather.apparentTemperature !== undefined && weather.apparentTemperature !== null) ? weather.apparentTemperature : weather.temperature;
  if (feelsEl) feelsEl.textContent = 'Sensação ' + feelsTemp + '°C';
  if (maxEl) maxEl.textContent = weather.tempMax + '°';
  if (minEl) minEl.textContent = weather.tempMin + '°';
  if (humEl) humEl.textContent = weather.humidity + '%';
}

function fetchStandbyWeather(force) {
  var now = new Date().getTime();
  if (!force && now - lastStandbyWeatherFetch < 10 * 60 * 1000) {
    return;
  }
  lastStandbyWeatherFetch = now;

  httpJson('GET', API_BASE + '/api/weather/uberaba', null, function(err, weather) {
    if (!err && weather && weather.temperature !== null && weather.temperature !== undefined) {
      renderWeatherDom(weather);
      return;
    }
    var directUrl = 'https://api.open-meteo.com/v1/forecast?latitude=-19.7483&longitude=-47.9319&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=America%2FSao_Paulo&forecast_days=1';
    httpJson('GET', directUrl, null, function(err2, raw) {
      if (err2 || !raw || !raw.current) {
        renderWeatherDom(null);
        return;
      }
      var cur = raw.current || {};
      var dly = raw.daily || {};
      var maxArr = dly.temperature_2m_max;
      var minArr = dly.temperature_2m_min;
      renderWeatherDom({
        temperature: Math.round(cur.temperature_2m || 0),
        apparentTemperature: Math.round(cur.apparent_temperature || 0),
        humidity: Math.round(cur.relative_humidity_2m || 0),
        weatherCode: cur.weather_code || 0,
        isDay: cur.is_day !== undefined ? cur.is_day : 1,
        tempMax: Math.round(maxArr && maxArr[0] !== undefined ? maxArr[0] : (cur.temperature_2m || 0)),
        tempMin: Math.round(minArr && minArr[0] !== undefined ? minArr[0] : (cur.temperature_2m || 0))
      });
    });
  });
}

var isStandbyActive = false;
var standbyClockInterval = null;
var standbyWeatherInterval = null;
var standbyJitterInterval = null;

function applyStandbyMode(active) {
  isStandbyActive = Boolean(active);
  var overlay = document.getElementById('standby-blackout-overlay');

  if (isStandbyActive) {
    if (overlay) {
      overlay.style.display = 'flex';
      if (overlay.className.indexOf('standby-visible') === -1) {
        overlay.className += ' standby-visible';
      }
    }
    tickStandbyClock();
    if (standbyClockInterval) clearInterval(standbyClockInterval);
    standbyClockInterval = setInterval(tickStandbyClock, 1000);

    fetchStandbyWeather(false);
    if (standbyWeatherInterval) clearInterval(standbyWeatherInterval);
    standbyWeatherInterval = setInterval(function() { fetchStandbyWeather(false); }, 10 * 60 * 1000);

    if (standbyJitterInterval) clearInterval(standbyJitterInterval);
    standbyJitterInterval = setInterval(shiftStandbyAntiBurnIn, 150000);

    syncAudioVolume();
  } else {
    if (overlay) {
      overlay.className = overlay.className.replace(/\bstandby-visible\b/g, '').replace(/\s+/g, ' ');
      setTimeout(function() {
        if (!isStandbyActive && overlay) {
          overlay.style.display = 'none';
        }
      }, 450);
    }
    if (standbyClockInterval) { clearInterval(standbyClockInterval); standbyClockInterval = null; }
    if (standbyWeatherInterval) { clearInterval(standbyWeatherInterval); standbyWeatherInterval = null; }
    if (standbyJitterInterval) { clearInterval(standbyJitterInterval); standbyJitterInterval = null; }

    syncAudioVolume();
    if (ENABLE_AUDIO && !aIsPaused && (currentRoomState.audioStreamUrl || audioItems.length > 0)) {
      resumeCurrentAudio();
    }
  }
}

// --- TRATAMENTO DE COMANDOS REMOTOS ---
function handleCommand(target, cmd, value) {
  if (target === 'site') {
    if (cmd === 'reload') {
      reloadSiteFrame();
    }
  } else if (target === 'visual') {
    if (cmd === 'next') {
      vIsPaused = false;
      if (vTimeoutId) { clearTimeout(vTimeoutId); vTimeoutId = null; }
      vIndex++;
      playNextVisual();
    } else if (cmd === 'prev') {
      vIsPaused = false;
      if (vTimeoutId) { clearTimeout(vTimeoutId); vTimeoutId = null; }
      vIndex--;
      if (vIndex < 0) vIndex = visualItems.length - 1;
      playNextVisual();
    } else if (cmd === 'pause') {
      vIsPaused = true;
      var item = visualItems[vIndex];
      if (item && item.type === 'video' && container) {
        var vid = container.querySelector('video');
        if (vid && vid.pause) vid.pause();
      } else if (item && item.type === 'youtube' && ytPlayer && ytPlayer.pauseVideo) {
        try { ytPlayer.pauseVideo(); } catch (e) {}
      } else if (item && vTimeoutId) {
        clearTimeout(vTimeoutId);
        vTimeoutId = null;
        vImageRemainingMs -= (new Date().getTime() - vImageStartTime);
      }
      var btn = document.getElementById('btn-v-play');
      if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
    } else if (cmd === 'play') {
      vIsPaused = false;
      var itemPlay = visualItems[vIndex];
      if (itemPlay && itemPlay.type === 'video' && container) {
        var vidPlay = container.querySelector('video');
        if (vidPlay && vidPlay.play) vidPlay.play();
      } else if (itemPlay && itemPlay.type === 'youtube' && ytPlayer && ytPlayer.playVideo) {
        try { ytPlayer.playVideo(); } catch (e) {}
      } else if (itemPlay) {
        vImageStartTime = new Date().getTime();
        vTimeoutId = setTimeout(function() {
          vIndex++;
          playNextVisual();
        }, vImageRemainingMs > 0 ? vImageRemainingMs : 1000);
      }
      var btnPlay = document.getElementById('btn-v-play');
      if (btnPlay) btnPlay.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
    }
  } else if (target === 'audio' && ENABLE_AUDIO) {
    if (cmd === 'setVolume' && value !== undefined) {
      setMasterVolume(value);
    } else if (cmd === 'setLoopMode' && value !== undefined) {
      currentRoomState.audioLoopMode = value;
    } else if (cmd === 'setShuffle' && value !== undefined) {
      currentRoomState.audioShuffle = Boolean(value);
    } else if (cmd === 'setTrackIndex' && value !== undefined) {
      var targetIdx = Number(value);
      AE.localAdvanceAt = 0;
      currentRoomState.currentAudioIndex = targetIdx;
      aIsPaused = false;
      if (targetIdx >= 0 && targetIdx < audioItems.length) {
        aIndex = targetIdx;
      }
      reconcileAudio();
    } else if (cmd === 'trackChanged' && value !== undefined) {
      var syncedIdx = Number(value);
      if (!isNaN(syncedIdx) && syncedIdx >= 0 && syncedIdx < audioItems.length && syncedIdx !== aIndex) {
        aIndex = syncedIdx;
        currentRoomState.currentAudioIndex = aIndex;
        reconcileAudio();
      }
    } else if (cmd === 'next' && audioItems.length > 0) {
      AE.localAdvanceAt = 0;
      aIsPaused = false;
      aIndex = (aIndex + 1) % audioItems.length;
      currentRoomState.currentAudioIndex = aIndex;
      reconcileAudio();
    } else if (cmd === 'prev' && audioItems.length > 0) {
      AE.localAdvanceAt = 0;
      aIsPaused = false;
      aIndex--;
      if (aIndex < 0) aIndex = audioItems.length - 1;
      currentRoomState.currentAudioIndex = aIndex;
      reconcileAudio();
    } else if (cmd === 'pause') {
      aIsPaused = true;
      reconcileAudio();
    } else if (cmd === 'play') {
      aIsPaused = false;
      reconcileAudio();
    }
  } else if (target === 'room') {
    if (cmd === 'setStandby') {
      applyStandbyMode(Boolean(value));
    }
  }
}

// --- OVERLAY DE CONTROLES NA TELA ---
var remoteTimeoutId = null;
var remoteOverlay = document.getElementById('remote-overlay');

function showRemote() {
  if (!remoteOverlay) return;
  if (remoteOverlay.className.indexOf('visible') === -1) {
    remoteOverlay.className += ' visible';
  }
  if (remoteTimeoutId) clearTimeout(remoteTimeoutId);
  remoteTimeoutId = setTimeout(function() {
    remoteOverlay.className = remoteOverlay.className.replace(/\bvisible\b/g, '').replace(/\s+/g, ' ');
  }, 3500);
}

document.addEventListener('mousemove', showRemote);
document.addEventListener('touchstart', showRemote);

function emitCommand(target, cmd, value) {
  if (!roomSlug) return;
  httpJson('POST', API_BASE + '/api/control/' + encodeURIComponent(roomSlug), {
    target: target,
    command: cmd,
    value: value
  }, function() {});
}

var btnVPrev = document.getElementById('btn-v-prev');
if (btnVPrev) btnVPrev.onclick = function() { emitCommand('visual', 'prev'); };
var btnVPlay = document.getElementById('btn-v-play');
if (btnVPlay) btnVPlay.onclick = function() { emitCommand('visual', vIsPaused ? 'play' : 'pause'); };
var btnVNext = document.getElementById('btn-v-next');
if (btnVNext) btnVNext.onclick = function() { emitCommand('visual', 'next'); };
var btnSiteReload = document.getElementById('btn-site-reload');
if (btnSiteReload) btnSiteReload.onclick = function() { reloadSiteFrame(); };

var btnAPrev = document.getElementById('btn-a-prev');
if (btnAPrev) btnAPrev.onclick = function() { emitCommand('audio', 'prev'); };
var btnAPlay = document.getElementById('btn-a-play');
if (btnAPlay) btnAPlay.onclick = function() { emitCommand('audio', aIsPaused ? 'play' : 'pause'); };
var btnANext = document.getElementById('btn-a-next');
if (btnANext) btnANext.onclick = function() { emitCommand('audio', 'next'); };

function showStatus(text) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.display = 'block';
}

function findPlaylistById(list, id) {
  if (!list || !id) return null;
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].id === id) return list[i];
  }
  return null;
}

// --- SINCRONIZAÇÃO DE ESTADO COM FILA FIFO ---
function applyRoomStateData(data, oldState, isInitial, done) {
  if (!data) {
    if (done) done();
    return;
  }

  if (data.standby !== undefined) {
    applyStandbyMode(Boolean(data.standby));
  }

  if (ENABLE_AUDIO && data.audioVolume !== undefined) {
    setMasterVolume(data.audioVolume);
  }

  var needsPlaylists = Boolean(data.playlist || (ENABLE_AUDIO && data.audioPlaylist));

  var finalizeVisualAndAudio = function(allPlaylists) {
    // 1. Sincroniza Áudio via Motor de Reconciliação
    if (ENABLE_AUDIO) {
      if (data.audioLoopMode !== undefined) currentRoomState.audioLoopMode = data.audioLoopMode;
      if (data.audioShuffle !== undefined) currentRoomState.audioShuffle = Boolean(data.audioShuffle);

      if (data.audioStreamUrl) {
        currentRoomState.audioStreamUrl = data.audioStreamUrl;
        aIsPaused = data.audioStatus !== 'playing';
      } else if (data.audioPlaylist && allPlaylists) {
        currentRoomState.audioStreamUrl = null;
        var ap = findPlaylistById(allPlaylists, data.audioPlaylist);
        if (ap && ap.items && ap.items.length > 0) {
          var savedIdx = data.currentAudioIndex !== undefined && data.currentAudioIndex !== null ? Number(data.currentAudioIndex) : 0;
          // Se este aparelho acabou de avançar de faixa nos últimos 10s, evita voltar para a faixa anterior enquanto o servidor processa trackChanged
          if (
            !isInitial &&
            AE.localAdvanceAt > 0 &&
            (nowMs() - AE.localAdvanceAt) < 10000 &&
            savedIdx === AE.localAdvanceFrom &&
            AE.localAdvanceTo >= 0 &&
            AE.localAdvanceTo < ap.items.length
          ) {
            savedIdx = AE.localAdvanceTo;
          } else if (savedIdx === AE.localAdvanceTo) {
            AE.localAdvanceAt = 0;
          }
          audioPlaylist = ap;
          audioItems = ap.items;
          aIndex = (savedIdx >= 0 && savedIdx < ap.items.length) ? savedIdx : 0;
          aIsPaused = data.audioStatus !== 'playing';
        } else {
          audioPlaylist = ap || null;
          audioItems = [];
          aIsPaused = true;
        }
      } else {
        currentRoomState.audioStreamUrl = null;
        audioPlaylist = null;
        audioItems = [];
        aIsPaused = true;
      }
      reconcileAudio();
    } else {
      reportCurrentAudioState();
    }

    // 2. Sincroniza Modo Site vs Visual
    if (data.mode === 'site' && data.siteUrl) {
      if (isInitial || !oldState || oldState.mode !== 'site' || oldState.siteUrl !== data.siteUrl) {
        activateSiteMode(data.siteUrl);
      }
      if (done) done();
      return;
    }

    if (oldState && oldState.mode === 'site') {
      deactivateSiteMode();
    }

    if (!data.playlist) {
      visualPlaylist = null;
      visualItems = [];
      if (container) container.innerHTML = '';
      showStatus('Sala inativa (Idle).');
      if (done) done();
      return;
    }

    var vp = findPlaylistById(allPlaylists, data.playlist);
    if (vp && vp.items && vp.items.length > 0) {
      var changedVp = !visualPlaylist || visualPlaylist.id !== vp.id || isInitial;
      visualPlaylist = vp;
      visualItems = vp.items;
      if (changedVp) {
        vIndex = 0;
        vIsPaused = data.visualStatus === 'paused';
        playNextVisual();
      } else if (vIndex >= visualItems.length) {
        vIndex = 0;
        playNextVisual();
      }
    } else {
      visualPlaylist = null;
      visualItems = [];
      if (container) container.innerHTML = '';
      showStatus('Playlist vazia.');
    }
    if (done) done();
  };

  if (needsPlaylists) {
    httpJson('GET', API_BASE + '/api/playlists', null, function(err, allPlaylists) {
      finalizeVisualAndAudio(err ? [] : (allPlaylists || []));
    });
  } else {
    finalizeVisualAndAudio([]);
  }
}

function fetchState() {
  if (!roomSlug) return;
  enqueuePlayerEvent(function(done) {
    httpJson('GET', API_BASE + '/api/state/' + encodeURIComponent(roomSlug), null, function(err, data) {
      if (err || !data) {
        showStatus('Sincronizando sala...');
        done();
        return;
      }
      var incomingVer = Number(data.version || 0);
      if (incomingVer > 0 && incomingVer < currentStateVersion) {
        done();
        return;
      }
      if (incomingVer > currentStateVersion) {
        currentStateVersion = incomingVer;
      }
      var oldState = assignObj({}, currentRoomState);
      currentRoomState = assignObj(currentRoomState, data);
      applyRoomStateData(data, oldState, true, done);
    });
  });
}

function updateStateSilently(providedState, explicitVersion) {
  if (!roomSlug) return;
  enqueuePlayerEvent(function(done) {
    var handleData = function(data) {
      if (!data) {
        done();
        return;
      }
      var ver = explicitVersion !== undefined && explicitVersion !== null
        ? Number(explicitVersion)
        : Number(data.version || 0);

      if (ver > 0 && ver < currentStateVersion) {
        done();
        return;
      }
      if (ver > currentStateVersion) {
        currentStateVersion = ver;
      }
      var oldState = assignObj({}, currentRoomState);
      currentRoomState = assignObj(currentRoomState, data);
      applyRoomStateData(data, oldState, false, done);
    };

    if (providedState) {
      handleData(providedState);
    } else {
      httpJson('GET', API_BASE + '/api/state/' + encodeURIComponent(roomSlug), null, function(err, fetched) {
        if (err || !fetched) {
          done();
          return;
        }
        handleData(fetched);
      });
    }
  });
}

// --- CONEXÃO WEBSOCKET + FALLBACK HTTP POLLING ---
var autoReconnect = true;
var activeRoomWs = null;
var isWsConnected = false;

function switchToRoomInPlace(newRoomSlug) {
  if (!newRoomSlug) return;
  if (reconnectCountdownTimer) {
    clearInterval(reconnectCountdownTimer);
    reconnectCountdownTimer = null;
  }
  safeSetStorage('signage_last_room', newRoomSlug);
  try {
    if (window.history && window.history.pushState) {
      window.history.pushState({}, '', '?room=' + encodeURIComponent(newRoomSlug) + (ENABLE_AUDIO ? '' : '&audio=0'));
    }
  } catch (e) {}

  if (activeRoomWs) {
    autoReconnect = false;
    try { activeRoomWs.close(); } catch (e) {}
    activeRoomWs = null;
  }
  if (hubWs) {
    try { hubWs.close(); } catch (e) {}
    hubWs = null;
  }
  var lobbyMenu = document.querySelector('.room-menu');
  if (lobbyMenu && lobbyMenu.parentNode) {
    lobbyMenu.parentNode.removeChild(lobbyMenu);
  }

  roomSlug = newRoomSlug;
  autoReconnect = true;
  currentStateVersion = 0;
  AE.key = '';
  AE.lastKey = '';
  AE.errorCount = 0;
  fetchState();
  connectWebSocket();
}

function reloadRoomInPlace() {
  if (!roomSlug) {
    window.location.reload();
    return;
  }
  // Se o áudio já foi destravado por gesto nesta sessão, recarrega mídia/iframe/estado
  // sem dar reload completo no documento (preservando a permissão de som do navegador da TV!)
  if (AE.primed) {
    currentStateVersion = 0;
    visualPlaylist = null;
    audioPlaylist = null;
    AE.key = '';
    AE.lastKey = '';
    AE.errorCount = 0;
    AE.pendingResume = 0;
    if (currentRoomState.mode === 'site') {
      reloadSiteFrame();
    }
    fetchState();
    return;
  }
  window.location.reload();
}

function returnToLobby(noticeMessage) {
  autoReconnect = false;
  isWsConnected = false;
  if (activeRoomWs) {
    try { activeRoomWs.close(); } catch (e) {}
    activeRoomWs = null;
  }
  aIsPaused = true;
  currentRoomState.audioStreamUrl = null;
  audioItems = [];
  reconcileAudio();
  if (vTimeoutId) { clearTimeout(vTimeoutId); vTimeoutId = null; }
  if (ytPlayer && ytPlayer.destroy) {
    try { ytPlayer.destroy(); } catch (e) {}
    ytPlayer = null;
  }
  if (container) container.innerHTML = '';
  deactivateSiteMode();
  applyStandbyMode(false);

  roomSlug = '';
  try {
    if (window.history && window.history.pushState) {
      window.history.pushState({}, '', window.location.pathname);
    }
  } catch (e) {}

  connectHubWebSocket();
  showRoomSelection(noticeMessage, true);
}

function connectWebSocket() {
  if (!roomSlug) return;
  if (typeof WebSocket === 'undefined') return;

  var wsProto = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
  var wsUrl = wsProto + window.location.host + '/ws/' + encodeURIComponent(roomSlug) + '?deviceId=' + encodeURIComponent(currentDeviceId);
  var ws;
  try {
    ws = new WebSocket(wsUrl);
  } catch (e) {
    return;
  }
  activeRoomWs = ws;
  var pingTimer = null;

  ws.onopen = function() {
    isWsConnected = true;
    setTimeout(function() { reportCurrentAudioState(true); }, 250);
    pingTimer = setInterval(function() {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'ping' })); } catch (e) {}
      }
    }, 25000);
  };

  ws.onmessage = function(event) {
    try {
      var data = JSON.parse(event.data);
      if (!data || data.type === 'pong') return;

      if (data.type === 'identify') {
        showDeviceIdentifyOverlay(data);
      } else if (data.type === 'bindRoom') {
        if (data.roomSlug && data.roomSlug !== roomSlug) {
          switchToRoomInPlace(data.roomSlug);
        } else if (!data.roomSlug && roomSlug) {
          safeSetStorage('signage_last_room', '');
          returnToLobby('Aparelho desvinculado pelo administrador.');
        }
      } else if (data.type === 'roomFull') {
        autoReconnect = false;
        try { ws.close(4002, 'Room Full'); } catch (e) {}
        showStatus(data.message || 'Limite de 2 dispositivos atingido para esta sala.');
        setTimeout(function() { returnToLobby(data.message); }, 3000);
      } else if (data.type === 'kickToLobby') {
        autoReconnect = false;
        try { ws.close(4001, 'Kicked to lobby'); } catch (e) {}
        returnToLobby(data.reason || 'Você foi retirado da sala pelo administrador.');
      } else if (data.type === 'reload') {
        reloadRoomInPlace();
      } else if (data.type === 'reloadSite') {
        reloadSiteFrame();
      } else if (data.type === 'roomDeleted') {
        showStatus('Esta sala foi excluída no painel.');
        setTimeout(function() { returnToLobby('Esta sala foi excluída no painel.'); }, 3000);
      } else if (data.type === 'stateSync' || data.type === 'updateState') {
        updateStateSilently(data.state, data.version);
      } else if (data.type === 'control') {
        // Se for comando de áudio mas a playlist ainda não estiver carregada na memória, sincroniza o estado completo
        if (
          data.target === 'audio' &&
          data.state &&
          data.state.audioPlaylist &&
          (!audioPlaylist || audioPlaylist.id !== data.state.audioPlaylist || audioItems.length === 0)
        ) {
          updateStateSilently(data.state, data.version);
          return;
        }
        enqueuePlayerEvent(function(done) {
          var ver = Number(data.version || 0);
          if (ver > currentStateVersion) {
            currentStateVersion = ver;
          }
          if (data.state) {
            currentRoomState = assignObj(currentRoomState, data.state);
            if (ENABLE_AUDIO && data.state.audioVolume !== undefined) {
              setMasterVolume(data.state.audioVolume);
            }
          }
          var cmdValue = data.value;
          if ((data.command === 'next' || data.command === 'prev') && data.state && data.state.currentAudioIndex !== undefined) {
            cmdValue = data.state.currentAudioIndex;
            handleCommand(data.target, 'setTrackIndex', cmdValue);
          } else {
            handleCommand(data.target, data.command, cmdValue);
          }
          done();
        });
      }
    } catch (e) {}
  };

  ws.onclose = function(event) {
    isWsConnected = false;
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    if (!autoReconnect || (event && (event.code === 4001 || event.code === 4002))) {
      return;
    }
    setTimeout(function() {
      if (autoReconnect && roomSlug) {
        connectWebSocket();
      }
    }, 3500);
  };
}

// Fallback HTTP Polling para TVs onde o WebSocket possa cair silenciosamente
setInterval(function() {
  if (roomSlug) {
    updateStateSilently(null, null);
  } else {
    registerDeviceWithServer();
  }
}, 10000);

// --- HUB WEBSOCKET (LOBBY) & REGISTRO DE APARELHO ---
var hubWs = null;
var hubPingInterval = null;

function connectHubWebSocket() {
  if (roomSlug || hubWs || typeof WebSocket === 'undefined') return;
  var wsProto = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
  var resStr = (window.screen ? window.screen.width : 1920) + 'x' + (window.screen ? window.screen.height : 1080);
  var url = wsProto + window.location.host + '/ws/hub?deviceId=' + encodeURIComponent(currentDeviceId) +
            '&path=' + encodeURIComponent(window.location.pathname) +
            '&res=' + encodeURIComponent(resStr);

  try {
    hubWs = new WebSocket(url);
    hubWs.onopen = function() {
      if (hubPingInterval) clearInterval(hubPingInterval);
      hubPingInterval = setInterval(function() {
        if (hubWs && hubWs.readyState === WebSocket.OPEN) {
          try { hubWs.send(JSON.stringify({ type: 'ping' })); } catch (e) {}
        }
      }, 25000);
    };
    hubWs.onmessage = function(event) {
      try {
        var data = JSON.parse(event.data);
        if (!data) return;
        if (data.type === 'identify') {
          showDeviceIdentifyOverlay(data);
        } else if (data.type === 'bindRoom' && data.roomSlug) {
          switchToRoomInPlace(data.roomSlug);
        } else if (data.type === 'reload') {
          window.location.reload();
        }
      } catch (e) {}
    };
    hubWs.onclose = function() {
      if (hubPingInterval) clearInterval(hubPingInterval);
      hubWs = null;
      if (!roomSlug) {
        setTimeout(connectHubWebSocket, 4000);
      }
    };
  } catch (e) {
    setTimeout(connectHubWebSocket, 5000);
  }
}

function registerDeviceWithServer() {
  var resStr = (window.screen ? window.screen.width : 1920) + 'x' + (window.screen ? window.screen.height : 1080);
  httpJson('POST', API_BASE + '/api/devices/register', {
    id: currentDeviceId,
    screenResolution: resStr,
    path: window.location.pathname + window.location.search,
    assignedRoomSlug: roomSlug || null
  }, function(err, data) {
    if (!err && !roomSlug && data && data.device && data.device.assignedRoomSlug) {
      switchToRoomInPlace(data.device.assignedRoomSlug);
    }
  });
}

// --- LOBBY DE SALAS & NAVEGAÇÃO POR CONTROLE REMOTO (D-PAD) ---
var reconnectCountdownTimer = null;
var dpadIndex = 0;

function getLobbyFocusableButtons() {
  var menu = document.querySelector('.room-menu');
  if (!menu) return [];
  var nodes = menu.querySelectorAll('button');
  var list = [];
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].offsetParent !== null) {
      list.push(nodes[i]);
    }
  }
  return list;
}

function setLobbyDpadFocus(idx) {
  var btns = getLobbyFocusableButtons();
  if (btns.length === 0) return;
  if (idx < 0) idx = btns.length - 1;
  if (idx >= btns.length) idx = 0;
  dpadIndex = idx;

  for (var i = 0; i < btns.length; i++) {
    btns[i].className = btns[i].className.replace(/\bdpad-focus\b/g, '').replace(/\s+/g, ' ');
  }
  var target = btns[dpadIndex];
  if (target) {
    target.className += ' dpad-focus';
    try { target.focus(); } catch (e) {}
    try {
      if (target.scrollIntoView) {
        target.scrollIntoView({ block: 'nearest' });
      }
    } catch (e) {}
  }
}

document.addEventListener('keydown', function(e) {
  var code = e.keyCode || e.which;
  var key = e.key || '';

  if (AE.blocked) {
    unlockAudioFromGesture();
    if (e.preventDefault) e.preventDefault();
    return;
  }

  if (isIdentifyModalOpen && (key === 'Enter' || code === 13 || code === 27)) {
    dismissIdentifyOverlay();
    if (e.preventDefault) e.preventDefault();
    return;
  }

  if (!roomSlug) {
    var btns = getLobbyFocusableButtons();
    if (btns.length === 0) return;

    if (key === 'ArrowDown' || key === 'Down' || code === 40 || key === 'ArrowRight' || key === 'Right' || code === 39) {
      if (e.preventDefault) e.preventDefault();
      setLobbyDpadFocus(dpadIndex + 1);
    } else if (key === 'ArrowUp' || key === 'Up' || code === 38 || key === 'ArrowLeft' || key === 'Left' || code === 37) {
      if (e.preventDefault) e.preventDefault();
      setLobbyDpadFocus(dpadIndex - 1);
    } else if (key === 'Enter' || code === 13) {
      var activeBtn = btns[dpadIndex];
      if (activeBtn) {
        if (e.preventDefault) e.preventDefault();
        activeBtn.click();
      }
    }
  }
});

function showRoomSelection(notice, skipCountdown) {
  if (reconnectCountdownTimer) {
    clearInterval(reconnectCountdownTimer);
    reconnectCountdownTimer = null;
  }

  showStatus('Carregando salas disponíveis...');

  httpJson('GET', API_BASE + '/api/rooms', null, function(err, rooms) {
    if (err || !rooms) {
      showStatus('Buscando salas disponíveis no servidor... (Reconectando em 3s)');
      setTimeout(function() {
        showRoomSelection(notice, skipCountdown);
      }, 3500);
      return;
    }

    var oldMenu = document.querySelector('.room-menu');
    if (oldMenu && oldMenu.parentNode) {
      oldMenu.parentNode.removeChild(oldMenu);
    }

    var menu = document.createElement('div');
    menu.className = 'room-menu';

    var noticeHtml = '';
    if (notice) {
      noticeHtml =
        '<div style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);color:#fca5a5;padding:12px 16px;border-radius:8px;font-size:13px;margin-bottom:20px;line-height:1.4;text-align:left;">' +
          '<span>' + notice + '</span>' +
        '</div>';
    }

    var lastRoomSlug = safeGetStorage('signage_last_room');
    var lastRoom = null;
    if (!skipCountdown && !notice && lastRoomSlug) {
      for (var i = 0; i < rooms.length; i++) {
        if (rooms[i] && rooms[i].slug === lastRoomSlug) {
          lastRoom = rooms[i];
          break;
        }
      }
    }

    var lastRoomCount = (lastRoom && lastRoom.clientsCount !== undefined) ? lastRoom.clientsCount : 0;
    var lastRoomMax = (lastRoom && lastRoom.maxClients !== undefined) ? lastRoom.maxClients : 2;
    var canAutoReconnect = Boolean(lastRoom && lastRoomCount < lastRoomMax);

    var autoReconnectHtml = '';
    if (canAutoReconnect) {
      autoReconnectHtml =
        '<div id="auto-reconnect-card" style="background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.35);border-radius:10px;padding:14px 18px;margin-bottom:22px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;">' +
          '<div style="text-align:left;margin-bottom:6px;">' +
            '<div style="color:#10b981;font-weight:bold;font-size:13px;">Reconexão Automática da TV</div>' +
            '<div style="color:#cbd5e1;font-size:13px;margin-top:3px;">Reconectando a <strong style="color:#fff;">' + lastRoom.name + '</strong> em <span id="countdown-val" style="color:#10b981;font-weight:bold;font-size:15px;">5</span>s...</div>' +
          '</div>' +
          '<div>' +
            '<button id="btn-now-countdown" class="lobby-action-btn" style="background:#10b981;color:#000;font-weight:bold;padding:8px 16px;border-radius:6px;font-size:12px;cursor:pointer;margin-right:8px;">Entrar Agora</button>' +
            '<button id="btn-cancel-countdown" class="lobby-action-btn" style="background:#262626;border:1px solid #404040;color:#d4d4d4;padding:8px 14px;border-radius:6px;font-size:12px;cursor:pointer;">Trocar de Sala</button>' +
          '</div>' +
        '</div>';
    }

    var modeLabel = ENABLE_AUDIO
      ? 'Modo Completo (Com Áudio)'
      : 'Modo Sem Áudio (Som Desativado nesta Tela)';

    menu.innerHTML =
      noticeHtml +
      autoReconnectHtml +
      '<h1>Lobby - Selecione uma Sala</h1>' +
      '<p style="color:#888;font-size:13px;margin-top:-10px;margin-bottom:20px;">Use as setas do controle remoto e pressione OK</p>' +
      '<div class="room-list"></div>' +
      '<div style="margin-top:16px;padding:12px 16px;background:#1a1a1a;border:1px solid #2e2e2e;border-radius:8px;font-size:12px;color:#9ca3af;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;">' +
        '<div>ID deste aparelho: <strong style="color:#34d399;font-family:monospace;font-size:13px;">' + currentDeviceId + '</strong></div>' +
        '<button id="btn-toggle-tv-lite" class="lobby-action-btn" style="background:#262626;border:1px solid #404040;color:#e5e7eb;padding:6px 12px;border-radius:6px;font-size:11px;cursor:pointer;">' +
          modeLabel +
        '</button>' +
      '</div>';

    var toggleLiteBtn = menu.querySelector('#btn-toggle-tv-lite');
    if (toggleLiteBtn) {
      toggleLiteBtn.onclick = function() {
        var nextDisabled = ENABLE_AUDIO ? '1' : '0';
        safeSetStorage('signage_audio_disabled', nextDisabled);
        window.location.replace('/player/index.html' + (nextDisabled === '1' ? '?audio=0' : '?audio=1'));
      };
    }

    var enterRoom = function(room) {
      switchToRoomInPlace(room.slug);
    };

    if (canAutoReconnect) {
      var secondsRemaining = 5;
      reconnectCountdownTimer = setInterval(function() {
        secondsRemaining--;
        var el = document.getElementById('countdown-val');
        if (el) el.textContent = String(secondsRemaining);
        if (secondsRemaining <= 0) {
          clearInterval(reconnectCountdownTimer);
          reconnectCountdownTimer = null;
          enterRoom(lastRoom);
        }
      }, 1000);

      var cancelBtn = menu.querySelector('#btn-cancel-countdown');
      if (cancelBtn) {
        cancelBtn.onclick = function() {
          if (reconnectCountdownTimer) {
            clearInterval(reconnectCountdownTimer);
            reconnectCountdownTimer = null;
          }
          var card = document.getElementById('auto-reconnect-card');
          if (card && card.parentNode) card.parentNode.removeChild(card);
          setLobbyDpadFocus(0);
        };
      }

      var nowBtn = menu.querySelector('#btn-now-countdown');
      if (nowBtn) {
        nowBtn.onclick = function() {
          enterRoom(lastRoom);
        };
      }
    }

    var list = menu.querySelector('.room-list');
    if (rooms.length === 0) {
      list.innerHTML = '<p style="color:#888;font-size:14px;">Nenhuma sala configurada no sistema.</p>';
    }

    for (var rIdx = 0; rIdx < rooms.length; rIdx++) {
      (function(room) {
        var count = room.clientsCount !== undefined ? room.clientsCount : 0;
        var max = room.maxClients !== undefined ? room.maxClients : 2;
        var isFull = count >= max;

        var btn = document.createElement('button');
        btn.className = 'room-btn';
        btn.setAttribute('tabindex', '0');
        if (isFull) {
          btn.style.background = '#262626';
          btn.style.color = '#737373';
          btn.style.borderColor = '#404040';
        }
        btn.innerHTML =
          '<div style="display:flex;justify-content:space-between;align-items:center;width:100%;">' +
            '<span>' + room.name + '</span>' +
            '<span style="font-size:12px;font-weight:normal;background:rgba(0,0,0,0.45);color:#fff;padding:4px 10px;border-radius:6px;">' +
              count + '/' + max + ' telas' + (isFull ? ' • Cheia' : '') +
            '</span>' +
          '</div>';
        btn.onclick = function() {
          if (isFull) {
            alert('A sala "' + room.name + '" já atingiu o limite de ' + max + ' telas conectadas.');
            return;
          }
          enterRoom(room);
        };
        list.appendChild(btn);
      })(rooms[rIdx]);
    }

    if (statusEl) statusEl.style.display = 'none';
    document.body.appendChild(menu);
    setLobbyDpadFocus(0);
  });
}

// --- INICIALIZAÇÃO DO PLAYER ---
registerDeviceWithServer();

if (!roomSlug) {
  connectHubWebSocket();
  showRoomSelection(null, false);
} else {
  safeSetStorage('signage_last_room', roomSlug);
  fetchState();
  connectWebSocket();
}
