export function getEquipmentLabel(equipo) {
  if (!equipo) return 'N.A.';
  return [equipo.codigo, equipo.descripcion].filter(Boolean).join(' | ') || String(equipo.id || 'Equipo');
}

export function getNodeLabel(node) {
  if (!node) return 'N.A.';
  return [node.codigo_sub, node.nombre].filter(Boolean).join(' | ') || String(node.id || 'Subequipo');
}

export function getSubtreeIds(rootId, nodes = []) {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
        ids.add(node.id);
        changed = true;
      }
    }
  }
  return ids;
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

export function applyEquipmentExchange(equipos = [], payload = {}) {
  const sourceId = Number(payload.sourceId);
  const targetId = Number(payload.targetId);
  const nodeId = payload.nodeId;

  if (!sourceId || !targetId || !nodeId || sourceId === targetId) {
    throw new Error('Selecciona equipo origen, subequipo y equipo destino para registrar el intercambio.');
  }

  const sourceEq = equipos.find((eq) => Number(eq.id) === sourceId);
  const targetEq = equipos.find((eq) => Number(eq.id) === targetId);
  if (!sourceEq || !targetEq) {
    throw new Error('No se encontro el equipo origen o destino del intercambio.');
  }

  const sourceNodes = Array.isArray(sourceEq.despiece) ? sourceEq.despiece : [];
  const nodeToMove = sourceNodes.find((node) => String(node.id) === String(nodeId));
  if (!nodeToMove) {
    throw new Error('No se encontro el subequipo seleccionado.');
  }

  const subtreeIds = getSubtreeIds(nodeToMove.id, sourceNodes);
  const subtreeNodes = sourceNodes.filter((node) => subtreeIds.has(node.id));
  const childrenByParent = {};
  subtreeNodes.forEach((node) => {
    const key = node.parentId || '__root__';
    childrenByParent[key] = childrenByParent[key] || [];
    childrenByParent[key].push(node);
  });

  const cloneBranch = (oldNode, newParentId) => {
    const newId = `${Date.now()}_${randomSuffix()}`;
    const cloned = {
      ...oldNode,
      id: newId,
      parentId: newParentId,
      codigo_sub: oldNode.codigo_sub,
      equipo_origen_intercambio: sourceEq.codigo || '',
      fecha_intercambio: new Date().toISOString(),
    };
    const children = childrenByParent[oldNode.id] || [];
    return children.reduce(
      (all, child) => all.concat(cloneBranch(child, newId)),
      [cloned],
    );
  };

  const clonedNodes = cloneBranch(nodeToMove, null);
  const nextEquipos = equipos.map((eq) => {
    if (Number(eq.id) === sourceId) {
      return { ...eq, despiece: (eq.despiece || []).filter((node) => !subtreeIds.has(node.id)) };
    }
    if (Number(eq.id) === targetId) {
      return { ...eq, despiece: [...(eq.despiece || []), ...clonedNodes] };
    }
    return eq;
  });

  const record = {
    id: `${Date.now()}_${randomSuffix()}`,
    fecha: new Date().toISOString(),
    sourceEquipo: sourceEq.codigo || getEquipmentLabel(sourceEq),
    sourceEquipoDescripcion: sourceEq.descripcion || '',
    targetEquipo: targetEq.codigo || getEquipmentLabel(targetEq),
    targetEquipoDescripcion: targetEq.descripcion || '',
    nodeName: nodeToMove.nombre || getNodeLabel(nodeToMove),
    oldCode: nodeToMove.codigo_sub || 'N.A.',
    newCode: nodeToMove.codigo_sub || 'N.A.',
    levelsMigrated: clonedNodes.length,
    otNumero: payload.otNumero || '',
    motivo: payload.motivo || '',
    registradoEn: payload.registradoEn || 'Intercambios',
    registradoPor: payload.registradoPor || '',
  };

  return { equipos: nextEquipos, record, sourceEq, targetEq, nodeToMove };
}
