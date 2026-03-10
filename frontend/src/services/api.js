import axios from 'axios';

// Configurar la URL base de la API
// En desarrollo: http://localhost:8000
// En producción: cambiar a la URL de tu servidor
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ==================== USUARIOS ====================

export const getUsers = async () => {
  const response = await api.get('/api/users/');
  return response.data;
};

export const getUser = async (telegramId) => {
  const response = await api.get(`/api/users/${telegramId}`);
  return response.data;
};

export const createUser = async (userData) => {
  const response = await api.post('/api/users/', userData);
  return response.data;
};

export const updateUserRole = async (telegramId, role) => {
  const response = await api.put(`/api/users/${telegramId}/role`, null, {
    params: { role }
  });
  return response.data;
};

// ==================== DÍAS ====================

export const getDays = async (limit = 30) => {
  const response = await api.get('/api/days/', { params: { limit } });
  return response.data;
};

export const getDay = async (dayDate) => {
  const response = await api.get(`/api/days/${dayDate}`);
  return response.data;
};

export const closeDay = async (dayDate, telegramId) => {
  const response = await api.post(`/api/days/${dayDate}/close`, null, {
    params: { telegram_id: telegramId }
  });
  return response.data;
};

export const reopenDay = async (dayDate) => {
  const response = await api.post(`/api/days/${dayDate}/reopen`);
  return response.data;
};

// ==================== TAREAS ====================

export const getTasks = async (filters = {}) => {
  const response = await api.get('/api/tasks/', { params: filters });
  return response.data;
};

export const getTask = async (taskId) => {
  const response = await api.get(`/api/tasks/${taskId}`);
  return response.data;
};

export const createTask = async (taskData, telegramId) => {
  const response = await api.post('/api/tasks/', taskData, {
    params: { telegram_id: telegramId }
  });
  return response.data;
};

export const updateTask = async (taskId, taskData) => {
  const response = await api.put(`/api/tasks/${taskId}`, taskData);
  return response.data;
};

export const deleteTask = async (taskId) => {
  const response = await api.delete(`/api/tasks/${taskId}`);
  return response.data;
};

export const addTaskMember = async (taskId, telegramId) => {
  const response = await api.post(`/api/tasks/${taskId}/members/${telegramId}`);
  return response.data;
};

export const removeTaskMember = async (taskId, telegramId) => {
  const response = await api.delete(`/api/tasks/${taskId}/members/${telegramId}`);
  return response.data;
};

// ==================== REGISTROS DE TRABAJO ====================

export const getWorkLogs = async (filters = {}) => {
  const response = await api.get('/api/worklogs/', { params: filters });
  return response.data;
};

export const createWorkLog = async (workLogData) => {
  const response = await api.post('/api/worklogs/', workLogData);
  return response.data;
};

export const deleteWorkLog = async (workLogId) => {
  const response = await api.delete(`/api/worklogs/${workLogId}`);
  return response.data;
};

// ==================== ESTADÍSTICAS ====================

export const getTodayStats = async () => {
  const response = await api.get('/api/stats/today');
  return response.data;
};

export const getUserStats = async (telegramId, days = 7) => {
  const response = await api.get(`/api/stats/user/${telegramId}`, {
    params: { days }
  });
  return response.data;
};

export default api;
