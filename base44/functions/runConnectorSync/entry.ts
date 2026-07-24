import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { runImportPipeline, makeFetch } from "../../shared/ingestion.ts";

// Manual sync (admin) and scheduled sync (platform-invoke, trigger=scheduled).
// Manual: requires authenticated admin. Scheduled: no user, trigger must be
// "scheduled" (trusts the platform's internal invocation channel).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    const body = await req.json().catch(() => ({}));
    const trigger = body.trigger || "manual";

    let orgId = null;
    if (user) {
      const d = user.data || {};
      orgId = d.organisation_id || user.organisation_id;
      const systemRole = d.system_role || user.system_role;
      const isAdmin = user.role === "admin" || systemRole === "owner" || systemRole === "system";
      if (!orgId || !isAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });
    } else {
      if (trigger !== "scheduled") return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const S = base44.asServiceRole.entities;
    let connectors = [];
    if (body.connector_id) {
      const c = await S.Connector.get(body.connector_id);
      if (!c) return Response.json({ error: "Connector not found" }, { status: 404 });
      connectors = [c];
    } else {
      connectors = await S.Connector.filter(orgId ? { organisation_id: orgId, status: "active" } : { status: "active" });
    }

    const results = [];
    for (const c of connectors) {
      if (c.status !== "active") { results.push({ connector_id: c.id, status: "skipped", reason: c.status }); continue; }
      try {
        const fetchRecords = makeFetch(base44, c);
        const r = await runImportPipeline(base44, { connector: c, trigger, actorUserId: user?.id || "scheduled", fetchRecords });
        results.push({ connector_id: c.id, ...r });
      } catch (e) {
        results.push({ connector_id: c.id, status: "failed", error: e.message });
      }
    }
    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});