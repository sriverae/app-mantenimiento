export const DEFAULT_MATERIALS = [
  {
    id: 1,
    codigo: 'PRD0000000',
    descripcion: 'ABRAZADERA 5"',
    marca: 'N.A.',
    proveedor: 'N.A.',
    stock: 1000,
    unidad: 'UND',
    costo_unit: 4,
    stock_min: 50,
  },
  {
    id: 2,
    codigo: 'PRD0000001',
    descripcion: 'ACEITE 15W40 CAT X 5 GL',
    marca: 'N.A.',
    proveedor: 'N.A.',
    stock: 1000,
    unidad: 'GLN',
    costo_unit: 136.67,
    stock_min: 50,
  },
];

const numberOr = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const normalizeMaterialsCatalog = (items) => {
  const source = Array.isArray(items) && items.length ? items : DEFAULT_MATERIALS;
  return source.map((item, index) => {
    const fallback = DEFAULT_MATERIALS.find((row) => (
      String(row.id) === String(item?.id)
      || (row.codigo && row.codigo === item?.codigo)
    )) || {};

    return {
      ...fallback,
      ...(item || {}),
      id: item?.id ?? fallback.id ?? index + 1,
      codigo: item?.codigo || fallback.codigo || '',
      descripcion: item?.descripcion || fallback.descripcion || '',
      marca: item?.marca || fallback.marca || 'N.A.',
      proveedor: item?.proveedor || fallback.proveedor || 'N.A.',
      stock: numberOr(item?.stock, numberOr(fallback.stock, 0)),
      unidad: item?.unidad || fallback.unidad || 'UND',
      costo_unit: numberOr(item?.costo_unit, numberOr(fallback.costo_unit, 0)),
      stock_min: numberOr(item?.stock_min, numberOr(fallback.stock_min, 0)),
    };
  });
};
