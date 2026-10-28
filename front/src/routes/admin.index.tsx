import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { signageApi } from "@/lib/signage-api";
import { Monitor, Circle, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Salas & Painéis • Pagliaro Signage" },
      { name: "description", content: "Visão geral e seleção de salas para controle de exibição." },
    ],
  }),
  component: AdminHome,
});

function AdminHome() {
  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ["rooms"],
    queryFn: signageApi.listRooms,
    refetchInterval: 3000,
  });

  const totalOnline = rooms.filter((r) => r.online).length;

  return (
    <div className="flex h-full flex-col justify-start sm:justify-center items-center p-3 sm:p-8 text-neutral-100 font-sans antialiased overflow-y-auto">
      <div className="w-full max-w-lg space-y-4 pt-4 sm:pt-0">
        {/* Header da Seleção de Salas */}
        <div className="text-left border-b border-neutral-900 pb-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-[0.25em] text-neutral-400 font-mono font-bold">
              PAINEL DE CONTROLE
            </span>
            <span className="text-[10px] font-mono text-neutral-400">
              {totalOnline}/{rooms.length} Salas Ativas
            </span>
          </div>
          <h1 className="mt-1 text-base sm:text-lg font-bold tracking-tight text-white uppercase font-mono">
            Salas Cadastradas
          </h1>
          <p className="mt-0.5 text-xs text-neutral-400">
            Selecione uma sala para gerenciar o conteúdo exibido, trilha sonora e automações.
          </p>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-xs text-neutral-400 font-mono">
            Carregando salas...
          </div>
        ) : rooms.length > 0 ? (
          <div className="divide-y divide-neutral-900 border border-neutral-900 bg-neutral-950">
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
                  className="group flex items-center justify-between p-3.5 hover:bg-neutral-900 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 bg-neutral-900 text-neutral-300 flex items-center justify-center flex-shrink-0 group-hover:text-white border border-neutral-850">
                      <Monitor className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-semibold text-white tracking-tight truncate">
                        {room.name}
                      </div>
                      <div className="text-[10px] font-mono text-neutral-400 truncate flex items-center gap-2 mt-0.5">
                        <span className="flex items-center gap-1.5">
                          <Circle
                            className={`h-1.5 w-1.5 flex-shrink-0 ${
                              online
                                ? isFull
                                  ? "fill-amber-400 text-amber-400"
                                  : "fill-emerald-400 text-emerald-400"
                                : "fill-neutral-700 text-neutral-700"
                            }`}
                          />
                          <span>
                            {online
                              ? `${clientsCount}/${maxClients} TVs online${isFull ? " (Cheia)" : ""}`
                              : "Nenhuma TV conectada"}
                          </span>
                        </span>
                        <span>•</span>
                        <span className="text-neutral-400">{room.slug}</span>
                      </div>
                    </div>
                  </div>

                  <ArrowRight className="h-3.5 w-3.5 text-neutral-400 group-hover:text-white group-hover:translate-x-0.5 transition flex-shrink-0 ml-3" />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center border border-neutral-900 bg-neutral-950 text-xs text-neutral-400">
            Nenhuma sala cadastrada no sistema. Use o menu lateral ou inferior para criar uma sala.
          </div>
        )}
      </div>
    </div>
  );
}
