import { buildSync } from '../../sync';
import { proxy } from 'valtio';
import { createStore } from 'zustand/vanilla';
import { createStore as createJotaiStore, atom } from 'jotai/vanilla';
import { atomFamily } from 'jotai/utils';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { observable, runInAction } from 'mobx';

const KEYS_LIMIT = 100;
let sink = 0;
function consume(x: any) {
  const n = x && typeof x === 'object' && typeof x.v === 'number' ? x.v : 0;
  sink = (sink + (n | 0)) | 0;
  (self as any).__benchSink__ = sink;
}

function fmt(bytes: number) {
  return (bytes / 1024 / 1024).toFixed(3) + 'MB';
}
async function settle(epsilon = 256 * 1024, maxIters = 8) {
  const hasMem = (performance as any).memory?.usedJSHeapSize != null;
  let last = Number.POSITIVE_INFINITY;
  let cur = hasMem ? (performance as any).memory.usedJSHeapSize : null;
  for (let i = 0; i < maxIters && hasMem; i++) {
    await new Promise((r) => setTimeout(r, 0));
    const now = (performance as any).memory.usedJSHeapSize;
    if (Math.abs(now - last) < epsilon) {
      cur = now;
      break;
    }
    last = now;
    cur = now;
  }
  return cur;
}

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
        const k = `key:${i % KEYS_LIMIT}`;
        store[k] = { v: i };
        consume(store[k]);
      }
      break;
    }
    case 'raw Map': {
      const store = new Map<string, any>();
      for (let i = 0; i < iterations; i++) {
        const k = `key:${i % KEYS_LIMIT}`;
        store.set(k, { v: i });
        consume(store.get(k));
      }
      break;
    }
    case 'blastore - simple key': {
      let store: Record<string, any> = {};
      const blastore = buildSync({
        store: {
          setItem: (k: any, v: any) => {
            store[k] = v;
          },
          getItem: (k: any) => store[k],
          removeItem: (k: any) => {
            delete store[k];
          },
        },
        validate: {
          key: (v: any) =>
            v === undefined || typeof v === 'object' ? v : new Error('invalid'),
        },
        validateOnSet: true,
      });
      for (let i = 0; i < iterations; i++) {
        blastore.set('key', { v: i });
        consume(blastore.get('key', null));
      }
      break;
    }
    case 'blastore': {
      let store: Record<string, any> = {};
      const blastore = buildSync({
        store: {
          setItem: (k: any, v: any) => {
            store[k] = v;
          },
          getItem: (k: any) => store[k],
          removeItem: (k: any) => {
            delete store[k];
          },
        },
        validate: {
          'key:${id}': (v: any) =>
            v === undefined || typeof v === 'object' ? v : new Error('invalid'),
        },
        validateOnSet: true,
      });
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
      const blastore = buildSync({
        store: {
          setItem: (k: any, v: any) => {
            store[k] = v;
          },
          getItem: (k: any) => store[k],
          removeItem: (k: any) => {
            delete store[k];
          },
        },
        validate: {
          'key:${id}': (v: any) =>
            v === undefined || typeof v === 'object' ? v : new Error('invalid'),
        },
        validateOnSet: true,
      });
      const apis = new Array(KEYS_LIMIT);
      for (let i = 0; i < KEYS_LIMIT; i++) {
        apis[i] = blastore.buildKeyApi('key:${id}', {
          variables: { id: String(i) },
        });
      }
      for (let i = 0; i < iterations; i++) {
        const api = apis[i % KEYS_LIMIT];
        api.set({ v: i });
        consume(api.get(null));
      }
      break;
    }
    case 'zustand - simple key': {
      const useStore = createStore((set, get) => ({
        values: {} as Record<string, any>,
        setValue: (k: string, v: any) =>
          set((s: any) => ((s.values[k] = v), s)),
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
          set((s: any) => ((s.values[k] = v), s)),
        getValue: (k: string) => (get() as any).values[k],
      }));
      for (let i = 0; i < iterations; i++) {
        const k = `key:${i % KEYS_LIMIT}`;
        (useStore.getState() as any).setValue(k, { v: i });
        consume((useStore.getState() as any).getValue(k));
      }
      break;
    }
    case 'valtio - simple key': {
      const s = proxy<Record<string, any>>({});
      for (let i = 0; i < iterations; i++) {
        s.key = { v: i };
        consume(s.key);
      }
      break;
    }
    case 'valtio': {
      const s = proxy<Record<string, any>>({});
      for (let i = 0; i < iterations; i++) {
        const k = `key:${i % KEYS_LIMIT}`;
        s[k] = { v: i };
        consume(s[k]);
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
        const a = family(String(i % KEYS_LIMIT));
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

self.onmessage = async (e: MessageEvent) => {
  const { name, iterations } = e.data as { name: string; iterations: number };

  workload(name, 100_000); // warmup

  const before = await settle();
  const t0 = performance.now();
  workload(name, iterations);
  const t1 = performance.now();
  const after = await settle();

  const nsPerOp = ((t1 - t0) * 1e6) / iterations;
  const time = nsPerOp.toFixed(4) + 'ns/op';
  const delta = before != null && after != null ? fmt(after - before) : 'n/a';

  (self as any).postMessage({ name, time, delta, sink });
};
