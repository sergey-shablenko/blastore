import { performance } from 'perf_hooks';
import { buildSync } from '../src/sync';
import { proxy, snapshot } from 'valtio';
import { createStore } from 'zustand';

const ITERATIONS = 10_000_000;
const KEYS_LIMIT = 100;

function formatMemory(bytes: number) {
  return (bytes / 1024 / 1024).toFixed(3) + 'MB';
}

function benchmark(name: string, fn: () => void) {
  global.gc?.();
  const memStart = process.memoryUsage().heapUsed;
  const start = performance.now();

  fn();

  const end = performance.now();
  const memEnd = process.memoryUsage().heapUsed;
  const delta = formatMemory(memEnd - memStart);
  const time = ((end - start) / ITERATIONS).toFixed(4);

  console.log(`${name.padEnd(60)} ${time}ms/op | +${delta}`);
}

function runAll() {
  benchmark('blastore (read/write mixed) - simple key', () => {
    let store: Record<string, any> = {};
    const blastore = buildSync(
      {
        validate: {
          key: (v) =>
            v === null || (v && typeof v === 'object' && 'v' in v)
              ? v
              : new Error('invalid'),
        },
        serialize: {
          key: (v) => v,
        },
        deserialize: {
          key: (v) => v as any,
        },
      },
      {
        setItem: (key, val) => {
          store[key] = val;
        },
        getItem: (key) => store[key],
        removeItem: (key) => {
          delete store[key];
        },
      }
    );

    for (let i = 0; i < ITERATIONS; i++) {
      blastore.set('key', { v: i });
      const val = blastore.get('key', null);
    }
  });

  benchmark('valtio (read/write mixed) - simple key', () => {
    const valtioState = proxy<Record<string, any>>({});

    for (let i = 0; i < ITERATIONS; i++) {
      valtioState.key = { v: i };
      const snap = snapshot(valtioState);
      const val = snap.key;
    }
  });

  benchmark('zustand (read/write mixed) - simple key', () => {
    const useStore = createStore((set, get) => ({
      values: {} as Record<string, any>,
      setValue: (k: string, v: any) =>
        set((state: any) => {
          state.values[k] = v;
          return state;
        }),
      getValue: (k: string) => (get() as any).values[k],
    }));

    for (let i = 0; i < ITERATIONS; i++) {
      (useStore.getState() as any).setValue('key', { v: i });
      const val = (useStore.getState() as any).getValue('key');
    }
  });

  benchmark('blastore (read/write mixed)', () => {
    let store: Record<string, any> = {};
    const blastore = buildSync(
      {
        validate: {
          'key:${id}': (v) =>
            v === null || (v && typeof v === 'object')
              ? v
              : new Error('invalid'),
        },
      },
      {
        setItem: (key, val) => {
          store[key] = val;
        },
        getItem: (key) => store[key],
        removeItem: (key) => {
          delete store[key];
        },
      }
    );

    for (let i = 0; i < ITERATIONS; i++) {
      const id = i % KEYS_LIMIT;
      blastore.set('key:${id}', { v: i }, { variables: [id] });
      const val = blastore.get('key:${id}', null, { variables: [id] });
    }
  });

  benchmark('blastore (read/write mixed) -- precompiled key', () => {
    let store: Record<string, any> = {};
    const blastore = buildSync(
      {
        validate: {
          'key:${id}': (v) =>
            v === null || (v && typeof v === 'object')
              ? v
              : new Error('invalid'),
        },
      },
      {
        setItem: (key, val) => {
          store[key] = val;
        },
        getItem: (key) => store[key],
        removeItem: (key) => {
          delete store[key];
        },
      }
    );
    const apis = new Array<ReturnType<typeof blastore.buildKeyApi>>(KEYS_LIMIT);
    for (let i = 0; i < KEYS_LIMIT; i++) {
      apis[i] = blastore.buildKeyApi('key:${id}', [i]);
    }
    for (let i = 0; i < ITERATIONS; i++) {
      const id = i % KEYS_LIMIT;
      const api = apis[id];
      api.set({ v: i });
      const val = api.get(null);
    }
  });

  benchmark('valtio (read/write mixed)', () => {
    const valtioState = proxy<Record<string, any>>({});

    for (let i = 0; i < ITERATIONS; i++) {
      const key = `key:${i % KEYS_LIMIT}`;
      valtioState[key] = { v: i };
      const snap = snapshot(valtioState);
      const val = snap[key];
    }
  });

  benchmark('zustand (read/write mixed)', () => {
    const useStore = createStore((set, get) => ({
      values: {} as Record<string, any>,
      setValue: (k: string, v: any) =>
        set((state: any) => {
          state.values[k] = v;
          return state;
        }),
      getValue: (k: string) => (get() as any).values[k],
    }));

    for (let i = 0; i < ITERATIONS; i++) {
      const key = `key:${i % KEYS_LIMIT}`;
      (useStore.getState() as any).setValue(key, { v: i });
      const val = (useStore.getState() as any).getValue(key);
    }
  });
}

runAll();
