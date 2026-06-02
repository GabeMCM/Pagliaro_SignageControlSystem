// Vanilla JS player. Zero deps. Runs on old SmartTV browsers.
// URL: /player/index.html?room=<slug>
// Behavior:
//  1. Parse room slug from URL
//  2. Fetch GET /api/state/:slug to learn current playlist id
//  3. Fetch GET /api/playlists, find the playlist, play items in fullscreen loop
//  4. Open WS /ws/:slug; on { type:"reload" }, location.reload()

(function () {
  "use strict";

  var qs = new URLSearchParams(location.search);
  var slug = qs.get("room");
  var apiBase = qs.get("api") || ""; // empty = same origin
  var stage = document.getElementById("stage");
  var idle = document.getElementById("idle");
  var idleText = document.getElementById("status-text");
  var idleDot = document.getElementById("status-dot");
  var badge = document.getElementById("badge");

  badge.textContent = slug ? "ROOM · " + slug : "NO ROOM";

  if (!slug) {
    idleText.textContent = "Missing ?room= parameter";
    return;
  }

  function setIdle(msg, live) {
    idle.style.display = "flex";
    stage.innerHTML = "";
    idleText.textContent = msg;
    idleDot.className = "dot" + (live ? " live" : "");
  }

  function hideIdle() {
    idle.style.display = "none";
  }

  function fetchJSON(path) {
    return fetch(apiBase + path, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  // ----- Playback engine -----
  var currentItems = [];
  var index = 0;
  var loop = true;
  var imageTimer = null;

  function playNext() {
    if (imageTimer) { clearTimeout(imageTimer); imageTimer = null; }
    if (!currentItems.length) { setIdle("Idle", true); return; }

    if (index >= currentItems.length) {
      if (loop) { index = 0; } else { setIdle("End of playlist", true); return; }
    }

    var item = currentItems[index++];
    hideIdle();
    stage.innerHTML = "";

    var type = item.type;
    if (!type) {
      type = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(item.url) ? "video" : "image";
    }

    if (type === "video") {
      var v = document.createElement("video");
      v.src = item.url;
      v.autoplay = true;
      v.muted = true; // required for autoplay on most TVs
      v.playsInline = true;
      v.setAttribute("playsinline", "");
      v.onended = playNext;
      v.onerror = function () { console.error("video error", item.url); playNext(); };
      stage.appendChild(v);
      var p = v.play();
      if (p && p.catch) p.catch(function (e) { console.warn("play() rejected", e); });
    } else {
      var img = document.createElement("img");
      img.src = item.url;
      img.onerror = function () { console.error("image error", item.url); playNext(); };
      stage.appendChild(img);
      var dur = (item.duration && item.duration > 0 ? item.duration : 8) * 1000;
      imageTimer = setTimeout(playNext, dur);
    }
  }

  function loadAndPlay() {
    setIdle("Loading…", false);
    fetchJSON("/api/state/" + encodeURIComponent(slug))
      .then(function (state) {
        if (!state || !state.playlist) { setIdle("Idle", true); return; }
        return fetchJSON("/api/playlists").then(function (lists) {
          var pl = (lists || []).find(function (p) { return p.id === state.playlist; });
          if (!pl) { setIdle("Playlist not found", true); return; }
          currentItems = pl.items || [];
          loop = pl.loop !== false;
          index = 0;
          playNext();
        });
      })
      .catch(function (err) {
        console.error(err);
        setIdle("Backend unreachable — retrying", false);
        setTimeout(loadAndPlay, 4000);
      });
  }

  // ----- WebSocket: listen for reload command -----
  var ws = null;
  var wsRetry = 1000;

  function openWS() {
    var proto = location.protocol === "https:" ? "wss:" : "ws:";
    var host = apiBase ? apiBase.replace(/^https?:/, proto) : proto + "//" + location.host;
    var url = host + "/ws/" + encodeURIComponent(slug);
    try {
      ws = new WebSocket(url);
    } catch (e) {
      console.error("WS open failed", e);
      setTimeout(openWS, wsRetry);
      wsRetry = Math.min(wsRetry * 2, 15000);
      return;
    }

    ws.onopen = function () {
      console.log("WS connected", url);
      wsRetry = 1000;
    };
    ws.onmessage = function (ev) {
      try {
        var msg = JSON.parse(ev.data);
        if (msg && msg.type === "reload") {
          console.log("reload command received");
          location.reload();
        }
      } catch (e) { /* ignore non-json frames */ }
    };
    ws.onclose = function () {
      console.warn("WS closed, retrying in", wsRetry);
      setTimeout(openWS, wsRetry);
      wsRetry = Math.min(wsRetry * 2, 15000);
    };
    ws.onerror = function (e) { console.warn("WS error", e); };
  }

  // Boot
  loadAndPlay();
  openWS();
})();
