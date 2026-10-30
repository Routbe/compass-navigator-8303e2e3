import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TeamTab } from "@/components/settings/TeamTab";
import { activateScopeFromUrl, claimCleanWorkspaceSlug, getWorkspaceContext } from "@/lib/workspaces.functions";
import { getActiveScopeStorage } from "@/lib/assets.functions";
import { canManageTeam, planAllowsCleanSlug } from "@/lib/workspace-rules";

export const Route = createFileRoute("/_authenticated/studio_/w/$workspaceSlug/settings")({
  head: () => ({
    meta: [
      { title: "Workspace-instellingen | ROUT Studio" },
      { name: "description", content: "Team, adres en opslag van je ROUT-workspace." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Workspace-instellingen | ROUT Studio" },
      { property: "og:description", content: "Team, adres en opslag van je ROUT-workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkspaceSettings,
});

const mb = (b: number) => `${Math.round(b / 1024 / 1024)} MB`;

/** Workspace-only settings: team, clean address and the workspace's own storage quota. */
function WorkspaceSettings() {
  const { workspaceSlug } = Route.useParams();
  const activate = useServerFn(activateScopeFromUrl);
  const ctxFn = useServerFn(getWorkspaceContext);
  const storageFn = useServerFn(getActiveScopeStorage);
  const qc = useQueryClient();
  const [state, setState] = useState<"loading" | "ready" | "denied">("loading");

  useEffect(() => {
    let alive = true;
    void activate({ data: { workspaceSlug } })
      .then(() => { if (alive) { qc.clear(); setState("ready"); } })
      .catch(() => alive && setState("denied"));
    return () => { alive = false; };
  }, [activate, qc, workspaceSlug]);

  const ctx = useQuery({ queryKey: ["workspace-context"], queryFn: () => ctxFn(), enabled: state === "ready" });
  const storage = useQuery({ queryKey: ["scope-storage", workspaceSlug], queryFn: () => storageFn(), enabled: state === "ready" });
  const ws = ctx.data?.workspaces.find((w) => w.slug === workspaceSlug) ?? null;

  if (state === "denied") return <p className="p-8 text-center text-sm text-muted-foreground">Geen toegang tot deze workspace.</p>;
  if (state === "loading" || ctx.isLoading) return <p className="p-8 text-center text-sm text-muted-foreground">Workspace laden…</p>;
  if (!ws) return <p className="p-8 text-center text-sm text-muted-foreground">Workspace niet gevonden.</p>;

  const s = storage.data;
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold">{ws.name}</h1>
        <p className="text-sm text-muted-foreground">rout.be/w/{ws.slug}</p>
      </header>

      <section className="space-y-2 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-medium">Opslag van deze workspace</h2>
        {s ? (
          <>
            <p className="text-sm text-muted-foreground">{mb(s.usedBytes)} / {mb(s.quotaBytes)} gebruikt</p>
            {s.message && <p className="text-sm text-destructive">{s.message}</p>}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Opslag laden…</p>
        )}
      </section>

      {canManageTeam(ws.role) && <CleanSlugCard workspaceId={ws.id} plan={ws.plan} currentSlug={ws.slug} />}

      {canManageTeam(ws.role) ? (
        <TeamTab workspaceId={ws.id} workspaceName={ws.name} />
      ) : (
        <p className="text-sm text-muted-foreground">Alleen eigenaars en admins beheren het team.</p>
      )}
    </main>
  );
}

function CleanSlugCard({ workspaceId, plan, currentSlug }: { workspaceId: string; plan: string; currentSlug: string }) {
  const claim = useServerFn(claimCleanWorkspaceSlug);
  const navigate = useNavigate();
  const [slug, setSlug] = useState(currentSlug.replace(/-[a-z0-9]{4}$/, ""));
  const [busy, setBusy] = useState(false);
  const paid = planAllowsCleanSlug(plan);

  async function save() {
    setBusy(true);
    try {
      const res = await claim({ data: { workspaceId, slug } });
      toast.success("Workspace-adres bijgewerkt");
      void navigate({ to: "/studio/w/$workspaceSlug/settings", params: { workspaceSlug: res.slug }, replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <h2 className="font-medium">Schone workspace-naam</h2>
      {paid ? (
        <>
          <p className="text-sm text-muted-foreground">Met Plus of Pro kun je het willekeurige achtervoegsel weghalen.</p>
          <div className="flex gap-2">
            <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} aria-label="Nieuw workspace-adres" />
            <Button onClick={save} disabled={busy || slug === currentSlug}>Opslaan</Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Gratis workspaces houden een achtervoegsel van 4 tekens. Upgrade naar Plus of Pro voor een schoon adres.</p>
      )}
    </section>
  );
}
