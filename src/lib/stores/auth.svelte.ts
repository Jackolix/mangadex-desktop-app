import { login as apiLogin, logout as apiLogout, getMe, setTokens, clearTokens, refreshSession } from '$lib/api/mangadex';
import type { User } from '$lib/api/types';
import { Store } from '@tauri-apps/plugin-store';

const STORE_FILE = 'auth.json';
let store: Store | null = null;

async function getStore() {
  if (!store) store = await Store.load(STORE_FILE);
  return store;
}

// State
let user = $state<User | null>(null);
let loading = $state(false);
let error = $state<string | null>(null);
let initialized = $state(false);

// Load saved tokens on startup
async function init() {
  try {
    const s = await getStore();
    const access = await s.get<string>('access_token');
    const refresh = await s.get<string>('refresh_token');
    if (access && refresh) {
      setTokens(access, refresh);
      try {
        const me = await getMe();
        user = me;
      } catch {
        // Access token likely expired — try refreshing before giving up
        const refreshed = await tryRefresh();
        if (refreshed) {
          const me = await getMe();
          user = me;
        } else {
          throw new Error('Session refresh failed');
        }
      }
    }
  } catch {
    clearTokens();
    const s = await getStore();
    await s.delete('access_token');
    await s.delete('refresh_token');
  } finally {
    initialized = true;
  }
}

async function login(username: string, password: string, clientId: string, clientSecret: string) {
  loading = true;
  error = null;
  try {
    const res = await apiLogin(username, password, clientId, clientSecret);
    const s = await getStore();
    await s.set('access_token', res.access_token);
    await s.set('refresh_token', res.refresh_token);
    await s.set('client_id', clientId);
    await s.set('client_secret', clientSecret);
    await s.save();
    const me = await getMe();
    user = me;
    return true;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Login failed';
    return false;
  } finally {
    loading = false;
  }
}

async function logout() {
  await apiLogout();
  const s = await getStore();
  await s.delete('access_token');
  await s.delete('refresh_token');
  await s.delete('client_id');
  await s.delete('client_secret');
  await s.save();
  user = null;
}

// Auto-refresh tokens
async function tryRefresh() {
  try {
    const s = await getStore();
    const clientId = await s.get<string>('client_id');
    const clientSecret = await s.get<string>('client_secret');
    if (!clientId || !clientSecret) return false;
    const res = await refreshSession(clientId, clientSecret);
    await s.set('access_token', res.access_token);
    await s.set('refresh_token', res.refresh_token);
    await s.save();
    return true;
  } catch {
    return false;
  }
}

export const auth = {
  get user() { return user; },
  get loading() { return loading; },
  get error() { return error; },
  get initialized() { return initialized; },
  get isLoggedIn() { return !!user; },
  init,
  login,
  logout,
  tryRefresh,
  clearError() { error = null; },
};
