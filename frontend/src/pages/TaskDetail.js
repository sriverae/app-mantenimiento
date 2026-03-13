import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getTask, updateTask, publishTask,
  addTaskMember, removeTaskMember,
  getWorkLogs, createWorkLog, deleteWorkLog,
  getTaskNotes, addTaskNote, deleteTaskNote,
  getTaskParts, addTaskPart, deleteTaskPart,
  getTaskPhotos, uploadTaskPhoto, deleteTaskPhoto,
  updateWorkLog, reopenTask,
  rescheduleTask, getReschedules,
  downloadTaskReport,
  getUsers,
} from '../services/api';
import { format } from 'date-fns';

const ROLE_HIERARCHY = { TECNICO:1, ENCARGADO:2, PLANNER:3, INGENIERO:4 };
const canManage = (role) => ROLE_HIERARCHY[role] >= ROLE_HIERARCHY['ENCARGADO'];

const STATUS_LABEL = { DRAFT:'Borrador', OPEN:'Abierta', IN_PROGRESS:'En Progreso', DONE:'Completada', CANCELLED:'Cancelada' };
const STATUS_COLOR = { DRAFT:'#6b7280', OPEN:'#2563eb', IN_PROGRESS:'#f59e0b', DONE:'#059669', CANCELLED:'#dc2626' };
const PRIORITY_COLOR = { ALTA:'#dc2626', MEDIA:'#f59e0b', BAJA:'#059669' };
const UNIDADES = ['und','kg','gl','lt','m','par','jgo','kit','caja','rollo','pliego','bolsa','balde','set'];

// Fecha sin desfase de zona horaria: "2026-03-11" → "11/03/2026"
const fmtDate = (s) => { if (!s) return '—'; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };
const calcH   = (s, e) => ((new Date(e) - new Date(s)) / 3600000).toFixed(1);

// ─── Inline alert ──────────────────────────────────────────────────────────────
function Alert({ type, msg }) {
  if (!msg) return null;
  const ok = type === 'ok';
  return (
    <div style={{ padding:'.875rem 1rem', borderRadius:'.5rem', fontWeight:600, fontSize:'.9rem', marginBottom:'1rem',
      background: ok ? '#d1fae5' : '#fef2f2', color: ok ? '#065f46' : '#dc2626',
      border: `1px solid ${ok ? '#6ee7b7' : '#fecaca'}` }}>
      {msg}
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────
function Section({ title, children, action }) {
  return (
    <div className="card" style={{ marginBottom:'1.25rem' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
        <h2 className="card-title" style={{ margin:0 }}>{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

export default function TaskDetail({ user }) {
  const { taskId } = useParams();
  const navigate   = useNavigate();

  const [task,     setTask]     = useState(null);
  const [workLogs, setWorkLogs] = useState([]);
  const [notes,    setNotes]    = useState([]);
  const [parts,    setParts]    = useState([]);
  const [users,    setUsers]    = useState([]);
  const [loading,  setLoading]  = useState(true);

  const [editing,   setEditing]  = useState(false);
  const [editForm,  setEditForm] = useState({});

  const [showWLForm, setShowWLForm] = useState(false);
  const [wlForm, setWlForm] = useState({ start_dt:'', end_dt:'', notes:'' });
  const [editingWL, setEditingWL] = useState(false); // true = editing existing, false = creating

  const [newNote, setNewNote]       = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [listening, setListening]   = useState(false);
  const recognitionRef              = React.useRef(null);

  const [newPart, setNewPart] = useState({ description:'', unit:'und', quantity:'' });
  const [savingPart, setSavingPart] = useState(false);

  const [photos, setPhotos]         = useState([]);
  const [photoCategory, setPhotoCategory] = useState('ANTES');
  const [photoCaption, setPhotoCaption]   = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [lightbox, setLightbox]     = useState(null);
  const [reschedules, setReschedules] = useState([]);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleForm, setRescheduleForm] = useState({ new_date:'', reason:'' });
  const [viewers, setViewers]   = useState([]);
  const [downloading, setDownloading] = useState(false);

  const [alert, setAlert] = useState(null);
  const showAlert = (type, msg) => { setAlert({ type, msg }); setTimeout(() => setAlert(null), 5000); };

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = async () => {
    try {
      setLoading(true);
      const [t, wls, ns, ps, ph, rs, us] = await Promise.all([
        getTask(taskId),
        getWorkLogs({ task_id: taskId }),
        getTaskNotes(taskId),
        getTaskParts(taskId),
        getTaskPhotos(taskId),
        getReschedules(taskId),
        canManage(user.role) ? getUsers() : Promise.resolve([]),
      ]);
      setTask(t); setWorkLogs(wls); setNotes(ns); setParts(ps); setPhotos(ph); setReschedules(rs); setUsers(us);
    } catch { showAlert('err', 'Error cargando tarea'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [taskId]);

  // ── WebSocket presence ───────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('access_token') || '';
    const wsBase = (window.location.protocol === 'https:' ? 'wss' : 'ws') + '://' + (process.env.REACT_APP_API_URL || 'localhost:8000').replace(/^https?:\/\//, '');
    const ws = new WebSocket(`${wsBase}/ws/tasks/${taskId}?token=${token}`);

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'presence') setViewers(data.viewers);
      } catch {}
    };

    // Keep-alive ping every 20s
    const ping = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send('ping'); }, 20000);

    return () => { clearInterval(ping); ws.close(); };
  }, [taskId]);



  // ── Edit ────────────────────────────────────────────────────────────────────
  const startEdit = () => {
    setEditForm({ description:task.description, area:task.area, equipo:task.equipo, priority:task.priority, day_date:task.day_date });
    setEditing(true);
  };
  const saveEdit = async () => {
    try { await updateTask(taskId, editForm); setEditing(false); await load(); showAlert('ok', 'Tarea actualizada'); }
    catch(e) { showAlert('err', e.response?.data?.detail || 'Error al guardar'); }
  };

  // ── Publish ─────────────────────────────────────────────────────────────────
  const handlePublish = async () => {
    if (!window.confirm('¿Publicar esta tarea? Será visible para todos los técnicos.')) return;
    try { await publishTask(taskId); await load(); showAlert('ok', '✅ Tarea publicada'); }
    catch(e) { showAlert('err', e.response?.data?.detail || 'Error'); }
  };

  // ── Done ────────────────────────────────────────────────────────────────────
  const handleDone = async () => {
    if (workLogs.length === 0) { showAlert('err', 'No se puede completar sin registros de trabajo. Agrega al menos un registro de horas.'); return; }
    if (!window.confirm('¿Marcar como completada?')) return;
    try { await updateTask(taskId, { status:'DONE' }); await load(); showAlert('ok', '✅ Tarea completada'); }
    catch(e) { showAlert('err', e.response?.data?.detail || 'Error'); }
  };

  // ── Members ─────────────────────────────────────────────────────────────────
  const handleJoin  = async () => { try { await addTaskMember(taskId, user.id); await load(); setShowWLForm(true); } catch(e) { showAlert('err', e.response?.data?.detail || 'Error'); } };
  const handleLeave = async () => {
    if (!window.confirm('¿Salir de esta tarea?\n\nSe eliminarán todos tus registros de horas, notas, repuestos y fotos en esta tarea.')) return;
    try { await removeTaskMember(taskId, user.id); await load(); } catch(e) { showAlert('err', e.response?.data?.detail || 'Error'); }
  };
  const handleAddMember = async (uid) => { try { await addTaskMember(taskId, parseInt(uid)); await load(); } catch(e) { showAlert('err', e.response?.data?.detail || 'Error'); } };
  const handleRemoveMember = async (uid) => { try { await removeTaskMember(taskId, uid); await load(); } catch(e) { showAlert('err', e.response?.data?.detail || 'Error'); } };

  // ── WorkLog ──────────────────────────────────────────────────────────────────
  const handleWLSubmit = async (e) => {
    e.preventDefault();
    const start = new Date(wlForm.start_dt), end = new Date(wlForm.end_dt);
    if (end <= start) { showAlert('err', 'La hora de fin debe ser posterior al inicio'); return; }
    try {
      const myLog = workLogs.find(l => l.telegram_id === user.id);
      if (myLog) {
        await updateWorkLog(myLog.id, { start_dt: start.toISOString(), end_dt: end.toISOString(), notes: wlForm.notes });
        showAlert('ok', 'Registro actualizado');
      } else {
        await createWorkLog({ task_id: parseInt(taskId), start_dt: start.toISOString(), end_dt: end.toISOString(), notes: wlForm.notes });
        showAlert('ok', 'Registro guardado');
      }
      setShowWLForm(false); setEditingWL(false); setWlForm({ start_dt:'', end_dt:'', notes:'' });
      await load();
    } catch(e) { showAlert('err', e.response?.data?.detail || 'Error'); }
  };
  const handleDeleteWL = async (id) => {
    if (!window.confirm('¿Eliminar este registro?')) return;
    try { await deleteWorkLog(id); await load(); } catch(e) { showAlert('err', e.response?.data?.detail || 'Error'); }
  };

  // ── Photos ───────────────────────────────────────────────────────────────────
  const handleUploadPhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', photoCategory);
      fd.append('caption', photoCaption);
      await uploadTaskPhoto(taskId, fd);
      setPhotoCaption('');
      e.target.value = '';
      await load();
      showAlert('ok', 'Foto subida correctamente');
    } catch(err) { showAlert('err', err.response?.data?.detail || 'Error al subir foto'); }
    finally { setUploadingPhoto(false); }
  };
  const handleDeletePhoto = async (photoId) => {
    if (!window.confirm('¿Eliminar esta foto?')) return;
    try { await deleteTaskPhoto(taskId, photoId); await load(); }
    catch(e) { showAlert('err', e.response?.data?.detail || 'Error'); }
  };

  // ── Notes ────────────────────────────────────────────────────────────────────
  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setSavingNote(true);
    try { await addTaskNote(taskId, newNote.trim()); setNewNote(''); await load(); }
    catch(e) { showAlert('err', e.response?.data?.detail || 'Error'); }
    finally { setSavingNote(false); }
  };

  const toggleVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.'); return; }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const rec = new SR();
    rec.lang = 'es-PE';
    rec.continuous = true;
    rec.interimResults = false;

    rec.onresult = (e) => {
      const transcript = Array.from(e.results)
        .slice(e.resultIndex)
        .map(r => r[0].transcript)
        .join(' ');
      setNewNote(prev => (prev ? prev + ' ' + transcript : transcript).trimStart());
    };

    rec.onerror = (e) => {
      if (e.error !== 'aborted') showAlert('err', 'Error de micrófono: ' + e.error);
      setListening(false);
    };

    rec.onend = () => setListening(false);

    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  };

  const handleDeleteNote = async (noteId) => {
    if (!window.confirm('¿Eliminar esta nota?')) return;
    try { await deleteTaskNote(taskId, noteId); await load(); } catch(e) { showAlert('err', e.response?.data?.detail || 'Error'); }
  };

  // ── Parts ─────────────────────────────────────────────────────────────────────
  const handleAddPart = async (e) => {
    e.preventDefault();
    if (!newPart.description.trim() || !newPart.quantity) { showAlert('err', 'Completa descripción y cantidad'); return; }
    setSavingPart(true);
    try {
      await addTaskPart(taskId, { description: newPart.description.trim(), unit: newPart.unit, quantity: parseFloat(newPart.quantity) });
      setNewPart({ description:'', unit:'und', quantity:'' });
      await load();
    } catch(e) { showAlert('err', e.response?.data?.detail || 'Error'); }
    finally { setSavingPart(false); }
  };
  const handleDeletePart = async (partId) => {
    if (!window.confirm('¿Eliminar este repuesto?')) return;
    try { await deleteTaskPart(taskId, partId); await load(); } catch(e) { showAlert('err', e.response?.data?.detail || 'Error'); }
  };

  const handleDownloadReport = async () => {
    setDownloading(true);
    try { await downloadTaskReport(taskId); }
    catch(e) { showAlert('err', 'Error al generar el informe PDF'); }
    finally { setDownloading(false); }
  };

  const handleReschedule = async (e) => {
    e.preventDefault();
    if (!rescheduleForm.new_date) { showAlert('err', 'Selecciona una nueva fecha'); return; }
    try {
      await rescheduleTask(taskId, rescheduleForm);
      setShowReschedule(false);
      setRescheduleForm({ new_date:'', reason:'' });
      await load();
      showAlert('ok', '📅 Tarea reprogramada');
    } catch(err) { showAlert('err', err.response?.data?.detail || 'Error'); }
  };

  const handleReopen = async () => {
    if (!window.confirm('¿Reabrir esta tarea? Los técnicos podrán volver a modificar sus registros.')) return;
    try { await reopenTask(taskId); await load(); showAlert('ok', '🔓 Tarea reabierta'); }
    catch(e) { showAlert('err', e.response?.data?.detail || 'Error'); }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!task)   return <div className="card"><p>Tarea no encontrada</p><button className="btn btn-secondary" onClick={() => navigate('/tasks')}>← Volver</button></div>;

  const isAssigned      = task.members.includes(user.id);
  const isDraft        = task.status === 'DRAFT';
  const isDone         = task.status === 'DONE';
  const manager        = canManage(user.role);
  const canContribute  = isAssigned || manager;
  const assignedUsers  = users.filter(u => task.members.includes(u.id));
  const availableUsers = users.filter(u => !task.members.includes(u.id) && u.account_status === 'ACTIVE');
  const totalHours     = workLogs.reduce((s, l) => s + (new Date(l.end_dt) - new Date(l.start_dt)) / 3600000, 0);

  return (
    <div style={{ maxWidth:'860px', margin:'0 auto' }}>
      <button onClick={() => navigate('/tasks')} className="btn btn-secondary" style={{ marginBottom:'1.5rem' }}>← Volver a Tareas</button>

      <Alert type={alert?.type} msg={alert?.msg} />


      {/* ── Presence: who else is here ── */}
      {viewers.filter(v => v.id !== user.id).length > 0 && (
        <div style={{ background:'#fefce8', border:'1px solid #fde68a', borderRadius:'.5rem', padding:'.6rem 1rem', marginBottom:'1rem', display:'flex', alignItems:'center', gap:'.75rem', flexWrap:'wrap' }}>
          <span style={{ fontSize:'1rem' }}>👥</span>
          <span style={{ fontSize:'.875rem', color:'#92400e', fontWeight:600 }}>
            También {viewers.filter(v => v.id !== user.id).length === 1 ? 'está' : 'están'} viendo esta tarea:
          </span>
          <div style={{ display:'flex', gap:'.4rem', flexWrap:'wrap' }}>
            {viewers.filter(v => v.id !== user.id).map(v => (
              <span key={v.id} style={{ background:'#fbbf24', color:'#78350f', padding:'.2rem .65rem', borderRadius:'9999px', fontSize:'.8rem', fontWeight:700 }}>
                {v.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* DRAFT banner */}
      {isDraft && (
        <div style={{ background:'#fef3c7', border:'2px solid #fcd34d', borderRadius:'.75rem', padding:'1rem 1.25rem', marginBottom:'1.25rem', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'1rem' }}>
          <div>
            <div style={{ fontWeight:700, color:'#92400e' }}>📋 Borrador — no visible para técnicos</div>
            <div style={{ fontSize:'.85rem', color:'#b45309', marginTop:'.2rem' }}>Solo visible para ENCARGADO, PLANNER e INGENIERO. Publícala cuando esté lista.</div>
          </div>
          {manager && <button onClick={handlePublish} style={{ padding:'.75rem 1.5rem', background:'linear-gradient(135deg,#059669,#047857)', color:'#fff', border:'none', borderRadius:'.5rem', fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>🚀 Publicar tarea</button>}
        </div>
      )}


      {/* Notice for non-assigned tecnico */}
      {!isDone && !isDraft && !canContribute && (
        <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'.5rem', padding:'.75rem 1rem', marginBottom:'1.25rem', fontSize:'.875rem', color:'#1d4ed8' }}>
          👁️ Solo puedes ver esta tarea. Para agregar registros, notas, repuestos o fotos debes estar asignado a ella.
        </div>
      )}


      {/* DONE banner */}
      {isDone && (
        <div style={{ background:'#f0fdf4', border:'2px solid #6ee7b7', borderRadius:'.75rem', padding:'1rem 1.25rem', marginBottom:'1.25rem', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'1rem' }}>
          <div>
            <div style={{ fontWeight:700, color:'#065f46' }}>✅ Tarea completada — modo solo lectura</div>
            <div style={{ fontSize:'.85rem', color:'#047857', marginTop:'.2rem' }}>No se pueden modificar registros, notas, repuestos ni fotos.</div>
          </div>
          <div style={{ display:'flex', gap:'.75rem', flexWrap:'wrap' }}>
            <button onClick={handleDownloadReport} disabled={downloading}
              style={{ padding:'.75rem 1.5rem', background:'linear-gradient(135deg,#2563eb,#1d4ed8)', color:'#fff', border:'none', borderRadius:'.5rem', fontWeight:700, cursor: downloading ? 'not-allowed' : 'pointer', whiteSpace:'nowrap', opacity: downloading ? .7 : 1 }}>
              {downloading ? '⏳ Generando...' : '📄 Descargar Informe PDF'}
            </button>
            {manager && (
              <button onClick={handleReopen} style={{ padding:'.75rem 1.5rem', background:'linear-gradient(135deg,#f59e0b,#d97706)', color:'#fff', border:'none', borderRadius:'.5rem', fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                🔓 Reabrir tarea
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Task info card ── */}
      <div className="card" style={{ marginBottom:'1.25rem' }}>
        {editing ? (
          <div>
            <h2 style={{ fontWeight:700, fontSize:'1.2rem', marginBottom:'1.5rem' }}>✏️ Editando tarea</h2>
            <div className="form-group">
              <label className="form-label">Descripción *</label>
              <textarea className="form-textarea" rows={2} value={editForm.description} onChange={e => setEditForm({...editForm, description:e.target.value})} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
              <div className="form-group"><label className="form-label">Área</label><input className="form-input" value={editForm.area} onChange={e => setEditForm({...editForm, area:e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Equipo</label><input className="form-input" value={editForm.equipo} onChange={e => setEditForm({...editForm, equipo:e.target.value})} /></div>
              <div className="form-group">
                <label className="form-label">Prioridad</label>
                <select className="form-select" value={editForm.priority} onChange={e => setEditForm({...editForm, priority:e.target.value})}>
                  {['ALTA','MEDIA','BAJA'].map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Fecha</label>
                <input className="form-input" type="date" value={editForm.day_date} onChange={e => setEditForm({...editForm, day_date:e.target.value})} />
              </div>
            </div>
            <div style={{ display:'flex', gap:'.75rem' }}>
              <button className="btn btn-primary" onClick={saveEdit}>💾 Guardar cambios</button>
              <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancelar</button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1.5rem', flexWrap:'wrap', gap:'1rem' }}>
              <div>
                <h1 style={{ fontSize:'1.5rem', fontWeight:700, marginBottom:'.3rem' }}>{task.description}</h1>
                <span style={{ fontSize:'.85rem', color:'#6b7280' }}>Tarea #{task.id}</span>
              </div>
              <div style={{ display:'flex', gap:'.5rem', flexWrap:'wrap', alignItems:'center' }}>
                <span style={{ background:PRIORITY_COLOR[task.priority]+'18', color:PRIORITY_COLOR[task.priority], padding:'.3rem .8rem', borderRadius:'9999px', fontSize:'.78rem', fontWeight:700 }}>{task.priority}</span>
                <span style={{ background:STATUS_COLOR[task.status]+'18', color:STATUS_COLOR[task.status], padding:'.3rem .8rem', borderRadius:'9999px', fontSize:'.78rem', fontWeight:700 }}>{STATUS_LABEL[task.status]}</span>
                {manager && !isDone && <button className="btn btn-sm btn-secondary" onClick={startEdit}>✏️ Editar</button>}
                {manager && !isDone && <button className="btn btn-sm" style={{ background:'#eff6ff', color:'#2563eb', border:'1px solid #bfdbfe', borderRadius:'.4rem', padding:'.3rem .75rem', cursor:'pointer', fontWeight:600, fontSize:'.82rem' }} onClick={() => { setRescheduleForm({ new_date: task.day_date, reason:'' }); setShowReschedule(v => !v); }}>📅 Reprogramar</button>}
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:'1rem', marginBottom:'1.5rem' }}>
              {[['📍 Área', task.area],['🔧 Equipo', task.equipo],['📅 Fecha', fmtDate(task.day_date)],['⏱️ Horas registradas', `${totalHours.toFixed(1)}h`]].map(([lbl,val]) => (
                <div key={lbl} style={{ background:'#f9fafb', borderRadius:'.5rem', padding:'.75rem 1rem' }}>
                  <div style={{ fontSize:'.78rem', color:'#9ca3af', marginBottom:'.2rem' }}>{lbl}</div>
                  <div style={{ fontWeight:600 }}>{val || '—'}</div>
                </div>
              ))}
            </div>

            <div style={{ display:'flex', gap:'.75rem', flexWrap:'wrap' }}>
              {!isDraft && !isDone && (
                isAssigned ? (
                  <>
                    <button className="btn btn-secondary" onClick={handleLeave}>Salir de la Tarea</button>
                    {(() => {
                      const myLog = workLogs.find(l => l.telegram_id === user.id);
                      return (
                        <button className="btn btn-primary" onClick={() => {
                          if (!showWLForm && myLog) {
                            // Pre-fill form with existing values
                            const fmt = (d) => { const dt = new Date(d); const pad = n => String(n).padStart(2,'0'); return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`; };
                            setWlForm({ start_dt: fmt(myLog.start_dt), end_dt: fmt(myLog.end_dt), notes: myLog.notes || '' });
                            setEditingWL(true);
                          } else if (!showWLForm) {
                            setEditingWL(false);
                          }
                          setShowWLForm(v => !v);
                        }}>
                          {showWLForm ? 'Cancelar' : myLog ? '✏️ Editar mi registro' : '⏱️ Registrar Horas'}
                        </button>
                      );
                    })()}
                  </>
                ) : (
                  <button className="btn btn-success" onClick={handleJoin}>Unirme a esta Tarea</button>
                )
              )}
              {manager && !isDone && !isDraft && (
                <button className="btn btn-success" onClick={handleDone}>✓ Marcar como Completada</button>
              )}
            </div>
            {manager && !isDone && !isDraft && workLogs.length === 0 && (
              <div style={{ marginTop:'1rem', fontSize:'.82rem', color:'#92400e', background:'#fffbeb', border:'1px solid #fcd34d', borderRadius:'.4rem', padding:'.6rem .9rem' }}>
                ⚠️ Para marcar como completada necesitas al menos un registro de horas
              </div>
            )}
          </div>
        )}
      </div>


      {/* ── Reschedule form ── */}
      {showReschedule && (
        <div className="card" style={{ marginBottom:'1.25rem', border:'2px solid #bfdbfe' }}>
          <h2 className="card-title">📅 Reprogramar tarea</h2>
          <div style={{ background:'#fef3c7', border:'1px solid #fcd34d', borderRadius:'.5rem', padding:'.6rem .9rem', marginBottom:'1rem', fontSize:'.85rem', color:'#92400e' }}>
            ⚠️ Al reprogramar se eliminarán todos los registros de horas de los técnicos y la tarea volverá a estado Abierta.
          </div>
          <form onSubmit={handleReschedule}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
              <div className="form-group">
                <label className="form-label">Fecha actual</label>
                <input className="form-input" value={fmtDate(task.day_date)} disabled style={{ background:'#f3f4f6', color:'#6b7280' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Nueva fecha *</label>
                <input className="form-input" type="date" value={rescheduleForm.new_date} onChange={e => setRescheduleForm({...rescheduleForm, new_date: e.target.value})} required />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Motivo de reprogramación</label>
              <input className="form-input" placeholder="Ej: Falta de repuestos, área no disponible..." value={rescheduleForm.reason} onChange={e => setRescheduleForm({...rescheduleForm, reason: e.target.value})} />
            </div>
            <div style={{ display:'flex', gap:'.75rem' }}>
              <button type="submit" className="btn btn-primary">💾 Confirmar reprogramación</button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowReschedule(false)}>Cancelar</button>
            </div>
          </form>
          {reschedules.length > 0 && (
            <div style={{ marginTop:'1.25rem', borderTop:'1px solid #e5e7eb', paddingTop:'1rem' }}>
              <div style={{ fontSize:'.82rem', fontWeight:700, color:'#6b7280', marginBottom:'.5rem' }}>HISTORIAL DE REPROGRAMACIONES</div>
              {reschedules.map(r => (
                <div key={r.id} style={{ fontSize:'.82rem', padding:'.4rem 0', borderBottom:'1px solid #f3f4f6', display:'flex', gap:'1rem', flexWrap:'wrap' }}>
                  <span style={{ color:'#dc2626', fontWeight:600 }}>{fmtDate(r.old_date)}</span>
                  <span style={{ color:'#9ca3af' }}>→</span>
                  <span style={{ color:'#059669', fontWeight:600 }}>{fmtDate(r.new_date)}</span>
                  <span style={{ color:'#6b7280' }}>por {r.user_name}</span>
                  {r.reason && <span style={{ color:'#374151', fontStyle:'italic' }}>"{r.reason}"</span>}
                  <span style={{ color:'#9ca3af', marginLeft:'auto' }}>{format(new Date(r.created_at), 'dd/MM/yyyy HH:mm')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── WorkLog form ── */}
      {showWLForm && (
        <div className="card" style={{ marginBottom:'1.25rem', border:'2px solid #2563eb22' }}>
          <h2 className="card-title">{editingWL ? '✏️ Editar Registro de Horas' : '⏱️ Registrar Horas de Trabajo'}</h2>
          <form onSubmit={handleWLSubmit}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
              <div className="form-group"><label className="form-label">Hora de Inicio *</label><input type="datetime-local" className="form-input" value={wlForm.start_dt} onChange={e => setWlForm({...wlForm, start_dt:e.target.value})} required /></div>
              <div className="form-group"><label className="form-label">Hora de Fin *</label><input type="datetime-local" className="form-input" value={wlForm.end_dt} onChange={e => setWlForm({...wlForm, end_dt:e.target.value})} required /></div>
            </div>
            <div className="form-group">
              <label className="form-label">Resumen del período (opcional)</label>
              <textarea className="form-textarea" rows={2} value={wlForm.notes} onChange={e => setWlForm({...wlForm, notes:e.target.value})} placeholder="Ej: Desmontaje de rodamiento, ajuste de pernos..." />
            </div>
            <button type="submit" className="btn btn-primary">💾 Guardar Registro</button>
          </form>
        </div>
      )}

      {/* ── Assigned members (managers) ── */}
      {manager && !isDraft && (
        <Section title={`👥 Técnicos asignados (${task.members.length})`}>
          {assignedUsers.length > 0 ? (
            <div style={{ display:'grid', gap:'.5rem', marginBottom:'1rem' }}>
              {assignedUsers.map(u => (
                <div key={u.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'#f9fafb', borderRadius:'.5rem', padding:'.6rem 1rem' }}>
                  <span style={{ fontWeight:600 }}>{u.full_name} <span style={{ color:'#9ca3af', fontWeight:400, fontSize:'.82rem' }}>@{u.username}</span></span>
                  <button className="btn btn-sm btn-danger" onClick={() => handleRemoveMember(u.id)}>Quitar</button>
                </div>
              ))}
            </div>
          ) : <p style={{ color:'#9ca3af', fontSize:'.875rem', marginBottom:'1rem' }}>Sin técnicos asignados</p>}
          {availableUsers.length > 0 && (
            <div style={{ display:'flex', gap:'.5rem', flexWrap:'wrap' }}>
              <select className="form-select" style={{ flex:1, minWidth:'200px' }} id="add-member-select" defaultValue="">
                <option value="" disabled>Agregar técnico…</option>
                {availableUsers.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
              </select>
              <button className="btn btn-primary" onClick={() => { const s = document.getElementById('add-member-select'); if (s.value) { handleAddMember(s.value); s.value=''; } }}>Agregar</button>
            </div>
          )}
        </Section>
      )}

      {/* ── Fotos ANTES / DESPUÉS ── */}
      <Section title="📸 Fotos de la tarea" action={<span style={{ fontSize:'.78rem', color:'#9ca3af' }}>Visible para todos</span>}>

        {lightbox && (
          <div onClick={() => setLightbox(null)}
            style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.88)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', cursor:'zoom-out', padding:'1rem' }}>
            <img src={lightbox} alt="foto" style={{ maxWidth:'95vw', maxHeight:'90vh', borderRadius:'.5rem', boxShadow:'0 0 40px rgba(0,0,0,.6)' }} onClick={e => e.stopPropagation()} />
            <button onClick={() => setLightbox(null)} style={{ position:'absolute', top:'1rem', right:'1.5rem', background:'none', border:'none', color:'#fff', fontSize:'2rem', cursor:'pointer', fontWeight:700 }}>×</button>
          </div>
        )}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.5rem' }}>
          {[
            { cat:'ANTES',   label:'Antes',   icon:'🔴', color:'#dc2626', bg:'#fef2f2', border:'#fecaca' },
            { cat:'DESPUÉS', label:'Después', icon:'🟢', color:'#059669', bg:'#f0fdf4', border:'#6ee7b7' },
          ].map(({ cat, label, icon, color, bg, border }) => {
            const photo = photos.find(p => p.category === cat);
            return (
              <div key={cat} style={{ border:`2px solid ${photo ? border : '#e5e7eb'}`, borderRadius:'.75rem', overflow:'hidden', background: photo ? bg : '#f9fafb' }}>
                <div style={{ padding:'.6rem 1rem', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:`1px solid ${photo ? border : '#e5e7eb'}` }}>
                  <span style={{ fontWeight:700, color, fontSize:'.9rem' }}>{icon} {label}</span>
                  {photo && (photo.uploaded_by === user.id || manager) && (
                    <button onClick={() => handleDeletePhoto(photo.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#dc2626', fontSize:'.82rem', fontWeight:600 }}>🗑️ Eliminar</button>
                  )}
                </div>
                {photo ? (
                  <div>
                    <img src={photo.url} alt={label} onClick={() => setLightbox(photo.url)}
                      style={{ width:'100%', aspectRatio:'4/3', objectFit:'cover', cursor:'zoom-in', display:'block' }} />
                    {photo.caption && <div style={{ padding:'.5rem .75rem', fontSize:'.82rem', color:'#374151' }}>{photo.caption}</div>}
                    <div style={{ padding:'.25rem .75rem .5rem', fontSize:'.75rem', color:'#9ca3af' }}>Subido por {photo.user_name}</div>
                    {!isDone && canContribute && (
                      <div style={{ padding:'.5rem .75rem', borderTop:`1px solid ${border}` }}>
                        <label style={{ display:'inline-flex', alignItems:'center', gap:'.4rem', padding:'.4rem .9rem', background:'#fff', border:`1.5px solid ${color}`, color, borderRadius:'.4rem', cursor: uploadingPhoto ? 'not-allowed' : 'pointer', fontWeight:600, fontSize:'.82rem', opacity: uploadingPhoto ? .6 : 1 }}>
                          🔄 Reemplazar
                          <input type="file" accept="image/*" style={{ display:'none' }} disabled={uploadingPhoto} onChange={e => { setPhotoCategory(cat); handleUploadPhoto(e); }} />
                        </label>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ padding:'2.5rem 1rem', textAlign:'center' }}>
                    <div style={{ fontSize:'2.5rem', marginBottom:'.5rem', opacity:.25 }}>📷</div>
                    <p style={{ color:'#9ca3af', fontSize:'.85rem', marginBottom:'1rem' }}>Sin foto {label.toLowerCase()}</p>
                    {!isDone && canContribute && (
                      <label style={{ display:'inline-flex', alignItems:'center', gap:'.4rem', padding:'.65rem 1.3rem', background:color, color:'#fff', borderRadius:'.5rem', cursor: uploadingPhoto ? 'not-allowed' : 'pointer', fontWeight:600, fontSize:'.875rem', opacity: uploadingPhoto ? .6 : 1 }}>
                        {uploadingPhoto && photoCategory === cat ? '⏳ Subiendo...' : `📷 Subir foto`}
                        <input type="file" accept="image/*" style={{ display:'none' }} disabled={uploadingPhoto} onChange={e => { setPhotoCategory(cat); handleUploadPhoto(e); }} />
                      </label>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p style={{ fontSize:'.75rem', color:'#9ca3af', marginTop:'.75rem' }}>JPG, PNG, WEBP · Máx. 10 MB · Al subir una nueva foto reemplaza la anterior</p>
      </Section>

      {/* ── Notas colaborativas ── */}
      <Section
        title={`📝 Descripción del trabajo realizado (${notes.length})`}
        action={<span style={{ fontSize:'.78rem', color:'#9ca3af' }}>Visible para todos</span>}>

        {notes.length > 0 ? (
          <div style={{ display:'grid', gap:'.6rem', marginBottom:'1.25rem' }}>
            {notes.map(n => (
              <div key={n.id} style={{ background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:'.5rem', padding:'.75rem 1rem' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'1rem' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', gap:'.5rem', alignItems:'center', marginBottom:'.35rem' }}>
                      <span style={{ fontWeight:700, fontSize:'.85rem' }}>{n.user_name}</span>
                      <span style={{ fontSize:'.75rem', color:'#9ca3af' }}>{format(new Date(n.created_at), 'dd/MM/yyyy HH:mm')}</span>
                    </div>
                    <p style={{ fontSize:'.9rem', lineHeight:1.5, whiteSpace:'pre-wrap', margin:0 }}>{n.content}</p>
                  </div>
                  {(n.user_id === user.id || manager) && (
                    <button onClick={() => handleDeleteNote(n.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#dc2626', fontSize:'1rem', flexShrink:0, padding:'.2rem' }}>🗑️</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color:'#9ca3af', fontSize:'.875rem', marginBottom:'1.25rem' }}>No hay descripciones aún.{canContribute ? ' Sé el primero en documentar el trabajo realizado.' : ''}</p>
        )}

        {!isDone && canContribute && (
          <form onSubmit={handleAddNote}>
            <div style={{ position:'relative' }}>
              <textarea
                className="form-textarea"
                style={{ width:'100%', minHeight:'70px', resize:'vertical', paddingRight:'3rem', boxSizing:'border-box' }}
                placeholder="Describe el trabajo realizado, observaciones, hallazgos… (o usa el micrófono 🎤)"
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                rows={2}
              />
              {/* Mic button inside textarea */}
              <button
                type="button"
                onClick={toggleVoice}
                title={listening ? 'Detener grabación' : 'Dictar por voz'}
                style={{
                  position:'absolute', right:'.5rem', bottom:'.5rem',
                  width:'2rem', height:'2rem', borderRadius:'50%', border:'none',
                  cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:'1rem', transition:'all .2s',
                  background: listening ? '#ef4444' : '#e0e7ff',
                  color:       listening ? '#fff'     : '#4f46e5',
                  boxShadow:   listening ? '0 0 0 4px #fecaca' : 'none',
                  animation:   listening ? 'pulse 1.2s infinite' : 'none',
                }}>
                {listening ? '⏹' : '🎤'}
              </button>
            </div>
            {listening && (
              <div style={{ fontSize:'.78rem', color:'#ef4444', marginTop:'.3rem', display:'flex', alignItems:'center', gap:'.35rem' }}>
                <span style={{ width:'.5rem', height:'.5rem', borderRadius:'50%', background:'#ef4444', display:'inline-block', animation:'pulse 1s infinite' }} />
                Escuchando… habla con claridad. Haz clic en ⏹ para detener.
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:'.5rem' }}>
              <button type="submit" className="btn btn-primary" disabled={savingNote || !newNote.trim()}>
                {savingNote ? '...' : 'Publicar'}
              </button>
            </div>
          </form>
        )}
      </Section>

      {/* ── Repuestos utilizados ── */}
      <Section
        title={`🔩 Repuestos utilizados (${parts.length})`}
        action={<span style={{ fontSize:'.78rem', color:'#9ca3af' }}>Visible para todos</span>}>

        {parts.length > 0 && (
          <div style={{ border:'1px solid #e5e7eb', borderRadius:'.5rem', overflow:'hidden', marginBottom:'1.25rem' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'.875rem' }}>
              <thead>
                <tr style={{ background:'#f3f4f6' }}>
                  <th style={{ padding:'.5rem .75rem', textAlign:'left', fontWeight:600 }}>Material / Descripción</th>
                  <th style={{ padding:'.5rem .5rem', textAlign:'center', fontWeight:600, width:'70px' }}>Und.</th>
                  <th style={{ padding:'.5rem .5rem', textAlign:'center', fontWeight:600, width:'80px' }}>Cantidad</th>
                  <th style={{ padding:'.5rem .5rem', textAlign:'left', fontWeight:600, fontSize:'.78rem', color:'#9ca3af' }}>Agregado por</th>
                  <th style={{ width:'40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {parts.map(p => (
                  <tr key={p.id} style={{ borderTop:'1px solid #e5e7eb' }}>
                    <td style={{ padding:'.5rem .75rem', fontWeight:500 }}>{p.description}</td>
                    <td style={{ padding:'.5rem .5rem', textAlign:'center', color:'#6b7280' }}>{p.unit}</td>
                    <td style={{ padding:'.5rem .5rem', textAlign:'center', fontWeight:700, color:'#2563eb' }}>{p.quantity % 1 === 0 ? p.quantity : p.quantity.toFixed(2)}</td>
                    <td style={{ padding:'.5rem .5rem', fontSize:'.78rem', color:'#9ca3af' }}>{p.user_name}</td>
                    <td style={{ padding:'.25rem .5rem', textAlign:'center' }}>
                      {(p.added_by === user.id || manager) && (
                        <button onClick={() => handleDeletePart(p.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#dc2626', fontSize:'1rem', padding:'.2rem' }}>🗑️</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isDone && canContribute && (
          <form onSubmit={handleAddPart}>
            <div style={{ display:'flex', gap:'.5rem', flexWrap:'wrap', alignItems:'flex-end' }}>
              <div style={{ flex:'2 1 200px' }}>
                <label style={{ fontSize:'.78rem', fontWeight:600, color:'#374151', display:'block', marginBottom:'.3rem' }}>Descripción *</label>
                <input className="form-input" placeholder="Ej: Perno M12 x 40mm galvanizado" value={newPart.description} onChange={e => setNewPart({...newPart, description:e.target.value})} required />
              </div>
              <div style={{ flex:'0 1 100px' }}>
                <label style={{ fontSize:'.78rem', fontWeight:600, color:'#374151', display:'block', marginBottom:'.3rem' }}>Unidad</label>
                <select className="form-select" value={newPart.unit} onChange={e => setNewPart({...newPart, unit:e.target.value})}>
                  {UNIDADES.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div style={{ flex:'0 1 90px' }}>
                <label style={{ fontSize:'.78rem', fontWeight:600, color:'#374151', display:'block', marginBottom:'.3rem' }}>Cantidad *</label>
                <input className="form-input" type="number" min="0.01" step="any" placeholder="0" value={newPart.quantity} onChange={e => setNewPart({...newPart, quantity:e.target.value})} required />
              </div>
              <button type="submit" className="btn btn-primary" disabled={savingPart} style={{ flexShrink:0 }}>
                {savingPart ? '...' : '+ Agregar'}
              </button>
            </div>
          </form>
        )}

        {parts.length === 0 && isDone && <p style={{ color:'#9ca3af', fontSize:'.875rem' }}>Sin repuestos registrados</p>}
      </Section>

      {/* ── Registros de trabajo ── */}
      <Section title={`⏱️ Registros de trabajo (${workLogs.length})`}
        action={totalHours > 0 ? <span style={{ fontWeight:700, color:'#2563eb' }}>Total: {totalHours.toFixed(1)}h</span> : null}>

        {workLogs.length === 0 ? (
          <div style={{ textAlign:'center', padding:'2rem', color:'#9ca3af' }}>
            <div style={{ fontSize:'2rem', marginBottom:'.5rem' }}>📋</div>
            <p>No hay registros de trabajo</p>
          </div>
        ) : (
          <div style={{ display:'grid', gap:'.75rem' }}>
            {workLogs.map(log => (
              <div key={log.id} style={{ border:'1px solid #e5e7eb', borderRadius:'.5rem', padding:'1rem', background:'#f9fafb' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div>
                    <strong>{log.user_name}</strong>
                    <div style={{ fontSize:'.82rem', color:'#6b7280' }}>
                      {format(new Date(log.start_dt), 'dd/MM/yyyy HH:mm')} → {format(new Date(log.end_dt), 'HH:mm')}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:'.5rem', alignItems:'center' }}>
                    <span style={{ fontWeight:700, color:'#2563eb' }}>{calcH(log.start_dt, log.end_dt)}h</span>
                    {(log.telegram_id === user.id || manager) && (
                      <button className="btn btn-sm btn-danger" onClick={() => handleDeleteWL(log.id)}>🗑️</button>
                    )}
                  </div>
                </div>
                {log.notes && <p style={{ fontSize:'.875rem', marginTop:'.5rem', color:'#374151' }}>{log.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
