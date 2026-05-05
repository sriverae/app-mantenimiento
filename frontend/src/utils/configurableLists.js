import { hasMinRole } from './roleAccess';

export const CONFIGURABLE_LIST_DEFINITIONS = [
  {
    key: 'responsables',
    label: 'Responsables',
    description: 'Responsables habituales de planes, OTs y avisos.',
    defaultOptions: ['Mecanico', 'Electricista', 'Mecanicos', 'Ingeniero', 'Planner', 'Terceros'],
  },
  {
    key: 'areas_trabajo',
    label: 'Areas de trabajo',
    description: 'Areas productivas o zonas donde se ejecutan las OTs.',
    defaultOptions: ['Planta', 'Secado', 'Logistica', 'Almacen', 'Contabilidad'],
  },
  {
    key: 'tipos_mantenimiento',
    label: 'Tipos de mantenimiento',
    description: 'Tipos disponibles al crear o editar una OT.',
    defaultOptions: ['Preventivo', 'Correctivo', 'Predictivo', 'Inspeccion', 'Lubricacion', 'Mejora'],
  },
  {
    key: 'prioridades',
    label: 'Prioridades',
    description: 'Prioridades disponibles para planes y OT.',
    defaultOptions: ['Alta', 'Media', 'Baja', 'Critica'],
  },
  {
    key: 'variaciones_control',
    label: 'Variaciones de control',
    description: 'Clasificaciones V.C para OT y planes.',
    defaultOptions: ['V.C - DIA', 'V.C - HRA', 'V.C - KM'],
  },
];

function normalizeOption(value) {
  return String(value || '').trim();
}

function normalizeOptions(values = [], fallback = []) {
  const unique = new Set();
  const result = [];
  [...(Array.isArray(values) ? values : []), ...(Array.isArray(fallback) ? fallback : [])].forEach((value) => {
    const normalized = normalizeOption(value);
    const key = normalized.toLowerCase();
    if (!normalized || unique.has(key)) return;
    unique.add(key);
    result.push(normalized);
  });
  return result;
}

export const DEFAULT_CONFIGURABLE_LISTS = CONFIGURABLE_LIST_DEFINITIONS.map((definition) => ({
  key: definition.key,
  label: definition.label,
  description: definition.description,
  options: normalizeOptions(definition.defaultOptions),
}));

export function normalizeConfigurableLists(data) {
  const sourceMap = new Map(
    (Array.isArray(data) ? data : [])
      .filter(Boolean)
      .map((item) => [String(item.key || '').trim(), item]),
  );

  return CONFIGURABLE_LIST_DEFINITIONS.map((definition) => {
    const source = sourceMap.get(definition.key) || {};
    return {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      options: normalizeOptions(source.options || source.values || [], definition.defaultOptions),
    };
  });
}

export function getConfigurableListOptions(lists, key, fallback = []) {
  const match = normalizeConfigurableLists(lists).find((item) => item.key === key);
  return normalizeOptions(match?.options || [], fallback);
}

export function getConfigurableListMap(lists) {
  return new Map(normalizeConfigurableLists(lists).map((item) => [item.key, item.options]));
}

export function appendConfigurableOption(lists, key, value) {
  const normalizedValue = normalizeOption(value);
  const normalizedLists = normalizeConfigurableLists(lists);
  const nextLists = normalizedLists.map((item) => {
    if (item.key !== key) return item;
    return { ...item, options: normalizeOptions([...item.options, normalizedValue]) };
  });
  const wasPresent = getConfigurableListOptions(normalizedLists, key).some(
    (item) => item.toLowerCase() === normalizedValue.toLowerCase(),
  );
  return {
    nextLists,
    value: normalizedValue,
    added: Boolean(normalizedValue) && !wasPresent,
    duplicate: Boolean(normalizedValue) && wasPresent,
  };
}

export function updateConfigurableOption(lists, key, currentValue, nextValue) {
  const normalizedNext = normalizeOption(nextValue);
  const currentKey = normalizeOption(currentValue).toLowerCase();
  return normalizeConfigurableLists(lists).map((item) => {
    if (item.key !== key) return item;
    const replaced = item.options.map((option) => (
      option.toLowerCase() === currentKey ? normalizedNext : option
    ));
    return { ...item, options: normalizeOptions(replaced, []) };
  });
}

export function removeConfigurableOption(lists, key, value) {
  const targetKey = normalizeOption(value).toLowerCase();
  return normalizeConfigurableLists(lists).map((item) => {
    if (item.key !== key) return item;
    return {
      ...item,
      options: item.options.filter((option) => option.toLowerCase() !== targetKey),
    };
  });
}

export function canManageConfigurableLists(userOrRole) {
  return hasMinRole(userOrRole, 'PLANNER');
}
