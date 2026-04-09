import * as XLSX from 'xlsx';

const BASE_EQUIPMENT_COLUMNS = [
  { key: 'codigo', label: 'Codigo' },
  { key: 'descripcion', label: 'Descripcion' },
  { key: 'area_trabajo', label: 'Area de trabajo' },
  { key: 'criticidad', label: 'Criticidad' },
  { key: 'marca', label: 'Marca' },
  { key: 'capacidad', label: 'Capacidad' },
  { key: 'potencia_kw', label: 'Potencia (kW)' },
  { key: 'amperaje', label: 'Amperaje' },
  { key: 'voltaje_trabajo', label: 'Voltaje de trabajo' },
  { key: 'estado', label: 'Estado' },
];

const PRIORITY_MAP = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
  critica: 'Alta',
  critico: 'Alta',
};

const CRITICITY_MAP = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
  critica: 'Alta',
  critico: 'Alta',
};

const STATUS_MAP = {
  operativo: 'Operativo',
  no_operativo: 'No operativo',
  inoperativo: 'No operativo',
  detenido: 'Detenido',
  stand_by: 'Stand by',
  standby: 'Stand by',
};

const FREQUENCY_MAP = {
  semanal: 'Semanal',
  quincenal: 'Mensual',
  mensual: 'Mensual',
  bimestral: 'Bimestral',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

const VC_MAP = {
  dia: 'V.C - DIA',
  dias: 'V.C - DIA',
  v_c_dia: 'V.C - DIA',
  hra: 'V.C - HRA',
  hora: 'V.C - HRA',
  horas: 'V.C - HRA',
  hr: 'V.C - HRA',
  v_c_hra: 'V.C - HRA',
  km: 'V.C - KM',
  kilometro: 'V.C - KM',
  kilometros: 'V.C - KM',
  v_c_km: 'V.C - KM',
};

const USER_ROLE_MAP = {
  ingeniero: 'INGENIERO',
  planner: 'PLANNER',
  planificador: 'PLANNER',
  encargado: 'ENCARGADO',
  tecnico: 'TECNICO',
  tecnico_mecanico: 'TECNICO',
  tecnico_electrico: 'TECNICO',
  mecanico: 'TECNICO',
  electrico: 'TECNICO',
};

const PERSON_ROLE_LABELS = {
  INGENIERO: 'Ingeniero',
  PLANNER: 'Planner',
  ENCARGADO: 'Encargado',
  TECNICO: 'Tecnico',
};

function safeString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function normalizeKey(value) {
  return safeString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeLabel(value) {
  const text = safeString(value).replace(/_/g, ' ').trim();
  if (!text) return 'Campo';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function parseNumericText(value) {
  if (typeof value === 'number') return value;
  const text = safeString(value);
  if (!text) return NaN;
  const normalized = text
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=.*\.)/g, '')
    .replace(',', '.');
  return Number(normalized);
}

export function toNumber(value, fallback = 0) {
  const parsed = parseNumericText(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseSpreadsheetDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  const text = safeString(value);
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const slashMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(text);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]);
    const year = Number(slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3]);
    if (year >= 2000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return '';
}

export function parseSpreadsheetTime(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const totalMinutes = Math.round((value % 1) * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  const text = safeString(value);
  if (!text) return '';
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(text);
  if (match) {
    return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
  }
  return '';
}

export function splitTextList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => safeString(item)).filter(Boolean);
  }
  const text = safeString(value)
    .replace(/\u2022/g, '\n')
    .replace(/\r/g, '\n');
  if (!text) return [];
  return text
    .split(/\n|;|\|/g)
    .map((item) => item.replace(/^\d+[).\s-]*/, '').trim())
    .filter(Boolean);
}

function indexRow(row) {
  const values = {};
  const labels = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    const normalized = normalizeKey(key);
    if (!normalized) return;
    values[normalized] = value;
    labels[normalized] = key;
  });
  return { raw: row || {}, values, labels };
}

function getRowValue(indexedRow, aliases, fallback = '') {
  const aliasList = Array.isArray(aliases) ? aliases : [aliases];
  const normalizedAliases = aliasList.map((item) => normalizeKey(item)).filter(Boolean);
  for (const alias of normalizedAliases) {
    if (Object.prototype.hasOwnProperty.call(indexedRow.values, alias)) {
      const value = indexedRow.values[alias];
      if (value !== null && value !== undefined && safeString(value) !== '') return value;
    }
  }
  return fallback;
}

function getActivityColumns(indexedRow) {
  return Object.keys(indexedRow.values)
    .filter((key) => key === 'actividad' || key === 'actividades' || key.startsWith('actividad_'))
    .map((key) => indexedRow.values[key])
    .flatMap((value) => splitTextList(value));
}

function inferPriority(value) {
  const key = normalizeKey(value);
  return PRIORITY_MAP[key] || 'Media';
}

function inferCriticity(value) {
  const key = normalizeKey(value);
  return CRITICITY_MAP[key] || 'Media';
}

function inferEquipmentStatus(value) {
  const key = normalizeKey(value);
  return STATUS_MAP[key] || safeString(value) || 'Operativo';
}

function inferFrequency(value) {
  const key = normalizeKey(value);
  return FREQUENCY_MAP[key] || 'Mensual';
}

function inferVc(value) {
  const key = normalizeKey(value);
  return VC_MAP[key] || 'V.C - DIA';
}

function inferUserRole(value, fallback = 'TECNICO') {
  const key = normalizeKey(value);
  return USER_ROLE_MAP[key] || fallback;
}

function buildId(prefix, index) {
  return `${prefix}_${Date.now()}_${index + 1}`;
}

function buildUniqueUsername(seed, seen) {
  const safeSeed = normalizeKey(seed).replace(/_/g, '').slice(0, 20) || 'usuario';
  let next = safeSeed;
  let counter = 1;
  while (seen.has(next)) {
    counter += 1;
    next = `${safeSeed}${counter}`;
  }
  seen.add(next);
  return next;
}

function buildUsernameSeed(code, fullName) {
  const cleanCode = normalizeKey(code).replace(/_/g, '');
  if (cleanCode) return cleanCode;
  const parts = safeString(fullName)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'tecnico';
  if (parts.length === 1) return parts[0];
  return `${parts[0].charAt(0)}${parts[parts.length - 1]}`;
}

function mergeExtraEquipmentColumns(existingColumns, indexedRows) {
  const nextColumns = [...(Array.isArray(existingColumns) && existingColumns.length ? existingColumns : BASE_EQUIPMENT_COLUMNS)];
  const knownKeys = new Set(nextColumns.map((item) => item.key));
  indexedRows.forEach((row) => {
    Object.keys(row.values).forEach((key) => {
      if (knownKeys.has(key)) return;
      if (['codigo_equipo', 'equipo', 'nombre_equipo', 'descripcion_equipo', 'area', 'criticidad_equipo'].includes(key)) return;
      const value = row.values[key];
      if (safeString(value) === '') return;
      knownKeys.add(key);
      nextColumns.push({
        key,
        label: normalizeLabel(row.labels[key] || key),
      });
    });
  });
  return nextColumns;
}

export async function parseSpreadsheetFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const headers = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false })[0] || [];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: '',
    raw: false,
  });
  return {
    sheetName,
    headers: headers.map((value) => safeString(value)).filter(Boolean),
    rows,
  };
}

export function downloadSpreadsheetTemplate(fileName, headers, sampleRows = [], sheetName = 'Plantilla') {
  const normalizedHeaders = (Array.isArray(headers) ? headers : []).map((value) => safeString(value)).filter(Boolean);
  if (!normalizedHeaders.length) return;

  const rows = (Array.isArray(sampleRows) ? sampleRows : []).map((row) => {
    const nextRow = {};
    normalizedHeaders.forEach((header) => {
      nextRow[header] = row?.[header] ?? '';
    });
    return nextRow;
  });

  const worksheet = XLSX.utils.json_to_sheet(rows, { header: normalizedHeaders });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, fileName);
}

export function mergeByKey(existing, imported, getKey, mode = 'upsert', mergeRecord) {
  if (mode === 'replace') return imported;
  const safeExisting = Array.isArray(existing) ? existing : [];
  const safeImported = Array.isArray(imported) ? imported : [];
  const importedKeys = new Set();
  const mergedImported = safeImported.map((item) => {
    const key = safeString(getKey(item));
    if (key) importedKeys.add(key);
    const previous = safeExisting.find((current) => safeString(getKey(current)) === key);
    return previous && typeof mergeRecord === 'function' ? mergeRecord(previous, item) : item;
  });
  const remainingExisting = safeExisting.filter((item) => {
    const key = safeString(getKey(item));
    return !key || !importedKeys.has(key);
  });
  return [...mergedImported, ...remainingExisting];
}

export function mapOtHistoryRows(rows) {
  const indexedRows = (Array.isArray(rows) ? rows : []).map(indexRow);
  const warnings = [];

  const items = indexedRows.reduce((acc, row, index) => {
    const codigo = safeString(getRowValue(row, ['codigo', 'codigo_equipo']));
    const descripcion = safeString(getRowValue(row, ['descripcion', 'equipo', 'descripcion_equipo']));
    const otNumero = safeString(getRowValue(row, ['ot_numero', 'numero_ot', 'nro_ot', '#_ot', 'ot']));
    if (!codigo && !descripcion && !otNumero) {
      warnings.push(`Fila ${index + 2}: no tiene codigo, descripcion ni numero OT.`);
      return acc;
    }

    const fechaInicio = parseSpreadsheetDate(getRowValue(row, ['fecha_inicio', 'inicio_ot']));
    const fechaFin = parseSpreadsheetDate(getRowValue(row, ['fecha_fin', 'fin_ot']));
    const fechaCierre = parseSpreadsheetDate(getRowValue(row, ['fecha_cierre', 'cierre_ot'])) || fechaFin;
    const horaInicio = parseSpreadsheetTime(getRowValue(row, ['hora_inicio', 'inicio_hora']));
    const horaFin = parseSpreadsheetTime(getRowValue(row, ['hora_fin', 'fin_hora']));
    const responsable = safeString(getRowValue(row, ['responsable', 'puesto_trabajo_resp', 'puesto_responsable']));
    const tipoMantenimiento = safeString(getRowValue(row, ['tipo_mantenimiento', 'tipo_mantto', 'tipo'])) || 'Correctivo';
    const observaciones = safeString(getRowValue(row, ['observaciones', 'observacion', 'comentarios']));

    acc.push({
      id: buildId('history', index),
      status_ot: 'Cerrada',
      ot_numero: otNumero,
      codigo,
      descripcion,
      area_trabajo: safeString(getRowValue(row, ['area_trabajo', 'area'])) || 'N.A.',
      responsable,
      tipo_mantto: tipoMantenimiento,
      fecha_cierre: fechaCierre,
      personal_mantenimiento: safeString(getRowValue(row, ['personal_mantenimiento', 'personal', 'tecnicos', 'trabajadores'])) || 'N.A.',
      materiales: safeString(getRowValue(row, ['materiales', 'repuestos'])) || 'N.A.',
      reportes_trabajo: [],
      registro_ot: {
        fecha_inicio: fechaInicio,
        hora_inicio: horaInicio,
        fecha_fin: fechaFin,
        hora_fin: horaFin,
        observaciones,
      },
      cierre_ot: {
        tipo_mantenimiento: tipoMantenimiento,
        puesto_trabajo_resp: responsable,
        fecha_inicio: fechaInicio,
        hora_inicio: horaInicio,
        fecha_fin: fechaFin,
        hora_fin: horaFin,
        tiempo_efectivo_hh: toNumber(getRowValue(row, ['tiempo_efectivo_hh', 'tiempo_efectivo', 'hh']), 0),
        estado_equipo: safeString(getRowValue(row, ['estado_equipo'])) || 'Operativo',
        satisfaccion: safeString(getRowValue(row, ['satisfaccion', 'nivel_satisfaccion'])) || 'N.A.',
        observaciones,
      },
    });
    return acc;
  }, []);

  return { items, warnings };
}

export function mapMaintenancePlanRows(rows, equipmentItems = []) {
  const indexedRows = (Array.isArray(rows) ? rows : []).map(indexRow);
  const equipmentByCode = new Map((Array.isArray(equipmentItems) ? equipmentItems : []).map((item) => [safeString(item.codigo), item]));
  const warnings = [];

  const items = indexedRows.reduce((acc, row, index) => {
    const codigo = safeString(getRowValue(row, ['codigo', 'codigo_equipo']));
    const equipoNombre = safeString(getRowValue(row, ['equipo', 'descripcion_equipo', 'descripcion'])) || equipmentByCode.get(codigo)?.descripcion || '';
    if (!codigo && !equipoNombre) {
      warnings.push(`Fila ${index + 2}: no tiene codigo ni nombre de equipo para el cronograma.`);
      return acc;
    }

    const activities = [
      ...splitTextList(getRowValue(row, ['actividades', 'actividad', 'tareas'])),
      ...getActivityColumns(row),
    ].filter(Boolean);

    acc.push({
      id: buildId('plan', index),
      codigo: codigo || equipmentByCode.get(codigo)?.codigo || '',
      equipo: equipoNombre,
      prioridad: inferPriority(getRowValue(row, ['prioridad'])),
      frecuencia: inferFrequency(getRowValue(row, ['frecuencia', 'periodicidad'])),
      responsable: safeString(getRowValue(row, ['responsable', 'puesto_trabajo_resp'])) || 'Mecanico',
      fecha_inicio: parseSpreadsheetDate(getRowValue(row, ['fecha_inicio', 'fecha_programada', 'inicio'])) || new Date().toISOString().slice(0, 10),
      actividades: activities.join('\n'),
      paquete_id: safeString(getRowValue(row, ['paquete_id', 'paquete_codigo'])) || '',
    });
    return acc;
  }, []);

  return { items, warnings };
}

export function mapEquipmentRows(rows, existingColumns = BASE_EQUIPMENT_COLUMNS) {
  const indexedRows = (Array.isArray(rows) ? rows : []).map(indexRow);
  const columns = mergeExtraEquipmentColumns(existingColumns, indexedRows);
  const warnings = [];

  const items = indexedRows.reduce((acc, row, index) => {
    const codigo = safeString(getRowValue(row, ['codigo', 'codigo_equipo']));
    const descripcion = safeString(getRowValue(row, ['descripcion', 'equipo', 'nombre_equipo']));
    if (!codigo && !descripcion) {
      warnings.push(`Fila ${index + 2}: no tiene codigo ni descripcion de equipo.`);
      return acc;
    }

    const nextItem = {
      id: buildId('equipo', index),
      codigo,
      descripcion,
      area_trabajo: safeString(getRowValue(row, ['area_trabajo', 'area'])) || 'N.A.',
      criticidad: inferCriticity(getRowValue(row, ['criticidad', 'criticidad_equipo'])),
      marca: safeString(getRowValue(row, ['marca'])) || 'N.A.',
      capacidad: safeString(getRowValue(row, ['capacidad'])) || 'N.A.',
      potencia_kw: safeString(getRowValue(row, ['potencia_kw', 'potencia'])) || 'N.A.',
      amperaje: safeString(getRowValue(row, ['amperaje'])) || 'N.A.',
      voltaje_trabajo: safeString(getRowValue(row, ['voltaje_trabajo', 'voltaje'])) || 'N.A.',
      estado: inferEquipmentStatus(getRowValue(row, ['estado'])),
    };

    columns.forEach((column) => {
      if (Object.prototype.hasOwnProperty.call(nextItem, column.key)) return;
      const value = row.values[column.key];
      nextItem[column.key] = safeString(value);
    });

    acc.push(nextItem);
    return acc;
  }, []);

  return { items, columns, warnings };
}

export function mapMaterialsRows(rows) {
  const indexedRows = (Array.isArray(rows) ? rows : []).map(indexRow);
  const warnings = [];

  const items = indexedRows.reduce((acc, row, index) => {
    const codigo = safeString(getRowValue(row, ['codigo', 'codigo_material']));
    const descripcion = safeString(getRowValue(row, ['descripcion', 'material']));
    if (!codigo && !descripcion) {
      warnings.push(`Fila ${index + 2}: no tiene codigo ni descripcion de material.`);
      return acc;
    }

    acc.push({
      id: buildId('material', index),
      codigo,
      descripcion,
      marca: safeString(getRowValue(row, ['marca'])) || 'N.A.',
      proveedor: safeString(getRowValue(row, ['proveedor'])) || 'N.A.',
      stock: toNumber(getRowValue(row, ['stock', 'stock_fisico', 'cantidad']), 0),
      unidad: safeString(getRowValue(row, ['unidad'])) || 'UND',
      costo_unit: toNumber(getRowValue(row, ['costo_unit', 'costo_unitario', 'precio_unitario']), 0),
      stock_min: toNumber(getRowValue(row, ['stock_min', 'stock_minimo', 'minimo']), 0),
    });
    return acc;
  }, []);

  return { items, warnings };
}

export function mapRrhhRows(rows, options = {}) {
  const indexedRows = (Array.isArray(rows) ? rows : []).map(indexRow);
  const warnings = [];
  const seenUsernames = new Set();
  const defaultRole = options.defaultRole || 'TECNICO';
  const defaultPassword = options.defaultPassword || 'Manto2026!';

  const items = [];
  const userDrafts = [];

  indexedRows.forEach((row, index) => {
    const codigo = safeString(getRowValue(row, ['codigo', 'codigo_tecnico', 'legajo']));
    const nombres = safeString(getRowValue(row, ['nombres_apellidos', 'nombre_completo', 'nombres', 'tecnico', 'personal']));
    if (!codigo && !nombres) {
      warnings.push(`Fila ${index + 2}: no tiene codigo ni nombre de personal.`);
      return;
    }

    const usernameSource = safeString(getRowValue(row, ['usuario', 'username', 'login']));
    const username = buildUniqueUsername(usernameSource || buildUsernameSeed(codigo, nombres), seenUsernames);
    const userRole = inferUserRole(getRowValue(row, ['rol_usuario', 'role', 'rol', 'cargo']), defaultRole);
    const password = safeString(getRowValue(row, ['password', 'clave'])) || defaultPassword;

    const rrhhItem = {
      id: buildId('rrhh', index),
      codigo,
      nombres_apellidos: nombres,
      cargo: safeString(getRowValue(row, ['cargo'])) || PERSON_ROLE_LABELS[userRole] || 'Tecnico',
      especialidad: safeString(getRowValue(row, ['especialidad'])) || 'Mecanico',
      tipo_personal: safeString(getRowValue(row, ['tipo_personal', 'tipo', 'vinculo'])) || 'Propio',
      empresa: safeString(getRowValue(row, ['empresa', 'contrata', 'empresa_contrata'])) || 'N.A.',
      identificacion: safeString(getRowValue(row, ['identificacion', 'dni', 'documento'])) || 'N.A.',
      edad: safeString(getRowValue(row, ['edad'])) || 'N.A.',
      domicilio: safeString(getRowValue(row, ['domicilio', 'turno'])) || 'N.A.',
      capacidad_hh_dia: safeString(getRowValue(row, ['capacidad_hh_dia', 'capacidad_hh', 'hh_dia'])) || '0.00',
      costo_hora: safeString(getRowValue(row, ['costo_hora', 'costo_hh'])) || '0.00',
      email: safeString(getRowValue(row, ['email', 'correo'])) || 'N.A.',
      usuario: username,
      rol_usuario: userRole,
    };

    items.push(rrhhItem);
    userDrafts.push({
      username,
      full_name: nombres || codigo,
      password,
      role: userRole,
      codigo_rrhh: codigo,
    });
  });

  return { items, userDrafts, warnings };
}

export function mapPackageRows(rows) {
  const indexedRows = (Array.isArray(rows) ? rows : []).map(indexRow);
  const warnings = [];

  const items = indexedRows.reduce((acc, row, index) => {
    const codigo = safeString(getRowValue(row, ['codigo', 'codigo_paquete']));
    const nombre = safeString(getRowValue(row, ['nombre', 'nombre_paquete', 'paquete']));
    const actividades = [
      ...splitTextList(getRowValue(row, ['actividades', 'actividad', 'tareas'])),
      ...getActivityColumns(row),
    ].filter(Boolean);

    if (!codigo && !nombre && actividades.length === 0) {
      warnings.push(`Fila ${index + 2}: no tiene codigo, nombre ni actividades de paquete.`);
      return acc;
    }

    acc.push({
      id: buildId('pkg', index),
      codigo: (codigo || `PK-IMP-${String(index + 1).padStart(3, '0')}`).toUpperCase(),
      vc: inferVc(getRowValue(row, ['vc', 'variable_control', 'tipo_control'])),
      nombre: nombre || `PAQUETE IMPORTADO ${index + 1}`,
      tiempo_min: toNumber(getRowValue(row, ['tiempo_min', 'tiempo', 'duracion_min']), 0),
      actividades,
      fuente_pdf_nombre: '',
      fuente_pdf_texto: '',
    });
    return acc;
  }, []);

  return { items, warnings };
}

export async function extractPdfText(file) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({
    data: buffer,
    disableWorker: true,
  }).promise;

  const pages = [];
  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const textContent = await page.getTextContent();
    const lines = [];
    let currentLine = [];

    textContent.items.forEach((item) => {
      if (!item?.str) return;
      currentLine.push(item.str);
      if (item.hasEOL) {
        lines.push(currentLine.join(' ').replace(/\s+/g, ' ').trim());
        currentLine = [];
      }
    });

    if (currentLine.length) {
      lines.push(currentLine.join(' ').replace(/\s+/g, ' ').trim());
    }
    pages.push(lines.filter(Boolean).join('\n'));
  }

  return pages.join('\n').trim();
}

export function extractActivitiesFromPdfText(text) {
  const rawText = safeString(text)
    .replace(/\r/g, '\n')
    .replace(/\u2022/g, '\n')
    .replace(/[ \t]+/g, ' ');

  const lineCandidates = rawText
    .split('\n')
    .map((line) => line.replace(/^\d+[).\s-]*/, '').trim())
    .filter((line) => line.length >= 8 && line.length <= 180);

  const prioritized = lineCandidates.filter((line) => (
    /inspe|revis|verific|limpi|ajust|cambi|lubric|medir|comprob|calibr|apret|engras|reemplaz/i.test(line)
  ));

  const sentences = rawText
    .split(/[.;]/)
    .map((item) => item.replace(/^\d+[).\s-]*/, '').trim())
    .filter((item) => item.length >= 8 && item.length <= 180);

  const unique = [];
  const seen = new Set();
  [...prioritized, ...lineCandidates, ...sentences].forEach((item) => {
    const key = normalizeKey(item);
    if (!key || seen.has(key)) return;
    if (/^(objetivo|alcance|frecuencia|responsable|codigo|descripcion|mantenimiento|checklist)$/i.test(item)) return;
    seen.add(key);
    unique.push(item);
  });

  return unique.slice(0, 40);
}

export function buildPackageDraftFromPdf(fileName, activities, extractedText, index, defaultVc = 'V.C - DIA') {
  const baseName = safeString(fileName).replace(/\.pdf$/i, '').trim();
  const codeBase = normalizeKey(baseName).replace(/_/g, '-').toUpperCase();
  return {
    id: buildId('pkg_pdf', index),
    codigo: codeBase ? `PK-${codeBase.slice(0, 18)}` : `PK-PDF-${String(index + 1).padStart(3, '0')}`,
    vc: defaultVc,
    nombre: baseName || `PAQUETE PDF ${index + 1}`,
    tiempo_min: 0,
    actividades: Array.isArray(activities) ? activities : [],
    fuente_pdf_nombre: fileName,
    fuente_pdf_texto: extractedText || '',
  };
}
