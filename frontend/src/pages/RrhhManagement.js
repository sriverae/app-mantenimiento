import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ReadOnlyAccessNotice from '../components/ReadOnlyAccessNotice';
import RrhhSectionNav from '../components/RrhhSectionNav';
import TableFilterRow from '../components/TableFilterRow';
import useTableColumnFilters from '../hooks/useTableColumnFilters';
import { createUser, getUsers, updateUser } from '../services/api';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import { hasMinRole, isReadOnlyRole } from '../utils/roleAccess';
import { filterRowsByColumns } from '../utils/tableFilters';
import {
  firstValidationError,
  validateNonNegativeFields,
  validateRequiredFields,
  validateTextFields,
} from '../utils/formValidation';
import {
  buildEmptyBreak,
  calculateScheduleHours,
  formatWorkSchedule,
  normalizeBreaks,
  normalizeTimeValue,
} from '../utils/workSchedule';

const INITIAL_DATA = [
  {
    id: 1,
    codigo: 'MEC-1',
    nombres_apellidos: 'Manuel de la Cruz Jimenez',
    cargo: 'Tecnico',
    especialidad: 'Mecanico',
    tipo_personal: 'Propio',
    empresa: 'N.A.',
    identificacion: 'N.A.',
    edad: 'N.A.',
    domicilio: 'Primero',
    capacidad_hh_dia: '12.00',
    costo_hora: '6.94',
    email: 'N.A.',
    turno_principal: 'Primero',
    hora_entrada: '07:00',
    hora_salida: '19:00',
    refrigerios: [{ id: 'mec_ref_1', inicio: '12:00', fin: '13:00' }],
    disponibilidad_diaria_horas: '12.00',
    disponibilidad_estado: 'Disponible',
    certificaciones: 'Trabajos mecanicos en planta',
    certificacion_vencimiento: '',
    competencias: 'Elevadores, reductores, fajas',
    supervisor_empresa: 'N.A.',
    telefono_contacto: 'N.A.',
    cobertura_servicio: 'N.A.',
  },
  {
    id: 2,
    codigo: 'ELE-1',
    nombres_apellidos: 'Hernan Alauce Alarcon',
    cargo: 'Encargado',
    especialidad: 'Electrico',
    tipo_personal: 'Propio',
    empresa: 'N.A.',
    identificacion: 'N.A.',
    edad: 'N.A.',
    domicilio: 'Primero',
    capacidad_hh_dia: '12.00',
    costo_hora: '6.11',
    email: 'N.A.',
    turno_principal: 'Primero',
    hora_entrada: '07:00',
    hora_salida: '19:00',
    refrigerios: [{ id: 'ele_ref_1', inicio: '12:00', fin: '13:00' }],
    disponibilidad_diaria_horas: '12.00',
    disponibilidad_estado: 'Disponible',
    certificaciones: 'Trabajos electricos en planta',
    certificacion_vencimiento: '',
    competencias: 'Motores, tableros, sensores',
    supervisor_empresa: 'N.A.',
    telefono_contacto: 'N.A.',
    cobertura_servicio: 'N.A.',
  },
];

const EMPTY_FORM = {
  codigo: '',
  nombres_apellidos: '',
  cargo: 'Tecnico',
  especialidad: 'Mecanico',
  tipo_personal: 'Propio',
  empresa: '',
  identificacion: '',
  edad: '',
  domicilio: '',
  capacidad_hh_dia: '',
  costo_hora: '',
  email: '',
  turno_principal: 'Primero',
  hora_entrada: '',
  hora_salida: '',
  refrigerios: [],
  disponibilidad_diaria_horas: '',
  disponibilidad_estado: 'Disponible',
  certificaciones: '',
  certificacion_vencimiento: '',
  competencias: '',
  supervisor_empresa: '',
  telefono_contacto: '',
  cobertura_servicio: '',
  usuario_id: '',
  usuario_acceso: '',
  usuario_role: '',
  usuario_sync_at: '',
  sincronizar_cuenta: true,
};

const normalizePlainText = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const getNameTokens = (value) => normalizePlainText(value)
  .split(/\s+/)
  .map((item) => item.replace(/[^a-z0-9]/g, ''))
  .filter((item) => item && !['de', 'del', 'la', 'las', 'los'].includes(item));

const SYNCABLE_ACCOUNT_ROLES = new Set(['TECNICO', 'OPERADOR', 'SUPERVISOR', 'ENCARGADO']);

const scoreUserNameMatch = (personName, userName) => {
  const personTokens = getNameTokens(personName);
  const userTokens = getNameTokens(userName);
  if (!personTokens.length || !userTokens.length) return 0;
  const personFirst = personTokens[0];
  const userFirst = userTokens[0];
  const personLast = personTokens[personTokens.length - 1];
  const userLast = userTokens[userTokens.length - 1];
  const overlap = personTokens.filter((token) => userTokens.includes(token)).length;
  if (normalizePlainText(personName) === normalizePlainText(userName)) return 100;
  if (personFirst === userFirst && personLast === userLast) return 90;
  if (personLast === userLast && overlap >= 2) return 82;
  if (personFirst === userFirst && overlap >= 2) return 76;
  return overlap >= 3 ? 72 : 0;
};

const getNameMatchCandidates = (users, person) => users
    .filter((item) => SYNCABLE_ACCOUNT_ROLES.has(String(item.role || '')))
    .map((item) => ({
      item,
      score: scoreUserNameMatch(person.nombres_apellidos, item.full_name),
    }))
    .filter((entry) => entry.score >= 80)
    .sort((a, b) => b.score - a.score);

const getUniqueTopMatch = (candidates) => {
  if (!candidates.length) return null;
  if (candidates.length > 1 && candidates[0].score === candidates[1].score) return null;
  return candidates[0].item;
};

const roleFromCargo = (cargo) => {
  const normalized = normalizePlainText(cargo);
  if (normalized.includes('operador')) return 'OPERADOR';
  if (normalized.includes('supervisor')) return 'SUPERVISOR';
  if (normalized.includes('encargado')) return 'ENCARGADO';
  if (normalized.includes('tecnico')) return 'TECNICO';
  return '';
};

const ROLE_LABELS = {
  TECNICO: 'Tecnico',
  OPERADOR: 'Operador',
  SUPERVISOR: 'Supervisor',
  ENCARGADO: 'Encargado',
};
const USER_ROLE_TO_CARGO = {
  TECNICO: 'Tecnico',
  OPERADOR: 'Operador',
  SUPERVISOR: 'Supervisor',
  ENCARGADO: 'Encargado',
};

const buildUsernameFromPerson = (person) => {
  const byCode = normalizePlainText(person?.codigo).replace(/[^a-z0-9]/g, '');
  if (byCode) return byCode;
  const parts = normalizePlainText(person?.nombres_apellidos).split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const first = parts[0]?.slice(0, 1) || '';
  const last = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  return `${first}${last}`.replace(/[^a-z0-9]/g, '');
};

const buildTemporaryPassword = () => `Mantto${new Date().getFullYear()}!`;

const getPersonTypeForFilter = (personTypeFilter, fallback = 'Propio') => {
  if (personTypeFilter === 'tercero') return 'Tercero';
  if (personTypeFilter === 'propio') return 'Propio';
  return fallback || 'Propio';
};

const buildEmptyFormForFilter = (personTypeFilter) => ({
  ...EMPTY_FORM,
  tipo_personal: getPersonTypeForFilter(personTypeFilter),
});

const syncRrhhItemsWithUsers = (rrhhItems, users) => {
  if (!Array.isArray(users) || !users.length) return rrhhItems;

  const usersById = new Map(users.map((item) => [String(item.id), item]));
  const usersByUsername = new Map(users.map((item) => [normalizePlainText(item.username), item]));

  return rrhhItems.map((item) => {
    if (item.tipo_personal !== 'Propio') return item;

    const linkedUser = (item.usuario_id && usersById.get(String(item.usuario_id)))
      || (item.usuario_acceso && usersByUsername.get(normalizePlainText(item.usuario_acceso)));

    if (!linkedUser) return item;

    const cargoFromRole = USER_ROLE_TO_CARGO[linkedUser.role];
    return {
      ...item,
      nombres_apellidos: linkedUser.full_name || item.nombres_apellidos,
      cargo: cargoFromRole || item.cargo,
      usuario_id: linkedUser.id,
      usuario_acceso: linkedUser.username,
      usuario_role: linkedUser.role || item.usuario_role,
    };
  });
};

const normalizeRrhhItem = (item, index) => {
  const horarioBase = {
    hora_entrada: normalizeTimeValue(item?.hora_entrada),
    hora_salida: normalizeTimeValue(item?.hora_salida),
    refrigerios: normalizeBreaks(item?.refrigerios),
    disponibilidad_diaria_horas: item?.disponibilidad_diaria_horas || item?.capacidad_hh_dia || '0.00',
    capacidad_hh_dia: item?.capacidad_hh_dia || item?.disponibilidad_diaria_horas || '0.00',
  };
  const horasNetas = calculateScheduleHours(horarioBase).toFixed(2);

  return {
    id: item?.id ?? index + 1,
    codigo: item?.codigo || '',
    nombres_apellidos: item?.nombres_apellidos || '',
    cargo: item?.cargo || 'Tecnico',
    especialidad: item?.especialidad || 'Mecanico',
    tipo_personal: item?.tipo_personal || 'Propio',
    empresa: item?.empresa || 'N.A.',
    identificacion: item?.identificacion || 'N.A.',
    edad: item?.edad || 'N.A.',
    domicilio: item?.domicilio || 'N.A.',
    capacidad_hh_dia: item?.tipo_personal === 'Tercero' ? (item?.capacidad_hh_dia || '0.00') : horasNetas,
    costo_hora: item?.costo_hora || '0.00',
    email: item?.email || 'N.A.',
    turno_principal: item?.turno_principal || 'Horario definido',
    hora_entrada: horarioBase.hora_entrada,
    hora_salida: horarioBase.hora_salida,
    refrigerios: horarioBase.refrigerios,
    disponibilidad_diaria_horas: item?.tipo_personal === 'Tercero' ? '0.00' : horasNetas,
    disponibilidad_estado: item?.disponibilidad_estado || 'Disponible',
    certificaciones: item?.certificaciones || 'N.A.',
    certificacion_vencimiento: item?.certificacion_vencimiento || '',
    competencias: item?.competencias || 'N.A.',
    supervisor_empresa: item?.supervisor_empresa || 'N.A.',
    telefono_contacto: item?.telefono_contacto || 'N.A.',
    cobertura_servicio: item?.cobertura_servicio || 'N.A.',
    usuario_id: item?.usuario_id || '',
    usuario_acceso: item?.usuario_acceso || '',
    usuario_role: item?.usuario_role || '',
    usuario_sync_at: item?.usuario_sync_at || '',
    sincronizar_cuenta: item?.sincronizar_cuenta !== false,
  };
};

export default function RrhhManagement({ personTypeFilter = 'all' }) {
  const { user } = useAuth();
  const isReadOnly = isReadOnlyRole(user);
  const canManageAttendance = hasMinRole(user, 'PLANNER');
  const [items, setItems] = useState(INITIAL_DATA);
  const [selectedId, setSelectedId] = useState(INITIAL_DATA[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const lockedPersonType = personTypeFilter === 'tercero' || personTypeFilter === 'propio'
    ? getPersonTypeForFilter(personTypeFilter)
    : '';
  const effectiveFormType = lockedPersonType || form.tipo_personal || 'Propio';
  const accountRole = effectiveFormType === 'Propio' ? roleFromCargo(form.cargo) : '';
  const suggestedUsername = form.usuario_acceso || buildUsernameFromPerson(form);
  const accountOptions = useMemo(
    () => availableUsers
      .filter((item) => SYNCABLE_ACCOUNT_ROLES.has(String(item.role || '')))
      .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''))),
    [availableUsers],
  );

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      const [data, usersData] = await Promise.all([
        loadSharedDocument(SHARED_DOCUMENT_KEYS.rrhh, INITIAL_DATA),
        getUsers().catch(() => []),
      ]);
      if (!active) return;
      const nextUsers = Array.isArray(usersData) ? usersData : [];
      const normalizedItems = (Array.isArray(data) && data.length ? data : INITIAL_DATA).map(normalizeRrhhItem);
      const nextItems = syncRrhhItemsWithUsers(normalizedItems, nextUsers);
      setItems(nextItems);
      setAvailableUsers(nextUsers);
      setSelectedId(nextItems[0]?.id ?? null);
      if (JSON.stringify(nextItems) !== JSON.stringify(normalizedItems)) {
        saveSharedDocument(SHARED_DOCUMENT_KEYS.rrhh, nextItems).catch((err) => {
          console.error('Error sincronizando roles de usuarios en RRHH:', err);
        });
      }
      setLoading(false);
    };

    load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setEditingId(null);
    setQuery('');
    setForm(buildEmptyFormForFilter(personTypeFilter));
  }, [personTypeFilter]);

  const persist = async (nextItems) => {
    if (isReadOnly) return;
    setItems(nextItems);
    try {
      await saveSharedDocument(SHARED_DOCUMENT_KEYS.rrhh, nextItems);
      setError('');
    } catch (err) {
      console.error('Error guardando RRHH:', err);
      setError('No se pudo guardar en el servidor. Revisa la conexion o tus permisos.');
    }
  };

  const syncUserAccountForPerson = async (person) => {
    const role = roleFromCargo(person.cargo);
    if (person.tipo_personal !== 'Propio' || !role || person.sincronizar_cuenta === false) {
      return { personPatch: { usuario_role: role || '', usuario_sync_at: '' }, message: '' };
    }

    const users = await getUsers();
    setAvailableUsers(Array.isArray(users) ? users : []);
    const requestedUsername = String(person.usuario_acceso || buildUsernameFromPerson(person)).trim().toLowerCase();
    const baseUsername = requestedUsername || buildUsernameFromPerson(person);
    if (!baseUsername) {
      return {
        personPatch: { usuario_role: role },
        message: 'No se pudo vincular cuenta: falta codigo o nombre para generar usuario.',
        warning: true,
      };
    }

    const normalizedName = normalizePlainText(person.nombres_apellidos);
    const generatedUsername = buildUsernameFromPerson(person);
    const normalizedGeneratedUsername = normalizePlainText(generatedUsername);
    const normalizedBaseUsername = normalizePlainText(baseUsername);
    const safeUsers = users.filter((item) => SYNCABLE_ACCOUNT_ROLES.has(String(item.role || '')));
    const linked = users.find((item) => person.usuario_id && String(item.id) === String(person.usuario_id)) || null;
    const exactUsername = safeUsers.find((item) => normalizePlainText(item.username) === normalizedBaseUsername) || null;
    const exactFullName = safeUsers.find((item) => normalizePlainText(item.full_name) === normalizedName) || null;
    const nameCandidates = getNameMatchCandidates(users, person);
    const manualNameMatch = getUniqueTopMatch(
      nameCandidates.filter((entry) => normalizePlainText(entry.item.username) !== normalizedGeneratedUsername),
    );
    const anyNameMatch = getUniqueTopMatch(nameCandidates);
    const linkedLooksGenerated = linked && normalizePlainText(linked.username) === normalizedGeneratedUsername;
    const exactUsernameLooksGenerated = exactUsername && normalizePlainText(exactUsername.username) === normalizedGeneratedUsername;
    const existing = (
      manualNameMatch
      && (!linked || linkedLooksGenerated || exactUsernameLooksGenerated)
    )
      ? manualNameMatch
      : (linked || exactUsername || exactFullName || anyNameMatch);

    if (existing) {
      const updatePayload = {};
      if (String(existing.full_name || '') !== String(person.nombres_apellidos || '')) {
        updatePayload.full_name = person.nombres_apellidos;
      }
      if (String(existing.role || '') !== role) {
        updatePayload.role = role;
      }
      if (Object.keys(updatePayload).length) {
        const updatedUser = await updateUser(existing.id, updatePayload);
        setAvailableUsers((prev) => prev.map((item) => (
          String(item.id) === String(existing.id) ? { ...item, ...updatedUser } : item
        )));
      }
      return {
        personPatch: {
          usuario_id: existing.id,
          usuario_acceso: existing.username,
          usuario_role: role,
          usuario_sync_at: new Date().toISOString(),
        },
        message: `Cuenta @${existing.username} sincronizada como ${ROLE_LABELS[role] || role}.`,
      };
    }

    const usedUsernames = new Set(users.map((item) => normalizePlainText(item.username)));
    let username = baseUsername;
    let counter = 2;
    while (usedUsernames.has(normalizePlainText(username))) {
      username = `${baseUsername}${counter}`;
      counter += 1;
    }

    const temporaryPassword = buildTemporaryPassword();
    const created = await createUser({
      username,
      full_name: person.nombres_apellidos,
      password: temporaryPassword,
      role,
    });
    setAvailableUsers((prev) => [created, ...prev.filter((item) => String(item.id) !== String(created.id))]);

    return {
      personPatch: {
        usuario_id: created.id,
        usuario_acceso: created.username,
        usuario_role: role,
        usuario_sync_at: new Date().toISOString(),
      },
      message: `Cuenta @${created.username} creada como ${ROLE_LABELS[role] || role}. Clave temporal: ${temporaryPassword}`,
    };
  };

  const filtered = useMemo(
    () => items.filter((item) => {
      const matchesQuery = `${item.codigo} ${item.nombres_apellidos} ${item.especialidad} ${item.tipo_personal || ''} ${item.usuario_acceso || ''} ${item.usuario_role || ''} ${item.empresa || ''} ${formatWorkSchedule(item)} ${item.competencias || ''} ${item.supervisor_empresa || ''}`.toLowerCase().includes(query.toLowerCase());
      const matchesType = personTypeFilter === 'all' || String(item.tipo_personal || '').toLowerCase() === personTypeFilter;
      return matchesQuery && matchesType;
    }),
    [items, query, personTypeFilter],
  );

  const rrhhTableColumns = useMemo(() => ([
    { id: 'codigo', getValue: (item) => item.codigo },
    { id: 'nombres_apellidos', getValue: (item) => item.nombres_apellidos },
    { id: 'cargo', getValue: (item) => item.cargo || 'Tecnico' },
    { id: 'especialidad', getValue: (item) => item.especialidad || 'N.A.' },
    { id: 'tipo_personal', getValue: (item) => item.tipo_personal || 'Propio' },
    { id: 'usuario_acceso', getValue: (item) => item.usuario_acceso ? `@${item.usuario_acceso} ${item.usuario_role || ''}` : 'Sin cuenta' },
    { id: 'empresa', getValue: (item) => item.empresa || 'N.A.' },
    { id: 'horario_base', getValue: (item) => item.tipo_personal === 'Propio' ? formatWorkSchedule(item) : 'Tercero' },
    { id: 'disponibilidad_diaria_horas', getValue: (item) => item.tipo_personal === 'Propio' ? `${item.disponibilidad_diaria_horas || '0.00'} h` : 'Segun contrato' },
    { id: 'disponibilidad_estado', getValue: (item) => item.tipo_personal === 'Propio' ? (item.disponibilidad_estado || 'N.A.') : 'Externo' },
    {
      id: 'certificaciones_cobertura',
      getValue: (item) => (item.tipo_personal === 'Propio'
        ? `${item.certificaciones || 'N.A.'} ${item.competencias || 'N.A.'}`
        : `${item.cobertura_servicio || 'N.A.'} ${item.supervisor_empresa || 'N.A.'}`),
    },
    { id: 'identificacion', getValue: (item) => item.identificacion || 'N.A.' },
    { id: 'edad', getValue: (item) => item.edad || 'N.A.' },
    { id: 'domicilio', getValue: (item) => item.domicilio || 'N.A.' },
    { id: 'capacidad_hh_dia', getValue: (item) => item.capacidad_hh_dia || '0.00' },
    { id: 'costo_hora', getValue: (item) => Number(item.costo_hora || 0).toFixed(2) },
    { id: 'email', getValue: (item) => item.email || 'N.A.' },
  ]), []);

  const {
    filters: rrhhFilters,
    setFilter: setRrhhFilter,
  } = useTableColumnFilters(rrhhTableColumns);

  const visibleRows = useMemo(
    () => filterRowsByColumns(filtered, rrhhTableColumns, rrhhFilters),
    [filtered, rrhhTableColumns, rrhhFilters],
  );

  const selectedItem = items.find((item) => item.id === selectedId) || null;
  const formBreaks = useMemo(() => normalizeBreaks(form.refrigerios), [form.refrigerios]);
  const formScheduledHours = useMemo(
    () => calculateScheduleHours({ ...form, refrigerios: formBreaks }),
    [form, formBreaks],
  );

  const updateBreak = (breakId, fieldName, value) => {
    setForm((prev) => ({
      ...prev,
      refrigerios: normalizeBreaks(prev.refrigerios).map((item) => (
        item.id === breakId ? { ...item, [fieldName]: value } : item
      )),
    }));
  };

  const addBreak = () => {
    setForm((prev) => ({
      ...prev,
      refrigerios: [...normalizeBreaks(prev.refrigerios), buildEmptyBreak()],
    }));
  };

  const removeBreak = (breakId) => {
    setForm((prev) => ({
      ...prev,
      refrigerios: normalizeBreaks(prev.refrigerios).filter((item) => item.id !== breakId),
    }));
  };

  useEffect(() => {
    if (loading) return;
    if (!filtered.length) {
      setSelectedId(null);
      return;
    }
    if (!filtered.some((item) => String(item.id) === String(selectedId))) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, loading, selectedId]);

  const handleNew = () => {
    if (isReadOnly) return;
    setEditingId(null);
    setForm(buildEmptyFormForFilter(personTypeFilter));
  };

  const handleEdit = () => {
    if (isReadOnly) return;
    if (!selectedItem) return;
    setEditingId(selectedItem.id);
    setForm({
      ...EMPTY_FORM,
      ...selectedItem,
      empresa: selectedItem.tipo_personal === 'Tercero' ? selectedItem.empresa : '',
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm(buildEmptyFormForFilter(personTypeFilter));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isReadOnly) return;

    const fixedForm = {
      ...form,
      tipo_personal: effectiveFormType,
    };
    const validationError = firstValidationError(
      validateRequiredFields([
        ['Codigo', fixedForm.codigo],
        ['Nombres y apellidos', fixedForm.nombres_apellidos],
        ['Cargo', fixedForm.cargo],
        ['Especialidad', fixedForm.especialidad],
        ...(fixedForm.tipo_personal === 'Propio'
          ? [['Hora entrada', fixedForm.hora_entrada], ['Hora salida', fixedForm.hora_salida]]
          : [['Empresa', fixedForm.empresa]]),
      ]),
      validateTextFields([
        ['Codigo', fixedForm.codigo],
        ['Nombres y apellidos', fixedForm.nombres_apellidos],
        ['Cargo', fixedForm.cargo],
        ['Especialidad', fixedForm.especialidad],
        ['Empresa', fixedForm.empresa],
        ['Identificacion', fixedForm.identificacion],
        ['Edad', fixedForm.edad],
        ['Domicilio', fixedForm.domicilio],
        ['Email', fixedForm.email],
        ['Certificaciones', fixedForm.certificaciones],
        ['Competencias', fixedForm.competencias],
        ['Supervisor empresa', fixedForm.supervisor_empresa],
        ['Telefono contacto', fixedForm.telefono_contacto],
        ['Cobertura servicio', fixedForm.cobertura_servicio],
        ['Usuario acceso', fixedForm.usuario_acceso],
      ]),
      validateNonNegativeFields([
        ['Capacidad HH dia', fixedForm.capacidad_hh_dia],
        ['Costo hora', fixedForm.costo_hora],
      ]),
    );
    if (validationError) {
      setError(validationError);
      setSyncMessage('');
      return;
    }
    const incompleteBreak = formBreaks.find((item) => Boolean(item.inicio || item.fin) && (!item.inicio || !item.fin));
    if (incompleteBreak) {
      setError('Cada refrigerio debe tener hora de inicio y fin.');
      setSyncMessage('');
      return;
    }
    const ownAvailability = fixedForm.tipo_personal === 'Propio'
      ? (formScheduledHours || Number(form.disponibilidad_diaria_horas) || Number(form.capacidad_hh_dia) || 0).toFixed(2)
      : '0.00';

    const payload = normalizeRrhhItem({
      ...fixedForm,
      codigo: fixedForm.codigo.trim(),
      nombres_apellidos: fixedForm.nombres_apellidos.trim(),
      cargo: fixedForm.cargo || 'Tecnico',
      especialidad: fixedForm.especialidad.trim() || 'Mecanico',
      tipo_personal: fixedForm.tipo_personal || 'Propio',
      empresa: fixedForm.tipo_personal === 'Tercero' ? (fixedForm.empresa.trim() || 'N.A.') : 'N.A.',
      identificacion: fixedForm.identificacion.trim() || 'N.A.',
      edad: fixedForm.edad.trim() || 'N.A.',
      domicilio: fixedForm.domicilio.trim() || 'N.A.',
      capacidad_hh_dia: fixedForm.tipo_personal === 'Propio' ? ownAvailability : (fixedForm.capacidad_hh_dia.trim() || '0.00'),
      costo_hora: fixedForm.costo_hora.trim() || '0.00',
      email: fixedForm.email.trim() || 'N.A.',
      turno_principal: fixedForm.tipo_personal === 'Propio' ? 'Horario definido' : 'N.A.',
      hora_entrada: fixedForm.tipo_personal === 'Propio' ? normalizeTimeValue(fixedForm.hora_entrada) : '',
      hora_salida: fixedForm.tipo_personal === 'Propio' ? normalizeTimeValue(fixedForm.hora_salida) : '',
      refrigerios: fixedForm.tipo_personal === 'Propio' ? formBreaks : [],
      disponibilidad_diaria_horas: fixedForm.tipo_personal === 'Propio' ? ownAvailability : '0.00',
      disponibilidad_estado: fixedForm.tipo_personal === 'Propio' ? (fixedForm.disponibilidad_estado || 'Disponible') : 'N.A.',
      certificaciones: fixedForm.tipo_personal === 'Propio' ? (fixedForm.certificaciones.trim() || 'N.A.') : 'N.A.',
      certificacion_vencimiento: fixedForm.tipo_personal === 'Propio' ? (fixedForm.certificacion_vencimiento || '') : '',
      competencias: fixedForm.tipo_personal === 'Propio' ? (fixedForm.competencias.trim() || 'N.A.') : 'N.A.',
      supervisor_empresa: fixedForm.tipo_personal === 'Tercero' ? (fixedForm.supervisor_empresa.trim() || 'N.A.') : 'N.A.',
      telefono_contacto: fixedForm.tipo_personal === 'Tercero' ? (fixedForm.telefono_contacto.trim() || 'N.A.') : 'N.A.',
      cobertura_servicio: fixedForm.tipo_personal === 'Tercero' ? (fixedForm.cobertura_servicio.trim() || 'N.A.') : 'N.A.',
      usuario_id: fixedForm.tipo_personal === 'Propio' ? fixedForm.usuario_id : '',
      usuario_acceso: fixedForm.tipo_personal === 'Propio' ? (fixedForm.usuario_acceso || buildUsernameFromPerson(fixedForm)) : '',
      usuario_role: fixedForm.tipo_personal === 'Propio' ? roleFromCargo(fixedForm.cargo) : '',
      sincronizar_cuenta: fixedForm.tipo_personal === 'Propio' ? fixedForm.sincronizar_cuenta !== false : false,
    });

    let finalPayload = payload;
    let accountSyncMessage = '';
    let accountSyncWarning = '';
    try {
      const syncResult = await syncUserAccountForPerson(payload);
      finalPayload = normalizeRrhhItem({
        ...payload,
        ...(syncResult.personPatch || {}),
      });
      accountSyncMessage = syncResult.message || '';
      setSyncMessage(accountSyncMessage);
    } catch (err) {
      console.error('Error sincronizando usuario desde RRHH:', err);
      setSyncMessage('');
      accountSyncWarning = 'El personal se guardo, pero no se pudo sincronizar su cuenta de usuario. Revisa permisos o crea la cuenta manualmente en Usuarios.';
    }

    if (editingId) {
      await persist(items.map((item) => (item.id === editingId ? { ...item, ...finalPayload, id: editingId } : item)));
    } else {
      const nextId = items.length ? Math.max(...items.map((item) => Number(item.id) || 0)) + 1 : 1;
      const nextItems = [{ ...finalPayload, id: nextId }, ...items];
      await persist(nextItems);
      setSelectedId(nextId);
    }

    if (accountSyncWarning) {
      setError(accountSyncWarning);
    }

    if (accountSyncMessage) {
      window.alert(accountSyncMessage);
    }

    handleCancel();
  };

  const handleDelete = async () => {
    if (isReadOnly) return;
    if (!selectedItem) return;
    if (!window.confirm(`Eliminar personal ${selectedItem.nombres_apellidos}?`)) return;
    const nextItems = items.filter((item) => item.id !== selectedItem.id);
    await persist(nextItems);
    setSelectedId(nextItems[0]?.id ?? null);
    handleCancel();
  };

  const pageMeta = personTypeFilter === 'propio'
    ? {
      title: 'Registro de personal propio',
      description: 'Alta, edicion y seguimiento del personal interno con horario de entrada, salida, refrigerios y competencias.',
      placeholder: 'Buscar por codigo, nombre, especialidad, horario o competencia',
    }
    : personTypeFilter === 'tercero'
      ? {
        title: 'Registro de personal tercero',
        description: 'Controla contratistas, empresa, cobertura, supervisor y datos operativos del servicio externo.',
        placeholder: 'Buscar por codigo, nombre, empresa, cobertura o supervisor',
      }
      : {
        title: 'Gestion de RRHH',
        description: 'Alta, edicion y eliminacion de personal de mantenimiento propio y tercero.',
        placeholder: 'Buscar por codigo, nombre, especialidad, tipo o empresa',
      };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.9rem', fontWeight: 700, marginBottom: '.3rem' }}>{pageMeta.title}</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
        {pageMeta.description}
      </p>

      <RrhhSectionNav />

      {isReadOnly && (
        <ReadOnlyAccessNotice message="Puedes revisar el personal propio y tercero registrado, pero este perfil no puede crear, editar ni eliminar datos de RRHH." />
      )}

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}
      {syncMessage && (
        <div className="alert alert-success">
          {syncMessage}
        </div>
      )}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="form-input"
            style={{ maxWidth: '520px' }}
            placeholder={pageMeta.placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {!isReadOnly && (
            <>
              <button type="button" className="btn btn-primary" onClick={handleNew}>Nuevo</button>
              <button type="button" className="btn btn-secondary" onClick={handleEdit} disabled={!selectedItem}>Editar</button>
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={!selectedItem}>Eliminar</button>
              <button type="button" className="btn" style={{ background: '#e5e7eb', color: '#374151' }} onClick={handleCancel}>Limpiar</button>
            </>
          )}
        </div>
      </div>

      {canManageAttendance && (
        <div
          className="card"
          style={{
            marginBottom: '1rem',
            background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)',
            border: '1px solid #bfdbfe',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <h3 className="card-title" style={{ marginBottom: '.25rem' }}>Control diario de asistencia</h3>
              <p style={{ color: '#475569', margin: 0 }}>
                Usa la plataforma de asistencia para marcar presencia total, parcial, vacaciones, descanso medico u otras incidencias de la cuadrilla.
              </p>
            </div>
            <Link to="/rrhh/asistencia" className="btn btn-primary" style={{ textDecoration: 'none' }}>
              Abrir asistencia
            </Link>
          </div>
        </div>
      )}

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1880px' }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              {['Codigo', 'Nombres y apellidos', 'Cargo', 'Especialidad', 'Tipo personal', 'Cuenta usuario', 'Empresa / Contrata', 'Horario base', 'Horas netas', 'Estado disp.', 'Certificaciones / Cobertura', 'Identificacion', 'Edad', 'Domicilio', 'Capacidad (Hh/dia)', 'Costo/Hra', 'E-mail'].map((header) => (
                <th key={header} style={{ border: '1px solid #e5e7eb', padding: '.6rem', textAlign: 'left', color: '#374151' }}>{header}</th>
              ))}
            </tr>
            <TableFilterRow columns={rrhhTableColumns} rows={filtered} filters={rrhhFilters} onChange={setRrhhFilter} />
          </thead>
          <tbody>
            {visibleRows.map((item) => (
              <tr key={item.id} onClick={() => setSelectedId(item.id)} style={{ background: selectedId === item.id ? '#eff6ff' : '#fff', cursor: 'pointer' }}>
                {[
                  item.codigo,
                  item.nombres_apellidos,
                  item.cargo || 'Tecnico',
                  item.especialidad || 'N.A.',
                  item.tipo_personal || 'Propio',
                  item.usuario_acceso ? `@${item.usuario_acceso} (${item.usuario_role || roleFromCargo(item.cargo) || 'N.A.'})` : 'Sin cuenta',
                  item.empresa || 'N.A.',
                  item.tipo_personal === 'Propio' ? formatWorkSchedule(item) : 'Tercero',
                  item.tipo_personal === 'Propio' ? `${item.disponibilidad_diaria_horas || '0.00'} h` : 'Segun contrato',
                  item.tipo_personal === 'Propio' ? (item.disponibilidad_estado || 'N.A.') : 'Externo',
                  item.tipo_personal === 'Propio'
                    ? `${item.certificaciones || 'N.A.'} | ${item.competencias || 'N.A.'}`
                    : `${item.cobertura_servicio || 'N.A.'} | ${item.supervisor_empresa || 'N.A.'}`,
                  item.identificacion || 'N.A.',
                  item.edad || 'N.A.',
                  item.domicilio || 'N.A.',
                  item.capacidad_hh_dia || '0.00',
                  `S/ ${Number(item.costo_hora || 0).toFixed(2)}`,
                  item.email || 'N.A.',
                ].map((value, index) => (
                  <td key={`${item.id}-${index}`} style={{ border: '1px solid #e5e7eb', padding: '.55rem', color: '#111827' }}>{value}</td>
                ))}
              </tr>
            ))}
            {!visibleRows.length && (
              <tr>
                <td colSpan={17} style={{ border: '1px solid #e5e7eb', padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
                  No hay personal que coincida con los filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!isReadOnly && (
      <div className="card" style={{ marginTop: '1rem' }}>
        <h3 className="card-title" style={{ marginBottom: '.8rem' }}>{editingId ? 'Editar personal' : 'Registrar personal'}</h3>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Codigo *</label>
            <input required className="form-input" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <label className="form-label">Nombres y apellidos *</label>
            <input required className="form-input" value={form.nombres_apellidos} onChange={(e) => setForm({ ...form, nombres_apellidos: e.target.value })} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Cargo</label>
            <select className="form-select" value={form.cargo || 'Tecnico'} onChange={(e) => setForm({ ...form, cargo: e.target.value })}>
              <option>Tecnico</option>
              <option>Encargado</option>
              <option>Supervisor</option>
              <option>Operador</option>
              <option>Otro</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Especialidad</label>
            <input className="form-input" value={form.especialidad} onChange={(e) => setForm({ ...form, especialidad: e.target.value })} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Tipo de personal</label>
            {personTypeFilter === 'all' ? (
              <select
                className="form-select"
                value={effectiveFormType}
                onChange={(e) => setForm({
                  ...form,
                  tipo_personal: e.target.value,
                  empresa: e.target.value === 'Tercero' ? form.empresa : '',
                  turno_principal: e.target.value === 'Propio' ? 'Horario definido' : 'N.A.',
                })}
              >
                <option>Propio</option>
                <option>Tercero</option>
              </select>
            ) : (
              <input
                className="form-input"
                value={effectiveFormType}
                readOnly
              />
            )}
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Identificacion</label>
            <input className="form-input" value={form.identificacion} onChange={(e) => setForm({ ...form, identificacion: e.target.value })} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Edad</label>
            <input className="form-input" value={form.edad} onChange={(e) => setForm({ ...form, edad: e.target.value })} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Domicilio</label>
            <input className="form-input" value={form.domicilio} onChange={(e) => setForm({ ...form, domicilio: e.target.value })} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Capacidad / disponibilidad (Hh/dia)</label>
            <input
              className="form-input"
              value={effectiveFormType === 'Propio' ? formScheduledHours.toFixed(2) : form.capacidad_hh_dia}
              onChange={(e) => setForm({ ...form, capacidad_hh_dia: e.target.value })}
              readOnly={effectiveFormType === 'Propio'}
            />
            {effectiveFormType === 'Propio' && (
              <div style={{ color: '#64748b', fontSize: '.78rem', marginTop: '.25rem' }}>
                Calculado como horario de salida menos entrada y refrigerios.
              </div>
            )}
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Costo/Hra</label>
            <input className="form-input" value={form.costo_hora} onChange={(e) => setForm({ ...form, costo_hora: e.target.value })} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">E-mail</label>
            <input className="form-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div
              style={{
                borderRadius: '.9rem',
                border: `1px solid ${effectiveFormType === 'Propio' ? '#bfdbfe' : '#fed7aa'}`,
                background: effectiveFormType === 'Propio' ? '#eff6ff' : '#fff7ed',
                padding: '.9rem 1rem',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: '.25rem', color: effectiveFormType === 'Propio' ? '#1d4ed8' : '#c2410c' }}>
                {effectiveFormType === 'Propio' ? 'Formulario de personal propio' : 'Formulario de personal tercero'}
              </div>
              <div style={{ color: '#475569', fontSize: '.92rem' }}>
                {effectiveFormType === 'Propio'
                  ? 'Aqui definimos horario real, refrigerios, certificaciones y competencias para asignacion de cuadrilla.'
                  : 'Aqui concentramos datos de empresa, contacto y alcance del servicio externo para control operativo.'}
              </div>
            </div>
          </div>
          {effectiveFormType === 'Propio' ? (
            <>
              {accountRole && (
                <div style={{ gridColumn: '1 / -1', border: '1px solid #bbf7d0', borderRadius: '.85rem', background: '#f0fdf4', padding: '.85rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.7rem', alignItems: 'end' }}>
                    <div>
                      <label className="form-label">Cuenta existente</label>
                      <select
                        className="form-select"
                        value={form.usuario_id || ''}
                        onChange={(e) => {
                          const selectedUser = accountOptions.find((item) => String(item.id) === String(e.target.value));
                          setForm({
                            ...form,
                            usuario_id: selectedUser?.id || '',
                            usuario_acceso: selectedUser?.username || '',
                            usuario_role: selectedUser?.role || accountRole,
                            cargo: USER_ROLE_TO_CARGO[selectedUser?.role] || form.cargo,
                            sincronizar_cuenta: true,
                          });
                        }}
                      >
                        <option value="">Detectar automaticamente / crear nueva</option>
                        {accountOptions.map((item) => (
                          <option key={item.id} value={String(item.id)}>
                            {item.full_name || item.username} (@{item.username}) - {ROLE_LABELS[item.role] || item.role}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">{form.usuario_id ? 'Usuario vinculado' : 'Usuario para cuenta nueva'}</label>
                      <input
                        className="form-input"
                        value={suggestedUsername}
                        onChange={(e) => setForm({ ...form, usuario_acceso: e.target.value.toLowerCase().replace(/\s/g, '') })}
                        placeholder="Ej: mcruz"
                        disabled={Boolean(form.usuario_id)}
                      />
                    </div>
                    <div>
                      <label className="form-label">Rol que se sincronizara</label>
                      <input className="form-input" value={ROLE_LABELS[accountRole] || accountRole} readOnly />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', color: '#166534', fontWeight: 700, paddingBottom: '.7rem' }}>
                      <input
                        type="checkbox"
                        checked={form.sincronizar_cuenta !== false}
                        onChange={(e) => setForm({ ...form, sincronizar_cuenta: e.target.checked })}
                      />
                      Sincronizar con Usuarios
                    </label>
                  </div>
                  <div style={{ color: '#166534', fontSize: '.86rem', marginTop: '.45rem', lineHeight: 1.55 }}>
                    Si seleccionas una cuenta existente, se actualiza esa cuenta y no se crea otra. Si lo dejas en automatico, el sistema buscara coincidencias por nombre antes de crear una cuenta nueva.
                  </div>
                </div>
              )}
              {!accountRole && (
                <div style={{ gridColumn: '1 / -1', border: '1px solid #fed7aa', borderRadius: '.85rem', background: '#fff7ed', color: '#9a3412', padding: '.85rem' }}>
                  Este cargo no genera cuenta automaticamente. Usa Tecnico, Operador, Supervisor o Encargado si necesita acceso al sistema.
                </div>
              )}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Horario entrada</label>
                <input type="time" className="form-input" value={form.hora_entrada || ''} onChange={(e) => setForm({ ...form, hora_entrada: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Horario salida</label>
                <input type="time" className="form-input" value={form.hora_salida || ''} onChange={(e) => setForm({ ...form, hora_salida: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Horas netas disponibles</label>
                <input className="form-input" value={formScheduledHours.toFixed(2)} readOnly />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Estado de disponibilidad</label>
                <select className="form-select" value={form.disponibilidad_estado || 'Disponible'} onChange={(e) => setForm({ ...form, disponibilidad_estado: e.target.value })}>
                  <option>Disponible</option>
                  <option>Disponible parcial</option>
                  <option>No disponible</option>
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1', border: '1px solid #dbeafe', borderRadius: '.85rem', background: '#f8fbff', padding: '.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.65rem' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#1e3a8a' }}>Horarios de refrigerio</div>
                    <div style={{ color: '#64748b', fontSize: '.85rem' }}>
                      Puedes registrar uno o varios descansos. Se descuentan de las horas disponibles del dia.
                    </div>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={addBreak}>
                    Agregar refrigerio
                  </button>
                </div>
                <div style={{ display: 'grid', gap: '.55rem' }}>
                  {formBreaks.map((item) => (
                    <div key={item.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) minmax(120px, 1fr) auto', gap: '.55rem', alignItems: 'end' }}>
                      <div>
                        <label className="form-label">Inicio refrigerio</label>
                        <input type="time" className="form-input" value={item.inicio || ''} onChange={(e) => updateBreak(item.id, 'inicio', e.target.value)} />
                      </div>
                      <div>
                        <label className="form-label">Fin refrigerio</label>
                        <input type="time" className="form-input" value={item.fin || ''} onChange={(e) => updateBreak(item.id, 'fin', e.target.value)} />
                      </div>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => removeBreak(item.id)}>
                        Quitar
                      </button>
                    </div>
                  ))}
                  {!formBreaks.length && (
                    <div style={{ color: '#64748b', fontSize: '.9rem', padding: '.65rem', background: '#fff', border: '1px dashed #cbd5e1', borderRadius: '.65rem' }}>
                      Sin refrigerios registrados. Si el personal tiene refrigerio, agregalo para calcular mejor las horas netas.
                    </div>
                  )}
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Vencimiento de certificacion</label>
                <input type="date" className="form-input" value={form.certificacion_vencimiento} onChange={(e) => setForm({ ...form, certificacion_vencimiento: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                <label className="form-label">Certificaciones / habilitaciones</label>
                <textarea className="form-textarea" value={form.certificaciones} onChange={(e) => setForm({ ...form, certificaciones: e.target.value })} placeholder="Ej: Electricidad industrial, trabajo en altura, bloqueo y etiquetado." />
              </div>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                <label className="form-label">Competencias por equipo o cuadrilla</label>
                <textarea className="form-textarea" value={form.competencias} onChange={(e) => setForm({ ...form, competencias: e.target.value })} placeholder="Ej: Ventiladores, reductores, tableros, instrumentacion, compresores." />
              </div>
            </>
          ) : (
            <>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Empresa / Contrata</label>
                <input className="form-input" value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} placeholder="Nombre de la empresa tercera" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Supervisor / contacto</label>
                <input className="form-input" value={form.supervisor_empresa} onChange={(e) => setForm({ ...form, supervisor_empresa: e.target.value })} placeholder="Responsable del tercero" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Telefono de contacto</label>
                <input className="form-input" value={form.telefono_contacto} onChange={(e) => setForm({ ...form, telefono_contacto: e.target.value })} placeholder="Celular o telefono del supervisor" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Cobertura del servicio</label>
                <input className="form-input" value={form.cobertura_servicio} onChange={(e) => setForm({ ...form, cobertura_servicio: e.target.value })} placeholder="Ej: Mecanico, electrico, soldadura, izaje" />
              </div>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                <label className="form-label">Observacion operativa del tercero</label>
                <textarea className="form-textarea" value={form.competencias} onChange={(e) => setForm({ ...form, competencias: e.target.value })} placeholder="Ej: disponible a requerimiento, movilizacion 24h, trabaja por jornada, etc." />
              </div>
            </>
          )}
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '.2rem' }}>
            <button type="submit" className="btn btn-primary">{editingId ? 'Actualizar' : 'Registrar'}</button>
          </div>
        </form>
      </div>
      )}
    </div>
  );
}
