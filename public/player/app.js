const urlParams = new URLSearchParams(window.location.search);
let roomSlug = urlParams.get('room');
const API_BASE = window.location.origin;

const statusEl = document.getElementById('status');
const container = document.getElementById('media-container');

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

const bgmPlayer = new Audio();
bgmPlayer.onended = () => {
  aIndex++;
  playNextAudio();
};
bgmPlayer.onerror = () => {
  console.warn("Audio Error, skipping...");
  aIndex++;
  playNextAudio();
};

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
  }, 100);
}

function updateDucking(active) {
  duckingActive = active;
  if (!audioItems[aIndex] || aIsPaused) return;
  const baseVol = (audioItems[aIndex].volume !== undefined) ? audioItems[aIndex].volume / 100 : 1;
  const target = active ? baseVol * 0.1 : baseVol;
  fadeBgmVolume(target);
}

function playNextAudio() {
  if (audioItems.length === 0) {
    bgmPlayer.pause();
    return;
  }
  
  if (aIndex >= audioItems.length) {
    if (audioPlaylist.loop) {
      aIndex = 0;
    } else {
      bgmPlayer.pause();
      return;
    }
  }

  const item = audioItems[aIndex];
  const src = item.url.startsWith('http') ? item.url : `${API_BASE}${item.url}`;
  
  if (bgmPlayer.src !== src) {
    bgmPlayer.src = src;
  }
  
  const baseVol = (item.volume !== undefined) ? item.volume / 100 : 1;
  bgmPlayer.volume = duckingActive ? baseVol * 0.1 : baseVol;

  if (!aIsPaused) {
    bgmPlayer.play().catch(e => {
      console.warn("BGM autoplay blocked:", e);
      requireUserInteraction("Áudio Bloqueado pelo Navegador");
    });
  }
}

function playNextVisual() {
  statusEl.style.display = 'none';
  if (visualItems.length === 0) {
    container.innerHTML = '';
    return;
  }
  
  if (vIndex >= visualItems.length) {
    if (visualPlaylist.loop) {
      vIndex = 0;
    } else {
      container.innerHTML = '';
      showStatus("Fim da exibição visual.");
      return;
    }
  }

  const item = visualItems[vIndex];
  container.innerHTML = '';
  const src = item.url.startsWith('http') ? item.url : `${API_BASE}${item.url}`;

  // Se visual pausado via prev/next, forçamos o play por conveniência
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
                if (ytPlayer && ytPlayer.getPlayerState() === YT.PlayerState.UNSTARTED) {
                  requireUserInteraction("YouTube Autoplay Bloqueado");
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
    video.muted = item.muted === true;
    video.volume = item.volume !== undefined ? item.volume / 100 : 1;
    video.className = 'active';
    video.onended = () => { vIndex++; playNextVisual(); };
    video.onerror = () => { vIndex++; playNextVisual(); };
    container.appendChild(video);

  } else {
    // Image
    updateDucking(false); // Images don't have sound
    
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

// --- CONTROLS & STATE ---
function handleCommand(target, cmd) {
  if (target === 'visual') {
    if (visualItems.length === 0) return;
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
      } else if (item && item.type === 'image' && vTimeoutId) {
        clearTimeout(vTimeoutId); vTimeoutId = null;
        vImageRemainingMs -= (Date.now() - vImageStartTime);
      }
      document.getElementById('btn-v-play').innerHTML = '<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
    } else if (cmd === 'play') {
      vIsPaused = false;
      const item = visualItems[vIndex];
      if (item && item.type === 'video') {
        const vid = container.querySelector('video');
        if (vid) vid.play();
      } else if (item && item.type === 'youtube' && ytPlayer && ytPlayer.playVideo) {
        ytPlayer.playVideo();
      } else if (item && item.type === 'image') {
        vImageStartTime = Date.now();
        vTimeoutId = setTimeout(() => { vIndex++; playNextVisual(); }, vImageRemainingMs > 0 ? vImageRemainingMs : 1000);
      }
      document.getElementById('btn-v-play').innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
    }
  } else if (target === 'audio') {
    if (audioItems.length === 0) return;
    if (cmd === 'next') {
      aIsPaused = false;
      aIndex++; playNextAudio();
      document.getElementById('btn-a-play').innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
    } else if (cmd === 'prev') {
      aIsPaused = false;
      aIndex--; if (aIndex < 0) aIndex = audioItems.length - 1;
      playNextAudio();
      document.getElementById('btn-a-play').innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
    } else if (cmd === 'pause') {
      aIsPaused = true;
      bgmPlayer.pause();
      document.getElementById('btn-a-play').innerHTML = '<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
    } else if (cmd === 'play') {
      aIsPaused = false;
      bgmPlayer.play();
      document.getElementById('btn-a-play').innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
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
  }, 3000);
}

document.addEventListener('mousemove', showRemote);
document.addEventListener('touchstart', showRemote);

async function emitCommand(target, cmd) {
  try {
    await fetch(`${API_BASE}/api/control/${roomSlug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, command: cmd })
    });
  } catch (e) {
    console.error('Failed to emit command', e);
  }
}

document.getElementById('btn-v-prev')?.addEventListener('click', () => emitCommand('visual', 'prev'));
document.getElementById('btn-v-play')?.addEventListener('click', () => emitCommand('visual', vIsPaused ? 'play' : 'pause'));
document.getElementById('btn-v-next')?.addEventListener('click', () => emitCommand('visual', 'next'));

document.getElementById('btn-a-prev')?.addEventListener('click', () => emitCommand('audio', 'prev'));
document.getElementById('btn-a-play')?.addEventListener('click', () => emitCommand('audio', aIsPaused ? 'play' : 'pause'));
document.getElementById('btn-a-next')?.addEventListener('click', () => emitCommand('audio', 'next'));


// --- INITIALIZATION ---
async function fetchState() {
  try {
    const res = await fetch(`${API_BASE}/api/state/${roomSlug}`);
    const data = await res.json();
    
    if (!data.playlist && !data.audioPlaylist) {
      showStatus("Sala inativa.");
      return;
    }

    const plRes = await fetch(`${API_BASE}/api/playlists`);
    const allPlaylists = await plRes.json();
    
    // Process Visual
    if (data.playlist) {
      const p = allPlaylists.find(x => x.id === data.playlist);
      if (p && p.items.length > 0) {
        visualPlaylist = p;
        visualItems = p.items;
        vIndex = 0;
        playNextVisual();
      } else {
        container.innerHTML = '';
      }
    } else {
      visualItems = [];
      container.innerHTML = '';
    }

    // Process Audio
    if (data.audioPlaylist) {
      const p = allPlaylists.find(x => x.id === data.audioPlaylist);
      if (p && p.items.length > 0) {
        audioPlaylist = p;
        audioItems = p.items;
        aIndex = 0;
        playNextAudio();
      } else {
        bgmPlayer.pause();
      }
    } else {
      audioItems = [];
      bgmPlayer.pause();
    }
  } catch (err) {
    showStatus("Erro ao buscar estado da sala.");
  }
}

async function updateStateSilently() {
  try {
    const res = await fetch(`${API_BASE}/api/state/${roomSlug}`);
    const data = await res.json();
    const plRes = await fetch(`${API_BASE}/api/playlists`);
    const allPlaylists = await plRes.json();

    // Check Visual changes
    if (data.playlist !== (visualPlaylist ? visualPlaylist.id : null)) {
      if (data.playlist) {
        const p = allPlaylists.find(x => x.id === data.playlist);
        if (p && p.items.length > 0) {
          visualPlaylist = p;
          visualItems = p.items;
          vIndex = 0;
          vIsPaused = false;
          playNextVisual();
        } else {
          visualPlaylist = null;
          visualItems = [];
          container.innerHTML = '';
        }
      } else {
        visualPlaylist = null;
        visualItems = [];
        container.innerHTML = '';
      }
    }

    // Check Audio changes
    if (data.audioPlaylist !== (audioPlaylist ? audioPlaylist.id : null)) {
      if (data.audioPlaylist) {
        const p = allPlaylists.find(x => x.id === data.audioPlaylist);
        if (p && p.items.length > 0) {
          audioPlaylist = p;
          audioItems = p.items;
          aIndex = 0;
          aIsPaused = false;
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
    }
  } catch (e) {
    console.error("Hot reload failed", e);
  }
}

function showStatus(text) {
  statusEl.textContent = text;
  statusEl.style.display = 'block';
}

function connectWebSocket() {
  const wsUrl = API_BASE.replace('http', 'ws');
  const ws = new WebSocket(`${wsUrl}/ws/${roomSlug}`);
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "reload") {
        location.reload();
      } else if (data.type === "updateState") {
        updateStateSilently();
      } else if (data.type === "control" && data.command && data.target) {
        handleCommand(data.target, data.command);
      }
    } catch (e) {}
  };
  
  ws.onclose = () => setTimeout(connectWebSocket, 3000);
}

// Interaction Overlay
let overlayShown = false;
function requireUserInteraction(reason) {
  if (overlayShown) return;
  overlayShown = true;
  
  const overlay = document.createElement('div');
  overlay.id = 'interaction-overlay';
  overlay.style = "position:absolute;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:20px;";
  overlay.innerHTML = `
    <h2 style="color:white;">${reason}</h2>
    <button style="padding:15px 30px;font-size:1.5rem;background:#10b981;color:black;border:none;border-radius:10px;cursor:pointer;">Clique para Iniciar Mídia</button>
  `;
  
  overlay.querySelector('button').onclick = () => {
    overlay.remove();
    overlayShown = false;
    // Resume Visual
    const vItem = visualItems[vIndex];
    if (vItem && vItem.type === 'youtube' && ytPlayer && ytPlayer.playVideo) ytPlayer.playVideo();
    else if (vItem && vItem.type === 'video') { const vid = container.querySelector('video'); if (vid) vid.play(); }
    
    // Resume Audio
    if (!aIsPaused && audioItems.length > 0) bgmPlayer.play();
  };
  document.body.appendChild(overlay);
}

if (!roomSlug) {
  showRoomSelection();
} else {
  fetchState();
  connectWebSocket();
}

async function showRoomSelection() {
  showStatus("Carregando salas disponíveis...");
  const res = await fetch(`${API_BASE}/api/rooms`);
  const rooms = await res.json();
  statusEl.style.display = 'none';
  
  const menu = document.createElement('div');
  menu.className = 'room-menu';
  menu.innerHTML = `<h1>Selecione uma Sala</h1><div class="room-list"></div>`;
  const list = menu.querySelector('.room-list');
  
  if (rooms.length === 0) list.innerHTML = '<p style="color: #666; font-size: 14px;">Nenhuma sala configurada.</p>';
  rooms.forEach(room => {
    const btn = document.createElement('button');
    btn.className = 'room-btn';
    btn.textContent = room.name;
    btn.onclick = () => {
      window.history.pushState({}, '', '?room=' + room.slug);
      roomSlug = room.slug;
      fetchState();
      connectWebSocket();
      menu.remove();
    };
    list.appendChild(btn);
  });
  document.body.appendChild(menu);
}
