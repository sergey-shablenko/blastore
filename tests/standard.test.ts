import { describe, expect, it } from 'vitest';
import { buildStandard } from '../src/standard';
import { SyncMemoryStorage } from '../src/sync-memory-storage';
import { z } from 'zod';

describe('sync mode test', () => {
  const testMemStore = new SyncMemoryStorage();
  const store = buildStandard({
    validate: {
      simpleKey: z.union([z.null(), z.boolean()]),
      'dynamicKey${alias}': z.union([z.null(), z.boolean()]),
      'dynamicKey${0}': z.union([z.null(), z.boolean()]),
      'dynamicKey${}': z.union([z.null(), z.boolean()]),
      'simpleKey\${}': z.union([z.null(), z.boolean()]),
    },
    keyMode: {
      simpleKey: 'sync',
      'dynamicKey${alias}': 'sync',
      'dynamicKey${0}': 'sync',
      'dynamicKey${}': 'sync',
      'simpleKey\${}': 'sync',
    },
    serialize: {
      simpleKey: (v) => v,
      'dynamicKey${0}': (v) => v,
    },
    deserialize: {
      simpleKey: (v) => v as boolean,
      'dynamicKey${0}': (v) => v as boolean,
    },
    store: testMemStore,
    validateOnGet: true,
    validateOnSet: true,
  });

  it('get default value', () => {
    const res = store.get('simpleKey', null);
    expect(store.get('simpleKey', null)).toBeNull();
    expect(store.get('simpleKey', true)).toBe(true);
    expect(store.get('simpleKey', false)).toBe(false);
  });

  it('set value', () => {
    expect(store.set('simpleKey', true)).toBe(true);
    expect(store.get('simpleKey', null)).toBe(true);
    expect(store.set('simpleKey', null)).toBe(true);
    expect(store.get('simpleKey', true)).toBeNull();
    expect(store.set('simpleKey', false)).toBe(true);
    expect(store.get('simpleKey', true)).toBe(false);
    expect(store.set('simpleKey', 123 as any)).toBe(false);
    expect(store.get('simpleKey', null)).toBe(false);
    expect(store.set('simpleKey', {} as any)).toBe(false);
    expect(store.get('simpleKey', null)).toBe(false);
    expect(store.set('dynamicKey${0}', true, { variables: { 0: '1' } })).toBe(
      true
    );
    expect(store.get('dynamicKey${0}', null, { variables: { 0: '1' } })).toBe(
      true
    );
    expect(
      store.set('dynamicKey${alias}', true, { variables: { alias: 'alias' } })
    ).toBe(true);
    expect(
      store.get('dynamicKey${alias}', null, { variables: { alias: 'alias' } })
    ).toBe(true);
    expect(
      store.set('dynamicKey${0}', 123 as any, { variables: { 0: '1' } })
    ).toBe(false);
    expect(store.get('dynamicKey${0}', null, { variables: { 0: '1' } })).toBe(
      true
    );
    expect(
      store.set('dynamicKey${alias}', 123 as any, {
        variables: { alias: 'alias' },
      })
    ).toBe(false);
  });

  it('remove value', () => {
    expect(store.set('simpleKey', true)).toBe(true);
    expect(store.get('simpleKey', null)).toBe(true);
    store.remove('simpleKey');
    expect(store.get('simpleKey', null)).toBe(null);

    expect(store.set('dynamicKey${alias}', true)).toBe(true);
    expect(store.get('dynamicKey${alias}', null)).toBe(true);
    store.remove('dynamicKey${alias}');
    expect(store.get('dynamicKey${alias}', null)).toBe(null);

    expect(
      store.set('dynamicKey${alias}', true, { variables: { alias: 'alias' } })
    ).toBe(true);
    expect(
      store.get('dynamicKey${alias}', null, { variables: { alias: 'alias' } })
    ).toBe(true);
    store.remove('dynamicKey${alias}', { variables: { alias: 'alias' } });
    expect(
      store.get('dynamicKey${alias}', null, { variables: { alias: 'alias' } })
    ).toBe(null);
  });

  it('subscribe and emit', () => {
    let calls = 0;
    const unsub = store.subscribe('simpleKey', () => {
      calls += 1;
    });
    store.emit('simpleKey', 'set', false);
    store.emit('dynamicKey${0}', 'set', false);
    store.emit('simpleKey', 'set', false);
    unsub();
    store.emit('simpleKey', 'set', false);
    store.emit('simpleKey', 'set', false);
    expect(calls).toBe(2);

    let dynamicCalls = 0;
    const dynamicUnsub = store.subscribe(
      'dynamicKey${alias}',
      () => {
        dynamicCalls += 1;
      },
      { variables: { alias: 'alias' } }
    );
    store.emit('simpleKey', 'set', false);
    store.emit('dynamicKey${alias}', 'set', false);
    store.emit('dynamicKey${alias}', 'set', false, {
      variables: { alias: '123' },
    });
    store.emit('dynamicKey${alias}', 'set', false, {
      variables: { alias: 'alias' },
    });
    store.emit('simpleKey', 'set', false);
    dynamicUnsub();
    store.emit('dynamicKey${alias}', 'set', false, {
      variables: { alias: 'alias' },
    });
    expect(dynamicCalls).toBe(1);
  });

  it('untypedSubscribe', async () => {
    let dynamicCalls = 0;
    const dynamicUnsub = store.untypedSubscribe('dynamicKeyalias', () => {
      dynamicCalls += 1;
    });
    store.emit('simpleKey', 'set', false);
    store.emit('dynamicKey${alias}', 'set', false);
    store.emit('dynamicKey${alias}', 'set', false, {
      variables: { alias: '123' },
    });
    store.emit('dynamicKey${alias}', 'set', false, {
      variables: { alias: 'alias' },
    });
    await store.untypedEmit('dynamicKeyalias', 'set', false);
    store.emit('simpleKey', 'set', false);
    dynamicUnsub();
    store.emit('dynamicKey${alias}', 'set', false, {
      variables: { alias: 'alias' },
    });
    expect(dynamicCalls).toBe(2);
  });

  it('key format', () => {
    const memStore = new SyncMemoryStorage();
    const keyStore = buildStandard({
      store: memStore,
      validate: {
        'dynamicKey${alias}': z.union([z.null(), z.boolean()]),
        'dynamicKey${0}': z.union([z.null(), z.boolean()]),
        'dynamicKey${}': z.union([z.null(), z.boolean()]),
        'simpleKey\\${}': z.union([z.null(), z.boolean()]),
        'simpleKey${alias}test': z.union([z.null(), z.boolean()]),
        'simpleKey${alias}tes${alias}t': z.union([z.null(), z.boolean()]),
        '${0}simpleKey${alias}tes${alias}t': z.union([z.null(), z.boolean()]),
      },
      keyMode: {
        'dynamicKey${alias}': 'sync',
        'dynamicKey${0}': 'sync',
        'dynamicKey${}': 'sync',
        'simpleKey\\${}': 'sync',
        'simpleKey${alias}test': 'sync',
        'simpleKey${alias}tes${alias}t': 'sync',
        '${0}simpleKey${alias}tes${alias}t': 'sync',
      },
      validateOnSet: true,
      validateOnGet: true,
    });
    expect(
      keyStore.set('dynamicKey${0}', false, { variables: { 0: '1' } })
    ).toBe(true);
    expect(memStore.state[`dynamicKey${1}`]).toBe(false);

    expect(
      keyStore.set('dynamicKey${0}', true, { variables: { 0: '1' } })
    ).toBe(true);
    expect(memStore.state[`dynamicKey${1}`]).toBe(true);

    expect(
      keyStore.set('dynamicKey${}', false, { variables: { '': '1' } })
    ).toBe(true);
    expect(memStore.state['dynamicKey${}']).toBe(false);

    expect(keyStore.set('simpleKey\\${}', false)).toBe(true);
    expect(memStore.state['simpleKey\\${}']).toBe(false);

    expect(
      keyStore.set('simpleKey${alias}test', false, {
        variables: { alias: 'alias' },
      })
    ).toBe(true);
    expect(memStore.state[`simpleKey${'alias'}test`]).toBe(false);

    expect(
      keyStore.set('simpleKey${alias}tes${alias}t', false, {
        variables: { alias: 'alias' },
      })
    ).toBe(true);
    expect(memStore.state[`simpleKey${'alias'}tes${'alias'}t`]).toBe(false);

    expect(
      keyStore.set('${0}simpleKey${alias}tes${alias}t', false, {
        variables: { alias: 'alias', 0: '1' },
      })
    ).toBe(true);
  });

  describe('buildKeyApi', () => {
    const newStore = buildStandard({
      store: new SyncMemoryStorage(),
      validate: {
        simpleKey: z.union([z.null(), z.boolean()]),
        'dynamicKey${alias}': z.union([z.null(), z.boolean()]),
        'dynamicKey${0}': z.union([z.null(), z.boolean()]),
        'dynamicKey${}': z.union([z.null(), z.boolean()]),
        'simpleKey\${}': z.union([z.null(), z.boolean()]),
      },
      keyMode: {
        simpleKey: 'sync',
        'dynamicKey${alias}': 'sync',
        'dynamicKey${0}': 'sync',
        'dynamicKey${}': 'sync',
        'simpleKey\${}': 'sync',
      },
      validateOnSet: true,
      validateOnGet: true,
    });
    const simpleKeyApi = newStore.buildKeyApi('simpleKey');
    const dynamicKeyAliasApi = newStore.buildKeyApi('dynamicKey${alias}', {
      variables: { alias: 'alias' },
    });
    const dynamicKey1Api = newStore.buildKeyApi('dynamicKey${0}', {
      variables: { 0: '1' },
    });
    const dynamicKeyUndefinedApi = newStore.buildKeyApi('dynamicKey${0}');

    it('get default value', () => {
      expect(simpleKeyApi.get(null)).toBeNull();
      expect(simpleKeyApi.get(true)).toBe(true);
      expect(simpleKeyApi.get(false)).toBe(false);
    });

    it('set value', () => {
      expect(simpleKeyApi.set(true)).toBe(true);
      expect(simpleKeyApi.get(null)).toBe(true);
      expect(simpleKeyApi.set(null)).toBe(true);
      expect(simpleKeyApi.get(true)).toBeNull();
      expect(simpleKeyApi.set(false)).toBe(true);
      expect(simpleKeyApi.get(true)).toBe(false);
      expect(simpleKeyApi.set(123 as any)).toBe(false);
      expect(simpleKeyApi.get(null)).toBe(false);
      expect(simpleKeyApi.set({} as any)).toBe(false);
      expect(simpleKeyApi.get(null)).toBe(false);
      expect(dynamicKey1Api.set(true)).toBe(true);
      expect(dynamicKey1Api.get(null)).toBe(true);
      expect(dynamicKeyAliasApi.set(true)).toBe(true);
      expect(dynamicKeyAliasApi.get(null)).toBe(true);
      expect(dynamicKey1Api.set(123 as any)).toBe(false);
      expect(dynamicKey1Api.get(null)).toBe(true);
      expect(dynamicKeyAliasApi.set(123 as any)).toBe(false);
    });

    it('remove value', () => {
      expect(simpleKeyApi.set(true)).toBe(true);
      expect(simpleKeyApi.get(null)).toBe(true);
      simpleKeyApi.remove();
      expect(simpleKeyApi.get(null)).toBe(null);

      expect(dynamicKeyUndefinedApi.set(true)).toBe(true);
      expect(dynamicKeyUndefinedApi.get(null)).toBe(true);
      dynamicKeyUndefinedApi.remove();
      expect(dynamicKeyUndefinedApi.get(null)).toBe(null);

      expect(dynamicKeyAliasApi.set(true)).toBe(true);
      expect(dynamicKeyAliasApi.get(null)).toBe(true);
      dynamicKeyAliasApi.remove();
      expect(dynamicKeyAliasApi.get(null)).toBe(null);
    });

    it('subscribe and emit', () => {
      let calls = 0;
      const unsub = simpleKeyApi.subscribe(() => {
        calls += 1;
      });
      simpleKeyApi.emit('set', false);
      dynamicKeyUndefinedApi.emit('set', false);
      simpleKeyApi.emit('set', false);
      unsub();
      simpleKeyApi.emit('set', false);
      simpleKeyApi.emit('set', false);
      expect(calls).toBe(2);

      let dynamicCalls = 0;
      const dynamicUnsub = dynamicKeyAliasApi.subscribe(() => {
        dynamicCalls += 1;
      });
      simpleKeyApi.emit('set', false);
      dynamicKeyUndefinedApi.emit('set', false);
      dynamicKey1Api.emit('set', false);
      dynamicKeyAliasApi.emit('set', false);
      simpleKeyApi.emit('set', false);
      dynamicUnsub();
      dynamicKeyAliasApi.emit('set', false);
      expect(dynamicCalls).toBe(1);
    });
  });
});
