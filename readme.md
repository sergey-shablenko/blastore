# blastore

[![bundlejs](https://deno.bundlejs.com/badge?q=blastore/sync&treeshake=[*])](https://bundlejs.com/?q=blastore/sync&treeshake=[*])

**Blazing-fast, type-safe storage wrapper with zero overhead.**
A tiny abstraction over `localStorage`, memory, or any sync/async backend — without giving up performance, types, or
sanity.

---

## Table of Contents

- [Why blastore?](#why-blastore)
- [Installation](#installation)
- [Schema Design](#schema-design)
- [Sync Mode](#sync-mode)
  - [Usage](#usage)
  - [Dynamic Keys](#dynamic-keys)
  - [Precompiled Keys](#precompiled-keys)
  - [With localStorage](#with-localstorage)

- [Async Mode](#async-mode)
  - [Usage](#usage-1)
  - [Dynamic Keys](#dynamic-keys-1)
  - [Precompiled Keys](#precompiled-keys-1)
  - [With AsyncStorage](#with-asyncstorage)

- [Performance Benchmarks](#performance-benchmarks)

---

## Why blastore?

- **Typed**: Static & runtime validation built-in
- **Blazingly fast**: Near-native `.get()` / `.set()` performance
- **Precompiled dynamic keys**: `user:${userId}`-style access with full type safety
- **Reactivity**: Subscribe to changes without external state libraries
- **Featherweight**: Zero dependencies, tree-shakable, minimal API
- **Pluggable** store: Works with `localStorage`, memory, or any custom (a|sync) backend

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
  validate: Record<string, (v: unknown) => unknown | Error>;
  serialize?: Record<string, (v: unknown) => unknown>;
  deserialize?: Record<string, (v: unknown) => unknown>;
  defaultSerialize?: (v: unknown) => unknown;
  defaultDeserialize?: (v: unknown) => unknown;
};
```

---

## Sync Mode

Use `buildSync()` when working with `localStorage`, memory, or other synchronous backends.

```ts
import { buildSync } from 'blastore/sync';

const schema = {
  validate: {
    isOnboardingComplete: (v) =>
      v === null || typeof v === 'boolean' ? v : new Error('invalid'),
    'messageDraft:${threadId}': (v) =>
      v === null || (typeof v === 'object' && v !== null && 'content' in v)
        ? v
        : new Error('invalid'),
  },
  serialize: {
    'messageDraft:${threadId}': JSON.stringify,
  },
  deserialize: {
    'messageDraft:${threadId}': JSON.parse,
  },
};

const blastore = buildSync(schema, localStorage);
```

### Usage

```ts
blastore.set('isOnboardingComplete', true); // ✅ OK
blastore.set('isOnboardingComplete', 'bad'); // ❌ Type error
const val = blastore.get('isOnboardingComplete', null); // boolean | null
```

### Dynamic Keys

```ts
blastore.set(
  'messageDraft:${threadId}',
  { content: 'text' },
  { variables: [123] }
);
blastore.get('messageDraft:${threadId}', null, { variables: [123] });
```

### Precompiled Keys

```ts
const draftApi = blastore.buildKeyApi('messageDraft:${threadId}', [123]);
draftApi.set({ content: 'hi' });
draftApi.subscribe(() => {
  console.log(draftApi.get(null));
});
```

### With localStorage

```ts
window.addEventListener('storage', (e) => {
  blastore.untypedEmit(e.key);
});

blastore.emit('isOnboardingComplete');
```

---

## Async Mode

Use `buildAsync()` for storage systems like `AsyncStorage`, `IDB`, or remote APIs.

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildAsync } from 'blastore/async';

const schema = {
  validate: {
    'messageDraft:${threadId}': (v) =>
      v === null || (typeof v === 'object' && v !== null && 'content' in v)
        ? v
        : new Error('invalid'),
  },
  serialize: {
    'messageDraft:${threadId}': async (v) => JSON.stringify(v),
  },
  deserialize: {
    'messageDraft:${threadId}': async (v) => JSON.parse(v),
  },
};

const blastore = buildAsync(schema, AsyncStorage);
```

### Usage

```ts
await blastore.set(
  'messageDraft:${threadId}',
  { content: 'hi' },
  { variables: [123] }
);
const val = await blastore.get('messageDraft:${threadId}', null, {
  variables: [123],
});
```

### Dynamic Keys

```ts
await blastore.set(
  'messageDraft:${threadId}',
  { content: 'text' },
  { variables: [123] }
);
```

### Precompiled Keys

```ts
const draftApi = blastore.buildKeyApi('messageDraft:${threadId}', [123]);
await draftApi.set({ content: 'hi' });
await draftApi.get(null);
```

### With AsyncStorage

```ts
blastore.subscribe('messageDraft:${threadId}', async () => {
  const val = await blastore.get('messageDraft:${threadId}', null, {
    variables: [123],
  });
});
```

---

## Performance Benchmarks

> **Sync**: 10M iterations / **Async**: 25k iterations (`sleep(0)`)

### Sync

| Library                        | Time (`ms/op`) | Memory Usage |
| ------------------------------ | -------------: | -----------: |
| **blastore (simple key)**      |     **0.0000** |  +1.459MB ✅ |
| **blastore (dynamic key)**     |         0.0001 | +12.717MB ⚠️ |
| **blastore (precompiled key)** |     **0.0000** |  +8.168MB ✅ |
| zustand (simple key)           |     **0.0000** |  +7.399MB ⚠️ |
| zustand (dynamic key)          |         0.0001 |  +1.487MB ✅ |
| valtio (simple key)            |         0.0032 | +14.922MB ❌ |
| valtio (dynamic key)           |         0.0401 | +12.687MB ❌ |

### Async

| Library                        | Time (`ms/op`) | Memory Usage |
| ------------------------------ | -------------: | -----------: |
| **blastore (simple key)**      |         2.2658 |  +1.188MB ✅ |
| **blastore (dynamic key)**     |         2.2645 |  +0.471MB ✅ |
| **blastore (precompiled key)** |         2.2636 |  +1.674MB ⚠️ |
| zustand (simple key)           |         2.2649 |  +0.281MB ✅ |
| zustand (dynamic key)          |         2.5020 |  +0.713MB ✅ |
| valtio (simple key)            |         2.2667 | +12.567MB ❌ |
| valtio (dynamic key)           |         2.3423 | +13.621MB ❌ |
