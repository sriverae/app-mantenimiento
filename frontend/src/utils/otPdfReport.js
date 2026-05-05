import { formatDateDisplay, formatDateTimeDisplay, formatIsoTimestampDisplay } from './dateFormat';
import {
  getServiceCost,
  getServiceProviderLabel,
  getWorkReportTypeLabel,
  isServiceAllInclusive,
  isServiceWorkReport,
} from './workReportServices';
import {
  getNoticeProblemPhotos,
  getPhotoSource,
  getWorkReportEvidencePhotos,
} from './workReportEvidence';

export const DEFAULT_OT_PDF_SETTINGS = {
  documentTitle: 'ORDEN DE TRABAJO',
  brandTitle: 'PMP',
  brandSubtitle: 'MANTTO',
  logoDataUrl: '',
  companyTitle: 'EMPRESA / SITE MAINTENANCE',
  documentSubtitle: 'ORDEN DE TRABAJO CERRADA',
  fontFamily: 'Arial, Helvetica, sans-serif',
  titleFontFamily: '"Times New Roman", serif',
  titleFontSize: 24,
  cellFontSize: 10,
  labelFontSize: 8.5,
  sectionFontSize: 10,
  reportFontSize: 8.8,
  signatureFontSize: 9,
  cellPaddingVertical: 3,
  cellPaddingHorizontal: 5,
  borderWidth: 1,
  outerBorderWidth: 2,
  primaryColor: '#ffff00',
  titleTextColor: '#000000',
  sectionColor: '#7f8c99',
  sectionTextColor: '#ffffff',
  accentColor: '#e10600',
  accentTextColor: '#ffffff',
  greenColor: '#6aa84f',
  headerTextColor: '#ffffff',
  bodyTextColor: '#000000',
  pageBackgroundColor: '#ffffff',
  sheetBackgroundColor: '#ffffff',
  borderColor: '#111111',
  logoBackgroundColor: '#ffffff',
  logoBorderColor: '#94a3b8',
  labelBackgroundColor: '#f3f4f6',
  labelTextColor: '#000000',
  valueBackgroundColor: '#ffffff',
  valueTextColor: '#000000',
  highlightBackgroundColor: '#ff0000',
  highlightTextColor: '#ffffff',
  statusBackgroundColor: '#d9ead3',
  statusTextColor: '#000000',
  observationsBackgroundColor: '#ffffff',
  technicalNoteBackgroundColor: '#ffffff',
  signatureLineColor: '#111111',
  rowActivityCount: 10,
  rowPersonnelCount: 4,
  rowMaterialCount: 10,
  showWorkReports: true,
  showWorkEvidenceAnnex: true,
  workEvidencePhotoHeight: 170,
  workReportDocumentTitle: 'NOTIFICACION DE TRABAJO',
  workReportSubtitle: 'ANEXO DE NOTIFICACIONES',
  workReportHeaderColor: '#1f3b5b',
  workReportHeaderTextColor: '#ffffff',
  showNoticeAnnex: true,
  noticeDocumentTitle: 'AVISO DE TRABAJO',
  noticeSubtitle: 'ANEXO DE AVISO',
  noticeHeaderColor: '#1f3b5b',
  noticeHeaderTextColor: '#ffffff',
  noticePhotoHeight: 160,
  signature1: 'TECNICO / RESPONSABLE',
  signature2: 'PLANNER DE MANTENIMIENTO',
  signature3: 'INGENIERO / SUPERVISOR',
};

const clampSettingNumber = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const cleanCssSetting = (value, fallback) => {
  const text = String(value || '').trim();
  if (!text) return fallback;
  return text.replace(/[<>{};]/g, '');
};

export const normalizeOtPdfSettings = (settings = {}) => ({
  ...DEFAULT_OT_PDF_SETTINGS,
  ...(settings || {}),
  fontFamily: cleanCssSetting(settings?.fontFamily, DEFAULT_OT_PDF_SETTINGS.fontFamily),
  titleFontFamily: cleanCssSetting(settings?.titleFontFamily, DEFAULT_OT_PDF_SETTINGS.titleFontFamily),
  titleFontSize: clampSettingNumber(settings?.titleFontSize, DEFAULT_OT_PDF_SETTINGS.titleFontSize, 12, 36),
  cellFontSize: clampSettingNumber(settings?.cellFontSize, DEFAULT_OT_PDF_SETTINGS.cellFontSize, 6, 16),
  labelFontSize: clampSettingNumber(settings?.labelFontSize, DEFAULT_OT_PDF_SETTINGS.labelFontSize, 6, 14),
  sectionFontSize: clampSettingNumber(settings?.sectionFontSize, DEFAULT_OT_PDF_SETTINGS.sectionFontSize, 6, 16),
  reportFontSize: clampSettingNumber(settings?.reportFontSize, DEFAULT_OT_PDF_SETTINGS.reportFontSize, 6, 14),
  signatureFontSize: clampSettingNumber(settings?.signatureFontSize, DEFAULT_OT_PDF_SETTINGS.signatureFontSize, 6, 14),
  cellPaddingVertical: clampSettingNumber(settings?.cellPaddingVertical, DEFAULT_OT_PDF_SETTINGS.cellPaddingVertical, 1, 10),
  cellPaddingHorizontal: clampSettingNumber(settings?.cellPaddingHorizontal, DEFAULT_OT_PDF_SETTINGS.cellPaddingHorizontal, 1, 12),
  borderWidth: clampSettingNumber(settings?.borderWidth, DEFAULT_OT_PDF_SETTINGS.borderWidth, 0.5, 4),
  outerBorderWidth: clampSettingNumber(settings?.outerBorderWidth, DEFAULT_OT_PDF_SETTINGS.outerBorderWidth, 1, 6),
  primaryColor: cleanCssSetting(settings?.primaryColor, DEFAULT_OT_PDF_SETTINGS.primaryColor),
  titleTextColor: cleanCssSetting(settings?.titleTextColor, DEFAULT_OT_PDF_SETTINGS.titleTextColor),
  sectionColor: cleanCssSetting(settings?.sectionColor, DEFAULT_OT_PDF_SETTINGS.sectionColor),
  sectionTextColor: cleanCssSetting(settings?.sectionTextColor, DEFAULT_OT_PDF_SETTINGS.sectionTextColor),
  accentColor: cleanCssSetting(settings?.accentColor, DEFAULT_OT_PDF_SETTINGS.accentColor),
  accentTextColor: cleanCssSetting(settings?.accentTextColor, DEFAULT_OT_PDF_SETTINGS.accentTextColor),
  greenColor: cleanCssSetting(settings?.greenColor, DEFAULT_OT_PDF_SETTINGS.greenColor),
  headerTextColor: cleanCssSetting(settings?.headerTextColor, DEFAULT_OT_PDF_SETTINGS.headerTextColor),
  bodyTextColor: cleanCssSetting(settings?.bodyTextColor, DEFAULT_OT_PDF_SETTINGS.bodyTextColor),
  pageBackgroundColor: cleanCssSetting(settings?.pageBackgroundColor, DEFAULT_OT_PDF_SETTINGS.pageBackgroundColor),
  sheetBackgroundColor: cleanCssSetting(settings?.sheetBackgroundColor, DEFAULT_OT_PDF_SETTINGS.sheetBackgroundColor),
  borderColor: cleanCssSetting(settings?.borderColor, DEFAULT_OT_PDF_SETTINGS.borderColor),
  logoBackgroundColor: cleanCssSetting(settings?.logoBackgroundColor, DEFAULT_OT_PDF_SETTINGS.logoBackgroundColor),
  logoBorderColor: cleanCssSetting(settings?.logoBorderColor, DEFAULT_OT_PDF_SETTINGS.logoBorderColor),
  labelBackgroundColor: cleanCssSetting(settings?.labelBackgroundColor, DEFAULT_OT_PDF_SETTINGS.labelBackgroundColor),
  labelTextColor: cleanCssSetting(settings?.labelTextColor, DEFAULT_OT_PDF_SETTINGS.labelTextColor),
  valueBackgroundColor: cleanCssSetting(settings?.valueBackgroundColor, DEFAULT_OT_PDF_SETTINGS.valueBackgroundColor),
  valueTextColor: cleanCssSetting(settings?.valueTextColor, DEFAULT_OT_PDF_SETTINGS.valueTextColor),
  highlightBackgroundColor: cleanCssSetting(settings?.highlightBackgroundColor, DEFAULT_OT_PDF_SETTINGS.highlightBackgroundColor),
  highlightTextColor: cleanCssSetting(settings?.highlightTextColor, DEFAULT_OT_PDF_SETTINGS.highlightTextColor),
  statusBackgroundColor: cleanCssSetting(settings?.statusBackgroundColor, DEFAULT_OT_PDF_SETTINGS.statusBackgroundColor),
  statusTextColor: cleanCssSetting(settings?.statusTextColor, DEFAULT_OT_PDF_SETTINGS.statusTextColor),
  observationsBackgroundColor: cleanCssSetting(settings?.observationsBackgroundColor, DEFAULT_OT_PDF_SETTINGS.observationsBackgroundColor),
  technicalNoteBackgroundColor: cleanCssSetting(settings?.technicalNoteBackgroundColor, DEFAULT_OT_PDF_SETTINGS.technicalNoteBackgroundColor),
  signatureLineColor: cleanCssSetting(settings?.signatureLineColor, DEFAULT_OT_PDF_SETTINGS.signatureLineColor),
  rowActivityCount: clampSettingNumber(settings?.rowActivityCount, DEFAULT_OT_PDF_SETTINGS.rowActivityCount, 1, 30),
  rowPersonnelCount: clampSettingNumber(settings?.rowPersonnelCount, DEFAULT_OT_PDF_SETTINGS.rowPersonnelCount, 1, 20),
  rowMaterialCount: clampSettingNumber(settings?.rowMaterialCount, DEFAULT_OT_PDF_SETTINGS.rowMaterialCount, 1, 40),
  showWorkReports: settings?.showWorkReports !== false,
  showWorkEvidenceAnnex: settings?.showWorkEvidenceAnnex !== false,
  workEvidencePhotoHeight: clampSettingNumber(settings?.workEvidencePhotoHeight, DEFAULT_OT_PDF_SETTINGS.workEvidencePhotoHeight, 90, 260),
  workReportDocumentTitle: String(settings?.workReportDocumentTitle || DEFAULT_OT_PDF_SETTINGS.workReportDocumentTitle).trim() || DEFAULT_OT_PDF_SETTINGS.workReportDocumentTitle,
  workReportSubtitle: String(settings?.workReportSubtitle || DEFAULT_OT_PDF_SETTINGS.workReportSubtitle).trim() || DEFAULT_OT_PDF_SETTINGS.workReportSubtitle,
  workReportHeaderColor: cleanCssSetting(settings?.workReportHeaderColor, DEFAULT_OT_PDF_SETTINGS.workReportHeaderColor),
  workReportHeaderTextColor: cleanCssSetting(settings?.workReportHeaderTextColor, DEFAULT_OT_PDF_SETTINGS.workReportHeaderTextColor),
  showNoticeAnnex: settings?.showNoticeAnnex !== false,
  noticeDocumentTitle: String(settings?.noticeDocumentTitle || DEFAULT_OT_PDF_SETTINGS.noticeDocumentTitle).trim() || DEFAULT_OT_PDF_SETTINGS.noticeDocumentTitle,
  noticeSubtitle: String(settings?.noticeSubtitle || DEFAULT_OT_PDF_SETTINGS.noticeSubtitle).trim() || DEFAULT_OT_PDF_SETTINGS.noticeSubtitle,
  noticeHeaderColor: cleanCssSetting(settings?.noticeHeaderColor, DEFAULT_OT_PDF_SETTINGS.noticeHeaderColor),
  noticeHeaderTextColor: cleanCssSetting(settings?.noticeHeaderTextColor, DEFAULT_OT_PDF_SETTINGS.noticeHeaderTextColor),
  noticePhotoHeight: clampSettingNumber(settings?.noticePhotoHeight, DEFAULT_OT_PDF_SETTINGS.noticePhotoHeight, 90, 260),
  logoDataUrl: String(settings?.logoDataUrl || '').startsWith('data:image/') ? settings.logoDataUrl : '',
});

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const firstValue = (...values) => values.find((value) => value !== null && value !== undefined && String(value).trim() !== '') || '';

const splitLines = (value) => String(value || '')
  .split(/\r?\n+|(?:\s{2,})|(?:\s*;\s*)/)
  .map((item) => item.trim())
  .filter(Boolean);

const numberValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatMoney = (value) => `S/ ${numberValue(value).toFixed(2)}`;

const normalizeLookupText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

const getCodeFromPersonText = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const [firstPart] = text.split(/\s+-\s+|\s+·\s+/);
  return String(firstPart || '').trim();
};

const formatTimelineValue = (dateValue, timeValue = '') => {
  const text = String(dateValue || '').trim();
  if (!text) return 'N.A.';
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return formatIsoTimestampDisplay(text, 'N.A.');
  return timeValue ? formatDateTimeDisplay(text, timeValue, 'N.A.') : formatDateDisplay(text, 'N.A.');
};

const padRows = (rows, minimumRows) => {
  const nextRows = [...rows];
  while (nextRows.length < minimumRows) nextRows.push(null);
  return nextRows;
};

const buildActivityRows = (alert, reports) => {
  const activities = splitLines(alert?.actividad);
  const reportActivities = (reports || []).flatMap((report) => {
    const label = report.reportCode || getWorkReportTypeLabel(report);
    const serviceLine = report.serviceActivity ? [`${label}: ${report.serviceActivity}`] : [];
    const observationLine = report.observaciones ? [`${label}: ${report.observaciones}`] : [];
    return [...serviceLine, ...observationLine];
  });
  const rows = [...activities, ...reportActivities];
  return rows.length ? rows : ['Sin actividades registradas.'];
};

const buildPersonnelRows = (alert, reports) => {
  const rowsByKey = new Map();
  const staffRows = Array.isArray(alert?.personal_detalle) ? alert.personal_detalle : [];
  const staffById = new Map(staffRows.map((item) => [String(item.id || ''), item]).filter(([key]) => key));
  const staffByCode = new Map(staffRows.map((item) => [normalizeLookupText(item.codigo), item]).filter(([key]) => key));
  const staffByName = new Map(staffRows.map((item) => [normalizeLookupText(item.nombres_apellidos || item.nombre), item]).filter(([key]) => key));

  const findStaff = (person = {}) => {
    const id = String(person.id || person.tecnicoId || '').trim();
    const code = normalizeLookupText(person.codigo || getCodeFromPersonText(person.tecnico || person.nombre));
    const name = normalizeLookupText(person.nombres_apellidos || person.nombre || person.tecnico);
    return (id && staffById.get(id))
      || (code && staffByCode.get(code))
      || (name && staffByName.get(name))
      || null;
  };

  const addPerson = (person, extra = {}) => {
    const matchedStaff = findStaff(person);
    const name = person?.nombres_apellidos || person?.nombre || person?.tecnico || matchedStaff?.nombres_apellidos || '';
    const code = person?.codigo || matchedStaff?.codigo || getCodeFromPersonText(person?.tecnico || name);
    const key = String(person?.id || person?.tecnicoId || code || name).trim().toLowerCase();
    if (!key) return;
    const current = rowsByKey.get(key) || {};
    const hoursToAdd = numberValue(extra.horas);
    const rate = numberValue(person?.costo_hora ?? extra.costo_hora ?? matchedStaff?.costo_hora ?? current.costo_hora);
    rowsByKey.set(key, {
      codigo: code || current.codigo || 'N.A.',
      nombre: name || current.nombre || 'N.A.',
      especialidad: person?.especialidad || matchedStaff?.especialidad || current.especialidad || person?.cargo || 'N.A.',
      horas: numberValue(current.horas) + hoursToAdd,
      costo_hora: rate || numberValue(current.costo_hora),
      costo_total: numberValue(current.costo_total) + (hoursToAdd * rate),
    });
  };

  (alert?.personal_detalle || []).forEach((person) => addPerson(person));
  const hasReportTechnicianHours = (reports || []).some((report) => (
    (report.tecnicos || []).some((person) => numberValue(person.horas) > 0)
  ));
  (reports || []).forEach((report) => {
    if (isServiceWorkReport(report)) {
      const provider = getServiceProviderLabel(report);
      if (provider && provider !== 'Servicio tercero') {
        addPerson({ id: `service-${report.id || report.reportCode}`, codigo: 'SERV', nombres_apellidos: provider, especialidad: 'Servicio tercero' });
      }
      return;
    }
    (report.tecnicos || []).forEach((person) => addPerson(person, { horas: person.horas }));
  });

  if (!hasReportTechnicianHours && Array.isArray(alert?.cierre_ot?.tiempo_personal)) {
    alert.cierre_ot.tiempo_personal.forEach((person) => addPerson(person, { horas: person.horas, costo_hora: person.costo_hora }));
  }

  if (!rowsByKey.size && alert?.personal_mantenimiento) {
    rowsByKey.set('personal-text', {
      codigo: 'N.A.',
      nombre: alert.personal_mantenimiento,
      especialidad: 'N.A.',
      horas: 0,
    });
  }

  return Array.from(rowsByKey.values());
};

const buildMaterialRows = (alert, reports) => {
  const rowsByKey = new Map();

  const addMaterial = (material, quantity) => {
    const code = material?.codigo || material?.code || '';
    const description = material?.descripcion || material?.description || material?.nombre || '';
    const key = String(material?.id || material?.materialId || code || description).trim().toLowerCase();
    if (!key) return;
    const current = rowsByKey.get(key) || {};
    rowsByKey.set(key, {
      codigo: code || current.codigo || 'N.A.',
      descripcion: description || current.descripcion || 'N.A.',
      unidad: material?.unidad || material?.unit || current.unidad || 'UND',
      cantidad: numberValue(current.cantidad) + numberValue(quantity ?? material?.cantidad ?? material?.qty),
      costoUnit: numberValue(material?.costo_unit ?? material?.costoUnit ?? current.costoUnit),
    });
  };

  (alert?.materiales_detalle || []).forEach((material) => addMaterial(material, material.cantidad));
  (reports || []).forEach((report) => {
    if (isServiceWorkReport(report) && report.serviceAllInclusive) return;
    (report.materialesExtra || []).forEach((material) => addMaterial(material, material.cantidad));
  });

  return Array.from(rowsByKey.values());
};

const getMaterialCostFromCatalog = (row, catalog) => {
  const code = String(row.codigo || '').trim().toLowerCase();
  const found = (catalog || []).find((item) => (
    String(item.codigo || '').trim().toLowerCase() === code
    || String(item.id || '') === String(row.id || row.materialId || '')
  ));
  return numberValue(row.costoUnit || found?.costo_unit);
};

const renderActivityRows = (activityRows, minimumRows) => padRows(activityRows, minimumRows).map((row, index) => `
  <tr>
    <td class="center">${String(index + 1).padStart(2, '0')}</td>
    <td colspan="5">${row ? escapeHtml(row) : '&nbsp;'}</td>
  </tr>
`).join('');

const renderPersonnelRows = (personnelRows, minimumRows) => padRows(personnelRows, minimumRows).map((row, index) => `
  <tr>
    <td class="center">${String(index + 1).padStart(2, '0')}</td>
    <td class="center">${escapeHtml(row?.codigo || '--------')}</td>
    <td colspan="2">${escapeHtml(row?.nombre || '----------------------------------------')}</td>
    <td>${escapeHtml(row?.especialidad || '--------')}</td>
    <td class="center">${row ? numberValue(row.horas).toFixed(2) : '--------'}</td>
  </tr>
`).join('');

const renderMaterialRows = (materialRows, minimumRows) => padRows(materialRows, minimumRows).map((row, index) => `
  <tr>
    <td class="center">${String(index + 1).padStart(2, '0')}</td>
    <td class="center">${escapeHtml(row?.codigo || '--------')}</td>
    <td colspan="2">${escapeHtml(row?.descripcion || '----------------------------------------')}</td>
    <td class="center">${escapeHtml(row?.unidad || '--------')}</td>
    <td class="center">${row ? numberValue(row.cantidad).toFixed(2) : '--------'}</td>
  </tr>
`).join('');

const summarizeReportPersonnel = (report) => {
  if (isServiceWorkReport(report)) return getServiceProviderLabel(report);
  const rows = Array.isArray(report?.tecnicos) ? report.tecnicos : [];
  if (!rows.length) return 'N.A.';
  return rows
    .map((item) => {
      const name = firstValue(item.tecnico, item.nombre, item.nombres_apellidos, item.codigo, 'Tecnico');
      const hours = numberValue(item.horas);
      return hours > 0 ? `${name} (${hours.toFixed(2)} h)` : name;
    })
    .join(', ');
};

const getReportLaborCost = (report) => {
  const stored = numberValue(report?.laborCost ?? report?.costo_mano_obra);
  if (stored > 0) return stored;
  return (Array.isArray(report?.tecnicos) ? report.tecnicos : [])
    .reduce((sum, item) => sum + (numberValue(item.horas) * numberValue(item.costo_hora)), 0);
};

const getReportMaterialCost = (report) => {
  const stored = numberValue(report?.materialCost ?? report?.costo_materiales);
  if (stored > 0) return stored;
  if (isServiceWorkReport(report) && isServiceAllInclusive(report)) return 0;
  return (Array.isArray(report?.materialesExtra) ? report.materialesExtra : [])
    .reduce((sum, item) => sum + (numberValue(item.cantidad ?? item.qty) * numberValue(item.costo_unit ?? item.costoUnit)), 0);
};

const getReportTotalCost = (report) => (
  getReportLaborCost(report) + getReportMaterialCost(report) + getServiceCost(report)
);

const renderReportPersonnelRows = (report) => {
  if (isServiceWorkReport(report)) {
    return `
      <tr>
        <td class="label">Proveedor</td>
        <td class="value" colspan="3">${escapeHtml(getServiceProviderLabel(report))}</td>
      </tr>
    `;
  }
  const rows = Array.isArray(report?.tecnicos) ? report.tecnicos : [];
  if (!rows.length) {
    return `
      <tr>
        <td class="label">Personal</td>
        <td class="value" colspan="3">Sin personal registrado.</td>
      </tr>
    `;
  }
  return rows.map((item, index) => `
    <tr>
      <td class="label">Tecnico ${index + 1}</td>
      <td class="value">${escapeHtml(firstValue(item.tecnico, item.nombre, item.nombres_apellidos, item.codigo, 'N.A.'))}</td>
      <td class="label">HH</td>
      <td class="value center">${numberValue(item.horas).toFixed(2)}</td>
    </tr>
  `).join('');
};

const renderReportMaterialRows = (report) => {
  if (isServiceWorkReport(report) && isServiceAllInclusive(report)) {
    return `
      <tr>
        <td class="label">Materiales</td>
        <td class="value" colspan="3">Incluidos dentro del servicio tercero.</td>
      </tr>
    `;
  }
  const rows = Array.isArray(report?.materialesExtra) ? report.materialesExtra : [];
  if (!rows.length) {
    return `
      <tr>
        <td class="label">Materiales</td>
        <td class="value" colspan="3">Sin materiales extra registrados.</td>
      </tr>
    `;
  }
  return rows.map((item, index) => `
    <tr>
      <td class="label">Material ${index + 1}</td>
      <td class="value">${escapeHtml(firstValue(item.codigo, item.descripcion, item.description, item.nombre, 'N.A.'))}</td>
      <td class="label">Cantidad</td>
      <td class="value center">${numberValue(item.cantidad ?? item.qty).toFixed(2)} ${escapeHtml(firstValue(item.unidad, item.unit))}</td>
    </tr>
  `).join('');
};

const renderWorkReportRows = (reports) => (reports || []).map((report, index) => `
  <tr>
    <td class="center">${index + 1}</td>
    <td>${escapeHtml(report.reportCode || `NT-${index + 1}`)}</td>
    <td>${escapeHtml(getWorkReportTypeLabel(report))}</td>
    <td>${escapeHtml(formatDateTimeDisplay(report.fechaInicio, report.horaInicio, 'N.A.'))}</td>
    <td>${escapeHtml(formatDateTimeDisplay(report.fechaFin, report.horaFin, 'N.A.'))}</td>
    <td>${escapeHtml(summarizeReportPersonnel(report))}</td>
  </tr>
`).join('');

const renderLogoBlock = (pdfSettings) => {
  if (pdfSettings.logoDataUrl) {
    return `<img class="logo-img" src="${escapeHtml(pdfSettings.logoDataUrl)}" alt="Logo empresa" />`;
  }
  return '<div class="logo-placeholder">LOGO<br/>EMPRESA</div>';
};

const renderAnnexPhoto = (photo, label, height) => {
  const src = getPhotoSource(photo);
  const caption = typeof photo === 'string' ? '' : (photo?.caption || photo?.original_name || '');
  if (!src) {
    return `
      <div class="annex-photo-cell">
        <div class="annex-photo-label">${escapeHtml(label)}</div>
        <div class="annex-photo-missing">Sin foto registrada</div>
      </div>
    `;
  }
  return `
    <div class="annex-photo-cell">
      <div class="annex-photo-label">${escapeHtml(label)}</div>
      <img class="annex-photo-img" style="height:${height}px;" src="${escapeHtml(src)}" alt="${escapeHtml(label)}" />
      ${caption ? `<div class="annex-photo-caption">${escapeHtml(caption)}</div>` : ''}
    </div>
  `;
};

const renderWorkEvidenceAnnex = (reports, pdfSettings) => {
  const rows = (Array.isArray(reports) ? reports : [])
    .map((report, index) => ({ report, index, photos: getWorkReportEvidencePhotos(report) }));

  if (!pdfSettings.showWorkEvidenceAnnex || !rows.length) return '';

  return `
    <section class="annex-page">
      <div class="work-report-title">${escapeHtml(pdfSettings.workReportDocumentTitle)}</div>
      <div class="work-report-subtitle">${escapeHtml(pdfSettings.workReportSubtitle)}</div>
      ${rows.map(({ report, index, photos }) => `
        <div class="annex-block">
          <table>
            <tr>
              <td class="work-report-head" colspan="4">${escapeHtml(report.reportCode || `NT-${index + 1}`)}</td>
            </tr>
            <tr>
              <td class="label">Tipo</td>
              <td class="value">${escapeHtml(getWorkReportTypeLabel(report))}</td>
              <td class="label">Registrado por</td>
              <td class="value">${escapeHtml(report.createdByName || report.created_by_name || 'N.A.')}</td>
            </tr>
            <tr>
              <td class="label">Inicio</td>
              <td class="value">${escapeHtml(formatDateTimeDisplay(report.fechaInicio, report.horaInicio, 'N.A.'))}</td>
              <td class="label">Fin</td>
              <td class="value">${escapeHtml(formatDateTimeDisplay(report.fechaFin, report.horaFin, 'N.A.'))}</td>
            </tr>
            <tr>
              <td class="label">HH total</td>
              <td class="value center">${escapeHtml(firstValue(report.totalHoras, numberValue((report.tecnicos || []).reduce((sum, item) => sum + numberValue(item.horas), 0)).toFixed(2), '0.00'))}</td>
              <td class="label">Costo total</td>
              <td class="value center">${escapeHtml(formatMoney(getReportTotalCost(report)))}</td>
            </tr>
            ${isServiceWorkReport(report) ? `
              <tr>
                <td class="label">Servicio tercero</td>
                <td class="value">${escapeHtml(getServiceProviderLabel(report))}</td>
                <td class="label">Todo costo</td>
                <td class="value center">${isServiceAllInclusive(report) ? 'Si' : 'No'}</td>
              </tr>
              <tr>
                <td class="label">Actividad servicio</td>
                <td class="value technical-note" colspan="3">${escapeHtml(firstValue(report.serviceActivity, report.observaciones, 'Sin actividad de servicio registrada.'))}</td>
              </tr>
            ` : ''}
            ${renderReportPersonnelRows(report)}
            ${renderReportMaterialRows(report)}
            <tr>
              <td class="label">Costos</td>
              <td class="value">Mano de obra: ${escapeHtml(formatMoney(getReportLaborCost(report)))}</td>
              <td class="value">Materiales: ${escapeHtml(formatMoney(getReportMaterialCost(report)))}</td>
              <td class="value">Servicios: ${escapeHtml(formatMoney(getServiceCost(report)))}</td>
            </tr>
            <tr>
              <td class="label">Observacion</td>
              <td class="value technical-note" colspan="3">${escapeHtml(firstValue(report.observaciones, report.serviceActivity, report.descripcion, 'Sin observacion registrada.'))}</td>
            </tr>
          </table>
          <div class="annex-photo-grid">
            ${renderAnnexPhoto(photos.before, 'ANTES', pdfSettings.workEvidencePhotoHeight)}
            ${renderAnnexPhoto(photos.after, 'DESPUES', pdfSettings.workEvidencePhotoHeight)}
          </div>
        </div>
      `).join('')}
    </section>
  `;
};

const getNoticeAnnexItems = (alert) => {
  const items = [];
  if (alert?.aviso_origen) items.push(alert.aviso_origen);
  if (alert?.aviso_detalle) items.push(alert.aviso_detalle);
  if (
    alert?.aviso_numero
    || alert?.aviso_codigo
    || alert?.notice_code
    || alert?.aviso_id
    || alert?.aviso_detalle
    || alert?.fecha_emision_aviso
  ) {
    items.push({
      aviso_codigo: firstValue(alert?.aviso_numero, alert?.aviso_codigo, alert?.notice_code, alert?.aviso_id, 'Aviso de mantenimiento'),
      codigo: alert?.codigo,
      descripcion: alert?.descripcion,
      fecha_aviso: firstValue(alert?.fecha_emision_aviso, alert?.fecha_aviso, alert?.aviso_creado_at),
      hora_evidencia: firstValue(alert?.hora_emision_aviso, alert?.hora_evidencia),
      categoria: firstValue(alert?.aviso_categoria, alert?.categoria_aviso, 'Aviso tecnico'),
      criticidad_aviso: firstValue(alert?.criticidad_aviso, alert?.prioridad),
      created_by_name: firstValue(alert?.aviso_aceptado_por, alert?.solicitante, alert?.responsable),
      source_ot_numero: alert?.ot_numero,
      detalle: firstValue(alert?.aviso_detalle, alert?.detalle_aviso, alert?.observaciones_aviso),
      problem_photos: alert?.problem_photos || alert?.problemPhotos || alert?.photos || [],
    });
  }
  if (Array.isArray(alert?.avisos_generados_detalle)) items.push(...alert.avisos_generados_detalle);
  const seen = new Set();
  return items.filter(Boolean).filter((notice) => {
    const key = String(notice.aviso_codigo || notice.notice_code || notice.id || notice.detalle || '').trim().toLowerCase();
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const renderNoticeAnnex = (alert, pdfSettings) => {
  const notices = getNoticeAnnexItems(alert);
  if (!pdfSettings.showNoticeAnnex || !notices.length) return '';

  return `
    <section class="annex-page">
      <div class="notice-title">${escapeHtml(pdfSettings.noticeDocumentTitle)}</div>
      <div class="notice-subtitle">${escapeHtml(pdfSettings.noticeSubtitle)}</div>
      ${notices.map((notice) => {
        const photos = getNoticeProblemPhotos(notice);
        return `
          <div class="annex-block notice-block">
            <table>
              <tr>
                <td class="notice-head" colspan="4">${escapeHtml(notice.aviso_codigo || notice.notice_code || 'Aviso sin codigo')}</td>
              </tr>
              <tr>
                <td class="label">Equipo</td>
                <td class="value">${escapeHtml(`${notice.codigo || alert?.codigo || ''} ${notice.descripcion || alert?.descripcion || ''}`.trim() || 'N.A.')}</td>
                <td class="label">Fecha aviso</td>
                <td class="value">${escapeHtml(formatTimelineValue(notice.fecha_aviso || notice.created_at || '', notice.hora_evidencia || ''))}</td>
              </tr>
              <tr>
                <td class="label">Categoria</td>
                <td class="value">${escapeHtml(notice.categoria || 'Aviso tecnico')}</td>
                <td class="label">Criticidad</td>
                <td class="value">${escapeHtml(notice.criticidad_aviso || notice.prioridad_sugerida || 'N.A.')}</td>
              </tr>
              <tr>
                <td class="label">Registrado por</td>
                <td class="value">${escapeHtml(notice.created_by_name || notice.created_by || 'Sistema')}</td>
                <td class="label">Origen OT</td>
                <td class="value">${escapeHtml(notice.source_ot_numero || alert?.ot_numero || 'N.A.')}</td>
              </tr>
              <tr>
                <td class="label">Detalle</td>
                <td class="value technical-note" colspan="3">${escapeHtml(firstValue(notice.detalle, notice.sugerencia_texto, 'Sin detalle registrado.'))}</td>
              </tr>
            </table>
            <div class="annex-photo-grid">
              ${photos.length
                ? photos.map((photo, index) => renderAnnexPhoto(photo, `FOTO PROBLEMA ${index + 1}`, pdfSettings.noticePhotoHeight)).join('')
                : '<div class="annex-photo-missing">Sin fotos de problema registradas</div>'}
            </div>
          </div>
        `;
      }).join('')}
    </section>
  `;
};

export const buildIndustrialOtReportHtml = (alert, reports = [], catalog = [], settings = {}) => {
  const pdfSettings = normalizeOtPdfSettings(settings);
  const cierre = alert?.cierre_ot || {};
  const registro = alert?.registro_ot || {};
  const activityRows = buildActivityRows(alert, reports);
  const personnelRows = buildPersonnelRows(alert, reports);
  const materialRows = buildMaterialRows(alert, reports);
  const totalServiceCost = reports.reduce((sum, report) => sum + getServiceCost(report), 0);
  const totalMaterialCost = materialRows.reduce((sum, row) => sum + (getMaterialCostFromCatalog(row, catalog) * numberValue(row.cantidad)), 0);
  const totalLaborCost = personnelRows.reduce((sum, row) => {
    const storedTotal = numberValue(row.costo_total);
    if (storedTotal > 0) return sum + storedTotal;
    return sum + (numberValue(row.horas) * numberValue(row.costo_hora));
  }, 0);
  const totalMaintenanceCost = totalLaborCost + totalMaterialCost + totalServiceCost;
  const fechaInicio = firstValue(cierre.fecha_inicio, registro.fecha_inicio);
  const horaInicio = firstValue(cierre.hora_inicio, registro.hora_inicio);
  const fechaFin = firstValue(cierre.fecha_fin, registro.fecha_fin, alert?.fecha_ejecucion);
  const horaFin = firstValue(cierre.hora_fin, registro.hora_fin);
  const fechaEmisionAviso = firstValue(
    alert?.fecha_emision_aviso,
    alert?.fecha_aviso,
    alert?.aviso_creado_at,
    alert?.created_at,
    alert?.fecha_creacion,
    alert?.alerta_desde,
    alert?.fecha_ejecutar,
  );
  const horaEmisionAviso = firstValue(alert?.hora_emision_aviso, alert?.hora_evidencia);
  const fechaAceptacionAviso = firstValue(alert?.fecha_aceptacion_aviso, alert?.accepted_at, alert?.aviso_aceptado_fecha);
  const fechaLiberacion = firstValue(alert?.fecha_liberacion_ot, registro.fecha_liberacion, alert?.liberated_at, alert?.fecha_ejecucion);
  const fechaProgramada = firstValue(alert?.fecha_ejecutar, alert?.fecha_programada);
  const fechaReprogramacion = firstValue(
    alert?.fecha_reprogramacion,
    Array.isArray(alert?.reprogramaciones) && alert.reprogramaciones.length
      ? alert.reprogramaciones[alert.reprogramaciones.length - 1]?.reprogramado_at
      : '',
  );
  const fechaCierre = firstValue(alert?.fecha_cierre, cierre.cierre_aprobado_fecha, cierre.fecha_fin, registro.fecha_fin, alert?.fecha_ejecucion);
  const cerradoPor = firstValue(cierre.cierre_aprobado_por, cierre.cerrado_por, alert?.cerrado_por, 'N.A.');
  const fechaAprobacionCierre = firstValue(cierre.cierre_aprobado_fecha, alert?.fecha_cierre, fechaCierre);
  const tipoMantto = firstValue(cierre.tipo_mantenimiento, alert?.tipo_mantto, alert?.tipo_mantenimiento, 'N.A.');
  const estadoOt = firstValue(alert?.status_ot, 'Cerrada');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>OT ${escapeHtml(alert?.ot_numero || '')}</title>
        <style>
          @page { size: A4 portrait; margin: 10mm; }
          * { box-sizing: border-box; }
          body { margin: 0; background: ${pdfSettings.pageBackgroundColor}; color: ${pdfSettings.bodyTextColor}; font-family: ${pdfSettings.fontFamily}; }
          .sheet { width: 100%; max-width: 790px; margin: 0 auto; background: ${pdfSettings.sheetBackgroundColor}; border: ${pdfSettings.outerBorderWidth}px solid ${pdfSettings.borderColor}; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          td, th { border: ${pdfSettings.borderWidth}px solid ${pdfSettings.borderColor}; padding: ${pdfSettings.cellPaddingVertical}px ${pdfSettings.cellPaddingHorizontal}px; font-size: ${pdfSettings.cellFontSize}px; line-height: 1.25; vertical-align: middle; background: ${pdfSettings.valueBackgroundColor}; color: ${pdfSettings.valueTextColor}; }
          .top-title { background: ${pdfSettings.primaryColor}; color: ${pdfSettings.titleTextColor}; font-family: ${pdfSettings.titleFontFamily}; font-size: ${pdfSettings.titleFontSize}px; font-weight: 800; text-align: center; letter-spacing: 1px; }
          .brand { background: ${pdfSettings.logoBackgroundColor}; text-align: center; font-weight: 800; width: 95px; height: 54px; padding: 4px; }
          .logo-img { display: block; width: 100%; max-height: 48px; object-fit: contain; margin: 0 auto; }
          .logo-placeholder { display: grid; place-items: center; min-height: 46px; color: ${pdfSettings.labelTextColor}; font-size: ${pdfSettings.signatureFontSize}px; line-height: 1.15; border: 1px dashed ${pdfSettings.logoBorderColor}; }
          .green { background: ${pdfSettings.greenColor}; color: ${pdfSettings.headerTextColor}; font-weight: 800; text-align: center; }
          .red { background: ${pdfSettings.accentColor}; color: ${pdfSettings.accentTextColor}; font-weight: 800; text-align: center; }
          .gray { background: ${pdfSettings.sectionColor}; color: ${pdfSettings.sectionTextColor}; font-weight: 800; text-align: center; text-transform: uppercase; font-size: ${pdfSettings.sectionFontSize}px; }
          .label { background: ${pdfSettings.labelBackgroundColor}; color: ${pdfSettings.labelTextColor}; font-weight: 800; text-align: center; text-transform: uppercase; font-size: ${pdfSettings.labelFontSize}px; }
          .value { background: ${pdfSettings.valueBackgroundColor}; color: ${pdfSettings.valueTextColor}; font-weight: 600; }
          .value-red { background: ${pdfSettings.highlightBackgroundColor}; color: ${pdfSettings.highlightTextColor}; font-weight: 800; text-align: center; }
          .value-green { background: ${pdfSettings.statusBackgroundColor}; color: ${pdfSettings.statusTextColor}; font-weight: 800; text-align: center; }
          .center { text-align: center; }
          .right { text-align: right; }
          .small { font-size: ${pdfSettings.labelFontSize}px; }
          .observations { height: 58px; text-align: center; vertical-align: middle; white-space: pre-wrap; background: ${pdfSettings.observationsBackgroundColor}; color: ${pdfSettings.valueTextColor}; }
          .technical-note { min-height: 42px; white-space: pre-wrap; background: ${pdfSettings.technicalNoteBackgroundColor}; }
          .signature-wrap { width: 100%; max-width: 790px; margin: 22px auto 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 38px; }
          .signature { text-align: center; font-size: ${pdfSettings.signatureFontSize}px; font-weight: 800; color: ${pdfSettings.bodyTextColor}; }
          .signature-line { border-top: 2px solid ${pdfSettings.signatureLineColor}; height: 24px; margin-bottom: 4px; }
          .report-table td, .report-table th { font-size: ${pdfSettings.reportFontSize}px; }
          .annex-page { width: 100%; max-width: 790px; margin: 28px auto 0; break-before: page; page-break-before: always; }
          .annex-title { background: ${pdfSettings.sectionColor}; color: ${pdfSettings.sectionTextColor}; border: ${pdfSettings.outerBorderWidth}px solid ${pdfSettings.borderColor}; padding: 8px 10px; text-align: center; font-weight: 900; font-size: ${Math.max(pdfSettings.sectionFontSize + 2, 10)}px; }
          .notice-title { background: ${pdfSettings.noticeHeaderColor}; color: ${pdfSettings.noticeHeaderTextColor}; border: ${pdfSettings.outerBorderWidth}px solid ${pdfSettings.borderColor}; padding: 9px 10px; text-align: center; font-weight: 900; font-size: ${Math.max(pdfSettings.titleFontSize - 4, 14)}px; }
          .notice-subtitle { border-left: ${pdfSettings.outerBorderWidth}px solid ${pdfSettings.borderColor}; border-right: ${pdfSettings.outerBorderWidth}px solid ${pdfSettings.borderColor}; border-bottom: ${pdfSettings.borderWidth}px solid ${pdfSettings.borderColor}; padding: 5px 10px; text-align: center; font-weight: 800; }
          .notice-head { background: ${pdfSettings.noticeHeaderColor}; color: ${pdfSettings.noticeHeaderTextColor}; font-weight: 900; text-align: center; }
          .work-report-title { background: ${pdfSettings.workReportHeaderColor}; color: ${pdfSettings.workReportHeaderTextColor}; border: ${pdfSettings.outerBorderWidth}px solid ${pdfSettings.borderColor}; padding: 9px 10px; text-align: center; font-weight: 900; font-size: ${Math.max(pdfSettings.titleFontSize - 4, 14)}px; }
          .work-report-subtitle { border-left: ${pdfSettings.outerBorderWidth}px solid ${pdfSettings.borderColor}; border-right: ${pdfSettings.outerBorderWidth}px solid ${pdfSettings.borderColor}; border-bottom: ${pdfSettings.borderWidth}px solid ${pdfSettings.borderColor}; padding: 5px 10px; text-align: center; font-weight: 800; }
          .work-report-head { background: ${pdfSettings.workReportHeaderColor}; color: ${pdfSettings.workReportHeaderTextColor}; font-weight: 900; text-align: center; }
          .annex-block { margin-top: 12px; border: ${pdfSettings.borderWidth}px solid ${pdfSettings.borderColor}; break-inside: avoid; page-break-inside: avoid; }
          .annex-photo-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 10px; background: ${pdfSettings.sheetBackgroundColor}; }
          .annex-photo-cell { border: ${pdfSettings.borderWidth}px solid ${pdfSettings.borderColor}; background: ${pdfSettings.valueBackgroundColor}; min-height: 120px; display: flex; flex-direction: column; }
          .annex-photo-label { background: ${pdfSettings.labelBackgroundColor}; color: ${pdfSettings.labelTextColor}; font-weight: 900; text-align: center; padding: 5px; border-bottom: ${pdfSettings.borderWidth}px solid ${pdfSettings.borderColor}; }
          .annex-photo-img { width: 100%; object-fit: contain; background: #fff; display: block; }
          .annex-photo-caption { padding: 5px 7px; font-size: ${pdfSettings.labelFontSize}px; color: ${pdfSettings.valueTextColor}; border-top: ${pdfSettings.borderWidth}px solid ${pdfSettings.borderColor}; }
          .annex-photo-missing { flex: 1; min-height: 110px; display: grid; place-items: center; color: #64748b; font-weight: 700; text-align: center; padding: 10px; }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .sheet { break-inside: avoid; }
            .annex-block { break-inside: avoid; page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <table>
            <tr>
              <td class="brand" rowspan="2">
                ${renderLogoBlock(pdfSettings)}
              </td>
              <td class="top-title" colspan="5">${escapeHtml(pdfSettings.documentTitle)}</td>
              <td class="green">N AVISO:</td>
              <td class="value center">${escapeHtml(firstValue(alert?.aviso_numero, alert?.notice_code, alert?.aviso_id, '-'))}</td>
            </tr>
            <tr>
              <td class="green" colspan="3">${escapeHtml(pdfSettings.companyTitle)}</td>
              <td class="green" colspan="2">${escapeHtml(pdfSettings.documentSubtitle)}</td>
              <td class="green">N OT:</td>
              <td class="value center">${escapeHtml(alert?.ot_numero || 'N.A.')}</td>
            </tr>
          </table>

          <table>
            <tr><td class="gray" colspan="8">MAQUINA O EQUIPO</td></tr>
            <tr>
              <td class="label">CODIGO</td>
              <td class="value-red" colspan="2">${escapeHtml(alert?.codigo || 'N.A.')}</td>
              <td class="label">TIPO DE MANTTO</td>
              <td class="value-red" colspan="2">${escapeHtml(tipoMantto)}</td>
              <td class="label">V.C</td>
              <td class="value center">${escapeHtml(firstValue(alert?.vc, alert?.origen_programacion, 'N.A.'))}</td>
            </tr>
            <tr>
              <td class="label">DESCRIPCION</td>
              <td class="value" colspan="3">${escapeHtml(alert?.descripcion || 'N.A.')}</td>
              <td class="label">RESPONSABLE</td>
              <td class="value" colspan="3">${escapeHtml(firstValue(alert?.responsable, cierre.puesto_trabajo_resp, 'N.A.'))}</td>
            </tr>
            <tr>
              <td class="label">PRIORIDAD</td>
              <td class="value center">${escapeHtml(alert?.prioridad || 'N.A.')}</td>
              <td class="label">AREA</td>
              <td class="value center">${escapeHtml(alert?.area_trabajo || 'N.A.')}</td>
              <td class="label">EMISION AVISO</td>
              <td class="value center">${escapeHtml(formatTimelineValue(fechaEmisionAviso, horaEmisionAviso))}</td>
              <td class="label">ACEPTACION AVISO</td>
              <td class="value center">${escapeHtml(formatTimelineValue(fechaAceptacionAviso))}</td>
            </tr>
            <tr>
              <td class="label">STATUS</td>
              <td class="value-green">${escapeHtml(estadoOt)}</td>
              <td class="label">LIBERACION OT</td>
              <td class="value center">${escapeHtml(formatTimelineValue(fechaLiberacion))}</td>
              <td class="label">PROGRAMADA</td>
              <td class="value center">${escapeHtml(formatTimelineValue(fechaProgramada))}</td>
              <td class="label">REPROGRAMADA</td>
              <td class="value center">${escapeHtml(formatTimelineValue(fechaReprogramacion))}</td>
            </tr>
            <tr>
              <td class="label">INICIO EJECUCION</td>
              <td class="value center">${escapeHtml(formatDateTimeDisplay(fechaInicio, horaInicio, 'N.A.'))}</td>
              <td class="label">FIN EJECUCION</td>
              <td class="value center">${escapeHtml(formatDateTimeDisplay(fechaFin, horaFin, 'N.A.'))}</td>
              <td class="label">FECHA CIERRE</td>
              <td class="value center">${escapeHtml(formatTimelineValue(fechaCierre))}</td>
              <td class="label">APROBACION CIERRE</td>
              <td class="value center">${escapeHtml(formatTimelineValue(fechaAprobacionCierre))}</td>
            </tr>
            <tr>
              <td class="green">SOLICITANTE</td>
              <td class="value center" colspan="2">${escapeHtml(firstValue(alert?.solicitante, alert?.responsable, 'N.A.'))}</td>
              <td class="green">EJECUTA</td>
              <td class="value center" colspan="2">${escapeHtml(firstValue(alert?.personal_mantenimiento, cierre.puesto_trabajo_resp, 'N.A.'))}</td>
              <td class="label">ESTADO EQUIPO</td>
              <td class="value center">${escapeHtml(cierre.estado_equipo || 'N.A.')}</td>
            </tr>
            <tr>
              <td class="label">CERRADO POR</td>
              <td class="value center" colspan="7">${escapeHtml(cerradoPor)}</td>
            </tr>
          </table>

          <table>
            <tr><td class="gray" colspan="6">ACTIVIDADES DE MANTENIMIENTO Y/O SERVICIO</td></tr>
            <tr>
              <td class="red" style="width: 48px;">N</td>
              <td class="red" colspan="5">DESCRIPCION</td>
            </tr>
            ${renderActivityRows(activityRows, pdfSettings.rowActivityCount)}
          </table>

          <table>
            <tr><td class="gray" colspan="6">PERSONAL DE MANTENIMIENTO</td></tr>
            <tr>
              <td class="red" style="width: 48px;">N</td>
              <td class="red">CODIGO</td>
              <td class="red" colspan="2">NOMBRES Y APELLIDOS</td>
              <td class="red">ESPECIALIDAD</td>
              <td class="red">HH</td>
            </tr>
            ${renderPersonnelRows(personnelRows, pdfSettings.rowPersonnelCount)}
          </table>

          <table>
            <tr><td class="gray" colspan="6">MATERIALES, REPUESTOS E INSUMOS</td></tr>
            <tr>
              <td class="red" style="width: 48px;">N</td>
              <td class="red">CODIGO</td>
              <td class="red" colspan="2">DESCRIPCION</td>
              <td class="red">UNIDAD</td>
              <td class="red">CANTIDAD</td>
            </tr>
            ${renderMaterialRows(materialRows, pdfSettings.rowMaterialCount)}
          </table>

          {REPORTS_SECTION}
          <table>
            <tr><td class="gray">OBSERVACIONES</td></tr>
            <tr>
              <td class="observations">
                ${escapeHtml(firstValue(cierre.observaciones, registro.observaciones, 'Sin observaciones.'))}
                ${cierre.recomendacion_tecnica ? `<br/><strong>Recomendacion:</strong> ${escapeHtml(cierre.recomendacion_tecnica)}` : ''}
              </td>
            </tr>
          </table>

          <table>
            <tr><td class="gray" colspan="8">RESUMEN TECNICO Y COSTOS</td></tr>
            <tr>
              <td class="label">T. efectivo</td>
              <td class="value center">${escapeHtml(firstValue(cierre.tiempo_efectivo_hh, '0'))} Hh</td>
              <td class="label">T. indisp. generico</td>
              <td class="value center">${escapeHtml(firstValue(cierre.tiempo_indisponible_generico, '0'))} Hh</td>
              <td class="label">T. indisp. operacional</td>
              <td class="value center">${escapeHtml(firstValue(cierre.tiempo_indisponible_operacional, '0'))} Hh</td>
              <td class="label">Mano de obra</td>
              <td class="value center">${formatMoney(totalLaborCost)}</td>
            </tr>
            <tr>
              <td class="label">Materiales</td>
              <td class="value center">${formatMoney(totalMaterialCost)}</td>
              <td class="label">Servicios</td>
              <td class="value center">${formatMoney(totalServiceCost)}</td>
              <td class="label">Costo total mantto</td>
              <td class="value center" colspan="3">${formatMoney(totalMaintenanceCost)}</td>
            </tr>
            <tr>
              <td class="label">Componente</td>
              <td class="value center" colspan="3">${escapeHtml(cierre.componente_intervenido || 'N.A.')}</td>
              <td class="label">Modo de falla</td>
              <td class="value center" colspan="3">${escapeHtml(cierre.modo_falla || 'N.A.')}</td>
            </tr>
            <tr>
              <td class="label">Causa raiz</td>
              <td class="value technical-note" colspan="3">${escapeHtml(cierre.causa_raiz || 'N.A.')}</td>
              <td class="label">Accion correctiva</td>
              <td class="value technical-note" colspan="3">${escapeHtml(cierre.accion_correctiva || 'N.A.')}</td>
            </tr>
          </table>
        </div>

        <div class="signature-wrap">
          <div class="signature"><div class="signature-line"></div>${escapeHtml(pdfSettings.signature1)}</div>
          <div class="signature"><div class="signature-line"></div>${escapeHtml(pdfSettings.signature2)}</div>
          <div class="signature"><div class="signature-line"></div>${escapeHtml(pdfSettings.signature3)}</div>
        </div>

        ${renderWorkEvidenceAnnex(reports, pdfSettings)}
        ${renderNoticeAnnex(alert, pdfSettings)}
      </body>
    </html>
  `.replace('{REPORTS_SECTION}', pdfSettings.showWorkReports && (reports || []).length ? `
    <table class="report-table">
      <tr><td class="gray" colspan="6">NOTIFICACIONES DE TRABAJO REGISTRADAS</td></tr>
      <tr>
        <td class="red">N</td>
        <td class="red">CODIGO</td>
        <td class="red">TIPO</td>
        <td class="red">INICIO</td>
        <td class="red">FIN</td>
        <td class="red">PERSONAL / TERCERO</td>
      </tr>
      ${renderWorkReportRows(reports)}
    </table>
  ` : '');
};

export const openIndustrialOtReportPdf = (alert, reports = [], catalog = [], settings = {}) => {
  const printWindow = window.open('', '_blank', 'width=1024,height=768');
  if (!printWindow) {
    window.alert('No se pudo abrir la ventana para generar el PDF.');
    return;
  }
  printWindow.document.write(buildIndustrialOtReportHtml(alert, reports, catalog, settings));
  printWindow.document.close();
  printWindow.focus();
  const hasAnnexImages = (reports || []).some((report) => {
    const photos = getWorkReportEvidencePhotos(report);
    return getPhotoSource(photos.before) || getPhotoSource(photos.after);
  }) || getNoticeAnnexItems(alert).some((notice) => getNoticeProblemPhotos(notice).length);
  setTimeout(() => {
    printWindow.print();
  }, hasAnnexImages ? 900 : 300);
};
