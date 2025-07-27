import { performance } from 'perf_hooks';
import { buildAsync } from '../src/async';
import { proxy, snapshot } from 'valtio';
import { createStore } from 'zustand';

const ITERATIONS = 25_000;
const KEYS_LIMIT = 100;

function formatMemory(bytes: number) {
  return (bytes / 1024 / 1024).toFixed(3) + 'MB';
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function benchmark(name: string, fn: () => Promise<void>) {
  global.gc?.();
  const memStart = process.memoryUsage().heapUsed;
  const start = performance.now();

  await fn();

  const end = performance.now();
  const memEnd = process.memoryUsage().heapUsed;
  const delta = formatMemory(memEnd - memStart);
  const time = ((end - start) / ITERATIONS).toFixed(4);

  console.log(`${name.padEnd(60)} ${time}ms/op | +${delta}`);
}

async function runAll() {
  await benchmark('blastore (read/write mixed) - simple key', async () => {
    let store: Record<string, any> = {};
    const blastore = buildAsync(
      {
        validate: {
          key: async (v) =>
            v === null || (v && typeof v === 'object' && 'v' in v)
              ? v
              : new Error('invalid'),
        },
        serialize: {
          key: async (v) => v,
        },
        deserialize: {
          key: async (v) => v as any,
        },
      },
      {
        setItem: async (key, val) => {
          store[key] = val;
          await sleep(0);
        },
        getItem: async (key) => {
          await sleep(0);
          return store[key];
        },
        removeItem: async (key) => {
          delete store[key];
          await sleep(0);
        },
      }
    );

    for (let i = 0; i < ITERATIONS; i++) {
      await blastore.set('key', { v: i });
      const val = await blastore.get('key', null);
    }
  });

  await benchmark('valtio (read/write mixed) - simple key', async () => {
    const valtioState = proxy<Record<string, any>>({});

    for (let i = 0; i < ITERATIONS; i++) {
      valtioState.key = { v: i };
      await sleep(0);
      await sleep(0);
      const snap = snapshot(valtioState);
      const val = snap.key;
    }
  });

  await benchmark('zustand (read/write mixed) - simple key', async () => {
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
      await sleep(0);
      await sleep(0);
      const val = (useStore.getState() as any).getValue('key');
    }
  });

  await benchmark('blastore (read/write mixed)', async () => {
    let store: Record<string, any> = {};
    const blastore = buildAsync(
      {
        validate: {
          'key:${id}': async (v) =>
            v === null || (v && typeof v === 'object')
              ? v
              : new Error('invalid'),
        },
      },
      {
        setItem: async (key, val) => {
          store[key] = val;
          await sleep(0);
        },
        getItem: async (key) => {
          await sleep(0);
          return store[key];
        },
        removeItem: async (key) => {
          delete store[key];
          await sleep(0);
        },
      }
    );

    for (let i = 0; i < ITERATIONS; i++) {
      const id = i % KEYS_LIMIT;
      await blastore.set('key:${id}', { v: i }, { variables: [id] });
      const val = await blastore.get('key:${id}', null, { variables: [id] });
    }
  });

  await benchmark(
    'blastore (read/write mixed) -- precompiled key',
    async () => {
      let store: Record<string, any> = {};
      const blastore = buildAsync(
        {
          validate: {
            'key:${id}': async (v) =>
              v === null || (v && typeof v === 'object')
                ? v
                : new Error('invalid'),
          },
        },
        {
          setItem: async (key, val) => {
            store[key] = val;
            await sleep(0);
          },
          getItem: async (key) => {
            await sleep(0);
            return store[key];
          },
          removeItem: async (key) => {
            delete store[key];
            await sleep(0);
          },
        }
      );
      const apis = new Array<ReturnType<typeof blastore.buildKeyApi>>(
        KEYS_LIMIT
      );
      for (let i = 0; i < KEYS_LIMIT; i++) {
        apis[i] = blastore.buildKeyApi('key:${id}', [i]);
      }
      for (let i = 0; i < ITERATIONS; i++) {
        const id = i % KEYS_LIMIT;
        const api = apis[id];
        await api.set({ v: i });
        const val = await api.get(null);
      }
    }
  );

  await benchmark('valtio (read/write mixed)', async () => {
    const valtioState = proxy<Record<string, any>>({});

    for (let i = 0; i < ITERATIONS; i++) {
      const key = `key:${i % KEYS_LIMIT}`;
      valtioState[key] = { v: i };
      await sleep(0);
      await sleep(0);
      const snap = snapshot(valtioState);
      const val = snap[key];
    }
  });

  await benchmark('zustand (read/write mixed)', async () => {
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
      await sleep(0);
      await sleep(0);
      const val = (useStore.getState() as any).getValue(key);
    }
  });
}

runAll();
