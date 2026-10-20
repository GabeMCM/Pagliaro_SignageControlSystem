import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { signageApi } from "@/lib/signage-api";
import { Tv, Circle, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/admin/")({
  component: AdminHome,
});

function AdminHome() {
  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ["rooms"],
    queryFn: signageApi.listRooms,
    refetchInterval: 3000,
  });

  return (
    <div className="flex h-full flex-col items-center justify-center p-4 md:p-8 text-neutral-100 font-mono overflow-y-auto">
      <div className="w-full max-w-md space-y-6 text-center">
        <div>
          <div className="text-[10px] uppercase tracking-[0.4em] text-emerald-400">
            Painel Signage
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
            Selecione uma Sala
          </h1>
          <p className="mt-1 text-xs text-neutral-400">
            Escolha uma sala para gerenciar o site exibido e as músicas de fundo.
          </p>
        </div>

        {isLoading ? (
          <div className="p-8 text-xs text-neutral-500">Carregando salas...</div>
        ) : rooms.length > 0 ? (
          <div className="space-y-2.5 text-left">
            {rooms.map((room) => {
              const online = Boolean(room.online);
              const clientsCount = room.clientsCount ?? 0;
              const maxClients = room.maxClients ?? 2;
              const isFull = clientsCount >= maxClients;
              return (
                <Link
                  key={room.slug}
                  to="/admin/$slug"
                  params={{ slug: room.slug }}
                  className="group flex items-center justify-between p-4 rounded-xl border border-neutral-800 bg-neutral-900/50 hover:border-emerald-500/60 hover:bg-neutral-900 transition shadow-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2.5 rounded-lg bg-neutral-800 group-hover:bg-emerald-500/10 text-neutral-400 group-hover:text-emerald-400 transition">
                      <Tv className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white group-hover:text-emerald-400 transition truncate">
                        {room.name}
                      </div>
                      <div className="text-[11px] text-neutral-500 truncate flex items-center gap-1.5 mt-0.5">
                        <Circle
                          className={`h-2 w-2 flex-shrink-0 ${
                            online
                              ? isFull
                                ? "fill-amber-400 text-amber-400 animate-pulse"
                                : "fill-emerald-400 text-emerald-400 animate-pulse"
                              : "fill-neutral-600 text-neutral-600"
                          }`}
                        />
                        <span>
                          {online
                            ? `Online (${clientsCount}/${maxClients} TVs${isFull ? " • Cheia" : ""})`
                            : `Offline (0/${maxClients} TVs)`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <ArrowRight className="h-4 w-4 text-neutral-500 group-hover:text-white group-hover:translate-x-0.5 transition flex-shrink-0 ml-2" />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="p-8 rounded-xl border border-dashed border-neutral-800 text-xs text-neutral-500">
            Nenhuma sala cadastrada. Use o menu lateral para criar sua primeira sala.
          </div>
        )}
      </div>
    </div>
  );
}
