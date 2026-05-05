import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { register, changePassword, getSecretQuestions, getUserSecretQuestion, recoverPassword } from '../services/api';

const ROLES = {
  OPERADOR : { label: 'Operador',  icon: 'ðŸ§¾', color: '#64748b', desc: 'Registro de avisos y consulta operativa' },
  SUPERVISOR: { label: 'Supervisor', icon: 'ðŸ›¡ï¸', color: '#ea580c', desc: 'Registro de avisos y seguimiento en campo' },
  TECNICO  : { label: 'Técnico',   icon: '🔧', color: '#059669', desc: 'Ejecución de tareas de mantenimiento' },
  ENCARGADO: { label: 'Encargado', icon: '🔑', color: '#0891b2', desc: 'Gestión de equipo y asignación de tareas' },
  PLANNER  : { label: 'Planner',   icon: '📋', color: '#2563eb', desc: 'Planificación y creación de tareas' },
  INGENIERO: { label: 'Ingeniero', icon: '👷', color: '#7c3aed', desc: 'Control total del sistema' },
};

const looksLikeTemporaryPassword = (pw) => /^Cambiar\d{6}!$/.test(pw);

const pwRules = pw => [
  { label: 'Mínimo 8 caracteres',        ok: pw.length >= 8 },
  { label: 'Al menos una mayúscula',      ok: /[A-Z]/.test(pw) },
  { label: 'Al menos un número',          ok: /[0-9]/.test(pw) },
  { label: 'No es contraseña temporal',   ok: !looksLikeTemporaryPassword(pw) },
];

// ── Shared primitives ─────────────────────────────────────────────────────────
const s = {
  page  : { minHeight:'100vh', background:'linear-gradient(135deg,#1e3a5f,#2563eb)', display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' },
  card  : { background:'#fff', borderRadius:'1rem', boxShadow:'0 20px 60px rgba(0,0,0,.3)', padding:'2.5rem', width:'100%', maxWidth:'460px' },
  title : { fontSize:'1.5rem', fontWeight:700, color:'#1e3a5f', marginBottom:'.25rem', textAlign:'center' },
  sub   : { color:'#6b7280', fontSize:'.875rem', textAlign:'center', marginBottom:'2rem', lineHeight:1.5 },
  label : { fontSize:'.875rem', fontWeight:600, color:'#374151', display:'block', marginBottom:'.4rem' },
  input : { width:'100%', padding:'.75rem 1rem', border:'1.5px solid #d1d5db', borderRadius:'.5rem', fontSize:'1rem', boxSizing:'border-box', outline:'none' },
  btn   : (disabled) => ({ width:'100%', padding:'.875rem', background: disabled ? '#9ca3af' : 'linear-gradient(135deg,#2563eb,#1d4ed8)', color:'#fff', border:'none', borderRadius:'.5rem', fontSize:'1rem', fontWeight:600, cursor: disabled ? 'not-allowed' : 'pointer', marginTop:'.5rem' }),
  err   : { background:'#fef2f2', border:'1px solid #fecaca', color:'#dc2626', borderRadius:'.5rem', padding:'.75rem 1rem', fontSize:'.875rem', marginBottom:'1rem' },
  ok    : { background:'#d1fae5', border:'1px solid #6ee7b7', color:'#065f46', borderRadius:'.5rem', padding:'1rem', fontSize:'.9rem', marginBottom:'1rem' },
};

function Field({ label, type = 'text', value, onChange, ...rest }) {
  const [show, setShow] = useState(false);
  const isPass = type === 'password';
  return (
    <div style={{ marginBottom:'1.25rem' }}>
      <label style={s.label}>{label}</label>
      <div style={{ position:'relative' }}>
        <input style={{ ...s.input, paddingRight: isPass ? '3rem' : '1rem' }}
          type={isPass && show ? 'text' : type} value={value}
          onChange={e => onChange(e.target.value)} {...rest} />
        {isPass && (
          <button type="button" onClick={() => setShow(p=>!p)}
            style={{ position:'absolute', right:'.75rem', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:'1.1rem' }}>
            {show ? '🙈' : '👁️'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Force change password (first-time temp pw) ────────────────────────────────
function ForceChangePw({ user, onDone }) {
  const [np, setNp] = useState(''); const [cp, setCp] = useState('');
  const [err, setErr] = useState(''); const [loading, setLoading] = useState(false);
  const rules = pwRules(np); const allOk = rules.every(r => r.ok);

  const submit = async e => {
    e.preventDefault(); setErr('');
    if (!allOk) return setErr('La contraseña no cumple los requisitos');
    if (np !== cp) return setErr('Las contraseñas no coinciden');
    setLoading(true);
    try { await changePassword(user._tempPw, np); onDone(); }
    catch(e) { setErr(e.response?.data?.detail || 'Error'); }
    finally { setLoading(false); }
  };

  return (
    <div style={s.page}><div style={s.card}>
      <div style={{ textAlign:'center', marginBottom:'2rem' }}>
        <div style={{ fontSize:'3rem' }}>🔐</div>
        <h1 style={s.title}>Configura tu contraseña</h1>
        <p style={s.sub}>Hola <strong>{user.full_name}</strong>. Elige una contraseña personal antes de continuar.</p>
      </div>
      {err && <div style={s.err}>⚠️ {err}</div>}
      <div style={{ background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:'.5rem', padding:'.75rem 1rem', marginBottom:'1.25rem' }}>
        {rules.map(({label,ok}) => (
          <div key={label} style={{ fontSize:'.8rem', color: ok?'#059669':'#9ca3af', display:'flex', gap:'.4rem', marginBottom:'.2rem' }}>
            <span>{ok?'✅':'○'}</span>{label}
          </div>
        ))}
      </div>
      <form onSubmit={submit}>
        <Field label="Nueva contraseña" type="password" value={np} onChange={setNp} required autoFocus />
        <Field label="Confirmar contraseña" type="password" value={cp} onChange={setCp} required />
        {cp && <div style={{ fontSize:'.8rem', color: np===cp?'#059669':'#ef4444', marginBottom:'.75rem' }}>
          {np===cp ? '✅ Coinciden' : '❌ No coinciden'}
        </div>}
        <button type="submit" style={s.btn(!allOk||loading)} disabled={!allOk||loading}>
          {loading ? 'Guardando...' : 'Guardar y entrar'}
        </button>
      </form>
    </div></div>
  );
}


// ── Recover password screen ───────────────────────────────────────────────────
function RecoverScreen({ onBack }) {
  const [step, setStep]       = useState(1); // 1=enter username, 2=answer question, 3=new password
  const [username, setUsername] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer]   = useState('');
  const [newPw, setNewPw]     = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');
  const [done, setDone]       = useState(false);

  const pwOk = pwRules(newPw).every(r => r.ok) && newPw === confirmPw;

  const handleStep1 = async e => {
    e.preventDefault(); setErr(''); setLoading(true);
    try {
      const res = await getUserSecretQuestion(username.trim());
      setQuestion(res.question);
      setStep(2);
    } catch(e) { setErr(e.response?.data?.detail || 'Error'); }
    finally { setLoading(false); }
  };

  const handleStep2 = e => {
    e.preventDefault();
    if (!answer.trim()) { setErr('Escribe tu respuesta'); return; }
    setErr(''); setStep(3);
  };

  const handleStep3 = async e => {
    e.preventDefault();
    if (!pwOk) return;
    setErr(''); setLoading(true);
    try {
      await recoverPassword({ username: username.trim(), answer: answer.trim(), new_password: newPw });
      setDone(true);
    } catch(e) { setErr(e.response?.data?.detail || 'Respuesta incorrecta'); setStep(2); setAnswer(''); }
    finally { setLoading(false); }
  };

  if (done) return (
    <div style={s.page}><div style={s.card}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:'3rem', marginBottom:'1rem' }}>✅</div>
        <h2 style={{ fontWeight:700, marginBottom:'.5rem' }}>¡Contraseña actualizada!</h2>
        <p style={{ color:'#6b7280', marginBottom:'1.5rem' }}>Ya puedes iniciar sesión con tu nueva contraseña.</p>
        <button onClick={onBack} style={s.btn(false)}>Ir al Login</button>
      </div>
    </div></div>
  );

  return (
    <div style={s.page}><div style={s.card}>
      <button onClick={onBack} style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer', fontSize:'.875rem', marginBottom:'1.5rem', padding:0 }}>← Volver al login</button>
      <div style={{ textAlign:'center', marginBottom:'1.5rem' }}>
        <div style={{ fontSize:'2.5rem', marginBottom:'.5rem' }}>🔐</div>
        <h1 style={s.title}>Recuperar contraseña</h1>
        <div style={{ display:'flex', justifyContent:'center', gap:'.5rem', marginTop:'1rem' }}>
          {[1,2,3].map(n => (
            <div key={n} style={{ width:'2rem', height:'2rem', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:'.85rem',
              background: step >= n ? '#2563eb' : '#e5e7eb', color: step >= n ? '#fff' : '#9ca3af' }}>{n}</div>
          ))}
        </div>
        <p style={{ fontSize:'.8rem', color:'#9ca3af', marginTop:'.5rem' }}>
          {step === 1 ? 'Identifica tu usuario' : step === 2 ? 'Responde tu pregunta secreta' : 'Crea tu nueva contraseña'}
        </p>
      </div>

      {err && <div style={s.err}>⚠️ {err}</div>}

      {step === 1 && (
        <form onSubmit={handleStep1}>
          <Field label="Usuario" value={username} onChange={setUsername} placeholder="Tu nombre de usuario" required disabled={loading} autoFocus />
          <button type="submit" style={s.btn(loading || !username.trim())} disabled={loading || !username.trim()}>
            {loading ? 'Buscando...' : 'Continuar →'}
          </button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleStep2}>
          <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'.5rem', padding:'1rem', marginBottom:'1rem', fontSize:'.9rem', color:'#1d4ed8', fontWeight:600 }}>
            🔒 {question}
          </div>
          <Field label="Tu respuesta" value={answer} onChange={setAnswer} placeholder="Escribe tu respuesta..." required autoFocus />
          <p style={{ fontSize:'.75rem', color:'#9ca3af', marginBottom:'1rem' }}>La respuesta no distingue entre mayúsculas y minúsculas.</p>
          <button type="submit" style={s.btn(!answer.trim())} disabled={!answer.trim()}>Verificar →</button>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={handleStep3}>
          <Field label="Nueva contraseña" type="password" value={newPw} onChange={setNewPw} required autoFocus />
          <div style={{ marginBottom:'1rem' }}>
            {pwRules(newPw).map(r => (
              <div key={r.label} style={{ fontSize:'.78rem', color: r.ok ? '#059669' : '#9ca3af', marginBottom:'.2rem' }}>
                {r.ok ? '✅' : '○'} {r.label}
              </div>
            ))}
          </div>
          <Field label="Confirmar contraseña" type="password" value={confirmPw} onChange={setConfirmPw} required />
          {confirmPw && <div style={{ fontSize:'.8rem', color: newPw === confirmPw ? '#059669' : '#ef4444', marginBottom:'.75rem' }}>
            {newPw === confirmPw ? '✅ Coinciden' : '❌ No coinciden'}
          </div>}
          <button type="submit" style={s.btn(loading || !pwOk)} disabled={loading || !pwOk}>
            {loading ? 'Guardando...' : '💾 Guardar nueva contraseña'}
          </button>
        </form>
      )}
    </div></div>
  );
}

// ── Register screen ───────────────────────────────────────────────────────────
function RegisterScreen({ onBack }) {
  const [step, setStep]   = useState(1); // 1=datos+contraseña, 2=pregunta secreta
  const [form, setForm]   = useState({ username:'', full_name:'', password:'', confirm:'', role:'TECNICO' });
  const [sq, setSq]       = useState({ question:'', answer:'', confirm:'' });
  const [questions, setQuestions] = useState([]);
  const [err, setErr]     = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const rules = pwRules(form.password); const allOk = rules.every(r=>r.ok);
  const set = k => v => setForm(f=>({...f,[k]:v}));

  useEffect(() => {
    getSecretQuestions().then(r => {
      setQuestions(r.questions);
      setSq(f => ({ ...f, question: r.questions[0] || '' }));
    });
  }, []);

  const goToStep2 = e => {
    e.preventDefault(); setErr('');
    if (!allOk) return setErr('La contraseña no cumple los requisitos');
    if (form.password !== form.confirm) return setErr('Las contraseñas no coinciden');
    if (!form.username.trim() || !form.full_name.trim()) return setErr('Completa todos los campos');
    setStep(2);
  };

  const submit = async e => {
    e.preventDefault(); setErr('');
    if (!sq.answer.trim()) return setErr('La respuesta no puede estar vacía');
    if (sq.answer.trim().toLowerCase() !== sq.confirm.trim().toLowerCase()) return setErr('Las respuestas no coinciden');
    setLoading(true);
    try {
      await register({
        username: form.username.trim(), full_name: form.full_name.trim(),
        password: form.password, role: form.role,
        secret_question: sq.question, secret_answer: sq.answer.trim(),
      });
      setSuccess(true);
    } catch(e) { setErr(e.response?.data?.detail || 'Error al registrarse'); setStep(1); }
    finally { setLoading(false); }
  };

  if (success) return (
    <div style={s.page}><div style={s.card}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:'4rem', marginBottom:'1rem' }}>✅</div>
        <h1 style={s.title}>Registro enviado</h1>
        <p style={{ color:'#6b7280', lineHeight:1.6, marginTop:'1rem' }}>
          Tu cuenta ha sido creada y está <strong>pendiente de aprobación</strong>.<br/><br/>
          Un Ingeniero revisará tu solicitud y activará tu cuenta.<br/>
          Una vez aprobada, podrás iniciar sesión con tu usuario y contraseña.
        </p>
        <div style={{ background:'#fef3c7', border:'1px solid #fcd34d', borderRadius:'.75rem', padding:'1rem', margin:'1.5rem 0', fontSize:'.875rem', color:'#92400e' }}>
          ⏳ Tiempo estimado de aprobación: contacta a tu Ingeniero o Encargado para agilizar el proceso.
        </div>
        <button onClick={onBack} style={{ ...s.btn(false), marginTop:0 }}>← Volver al login</button>
      </div>
    </div></div>
  );

  return (
    <div style={s.page}><div style={{ ...s.card, maxWidth:'520px' }}>
      <button onClick={onBack} style={{ background:'none', border:'none', cursor:'pointer', color:'#6b7280', marginBottom:'1rem', fontSize:'.9rem' }}>
        ← Volver al login
      </button>
      <div style={{ textAlign:'center', marginBottom:'1.5rem' }}>
        <div style={{ fontSize:'2.5rem' }}>✍️</div>
        <h1 style={s.title}>Crear cuenta</h1>
        <div style={{ display:'flex', justifyContent:'center', gap:'.5rem', margin:'.75rem 0' }}>
          {[1,2].map(n => (
            <div key={n} style={{ width:'2rem', height:'2rem', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:'.85rem',
              background: step >= n ? '#2563eb' : '#e5e7eb', color: step >= n ? '#fff' : '#9ca3af' }}>{n}</div>
          ))}
        </div>
        <p style={s.sub}>{step === 1 ? 'Datos de tu cuenta' : 'Configura tu pregunta secreta'}</p>
      </div>

      {err && <div style={s.err}>⚠️ {err}</div>}

      <form onSubmit={step === 1 ? goToStep2 : submit}>
        <Field label="Nombre de usuario *" value={form.username} onChange={v => setForm(f=>({...f, username: v.toLowerCase().replace(/\s/g,'')}))} placeholder="ej: jperez" required />
        <Field label="Nombre completo *" value={form.full_name} onChange={set('full_name')} placeholder="ej: Juan Pérez" required />

        {/* Role selector */}
        <div style={{ marginBottom:'1.25rem' }}>
          <label style={s.label}>Rol que solicitas *</label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.6rem' }}>
            {Object.entries(ROLES).map(([key, {label, icon, color, desc}]) => (
              <button type="button" key={key} onClick={() => setForm(f=>({...f, role:key}))}
                style={{ padding:'.75rem', border:`2px solid ${form.role===key ? color : '#e5e7eb'}`, borderRadius:'.6rem', background: form.role===key ? color+'11' : '#fff', cursor:'pointer', textAlign:'left', transition:'all .15s' }}>
                <div style={{ fontSize:'1.3rem', marginBottom:'.25rem' }}>{icon}</div>
                <div style={{ fontWeight:700, fontSize:'.85rem', color: form.role===key ? color : '#1f2937' }}>{label}</div>
                <div style={{ fontSize:'.72rem', color:'#6b7280', marginTop:'.15rem', lineHeight:1.3 }}>{desc}</div>
              </button>
            ))}
          </div>
        </div>

        <Field label="Contraseña *" type="password" value={form.password} onChange={set('password')} required />
        {form.password && (
          <div style={{ background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:'.5rem', padding:'.6rem .9rem', marginBottom:'1rem' }}>
            {rules.map(({label,ok}) => (
              <div key={label} style={{ fontSize:'.78rem', color: ok?'#059669':'#ef4444', display:'flex', gap:'.35rem', marginBottom:'.2rem' }}>
                {ok?'✅':'❌'} {label}
              </div>
            ))}
          </div>
        )}

        <Field label="Confirmar contraseña *" type="password" value={form.confirm} onChange={set('confirm')} required />
        {form.confirm && (
          <div style={{ fontSize:'.8rem', color: form.password===form.confirm?'#059669':'#ef4444', marginBottom:'.75rem' }}>
            {form.password===form.confirm ? '✅ Coinciden' : '❌ No coinciden'}
          </div>
        )}

        {step === 1 && (
          <button type="submit" style={s.btn(!allOk || !form.username.trim() || !form.full_name.trim())} disabled={!allOk || !form.username.trim() || !form.full_name.trim()}>
            Continuar →
          </button>
        )}

        {step === 2 && (<>
          <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'.5rem', padding:'.75rem', marginBottom:'1rem', fontSize:'.82rem', color:'#1e40af' }}>
            🔐 Esta pregunta te permitirá recuperar tu contraseña desde el login sin necesitar ayuda del administrador.
          </div>
          <div className="form-group">
            <label className="form-label">Elige tu pregunta secreta *</label>
            <select className="form-select" value={sq.question} onChange={e => setSq(f=>({...f, question:e.target.value}))}>
              {questions.map(q => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>
          <Field label="Tu respuesta *" type="password" value={sq.answer} onChange={v => setSq(f=>({...f, answer:v}))} placeholder="Escribe tu respuesta..." required />
          <Field label="Confirmar respuesta *" type="password" value={sq.confirm} onChange={v => setSq(f=>({...f, confirm:v}))} placeholder="Repite tu respuesta..." required />
          {sq.confirm && (
            <div style={{ fontSize:'.8rem', color: sq.answer.trim().toLowerCase()===sq.confirm.trim().toLowerCase()?'#059669':'#ef4444', marginBottom:'.75rem' }}>
              {sq.answer.trim().toLowerCase()===sq.confirm.trim().toLowerCase() ? '✅ Coinciden' : '❌ No coinciden'}
            </div>
          )}
          <p style={{ fontSize:'.75rem', color:'#9ca3af', marginBottom:'1rem' }}>La respuesta no distingue mayúsculas de minúsculas.</p>
          <div style={{ display:'flex', gap:'.75rem' }}>
            <button type="button" onClick={() => { setStep(1); setErr(''); }}
              style={{ flex:1, padding:'.75rem', background:'#f9fafb', border:'1.5px solid #e5e7eb', borderRadius:'.5rem', cursor:'pointer', fontWeight:600, fontSize:'.95rem', color:'#374151' }}>
              ← Atrás
            </button>
            <button type="submit" style={{ ...s.btn(loading || !sq.answer.trim()), flex:2 }} disabled={loading || !sq.answer.trim()}>
              {loading ? 'Enviando...' : '✅ Solicitar acceso'}
            </button>
          </div>
        </>)}
      </form>
    </div></div>
  );
}

// ── Main login screen ─────────────────────────────────────────────────────────
export default function Login() {
  const { login } = useAuth();
  const [screen, setScreen] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr]   = useState('');
  const [loading, setLoading] = useState(false);
  const [mustChange, setMustChange] = useState(null);

  if (screen === 'register') return <RegisterScreen onBack={() => setScreen('login')} />;
  if (screen === 'recover')  return <RecoverScreen  onBack={() => setScreen('login')} />;
  if (mustChange)            return <ForceChangePw user={mustChange} onDone={() => setMustChange(null)} />;

  const submit = async e => {
    e.preventDefault(); setErr(''); setLoading(true);
    try {
      const user = await login(username.trim(), password);
      if (looksLikeTemporaryPassword(password)) setMustChange({ ...user, _tempPw: password });
    } catch(e) {
      if (!e.response) setErr('No se pudo conectar con el servidor. Revisa CORS, REACT_APP_API_URL o el estado del backend.');
      else setErr(e.response?.data?.detail || 'Usuario o contraseña incorrectos');
    } finally { setLoading(false); }
  };

  return (
    <div style={s.page}><div style={s.card}>
      <div style={{ textAlign:'center', marginBottom:'2rem' }}>
        <div style={{ fontSize:'3rem', marginBottom:'.5rem' }}>🔧</div>
        <h1 style={s.title}>Sistema de Mantenimiento</h1>
        <p style={s.sub}>Inicia sesión con tu usuario y contraseña</p>
      </div>

      {err && <div style={s.err}>⚠️ {err}</div>}

      <form onSubmit={submit}>
        <Field label="Usuario" value={username} onChange={setUsername} autoComplete="username" placeholder="Tu nombre de usuario" required disabled={loading} />
        <Field label="Contraseña" type="password" value={password} onChange={setPassword} autoComplete="current-password" placeholder="Tu contraseña" required disabled={loading} />
        <button type="submit" style={s.btn(loading)} disabled={loading}>
          {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
        </button>
      </form>

      {/* Forgot password */}
      <div style={{ textAlign:'center', marginTop:'.75rem' }}>
        <button onClick={() => setScreen('recover')} style={{ background:'none', border:'none', color:'#2563eb', cursor:'pointer', fontSize:'.875rem', textDecoration:'underline', padding:0 }}>
          ¿Olvidaste tu contraseña?
        </button>
      </div>

      {/* Divider */}
      <div style={{ display:'flex', alignItems:'center', gap:'1rem', margin:'1.5rem 0 1rem' }}>
        <div style={{ flex:1, height:1, background:'#e5e7eb' }} />
        <span style={{ fontSize:'.8rem', color:'#9ca3af' }}>¿Nuevo aquí?</span>
        <div style={{ flex:1, height:1, background:'#e5e7eb' }} />
      </div>
      <button onClick={() => setScreen('register')}
        style={{ width:'100%', padding:'.75rem', background:'#f9fafb', border:'1.5px solid #e5e7eb', borderRadius:'.5rem', cursor:'pointer', color:'#374151', fontWeight:600, fontSize:'.95rem' }}>
        ✍️ Solicitar acceso al sistema
      </button>

      {/* Legend */}
      <div style={{ marginTop:'1.5rem', borderTop:'1px solid #f3f4f6', paddingTop:'1.25rem' }}>
        <p style={{ fontSize:'.72rem', color:'#9ca3af', textAlign:'center', marginBottom:'.75rem', textTransform:'uppercase', letterSpacing:'.05em' }}>Niveles de acceso</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.5rem' }}>
          {Object.entries(ROLES).map(([key, {label, icon, color}]) => (
            <div key={key} style={{ border:`1.5px solid ${color}33`, borderRadius:'.4rem', padding:'.4rem .6rem', display:'flex', alignItems:'center', gap:'.4rem' }}>
              <span>{icon}</span>
              <span style={{ color, fontWeight:600, fontSize:'.75rem' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div></div>
  );
}
