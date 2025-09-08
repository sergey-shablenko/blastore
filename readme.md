# blastore

[![bundlejs](https://deno.bundlejs.com/badge?q=blastore/sync&treeshake=[*])](https://bundlejs.com/?q=blastore/sync&treeshake=[*])

**Blazingly fast, type-safe storage wrapper with minimal overhead.**
A minimal, high-performance storage wrapper for localStorage, memory, or any sync/async backend — with full TypeScript
type safety.

---

## The Problem with localStorage / AsyncStorage

- Most calls are inlined
- Value type is often assumed rather than validated
- Lots of copy&paste

```ts
// boolean
const value = !!localStorage.getItem('someFlag');
```

```ts
// string
const value = localStorage.getItem('someString') ?? 'defaultValue';

import { format } from 'date-fns';

const someISODateString =
  localStorage.getItem('someISODateString') ?? new Date().toISOString(); // valid ISO string is not guaranteed
format(someISODateString, 'dd-MM'); // can potentially crash
```

```ts
// objects
const value = JSON.parse(localStorage.getItem('someShape')); // common but unsafe pattern
```

<details>
<summary>More objects</summary>

```ts
// safe option but tons of boilerplate for a key
let value;
try {
  value = JSON.parse(localStorage.getItem('someShape'));
} catch (e) {
  value = {}; // defaultValue
}
```

```ts
// reusable helpers, no link between key and value, type safety is basically non existent
function getItem<T>(key, defaultValue: T): T {
  try {
    return JSON.parse(localStorage.getItem(key)) as T;
  } catch (e) {
    return defaultValue;
  }
}

function setItem(key: string, value: any) {
  try {
    return localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(e);
  }
}
```

```ts
// helper per key with proper validation
// commonly used for complex values
import z from 'zod';

const myShape = z.object({ key: z.string() });

function getSomeShape() {
  return (
    myShape.safeParse(JSON.parse(localStorage.getItem('someShape'))).data ?? {}
  );
}
```

</details>

With **Blastore**, you define your storage schema once, and get type-safe, validated access everywhere else.

```ts
import { buildStandard } from 'blastore/standard';
import z from 'zod';

const blastore = buildStandard({
  store: localStorage,
  validate: {
    boolean: z.boolean(),
    date: z.date(),
    myShape: z.union([z.null(), z.object({ key: z.string() })]),
  },
  keyMode: {
    boolean: 'sync',
    date: 'sync',
    myShape: 'sync',
  },
  serialize: {
    date: (v) => v.toISOString(),
    myShape: (v) => JSON.stringify(v),
  },
  deserialize: {
    date: (v) => new Date(String(v)),
    myShape: (v) => JSON.parse(String(v)),
  },
  validateOnGet: true, // to force runtime types on read
  validateOnSet: true, // to validate before write
});

const bool = blastore.get('boolean', false);
const date = blastore.get('date', new Date());
const shape = blastore.get('myShape', null);

blastore.set('boolean', false);
blastore.set('date', new Date());
blastore.set('myShape', { key: 'value' });
```

---

## Table of Contents

- [Why blastore?](#why-blastore)
- [Feature comparison](#feature-comparison)
- [Installation](#installation)
- [Overview](#overview)
- [Standard Mode](#standard-mode)
  - [Usage](#usage)
  - [Dynamic Keys](#dynamic-keys)
  - [Precompiled Keys](#precompiled-keys)
- [Async Mode](#async-mode)
- [Sync Mode](#sync-mode)
  - [With localStorage](#with-localstorage)
- [React integration](#react-integration)
- [Custom Backends](#custom-backends)
- [Advanced](#advanced)
  - [Error handling](#error-handling)
  - [Pub/sub](#pubsub)
  - [Performance guidelines](#performance-guidelines)
- [Performance Benchmarks](#performance-benchmarks)
- [License](#license)

---

## Why blastore?

- **Typed**: Static & runtime validation built-in
- **Blazingly fast**: Near-native `.get()` / `.set()` performance
- **Precompiled dynamic keys**: `user:${userId}`-style access with full type safety
- **Reactivity**: Subscribe to changes without external state libraries
- **Featherweight**: Zero dependencies, tree-shakable, minimal API
- **Pluggable** store: Works with `localStorage`, memory, or any custom (a|sync) backend

---

## Feature comparison

| Feature            | Blastore              | Zustand                  | Redux Toolkit            |
|--------------------|-----------------------|--------------------------|--------------------------|
| Type Safety        | ✅ Static + runtime    | Manual (TypeScript only) | Manual (TypeScript only) |
| Runtime Validation | ✅ Built-in            | Manual                   | Manual                   |
| Async Storage      | ✅ Built-in            | Plugin/manual            | Manual                   |
| Dynamic Keys       | ✅ Typed + precompiled | Manual patterns          | Manual patterns          |
| Pub/Sub            | ✅ Native              | ✅ (listeners)            | ✅ (store.subscribe)      |
| Immutability       | Optional (adapter)    | Optional                 | Default (Immer)          |
| Backends           | Pluggable             | In-memory only           | In-memory only           |

---

## Installation

```bash
npm i blastore
```

---

## Overview

**Blastore** uses a schema-first approach: you define validation, serialization, and deserialization for each key, and
it generates a fully typed API for interacting with your storage backend.

---

## Standard Mode

Use `buildStandard()` when you want to use [Standard Schema](https://github.com/standard-schema/standard-schema)

```ts
import { buildStandard } from 'blastore/standard';
import z from 'zod';

const blastore = buildStandard({
  store: localStorage,
  validate: {
    isOnboardingComplete: z.boolean(),
    'messageDraft:${threadId}': z.union([
      z.null(),
      z.object({
        content: z.string(),
      }),
    ]),
  },
  keyMode: {
    isOnboardingComplete: 'sync',
    'messageDraft:${threadId}': 'sync',
  },
  serialize: {
    'messageDraft:${threadId}': (v) => JSON.stringify(v),
  },
  deserialize: {
    'messageDraft:${threadId}': (v) => JSON.parse(String(v)),
  },
  validateOnSet: true,
  validateOnGet: true,
});
```

### Usage

```ts
blastore.set(
  'messageDraft:${threadId}',
  { content: 'hi' },
  { variables: { threadId: '123' } }
);
const val = blastore.get('messageDraft:${threadId}', null, {
  variables: { threadId: '123' },
});
```

### Dynamic Keys

```ts
blastore.set(
  'messageDraft:${threadId}',
  { content: 'text' },
  { variables: { threadId: '123' } }
);
const draft = blastore.get('messageDraft:${threadId}', null, {
  variables: { threadId: '123' },
});
```

### Precompiled Keys

```ts
const draftApi = blastore.buildKeyApi('messageDraft:${threadId}', {
  variables: { threadId: '123' },
});
draftApi.set({ content: 'hi' });
draftApi.get(null);
```

---

## Async Mode

Works the same way as `Standard` mode, just api is fully asynchronous and gives you flexibility to write custom
validators

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildAsync } from 'blastore/async';
import z from 'zod';

const messageSchema = z.union([
  z.null(),
  z.object({
    content: z.string(),
  }),
]);

const blastore = buildAsync(
  {
    validate: {
      isOnboardingComplete: async (v) =>
        typeof v === 'boolean' ? v : new Error('Invalid type'),
      'messageDraft:${threadId}': async (v) => {
        const res = await messageSchema.safeParseAsync(v);
        return res.success ? res.data : res.error;
      },
    },
    serialize: {
      'messageDraft:${threadId}': async (v) => JSON.stringify(v),
    },
    deserialize: {
      'messageDraft:${threadId}': async (v) => JSON.parse(String(v)),
    },
  },
  AsyncStorage
);
```

## Sync Mode

Works the same way as `Standard` mode, just api is fully synchronous and gives you flexibility to write custom
validators

```ts
import { buildSync } from 'blastore/sync';
import z from 'zod';

const messageSchema = z.union([
  z.null(),
  z.object({
    content: z.string(),
  }),
]);

const blastore = buildSync({
  store: localStorage,
  validate: {
    isOnboardingComplete: (v) =>
      typeof v === 'boolean' ? v : new Error('Invalid type'),
    'messageDraft:${threadId}': (v) => {
      const res = messageSchema.safeParse(v);
      return res.success ? res.data : res.error;
    },
  },
  serialize: {
    'messageDraft:${threadId}': (v) => JSON.stringify(v),
  },
  deserialize: {
    'messageDraft:${threadId}': (v) => JSON.parse(String(v)),
  },
  validateOnGet: true,
  validateOnSet: true,
});
```

### With localStorage

```ts
window.addEventListener('storage', (e) => {
  if (e.key) {
    if (e.newValue === null) {
      blastore.untypedEmit(e.key, 'remove');
    } else {
      const isEmitted = blastore.untypedEmit(e.key, e.newValue, {
        deserialize: true,
        validate: true,
      });
    }
  }
});
```

---

## React integration

```ts
import { useStandardStore } from 'blastore/use-standard-store';

const {
  isInitialised, // false by default, happens automatically
  value: isOnboardingComplete, // equals to provided defaultValue in this case `false` until initialised
  set: setIsOnboardingComplete,
  remove: removeIsOnboardingComplete,
} = useStandardStore(blastore, 'isOnboardingComplete', false);
```

```ts
import { useAsyncStore } from 'blastore/use-async-store';

const {
  isInitialised, // false by default, happens automatically
  value: isOnboardingComplete, // equals to provided defaultValue in this case `false` until initialised
  set: setIsOnboardingComplete,
  remove: removeIsOnboardingComplete,
} = useAsyncStore(blastore, 'isOnboardingComplete', false);
```

```ts
import { useSyncStore } from 'blastore/use-sync-store';

const {
  value: isOnboardingComplete,
  set: setIsOnboardingComplete,
  remove: removeIsOnboardingComplete,
} = useSyncStore(blastore, 'isOnboardingComplete', false);
```

## Custom backends

```ts
import { buildSync } from 'blastore/sync';

const myDb = {};
const customStore = {
  getItem: (k) => myDb[k],
  setItem: (k, v) => {
    myDb[k] = v;
  },
  removeItem: (k) => delete myDb[k],
};

const blastore = buildSync({
  store: customStore,
  validate: {
    isOnboardingComplete: (v) =>
      typeof v === 'boolean' ? v : new Error('Invalid type'),
  },
  validateOnGet: true,
  validateOnSet: true,
});
```

---

## Advanced

### Error handling

- `get` returns `defaultValue` when read failed (validation or some other issue)
- `set` returns false when operation failed and true otherwise
- `remove` returns false when operation failed and true otherwise

To get actual error you need to use `out` parameter in options for each of those functions
This is done to keep api monomorphic in hot paths, which significantly affects performance

```ts
const out = { error: undefined };
blastore.get('key', defaultValue, { out }); // sync
console.error(out.error);

await blastore.get('key', defaultValue, { out }); // async
console.error(out.error);

blastore.set('key', value, { out }); // sync
console.error(out.error);

await blastore.set('key', value, { out }); // async
console.error(out.error);
```

### Pub/sub

**Blastore** supports basic pub/sub.
There are two ways of emitting events.

First is when you emit using a key template, this way should be preferred as this method does not require key look
up, is faster and more efficient

```ts
const validate = true / false;
const emitted = blastore.emit('key{id}', 'action', value, {
  validate,
  variables: { id: '123' },
}); //sync
const asyncEmitted = await asyncBlastore.emit('key{id}', 'action', value, {
  validate,
  variables: { id: '123' },
}); //async
```

Second is when you emit using raw key from the storage. This method will attempt to match raw key to one of the
templates registered in **blastore** and if matched, will emit to subscribers of that template. It also supports passing
a raw value which can be deserialized before sending to subscribers.

Useful when you want to add support for cross tab localStorage changes or manually trigger changes when storage of your
choice is changed outside **blastore** scope, or anything like that

```ts
const validate = true / false;
const deserialize = true / false;
const emitted = blastore.untypedEmit('key123', 'action', value, {
  validate,
  deserialize,
}); //sync
const asyncEmitted = await asyncBlastore.untypedEmit(
  'key123',
  'action',
  value,
  {
    validate,
    deserialize,
  }
); //async
```

Same goes for subscriptions. You can either subscribe using key template or raw key.

In this case `.untypedSubscribe()` is more performant, but you will not have static typing to easily track which keys
are
used in the app.

From DX perspective it is better to use typed `.subscribe()`.

```ts
const unsub = blastore.subscribe(
  'key',
  (params) => {
    if (params.action === 'remove') {
      // reserved action type for when item is removed from storage
      // params.value is null
    } else if (params.action === 'set') {
      // reserved action type for when item is changed
      console.log(params.value);
    } else {
      // action in this case can be anything of your choice
      // this will only happen if you use emit events manually and provide custom action
      console.log(params.action, params.value);
    }
  },
  {
    variables: { id: '123' },
  }
);
const unsub1 = blastore.untypedSubscribe('key123', (params) => {
  if (params.action === 'remove') {
    // reserved action type for when item is removed from storage
    // params.value is null
  } else if (params.action === 'set') {
    // reserved action type for when item is changed
    console.log(params.value);
  } else {
    // action in this case can be anything of your choice
    // this will only happen if you use emit events manually and provide custom action
    console.log(params.action, params.value);
  }
});
```

---

### Performance Guidelines

Blastore itself is fast — but your choice of validators, serializers, and storage backend will affect performance.

For best performance in hot paths you should use precompiled keys and fast runtime validators (if
you opt in for runtime validation).

Dynamic keys have significant effect on performance (refer benchmarks section)

To reduce overhead of dynamic keys library uses cheap cache to memoise last key
To take advantage of this optimisation you should group operations by key

<details>
<summary>Example of optimised code</summary>

```ts
// constant reference to variables object
const opts1 = { variables: { id: '123' } } as const;
// overhead from building the key
blastore.get('key{id}', opts);
// no overhead, read from cache
blastore.set('key{id}', 'someVal', opts);
// no overhead, read from cache
blastore.get('key{id}', opts);

// constant reference to variables object
const opts2 = { variables: { id: '124' } } as const;
// overhead from building the key
blastore.get('key{id}', opts2);
// no overhead, read from cache
blastore.set('key{id}', 'someVal', opts2);
// no overhead, read from cache
blastore.get('key{id}', opts2);
```

</details>

<details>
<summary>Example of unoptimised code</summary>

```ts
// new object refence for "variables" in each call leads to cache miss
// overhead from building the key
blastore.get('key{id}', { variables: { id: '123' } });
// overhead from building the key
blastore.set('key{id}', 'someVal', { variables: { id: '123' } });
// overhead from building the key
blastore.get('key{id}', { variables: { id: '123' } });
```

```ts
// operations on keys are mixed
const opts1 = { variables: { id: '123' } } as const;
const opts2 = { variables: { id: '124' } } as const;

// overhead from building the key
blastore.get('key{id}', opts1);
// cache miss as it is different key -> overhead from building the key
blastore.get('key{id}', opts2);
// cache miss as it is different key -> overhead from building the key
blastore.set('key{id}', 'someVal', opts1);
// cache miss as it is different key -> overhead from building the key
blastore.set('key{id}', 'someVal', opts2);
// cache miss as it is different key -> overhead from building the key
blastore.get('key{id}', opts1);
// cache miss as it is different key -> overhead from building the key
blastore.get('key{id}', opts2);
```

</details>

Refer benchmarks sections for details on overhead

---

## Performance Benchmarks

> Hardware: CPU: Apple M2 Max; RAM 64GB

> **Synchronous mode**: NodeJS 22.12.0; 10M iterations 100 keys

> Node parameters `--expose-gc --no-warnings --initial-old-space-size=256 --max-old-space-size=256`

> ENV `NODE_ENV=production`

<details>
<summary>All results</summary>

| Library / Mode                                                                     | Time (`ns/op`) |
|------------------------------------------------------------------------------------|---------------:|
| raw object - simple key                                                            |          19.29 |
| raw Map - simple key                                                               |          24.95 |
| zustand - simple key                                                               |          22.55 |
| blastore - simple key                                                              |          33.40 |
| blastore - simple key; no runtime validation                                       |          31.12 |
| standard blastore - simple key                                                     |         153.13 |
| standard blastore - simple key; no runtime validation                              |          52.40 |
| Valtio - simple key                                                                |        1833.03 |
| Jotai - simple key                                                                 |        1659.45 |
| MobX - simple key                                                                  |        1389.72 |
| MobX - simple key; enforceActions: never                                           |        1338.77 |
| redux-toolkit - simple key                                                         |        1828.39 |
| raw object - dynamic key                                                           |          71.36 |
| raw Map - dynamic key                                                              |          66.18 |
| zustand - dynamic key                                                              |          81.39 |
| blastore - dynamic key                                                             |         120.39 |
| blastore - dynamic key; mixed key operations                                       |         184.00 |
| blastore - dynamic key; no runtime validation                                      |         118.96 |
| blastore - precompiled key                                                         |          46.16 |
| standard blastore - dynamic key                                                    |         244.19 |
| standard blastore - dynamic key; no runtime validation                             |         136.39 |
| standard blastore - dynamic key; mixed key operations                              |         304.52 |
| standard blastore - dynamic key; mixed key operations; no runtime validation       |         195.95 |
| standard blastore - precompiled key                                                |         157.64 |
| Valtio - dynamic key                                                               |        2028.92 |
| Jotai - dynamic key                                                                |        1667.62 |
| MobX - dynamic key                                                                 |        1856.50 |
| MobX - dynamic key; enforceActions: never                                          |        1785.68 |
| redux-toolkit - dynamic key                                                        |       27875.59 |
| raw object - simple key; pub/sub                                                   |          45.33 |
| raw Map - simple key; pub/sub                                                      |          53.35 |
| zustand - simple key; pub/sub                                                      |          22.39 |
| blastore - simple key; pub/sub                                                     |          41.17 |
| standard blastore - simple key; pub/sub                                            |         166.78 |
| standard blastore - simple key; pub/sub; no runtime validation                     |          61.42 |
| MobX - simple key; pub/sub                                                         |        2573.66 |
| Valtio - simple key; pub/sub                                                       |        1966.28 |
| Jotai - simple key; pub/sub                                                        |        1711.20 |
| redux-toolkit - simple key; no middleware; pub/sub                                 |        2964.48 |
| raw object - dynamic key; pub/sub                                                  |          81.98 |
| raw Map - dynamic key; pub/sub                                                     |          76.45 |
| zustand - dynamic key; pub/sub                                                     |          79.27 |
| blastore - dynamic key; pub/sub                                                    |         140.11 |
| blastore - precompiled key; pub/sub                                                |          60.82 |
| standard blastore - dynamic key; pub/sub                                           |         268.79 |
| standard blastore - dynamic key; pub/sub; no runtime validation                    |         159.96 |
| standard blastore - precompiled key; pub/sub                                       |         177.83 |
| MobX - dynamic key; pub/sub                                                        |        2441.41 |
| Valtio - dynamic key; pub/sub                                                      |        7119.10 |
| Jotai - dynamic key; atomFamily; pub/sub                                           |        1661.43 |
| redux-toolkit - dynamic key; no middleware; pub/sub                                |     1555156.37 |
| blastore - simple key; immutable adapter                                           |          84.44 |
| zustand - simple key; immutable                                                    |         134.10 |
| MobX - simple key; immutable                                                       |       19186.31 |
| Jotai - simple key; immutable                                                      |        1899.28 |
| zustand - dynamic key; immutable                                                   |        2519.27 |
| blastore - dynamic key; immutable adapter                                          |        2472.86 |
| blastore - dynamic key; mixed key operations; immutable adapter                    |        2506.91 |
| standard blastore - dynamic key; mixed key operations; immutable adapter           |        2595.50 |
| MobX - dynamic key; immutable                                                      |     2266365.27 |
| Jotai - dynamic key; immutable                                                     |       62046.49 |
| raw object - simple key; immutable; pub/sub                                        |          53.92 |
| raw map - simple key; immutable; pub/sub                                           |         107.83 |
| zustand - simple key; immutable; pub/sub                                           |         141.84 |
| blastore - simple key; immutable adapter; pub/sub                                  |          94.93 |
| blastore - simple key; immutable adapter; pub/sub; no runtime validation           |          95.00 |
| standard blastore - simple key; immutable adapter; pub/sub                         |         214.47 |
| standard blastore - simple key; immutable adapter; pub/sub; no runtime validation  |         118.48 |
| MobX - simple key; immutable; pub/sub                                              |       99558.23 |
| Jotai - simple key; immutable; pub/sub                                             |        1916.80 |
| raw object - dynamic key; immutable; pub/sub                                       |      108635.90 |
| raw map - dynamic key; immutable; pub/sub                                          |        3552.76 |
| zustand - dynamic key; immutable; pub/sub                                          |      147978.68 |
| blastore - dynamic key; immutable adapter; pub/sub                                 |        2460.17 |
| blastore - dynamic key; immutable adapter; pub/sub; no runtime validation          |       98484.15 |
| blastore - precompiled key; immutable adapter; pub/sub                             |        2378.07 |
| standard blastore - dynamic key; immutable adapter; pub/sub                        |        2584.37 |
| standard blastore - dynamic key; immutable adapter; pub/sub; no runtime validation |       93113.38 |
| standard blastore - precompiled key; immutable adapter; pub/sub                    |        2469.16 |
| Jotai - dynamic key; immutable; pub/sub                                            |      148397.89 |
| MobX - dynamic key; immutable; pub/sub                                             |     2936417.02 |

</details>

---

<details>
<summary>Simple Keys (Mutable)</summary>

| Library / Mode                                        | Time (`ns/op`) |
|-------------------------------------------------------|---------------:|
| raw object - simple key                               |          19.29 |
| zustand - simple key                                  |          22.55 |
| raw Map - simple key                                  |          24.95 |
| blastore - simple key; no runtime validation          |          31.12 |
| blastore - simple key                                 |          33.40 |
| standard blastore - simple key; no runtime validation |          52.40 |
| standard blastore - simple key                        |         153.13 |
| MobX - simple key; enforceActions: never              |        1338.77 |
| MobX - simple key                                     |        1389.72 |
| Jotai - simple key                                    |        1659.45 |
| redux-toolkit - simple key                            |        1828.39 |
| Valtio - simple key                                   |        1833.03 |

</details>

**Takeaway**:

- **zustand** is closest to raw object.
- **blastore** adds ~10ns overhead.
- standard **blastore** is 2–5× slower depending on validation.
- All others are 50–80× slower.

---

<details>
<summary>Dynamic Keys (Mutable)</summary>

| Library / Mode                                                               | Time (`ns/op`) |
|------------------------------------------------------------------------------|---------------:|
| blastore - precompiled key                                                   |          46.16 |
| raw Map - dynamic key                                                        |          66.18 |
| raw object - dynamic key                                                     |          71.36 |
| zustand - dynamic key                                                        |          81.39 |
| blastore - dynamic key; no runtime validation                                |         118.96 |
| blastore - dynamic key                                                       |         120.39 |
| standard blastore - dynamic key; no runtime validation                       |         136.39 |
| standard blastore - precompiled key                                          |         157.64 |
| blastore - dynamic key; mixed key operations                                 |         184.00 |
| standard blastore - dynamic key; mixed key operations; no runtime validation |         195.95 |
| standard blastore - dynamic key                                              |         244.19 |
| standard blastore - dynamic key; mixed key operations                        |         304.52 |
| Jotai - dynamic key                                                          |        1667.62 |
| MobX - dynamic key; enforceActions: never                                    |        1785.68 |
| MobX - dynamic key                                                           |        1856.50 |
| Valtio - dynamic key                                                         |        2028.92 |
| redux-toolkit - dynamic key                                                  |       27875.59 |

</details>

**Takeaway**:

- **blastore** precompiled key is even faster than raw object/Map.
- **zustand** remains strong.
- Standard schema introduces 2–3× overhead.
- Other libs are 20–400× slower.

---

<details>
<summary>Pub/sub (Mutable)</summary>

| Library / Mode                                                  | Time (`ns/op`) |
|-----------------------------------------------------------------|---------------:|
| zustand - simple key; pub/sub                                   |          22.39 |
| blastore - simple key; pub/sub                                  |          41.17 |
| raw object - simple key; pub/sub                                |          45.33 |
| raw Map - simple key; pub/sub                                   |          53.35 |
| blastore - precompiled key; pub/sub                             |          60.82 |
| standard blastore - simple key; pub/sub; no runtime validation  |          61.42 |
| raw Map - dynamic key; pub/sub                                  |          76.45 |
| zustand - dynamic key; pub/sub                                  |          79.27 |
| raw object - dynamic key; pub/sub                               |          81.98 |
| blastore - dynamic key; pub/sub                                 |         140.11 |
| standard blastore - dynamic key; pub/sub; no runtime validation |         159.96 |
| standard blastore - simple key; pub/sub                         |         166.78 |
| standard blastore - precompiled key; pub/sub                    |         177.83 |
| standard blastore - dynamic key; pub/sub                        |         268.79 |
| Jotai - dynamic key; atomFamily; pub/sub                        |        1661.43 |
| Jotai - simple key; pub/sub                                     |        1711.20 |
| Valtio - simple key; pub/sub                                    |        1966.28 |
| MobX - dynamic key; pub/sub                                     |        2441.41 |
| MobX - simple key; pub/sub                                      |        2573.66 |
| redux-toolkit - simple key; no middleware; pub/sub              |        2964.48 |
| Valtio - dynamic key; pub/sub                                   |        7119.10 |
| redux-toolkit - dynamic key; no middleware; pub/sub             |     1555156.37 |

</details>

**Takeaway**:

- **zustand** pub/sub is essentially free.
- **blastore** adds ~20ns overhead, standard schema ~160ns.
- All others are 30–100× slower.

---

<details>
<summary>Pub/sub (Immutable)</summary>

| Library / Mode                                                                     | Time (`ns/op`) |
|------------------------------------------------------------------------------------|---------------:|
| raw object - simple key; immutable; pub/sub                                        |          53.92 |
| blastore - simple key; immutable adapter                                           |          84.44 |
| blastore - simple key; immutable adapter; pub/sub                                  |          94.93 |
| blastore - simple key; immutable adapter; pub/sub; no runtime validation           |          95.00 |
| raw map - simple key; immutable; pub/sub                                           |         107.83 |
| standard blastore - simple key; immutable adapter; pub/sub; no runtime validation  |         118.48 |
| zustand - simple key; immutable                                                    |         134.10 |
| zustand - simple key; immutable; pub/sub                                           |         141.84 |
| standard blastore - simple key; immutable adapter; pub/sub                         |         214.47 |
| Jotai - simple key; immutable                                                      |        1899.28 |
| Jotai - simple key; immutable; pub/sub                                             |        1916.80 |
| blastore - precompiled key; immutable adapter; pub/sub                             |        2378.07 |
| blastore - dynamic key; immutable adapter; pub/sub                                 |        2460.17 |
| standard blastore - precompiled key; immutable adapter; pub/sub                    |        2469.16 |
| blastore - dynamic key; immutable adapter                                          |        2472.86 |
| blastore - dynamic key; mixed key operations; immutable adapter                    |        2506.91 |
| zustand - dynamic key; immutable                                                   |        2519.27 |
| standard blastore - dynamic key; immutable adapter; pub/sub                        |        2584.37 |
| standard blastore - dynamic key; mixed key operations; immutable adapter           |        2595.50 |
| raw map - dynamic key; immutable; pub/sub                                          |        3552.76 |
| MobX - simple key; immutable                                                       |       19186.31 |
| Jotai - dynamic key; immutable                                                     |       62046.49 |
| standard blastore - dynamic key; immutable adapter; pub/sub; no runtime validation |       93113.38 |
| blastore - dynamic key; immutable adapter; pub/sub; no runtime validation          |       98484.15 |
| MobX - simple key; immutable; pub/sub                                              |       99558.23 |
| raw object - dynamic key; immutable; pub/sub                                       |      108635.90 |
| zustand - dynamic key; immutable; pub/sub                                          |      147978.68 |
| Jotai - dynamic key; immutable; pub/sub                                            |      148397.89 |
| MobX - dynamic key; immutable                                                      |     2266365.27 |
| MobX - dynamic key; immutable; pub/sub                                             |     2936417.02 |

</details>

**Takeaway**:

- Immutable mode costs everyone, but **blastore** stays in microseconds (2.5k ns).
- **zustand** dynamic immutable balloons to ~148k ns.
- **MobX**/**Jotai** reach millisecond territory.

---

### Summary

- Raw objects/Maps: unbeatable baselines.
- **zustand**: fastest mainstream library, especially for simple keys + pub/sub.
- **blastore**: ~2–5× slower than raw, but adds type safety, validation, precompiled keys, pub/sub, and backend
  integration.
- Standard schema blastore: 2–3× slower than custom validators, still orders of magnitude faster than **MobX**/**Jotai**/**Valtio**/**Redux Toolkit**.
- Immutable mode:
  - **blastore**: stays within 2–3k ns.
  - **zustand**: 100k+ ns.
  - **MobX**/**Jotai**: 100k–3M ns.

- NOTE: localStorage api is quite slow, based similar benchmarks it is in range of 3100-3500`ns/op` no matter raw local
  storage of wrapped with **blastore**. I ran what I could in service workers to isolate each benchmark as much as I
  can, results are very close to Node based benchmarks. localStorage is not available inside service workers, so had to
  run tests in main thread, which is not reliable due to various optimisations' browser does there. I will
  happily take any advice on browser based benchmarking.

## License

MIT © 2025 Sergey Shablenko
