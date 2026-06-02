import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Signage CMS" },
      { name: "description", content: "Self-hosted digital signage control plane." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-100 font-mono">
      <div className="max-w-md px-8 text-center">
        <div className="text-[10px] uppercase tracking-[0.4em] text-emerald-400">
          Signage Control
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          Broadcast operator
        </h1>
        <p className="mt-3 text-sm text-neutral-400">
          Manage rooms, playlists, and trigger content changes on connected screens.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            to="/admin"
            className="rounded bg-emerald-500 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-black hover:bg-emerald-400"
          >
            Open Admin
          </Link>
          <a
            href="/player/index.html"
            className="rounded border border-neutral-800 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-neutral-300 hover:border-neutral-600"
          >
            Open Player
          </a>
        </div>
      </div>
    </div>
  );
}
