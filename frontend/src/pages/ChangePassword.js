import React, { useState, useEffect } from 'react';
import { changePassword, getSecretQuestions, setSecretQuestion, getMe } from '../services/api';

const looksLikeTemporaryPassword = (pw) => /^Cambiar\d{6}!$/.test(pw);

const checks = (pw) => [
  { label: 'Mínimo 8 caracteres',      ok: pw.length >= 8 },
  { label: 'Al menos 1 mayúscula',      ok: /[A-Z]/.test(pw) },
  { label: 'Al menos 1 número',         ok: /[0-9]/.test(pw) },
  { label: 'No es contraseña temporal', ok: !looksLikeTemporaryPassword(pw) },
];

export default function ChangePassword() {
  const [form, setForm]     = useState({ current: '', newPw: '', confirm: '' });
  const [error, setError]   = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Secret question
  const [questions, setQuestions]       = useState([]);
  const [sqForm, setSqForm]             = useState({ question: '', answer: '', confirm: '' });
  const [sqErr, setSqErr]               = useState('');
  const [sqSuccess, setSqSuccess]       = useState('');
  const [sqLoading, setSqLoading]       = useState(false);
  const [hasQuestion, setHasQuestion]   = useState(false);

  useEffect(() => {
    getSecretQuestions().then(r => {
      setQuestions(r.questions);
      setSqForm(f => ({ ...f, question: r.questions[0] || '' }));
    });
    getMe().then(u => setHasQuestion(!!u.secret_question));
  }, []);

  const pwChecks = checks(form.newPw);
  const allOk    = pwChecks.every(c => c.ok) && form.newPw === form.confirm;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!allOk) { setError('La contraseña no cumple todos los requisitos'); return; }
    setLoading(true);
    try {
      await changePassword(form.current, form.newPw);
      setSuccess('✅ Contraseña actualizada correctamente');
      setForm({ current: '', newPw: '', confirm: '' });
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al cambiar contraseña');
    } finally { setLoading(false); }
  };

  const handleSaveQuestion = async (e) => {
    e.preventDefault();
    setSqErr(''); setSqSuccess('');
    if (!sqForm.answer.trim()) { setSqErr('Escribe tu respuesta'); return; }
    if (sqForm.answer.trim().toLowerCase() !== sqForm.confirm.trim().toLowerCase()) {
      setSqErr('Las respuestas no coinciden'); return;
    }
    setSqLoading(true);
    try {
      await setSecretQuestion({ question: sqForm.question, answer: sqForm.answer.trim() });
      setSqSuccess('✅ Pregunta secreta guardada correctamente');
      setHasQuestion(true);
      setSqForm(f => ({ ...f, answer: '', confirm: '' }));
    } catch(err) { setSqErr(err.response?.data?.detail || 'Error'); }
    finally { setSqLoading(false); }
  };

  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '1.75rem' }}>Seguridad de la cuenta</h1>

      {/* ── Cambiar contraseña ── */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 className="card-title">🔒 Cambiar Contraseña</h2>
        {success && <div style={{ background:'#d1fae5', color:'#065f46', padding:'1rem', borderRadius:'.5rem', marginBottom:'1rem' }}>{success}</div>}
        {error   && <div style={{ background:'#fef2f2', color:'#dc2626', padding:'1rem', borderRadius:'.5rem', marginBottom:'1rem' }}>⚠️ {error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Contraseña actual</label>
            <input className="form-input" type="password" value={form.current} onChange={e => setForm({...form, current: e.target.value})} required />
          </div>
          <div className="form-group">
            <label className="form-label">Nueva contraseña</label>
            <input className="form-input" type="password" value={form.newPw} onChange={e => setForm({...form, newPw: e.target.value})} required />
            {form.newPw && (
              <div style={{ marginTop:'.5rem', display:'flex', flexDirection:'column', gap:'.25rem' }}>
                {pwChecks.map(({ label, ok }) => (
                  <span key={label} style={{ fontSize:'.8rem', color: ok ? '#059669' : '#ef4444' }}>
                    {ok ? '✅' : '❌'} {label}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Confirmar nueva contraseña</label>
            <input className="form-input" type="password" value={form.confirm} onChange={e => setForm({...form, confirm: e.target.value})} required />
            {form.confirm && <span style={{ fontSize:'.8rem', color: form.newPw === form.confirm ? '#059669' : '#ef4444' }}>
              {form.newPw === form.confirm ? '✅ Coinciden' : '❌ No coinciden'}
            </span>}
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading || !allOk}>
            {loading ? 'Guardando...' : 'Cambiar Contraseña'}
          </button>
        </form>
      </div>

      {/* ── Pregunta secreta ── */}
      <div className="card">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
          <h2 className="card-title" style={{ margin:0 }}>🔐 Pregunta Secreta</h2>
          {hasQuestion && <span style={{ fontSize:'.78rem', background:'#d1fae5', color:'#065f46', padding:'.25rem .65rem', borderRadius:'9999px', fontWeight:700 }}>✅ Configurada</span>}
        </div>
        <p style={{ fontSize:'.875rem', color:'#6b7280', marginBottom:'1.25rem' }}>
          Usada para recuperar tu contraseña desde el login sin necesidad de contactar al administrador.
          {hasQuestion && ' Puedes cambiarla en cualquier momento.'}
        </p>

        {sqSuccess && <div style={{ background:'#d1fae5', color:'#065f46', padding:'1rem', borderRadius:'.5rem', marginBottom:'1rem' }}>{sqSuccess}</div>}
        {sqErr     && <div style={{ background:'#fef2f2', color:'#dc2626', padding:'1rem', borderRadius:'.5rem', marginBottom:'1rem' }}>⚠️ {sqErr}</div>}

        <form onSubmit={handleSaveQuestion}>
          <div className="form-group">
            <label className="form-label">Elige una pregunta</label>
            <select className="form-select" value={sqForm.question} onChange={e => setSqForm({...sqForm, question: e.target.value})}>
              {questions.map(q => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Tu respuesta</label>
            <input className="form-input" type="password" value={sqForm.answer} onChange={e => setSqForm({...sqForm, answer: e.target.value})} placeholder="Escribe tu respuesta..." required />
          </div>
          <div className="form-group">
            <label className="form-label">Confirmar respuesta</label>
            <input className="form-input" type="password" value={sqForm.confirm} onChange={e => setSqForm({...sqForm, confirm: e.target.value})} placeholder="Repite tu respuesta..." required />
            {sqForm.confirm && <span style={{ fontSize:'.8rem', color: sqForm.answer.trim().toLowerCase() === sqForm.confirm.trim().toLowerCase() ? '#059669' : '#ef4444' }}>
              {sqForm.answer.trim().toLowerCase() === sqForm.confirm.trim().toLowerCase() ? '✅ Coinciden' : '❌ No coinciden'}
            </span>}
          </div>
          <p style={{ fontSize:'.75rem', color:'#9ca3af', marginBottom:'1rem' }}>La respuesta no distingue mayúsculas de minúsculas.</p>
          <button type="submit" className="btn btn-primary" disabled={sqLoading || !sqForm.answer.trim()}>
            {sqLoading ? 'Guardando...' : hasQuestion ? '🔄 Actualizar pregunta secreta' : '💾 Guardar pregunta secreta'}
          </button>
        </form>
      </div>
    </div>
  );
}
