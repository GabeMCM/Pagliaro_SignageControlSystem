import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/")({
  component: AdminHome,
});

function AdminHome() {
  return (
    <div className="flex h-full items-center justify-center text-neutral-600 font-mono">
      <div className="text-center">
        <div className="text-[10px] uppercase tracking-[0.4em] text-neutral-700">
          No room selected
        </div>
        <div className="mt-2 text-sm text-neutral-500">
          Pick a room from the sidebar to start operating.
        </div>
      </div>
    </div>
  );
}
