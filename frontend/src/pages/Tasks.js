import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getTasks } from '../services/api';
import { format } from 'date-fns';

const STATUS_LABEL = { DRAFT:'Borrador', OPEN:'Abierta', IN_PROGRESS:'En Progreso', DONE:'Completada', CANCELLED:'Cancelada' };
const STATUS_COLOR = { DRAFT:'#6b7280', OPEN:'#2563eb', IN_PROGRESS:'#f59e0b', DONE:'#059669', CANCELLED:'#dc2626' };
const PRIORITY_COLOR = { ALTA:'#dc2626', MEDIA:'#f59e0b', BAJA:'#059669' };

const ROLE_HIERARCHY = { TECNICO:1, ENCARGADO:2, PLANNER:3, INGENIERO:4 };
const canManage = (role) => ROLE_HIERARCHY[role] >= ROLE_HIERARCHY['ENCARGADO'];

export default function Tasks({ user }) {
  const [tasks, setTasks]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filters, setFilters]   = useState({
    day_date: new Date().toISOString().split('T')[0],
    status: '',
  });

  useEffect(() => { loadTasks(); }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTasks = async () => {
    try {
      setLoading(true);
      const data = await getTasks(filters);
      setTasks(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const isTecnico = !canManage(user.role);
  // TECNICO never sees DRAFT — already filtered server-side, but also guard client-side
  const visibleTasks = isTecnico ? tasks.filter(t => t.status !== 'DRAFT') : tasks;

  const draftCount = tasks.filter(t => t.status === 'DRAFT').length;

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem', flexWrap:'wrap', gap:'1rem' }}>
        <h1 style={{ fontSize:'2rem', fontWeight:700 }}>Tareas</h1>
      </div>

      {/* Draft info banner for managers */}
      {canManage(user.role) && draftCount > 0 && (
        <div style={{ background:'#fef3c7', border:'1.5px solid #fcd34d', borderRadius:'.65rem', padding:'.75rem 1.1rem', marginBottom:'1.25rem', display:'flex', alignItems:'center', gap:'.6rem', fontSize:'.875rem' }}>
          <span style={{ fontSize:'1.1rem' }}>📋</span>
          <span><strong>{draftCount}</strong> tarea(s) en borrador — solo visibles para ENCARGADO, PLANNER e INGENIERO</span>
        </div>
      )}

      {/* Filters */}
      <div className="card" style={{ marginBottom:'1.5rem' }}>
        <div style={{ display:'flex', gap:'1rem', flexWrap:'wrap' }}>
          <div className="form-group" style={{ margin:0, flex:1, minWidth:'150px' }}>
            <label className="form-label">Fecha</label>
            <input type="date" className="form-input" name="day_date"
              value={filters.day_date} onChange={e => setFilters({...filters, day_date: e.target.value})} />
          </div>
          <div className="form-group" style={{ margin:0, flex:1, minWidth:'150px' }}>
            <label className="form-label">Estado</label>
            <select className="form-select" name="status"
              value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
              <option value="">Todos</option>
              {canManage(user.role) && <option value="DRAFT">Borradores</option>}
              <option value="OPEN">Abiertas</option>
              <option value="IN_PROGRESS">En Progreso</option>
              <option value="DONE">Completadas</option>
            </select>
          </div>
          <div style={{ alignSelf:'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setFilters({ day_date:'', status:'' })}>
              Ver todas
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : visibleTasks.length === 0 ? (
        <div className="card" style={{ textAlign:'center', padding:'3rem', color:'#9ca3af' }}>
          <div style={{ fontSize:'3rem', marginBottom:'1rem' }}>📋</div>
          <p style={{ fontWeight:600 }}>No hay tareas para mostrar</p>
          <p style={{ fontSize:'.875rem', marginTop:'.4rem' }}>Cambia los filtros para revisar otros registros</p>
        </div>
      ) : (
        <div style={{ display:'grid', gap:'.75rem' }}>
          {visibleTasks.map(task => (
            <Link key={task.id} to={`/tasks/${task.id}`} style={{ textDecoration:'none', color:'inherit' }}>
              <div style={{
                background:'#fff', border: `1.5px solid ${task.status === 'DRAFT' ? '#fcd34d' : '#e5e7eb'}`,
                borderRadius:'.75rem', padding:'1rem 1.25rem', display:'flex', alignItems:'center', gap:'1rem',
                flexWrap:'wrap', transition:'box-shadow .15s', cursor:'pointer',
                opacity: task.status === 'DRAFT' ? 0.85 : 1,
              }}
              onMouseEnter={e => e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,.08)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow='none'}>

                {/* Draft icon */}
                {task.status === 'DRAFT' && (
                  <span title="Borrador" style={{ fontSize:'1.2rem' }}>📋</span>
                )}

                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:'1rem', marginBottom:'.2rem', display:'flex', alignItems:'center', gap:'.5rem' }}>
                    {task.description}
                  </div>
                  <div style={{ fontSize:'.82rem', color:'#6b7280' }}>
                    {task.area} · {task.equipo} · {format(new Date(task.day_date), 'dd/MM/yyyy')}
                  </div>
                </div>

                <div style={{ display:'flex', gap:'.5rem', flexWrap:'wrap', alignItems:'center' }}>
                  <span style={{ background: PRIORITY_COLOR[task.priority]+'18', color: PRIORITY_COLOR[task.priority], padding:'.2rem .65rem', borderRadius:'9999px', fontSize:'.75rem', fontWeight:700 }}>
                    {task.priority}
                  </span>
                  <span style={{ background: STATUS_COLOR[task.status]+'18', color: STATUS_COLOR[task.status], padding:'.2rem .65rem', borderRadius:'9999px', fontSize:'.75rem', fontWeight:700 }}>
                    {STATUS_LABEL[task.status]}
                  </span>
                  <span style={{ fontSize:'.78rem', color:'#9ca3af' }}>#{task.id}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
