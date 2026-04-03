import { Store } from '@tauri-apps/plugin-store';

const STORE_FILE = 'settings.json';
let store: Store | null = null;

async function getStore() {
  if (!store) store = await Store.load(STORE_FILE);
  return store;
}

export interface Settings {
  // Reading
  readerMode: 'paginated' | 'longstrip' | 'double';
  readingDirection: 'ltr' | 'rtl';
  fitMode: 'width' | 'height' | 'original' | 'smart';
  preloadPages: number;
  dataSaver: boolean;
  // Language
  contentLanguages: string[];
  preferredLanguage: string;
  // Content
  contentRating: string[];
  // Downloads
  downloadPath: string;
  autoDownload: boolean;
  // UI
  showChapterTitles: boolean;
  showContentRating: boolean;
  compactMode: boolean;
}

const defaults: Settings = {
  readerMode: 'paginated',
  readingDirection: 'ltr',
  fitMode: 'smart',
  preloadPages: 3,
  dataSaver: false,
  contentLanguages: ['en'],
  preferredLanguage: 'en',
  contentRating: ['safe', 'suggestive'],
  downloadPath: '',
  autoDownload: false,
  showChapterTitles: true,
  showContentRating: true,
  compactMode: false,
};

let settings = $state<Settings>({ ...defaults });
let initialized = $state(false);

async function init() {
  const s = await getStore();
  const saved = await s.get<Partial<Settings>>('settings');
  if (saved) {
    settings = { ...defaults, ...saved };
  }
  initialized = true;
}

async function update(partial: Partial<Settings>) {
  settings = { ...settings, ...partial };
  const s = await getStore();
  await s.set('settings', settings);
  await s.save();
}

async function reset() {
  settings = { ...defaults };
  const s = await getStore();
  await s.set('settings', settings);
  await s.save();
}

export const settingsStore = {
  get value() { return settings; },
  get initialized() { return initialized; },
  init,
  update,
  reset,
};
