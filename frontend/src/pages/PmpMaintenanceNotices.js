import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import TableFilterRow from '../components/TableFilterRow';
import useTableColumnFilters from '../hooks/useTableColumnFilters';
import { uploadPhotoAttachment } from '../services/api';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import {
  buildPendingOtFromNotice,
  calculateNoticeAssessment,
  getNoticeDateLabel,
  getNoticeStatusColor,
  getNoticeStatusLabel,
  isMaintenanceNoticeOwnedByUser,
  NOTICE_DETECTION_OPTIONS,
  summarizeNoticeForDisplay,
} from '../utils/maintenanceNotices';
import { formatIsoTimestampDisplay, formatTimeDisplay } from '../utils/dateFormat';
import { appendAuditEntry } from '../utils/auditLog';
import {
  canCreateMaintenanceNotices,
  canReviewMaintenanceNotices,
  getUserRole,
} from '../utils/roleAccess';
import { filterRowsByColumns } from '../utils/tableFilters';
import {
  buildUploadedPhotoPayload,
  getBlockedTextMessage,
  getNoticeProblemPhotos,
  hasBlockedMaintenanceTextChars,
  MAX_NOTICE_PROBLEM_PHOTOS,
} from '../utils/workReportEvidence';

const NOTICES_KEY = SHARED_DOCUMENT_KEYS.maintenanceNotices;
const OT_ALERTS_KEY = SHARED_DOCUMENT_KEYS.otAlerts;
const EQUIPMENT_KEY = SHARED_DOCUMENT_KEYS.equipmentItems;

const NOTICE_CATEGORY_OPTIONS = [
  'Observacion mecanica',
  'Observacion electrica',
  'Inspeccion pendiente',
  'Lubricacion pendiente',
  'Seguridad',
  'Servicio de terceros',
  'Aviso general',
];

const EMPTY_NOTICE_FORM = {
  area_filter: '',
  equipo_id: '',
  categoria: 'Aviso general',
  detalle: '',
  sugerencia_texto: '',
  hora_evidencia: new Date().toTimeString().slice(0, 5),
  can_continue_working: 'si',
  detection_method: 'Visual',
  has_production_impact: 'no',
  has_safety_risk: 'no',
  requires_stop: 'no',
};

const sortNotices = (items) => [...(Array.isArray(items) ? items : [])]
  .sort((a, b) => new Date(b.created_at || b.fecha_aviso || 0) - new Date(a.created_at || a.fecha_aviso || 0));

const buildManualNoticeCode = (existingItems = []) => {
  const maxManualSequence = (Array.isArray(existingItems) ? existingItems : []).reduce((max, item) => {
    if (!String(item.aviso_codigo || '').startsWith('AV-MAN-')) return max;
    const current = Number(String(item.aviso_codigo).replace('AV-MAN-', '')) || 0;
    return current > max ? current : max;
  }, 0);
  return `AV-MAN-${String(maxManualSequence + 1).padStart(4, '0')}`;
};

function StatCard({ label, value, color = '#111827' }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
    </div>
  );
}

function ReadOnlyBox({ title, text }) {
  return (
    <div className="card" style={{ marginBottom: '1rem', background: '#eff6ff', border: '1px solid #bfdbfe' }}>
      <h3 className="card-title" style={{ marginBottom: '.35rem' }}>{title}</h3>
      <p style={{ color: '#1e3a8a', lineHeight: 1.6, marginBottom: 0 }}>{text}</p>
    </div>
  );
}

export default function PmpMaintenanceNotices() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [equipmentItems, setEquipmentItems] = useState([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('TODOS');
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState(EMPTY_NOTICE_FORM);
  const [noticePhotos, setNoticePhotos] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);

  const normalizedRole = getUserRole(user);
  const canCreateOnly = canCreateMaintenanceNotices(user);
  const canReview = canReviewMaintenanceNotices(user);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [noticesData, alertsData, equipmentsData] = await Promise.all([
        loadSharedDocument(NOTICES_KEY, []),
        loadSharedDocument(OT_ALERTS_KEY, []),
        loadSharedDocument(EQUIPMENT_KEY, []),
      ]);
      if (!active) return;
      const nextItems = sortNotices(noticesData);
      setItems(nextItems);
      setAlerts(Array.isArray(alertsData) ? alertsData : []);
      setEquipmentItems(Array.isArray(equipmentsData) ? equipmentsData : []);
      setSelectedId(nextItems[0]?.id ?? null);
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, []);

  const persistNotices = async (nextItems) => {
    const orderedNotices = sortNotices(nextItems);
    setItems(orderedNotices);
    try {
      await saveSharedDocument(NOTICES_KEY, orderedNotices);
      setError('');
      return orderedNotices;
    } catch (err) {
      console.error('Error guardando avisos:', err);
      setError('No se pudieron guardar los avisos de mantenimiento.');
      throw err;
    }
  };

  const persistReview = async (nextItems, nextAlerts) => {
    const orderedNotices = sortNotices(nextItems);
    setItems(orderedNotices);
    setAlerts(nextAlerts);
    try {
      await Promise.all([
        saveSharedDocument(NOTICES_KEY, orderedNotices),
        saveSharedDocument(OT_ALERTS_KEY, nextAlerts),
      ]);
      setError('');
      return orderedNotices;
    } catch (err) {
      console.error('Error guardando revision de avisos:', err);
      setError('No se pudieron guardar los cambios de avisos de mantenimiento.');
      throw err;
    }
  };

  const visibleItems = useMemo(() => {
    const baseItems = canCreateOnly ? items.filter((item) => isMaintenanceNoticeOwnedByUser(item, user)) : items;
    return baseItems.filter((item) => {
      const matchesStatus = statusFilter === 'TODOS' || item.status === statusFilter;
      const haystack = `${item.aviso_codigo} ${item.source_ot_numero} ${item.codigo} ${item.descripcion} ${item.categoria} ${item.detalle} ${item.sugerencia_texto}`.toLowerCase();
      const matchesQuery = !query.trim() || haystack.includes(query.toLowerCase());
      return matchesStatus && matchesQuery;
    });
  }, [canCreateOnly, items, query, statusFilter, user]);

  const noticeTableColumns = useMemo(() => ([
    { id: 'aviso_codigo', getValue: (item) => item.aviso_codigo },
    { id: 'origen', getValue: (item) => (canCreateOnly ? formatIsoTimestampDisplay(item.created_at) : (item.source_ot_numero || 'Manual')) },
    { id: 'fecha_aviso', getValue: (item) => getNoticeDateLabel(item) },
    { id: 'equipo', getValue: (item) => `${item.codigo || ''} ${item.descripcion || ''}`.trim() },
    { id: 'categoria', getValue: (item) => item.categoria || 'Aviso tecnico' },
    { id: 'criticidad', getValue: (item) => item.criticidad_aviso || 'N.A.' },
    { id: 'detalle', getValue: (item) => item.detalle || item.sugerencia_texto || 'N.A.' },
    { id: 'estado', getValue: (item) => getNoticeStatusLabel(item.status) },
    { id: 'registrado_por', getValue: (item) => item.created_by_name || item.created_by || 'Sistema' },
  ]), [canCreateOnly]);

  const {
    filters: noticeFilters,
    setFilter: setNoticeFilter,
  } = useTableColumnFilters(noticeTableColumns);

  const filteredNoticeRows = useMemo(
    () => filterRowsByColumns(visibleItems, noticeTableColumns, noticeFilters),
    [visibleItems, noticeTableColumns, noticeFilters],
  );

  const selected = useMemo(
    () => filteredNoticeRows.find((item) => String(item.id) === String(selectedId))
      || visibleItems.find((item) => String(item.id) === String(selectedId))
      || (canCreateOnly ? null : items.find((item) => String(item.id) === String(selectedId)))
      || filteredNoticeRows[0]
      || visibleItems[0]
      || null,
    [filteredNoticeRows, visibleItems, items, selectedId, canCreateOnly],
  );

  const stats = useMemo(() => {
    const baseItems = canCreateOnly ? items.filter((item) => isMaintenanceNoticeOwnedByUser(item, user)) : items;
    return {
      pendientes: baseItems.filter((item) => item.status === 'Pendiente').length,
      aceptados: baseItems.filter((item) => item.status === 'Aceptado').length,
      rechazados: baseItems.filter((item) => item.status === 'Rechazado').length,
    };
  }, [canCreateOnly, items, user]);

  const equipmentOptions = useMemo(
    () => (Array.isArray(equipmentItems) ? equipmentItems : []).slice().sort((a, b) => `${a.codigo} ${a.descripcion}`.localeCompare(`${b.codigo} ${b.descripcion}`, 'es')),
    [equipmentItems],
  );
  const equipmentAreaOptions = useMemo(
    () => Array.from(new Set(equipmentOptions.map((item) => String(item.area_trabajo || 'N.A.').trim() || 'N.A.'))).sort((a, b) => a.localeCompare(b, 'es')),
    [equipmentOptions],
  );
  const filteredEquipmentOptions = useMemo(
    () => equipmentOptions.filter((item) => !form.area_filter || String(item.area_trabajo || 'N.A.') === form.area_filter),
    [equipmentOptions, form.area_filter],
  );

  const selectedEquipment = useMemo(
    () => equipmentOptions.find((item) => String(item.id) === String(form.equipo_id)) || null,
    [equipmentOptions, form.equipo_id],
  );

  const noticeAssessment = useMemo(
    () => calculateNoticeAssessment({
      canContinueWorking: form.can_continue_working === 'si',
      detectionMethod: form.detection_method,
      hasProductionImpact: form.has_production_impact === 'si',
      hasSafetyRisk: form.has_safety_risk === 'si',
      requiresStop: form.requires_stop === 'si',
    }),
    [
      form.can_continue_working,
      form.detection_method,
      form.has_production_impact,
      form.has_safety_risk,
      form.requires_stop,
    ],
  );

  useEffect(() => {
    if (!form.equipo_id) return;
    const isStillVisible = filteredEquipmentOptions.some((item) => String(item.id) === String(form.equipo_id));
    if (!isStillVisible) {
      setForm((prev) => ({ ...prev, equipo_id: '' }));
    }
  }, [filteredEquipmentOptions, form.equipo_id]);

  const createNotice = async (event) => {
    event.preventDefault();
    if (!canCreateOnly) return;
    if (!selectedEquipment) {
      window.alert('Selecciona un equipo para registrar el aviso.');
      return;
    }
    if (!form.detalle.trim()) {
      window.alert('Detalla el aviso de mantenimiento que encontraste.');
      return;
    }
    if (hasBlockedMaintenanceTextChars(form.detalle)) {
      window.alert(getBlockedTextMessage('Detalle tecnico'));
      return;
    }
    if (hasBlockedMaintenanceTextChars(form.categoria) || hasBlockedMaintenanceTextChars(form.detection_method)) {
      window.alert(getBlockedTextMessage('Categoria o metodo de deteccion'));
      return;
    }
    if (hasBlockedMaintenanceTextChars(form.sugerencia_texto)) {
      window.alert(getBlockedTextMessage('Texto sugerido del aviso'));
      return;
    }
    if (!form.hora_evidencia) {
      window.alert('Registra la hora en que se observó la evidencia.');
      return;
    }

    if (!noticePhotos.length) {
      window.alert('Agrega al menos una foto del problema para registrar el aviso.');
      return;
    }

    setSaving(true);
    try {
      const nextNotice = {
        id: `notice_manual_${Date.now()}`,
        sequence: 0,
        aviso_codigo: buildManualNoticeCode(items),
        status: 'Pendiente',
        source_ot_id: '',
        source_ot_numero: '',
        source_report_id: '',
        source_report_code: '',
        codigo: selectedEquipment.codigo || '',
        descripcion: selectedEquipment.descripcion || '',
        area_trabajo: selectedEquipment.area_trabajo || 'N.A.',
        responsable: selectedEquipment.responsable || 'N.A.',
        categoria: form.categoria || 'Aviso general',
        detalle: form.detalle.trim(),
        sugerencia_texto: (form.sugerencia_texto || form.detalle).trim(),
        fecha_aviso: new Date().toISOString().slice(0, 10),
        hora_evidencia: form.hora_evidencia,
        can_continue_working: form.can_continue_working === 'si',
        detection_method: form.detection_method,
        has_production_impact: form.has_production_impact === 'si',
        has_safety_risk: form.has_safety_risk === 'si',
        requires_stop: form.requires_stop === 'si',
        criticidad_aviso: noticeAssessment.criticality,
        prioridad_sugerida: noticeAssessment.priority,
        tipo_mantto_sugerido: noticeAssessment.suggestedType,
        resumen_criticidad: noticeAssessment.summary,
        rango_notificacion: '',
        photos: noticePhotos,
        problem_photos: noticePhotos,
        created_at: new Date().toISOString(),
        created_by: user?.full_name || user?.username || 'Sistema',
        created_by_user_id: user?.id ?? '',
        created_by_username: user?.username ?? '',
        created_by_name: user?.full_name ?? user?.username ?? '',
        accepted_ot_id: '',
        accepted_ot_number: '',
        rejection_reason: '',
        origin: 'MANUAL',
      };

      const ordered = await persistNotices([nextNotice, ...items]);
      appendAuditEntry({
        action: 'AVISO_CREADO',
        module: 'Avisos de mantenimiento',
        entityType: 'Aviso',
        entityId: nextNotice.id,
        title: `Aviso ${nextNotice.aviso_codigo} registrado`,
        description: `${nextNotice.codigo || 'Equipo'} - ${nextNotice.descripcion || 'Sin descripcion'} | Criticidad sugerida: ${nextNotice.criticidad_aviso || 'N.A.'}.`,
        severity: ['Alta', 'Critica'].includes(nextNotice.criticidad_aviso) ? 'critical' : 'info',
        actor: user,
        after: {
          status: nextNotice.status,
          categoria: nextNotice.categoria,
          criticidad_aviso: nextNotice.criticidad_aviso,
          prioridad_sugerida: nextNotice.prioridad_sugerida,
        },
      }).catch((err) => console.error('Error auditando aviso creado:', err));
      setSelectedId(nextNotice.id);
      setForm({ ...EMPTY_NOTICE_FORM, hora_evidencia: new Date().toTimeString().slice(0, 5) });
      setNoticePhotos([]);
      setSuccess(`Aviso ${nextNotice.aviso_codigo} registrado correctamente.`);
      if (!selectedId && ordered[0]?.id) setSelectedId(ordered[0].id);
    } finally {
      setSaving(false);
    }
  };

  const uploadNoticePhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      window.alert('Selecciona una imagen valida.');
      return;
    }
    if (noticePhotos.length >= MAX_NOTICE_PROBLEM_PHOTOS) {
      window.alert(`Puedes agregar hasta ${MAX_NOTICE_PROBLEM_PHOTOS} fotos por aviso.`);
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('scope', `maintenance_notice_${Date.now()}`);
    formData.append('category', 'PROBLEMA');
    formData.append('caption', file.name);
    setUploadingPhoto(true);
    try {
      const uploaded = await uploadPhotoAttachment(formData);
      setNoticePhotos((prev) => [
        ...prev,
        buildUploadedPhotoPayload(uploaded, {
          category: 'PROBLEMA',
          original_name: file.name,
        }),
      ]);
      setError('');
    } catch (err) {
      console.error('Error subiendo foto de aviso:', err);
      window.alert(err?.response?.data?.detail || 'No se pudo subir la foto del aviso.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removeNoticePhoto = (photoId) => {
    setNoticePhotos((prev) => prev.filter((photo) => String(photo.id || photo.filename) !== String(photoId)));
  };

  const acceptNotice = async () => {
    if (!selected || selected.status !== 'Pendiente' || !canReview) return;
    const linkedOt = alerts.find((item) => String(item.aviso_id) === String(selected.id));
    if (linkedOt) {
      window.alert('Este aviso ya generó una OT pendiente anteriormente.');
      return;
    }

    const acceptedAt = new Date().toISOString();
    const acceptedByName = user?.full_name || user?.username || normalizedRole;
    const pendingOt = {
      ...buildPendingOtFromNotice(selected),
      fecha_aceptacion_aviso: acceptedAt,
      aviso_aceptado_por: acceptedByName,
      fecha_emision_aviso: selected.fecha_aviso || selected.created_at || '',
      hora_emision_aviso: selected.hora_evidencia || '',
      aviso_creado_at: selected.created_at || '',
      aviso_origen: {
        ...selected,
        photos: getNoticeProblemPhotos(selected),
        problem_photos: getNoticeProblemPhotos(selected),
      },
    };
    const nextAlerts = [pendingOt, ...alerts];
    const nextItems = items.map((item) => (
      String(item.id) !== String(selected.id)
        ? item
        : {
          ...item,
          status: 'Aceptado',
          accepted_at: acceptedAt,
          accepted_by_name: acceptedByName,
          accepted_by_role: normalizedRole,
          accepted_ot_id: pendingOt.id,
          accepted_ot_number: pendingOt.ot_numero || '',
        }
    ));

    await persistReview(nextItems, nextAlerts);
    appendAuditEntry({
      action: 'AVISO_ACEPTADO',
      module: 'Avisos de mantenimiento',
      entityType: 'Aviso',
      entityId: selected.id,
      title: `Aviso ${selected.aviso_codigo} aceptado`,
      description: `El aviso se convirtio en OT pendiente para ${selected.codigo || 'equipo sin codigo'}.`,
      severity: ['Alta', 'Critica'].includes(selected.criticidad_aviso) ? 'critical' : 'success',
      actor: user,
      before: { status: 'Pendiente' },
      after: { status: 'Aceptado', accepted_ot_id: pendingOt.id },
      meta: { aviso_codigo: selected.aviso_codigo, ot_id: pendingOt.id },
    }).catch((err) => console.error('Error auditando aviso aceptado:', err));
    setSuccess(`Aviso ${selected.aviso_codigo} aceptado y convertido en OT pendiente.`);
  };

  const rejectNotice = async () => {
    if (!selected || selected.status !== 'Pendiente' || !canReview) return;
    const reason = window.prompt('Motivo del rechazo del aviso:', selected.rejection_reason || '');
    if (reason === null) return;
    const nextItems = items.map((item) => (
      String(item.id) !== String(selected.id)
        ? item
        : {
          ...item,
          status: 'Rechazado',
          rejected_at: new Date().toISOString(),
          rejected_by_name: user?.full_name || user?.username || normalizedRole,
          rejected_by_role: normalizedRole,
          rejection_reason: reason.trim(),
        }
    ));
    await persistNotices(nextItems);
    appendAuditEntry({
      action: 'AVISO_RECHAZADO',
      module: 'Avisos de mantenimiento',
      entityType: 'Aviso',
      entityId: selected.id,
      title: `Aviso ${selected.aviso_codigo} rechazado`,
      description: reason.trim() || 'Aviso rechazado sin observacion adicional.',
      severity: 'warning',
      actor: user,
      before: { status: 'Pendiente' },
      after: { status: 'Rechazado', rejection_reason: reason.trim() },
      meta: { aviso_codigo: selected.aviso_codigo },
    }).catch((err) => console.error('Error auditando aviso rechazado:', err));
    setSuccess(`Aviso ${selected.aviso_codigo} rechazado.`);
  };

  useEffect(() => {
    if (!filteredNoticeRows.length && !visibleItems.length) {
      setSelectedId(null);
      return;
    }
    if (!filteredNoticeRows.some((item) => String(item.id) === String(selectedId))) {
      setSelectedId(filteredNoticeRows[0]?.id ?? visibleItems[0]?.id ?? null);
    }
  }, [filteredNoticeRows, visibleItems, selectedId]);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.95rem', fontWeight: 700, marginBottom: '.35rem' }}>Avisos de Mantenimiento</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
        {canCreateOnly
          ? 'Registra avisos de mantenimiento y revisa el historial de los avisos que has levantado.'
          : 'Revisa las sugerencias levantadas por el personal y decide si deben convertirse en nuevas órdenes pendientes.'}
      </p>

      {canCreateOnly && (
        <ReadOnlyBox
          title={`${normalizedRole === 'SUPERVISOR' ? 'Supervisor' : 'Operador'} en modo operativo`}
          text="En este perfil puedes crear avisos de mantenimiento y revisar tu propio historial. El resto de módulos del sistema quedan en modo solo lectura."
        />
      )}

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="stats-grid" style={{ marginBottom: '1rem' }}>
        <StatCard label={canCreateOnly ? 'Mis avisos pendientes' : 'Avisos pendientes'} value={stats.pendientes} color="#b45309" />
        <StatCard label="Aceptados" value={stats.aceptados} color="#059669" />
        <StatCard label="Rechazados" value={stats.rechazados} color="#dc2626" />
      </div>

      {canCreateOnly && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 className="card-title">Crear aviso de mantenimiento</h3>
          <form onSubmit={createNotice} style={{ display: 'grid', gap: '.85rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.8rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Area del equipo</label>
                <select className="form-select" value={form.area_filter} onChange={(e) => setForm((prev) => ({ ...prev, area_filter: e.target.value }))}>
                  <option value="">Todas las areas</option>
                  {equipmentAreaOptions.map((area) => (
                    <option key={area} value={area}>{area}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Equipo *</label>
                <select className="form-select" value={form.equipo_id} onChange={(e) => setForm((prev) => ({ ...prev, equipo_id: e.target.value }))}>
                  <option value="">Selecciona equipo</option>
                  {filteredEquipmentOptions.map((item) => (
                    <option key={item.id} value={String(item.id)}>
                      {item.codigo} - {item.descripcion} ({item.area_trabajo || 'N.A.'})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Categoría</label>
                <select className="form-select" value={form.categoria} onChange={(e) => setForm((prev) => ({ ...prev, categoria: e.target.value }))}>
                  {NOTICE_CATEGORY_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Hora en que vio la evidencia *</label>
                <input
                  className="form-input"
                  type="time"
                  value={form.hora_evidencia}
                  onChange={(e) => setForm((prev) => ({ ...prev, hora_evidencia: e.target.value }))}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">¿Todavía se puede trabajar con la avería?</label>
                <select className="form-select" value={form.can_continue_working} onChange={(e) => setForm((prev) => ({ ...prev, can_continue_working: e.target.value }))}>
                  <option value="si">Sí</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">¿Cómo se detectó la avería?</label>
                <select className="form-select" value={form.detection_method} onChange={(e) => setForm((prev) => ({ ...prev, detection_method: e.target.value }))}>
                  {NOTICE_DETECTION_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">¿Hay impacto en producción?</label>
                <select className="form-select" value={form.has_production_impact} onChange={(e) => setForm((prev) => ({ ...prev, has_production_impact: e.target.value }))}>
                  <option value="no">No</option>
                  <option value="si">Sí</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">¿Existe riesgo de seguridad?</label>
                <select className="form-select" value={form.has_safety_risk} onChange={(e) => setForm((prev) => ({ ...prev, has_safety_risk: e.target.value }))}>
                  <option value="no">No</option>
                  <option value="si">Sí</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">¿Requiere parada o intervención pronta?</label>
                <select className="form-select" value={form.requires_stop} onChange={(e) => setForm((prev) => ({ ...prev, requires_stop: e.target.value }))}>
                  <option value="no">No</option>
                  <option value="si">Sí</option>
                </select>
              </div>
            </div>

            {selectedEquipment && (
              <div style={{ padding: '.85rem 1rem', borderRadius: '.85rem', background: '#f8fafc', border: '1px solid #e5e7eb', color: '#334155', lineHeight: 1.6 }}>
                <div><strong>Código:</strong> {selectedEquipment.codigo || 'N.A.'}</div>
                <div><strong>Equipo:</strong> {selectedEquipment.descripcion || 'N.A.'}</div>
                <div><strong>Área:</strong> {selectedEquipment.area_trabajo || 'N.A.'}</div>
              </div>
            )}

            <div
              style={{
                padding: '.95rem 1rem',
                borderRadius: '.9rem',
                background: noticeAssessment.criticality === 'Critica'
                  ? '#fef2f2'
                  : noticeAssessment.criticality === 'Alta'
                    ? '#fff7ed'
                    : noticeAssessment.criticality === 'Media'
                      ? '#eff6ff'
                      : '#ecfdf5',
                border: `1px solid ${noticeAssessment.criticality === 'Critica'
                  ? '#fca5a5'
                  : noticeAssessment.criticality === 'Alta'
                    ? '#fdba74'
                    : noticeAssessment.criticality === 'Media'
                      ? '#93c5fd'
                      : '#86efac'}`,
                color: '#334155',
                lineHeight: 1.65,
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: '.3rem', color: '#0f172a' }}>
                Criticidad sugerida del aviso: {noticeAssessment.criticality}
              </div>
              <div><strong>Prioridad sugerida OT:</strong> {noticeAssessment.priority}</div>
              <div><strong>Tipo sugerido:</strong> {noticeAssessment.suggestedType}</div>
              <div style={{ marginTop: '.35rem' }}>{noticeAssessment.summary}</div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Detalle técnico *</label>
              <textarea
                className="form-textarea"
                rows={4}
                value={form.detalle}
                onChange={(e) => setForm((prev) => ({ ...prev, detalle: e.target.value }))}
                placeholder="Describe claramente la condición encontrada, la observación o el riesgo detectado."
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Texto sugerido del aviso</label>
              <input
                className="form-input"
                value={form.sugerencia_texto}
                onChange={(e) => setForm((prev) => ({ ...prev, sugerencia_texto: e.target.value }))}
                placeholder="Si lo dejas vacío, el sistema usará el mismo detalle técnico."
              />
            </div>

            <div className="card" style={{ marginBottom: 0, background: '#f8fafc', border: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.7rem' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1rem' }}>Fotos del problema *</h4>
                  <p style={{ margin: '.2rem 0 0', color: '#6b7280', fontSize: '.88rem' }}>Agrega una o mas fotos. Se imprimiran como anexo del aviso en la OT.</p>
                </div>
                <label className="btn btn-secondary" style={{ cursor: uploadingPhoto ? 'not-allowed' : 'pointer', opacity: uploadingPhoto ? .65 : 1 }}>
                  {uploadingPhoto ? 'Subiendo...' : 'Agregar foto'}
                  <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploadingPhoto} onChange={uploadNoticePhoto} />
                </label>
              </div>
              {noticePhotos.length ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.65rem' }}>
                  {noticePhotos.map((photo) => (
                    <div key={photo.id || photo.filename} style={{ border: '1px solid #d1d5db', borderRadius: '.65rem', overflow: 'hidden', background: '#fff' }}>
                      <img src={photo.url} alt={photo.caption || 'Foto del problema'} style={{ width: '100%', height: '120px', objectFit: 'cover', display: 'block' }} />
                      <div style={{ padding: '.45rem .55rem', display: 'flex', justifyContent: 'space-between', gap: '.5rem', alignItems: 'center' }}>
                        <span style={{ color: '#475569', fontSize: '.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{photo.original_name || photo.caption || 'Foto'}</span>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => removeNoticePhoto(photo.id || photo.filename)}>Quitar</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#b45309', fontWeight: 700, fontSize: '.9rem' }}>
                  Falta agregar al menos una foto del problema.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Guardando...' : 'Registrar aviso'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) minmax(180px, 220px)', gap: '.75rem' }}>
          <div>
            <label className="form-label">{canCreateOnly ? 'Buscar en mis avisos' : 'Buscar aviso'}</label>
            <input className="form-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Código, equipo, OT origen o detalle" />
          </div>
          <div>
            <label className="form-label">Estado</label>
            <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="TODOS">Todos</option>
              <option value="Pendiente">Pendiente</option>
              <option value="Aceptado">Aceptado</option>
              <option value="Rechazado">Rechazado</option>
            </select>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(320px, .8fr)', gap: '1rem' }}>
        <div className="card" style={{ marginBottom: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '1180px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#0b5c8c', color: '#fff' }}>
                {[
                  'Aviso',
                  canCreateOnly ? 'Creado' : 'OT origen',
                  'Fecha aviso',
                  'Equipo',
                  'Categoria',
                  'Criticidad',
                  'Detalle',
                  'Estado',
                  'Registrado por',
                ].map((header) => (
                  <th key={header} style={{ border: '1px solid #2f6fb2', padding: '.55rem .5rem', textAlign: 'left', fontSize: '.82rem' }}>{header}</th>
                ))}
              </tr>
              <TableFilterRow columns={noticeTableColumns} rows={visibleItems} filters={noticeFilters} onChange={setNoticeFilter} dark />
            </thead>
            <tbody>
              {filteredNoticeRows.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  style={{ background: String(selected?.id) === String(item.id) ? '#dbeafe' : '#fff', cursor: 'pointer' }}
                >
                  <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem', fontWeight: 700 }}>{item.aviso_codigo}</td>
                  <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>
                    {canCreateOnly ? formatIsoTimestampDisplay(item.created_at) : (item.source_ot_numero || 'Manual')}
                  </td>
                  <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{getNoticeDateLabel(item)}</td>
                  <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{item.codigo} - {item.descripcion}</td>
                  <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{item.categoria || 'Aviso tecnico'}</td>
                  <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem', fontWeight: 700 }}>{item.criticidad_aviso || 'N.A.'}</td>
                  <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{item.detalle || item.sugerencia_texto || 'N.A.'}</td>
                  <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem', color: getNoticeStatusColor(item.status), fontWeight: 700 }}>{getNoticeStatusLabel(item.status)}</td>
                  <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{item.created_by_name || item.created_by || 'Sistema'}</td>
                </tr>
              ))}
              {!filteredNoticeRows.length && (
                <tr>
                  <td colSpan={9} style={{ border: '1px solid #d1d5db', padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
                    {canCreateOnly ? 'No tienes avisos que coincidan con los filtros aplicados.' : 'No hay avisos de mantenimiento que coincidan con los filtros aplicados.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <h3 className="card-title">Detalle del aviso</h3>
          {selected ? (
            <div style={{ display: 'grid', gap: '.8rem' }}>
              <div style={{ padding: '.9rem 1rem', borderRadius: '.9rem', background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '.82rem', color: '#6b7280', marginBottom: '.2rem' }}>Aviso</div>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>{selected.aviso_codigo}</div>
              </div>
              <div style={{ padding: '.9rem 1rem', borderRadius: '.9rem', background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '.82rem', color: '#6b7280', marginBottom: '.2rem' }}>Resumen</div>
                <div style={{ color: '#0f172a', lineHeight: 1.6 }}>{summarizeNoticeForDisplay(selected)}</div>
              </div>
              <div style={{ fontSize: '.92rem', color: '#374151', lineHeight: 1.7 }}>
                <div><strong>Equipo:</strong> {selected.codigo || 'N.A.'} - {selected.descripcion || 'N.A.'}</div>
                <div><strong>Área:</strong> {selected.area_trabajo || 'N.A.'}</div>
                <div><strong>OT origen:</strong> {selected.source_ot_numero || 'Aviso manual'}</div>
                <div><strong>Fecha aviso:</strong> {getNoticeDateLabel(selected)}</div>
                <div><strong>Hora evidencia:</strong> {formatTimeDisplay(selected.hora_evidencia, 'N.A.')}</div>
                <div><strong>Criticidad sugerida:</strong> {selected.criticidad_aviso || 'N.A.'}</div>
                <div><strong>Prioridad sugerida OT:</strong> {selected.prioridad_sugerida || 'N.A.'}</div>
                <div><strong>Tipo sugerido:</strong> {selected.tipo_mantto_sugerido || 'N.A.'}</div>
                <div><strong>Puede seguir operando:</strong> {selected.can_continue_working ? 'Si' : 'No'}</div>
                <div><strong>Deteccion:</strong> {selected.detection_method || 'N.A.'}</div>
                <div><strong>Impacto produccion:</strong> {selected.has_production_impact ? 'Si' : 'No'}</div>
                <div><strong>Riesgo seguridad:</strong> {selected.has_safety_risk ? 'Si' : 'No'}</div>
                <div><strong>Requiere parada:</strong> {selected.requires_stop ? 'Si' : 'No'}</div>
                <div><strong>Estado:</strong> <span style={{ color: getNoticeStatusColor(selected.status), fontWeight: 700 }}>{getNoticeStatusLabel(selected.status)}</span></div>
                <div><strong>Registrado por:</strong> {selected.created_by_name || selected.created_by || 'Sistema'}</div>
                <div><strong>Creado:</strong> {formatIsoTimestampDisplay(selected.created_at)}</div>
                <div><strong>Texto sugerido:</strong> {selected.sugerencia_texto || 'N.A.'}</div>
                {selected.resumen_criticidad && <div><strong>Lectura del cuestionario:</strong> {selected.resumen_criticidad}</div>}
                <div><strong>Detalle técnico:</strong> {selected.detalle || 'N.A.'}</div>
                {getNoticeProblemPhotos(selected).length > 0 && (
                  <div style={{ marginTop: '.7rem' }}>
                    <strong>Fotos del problema:</strong>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '.55rem', marginTop: '.45rem' }}>
                      {getNoticeProblemPhotos(selected).map((photo, index) => (
                        <a key={photo.id || photo.filename || index} href={photo.url} target="_blank" rel="noreferrer" style={{ display: 'block', border: '1px solid #d1d5db', borderRadius: '.55rem', overflow: 'hidden', background: '#fff' }}>
                          <img src={photo.url} alt={photo.caption || `Foto problema ${index + 1}`} style={{ width: '100%', height: '90px', objectFit: 'cover', display: 'block' }} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {selected.accepted_at && <div><strong>Aceptado:</strong> {formatIsoTimestampDisplay(selected.accepted_at)}</div>}
                {(selected.accepted_by_name || selected.accepted_by_role) && (
                  <div><strong>Aceptado por:</strong> {[selected.accepted_by_name, selected.accepted_by_role].filter(Boolean).join(' / ')}</div>
                )}
                {(selected.accepted_ot_number || selected.accepted_ot_id) && (
                  <div><strong>OT pendiente creada:</strong> {selected.accepted_ot_number || selected.accepted_ot_id}</div>
                )}
                {selected.rejected_at && <div><strong>Rechazado:</strong> {formatIsoTimestampDisplay(selected.rejected_at)}</div>}
                {(selected.rejected_by_name || selected.rejected_by_role) && (
                  <div><strong>Rechazado por:</strong> {[selected.rejected_by_name, selected.rejected_by_role].filter(Boolean).join(' / ')}</div>
                )}
                {selected.rejection_reason && <div><strong>Motivo rechazo:</strong> {selected.rejection_reason}</div>}
              </div>

              {canReview && (
                <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-primary" disabled={selected.status !== 'Pendiente'} onClick={acceptNotice}>
                    Aceptar aviso
                  </button>
                  <button type="button" className="btn btn-danger" disabled={selected.status !== 'Pendiente'} onClick={rejectNotice}>
                    Rechazar aviso
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: '#6b7280' }}>Selecciona un aviso para revisar su detalle.</div>
          )}
        </div>
      </div>
    </div>
  );
}
