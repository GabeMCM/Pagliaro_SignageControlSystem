import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { Tv, Radio, Monitor, Check, ExternalLink, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Signage Control System" },
      { name: "description", content: "Self-hosted digital signage control plane and smart kiosk player." },
    ],
  }),
  component: Index,
});

function generateHardwareFingerprint(): string {
  try {
    const components: string[] = [];
    if (typeof navigator !== "undefined") {
      components.push(navigator.userAgent || "");
      components.push(navigator.platform || "");
      components.push(String(navigator.hardwareConcurrency || ""));
      components.push(navigator.language || "");
    }
    if (typeof screen !== "undefined") {
      components.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);
    }
    if (typeof Intl !== "undefined" && Intl.DateTimeFormat) {
      try {
        components.push(Intl.DateTimeFormat().resolvedOptions().timeZone || "");
      } catch (_e) {}
    }
    try {
      const canvas = document.createElement("canvas");
      const gl = (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) as any;
      if (gl) {
        const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
        if (debugInfo) {
          components.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "");
        }
      }
    } catch (_e) {}

    const str = components.join("|||");
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    let hex = (hash >>> 0).toString(16);
    while (hex.length < 8) hex = "0" + hex;

    let prefix = "dev_";
    const ua = (typeof navigator !== "undefined" ? (navigator.userAgent || "") : "").toLowerCase();
    if (ua.includes("tizen")) prefix = "samsung_";
    else if (ua.includes("webos") || ua.includes("netcast")) prefix = "lg_";
    else if (ua.includes("android") && ua.includes("tv")) prefix = "androidtv_";
    else if (ua.includes("windows")) prefix = "pc_";
    else if (ua.includes("macintosh") || ua.includes("mac os")) prefix = "mac_";
    else if (ua.includes("linux")) prefix = "linux_";

    return prefix + hex;
  } catch (_e) {
    return "dev_" + Math.random().toString(36).substring(2, 10);
  }
}

function getPersistentDeviceId(): string {
  try {
    let id = localStorage.getItem("signage_device_id");
    if (!id) {
      const match = document.cookie.match(/(?:^|; )signage_device_id=([^;]*)/);
      if (match && match[1]) id = decodeURIComponent(match[1]);
    }
    if (!id) {
      id = generateHardwareFingerprint();
    }
    localStorage.setItem("signage_device_id", id);
    document.cookie = `signage_device_id=${encodeURIComponent(id)}; max-age=315360000; path=/; SameSite=Lax`;
    return id;
  } catch (_e) {
    return generateHardwareFingerprint();
  }
}

function playIdentifyChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
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

function Index() {
  const [deviceId] = useState(() => getPersistentDeviceId());
  const [registeredDevice, setRegisteredDevice] = useState<any>(null);
  const [identifyModal, setIdentifyModal] = useState<any>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [autoRedirectCancelled, setAutoRedirectCancelled] = useState(false);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    // 1. Registra o aparelho no backend
    fetch("/api/devices/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: deviceId,
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        path: "/",
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.device) {
          setRegisteredDevice(data.device);
          // Se o aparelho já tiver sala vinculada, inicia contagem regressiva para abrir a TV
          if (data.device.assignedRoomSlug && !autoRedirectCancelled) {
            setCountdown(4);
          }
        }
      })
      .catch((err) => console.warn("Erro ao registrar dispositivo:", err));

    // 2. Conecta ao WebSocket do Hub Global
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/hub?deviceId=${encodeURIComponent(deviceId)}&path=/&res=${window.screen.width}x${window.screen.height}`;
    let ws: WebSocket | null = null;
    let pingInterval: any = null;

    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        pingInterval = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "identify") {
            playIdentifyChime();
            setIdentifyModal(msg);
          } else if (msg.type === "bindRoom") {
            if (msg.roomSlug) {
              localStorage.setItem("signage_last_room", msg.roomSlug);
              window.location.href = `/player/index.html?room=${encodeURIComponent(msg.roomSlug)}`;
            }
          } else if (msg.type === "reload") {
            window.location.reload();
          }
        } catch (_e) {}
      };
    } catch (_e) {}

    return () => {
      if (pingInterval) clearInterval(pingInterval);
      if (ws) {
        try {
          ws.close();
        } catch (_e) {}
      }
    };
  }, [deviceId, autoRedirectCancelled]);

  // Contagem regressiva de redirecionamento para TVs com sala vinculada
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      if (registeredDevice?.assignedRoomSlug) {
        localStorage.setItem("signage_last_room", registeredDevice.assignedRoomSlug);
        window.location.href = `/player/index.html?room=${encodeURIComponent(registeredDevice.assignedRoomSlug)}`;
      }
      return;
    }

    timerRef.current = setTimeout(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [countdown, registeredDevice]);

  // Timer do Modal de Identificação
  useEffect(() => {
    if (!identifyModal) return;
    const dur = (identifyModal.duration || 15) * 1000;
    const timeout = setTimeout(() => setIdentifyModal(null), dur);
    return () => clearTimeout(timeout);
  }, [identifyModal]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-100 font-sans p-4 relative overflow-hidden select-none">
      {/* Background Decorativo */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.15),rgba(255,255,255,0))]" />

      {/* Modal de Identificação Remota se acionado pelo operador */}
      {identifyModal && (
        <div
          onClick={() => setIdentifyModal(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in"
        >
          <div className="bg-neutral-900 border-2 border-emerald-500 rounded-2xl p-8 max-w-lg w-full text-center shadow-[0_0_50px_rgba(16,185,129,0.4)]">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-4 animate-pulse">
              <Radio className="h-4 w-4" />
              <span>Sinal de Identificação Remota</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              {identifyModal.name || "Aparelho Identificado"}
            </h2>
            <div className="mt-2 font-mono text-emerald-400 bg-black/60 px-3 py-1.5 rounded border border-emerald-500/30 text-sm inline-block">
              {identifyModal.deviceId || deviceId}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-2 text-left text-xs bg-neutral-950/60 p-3 rounded-lg border border-neutral-900">
              <div>
                <span className="text-neutral-500 block uppercase">Sala</span>
                <span className="font-semibold text-neutral-200">{identifyModal.room || "Nenhuma (Na Raiz)"}</span>
              </div>
              <div>
                <span className="text-neutral-500 block uppercase">IP</span>
                <span className="font-semibold text-neutral-200">{identifyModal.ip || "--"}</span>
              </div>
            </div>
            <p className="mt-6 text-xs text-neutral-400">
              Clique em qualquer lugar da tela para fechar este aviso.
            </p>
          </div>
        </div>
      )}

      {/* Conteúdo Principal */}
      <div className="relative z-10 max-w-md w-full bg-neutral-900/90 border border-neutral-900 p-6 sm:p-8 rounded-2xl shadow-2xl text-center backdrop-blur-md">
        <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-emerald-400 font-bold bg-emerald-950/40 border border-emerald-500/30 px-3 py-1 rounded-full">
          <Monitor className="h-3.5 w-3.5" />
          <span>Signage Control Plane</span>
        </div>

        <h1 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight text-white">
          Central de Exibição
        </h1>
        <p className="mt-2 text-xs sm:text-sm text-neutral-400 leading-relaxed">
          Este dispositivo está registrado no sistema e pronto para conexões de TVs ou gerenciamento remoto.
        </p>

        {/* Card de Identificação do Aparelho */}
        <div className="mt-6 p-3.5 rounded-xl bg-neutral-950/80 border border-neutral-900 text-left text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-neutral-400 uppercase tracking-wider text-[10px] font-semibold">Identificador deste Aparelho</span>
            <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-400 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Online no Hub
            </span>
          </div>
          <div className="mt-1.5 font-mono text-emerald-300 bg-neutral-900 px-2.5 py-1.5 rounded border border-neutral-900 text-xs flex items-center justify-between">
            <span>{deviceId}</span>
            <span className="text-[10px] text-neutral-500">{window.screen.width}x{window.screen.height}</span>
          </div>
          {registeredDevice?.name && (
            <div className="mt-2 text-[11px] text-neutral-300">
              Nome salvo: <strong className="text-white">{registeredDevice.name}</strong>
            </div>
          )}
        </div>

        {/* Banner de Auto-Redirect se a TV estiver vinculada a uma sala */}
        {countdown !== null && registeredDevice?.assignedRoomSlug && (
          <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-200">
            <div className="font-semibold text-emerald-300 flex items-center justify-center gap-1.5">
              <Tv className="h-4 w-4" />
              <span>Aparelho vinculado a: {registeredDevice.assignedRoomName || registeredDevice.assignedRoomSlug}</span>
            </div>
            <div className="mt-1 text-[11px] text-neutral-400">
              Iniciando visualização da TV em <strong className="text-white text-sm">{countdown}</strong>s...
            </div>
            <button
              onClick={() => {
                setCountdown(null);
                setAutoRedirectCancelled(true);
              }}
              className="mt-2 px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[11px] transition"
            >
              Cancelar e permanecer aqui
            </button>
          </div>
        )}

        {/* Botões de Acesso */}
        <div className="mt-6 flex flex-col sm:flex-row gap-2.5">
          <Link
            to="/admin"
            className="flex-1 min-h-[44px] rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold uppercase tracking-wider text-black hover:bg-emerald-400 transition flex items-center justify-center gap-2 shadow"
          >
            <span>Painel Admin</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="/player/index.html"
            className="flex-1 min-h-[44px] rounded-lg border border-neutral-900 hover:border-neutral-500 bg-neutral-800/60 px-4 py-2 text-xs font-bold uppercase tracking-wider text-neutral-200 hover:text-white transition flex items-center justify-center gap-2"
          >
            <span>Abrir Player</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

