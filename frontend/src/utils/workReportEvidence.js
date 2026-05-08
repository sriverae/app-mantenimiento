import {
  getBlockedTextMessage as getGenericBlockedTextMessage,
  hasBlockedTextChars,
} from './formValidation';

export const WORK_REPORT_PHOTO_SLOTS = [
  { key: 'before', label: 'ANTES', title: 'Foto antes' },
  { key: 'after', label: 'DESPUES', title: 'Foto despues' },
];

export const MAX_NOTICE_PROBLEM_PHOTOS = 8;

export function getPhotoSource(photo) {
  if (!photo) return '';
  const raw = typeof photo === 'string'
    ? photo
    : (photo.url || photo.previewUrl || photo.dataUrl || photo.path || photo.file_url || '');
  if (!raw) return '';
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  if (raw.startsWith('/')) {
    const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:8000';
    return `${apiBase.replace(/\/$/, '')}${raw}`;
  }
  if (!raw.includes('/') && /\.(png|jpe?g|webp|gif)$/i.test(raw)) {
    const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:8000';
    return `${apiBase.replace(/\/$/, '')}/uploads/${raw}`;
  }
  return raw;
}

export function normalizeEvidencePhotos(value = {}) {
  const source = value || {};
  return {
    before: source.before || source.antes || source.ANTES || null,
    after: source.after || source.despues || source.DESPUES || null,
  };
}

export function getWorkReportEvidencePhotos(report = {}) {
  const groupedPhotos = normalizeEvidencePhotos(report.evidencePhotos || report.evidence_photos || report.photos || {});
  return {
    before: groupedPhotos.before
      || report.beforePhoto
      || report.before_photo
      || report.foto_antes
      || report.foto_antes_url
      || report.beforePhotoUrl
      || report.before_photo_url
      || null,
    after: groupedPhotos.after
      || report.afterPhoto
      || report.after_photo
      || report.foto_despues
      || report.foto_despues_url
      || report.afterPhotoUrl
      || report.after_photo_url
      || null,
  };
}

export function hasRequiredWorkReportEvidence(report = {}) {
  if (String(report?.reportType || report?.tipo_reporte || '').toUpperCase() === 'SERVICIO') return true;
  const photos = getWorkReportEvidencePhotos(report);
  return Boolean(getPhotoSource(photos.before) && getPhotoSource(photos.after));
}

export function findReportsMissingRequiredEvidence(reports = []) {
  return (Array.isArray(reports) ? reports : []).filter((report) => !hasRequiredWorkReportEvidence(report));
}

export function getNoticeProblemPhotos(notice = {}) {
  const photos = notice.problem_photos || notice.problemPhotos || notice.photos || [];
  return (Array.isArray(photos) ? photos : []).filter((photo) => getPhotoSource(photo));
}

export function hasRequiredNoticeProblemPhotos(notice = {}) {
  return getNoticeProblemPhotos(notice).length > 0;
}

export function hasBlockedMaintenanceTextChars(value) {
  return hasBlockedTextChars(value);
}

export function getBlockedTextMessage(fieldLabel) {
  return getGenericBlockedTextMessage(fieldLabel);
}

export function buildUploadedPhotoPayload(photo, extra = {}) {
  if (!photo) return null;
  return {
    id: photo.id || photo.filename || `${Date.now()}`,
    filename: photo.filename || '',
    url: photo.url || '',
    caption: photo.caption || '',
    category: photo.category || extra.category || '',
    uploaded_by: photo.uploaded_by ?? extra.uploaded_by ?? '',
    user_name: photo.user_name || extra.user_name || '',
    created_at: photo.created_at || extra.created_at || new Date().toISOString(),
    original_name: photo.original_name || extra.original_name || '',
    ...extra,
  };
}
