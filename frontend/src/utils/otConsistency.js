import { formatDateTimeDisplay } from './dateFormat';

const parseDateTime = (dateValue, timeValue, fallbackTime) => {
  if (!dateValue) return null;
  const normalizedTime = /^\d{2}:\d{2}$/.test(String(timeValue || '').slice(0, 5))
    ? String(timeValue || '').slice(0, 5)
    : fallbackTime;
  const parsed = new Date(`${dateValue}T${normalizedTime}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateTimeLabel = (dateValue, timeValue) => formatDateTimeDisplay(dateValue, timeValue, 'N.A.');

export const evaluateWorkReportConsistency = (alert, report) => {
  const otStartDate = alert?.registro_ot?.fecha_inicio;
  const otEndDate = alert?.registro_ot?.fecha_fin;
  const otStartTime = alert?.registro_ot?.hora_inicio;
  const otEndTime = alert?.registro_ot?.hora_fin;

  const reportStartDate = report?.fechaInicio;
  const reportEndDate = report?.fechaFin;
  const reportStartTime = report?.horaInicio;
  const reportEndTime = report?.horaFin;

  const otStart = parseDateTime(otStartDate, otStartTime, '00:00');
  const otEnd = parseDateTime(otEndDate, otEndTime, '23:59');
  const reportStart = parseDateTime(reportStartDate, reportStartTime, '00:00');
  const reportEnd = parseDateTime(reportEndDate, reportEndTime, '23:59');

  if (!otStart || !otEnd || !reportStart || !reportEnd) {
    return {
      hasInconsistency: false,
      reason: '',
      otRangeLabel: '',
    };
  }

  const reasons = [];
  if (reportStart < otStart) {
    reasons.push(`El inicio del registro (${formatDateTimeLabel(reportStartDate, reportStartTime)}) es menor al inicio liberado (${formatDateTimeLabel(otStartDate, otStartTime)}).`);
  }
  if (reportEnd > otEnd) {
    reasons.push(`El fin del registro (${formatDateTimeLabel(reportEndDate, reportEndTime)}) supera el fin liberado (${formatDateTimeLabel(otEndDate, otEndTime)}).`);
  }

  return {
    hasInconsistency: reasons.length > 0,
    reason: reasons.join(' '),
    otRangeLabel: `${formatDateTimeLabel(otStartDate, otStartTime)} - ${formatDateTimeLabel(otEndDate, otEndTime)}`,
  };
};

export const getAlertConsistencySummary = (alert, reports = []) => {
  const inconsistentReports = (Array.isArray(reports) ? reports : [])
    .map((report) => ({
      report,
      ...evaluateWorkReportConsistency(alert, report),
    }))
    .filter((item) => item.hasInconsistency);

  return {
    hasInconsistency: inconsistentReports.length > 0,
    count: inconsistentReports.length,
    inconsistentReports,
  };
};
