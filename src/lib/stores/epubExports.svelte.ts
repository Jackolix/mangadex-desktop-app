export interface EpubExportJob {
  mangaId: string;
  step: string;
  pct: number;
}

interface QueuedExport {
  mangaId: string;
  mangaTitle: string;
  fn: (signal: AbortSignal) => Promise<void>;
}

let jobs = $state<Map<string, EpubExportJob>>(new Map());
let exportQueue = $state<Array<{ mangaId: string; mangaTitle: string }>>([]);

const pendingExports: QueuedExport[] = [];
let processingQueue = false;
let currentAbortController: AbortController | null = null;

async function processExportQueue() {
  if (processingQueue) return;
  processingQueue = true;

  while (pendingExports.length > 0) {
    const job = pendingExports[0];
    exportQueue = pendingExports.map((j) => ({ mangaId: j.mangaId, mangaTitle: j.mangaTitle }));

    currentAbortController = new AbortController();
    try {
      await job.fn(currentAbortController.signal);
    } catch (e) {
      console.error('[epub queue] job failed:', e);
    } finally {
      currentAbortController = null;
    }

    pendingExports.shift();
    exportQueue = pendingExports.map((j) => ({ mangaId: j.mangaId, mangaTitle: j.mangaTitle }));
  }

  processingQueue = false;
}

// Returns the queue position (0 = starting immediately, ≥1 = queued)
function enqueue(mangaId: string, mangaTitle: string, fn: (signal: AbortSignal) => Promise<void>): number {
  const position = pendingExports.length;
  pendingExports.push({ mangaId, mangaTitle, fn });
  exportQueue = pendingExports.map((j) => ({ mangaId: j.mangaId, mangaTitle: j.mangaTitle }));
  processExportQueue();
  return position;
}

function cancelCurrent() {
  currentAbortController?.abort();
}

function cancelQueued(mangaId: string) {
  const idx = pendingExports.findIndex((j, i) => i > 0 && j.mangaId === mangaId);
  if (idx !== -1) {
    pendingExports.splice(idx, 1);
    exportQueue = pendingExports.map((j) => ({ mangaId: j.mangaId, mangaTitle: j.mangaTitle }));
  }
}

export const epubExports = {
  get jobs() { return jobs; },
  get exportQueue() { return exportQueue; },

  start(mangaId: string) {
    const next = new Map(jobs);
    next.set(mangaId, { mangaId, step: 'Starting…', pct: 0 });
    jobs = next;
  },

  update(mangaId: string, step: string, pct: number) {
    if (!jobs.has(mangaId)) return;
    const next = new Map(jobs);
    next.set(mangaId, { mangaId, step, pct });
    jobs = next;
  },

  finish(mangaId: string) {
    const next = new Map(jobs);
    next.delete(mangaId);
    jobs = next;
  },

  get(mangaId: string): EpubExportJob | undefined {
    return jobs.get(mangaId);
  },

  isExporting(mangaId: string): boolean {
    return jobs.has(mangaId);
  },

  enqueue,
  cancelCurrent,
  cancelQueued,
};
