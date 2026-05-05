import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';

const AUDIT_KEY = SHARED_DOCUMENT_KEYS.executiveAudit;

export const AUDIT_SEVERITY = {
  info: { label: 'Informativo', color: '#2563eb', background: '#eff6ff' },
  warning: { label: 'Atencion', color: '#b45309', background: '#fff7ed' },
  critical: { label: 'Critico', color: '#b91c1c', background: '#fef2f2' },
  success: { label: 'Confirmado', color: '#059669', background: '#ecfdf5' },
};

function safeText(value) {
  return String(value || '').trim();
}

function pickChangedFields(before = {}, after = {}) {
  const changes = [];
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  keys.forEach((key) => {
    const previousValue = before?.[key];
    const nextValue = after?.[key];
    if (JSON.stringify(previousValue) !== JSON.stringify(nextValue)) {
      changes.push({
        field: key,
        before: previousValue ?? '',
        after: nextValue ?? '',
      });
    }
  });
  return changes;
}

export function buildAuditEntry({
  action,
  module,
  entityType,
  entityId,
  title,
  description,
  severity = 'info',
  actor,
  before = null,
  after = null,
  meta = {},
} = {}) {
  const normalizedSeverity = AUDIT_SEVERITY[severity] ? severity : 'info';
  const actorId = safeText(actor?.id);
  const actorName = safeText(actor?.full_name || actor?.name || actor?.username) || 'Sistema';
  const actorRole = safeText(actor?.role) || '';
  const actorUsername = safeText(actor?.username) || '';

  return {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    created_at: new Date().toISOString(),
    action: safeText(action) || 'ACCION',
    module: safeText(module) || 'General',
    entity_type: safeText(entityType) || 'Registro',
    entity_id: safeText(entityId) || '',
    title: safeText(title) || 'Movimiento registrado',
    description: safeText(description) || '',
    severity: normalizedSeverity,
    actor_id: actorId,
    actor_name: actorName,
    actor_role: actorRole,
    actor_username: actorUsername,
    changes: pickChangedFields(before || {}, after || {}),
    before: before || null,
    after: after || null,
    meta: meta || {},
  };
}

export async function appendAuditEntry(entryLike) {
  const entry = buildAuditEntry(entryLike);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = await loadSharedDocument(AUDIT_KEY, []);
    const next = [entry, ...(Array.isArray(current) ? current : [])].slice(0, 5000);
    try {
      await saveSharedDocument(AUDIT_KEY, next);
      break;
    } catch (error) {
      if (error?.response?.status !== 409 || attempt === 1) throw error;
    }
  }
  return entry;
}

export function getAuditSeverityStyle(severity) {
  return AUDIT_SEVERITY[severity] || AUDIT_SEVERITY.info;
}

export function formatAuditActor(entry) {
  const actor = safeText(entry?.actor_name) || 'Sistema';
  const role = safeText(entry?.actor_role);
  return role ? `${actor} (${role})` : actor;
}
