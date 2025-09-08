import { buildSync } from '../../sync';
import { createStore } from 'zustand';
import { atomFamily } from 'jotai/utils';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import {
  isMainThread,
  parentPort,
  Worker,
  workerData,
} from 'node:worker_threads';
import { z } from 'zod';
import { buildStandard } from '../../standard';
import { proxy, subscribe as subscribeValtio } from 'valtio';
import { atom, createStore as createJotaiStore } from 'jotai/vanilla';
import { configure as mobxConfigure } from 'mobx';
import { observable, runInAction, autorun } from 'mobx';

const ITERATIONS = 10_000_000;
const KEYS_LIMIT = 100;

// Observability sink that V8 can't fold away cheaply.
const bh = new Int32Array(new SharedArrayBuffer(4));
function consume(x: any) {
  // coerce to int but still observe the structure
  const n = x && typeof x === 'object' && typeof x.v === 'number' ? x.v : 0;
  Atomics.add(bh, 0, n | 0); // side effect across threads
}

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
    await sleep();
    global.gc();
    await sleep();
    global.gc();
    const now = process.memoryUsage();
    if (Math.abs(now.heapUsed - last) < epsilon) return now;
    last = now.heapUsed;
  }
  return process.memoryUsage();
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
    case 'raw object - dynamic key': {
      const store: Record<string, any> = {};
      for (let i = 0; i < iterations; i++) {
        const key = `key:${i % KEYS_LIMIT}`;
        store[key] = { v: i };
        consume(store[key]);
      }
      break;
    }
    case 'raw Map - dynamic key': {
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
      const blastore = buildSync({
        store: {
          setItem: (key, val) => {
            store[key] = val;
          },
          getItem: (key) => store[key],
          removeItem: (key) => {
            delete store[key];
          },
        },
        validate: {
          key: (v) =>
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
    case 'blastore - dynamic key': {
      let store: Record<string, any> = {};
      const blastore = buildSync({
        store: {
          setItem: (key, val) => {
            store[key] = val;
          },
          getItem: (key) => store[key],
          removeItem: (key) => {
            delete store[key];
          },
        },
        validate: {
          'key:${id}': (v: unknown) =>
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
    case 'blastore - dynamic key; mixed key operations': {
      let store: Record<string, any> = {};
      const blastore = buildSync({
        store: {
          setItem: (key, val) => {
            store[key] = val;
          },
          getItem: (key) => store[key],
          removeItem: (key) => {
            delete store[key];
          },
        },
        validate: {
          'key:${id}': (v: unknown) =>
            v === undefined || typeof v === 'object' ? v : new Error('invalid'),
        },
        validateOnSet: true,
      });
      for (let i = 0; i < iterations; i += 2) {
        const options1 = { variables: { id: String(i % KEYS_LIMIT) } };
        const options2 = { variables: { id: String((i + 1) % KEYS_LIMIT) } };
        blastore.set('key:${id}', { v: i }, options1);
        blastore.set('key:${id}', { v: i + 1 }, options2);
        consume(blastore.get('key:${id}', null, options1));
        consume(blastore.get('key:${id}', null, options2));
      }
      break;
    }
    case 'blastore - precompiled key': {
      let store: Record<string, any> = {};
      const blastore = buildSync({
        store: {
          setItem: (key, val) => {
            store[key] = val;
          },
          getItem: (key) => store[key],
          removeItem: (key) => {
            delete store[key];
          },
        },
        validate: {
          'key:${id}': (v) =>
            v === undefined || typeof v === 'object' ? v : new Error('invalid'),
        },
        validateOnSet: true,
      });
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
    case 'standard blastore - simple key': {
      let store: Record<string, any> = {};
      const blastore = buildStandard({
        store: {
          setItem: (key, val) => {
            store[key] = val;
          },
          getItem: (key) => store[key],
          removeItem: (key) => {
            delete store[key];
          },
        },
        validate: {
          key: z.union([z.null(), z.object({ v: z.number() })]),
        },
        keyMode: { key: 'sync' },
        validateOnSet: true,
      });
      for (let i = 0; i < iterations; i++) {
        blastore.set('key', { v: i });
        consume(blastore.get('key', null));
      }
      break;
    }
    case 'standard blastore - dynamic key': {
      let store: Record<string, any> = {};
      const blastore = buildStandard({
        store: {
          setItem: (key, val) => {
            store[key] = val;
          },
          getItem: (key) => store[key],
          removeItem: (key) => {
            delete store[key];
          },
        },
        validate: {
          'key:${id}': z.union([z.null(), z.object({ v: z.number() })]),
        },
        keyMode: {
          'key:${id}': 'sync',
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
    case 'standard blastore - dynamic key; mixed key operations': {
      let store: Record<string, any> = {};
      const blastore = buildStandard({
        store: {
          setItem: (key, val) => {
            store[key] = val;
          },
          getItem: (key) => store[key],
          removeItem: (key) => {
            delete store[key];
          },
        },
        validate: {
          'key:${id}': z.union([z.null(), z.object({ v: z.number() })]),
        },
        keyMode: {
          'key:${id}': 'sync',
        },
        validateOnSet: true,
      });
      for (let i = 0; i < iterations; i += 2) {
        const options1 = { variables: { id: String(i % KEYS_LIMIT) } };
        const options2 = { variables: { id: String((i + 1) % KEYS_LIMIT) } };
        blastore.set('key:${id}', { v: i }, options1);
        blastore.set('key:${id}', { v: i + 1 }, options2);
        consume(blastore.get('key:${id}', null, options1));
        consume(blastore.get('key:${id}', null, options2));
      }
      break;
    }
    case 'standard blastore - precompiled key': {
      let store: Record<string, any> = {};
      const blastore = buildStandard({
        store: {
          setItem: (key, val) => {
            store[key] = val;
          },
          getItem: (key) => store[key],
          removeItem: (key) => {
            delete store[key];
          },
        },
        validate: {
          'key:${id}': z.union([z.null(), z.object({ v: z.number() })]),
        },
        keyMode: { 'key:${id}': 'sync' },
        validateOnSet: true,
      });
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
    case 'zustand - dynamic key': {
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
    case 'valtio - dynamic key': {
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
    case 'jotai - dynamic key': {
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
    case 'redux-toolkit - dynamic key': {
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
    case 'mobx - dynamic key': {
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
    // ---------- BLOK: BLASTORE VARIANTS ----------
    case 'blastore - simple key; no runtime validation': {
      let store: Record<string, any> = {};
      const blastore = buildSync({
        store: {
          setItem: (key, val) => {
            store[key] = val;
          },
          getItem: (key) => store[key],
          removeItem: (key) => {
            delete store[key];
          },
        },
        validate: { key: (v: any) => v }, // no-op
        validateOnSet: false,
        validateOnGet: false,
      });
      for (let i = 0; i < iterations; i++) {
        blastore.set('key', { v: i });
        consume(blastore.get('key', null));
      }
      break;
    }

    case 'standard blastore - simple key; no runtime validation': {
      let store: Record<string, any> = {};
      const blastore = buildStandard({
        store: {
          setItem: (key, val) => {
            store[key] = val;
          },
          getItem: (key) => store[key],
          removeItem: (key) => {
            delete store[key];
          },
        },
        validate: { key: z.union([z.null(), z.object({ v: z.number() })]) },
        keyMode: { key: 'sync' },
        validateOnSet: false,
        validateOnGet: false,
      });
      for (let i = 0; i < iterations; i++) {
        blastore.set('key', { v: i });
        consume(blastore.get('key', null));
      }
      break;
    }

    // ---------- BLOK: RAW OBJECT WITH MINIMAL PUBSUB ----------
    case 'raw object - simple key; pub/sub': {
      const store: Record<string, any> = {};
      const listeners = new Set<() => void>();
      // simulate a few UI subscribers
      for (let s = 0; s < 5; s++) listeners.add(() => {});
      for (let i = 0; i < iterations; i++) {
        store.key = { v: i };
        // notify
        listeners.forEach((fn) => fn());
        consume(store.key);
      }
      break;
    }

    case 'raw object - dynamic key; pub/sub': {
      const store: Record<string, any> = {};
      const listeners: Array<Set<() => void>> = Array.from(
        { length: KEYS_LIMIT },
        () => new Set()
      );
      // a few subs per key
      for (let k = 0; k < KEYS_LIMIT; k++)
        for (let s = 0; s < (k < 10 ? 5 : 1); s++) listeners[k].add(() => {});
      for (let i = 0; i < iterations; i++) {
        const id = i % KEYS_LIMIT;
        const key = `key:${id}`;
        store[key] = { v: i };
        listeners[id].forEach((fn) => fn());
        consume(store[key]);
      }
      break;
    }

    // ---------- BLOK: ZUSTAND REAL-WORLD ----------
    case 'zustand - simple key; immutable': {
      const useStore = createStore((set, get) => ({
        values: {} as Record<string, any>,
        setValue: (k: string, v: any) =>
          set((state: any) => ({ values: { ...state.values, [k]: v } })),
        getValue: (k: string) => (get() as any).values[k],
      }));
      for (let i = 0; i < iterations; i++) {
        (useStore.getState() as any).setValue('key', { v: i });
        consume((useStore.getState() as any).getValue('key'));
      }
      break;
    }

    case 'zustand - simple key; immutable; pub/sub': {
      const useStore = createStore((set, get) => ({
        values: {} as Record<string, any>,
        setValue: (k: string, v: any) =>
          set((state: any) => ({ values: { ...state.values, [k]: v } })),
        getValue: (k: string) => (get() as any).values[k],
      }));
      // subscribe selector for the key
      const unsub = useStore.subscribe((st: any) => st.values['key']);
      for (let i = 0; i < iterations; i++) {
        (useStore.getState() as any).setValue('key', { v: i });
        consume((useStore.getState() as any).getValue('key'));
      }
      unsub();
      break;
    }

    case 'zustand - dynamic key; immutable': {
      const useStore = createStore((set, get) => ({
        values: {} as Record<string, any>,
        setValue: (k: string, v: any) =>
          set((state: any) => ({ values: { ...state.values, [k]: v } })),
        getValue: (k: string) => (get() as any).values[k],
      }));

      for (let i = 0; i < iterations; i++) {
        const key = `key:${i % KEYS_LIMIT}`;
        (useStore.getState() as any).setValue(key, { v: i });
        consume((useStore.getState() as any).getValue(key));
      }
      break;
    }

    case 'zustand - dynamic key; immutable; pub/sub': {
      const useStore = createStore((set, get) => ({
        values: {} as Record<string, any>,
        setValue: (k: string, v: any) =>
          set((state: any) => ({ values: { ...state.values, [k]: v } })),
        getValue: (k: string) => (get() as any).values[k],
      }));
      // few selector subscribers per hot key, one for cold keys
      const unsubs: Array<() => void> = [];
      for (let k = 0; k < KEYS_LIMIT; k++) {
        const kk = `key:${k}`;
        const count = k < 10 ? 5 : 1;
        for (let s = 0; s < count; s++)
          unsubs.push(useStore.subscribe((st: any) => st.values[kk]));
      }
      for (let i = 0; i < iterations; i++) {
        const key = `key:${i % KEYS_LIMIT}`;
        (useStore.getState() as any).setValue(key, { v: i });
        consume((useStore.getState() as any).getValue(key));
      }
      unsubs.forEach((u) => u());
      break;
    }

    // ---------- BLOK: REDUX TOOLKIT (NO DEFAULT MIDDLEWARE) ----------
    case 'redux-toolkit - simple key; no middleware; pub/sub': {
      const slice = createSlice({
        name: 'bench',
        initialState: { values: {} as Record<string, any> },
        reducers: {
          setValue(state, action: { payload: { k: string; v: any } }) {
            // immutable style
            state.values = {
              ...state.values,
              [action.payload.k]: action.payload.v,
            };
          },
        },
      });
      const store = configureStore({
        reducer: slice.reducer,
        middleware: (gDM) =>
          gDM({
            thunk: false,
            immutableCheck: false,
            serializableCheck: false,
          }),
      });
      // selector subscribe for the key
      let last: any;
      const unsub = store.subscribe(() => {
        const next = (store.getState() as any).values['key'];
        if (next !== last) last = next;
      });
      for (let i = 0; i < iterations; i++) {
        store.dispatch(slice.actions.setValue({ k: 'key', v: { v: i } }));
        consume((store.getState() as any).values['key']);
      }
      unsub();
      break;
    }

    case 'redux-toolkit - dynamic key; no middleware; pub/sub': {
      const slice = createSlice({
        name: 'bench',
        initialState: { values: {} as Record<string, any> },
        reducers: {
          setValue(state, action: { payload: { k: string; v: any } }) {
            state.values = {
              ...state.values,
              [action.payload.k]: action.payload.v,
            };
          },
        },
      });
      const store = configureStore({
        reducer: slice.reducer,
        middleware: (gDM) =>
          gDM({
            thunk: false,
            immutableCheck: false,
            serializableCheck: false,
          }),
      });
      // subscribers per key
      const unsubs: Array<() => void> = [];
      for (let k = 0; k < KEYS_LIMIT; k++) {
        const kk = `key:${k}`;
        let last: any;
        const count = k < 10 ? 5 : 1;
        for (let s = 0; s < count; s++) {
          unsubs.push(
            store.subscribe(() => {
              const next = (store.getState() as any).values[kk];
              if (next !== last) last = next;
            })
          );
        }
      }
      for (let i = 0; i < iterations; i++) {
        const k = `key:${i % KEYS_LIMIT}`;
        store.dispatch(slice.actions.setValue({ k, v: { v: i } }));
        consume((store.getState() as any).values[k]);
      }
      unsubs.forEach((u) => u());
      break;
    }

    // ---------- BLOK: MOBX (ACTIONS DISABLED VARIANT) ----------
    case 'mobx - simple key; enforceActions: never': {
      mobxConfigure({ enforceActions: 'never' });
      const state = observable.object<{ values: Record<string, any> }>({
        values: {},
      });
      for (let i = 0; i < iterations; i++) {
        state.values['key'] = { v: i }; // no runInAction
        consume(state.values['key']);
      }
      break;
    }

    case 'mobx - dynamic key; enforceActions: never': {
      mobxConfigure({ enforceActions: 'never' });
      const state = observable.object<{ values: Record<string, any> }>({
        values: {},
      });
      for (let i = 0; i < iterations; i++) {
        const k = `key:${i % KEYS_LIMIT}`;
        state.values[k] = { v: i };
        consume(state.values[k]);
      }
      break;
    }

    // ---------- BLOK: JOTAI WITH SUBSCRIPTIONS ----------
    case 'jotai - simple key; pub/sub': {
      const store = createJotaiStore();
      const keyAtom = atom<any>({ v: -1 });
      const unsubs: Array<() => void> = [];
      for (let s = 0; s < 5; s++) unsubs.push(store.sub(keyAtom, () => {}));
      for (let i = 0; i < iterations; i++) {
        store.set(keyAtom, { v: i });
        consume(store.get(keyAtom));
      }
      unsubs.forEach((u) => u());
      break;
    }

    case 'jotai - dynamic key; atomFamily; pub/sub': {
      const store = createJotaiStore();
      const family = atomFamily<string, any>((id) => atom<any>({ v: -1 }));
      const unsubs: Array<() => void> = [];
      for (let k = 0; k < KEYS_LIMIT; k++) {
        const a = family(String(k));
        const count = k < 10 ? 5 : 1;
        for (let s = 0; s < count; s++) unsubs.push(store.sub(a, () => {}));
      }
      for (let i = 0; i < iterations; i++) {
        const id = String(i % KEYS_LIMIT);
        const a = family(id);
        store.set(a, { v: i });
        consume(store.get(a));
      }
      unsubs.forEach((u) => u());
      break;
    }

    // ---------- BLOK: VALTIO WITH SUBSCRIPTIONS ----------
    case 'valtio - simple key; pub/sub': {
      const state = proxy<Record<string, any>>({});
      const unsubs: Array<() => void> = [];
      for (let s = 0; s < 5; s++)
        unsubs.push(subscribeValtio(state, () => {}, true));
      for (let i = 0; i < iterations; i++) {
        (state as any).key = { v: i };
        consume((state as any).key);
      }
      unsubs.forEach((u) => u());
      break;
    }

    case 'valtio - dynamic key; pub/sub': {
      const state = proxy<Record<string, any>>({});
      const unsubs: Array<() => void> = [];
      for (let k = 0; k < KEYS_LIMIT; k++) {
        const count = k < 10 ? 5 : 1;
        for (let s = 0; s < count; s++)
          unsubs.push(subscribeValtio(state, () => {}, true));
      }
      for (let i = 0; i < iterations; i++) {
        const key = `key:${i % KEYS_LIMIT}`;
        (state as any)[key] = { v: i };
        consume((state as any)[key]);
      }
      unsubs.forEach((u) => u());
      break;
    }

    // ---------------- BLASTORE (STANDARD) WITH SUBSCRIPTIONS ----------------

    case 'standard blastore - simple key; pub/sub': {
      let store: Record<string, any> = {};
      const blastore = buildStandard({
        store: {
          setItem: (key, val) => {
            store[key] = val;
          },
          getItem: (key) => store[key],
          removeItem: (key) => {
            delete store[key];
          },
        },
        validate: {
          key: z.union([z.null(), z.object({ v: z.number() })]),
        },
        keyMode: { key: 'sync' },
        validateOnSet: true,
        validateOnGet: false,
      });

      // simulate UI: a few subscribers for the key
      const unsubs: Array<() => void> = [];
      for (let s = 0; s < 5; s++) {
        unsubs.push(blastore.subscribe('key', () => {}));
      }

      for (let i = 0; i < iterations; i++) {
        blastore.set('key', { v: i });
        consume(blastore.get('key', null));
      }

      unsubs.forEach((u) => u());
      break;
    }

    case 'standard blastore - dynamic key; pub/sub': {
      let store: Record<string, any> = {};
      const blastore = buildStandard({
        store: {
          setItem: (key, val) => {
            store[key] = val;
          },
          getItem: (key) => store[key],
          removeItem: (key) => {
            delete store[key];
          },
        },
        validate: {
          'key:${id}': z.union([z.null(), z.object({ v: z.number() })]),
        },
        keyMode: { 'key:${id}': 'sync' },
        validateOnSet: true,
        validateOnGet: false,
      });

      // hot/cold-ish subscription mix: more subs on first 10 keys
      const HOT_KEYS = Math.min(10, KEYS_LIMIT);
      const unsubs: Array<() => void> = [];
      for (let k = 0; k < KEYS_LIMIT; k++) {
        const subCount = k < HOT_KEYS ? 5 : 1;
        for (let s = 0; s < subCount; s++) {
          unsubs.push(
            blastore.subscribe('key:${id}', () => {}, {
              variables: { id: String(k) },
            })
          );
        }
      }

      for (let i = 0; i < iterations; i++) {
        const id = String(i % KEYS_LIMIT);
        const options = { variables: { id } }; // optimised: reused object pattern
        blastore.set('key:${id}', { v: i }, options);
        consume(blastore.get('key:${id}', null, options));
      }

      unsubs.forEach((u) => u());
      break;
    }

    case 'standard blastore - precompiled key; pub/sub': {
      let store: Record<string, any> = {};
      const blastore = buildStandard({
        store: {
          setItem: (key, val) => {
            store[key] = val;
          },
          getItem: (key) => store[key],
          removeItem: (key) => {
            delete store[key];
          },
        },
        validate: {
          'key:${id}': z.union([z.null(), z.object({ v: z.number() })]),
        },
        keyMode: { 'key:${id}': 'sync' },
        validateOnSet: true,
        validateOnGet: false,
      });

      // prebuild APIs and attach per-key subscribers
      const apis = new Array<ReturnType<typeof blastore.buildKeyApi>>(
        KEYS_LIMIT
      );
      const unsubs: Array<() => void> = [];
      for (let i = 0; i < KEYS_LIMIT; i++) {
        const api = blastore.buildKeyApi('key:${id}', {
          variables: { id: String(i) },
        });
        apis[i] = api;
        const subCount = i < Math.min(10, KEYS_LIMIT) ? 5 : 1;
        for (let s = 0; s < subCount; s++) {
          unsubs.push(api.subscribe(() => {}));
        }
      }

      for (let i = 0; i < iterations; i++) {
        const api = apis[i % KEYS_LIMIT];
        api.set({ v: i });
        consume(api.get(null));
      }

      unsubs.forEach((u) => u());
      break;
    }

    // ---------------- OPTIONAL: NO-VALIDATION VARIANTS ----------------

    case 'standard blastore - simple key; pub/sub; no runtime validation': {
      let store: Record<string, any> = {};
      const blastore = buildStandard({
        store: {
          setItem: (key, val) => {
            store[key] = val;
          },
          getItem: (key) => store[key],
          removeItem: (key) => {
            delete store[key];
          },
        },
        validate: {
          key: z.union([z.null(), z.object({ v: z.number() })]),
        },
        keyMode: { key: 'sync' },
        validateOnSet: false,
        validateOnGet: false,
      });

      const unsubs: Array<() => void> = [];
      for (let s = 0; s < 5; s++) {
        unsubs.push(blastore.subscribe('key', () => {}));
      }

      for (let i = 0; i < iterations; i++) {
        blastore.set('key', { v: i });
        consume(blastore.get('key', null));
      }

      unsubs.forEach((u) => u());
      break;
    }

    case 'standard blastore - dynamic key; pub/sub; no runtime validation': {
      let store: Record<string, any> = {};
      const blastore = buildStandard({
        store: {
          setItem: (key, val) => {
            store[key] = val;
          },
          getItem: (key) => store[key],
          removeItem: (key) => {
            delete store[key];
          },
        },
        validate: {
          'key:${id}': z.union([z.null(), z.object({ v: z.number() })]),
        },
        keyMode: { 'key:${id}': 'sync' },
        validateOnSet: false,
        validateOnGet: false,
      });

      const HOT_KEYS = Math.min(10, KEYS_LIMIT);
      const unsubs: Array<() => void> = [];
      for (let k = 0; k < KEYS_LIMIT; k++) {
        const subCount = k < HOT_KEYS ? 5 : 1;
        for (let s = 0; s < subCount; s++) {
          unsubs.push(
            blastore.subscribe('key:${id}', () => {}, {
              variables: { id: String(k) },
            })
          );
        }
      }

      for (let i = 0; i < iterations; i++) {
        const id = String(i % KEYS_LIMIT);
        const options = { variables: { id } };
        blastore.set('key:${id}', { v: i }, options);
        consume(blastore.get('key:${id}', null, options));
      }

      unsubs.forEach((u) => u());
      break;
    }

    // ================== BLASTORE (STANDARD) • IMMUTABLE ADAPTER • SUBSCRIBED ==================

    case 'standard blastore - simple key; immutable adapter; pub/sub': {
      let db: Record<string, any> = {};
      const adapter = {
        setItem: (k: string, v: any) => {
          db = { ...db, [k]: v };
        },
        getItem: (k: string) => db[k],
        removeItem: (k: string) => {
          if (k in db) {
            const { [k]: _, ...rest } = db;
            db = rest;
          }
        },
      };

      const blastore = buildStandard({
        store: adapter,
        validate: { key: z.union([z.null(), z.object({ v: z.number() })]) },
        keyMode: { key: 'sync' },
        validateOnSet: true,
        validateOnGet: false,
      });

      const unsubs: Array<() => void> = [];
      for (let s = 0; s < 5; s++)
        unsubs.push(blastore.subscribe('key', () => {}));

      for (let i = 0; i < iterations; i++) {
        blastore.set('key', { v: i });
        consume(blastore.get('key', null));
      }

      unsubs.forEach((u) => u());
      break;
    }

    case 'standard blastore - dynamic key; immutable adapter; pub/sub': {
      let db: Record<string, any> = {};
      const adapter = {
        setItem: (k: string, v: any) => {
          db = { ...db, [k]: v };
        },
        getItem: (k: string) => db[k],
        removeItem: (k: string) => {
          if (k in db) {
            const { [k]: _, ...rest } = db;
            db = rest;
          }
        },
      };

      const blastore = buildStandard({
        store: adapter,
        validate: {
          'key:${id}': z.union([z.null(), z.object({ v: z.number() })]),
        },
        keyMode: { 'key:${id}': 'sync' },
        validateOnSet: true,
        validateOnGet: false,
      });

      const HOT = Math.min(10, KEYS_LIMIT);
      const unsubs: Array<() => void> = [];
      for (let k = 0; k < KEYS_LIMIT; k++) {
        const subCount = k < HOT ? 5 : 1;
        for (let s = 0; s < subCount; s++) {
          unsubs.push(
            blastore.subscribe('key:${id}', () => {}, {
              variables: { id: String(k) },
            })
          );
        }
      }

      for (let i = 0; i < iterations; i++) {
        const id = String(i % KEYS_LIMIT);
        const opts = { variables: { id } }; // reuse object → “optimised”
        blastore.set('key:${id}', { v: i }, opts);
        consume(blastore.get('key:${id}', null, opts));
      }

      unsubs.forEach((u) => u());
      break;
    }

    case 'standard blastore - precompiled key; immutable adapter; pub/sub': {
      let db: Record<string, any> = {};
      const adapter = {
        setItem: (k: string, v: any) => {
          db = { ...db, [k]: v };
        },
        getItem: (k: string) => db[k],
        removeItem: (k: string) => {
          if (k in db) {
            const { [k]: _, ...rest } = db;
            db = rest;
          }
        },
      };

      const blastore = buildStandard({
        store: adapter,
        validate: {
          'key:${id}': z.union([z.null(), z.object({ v: z.number() })]),
        },
        keyMode: { 'key:${id}': 'sync' },
        validateOnSet: true,
        validateOnGet: false,
      });

      const apis = new Array<ReturnType<typeof blastore.buildKeyApi>>(
        KEYS_LIMIT
      );
      const unsubs: Array<() => void> = [];
      for (let i = 0; i < KEYS_LIMIT; i++) {
        const api = blastore.buildKeyApi('key:${id}', {
          variables: { id: String(i) },
        });
        apis[i] = api;
        const subCount = i < Math.min(10, KEYS_LIMIT) ? 5 : 1;
        for (let s = 0; s < subCount; s++) unsubs.push(api.subscribe(() => {}));
      }

      for (let i = 0; i < iterations; i++) {
        const api = apis[i % KEYS_LIMIT];
        api.set({ v: i });
        consume(api.get(null));
      }

      unsubs.forEach((u) => u());
      break;
    }

    // ------------ Optional: same three but with validation disabled to isolate immutability cost ------------
    case 'standard blastore - simple key; immutable adapter; pub/sub; no runtime validation': {
      let db: Record<string, any> = {};
      const adapter = {
        setItem: (k: string, v: any) => {
          db = { ...db, [k]: v };
        },
        getItem: (k: string) => db[k],
        removeItem: (k: string) => {
          if (k in db) {
            const { [k]: _, ...rest } = db;
            db = rest;
          }
        },
      };

      const blastore = buildStandard({
        store: adapter,
        validate: { key: z.union([z.null(), z.object({ v: z.number() })]) },
        keyMode: { key: 'sync' },
        validateOnSet: false,
        validateOnGet: false,
      });

      const unsubs: Array<() => void> = [];
      for (let s = 0; s < 5; s++)
        unsubs.push(blastore.subscribe('key', () => {}));

      for (let i = 0; i < iterations; i++) {
        blastore.set('key', { v: i });
        consume(blastore.get('key', null));
      }

      unsubs.forEach((u) => u());
      break;
    }

    case 'standard blastore - dynamic key; immutable adapter; pub/sub; no runtime validation': {
      let db: Record<string, any> = {};
      const adapter = {
        setItem: (k: string, v: any) => {
          db = { ...db, [k]: v };
        },
        getItem: (k: string) => db[k],
        removeItem: (k: string) => {
          if (k in db) {
            const { [k]: _, ...rest } = db;
            db = rest;
          }
        },
      };

      const blastore = buildStandard({
        store: adapter,
        validate: {
          'key:${id}': z.union([z.null(), z.object({ v: z.number() })]),
        },
        keyMode: { 'key:${id}': 'sync' },
        validateOnSet: false,
        validateOnGet: false,
      });

      const HOT = Math.min(10, KEYS_LIMIT);
      const unsubs: Array<() => void> = [];
      for (let k = 0; k < KEYS_LIMIT; k++) {
        const subCount = k < HOT ? 5 : 1;
        for (let s = 0; s < subCount; s++) {
          unsubs.push(
            blastore.subscribe('key:${id}', () => {}, {
              variables: { id: String(k) },
            })
          );
        }
      }

      for (let i = 0; i < iterations; i++) {
        const id = String(i % KEYS_LIMIT);
        const opts = { variables: { id } };
        blastore.set('key:${id}', { v: i }, opts);
        consume(blastore.get('key:${id}', null, opts));
      }

      unsubs.forEach((u) => u());
      break;
    }

    // ================== BLASTORE (SYNC/custom validators) • IMMUTABLE ADAPTER ==================

    case 'blastore - simple key; immutable adapter': {
      let db: Record<string, any> = {};
      const adapter = {
        setItem: (k: string, v: any) => {
          db = { ...db, [k]: v };
        },
        getItem: (k: string) => db[k],
        removeItem: (k: string) => {
          if (k in db) {
            const { [k]: _, ...rest } = db;
            db = rest;
          }
        },
      };

      const blastore = buildSync({
        store: adapter,
        validate: {
          key: (v) =>
            v === undefined || typeof v === 'object' ? v : new Error('invalid'),
        },
        validateOnSet: true,
        validateOnGet: false,
      });

      for (let i = 0; i < iterations; i++) {
        blastore.set('key', { v: i });
        consume(blastore.get('key', null));
      }
      break;
    }

    case 'blastore - dynamic key; immutable adapter': {
      let db: Record<string, any> = {};
      const adapter = {
        setItem: (k: string, v: any) => {
          db = { ...db, [k]: v };
        },
        getItem: (k: string) => db[k],
        removeItem: (k: string) => {
          if (k in db) {
            const { [k]: _, ...rest } = db;
            db = rest;
          }
        },
      };

      const blastore = buildSync({
        store: adapter,
        validate: {
          'key:${id}': (v) =>
            v === undefined || typeof v === 'object' ? v : new Error('invalid'),
        },
        validateOnSet: true,
        validateOnGet: false,
      });

      for (let i = 0; i < iterations; i++) {
        const id = String(i % KEYS_LIMIT);
        const opts = { variables: { id } };
        blastore.set('key:${id}', { v: i }, opts);
        consume(blastore.get('key:${id}', null, opts));
      }
      break;
    }

    // ===== BLASTORE (STANDARD) • DYNAMIC KEY [not optimised] • IMMUTABLE ADAPTER =====
    case 'standard blastore - dynamic key; mixed key operations; immutable adapter': {
      let db: Record<string, any> = {};
      const adapter = {
        setItem: (k: string, v: any) => {
          db = { ...db, [k]: v };
        },
        getItem: (k: string) => db[k],
        removeItem: (k: string) => {
          if (k in db) {
            const { [k]: _, ...rest } = db;
            db = rest;
          }
        },
      };

      const blastore = buildStandard({
        store: adapter,
        validate: {
          'key:${id}': z.union([z.null(), z.object({ v: z.number() })]),
        },
        keyMode: {
          'key:${id}': 'sync',
        },
        validateOnSet: true,
        // keep validateOnGet default (same as your original)
      });

      for (let i = 0; i < iterations; i += 2) {
        // fresh options objects each time => not optimised
        const options1 = { variables: { id: String(i % KEYS_LIMIT) } };
        const options2 = { variables: { id: String((i + 1) % KEYS_LIMIT) } };
        blastore.set('key:${id}', { v: i }, options1);
        blastore.set('key:${id}', { v: i + 1 }, options2);
        consume(blastore.get('key:${id}', null, options1));
        consume(blastore.get('key:${id}', null, options2));
      }
      break;
    }

    // ===== BLASTORE (SYNC/custom validators) • DYNAMIC KEY [not optimised] • IMMUTABLE ADAPTER =====
    case 'blastore - dynamic key; mixed key operations; immutable adapter': {
      let db: Record<string, any> = {};
      const adapter = {
        setItem: (k: string, v: any) => {
          db = { ...db, [k]: v };
        },
        getItem: (k: string) => db[k],
        removeItem: (k: string) => {
          if (k in db) {
            const { [k]: _, ...rest } = db;
            db = rest;
          }
        },
      };

      const blastore = buildSync({
        store: adapter,
        validate: {
          'key:${id}': (v: unknown) =>
            v === undefined || typeof v === 'object' ? v : new Error('invalid'),
        },
        validateOnSet: true,
        // keep validateOnGet default (same as your original)
      });

      for (let i = 0; i < iterations; i += 2) {
        // fresh options objects each time => not optimised
        const options1 = { variables: { id: String(i % KEYS_LIMIT) } };
        const options2 = { variables: { id: String((i + 1) % KEYS_LIMIT) } };
        blastore.set('key:${id}', { v: i }, options1);
        blastore.set('key:${id}', { v: i + 1 }, options2);
        consume(blastore.get('key:${id}', null, options1));
        consume(blastore.get('key:${id}', null, options2));
      }
      break;
    }

    // ===================== MOBX • SUBSCRIBED VARIANTS =====================

    case 'mobx - simple key; pub/sub': {
      const state = observable.object<{ values: Record<string, any> }>({
        values: {},
      });

      // simulate UI: a few subscribers for the key
      const disposers: Array<() => void> = [];
      for (let s = 0; s < 5; s++) {
        // each autorun must touch the observable it depends on
        disposers.push(
          autorun(() => {
            // establish dependency on 'values.key'
            void state.values['key'];
            // no extra work in the subscriber; we just observe
          })
        );
      }

      for (let i = 0; i < iterations; i++) {
        runInAction(() => {
          state.values['key'] = { v: i };
        });
        // mirror your non-sub tests: read after write
        consume(state.values['key']);
      }

      disposers.forEach((d) => d());
      break;
    }

    case 'mobx - dynamic key; pub/sub': {
      const state = observable.object<{ values: Record<string, any> }>({
        values: {},
      });

      // hot/cold: more subscribers for first ~10 keys
      const HOT_KEYS = Math.min(10, KEYS_LIMIT);
      const disposers: Array<() => void> = [];
      for (let k = 0; k < KEYS_LIMIT; k++) {
        const key = `key:${k}`;
        const subCount = k < HOT_KEYS ? 5 : 1;
        for (let s = 0; s < subCount; s++) {
          disposers.push(
            autorun(() => {
              void state.values[key];
            })
          );
        }
      }

      for (let i = 0; i < iterations; i++) {
        const k = `key:${i % KEYS_LIMIT}`;
        runInAction(() => {
          state.values[k] = { v: i };
        });
        consume(state.values[k]);
      }

      disposers.forEach((d) => d());
      break;
    }

    // ==================== RAW MAP • PUB/SUB (simple & dynamic) ====================

    case 'raw Map - simple key; pub/sub': {
      const store = new Map<string, any>();
      const listeners = new Set<() => void>();
      for (let s = 0; s < 5; s++) listeners.add(() => {});
      for (let i = 0; i < iterations; i++) {
        store.set('key', { v: i });
        listeners.forEach((fn) => fn());
        consume(store.get('key'));
      }
      break;
    }

    case 'raw Map - dynamic key; pub/sub': {
      const store = new Map<string, any>();
      const listeners: Array<Set<() => void>> = Array.from(
        { length: KEYS_LIMIT },
        () => new Set()
      );
      for (let k = 0; k < KEYS_LIMIT; k++) {
        const subCount = k < 10 ? 5 : 1;
        for (let s = 0; s < subCount; s++) listeners[k].add(() => {});
      }
      for (let i = 0; i < iterations; i++) {
        const id = i % KEYS_LIMIT;
        const key = `key:${id}`;
        store.set(key, { v: i });
        listeners[id].forEach((fn) => fn());
        consume(store.get(key));
      }
      break;
    }

    // ==================== ZUSTAND • PUB/SUB (simple & dynamic, mutable) ====================

    case 'zustand - simple key; pub/sub': {
      const useStore = createStore((set, get) => ({
        values: {} as Record<string, any>,
        setValue: (k: string, v: any) =>
          set((state: any) => {
            state.values[k] = v;
            return state;
          }),
        getValue: (k: string) => (get() as any).values[k],
      }));
      const unsub = useStore.subscribe((st: any) => st.values['key']);
      for (let i = 0; i < iterations; i++) {
        (useStore.getState() as any).setValue('key', { v: i });
        consume((useStore.getState() as any).getValue('key'));
      }
      unsub();
      break;
    }

    case 'zustand - dynamic key; pub/sub': {
      const useStore = createStore((set, get) => ({
        values: {} as Record<string, any>,
        setValue: (k: string, v: any) =>
          set((state: any) => {
            state.values[k] = v;
            return state;
          }),
        getValue: (k: string) => (get() as any).values[k],
      }));
      const unsubs: Array<() => void> = [];
      for (let k = 0; k < KEYS_LIMIT; k++) {
        const kk = `key:${k}`;
        const count = k < 10 ? 5 : 1;
        for (let s = 0; s < count; s++)
          unsubs.push(useStore.subscribe((st: any) => st.values[kk]));
      }
      for (let i = 0; i < iterations; i++) {
        const key = `key:${i % KEYS_LIMIT}`;
        (useStore.getState() as any).setValue(key, { v: i });
        consume((useStore.getState() as any).getValue(key));
      }
      unsubs.forEach((u) => u());
      break;
    }

    // ==================== BLASTORE (SYNC/custom validators) • PUB/SUB ====================

    case 'blastore - simple key; pub/sub': {
      let store: Record<string, any> = {};
      const blastore = buildSync({
        store: {
          setItem: (k, v) => {
            store[k] = v;
          },
          getItem: (k) => store[k],
          removeItem: (k) => {
            delete store[k];
          },
        },
        validate: {
          key: (v) =>
            v === undefined || typeof v === 'object' ? v : new Error('invalid'),
        },
        validateOnSet: true,
        validateOnGet: false,
      });

      const unsubs: Array<() => void> = [];
      for (let s = 0; s < 5; s++)
        unsubs.push(blastore.subscribe('key', () => {}));

      for (let i = 0; i < iterations; i++) {
        blastore.set('key', { v: i });
        consume(blastore.get('key', null));
      }

      unsubs.forEach((u) => u());
      break;
    }

    case 'blastore - dynamic key; pub/sub': {
      let store: Record<string, any> = {};
      const blastore = buildSync({
        store: {
          setItem: (k, v) => {
            store[k] = v;
          },
          getItem: (k) => store[k],
          removeItem: (k) => {
            delete store[k];
          },
        },
        validate: {
          'key:${id}': (v) =>
            v === undefined || typeof v === 'object' ? v : new Error('invalid'),
        },
        validateOnSet: true,
        validateOnGet: false,
      });

      const HOT = Math.min(10, KEYS_LIMIT);
      const unsubs: Array<() => void> = [];
      for (let k = 0; k < KEYS_LIMIT; k++) {
        const count = k < HOT ? 5 : 1;
        for (let s = 0; s < count; s++)
          unsubs.push(
            blastore.subscribe('key:${id}', () => {}, {
              variables: { id: String(k) },
            })
          );
      }

      for (let i = 0; i < iterations; i++) {
        const id = String(i % KEYS_LIMIT);
        const opts = { variables: { id } };
        blastore.set('key:${id}', { v: i }, opts);
        consume(blastore.get('key:${id}', null, opts));
      }

      unsubs.forEach((u) => u());
      break;
    }

    case 'blastore - precompiled key; pub/sub': {
      let store: Record<string, any> = {};
      const blastore = buildSync({
        store: {
          setItem: (k, v) => {
            store[k] = v;
          },
          getItem: (k) => store[k],
          removeItem: (k) => {
            delete store[k];
          },
        },
        validate: {
          'key:${id}': (v) =>
            v === undefined || typeof v === 'object' ? v : new Error('invalid'),
        },
        validateOnSet: true,
        validateOnGet: false,
      });

      const apis = new Array<ReturnType<typeof blastore.buildKeyApi>>(
        KEYS_LIMIT
      );
      const unsubs: Array<() => void> = [];
      for (let i = 0; i < KEYS_LIMIT; i++) {
        const api = blastore.buildKeyApi('key:${id}', {
          variables: { id: String(i) },
        });
        apis[i] = api;
        const subCount = i < Math.min(10, KEYS_LIMIT) ? 5 : 1;
        for (let s = 0; s < subCount; s++) unsubs.push(api.subscribe(() => {}));
      }

      for (let i = 0; i < iterations; i++) {
        const api = apis[i % KEYS_LIMIT];
        api.set({ v: i });
        consume(api.get(null));
      }

      unsubs.forEach((u) => u());
      break;
    }

    // ==================== MOBX • IMMUTABLE STYLE (simple & dynamic) ====================

    case 'mobx - simple key; immutable': {
      const state = observable.object<{ values: Record<string, any> }>({
        values: {},
      });
      for (let i = 0; i < iterations; i++) {
        runInAction(() => {
          state.values = { ...state.values, ['key']: { v: i } };
        });
        consume(state.values['key']);
      }
      break;
    }

    case 'mobx - dynamic key; immutable': {
      const state = observable.object<{ values: Record<string, any> }>({
        values: {},
      });
      for (let i = 0; i < iterations; i++) {
        const k = `key:${i % KEYS_LIMIT}`;
        runInAction(() => {
          state.values = { ...state.values, [k]: { v: i } };
        });
        consume(state.values[k]);
      }
      break;
    }

    // ==================== JOTAI • IMMUTABLE STYLE (simple & dynamic) ====================

    case 'jotai - simple key; immutable': {
      const store = createJotaiStore();
      const valuesAtom = atom<Record<string, any>>({});
      for (let i = 0; i < iterations; i++) {
        store.set(valuesAtom, (prev) => ({ ...prev, key: { v: i } }));
        consume(store.get(valuesAtom)['key']);
      }
      break;
    }

    case 'jotai - dynamic key; immutable': {
      const store = createJotaiStore();
      const valuesAtom = atom<Record<string, any>>({});
      for (let i = 0; i < iterations; i++) {
        const k = `key:${i % KEYS_LIMIT}`;
        store.set(valuesAtom, (prev) => ({ ...prev, [k]: { v: i } }));
        consume(store.get(valuesAtom)[k]);
      }
      break;
    }

    // ==================== RAW OBJECT/MAP • IMMUTABLE • PUB/SUB ====================

    case 'raw object - simple key; immutable; pub/sub': {
      let db: Record<string, any> = {};
      const listeners = new Set<() => void>();
      for (let s = 0; s < 5; s++) listeners.add(() => {});
      for (let i = 0; i < iterations; i++) {
        db = { ...db, key: { v: i } };
        listeners.forEach((fn) => fn());
        consume(db.key);
      }
      break;
    }

    case 'raw map - simple key; immutable; pub/sub': {
      let m = new Map<string, any>();
      const listeners = new Set<() => void>();
      for (let s = 0; s < 5; s++) listeners.add(() => {});
      for (let i = 0; i < iterations; i++) {
        const next = new Map(m);
        next.set('key', { v: i });
        m = next;
        listeners.forEach((fn) => fn());
        consume(m.get('key'));
      }
      break;
    }

    case 'raw object - dynamic key; immutable; pub/sub': {
      let db: Record<string, any> = {};
      const listeners: Array<Set<() => void>> = Array.from(
        { length: KEYS_LIMIT },
        () => new Set()
      );
      for (let k = 0; k < KEYS_LIMIT; k++) {
        const cnt = k < 10 ? 5 : 1;
        for (let s = 0; s < cnt; s++) listeners[k].add(() => {});
      }
      for (let i = 0; i < iterations; i++) {
        const id = i % KEYS_LIMIT;
        const k = `key:${id}`;
        db = { ...db, [k]: { v: i } };
        listeners[id].forEach((fn) => fn());
        consume(db[k]);
      }
      break;
    }

    case 'raw map - dynamic key; immutable; pub/sub': {
      let m = new Map<string, any>();
      const listeners: Array<Set<() => void>> = Array.from(
        { length: KEYS_LIMIT },
        () => new Set()
      );
      for (let k = 0; k < KEYS_LIMIT; k++) {
        const cnt = k < 10 ? 5 : 1;
        for (let s = 0; s < cnt; s++) listeners[k].add(() => {});
      }
      for (let i = 0; i < iterations; i++) {
        const id = i % KEYS_LIMIT;
        const key = `key:${id}`;
        const next = new Map(m);
        next.set(key, { v: i });
        m = next;
        listeners[id].forEach((fn) => fn());
        consume(m.get(key));
      }
      break;
    }

    // ==================== BLASTORE (SYNC) • IMMUTABLE ADAPTER • PUB/SUB ====================

    case 'blastore - simple key; immutable adapter; pub/sub': {
      let db: Record<string, any> = {};
      const adapter = {
        setItem: (k: string, v: any) => {
          db = { ...db, [k]: v };
        },
        getItem: (k: string) => db[k],
        removeItem: (k: string) => {
          if (k in db) {
            const { [k]: _, ...rest } = db;
            db = rest;
          }
        },
      };
      const blastore = buildSync({
        store: adapter,
        validate: {
          key: (v) =>
            v === undefined || typeof v === 'object' ? v : new Error('invalid'),
        },
        validateOnSet: true,
        validateOnGet: false,
      });

      const unsubs: Array<() => void> = [];
      for (let s = 0; s < 5; s++)
        unsubs.push(blastore.subscribe('key', () => {}));

      for (let i = 0; i < iterations; i++) {
        blastore.set('key', { v: i });
        consume(blastore.get('key', null));
      }

      unsubs.forEach((u) => u());
      break;
    }

    case 'blastore - simple key; immutable adapter; pub/sub; no runtime validation': {
      let db: Record<string, any> = {};
      const adapter = {
        setItem: (k: string, v: any) => {
          db = { ...db, [k]: v };
        },
        getItem: (k: string) => db[k],
        removeItem: (k: string) => {
          if (k in db) {
            const { [k]: _, ...rest } = db;
            db = rest;
          }
        },
      };
      const blastore = buildSync({
        store: adapter,
        validate: { key: (v) => v },
        validateOnSet: false,
        validateOnGet: false,
      });

      const unsubs: Array<() => void> = [];
      for (let s = 0; s < 5; s++)
        unsubs.push(blastore.subscribe('key', () => {}));

      for (let i = 0; i < iterations; i++) {
        blastore.set('key', { v: i });
        consume(blastore.get('key', null));
      }

      unsubs.forEach((u) => u());
      break;
    }

    case 'blastore - dynamic key; immutable adapter; pub/sub': {
      let db: Record<string, any> = {};
      const adapter = {
        setItem: (k: string, v: any) => {
          db = { ...db, [k]: v };
        },
        getItem: (k: string) => db[k],
        removeItem: (k: string) => {
          if (k in db) {
            const { [k]: _, ...rest } = db;
            db = rest;
          }
        },
      };
      const blastore = buildSync({
        store: adapter,
        validate: {
          'key:${id}': (v) =>
            v === undefined || typeof v === 'object' ? v : new Error('invalid'),
        },
        validateOnSet: true,
        validateOnGet: false,
      });

      const HOT = Math.min(10, KEYS_LIMIT);
      const unsubs: Array<() => void> = [];
      for (let k = 0; k < KEYS_LIMIT; k++) {
        const count = k < HOT ? 5 : 1;
        for (let s = 0; s < count; s++)
          unsubs.push(
            blastore.subscribe('key:${id}', () => {}, {
              variables: { id: String(k) },
            })
          );
      }

      for (let i = 0; i < iterations; i++) {
        const id = String(i % KEYS_LIMIT);
        const opts = { variables: { id } };
        blastore.set('key:${id}', { v: i }, opts);
        consume(blastore.get('key:${id}', null, opts));
      }

      unsubs.forEach((u) => u());
      break;
    }

    case 'blastore - dynamic key; immutable adapter; pub/sub; no runtime validation': {
      let db: Record<string, any> = {};
      const adapter = {
        setItem: (k: string, v: any) => {
          db = { ...db, [k]: v };
        },
        getItem: (k: string) => db[k],
        removeItem: (k: string) => {
          if (k in db) {
            const { [k]: _, ...rest } = db;
            db = rest;
          }
        },
      };
      const blastore = buildSync({
        store: adapter,
        validate: { 'key:${id}': (v) => v },
        validateOnSet: false,
        validateOnGet: false,
      });

      const HOT = Math.min(10, KEYS_LIMIT);
      const unsubs: Array<() => void> = [];
      for (let k = 0; k < KEYS_LIMIT; k++) {
        const count = k < HOT ? 5 : 1;
        for (let s = 0; s < count; s++)
          unsubs.push(
            blastore.subscribe('key:${id}', () => {}, {
              variables: { id: String(k) },
            })
          );
      }

      for (let i = 0; i < iterations; i++) {
        const id = String(i % KEYS_LIMIT);
        const opts = { variables: { id } };
        blastore.set('key:${id}', { v: i }, opts);
        consume(blastore.get('key:${id}', null, opts));
      }

      unsubs.forEach((u) => u());
      break;
    }

    case 'blastore - precompiled key; immutable adapter; pub/sub': {
      let db: Record<string, any> = {};
      const adapter = {
        setItem: (k: string, v: any) => {
          db = { ...db, [k]: v };
        },
        getItem: (k: string) => db[k],
        removeItem: (k: string) => {
          if (k in db) {
            const { [k]: _, ...rest } = db;
            db = rest;
          }
        },
      };
      const blastore = buildSync({
        store: adapter,
        validate: {
          'key:${id}': (v) =>
            v === undefined || typeof v === 'object' ? v : new Error('invalid'),
        },
        validateOnSet: true,
        validateOnGet: false,
      });

      const apis = new Array<ReturnType<typeof blastore.buildKeyApi>>(
        KEYS_LIMIT
      );
      const unsubs: Array<() => void> = [];
      for (let i = 0; i < KEYS_LIMIT; i++) {
        const api = blastore.buildKeyApi('key:${id}', {
          variables: { id: String(i) },
        });
        apis[i] = api;
        const subCount = i < Math.min(10, KEYS_LIMIT) ? 5 : 1;
        for (let s = 0; s < subCount; s++) unsubs.push(api.subscribe(() => {}));
      }

      for (let i = 0; i < iterations; i++) {
        const api = apis[i % KEYS_LIMIT];
        api.set({ v: i });
        consume(api.get(null));
      }

      unsubs.forEach((u) => u());
      break;
    }

    // ==================== MOBX/JOTAI • IMMUTABLE • PUB/SUB ====================

    case 'mobx - simple key; immutable; pub/sub': {
      const state = observable.object<{ values: Record<string, any> }>({
        values: {},
      });
      const disposers: Array<() => void> = [];
      for (let s = 0; s < 5; s++) {
        disposers.push(
          autorun(() => {
            void state.values['key'];
          })
        );
      }
      for (let i = 0; i < iterations; i++) {
        runInAction(() => {
          state.values = { ...state.values, key: { v: i } };
        });
        consume(state.values['key']);
      }
      disposers.forEach((d) => d());
      break;
    }

    case 'mobx - dynamic key; immutable; pub/sub': {
      const state = observable.object<{ values: Record<string, any> }>({
        values: {},
      });
      const HOT = Math.min(10, KEYS_LIMIT);
      const disposers: Array<() => void> = [];
      for (let k = 0; k < KEYS_LIMIT; k++) {
        const key = `key:${k}`;
        const cnt = k < HOT ? 5 : 1;
        for (let s = 0; s < cnt; s++)
          disposers.push(
            autorun(() => {
              void state.values[key];
            })
          );
      }
      for (let i = 0; i < iterations; i++) {
        const k = `key:${i % KEYS_LIMIT}`;
        runInAction(() => {
          state.values = { ...state.values, [k]: { v: i } };
        });
        consume(state.values[k]);
      }
      disposers.forEach((d) => d());
      break;
    }

    case 'jotai - simple key; immutable; pub/sub': {
      const store = createJotaiStore();
      const valuesAtom = atom<Record<string, any>>({});
      const unsubs: Array<() => void> = [];
      for (let s = 0; s < 5; s++) unsubs.push(store.sub(valuesAtom, () => {}));
      for (let i = 0; i < iterations; i++) {
        store.set(valuesAtom, (prev) => ({ ...prev, key: { v: i } }));
        consume(store.get(valuesAtom)['key']);
      }
      unsubs.forEach((u) => u());
      break;
    }

    case 'jotai - dynamic key; immutable; pub/sub': {
      const store = createJotaiStore();
      const valuesAtom = atom<Record<string, any>>({});
      const HOT = Math.min(10, KEYS_LIMIT);
      const unsubs: Array<() => void> = [];
      for (let k = 0; k < KEYS_LIMIT; k++) {
        const cnt = k < HOT ? 5 : 1;
        for (let s = 0; s < cnt; s++)
          unsubs.push(store.sub(valuesAtom, () => {}));
      }
      for (let i = 0; i < iterations; i++) {
        const k = `key:${i % KEYS_LIMIT}`;
        store.set(valuesAtom, (prev) => ({ ...prev, [k]: { v: i } }));
        consume(store.get(valuesAtom)[k]);
      }
      unsubs.forEach((u) => u());
      break;
    }

    case 'blastore - dynamic key; no runtime validation': {
      let store: Record<string, any> = {};
      const blastore = buildSync({
        store: {
          setItem: (key, val) => {
            store[key] = val;
          },
          getItem: (key) => store[key],
          removeItem: (key) => {
            delete store[key];
          },
        },
        // pass-through validator and disable runtime checks
        validate: {
          'key:${id}': (v: any) => v,
        },
        validateOnSet: false,
        validateOnGet: false,
      });
      for (let i = 0; i < iterations; i++) {
        const id = String(i % KEYS_LIMIT);
        const options = { variables: { id } };
        blastore.set('key:${id}', { v: i }, options);
        consume(blastore.get('key:${id}', null, options));
      }
      break;
    }

    case 'standard blastore - dynamic key; no runtime validation': {
      let store: Record<string, any> = {};
      const blastore = buildStandard({
        store: {
          setItem: (key, val) => {
            store[key] = val;
          },
          getItem: (key) => store[key],
          removeItem: (key) => {
            delete store[key];
          },
        },
        validate: {
          'key:${id}': z.union([z.null(), z.object({ v: z.number() })]),
        },
        keyMode: { 'key:${id}': 'sync' },
        validateOnSet: false,
        validateOnGet: false,
      });
      for (let i = 0; i < iterations; i++) {
        const id = String(i % KEYS_LIMIT);
        const options = { variables: { id } };
        blastore.set('key:${id}', { v: i }, options);
        consume(blastore.get('key:${id}', null, options));
      }
      break;
    }

    case 'standard blastore - dynamic key; mixed key operations; no runtime validation': {
      let store: Record<string, any> = {};
      const blastore = buildStandard({
        store: {
          setItem: (key, val) => {
            store[key] = val;
          },
          getItem: (key) => store[key],
          removeItem: (key) => {
            delete store[key];
          },
        },
        validate: {
          'key:${id}': z.union([z.null(), z.object({ v: z.number() })]),
        },
        keyMode: { 'key:${id}': 'sync' },
        validateOnSet: false,
        validateOnGet: false,
      });
      for (let i = 0; i < iterations; i += 2) {
        const options1 = { variables: { id: String(i % KEYS_LIMIT) } };
        const options2 = { variables: { id: String((i + 1) % KEYS_LIMIT) } };
        blastore.set('key:${id}', { v: i }, options1);
        blastore.set('key:${id}', { v: i + 1 }, options2);
        consume(blastore.get('key:${id}', null, options1));
        consume(blastore.get('key:${id}', null, options2));
      }
      break;
    }

    default:
      throw new Error(`Unknown test: ${name}`);
  }
}

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
  'zustand - simple key',
  'blastore - simple key',
  'blastore - simple key; no runtime validation',
  'standard blastore - simple key',
  'standard blastore - simple key; no runtime validation',
  'valtio - simple key',
  'jotai - simple key',
  'mobx - simple key',
  'mobx - simple key; enforceActions: never',
  'redux-toolkit - simple key',

  'raw object - dynamic key',
  'raw Map - dynamic key',
  'zustand - dynamic key',
  'blastore - dynamic key',
  'blastore - dynamic key; mixed key operations',
  'blastore - dynamic key; no runtime validation',
  'blastore - precompiled key',
  'standard blastore - dynamic key',
  'standard blastore - dynamic key; no runtime validation',
  'standard blastore - dynamic key; mixed key operations',
  'standard blastore - dynamic key; mixed key operations; no runtime validation',
  'standard blastore - precompiled key',
  'valtio - dynamic key',
  'jotai - dynamic key',
  'mobx - dynamic key',
  'mobx - dynamic key; enforceActions: never',
  'redux-toolkit - dynamic key',

  'raw object - simple key; pub/sub',
  'raw Map - simple key; pub/sub',
  'zustand - simple key; pub/sub',
  'blastore - simple key; pub/sub',
  'standard blastore - simple key; pub/sub',
  'standard blastore - simple key; pub/sub; no runtime validation',
  'mobx - simple key; pub/sub',
  'valtio - simple key; pub/sub',
  'jotai - simple key; pub/sub',
  'redux-toolkit - simple key; no middleware; pub/sub',

  'raw object - dynamic key; pub/sub',
  'raw Map - dynamic key; pub/sub',
  'zustand - dynamic key; pub/sub',
  'blastore - dynamic key; pub/sub',
  'blastore - precompiled key; pub/sub',
  'standard blastore - dynamic key; pub/sub',
  'standard blastore - dynamic key; pub/sub; no runtime validation',
  'standard blastore - precompiled key; pub/sub',
  'mobx - dynamic key; pub/sub',
  'valtio - dynamic key; pub/sub',
  'jotai - dynamic key; atomFamily; pub/sub',
  'redux-toolkit - dynamic key; no middleware; pub/sub',

  'blastore - simple key; immutable adapter',
  'zustand - simple key; immutable',
  'mobx - simple key; immutable',
  'jotai - simple key; immutable',

  'zustand - dynamic key; immutable',
  'blastore - dynamic key; immutable adapter',
  'blastore - dynamic key; mixed key operations; immutable adapter',
  'standard blastore - dynamic key; mixed key operations; immutable adapter',
  'mobx - dynamic key; immutable',
  'jotai - dynamic key; immutable',

  'raw object - simple key; immutable; pub/sub',
  'raw map - simple key; immutable; pub/sub',
  'zustand - simple key; immutable; pub/sub',
  'blastore - simple key; immutable adapter; pub/sub',
  'blastore - simple key; immutable adapter; pub/sub; no runtime validation',
  'standard blastore - simple key; immutable adapter; pub/sub',
  'standard blastore - simple key; immutable adapter; pub/sub; no runtime validation',
  'mobx - simple key; immutable; pub/sub',
  'jotai - simple key; immutable; pub/sub',

  'raw object - dynamic key; immutable; pub/sub',
  'raw map - dynamic key; immutable; pub/sub',
  'zustand - dynamic key; immutable; pub/sub',
  'blastore - dynamic key; immutable adapter; pub/sub',
  'blastore - dynamic key; immutable adapter; pub/sub; no runtime validation',
  'blastore - precompiled key; immutable adapter; pub/sub',
  'standard blastore - dynamic key; immutable adapter; pub/sub',
  'standard blastore - dynamic key; immutable adapter; pub/sub; no runtime validation',
  'standard blastore - precompiled key; immutable adapter; pub/sub',
  'jotai - dynamic key; immutable; pub/sub',
  'mobx - dynamic key; immutable; pub/sub',
];

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
      await sleep();
    }
  })();
}
