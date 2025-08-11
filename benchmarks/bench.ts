import { buildSync } from '../src/sync';
import { proxy, snapshot } from 'valtio';
import { createStore } from 'zustand';
import { createStore as createJotaiStore, atom } from 'jotai/vanilla';
import { atomFamily } from 'jotai/utils';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { observable, runInAction } from 'mobx';
import {
  isMainThread,
  parentPort,
  workerData,
  Worker,
} from 'node:worker_threads';

const ITERATIONS = 10_000_000;
const KEYS_LIMIT = 100;

// Observability sink that V8 can't fold away cheaply.
const bh = new Int32Array(new SharedArrayBuffer(4));
function consume(x: any) {
  // coerce to int but still observe the structure
  const n = x && typeof x === 'object' && typeof x.v === 'number' ? x.v : 0;
  Atomics.add(bh, 0, n | 0); // side effect across threads
}

// micro warmup for JIT
function warmup(fn: () => void, iters = 1) {
  for (let i = 0; i < iters; i++) fn();
}

function formatMemory(bytes: number) {
  return (bytes / 1024 / 1024).toFixed(3) + 'MB';
}

const sleep = (ms = 0) => new Promise((r) => setTimeout(r, ms));

async function settleAndMeasure(epsilon = 1024, maxIters = 8) {
  if (!global.gc) throw new Error('run with --expose-gc');
  let last = Number.POSITIVE_INFINITY;

  for (let i = 0; i < maxIters; i++) {
    await sleep(); // drain microtasks/nextTicks
    global.gc(); // full GC
    await sleep(); // allow FinalizationRegistry callbacks
    global.gc(); // compact after finalizers queued
    const now = process.memoryUsage();
    if (Math.abs(now.heapUsed - last) < epsilon) return now;
    last = now.heapUsed;
  }
  return process.memoryUsage();
}

// === Workloads ===============================================================
function workload(name: string, iterations: number) {
  switch (name) {
    case 'raw object - simple key': {
      const store: Record<string, any> = {};
      for (let i = 0; i < iterations; i++) {
        store.key = { v: i };
        consume(store.key);
      }
      break;
    }
    case 'raw Map - simple key': {
      const store = new Map<string, any>();
      for (let i = 0; i < iterations; i++) {
        store.set('key', { v: i });
        consume(store.get('key'));
      }
      break;
    }
    case 'raw object': {
      const store: Record<string, any> = {};
      for (let i = 0; i < iterations; i++) {
        const key = `key:${i % KEYS_LIMIT}`;
        store[key] = { v: i };
        consume(store[key]);
      }
      break;
    }
    case 'raw Map': {
      const store = new Map<string, any>();
      for (let i = 0; i < iterations; i++) {
        const key = `key:${i % KEYS_LIMIT}`;
        store.set(key, { v: i });
        consume(store.get(key));
      }
      break;
    }
    case 'blastore - simple key': {
      let store: Record<string, any> = {};
      const blastore = buildSync(
        {
          validate: {
            key: (v) =>
              v === undefined || typeof v === 'object'
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
      for (let i = 0; i < iterations; i++) {
        blastore.set('key', { v: i });
        consume(blastore.get('key', null));
      }
      break;
    }
    case 'blastore': {
      let store: Record<string, any> = {};
      const blastore = buildSync(
        {
          validate: {
            'key:${id}': (v: unknown) =>
              v === undefined || typeof v === 'object'
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
      for (let i = 0; i < iterations; i++) {
        const id = String(i % KEYS_LIMIT);
        const options = { variables: { id } };
        blastore.set('key:${id}', { v: i }, options);
        consume(blastore.get('key:${id}', null, options));
      }
      break;
    }
    case 'blastore -- precompiled key': {
      let store: Record<string, any> = {};
      const blastore = buildSync(
        {
          validate: {
            'key:${id}': (v) =>
              v === undefined || typeof v === 'object'
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
      const apis = new Array<ReturnType<typeof blastore.buildKeyApi>>(
        KEYS_LIMIT
      );
      for (let i = 0; i < KEYS_LIMIT; i++) {
        apis[i] = blastore.buildKeyApi('key:${id}', {
          variables: { id: String(i) },
        });
      }
      for (let i = 0; i < iterations; i++) {
        const id = i % KEYS_LIMIT;
        const api = apis[id];
        api.set({ v: i });
        consume(api.get(null));
      }
      break;
    }
    case 'zustand - simple key': {
      const useStore = createStore((set, get) => ({
        values: {} as Record<string, any>,
        setValue: (k: string, v: any) =>
          set((state: any) => {
            state.values[k] = v;
            return state;
          }),
        getValue: (k: string) => (get() as any).values[k],
      }));
      for (let i = 0; i < iterations; i++) {
        (useStore.getState() as any).setValue('key', { v: i });
        consume((useStore.getState() as any).getValue('key'));
      }
      break;
    }
    case 'zustand': {
      const useStore = createStore((set, get) => ({
        values: {} as Record<string, any>,
        setValue: (k: string, v: any) =>
          set((state: any) => {
            state.values[k] = v;
            return state;
          }),
        getValue: (k: string) => (get() as any).values[k],
      }));
      for (let i = 0; i < iterations; i++) {
        const key = `key:${i % KEYS_LIMIT}`;
        (useStore.getState() as any).setValue(key, { v: i });
        consume((useStore.getState() as any).getValue(key));
      }
      break;
    }
    case 'valtio - simple key': {
      const valtioState = proxy<Record<string, any>>({});
      for (let i = 0; i < iterations; i++) {
        (valtioState as any).key = { v: i };
        consume((valtioState as any).key);
      }
      break;
    }
    case 'valtio': {
      const valtioState = proxy<Record<string, any>>({});
      for (let i = 0; i < iterations; i++) {
        const key = `key:${i % KEYS_LIMIT}`;
        (valtioState as any)[key] = { v: i };
        consume((valtioState as any)[key]);
      }
      break;
    }
    case 'jotai - simple key': {
      const store = createJotaiStore();
      const keyAtom = atom<any>({ v: -1 });
      for (let i = 0; i < iterations; i++) {
        store.set(keyAtom, { v: i });
        consume(store.get(keyAtom));
      }
      break;
    }
    case 'jotai': {
      const store = createJotaiStore();
      const family = atomFamily<string, any>((id) => atom<any>({ v: -1 }));
      for (let i = 0; i < iterations; i++) {
        const id = String(i % KEYS_LIMIT);
        const a = family(id);
        store.set(a, { v: i });
        consume(store.get(a));
      }
      break;
    }
    case 'redux-toolkit - simple key': {
      const slice = createSlice({
        name: 'bench',
        initialState: { values: {} as Record<string, any> },
        reducers: {
          setValue(state, action: { payload: { k: string; v: any } }) {
            state.values[action.payload.k] = action.payload.v;
          },
        },
      });
      const store = configureStore({ reducer: slice.reducer });
      for (let i = 0; i < iterations; i++) {
        store.dispatch(slice.actions.setValue({ k: 'key', v: { v: i } }));
        consume((store.getState() as any).values['key']);
      }
      break;
    }
    case 'redux-toolkit': {
      const slice = createSlice({
        name: 'bench',
        initialState: { values: {} as Record<string, any> },
        reducers: {
          setValue(state, action: { payload: { k: string; v: any } }) {
            state.values[action.payload.k] = action.payload.v;
          },
        },
      });
      const store = configureStore({ reducer: slice.reducer });
      for (let i = 0; i < iterations; i++) {
        const k = `key:${i % KEYS_LIMIT}`;
        store.dispatch(slice.actions.setValue({ k, v: { v: i } }));
        consume((store.getState() as any).values[k]);
      }
      break;
    }
    case 'mobx - simple key': {
      const state = observable.object<{ values: Record<string, any> }>({
        values: {},
      });
      for (let i = 0; i < iterations; i++) {
        runInAction(() => {
          state.values['key'] = { v: i };
        });
        consume(state.values['key']);
      }
      break;
    }
    case 'mobx': {
      const state = observable.object<{ values: Record<string, any> }>({
        values: {},
      });
      for (let i = 0; i < iterations; i++) {
        const k = `key:${i % KEYS_LIMIT}`;
        runInAction(() => {
          state.values[k] = { v: i };
        });
        consume(state.values[k]);
      }
      break;
    }
    default:
      throw new Error(`Unknown test: ${name}`);
  }
}

// === Worker entry ============================================================
async function runOne(name: string) {
  await settleAndMeasure();

  workload(name, 100_000);

  const memStart = process.memoryUsage().heapUsed;
  const start = process.hrtime.bigint();

  workload(name, ITERATIONS);

  const end = process.hrtime.bigint();
  const memEnd = process.memoryUsage().heapUsed;

  const delta = formatMemory(memEnd - memStart);
  const timeMicroPerOp = (Number(end - start) / ITERATIONS).toFixed(4);

  return { name, time: timeMicroPerOp, delta };
}

const ALL_CASES = [
  'raw object - simple key',
  'raw Map - simple key',
  'raw object',
  'raw Map',
  'blastore - simple key',
  'blastore',
  'blastore -- precompiled key',
  'zustand - simple key',
  'zustand',
  'valtio - simple key',
  'valtio',
  'jotai - simple key',
  'jotai',
  'redux-toolkit - simple key',
  'redux-toolkit',
  'mobx - simple key',
  'mobx',
];

// Worker mode
if (!isMainThread) {
  (async () => {
    try {
      const res = await runOne(workerData.name as string);
      parentPort!.postMessage(res);
    } catch (e: any) {
      parentPort!.postMessage({ error: String(e?.stack || e) });
    }
  })();
} else {
  // Main thread: run sequentially
  (async () => {
    for (const name of ALL_CASES) {
      const worker = new Worker(__filename, { workerData: { name } });
      const result = await new Promise<{
        name: string;
        time?: string;
        delta?: string;
        error?: string;
      }>((resolve) => {
        worker.once('message', resolve);
        worker.once('error', (err) => resolve({ name, error: String(err) }));
        worker.once('exit', (code) => {
          if (code !== 0) resolve({ name, error: `Exited with code ${code}` });
        });
      });
      if (result.error) {
        console.log(`${name.padEnd(60)} ERROR: ${result.error}`);
      } else {
        console.log(
          `${name.padEnd(60)} ${result.time}ns/op | +${result.delta}`
        );
      }
      // small pause between workers to avoid back-to-back noise
      await sleep();
    }
  })();
}
