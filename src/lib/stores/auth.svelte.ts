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
    const session = await s.get<string>('session');
    const refresh = await s.get<string>('refresh');
    if (session && refresh) {
      setTokens(session, refresh);
      const me = await getMe();
      user = me;
    }
  } catch {
    clearTokens();
    const s = await getStore();
    await s.delete('session');
    await s.delete('refresh');
  } finally {
    initialized = true;
  }
}

async function login(username: string, password: string) {
  loading = true;
  error = null;
  try {
    const res = await apiLogin(username, password);
    const s = await getStore();
    await s.set('session', res.token.session);
    await s.set('refresh', res.token.refresh);
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
  await s.delete('session');
  await s.delete('refresh');
  await s.save();
  user = null;
}

// Auto-refresh tokens
async function tryRefresh() {
  try {
    const s = await getStore();
    const refresh = await s.get<string>('refresh');
    if (!refresh) return false;
    const res = await refreshSession();
    await s.set('session', res.token.session);
    await s.set('refresh', res.token.refresh);
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
