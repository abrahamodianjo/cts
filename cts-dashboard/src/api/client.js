import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const TOKEN_KEY = 'cts_access_token';
const REFRESH_KEY = 'cts_refresh_token';
const USER_KEY = 'cts_user';

export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

export function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function storeSession({ access_token, refresh_token, user }) {
  localStorage.setItem(TOKEN_KEY, access_token);
  if (refresh_token) localStorage.setItem(REFRESH_KEY, refresh_token);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

export const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise = null;

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error('no_refresh_token');
  }
  const response = await axios.post(`${baseURL}/auth/refresh`, { refresh_token: refreshToken });
  const { access_token, refresh_token } = response.data;
  localStorage.setItem(TOKEN_KEY, access_token);
  localStorage.setItem(REFRESH_KEY, refresh_token);
  return access_token;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    const isAuthEndpoint = config?.url?.includes('/auth/login') || config?.url?.includes('/auth/refresh');

    if (response?.status === 401 && config && !config._retry && !isAuthEndpoint) {
      config._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null;
          });
        }
        const newAccessToken = await refreshPromise;
        config.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(config);
      } catch (refreshError) {
        clearSession();
        window.dispatchEvent(new Event('cts:session-expired'));
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
