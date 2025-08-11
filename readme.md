# blastore

[![bundlejs](https://deno.bundlejs.com/badge?q=blastore/sync&treeshake=[*])](https://bundlejs.com/?q=blastore/sync&treeshake=[*])

**Blazing-fast, type-safe storage wrapper with minimal overhead.**
A minimal, high-performance storage wrapper for localStorage, memory, or any sync/async backend — with full TypeScript
type safety.

---

## Table of Contents

- [Why blastore?](#why-blastore)
- [Installation](#installation)
- [Overview](#overview)
- [Performance Guidelines](#performance-guidelines)
- [Schema Design](#schema-design)
- [Async Mode](#async-mode)
  - [Usage](#usage)
  - [Dynamic Keys](#dynamic-keys)
  - [Precompiled Keys](#precompiled-keys)
  - [With AsyncStorage](#with-asyncstorage)
  - [With React](#with-react)
- [Sync Mode](#sync-mode)
  - [With localStorage](#with-localstorage)
  - [With React](#with-react-1)
- [Custom Backends](#custom-backends)
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

## Overview

**Blastore** uses a schema-first approach: you define validation, serialization, and deserialization for each key, and
it generates a fully typed API for interacting with your storage backend.

---

## Performance Guidelines

Blastore itself is fast — but your choice of validators, serializers, and storage backend will affect performance.

For best performance in hot paths you should use precompiled keys and fast runtime validators (if
you opt in for runtime validation).

---

## Installation

```bash
npm i blastore
```

---

## Schema Design

Schemas define validation and serialization for each key. Both sync and async modes support this format.

```ts
type Schema = {
  validate: Record<string, TypeGuard>;
  serialize?: Record<string, Serializer>;
  deserialize?: Record<string, Deserializer>;
  defaultSerialize?: Serializer;
  defaultDeserialize?: Deserializer;
};
```

- `TypeGuard` - function used to infer desired TypeScript type for the key and optionally can act as validator
- `Serializer` - function that is used to serialize value before passing it to raw store
- `Deserializer` - function that is used to deserialize value after reading from raw store

```ts
// Example
const schema = {
  validate: {
    isOnboardingComplete: async (v) =>
      typeof v === 'boolean' ? v : new Error('Invalid type'),
  },
};
```

---

## Async Mode

Use `buildAsync()` for storage systems like `AsyncStorage`, `IDB`, or remote APIs.

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

### Usage

```ts
await blastore.set(
  'messageDraft:${threadId}',
  { content: 'hi' },
  { variables: { threadId: '123' } }
);
const val = await blastore.get('messageDraft:${threadId}', null, {
  variables: { threadId: '123' },
});
```

### Dynamic Keys

```ts
await blastore.set(
  'messageDraft:${threadId}',
  { content: 'text' },
  { variables: { threadId: '123' } }
);
const draft = await blastore.get('messageDraft:${threadId}', null, {
  variables: { threadId: '123' },
});
```

### Precompiled Keys

```ts
const draftApi = blastore.buildKeyApi('messageDraft:${threadId}', {
  variables: { threadId: '123' },
});
await draftApi.set({ content: 'hi' });
await draftApi.get(null);
```

### With AsyncStorage

```ts
blastore.subscribe('messageDraft:${threadId}', async () => {
  const val = await blastore.get('messageDraft:${threadId}', null, {
    variables: { threadId: '123' },
  });
});
```

### With React

```ts
import { useAsyncStore } from 'blastore/use-async-store';

const {
  isInitialised, // false by default, happens automatically
  value: isOnboardingComplete, // equals to provided defaultValue in this case `false` until initialised
  set: setIsOnboardingComplete,
  remove: removeIsOnboardingComplete,
} = useAsyncStore(blastore, 'isOnboardingComplete', false);
```

## Sync Mode

Sync mode works the same way as Async mode, except all operations, validators and serializers are synchronous.
Use `buildSync()` when working with `localStorage`, memory, or other synchronous backends.

```ts
import { buildSync } from 'blastore/sync';
import z from 'zod';

const messageSchema = z.union([
  z.null(),
  z.object({
    content: z.string(),
  }),
]);

const blastore = buildSync(
  {
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
  },
  localStorage
);
```

### With localStorage

```ts
window.addEventListener('storage', (e) => {
  blastore.untypedEmit(e.key);
});

blastore.emit('isOnboardingComplete');
```

### With React

```ts
import { useSyncStore } from 'blastore/use-sync-store';

const {
  value: isOnboardingComplete,
  set: setIsOnboardingComplete,
  remove: removeIsOnboardingComplete,
} = useSyncStore(blastore, 'isOnboardingComplete', false);
```

---

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

const blastore = buildSync(
  {
    validate: {
      isOnboardingComplete: (v) =>
        typeof v === 'boolean' ? v : new Error('Invalid type'),
    },
  },
  customStore
);
```

## Performance Benchmarks

> **Synchronous mode**: NodeJS 22.12.0; 10M iterations 100 keys

> Node parameters `--expose-gc --no-warnings --initial-old-space-size=256 --max-old-space-size=256`

> ENV `NODE_ENV=production`

| Library / Mode                  |  Time (`ns/op`) |
| ------------------------------- | --------------: |
| raw **object** - simple key     |    11.1182ns/op |
| **zustand** - simple key        |    17.1471ns/op |
| raw **Map** - simple key        |    19.6044ns/op |
| **blastore** - simple key       |    23.3742ns/op |
| **blastore** - precompiled key  |    34.1695ns/op |
| raw **Map** - dynamic key       |    55.5313ns/op |
| raw **object** - dynamic key    |    57.7860ns/op |
| **zustand** - dynamic key       |    65.0970ns/op |
| **blastore** - dynamic key      |    97.1707ns/op |
| **mobx** - simple key           |  1345.4720ns/op |
| **jotai** - simple key          |  1628.4754ns/op |
| **jotai** - dynamic key         |  1652.4268ns/op |
| **redux-toolkit** - simple key  |  1804.2695ns/op |
| **mobx** - dynamic key          |  1829.3930ns/op |
| **valtio** - simple key         |  1890.3795ns/op |
| **valtio** - dynamic key        |  2016.2472ns/op |
| **redux-toolkit** - dynamic key | 27715.7398ns/op |

> **Synchronous mode**: NodeJS 22.12.0; 25000 iterations 100 keys

> Node parameters `--expose-gc --no-warnings --initial-old-space-size=256 --max-old-space-size=256`

> ENV `NODE_ENV=production`

| Library / Mode                  |  Time (`ns/op`) |
| ------------------------------- | --------------: |
| raw **object** - simple key     |    45.0966ns/op |
| raw **Map** - simple key        |    54.8933ns/op |
| raw **object** - dynamic key    |   101.5467ns/op |
| **zustand** - simple key        |   113.9883ns/op |
| **blastore** - simple key       |   117.5850ns/op |
| raw **Map** - dynamic key       |   123.6466ns/op |
| **blastore** - precompiled key  |   161.9033ns/op |
| **zustand** - dynamic key       |   181.4300ns/op |
| **blastore** - dynamic key      |   253.4267ns/op |
| **mobx** - simple key           |  1501.7383ns/op |
| **jotai** - simple key          |  1859.8583ns/op |
| **jotai** - dynamic key         |  1888.9917ns/op |
| **mobx** - dynamic key          |  1934.2067ns/op |
| **valtio** - dynamic key        |  2091.3533ns/op |
| **redux-toolkit** - simple key  |  2158.2484ns/op |
| **valtio** - simple key         |  2370.9783ns/op |
| **redux-toolkit** - dynamic key | 28197.9417ns/op |

## License

MIT © 2025 Sergey Shablenko
