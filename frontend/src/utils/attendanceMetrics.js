import { calculateScheduleHours, normalizeBreaks, normalizeTimeValue } from './workSchedule';

function safeText(value) {
  return String(value || '').trim().toLowerCase();
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeIsoDate(value) {
  return String(value || '').slice(0, 10);
}

function buildPersonAliases(person, user = null) {
  const aliases = new Set();
  if (person) {
    aliases.add(safeText(person.codigo));
    aliases.add(safeText(person.nombres_apellidos));
  }
  if (user) {
    aliases.add(safeText(user.username));
    aliases.add(safeText(user.full_name));
  }
  aliases.delete('');
  return aliases;
}

export function getReportHours(report) {
  const directTotal = toNumber(report?.totalHoras);
  if (directTotal > 0) return Number(directTotal.toFixed(2));
  const techTotal = (Array.isArray(report?.tecnicos) ? report.tecnicos : [])
    .reduce((sum, item) => sum + toNumber(item.horas), 0);
  return Number(techTotal.toFixed(2));
}

export function normalizeAttendancePerson(item, index = 0) {
  const basePerson = {
    hora_entrada: normalizeTimeValue(item?.hora_entrada),
    hora_salida: normalizeTimeValue(item?.hora_salida),
    refrigerios: normalizeBreaks(item?.refrigerios),
    disponibilidad_diaria_horas: item?.disponibilidad_diaria_horas ?? item?.capacidad_hh_dia ?? 0,
    capacidad_hh_dia: item?.capacidad_hh_dia ?? item?.disponibilidad_diaria_horas ?? 0,
  };
  const scheduledHours = calculateScheduleHours(basePerson);
  return {
    id: item?.id ?? `person_${index + 1}`,
    codigo: item?.codigo || '',
    nombres_apellidos: item?.nombres_apellidos || '',
    tipo_personal: item?.tipo_personal || 'Propio',
    empresa: item?.empresa || 'N.A.',
    especialidad: item?.especialidad || 'N.A.',
    turno_principal: item?.turno_principal || 'Primero',
    hora_entrada: basePerson.hora_entrada,
    hora_salida: basePerson.hora_salida,
    refrigerios: basePerson.refrigerios,
    disponibilidad_diaria_horas: scheduledHours,
    capacidad_hh_dia: scheduledHours,
  };
}

export function normalizeAttendanceRow(item, index = 0) {
  return {
    id: item?.id ?? `att_${index + 1}`,
    fecha: normalizeIsoDate(item?.fecha),
    personal_id: String(item?.personal_id || ''),
    personal_codigo: item?.personal_codigo || '',
    personal_nombre: item?.personal_nombre || '',
    tipo_personal: item?.tipo_personal || 'Propio',
    empresa: item?.empresa || 'N.A.',
    estado_asistencia: item?.estado_asistencia || 'Asistencia total',
    turno: item?.turno || 'Primero',
    horas_programadas: toNumber(item?.horas_programadas),
    horas_asistidas: toNumber(item?.horas_asistidas),
    observaciones: item?.observaciones || '',
    registrado_por: item?.registrado_por || '',
    registrado_at: item?.registrado_at || '',
  };
}

export function getAttendanceStatusColor(status) {
  switch (status) {
    case 'Asistencia total':
      return '#059669';
    case 'Asistencia parcial':
      return '#d97706';
    case 'Descanso medico':
      return '#dc2626';
    case 'Vacaciones':
      return '#2563eb';
    case 'Suspension':
      return '#7c3aed';
    case 'Falta':
      return '#991b1b';
    case 'Permiso':
      return '#0891b2';
    default:
      return '#64748b';
  }
}

export function buildWorkedHoursByPersonDate(workReports = [], people = []) {
  const peopleList = (Array.isArray(people) ? people : []).map(normalizeAttendancePerson);
  const aliasesByPersonId = new Map(
    peopleList.map((person) => [String(person.id), buildPersonAliases(person)]),
  );
  const byDatePerson = new Map();

  (Array.isArray(workReports) ? workReports : []).forEach((report) => {
    const reportDate = normalizeIsoDate(report?.fechaInicio || report?.fechaFin || report?.createdAt || report?.updatedAt);
    if (!reportDate) return;

    (Array.isArray(report?.tecnicos) ? report.tecnicos : []).forEach((tech) => {
      const hours = toNumber(tech?.horas);
      if (hours <= 0) return;

      const techId = String(tech?.tecnicoId || '');
      let person = null;

      if (techId) {
        person = peopleList.find((entry) => String(entry.id) === techId) || null;
      }

      if (!person) {
        const techAliases = new Set([
          safeText(tech?.tecnico),
          safeText(tech?.codigo),
          safeText(tech?.nombre),
        ]);
        techAliases.delete('');
        person = peopleList.find((entry) => {
          const aliases = aliasesByPersonId.get(String(entry.id)) || new Set();
          return Array.from(techAliases).some((alias) => aliases.has(alias));
        }) || null;
      }

      if (!person) return;

      const key = `${reportDate}__${person.id}`;
      const current = byDatePerson.get(key) || {
        date: reportDate,
        personId: String(person.id),
        personCode: person.codigo,
        personName: person.nombres_apellidos,
        totalHours: 0,
        reportIds: [],
        reportCodes: [],
      };
      current.totalHours = Number((current.totalHours + hours).toFixed(2));
      current.reportIds.push(report.id);
      current.reportCodes.push(report.reportCode || report.otNumero || '');
      byDatePerson.set(key, current);
    });
  });

  return byDatePerson;
}

export function buildPersonAttendanceMetrics({ people = [], attendance = [], workReports = [] } = {}) {
  const peopleList = (Array.isArray(people) ? people : []).map(normalizeAttendancePerson);
  const attendanceRows = (Array.isArray(attendance) ? attendance : []).map(normalizeAttendanceRow);
  const workedMap = buildWorkedHoursByPersonDate(workReports, peopleList);
  const attendanceMap = new Map(
    attendanceRows.map((row) => [`${normalizeIsoDate(row.fecha)}__${String(row.personal_id)}`, row]),
  );
  const result = new Map();

  peopleList.forEach((person) => {
    const personId = String(person.id);
    const relevantKeys = new Set();

    attendanceRows.forEach((row) => {
      if (String(row.personal_id) === personId && normalizeIsoDate(row.fecha)) {
        relevantKeys.add(`${normalizeIsoDate(row.fecha)}__${personId}`);
      }
    });
    workedMap.forEach((value, key) => {
      if (String(value.personId) === personId) relevantKeys.add(key);
    });

    const days = Array.from(relevantKeys)
      .sort()
      .map((key) => {
        const [date] = key.split('__');
        const worked = workedMap.get(key);
        const attendanceRow = attendanceMap.get(key) || null;
        const capacityHours = toNumber(attendanceRow?.horas_programadas || calculateScheduleHours(person) || person.disponibilidad_diaria_horas || person.capacidad_hh_dia);
        const attendanceHours = toNumber(attendanceRow?.horas_asistidas || capacityHours);
        const actualHours = toNumber(worked?.totalHours);
        const targetBaseHours = attendanceRow ? attendanceHours : capacityHours;
        const target85Hours = Number((targetBaseHours * 0.85).toFixed(2));
        const utilizationPct = targetBaseHours > 0 ? Number(((actualHours / targetBaseHours) * 100).toFixed(2)) : 0;
        const overtimeHours = actualHours > capacityHours ? Number((actualHours - capacityHours).toFixed(2)) : 0;
        const attendanceMismatchHours = attendanceRow && actualHours > attendanceHours
          ? Number((actualHours - attendanceHours).toFixed(2))
          : 0;
        const hasInconsistency = overtimeHours > 0 || attendanceMismatchHours > 0;

        let utilizationStatus = 'Sin carga';
        if (actualHours > capacityHours && capacityHours > 0) {
          utilizationStatus = 'Horas extra';
        } else if (targetBaseHours > 0 && actualHours >= target85Hours) {
          utilizationStatus = 'Cumple 85%';
        } else if (targetBaseHours > 0 && actualHours > 0) {
          utilizationStatus = 'Bajo 85%';
        }

        return {
          key,
          date,
          person,
          attendance: attendanceRow,
          worked,
          actualHours,
          capacityHours,
          attendanceHours,
          targetBaseHours,
          target85Hours,
          utilizationPct,
          overtimeHours,
          attendanceMismatchHours,
          hasInconsistency,
          utilizationStatus,
        };
      });

    const months = new Map();
    days.forEach((day) => {
      const monthKey = String(day.date || '').slice(0, 7);
      if (!months.has(monthKey)) {
        months.set(monthKey, {
          monthKey,
          actualHours: 0,
          capacityHours: 0,
          targetBaseHours: 0,
          target85Hours: 0,
          overtimeHours: 0,
          inconsistentDays: 0,
          workedDays: 0,
        });
      }
      const month = months.get(monthKey);
      month.actualHours = Number((month.actualHours + day.actualHours).toFixed(2));
      month.capacityHours = Number((month.capacityHours + day.capacityHours).toFixed(2));
      month.targetBaseHours = Number((month.targetBaseHours + day.targetBaseHours).toFixed(2));
      month.target85Hours = Number((month.target85Hours + day.target85Hours).toFixed(2));
      month.overtimeHours = Number((month.overtimeHours + day.overtimeHours).toFixed(2));
      if (day.hasInconsistency) month.inconsistentDays += 1;
      if (day.actualHours > 0) month.workedDays += 1;
    });

    const monthlyRows = Array.from(months.values())
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
      .map((month) => ({
        ...month,
        utilizationPct: month.targetBaseHours > 0 ? Number(((month.actualHours / month.targetBaseHours) * 100).toFixed(2)) : 0,
        status:
          month.capacityHours > 0 && month.actualHours > month.capacityHours
            ? 'Horas extra'
            : month.targetBaseHours > 0 && month.actualHours >= month.target85Hours
              ? 'Cumple 85%'
              : month.actualHours > 0
                ? 'Bajo 85%'
                : 'Sin carga',
      }));

    result.set(personId, {
      person,
      daily: days.sort((a, b) => b.date.localeCompare(a.date)),
      monthly: monthlyRows,
    });
  });

  return result;
}

export function findPersonMetricsForUser(metricsMap, user) {
  if (!metricsMap || !user) return null;
  const userAliases = buildPersonAliases(null, user);
  if (!userAliases.size) return null;
  for (const entry of metricsMap.values()) {
    const personAliases = buildPersonAliases(entry.person);
    if (Array.from(userAliases).some((alias) => personAliases.has(alias))) {
      return entry;
    }
  }
  return null;
}
