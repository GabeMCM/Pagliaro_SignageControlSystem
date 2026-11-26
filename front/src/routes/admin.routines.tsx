import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/admin/routines")({
  head: () => ({ meta: [{ title: "Painel de Controle • Pagliaro Signage" }] }),
  component: AdminRoutinesRedirect,
});

function AdminRoutinesRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: "/admin" });
  }, [navigate]);

  return (
    <div className="flex h-full items-center justify-center p-6 text-neutral-400 font-mono text-xs">
      Módulo de rotinas descontinuado. Redirecionando para as salas...
    </div>
  );
}
