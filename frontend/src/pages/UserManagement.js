import React, { useState, useEffect, useCallback } from 'react';
import { getUsers, getPendingUsers, createUser, updateUser, approveUser, resetUserPassword } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import { ROLE_HIERARCHY } from '../utils/roleAccess';
import {
  firstValidationError,
  validateRequiredFields,
  validateTextFields,
} from '../utils/formValidation';

const ROLE_COLORS = { INGENIERO:'#7c3aed', PLANNER:'#2563eb', ENCARGADO:'#0891b2', TECNICO:'#059669', SUPERVISOR:'#ea580c', OPERADOR:'#64748b' };
const ROLE_LABELS = { INGENIERO:'Ingeniero', PLANNER:'Planner', ENCARGADO:'Encargado', TECNICO:'Técnico' };
const ROLE_ICONS  = { INGENIERO:'👷', PLANNER:'📋', ENCARGADO:'🔑', TECNICO:'🔧' };
const ROLES       = ['INGENIERO','PLANNER','ENCARGADO','TECNICO'];
const AVAILABLE_ROLES = [...ROLES, 'SUPERVISOR', 'OPERADOR'];
const USER_ROLE_TO_RRHH_CARGO = {
  TECNICO: 'Tecnico',
  OPERADOR: 'Operador',
  SUPERVISOR: 'Supervisor',
  ENCARGADO: 'Encargado',
};

const normalizePlainText = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const syncRrhhRoleFromUser = async (userRecord) => {
  if (!userRecord?.id) return false;

  const rrhhData = await loadSharedDocument(SHARED_DOCUMENT_KEYS.rrhh, []);
  if (!Array.isArray(rrhhData) || !rrhhData.length) return false;

  const normalizedUsername = normalizePlainText(userRecord.username);
  const normalizedFullName = normalizePlainText(userRecord.full_name);
  const cargoFromRole = USER_ROLE_TO_RRHH_CARGO[userRecord.role];
  let synced = false;

  const nextRrhh = rrhhData.map((person) => {
    const linkedById = person.usuario_id && String(person.usuario_id) === String(userRecord.id);
    const linkedByUsername = person.usuario_acceso && normalizePlainText(person.usuario_acceso) === normalizedUsername;
    const unlinkedExactName = !person.usuario_id
      && !person.usuario_acceso
      && normalizedFullName
      && normalizePlainText(person.nombres_apellidos) === normalizedFullName;

    if (!linkedById && !linkedByUsername && !unlinkedExactName) return person;

    synced = true;
    return {
      ...person,
      nombres_apellidos: userRecord.full_name || person.nombres_apellidos,
      cargo: cargoFromRole || person.cargo,
      usuario_id: userRecord.id,
      usuario_acceso: userRecord.username,
      usuario_role: userRecord.role,
      usuario_sync_at: new Date().toISOString(),
      sincronizar_cuenta: true,
    };
  });

  if (synced) {
    await saveSharedDocument(SHARED_DOCUMENT_KEYS.rrhh, nextRrhh);
  }

  return synced;
};

const getRoleLabel = (role) => (
  {
    SUPERVISOR: 'Supervisor',
    OPERADOR: 'Operador',
  }[role] || ROLE_LABELS[role] || role
);

const getRoleIcon = (role) => (
  {
    SUPERVISOR: '🛡️',
    OPERADOR: '🧾',
  }[role] || ROLE_ICONS[role] || '👤'
);

// ── Helpers ───────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'1rem' }}>
      <div style={{ background:'#fff', borderRadius:'1rem', padding:'2rem', width:'100%', maxWidth:'480px', boxShadow:'0 20px 60px rgba(0,0,0,.3)', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
          <h2 style={{ fontWeight:700, fontSize:'1.2rem' }}>{title}</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'1.5rem', cursor:'pointer', color:'#9ca3af' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RoleBadge({ role }) {
  return (
    <span style={{ background: ROLE_COLORS[role]+'18', color: ROLE_COLORS[role], padding:'.25rem .75rem', borderRadius:'9999px', fontSize:'.78rem', fontWeight:700, whiteSpace:'nowrap' }}>
      {getRoleIcon(role)} {getRoleLabel(role)}
    </span>
  );
}

function Tabs({ tabs, active, onChange, badge }) {
  return (
    <div style={{ display:'flex', gap:'.5rem', marginBottom:'2rem', background:'#f3f4f6', borderRadius:'.6rem', padding:'.3rem' }}>
      {tabs.map(({ id, label }) => (
        <button key={id} onClick={() => onChange(id)}
          style={{ flex:1, padding:'.6rem 1rem', border:'none', borderRadius:'.4rem', fontWeight:600, fontSize:'.9rem', cursor:'pointer', transition:'all .2s', position:'relative',
            background: active===id ? '#fff' : 'transparent',
            color: active===id ? '#1f2937' : '#6b7280',
            boxShadow: active===id ? '0 1px 4px rgba(0,0,0,.1)' : 'none' }}>
          {label}
          {badge?.[id] > 0 && (
            <span style={{ marginLeft:'.4rem', background:'#ef4444', color:'#fff', borderRadius:'9999px', fontSize:'.7rem', padding:'.1rem .45rem', fontWeight:800 }}>
              {badge[id]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Pending approvals panel ───────────────────────────────────────────────────
function PendingPanel({ onRefresh }) {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);   // user being reviewed
  const [roleOverride, setRoleOverride] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try { setLoading(true); setPending(await getPendingUsers()); }
    catch { }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openReview = (u) => { setSelected(u); setRoleOverride(u.role); setRejectNote(''); };

  const handleDecision = async (action) => {
    const validationError = validateTextFields([['Motivo del rechazo', rejectNote]]);
    if (validationError) {
      setMsg(validationError);
      return;
    }
    setSaving(true);
    try {
      const approvedUser = await approveUser(selected.id, {
        action,
        role_override: action === 'approve' ? roleOverride : undefined,
        rejection_note: rejectNote,
      });
      if (action === 'approve') {
        const approvedRecord = approvedUser?.id ? approvedUser : { ...selected, role: roleOverride };
        await syncRrhhRoleFromUser(approvedRecord);
      }
      setMsg(action === 'approve' ? `✅ ${selected.full_name} aprobado como ${getRoleLabel(roleOverride)}` : `❌ ${selected.full_name} rechazado`);
      setSelected(null);
      await load();
      onRefresh();
      setTimeout(() => setMsg(''), 5000);
    } catch (e) {
      setMsg('Error: ' + (e.response?.data?.detail || e.message));
    } finally { setSaving(false); }
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div>
      {selected && (
        <Modal title="Revisar solicitud" onClose={() => setSelected(null)}>
          {/* User info */}
          <div style={{ background:'#f9fafb', borderRadius:'.75rem', padding:'1rem', marginBottom:'1.5rem' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'.75rem', marginBottom:'.75rem' }}>
              <div style={{ width:'2.5rem', height:'2.5rem', borderRadius:'50%', background: ROLE_COLORS[selected.role]+'22', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem' }}>
                {getRoleIcon(selected.role)}
              </div>
              <div>
                <div style={{ fontWeight:700 }}>{selected.full_name}</div>
                <div style={{ fontSize:'.82rem', color:'#6b7280' }}>@{selected.username}</div>
              </div>
            </div>
            <div style={{ fontSize:'.85rem', color:'#6b7280' }}>Rol solicitado: <RoleBadge role={selected.role} /></div>
          </div>

          {/* Approve section */}
          <div style={{ marginBottom:'1.5rem' }}>
            <label style={{ fontWeight:600, fontSize:'.875rem', color:'#374151', display:'block', marginBottom:'.5rem' }}>
              Aprobar con rol:
            </label>
            <select value={roleOverride} onChange={e => setRoleOverride(e.target.value)}
              style={{ width:'100%', padding:'.75rem', border:'1.5px solid #d1d5db', borderRadius:'.5rem', fontSize:'1rem' }}>
              {AVAILABLE_ROLES.map(r => <option key={r} value={r}>{getRoleIcon(r)} {getRoleLabel(r)}</option>)}
            </select>
            <p style={{ fontSize:'.78rem', color:'#9ca3af', marginTop:'.4rem' }}>
              Puedes cambiar el rol antes de aprobar. El usuario solicitó: <strong>{getRoleLabel(selected.role)}</strong>.
            </p>
          </div>

          <button onClick={() => handleDecision('approve')} disabled={saving}
            style={{ width:'100%', padding:'.875rem', background:'linear-gradient(135deg,#059669,#047857)', color:'#fff', border:'none', borderRadius:'.5rem', fontWeight:700, cursor:'pointer', fontSize:'1rem', marginBottom:'1rem' }}>
            {saving ? 'Procesando...' : `✅ Aprobar como ${getRoleLabel(roleOverride)}`}
          </button>

          {/* Reject section */}
          <div style={{ borderTop:'1px solid #f3f4f6', paddingTop:'1rem' }}>
            <label style={{ fontWeight:600, fontSize:'.875rem', color:'#374151', display:'block', marginBottom:'.5rem' }}>
              Motivo del rechazo (opcional):
            </label>
            <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)}
              rows={2} placeholder="ej: No pertenece a este equipo, contactar al supervisor..."
              style={{ width:'100%', padding:'.75rem', border:'1.5px solid #d1d5db', borderRadius:'.5rem', fontSize:'.9rem', resize:'vertical', boxSizing:'border-box' }} />
            <button onClick={() => handleDecision('reject')} disabled={saving}
              style={{ width:'100%', padding:'.75rem', background:'#fef2f2', color:'#dc2626', border:'1.5px solid #fecaca', borderRadius:'.5rem', fontWeight:600, cursor:'pointer', fontSize:'.9rem', marginTop:'.75rem' }}>
              {saving ? 'Procesando...' : '❌ Rechazar solicitud'}
            </button>
          </div>
        </Modal>
      )}

      {msg && <div style={{ background: msg.startsWith('✅') ? '#d1fae5' : '#fef2f2', color: msg.startsWith('✅') ? '#065f46' : '#dc2626', padding:'1rem', borderRadius:'.5rem', marginBottom:'1rem', fontWeight:600 }}>{msg}</div>}

      {pending.length === 0 ? (
        <div style={{ textAlign:'center', padding:'3rem', color:'#9ca3af' }}>
          <div style={{ fontSize:'3rem', marginBottom:'1rem' }}>🎉</div>
          <p style={{ fontWeight:600 }}>No hay solicitudes pendientes</p>
          <p style={{ fontSize:'.875rem', marginTop:'.5rem' }}>Todas las cuentas han sido revisadas</p>
        </div>
      ) : (
        <div style={{ display:'grid', gap:'.75rem' }}>
          {pending.map(u => (
            <div key={u.id} style={{ background:'#fff', border:'2px solid #fcd34d', borderRadius:'.75rem', padding:'1rem 1.25rem', display:'flex', alignItems:'center', gap:'1rem', flexWrap:'wrap' }}>
              <div style={{ width:'2.5rem', height:'2.5rem', borderRadius:'50%', background: ROLE_COLORS[u.role]+'22', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem', flexShrink:0 }}>
                {getRoleIcon(u.role)}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700 }}>{u.full_name}</div>
                <div style={{ fontSize:'.82rem', color:'#6b7280' }}>@{u.username}</div>
              </div>
              <RoleBadge role={u.role} />
              <span style={{ fontSize:'.78rem', color:'#92400e', background:'#fef3c7', padding:'.3rem .7rem', borderRadius:'9999px', fontWeight:600, whiteSpace:'nowrap' }}>
                ⏳ Pendiente
              </span>
              <button onClick={() => openReview(u)}
                style={{ padding:'.5rem 1.25rem', background:'#2563eb', color:'#fff', border:'none', borderRadius:'.5rem', fontWeight:600, cursor:'pointer', fontSize:'.875rem', flexShrink:0 }}>
                Revisar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Active users panel ────────────────────────────────────────────────────────
const canManageUserFromUi = (actor, target) => {
  if (!actor?.role || !target?.role) return false;
  return (ROLE_HIERARCHY[actor.role] || 0) > (ROLE_HIERARCHY[target.role] || 0);
};

function UsersPanel({ isIngeniero, currentUser }) {
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser]  = useState(null);
  const [form, setForm]          = useState({ username:'', full_name:'', password:'', role:'TECNICO' });
  const [err, setErr]            = useState('');
  const [success, setSuccess]    = useState('');
  const [saving, setSaving]      = useState(false);

  const load = useCallback(async () => {
    try { setLoading(true); setUsers(await getUsers()); }
    catch { setErr('Error cargando usuarios'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm({ username:'', full_name:'', password:'', role:'TECNICO' }); setEditUser(null); setErr(''); setShowModal(true); };
  const openEdit = (u) => {
    if (!canManageUserFromUi(currentUser, u)) {
      setErr('Solo puedes editar usuarios con un rol inferior al tuyo');
      return;
    }
    setEditUser(u);
    setForm({ username:u.username, full_name:u.full_name, password:'', role:u.role });
    setErr('');
    setShowModal(true);
  };

  const save = async e => {
    e.preventDefault(); setSaving(true); setErr('');
    const validationError = firstValidationError(
      validateRequiredFields([
        ...(!editUser ? [['Usuario', form.username], ['Contrasena', form.password]] : []),
        ['Nombre completo', form.full_name],
      ]),
      validateTextFields([
        ['Usuario', form.username],
        ['Nombre completo', form.full_name],
      ]),
    );
    if (validationError) {
      setErr(validationError);
      setSaving(false);
      return;
    }
    try {
      let syncedWithRrhh = false;
      if (editUser) {
        const updatedUser = await updateUser(editUser.id, { full_name: form.full_name, role: form.role });
        syncedWithRrhh = await syncRrhhRoleFromUser(updatedUser || { ...editUser, full_name: form.full_name, role: form.role });
        setSuccess(syncedWithRrhh ? 'Usuario actualizado y RRHH sincronizado' : 'Usuario actualizado');
      } else {
        const createdUser = await createUser({ username: form.username, full_name: form.full_name, password: form.password, role: form.role });
        syncedWithRrhh = await syncRrhhRoleFromUser(createdUser);
        setSuccess(syncedWithRrhh ? 'Usuario creado y vinculado con RRHH' : 'Usuario creado correctamente');
      }
      setShowModal(false); await load();
      setTimeout(() => setSuccess(''), 4000);
    } catch(e) { setErr(e.response?.data?.detail || 'Error al guardar'); }
    finally { setSaving(false); }
  };

  const toggleActive = async u => {
    if (!canManageUserFromUi(currentUser, u)) {
      setErr('Solo puedes activar o desactivar usuarios con un rol inferior al tuyo');
      return;
    }
    const newStatus = u.account_status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try { await updateUser(u.id, { account_status: newStatus }); await load(); }
    catch { setErr('Error actualizando usuario'); }
  };

  const [resetResult, setResetResult] = useState(null); // {username, full_name, temp_password}
  const handleReset = async u => {
    if (!canManageUserFromUi(currentUser, u)) {
      setErr('Solo puedes resetear contraseñas de usuarios con un rol inferior al tuyo');
      return;
    }
    if (!window.confirm(`¿Resetear la contraseña de ${u.full_name}? Se generará una contraseña temporal.`)) return;
    try {
      const res = await resetUserPassword(u.id);
      setResetResult(res);
    } catch(e) { setErr(e.response?.data?.detail || 'Error al resetear contraseña'); }
  };

  const activeUsers   = users.filter(u => u.account_status === 'ACTIVE');
  const inactiveUsers = users.filter(u => u.account_status === 'INACTIVE');

  return (
    <div>
      {/* Reset password result modal */}
      {resetResult && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
          <div style={{ background:'#fff', borderRadius:'1rem', padding:'2rem', maxWidth:'420px', width:'100%', boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}>
            <div style={{ textAlign:'center', marginBottom:'1.5rem' }}>
              <div style={{ fontSize:'2.5rem', marginBottom:'.5rem' }}>🔑</div>
              <h2 style={{ fontWeight:700, fontSize:'1.2rem' }}>Contraseña reseteada</h2>
              <p style={{ color:'#6b7280', fontSize:'.875rem' }}>{resetResult.full_name} deberá cambiarla en su próximo inicio de sesión.</p>
            </div>
            <div style={{ background:'#f3f4f6', borderRadius:'.75rem', padding:'1.25rem', marginBottom:'1.5rem', textAlign:'center' }}>
              <div style={{ fontSize:'.8rem', color:'#6b7280', marginBottom:'.35rem' }}>Usuario</div>
              <div style={{ fontWeight:700, fontSize:'1rem', marginBottom:'1rem' }}>@{resetResult.username}</div>
              <div style={{ fontSize:'.8rem', color:'#6b7280', marginBottom:'.35rem' }}>Contraseña temporal</div>
              <div style={{ fontFamily:'monospace', fontSize:'1.4rem', fontWeight:700, color:'#2563eb', letterSpacing:'.1em', background:'#dbeafe', padding:'.5rem 1rem', borderRadius:'.5rem' }}>
                {resetResult.temp_password}
              </div>
            </div>
            <p style={{ fontSize:'.78rem', color:'#f59e0b', textAlign:'center', marginBottom:'1.25rem' }}>
              ⚠️ Anota esta contraseña y compártela con el usuario. No se mostrará nuevamente.
            </p>
            <button className="btn btn-primary" style={{ width:'100%' }} onClick={() => setResetResult(null)}>
              Entendido
            </button>
          </div>
        </div>
      )}

      {showModal && (
        <Modal title={editUser ? 'Editar usuario' : 'Nuevo usuario'} onClose={() => setShowModal(false)}>
          <form onSubmit={save}>
            {!editUser && (
              <div className="form-group">
                <label className="form-label">Usuario *</label>
                <input className="form-input" value={form.username} onChange={e => setForm({...form, username: e.target.value.toLowerCase().replace(/\s/g,'')})} required placeholder="ej: jperez" />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Nombre completo *</label>
              <input className="form-input" value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} required placeholder="ej: Juan Pérez" />
            </div>
            {!editUser && (
              <div className="form-group">
                <label className="form-label">Contraseña * <small style={{color:'#9ca3af'}}>(mín. 8 chars, 1 mayúscula, 1 número)</small></label>
                <input className="form-input" type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Rol</label>
              <select className="form-select" value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
                {AVAILABLE_ROLES.map(r => <option key={r} value={r}>{getRoleIcon(r)} {getRoleLabel(r)}</option>)}
              </select>
            </div>
            {err && <p style={{color:'#dc2626', marginBottom:'1rem', fontSize:'.875rem'}}>⚠️ {err}</p>}
            <div style={{display:'flex', gap:'.75rem', justifyContent:'flex-end'}}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        </Modal>
      )}

      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem'}}>
        <p style={{color:'#6b7280', fontSize:'.9rem'}}>{activeUsers.length} usuario(s) activo(s)</p>
        {isIngeniero && <button className="btn btn-primary" onClick={openCreate}>➕ Crear usuario</button>}
      </div>

      {success && <div className="alert alert-success" style={{marginBottom:'1rem'}}>{success}</div>}
      {err && !showModal && (
        <div style={{ background:'#fef2f2', color:'#dc2626', padding:'1rem', borderRadius:'.5rem', marginBottom:'1rem', fontWeight:600 }}>
          {err}
        </div>
      )}

      {loading ? <div className="loading"><div className="spinner" /></div> : (
        <>
          <div style={{display:'grid', gap:'.6rem'}}>
            {activeUsers.map(u => <UserRow key={u.id} u={u} isIngeniero={isIngeniero} canManage={canManageUserFromUi(currentUser, u)} onEdit={openEdit} onToggle={toggleActive} onReset={handleReset} />)}
          </div>
          {inactiveUsers.length > 0 && (
            <div style={{marginTop:'1.5rem'}}>
              <div style={{fontSize:'.85rem', fontWeight:700, color:'#6b7280', marginBottom:'.75rem'}}>Inactivos ({inactiveUsers.length})</div>
              <div style={{display:'grid', gap:'.6rem', opacity:.7}}>
                {inactiveUsers.map(u => <UserRow key={u.id} u={u} isIngeniero={isIngeniero} canManage={canManageUserFromUi(currentUser, u)} onEdit={openEdit} onToggle={toggleActive} onReset={handleReset} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function UserRow({ u, isIngeniero, canManage, onEdit, onToggle, onReset }) {
  const isActive = u.account_status === 'ACTIVE';
  return (
    <div style={{background:'#fff', border:'1px solid #e5e7eb', borderRadius:'.75rem', padding:'1rem 1.25rem', display:'flex', alignItems:'center', gap:'1rem', flexWrap:'wrap'}}>
      <div style={{width:'2.5rem', height:'2.5rem', borderRadius:'50%', background: ROLE_COLORS[u.role]+'22', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem', flexShrink:0}}>
        {getRoleIcon(u.role)}
      </div>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontWeight:700}}>{u.full_name}</div>
        <div style={{fontSize:'.82rem', color:'#6b7280'}}>@{u.username}</div>
      </div>
      <RoleBadge role={u.role} />
      <span style={{fontSize:'.78rem', fontWeight:600, color: isActive?'#059669':'#dc2626'}}>
        {isActive ? '● Activo' : '○ Inactivo'}
      </span>
      {isIngeniero && canManage && (
        <div style={{display:'flex', gap:'.5rem', flexShrink:0}}>
          <button className="btn btn-sm btn-secondary" onClick={() => onEdit(u)}>Editar</button>
          <button onClick={() => onReset(u)}
            style={{padding:'.4rem .8rem', border:'none', borderRadius:'.375rem', cursor:'pointer', fontSize:'.8rem', fontWeight:600, background:'#fef3c7', color:'#92400e'}}>
            🔑 Resetear
          </button>
          <button onClick={() => onToggle(u)}
            style={{padding:'.4rem .8rem', border:'none', borderRadius:'.375rem', cursor:'pointer', fontSize:'.8rem', fontWeight:600,
              background: isActive?'#fee2e2':'#d1fae5', color: isActive?'#dc2626':'#059669'}}>
            {isActive ? 'Desactivar' : 'Activar'}
          </button>
        </div>
      )}
      {isIngeniero && !canManage && (
        <span style={{fontSize:'.78rem', fontWeight:600, color:'#6b7280', background:'#f3f4f6', padding:'.35rem .7rem', borderRadius:'9999px'}}>
          Solo lectura
        </span>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function UserManagement() {
  const { user, hasRole } = useAuth();
  const isIngeniero = hasRole('INGENIERO');
  const [tab, setTab] = useState(isIngeniero ? 'pending' : 'users');
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPending = useCallback(async () => {
    if (!isIngeniero) return;
    try { const p = await getPendingUsers(); setPendingCount(p.length); } catch {}
  }, [isIngeniero]);

  useEffect(() => { refreshPending(); }, [refreshPending]);

  const tabs = isIngeniero
    ? [{ id:'pending', label:'Solicitudes pendientes' }, { id:'users', label:'Usuarios activos' }]
    : [{ id:'users', label:'Usuarios' }];

  return (
    <div>
      <h1 style={{fontSize:'2rem', fontWeight:700, marginBottom:'2rem'}}>Gestión de Usuarios</h1>
      <Tabs tabs={tabs} active={tab} onChange={setTab} badge={{ pending: pendingCount }} />
      {tab === 'pending' && <PendingPanel onRefresh={refreshPending} />}
      {tab === 'users'   && <UsersPanel  isIngeniero={isIngeniero} currentUser={user} />}
    </div>
  );
}
