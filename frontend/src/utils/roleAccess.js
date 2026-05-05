export const ROLE_HIERARCHY = {
  INGENIERO: 6,
  PLANNER: 5,
  ENCARGADO: 4,
  TECNICO: 3,
  SUPERVISOR: 2,
  OPERADOR: 1,
};

export const ROLE_COLORS = {
  INGENIERO: '#7c3aed',
  PLANNER: '#2563eb',
  ENCARGADO: '#0891b2',
  TECNICO: '#059669',
  SUPERVISOR: '#ea580c',
  OPERADOR: '#64748b',
};

export const ROLE_LABELS = {
  INGENIERO: 'Ingeniero',
  PLANNER: 'Planner',
  ENCARGADO: 'Encargado',
  TECNICO: 'Tecnico',
  SUPERVISOR: 'Supervisor',
  OPERADOR: 'Operador',
};

export const ROLE_ICONS = {
  INGENIERO: '👷',
  PLANNER: '📋',
  ENCARGADO: '🔑',
  TECNICO: '🔧',
  SUPERVISOR: '🛡️',
  OPERADOR: '🧾',
};

export const ROLES = ['INGENIERO', 'PLANNER', 'ENCARGADO', 'TECNICO', 'SUPERVISOR', 'OPERADOR'];
export const READ_ONLY_ROLES = ['SUPERVISOR', 'OPERADOR'];
export const NOTICE_CREATOR_ROLES = ['SUPERVISOR', 'OPERADOR'];

export function getUserRole(userOrRole) {
  if (!userOrRole) return '';
  return String(typeof userOrRole === 'string' ? userOrRole : userOrRole.role || '').toUpperCase();
}

export function hasMinRole(userOrRole, minRole) {
  const current = ROLE_HIERARCHY[getUserRole(userOrRole)] || 0;
  const required = ROLE_HIERARCHY[String(minRole || '').toUpperCase()] || 0;
  return current >= required;
}

export function isReadOnlyRole(userOrRole) {
  return READ_ONLY_ROLES.includes(getUserRole(userOrRole));
}

export function canCreateMaintenanceNotices(userOrRole) {
  return NOTICE_CREATOR_ROLES.includes(getUserRole(userOrRole));
}

export function canReviewMaintenanceNotices(userOrRole) {
  return hasMinRole(userOrRole, 'ENCARGADO');
}
