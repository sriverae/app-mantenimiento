import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// ── Token storage ─────────────────────────────────────────────────────────────
export const tokenStorage = {
  getAccess  : () => localStorage.getItem('access_token'),
  getRefresh : () => localStorage.getItem('refresh_token'),
  getUser    : () => { const u = localStorage.getItem('current_user'); return u ? JSON.parse(u) : null; },
  set        : (access, refresh, user) => {
    localStorage.setItem('access_token',  access);
    localStorage.setItem('refresh_token', refresh);
    localStorage.setItem('current_user',  JSON.stringify(user));
  },
  clear      : () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('current_user');
  },
};

// ── Attach Bearer token ───────────────────────────────────────────────────────
api.interceptors.request.use(cfg => {
  const token = tokenStorage.getAccess();
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// ── Auto-refresh on 401 ───────────────────────────────────────────────────────
let refreshing = false;
let queue      = [];

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      const rt = tokenStorage.getRefresh();
      if (!rt) { tokenStorage.clear(); window.location.href = '/login'; return Promise.reject(err); }

      if (refreshing) {
        return new Promise((res, rej) => queue.push({ res, rej }))
          .then(token => { original.headers.Authorization = `Bearer ${token}`; return api(original); });
      }

      original._retry = true;
      refreshing      = true;
      try {
        const { data } = await axios.post(`${API_URL}/api/auth/refresh`, { refresh_token: rt });
        tokenStorage.set(data.access_token, data.refresh_token, data.user);
        queue.forEach(p => p.res(data.access_token));
        queue = [];
        original.headers.Authorization = `Bearer ${data.access_token}`;
        return api(original);
      } catch (e) {
        queue.forEach(p => p.rej(e));
        queue = [];
        tokenStorage.clear();
        window.location.href = '/login';
        return Promise.reject(e);
      } finally { refreshing = false; }
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login = async (username, password) => {
  const { data } = await api.post('/api/auth/login', { username, password });
  tokenStorage.set(data.access_token, data.refresh_token, data.user);
  return data.user;
};

export const logout = async () => {
  const refresh = tokenStorage.getRefresh();
  if (refresh) { try { await api.post('/api/auth/logout', { refresh_token: refresh }); } catch (_) {} }
  tokenStorage.clear();
};

export const register = async (data) => (await api.post('/api/auth/register', data)).data;
export const changePassword = async (currentPassword, newPassword) =>
  (await api.post('/api/auth/change-password', { current_password: currentPassword, new_password: newPassword })).data;
export const getMe = async () => (await api.get('/api/auth/me')).data;

// ── Users ─────────────────────────────────────────────────────────────────────
export const getUsers        = async (params = {}) => (await api.get('/api/users/', { params })).data;
export const getPendingUsers = async ()              => (await api.get('/api/users/pending')).data;
export const getUser         = async (id)            => (await api.get(`/api/users/${id}`)).data;
export const createUser      = async (data)          => (await api.post('/api/users/', data)).data;
export const updateUser      = async (id, data)      => (await api.put(`/api/users/${id}`, data)).data;
export const approveUser     = async (id, body)      => (await api.post(`/api/users/${id}/approve`, body)).data;

// ── Days ──────────────────────────────────────────────────────────────────────
export const getDays    = async (limit = 30)    => (await api.get('/api/days/', { params: { limit } })).data;
export const getDay     = async (d)             => (await api.get(`/api/days/${d}`)).data;
export const closeDay   = async (d)             => (await api.post(`/api/days/${d}/close`)).data;
export const reopenDay  = async (d)             => (await api.post(`/api/days/${d}/reopen`)).data;

// ── Tasks ─────────────────────────────────────────────────────────────────────
export const getTasks        = async (f = {})   => (await api.get('/api/tasks/', { params: f })).data;
export const getTask         = async (id)        => (await api.get(`/api/tasks/${id}`)).data;
export const createTask      = async (data)      => (await api.post('/api/tasks/', data)).data;
export const updateTask      = async (id, data)  => (await api.put(`/api/tasks/${id}`, data)).data;
export const deleteTask      = async (id)        => (await api.delete(`/api/tasks/${id}`)).data;
export const addTaskMember   = async (tid, uid)  => (await api.post(`/api/tasks/${tid}/members/${uid}`)).data;
export const removeTaskMember= async (tid, uid)  => (await api.delete(`/api/tasks/${tid}/members/${uid}`)).data;

// ── WorkLogs ──────────────────────────────────────────────────────────────────
export const getWorkLogs    = async (f = {})    => (await api.get('/api/worklogs/', { params: f })).data;
export const createWorkLog  = async (data)       => (await api.post('/api/worklogs/', data)).data;
export const deleteWorkLog  = async (id)         => (await api.delete(`/api/worklogs/${id}`)).data;

// ── Stats ─────────────────────────────────────────────────────────────────────
export const getTodayStats  = async ()           => (await api.get('/api/stats/today')).data;
export const getUserStats   = async (id, days=7) => (await api.get(`/api/stats/user/${id}`, { params: { days } })).data;

export default api;
export const publishTask = async (id) => (await api.post(`/api/tasks/${id}/publish`)).data;

// Task notes
export const getTaskNotes  = async (taskId)          => (await api.get(`/api/tasks/${taskId}/notes`)).data;
export const addTaskNote   = async (taskId, content) => (await api.post(`/api/tasks/${taskId}/notes`, { content })).data;
export const deleteTaskNote= async (taskId, noteId)  => (await api.delete(`/api/tasks/${taskId}/notes/${noteId}`)).data;

// Task parts (repuestos)
export const getTaskParts   = async (taskId)       => (await api.get(`/api/tasks/${taskId}/parts`)).data;
export const addTaskPart    = async (taskId, data)  => (await api.post(`/api/tasks/${taskId}/parts`, data)).data;
export const deleteTaskPart = async (taskId, partId)=> (await api.delete(`/api/tasks/${taskId}/parts/${partId}`)).data;

// Task photos
export const getTaskPhotos   = async (taskId) => (await api.get(`/api/tasks/${taskId}/photos`)).data;
export const uploadTaskPhoto = async (taskId, formData) =>
  (await api.post(`/api/tasks/${taskId}/photos`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
export const deleteTaskPhoto = async (taskId, photoId) => (await api.delete(`/api/tasks/${taskId}/photos/${photoId}`)).data;

// WorkLog update + reopen task
export const updateWorkLog = async (id, data) => (await api.put(`/api/worklogs/${id}`, data)).data;
export const reopenTask    = async (taskId)   => (await api.post(`/api/tasks/${taskId}/reopen`)).data;

// Reschedule
export const rescheduleTask    = async (taskId, data) => (await api.post(`/api/tasks/${taskId}/reschedule`, data)).data;
export const getReschedules    = async (taskId)       => (await api.get(`/api/tasks/${taskId}/reschedules`)).data;

// PDF Report
export const downloadTaskReport = async (taskId) => {
  const token = tokenStorage.getAccess();
  const base  = process.env.REACT_APP_API_URL || 'http://localhost:8000';
  const res   = await fetch(`${base}/api/tasks/${taskId}/report.pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Error generando informe');
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `informe_tarea_${taskId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};

// Reset password
export const resetUserPassword = async (userId) => (await api.post(`/api/users/${userId}/reset-password`)).data;

// Secret question / password recovery
export const getSecretQuestions  = async ()             => (await api.get('/api/auth/secret-questions')).data;
export const setSecretQuestion   = async (data)         => (await api.post('/api/auth/set-secret-question', data)).data;
export const getUserSecretQuestion = async (username)   => (await api.get(`/api/auth/secret-question/${username}`)).data;
export const recoverPassword     = async (data)         => (await api.post('/api/auth/recover-password', data)).data;
