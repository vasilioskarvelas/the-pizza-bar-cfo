import React from 'react';
import { useAccess, hasPermission, isOwner, isPlatformAdmin, hasOrgAccess, canAudit } from '@/lib/accessService';
import { ShieldAlert } from 'lucide-react';

// Inline / action guard. Renders children only when the access context satisfies
// every supplied requirement; otherwise renders a denied notice. UI hiding is not
// security — backend functions re-validate independently.
export function Can({ requirePermission, requireOwner, requireAdmin, requireOrgMember, requireAudit, children, fallback = null }) {
  const ctx = useAccess();
  if (!ctx) return null;
  if (requireOrgMember && !hasOrgAccess(ctx)) return fallback || <Denied what="organisation membership" />;
  if (requireOwner && !isOwner(ctx)) return fallback || <Denied what="owner role" />;
  if (requireAdmin && !isPlatformAdmin(ctx)) return fallback || <Denied what="administrator access" />;
  if (requireAudit && !canAudit(ctx)) return fallback || <Denied what="audit access" />;
  if (requirePermission && !hasPermission(ctx, requirePermission)) return fallback || <Denied what={`permission: ${requirePermission}`} />;
  return children;
}

function Denied({ what }) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/5 border border-rose-500/20 text-rose-300 text-sm">
      <ShieldAlert className="w-4 h-4 shrink-0" />
      <span>Access denied — requires {what}.</span>
    </div>
  );
}

export default Can;