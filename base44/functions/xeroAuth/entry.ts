import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { publishEvent, writeAudit, assertOwnership } from "../../shared/authEvents.ts";
import { CONN_EVENT } from "../../shared/ingestion.ts";

// Xero OAuth 2.0 lifecycle. Real code; returns a clear config error until the
// builder provisions XERO_CLIENT_ID / XERO_CLIENT_SECRET / XERO_REDIRECT_URI.
Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const d = user.data || {};
    const orgId = d.organisation_id || user.organisation_id;
    const systemRole = d.system_role || user.system_role;
    const isAdmin = user.role === "admin" || systemRole === "owner" || systemRole === "system";
    if (!orgId || !isAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = url.searchParams.get("action") || body.action;
    const cid = Deno.env.get("XERO_CLIENT_ID");
    const csec = Deno.env.get("XERO_CLIENT_SECRET");
    const redirect = Deno.env.get("XERO_REDIRECT_URI") || `${url.origin}/api/functions/xeroAuth/prod`;
    const S = base44.asServiceRole.entities;

    if (action === "authorize") {
      if (!cid) return Response.json({ error: "Xero credentials not configured" }, { status: 503 });
      const state = `${orgId}:${user.id}`;
      const authUrl = `https://login.xero.com/identity/connect/authorize?response_type=code&client_id=${cid}&redirect_uri=${encodeURIComponent(redirect)}&scope=offline_access%20accounting.transactions.read&state=${encodeURIComponent(state)}`;
      return Response.json({ authorize_url: authUrl, state });
    }
    if (action === "callback") {
      if (!cid || !csec) return Response.json({ error: "Xero credentials not configured" }, { status: 503 });
      const code = body.code;
      if (!code) return Response.json({ error: "missing code" }, { status: 400 });
      const tok = await fetch("https://identity.xero.com/connect/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirect, client_id: cid, client_secret: csec }),
      });
      if (!tok.ok) { const t = await tok.text(); return Response.json({ error: "token exchange failed", detail: t.slice(0, 200) }, { status: 400 }); }
      const tokens = await tok.json();
      let conn = (await S.Connector.filter({ organisation_id: orgId, source_system: "xero", connector_type: "oauth" }))[0];
      if (!conn) conn = await S.Connector.create({ organisation_id: orgId, source_system: "xero", name: "Xero", connector_type: "oauth", auth_ref: tokens.refresh_token, status: "active", config: JSON.stringify({}) });
      else await S.Connector.update(conn.id, { auth_ref: tokens.refresh_token, status: "active" });
      await publishEvent(base44, { orgId, eventKey: CONN_EVENT.CONNECTED, entityId: conn.id, message: "Xero connected", actorUserId: user.id });
      await writeAudit(base44, { orgId, actionType: "create", entityType: "Connector", entityId: conn.id, actorUserId: user.id, afterState: "connected", reason: "xero oauth callback" });
      return Response.json({ ok: true, connector_id: conn.id });
    }
    if (action === "refresh") {
      if (!cid || !csec) return Response.json({ error: "Xero credentials not configured" }, { status: 503 });
      const g = await assertOwnership(base44, "Connector", body.connector_id, { orgId });
      if (!g.ok) return Response.json({ error: g.error }, { status: g.status });
      const conn = g.record;
      if (!conn.auth_ref) return Response.json({ error: "connector not authenticated" }, { status: 400 });
      const tok = await fetch("https://identity.xero.com/connect/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: conn.auth_ref, client_id: cid, client_secret: csec, scope: "offline_access accounting.transactions.read" }),
      });
      if (!tok.ok) { const t = await tok.text(); return Response.json({ error: "refresh failed", detail: t.slice(0, 200) }, { status: 400 }); }
      const tokens = await tok.json();
      if (tokens.refresh_token) await S.Connector.update(conn.id, { auth_ref: tokens.refresh_token });
      await publishEvent(base44, { orgId, eventKey: CONN_EVENT.TOKEN_REFRESHED, entityId: conn.id, message: "Xero token refreshed", actorUserId: user.id });
      return Response.json({ ok: true, expires_in: tokens.expires_in });
    }
    if (action === "disconnect") {
      const g = await assertOwnership(base44, "Connector", body.connector_id, { orgId });
      if (!g.ok) return Response.json({ error: g.error }, { status: g.status });
      const conn = g.record;
      await S.Connector.update(conn.id, { status: "disabled", auth_ref: null });
      await publishEvent(base44, { orgId: conn.organisation_id, eventKey: CONN_EVENT.DISCONNECTED, entityId: conn.id, message: "Xero disconnected", actorUserId: user.id });
      await writeAudit(base44, { orgId: conn.organisation_id, actionType: "delete", entityType: "Connector", entityId: conn.id, actorUserId: user.id, afterState: "disconnected", reason: "xero disconnect" });
      return Response.json({ ok: true });
    }
    return Response.json({ error: "unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});