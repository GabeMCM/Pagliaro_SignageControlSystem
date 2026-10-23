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
    <div className="flex h-full flex-col items-center justify-center p-4 pb-20 md:p-8 md:pb-12 text-neutral-100 font-sans antialiased overflow-y-auto">
      <div className="w-full max-w-md space-y-4 text-center">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-neutral-400 font-semibold">
            Painel Signage
          </div>
          <h1 className="mt-1.5 text-xl font-bold tracking-tight text-white">
            Selecione uma Sala
          </h1>
          <p className="mt-0.5 text-xs text-neutral-400">
            Escolha uma sala para gerenciar o site exibido e as músicas de fundo.
          </p>
        </div>

        {isLoading ? (
          <div className="p-6 text-xs text-neutral-500">Carregando salas...</div>
        ) : rooms.length > 0 ? (
          <div className="space-y-2 text-left">
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
                  className="group flex items-center justify-between p-3 rounded-[2px] border border-neutral-800 bg-neutral-900/40 hover:border-neutral-600 hover:bg-neutral-900/80 transition shadow-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-[2px] bg-neutral-900 text-neutral-300 border border-neutral-800 group-hover:border-neutral-600 transition">
                      <Tv className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-bold text-white group-hover:text-white transition truncate">
                        {room.name}
                      </div>
                      <div className="text-[11px] text-neutral-400 truncate flex items-center gap-1.5 mt-0.5">
                        <Circle
                          className={`h-2 w-2 flex-shrink-0 ${
                            online
                              ? isFull
                                ? "fill-amber-400 text-amber-400"
                                : "fill-emerald-400 text-emerald-400"
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
          <div className="p-6 rounded-[2px] border border-dashed border-neutral-800 text-xs text-neutral-500">
            Nenhuma sala cadastrada. Use o menu lateral para criar sua primeira sala.
          </div>
        )}
      </div>
    </div>
  );
}
