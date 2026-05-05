const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isIsoDate = (value) => ISO_DATE_RE.test(String(value || ''));

const addDaysToIsoDate = (dateValue, daysToAdd) => {
  if (!isIsoDate(dateValue)) return dateValue || '';
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + Number(daysToAdd || 0));
  return date.toISOString().slice(0, 10);
};

const getDateDiffDays = (startValue, endValue) => {
  if (!isIsoDate(startValue) || !isIsoDate(endValue)) return 0;
  const start = new Date(`${startValue}T00:00:00`);
  const end = new Date(`${endValue}T00:00:00`);
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000);
  return Number.isFinite(diff) && diff > 0 ? diff : 0;
};

const shiftRegistroOtDates = (registro, newDate) => {
  if (!registro || !isIsoDate(newDate)) return registro || null;
  const oldStart = registro.fecha_inicio || registro.fecha_fin || '';
  const oldEnd = registro.fecha_fin || oldStart || '';
  const durationDays = getDateDiffDays(oldStart, oldEnd);

  return {
    ...registro,
    fecha_inicio: newDate,
    fecha_fin: addDaysToIsoDate(newDate, durationDays),
  };
};

export function applyOtReprogramming(alert, payload, actorName = 'Sistema') {
  const now = new Date().toISOString();
  const entry = {
    fecha_anterior: payload.fecha_anterior || alert?.fecha_ejecutar || '',
    fecha_nueva: payload.fecha_nueva,
    motivo: payload.motivo || '',
    reprogramado_at: now,
    reprogramado_por: actorName,
  };

  return {
    ...alert,
    fecha_ejecutar: payload.fecha_nueva,
    fecha_programada: payload.fecha_nueva,
    fecha_reprogramacion: now,
    reprogramado_por: actorName,
    motivo_reprogramacion: payload.motivo || '',
    reprogramaciones: [
      ...(Array.isArray(alert?.reprogramaciones) ? alert.reprogramaciones : []),
      entry,
    ],
    registro_ot: shiftRegistroOtDates(alert?.registro_ot, payload.fecha_nueva),
  };
}

