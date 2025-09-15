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
    expect(store.get('simpleKey', true)).toEqual(true);
    expect(store.get('simpleKey', false)).toEqual(false);
  });

  it('set value', () => {
    expect(store.set('simpleKey', true)).toEqual(true);
    expect(store.get('simpleKey', null)).toEqual(true);
    expect(store.set('simpleKey', null)).toEqual(true);
    expect(store.get('simpleKey', true)).toBeNull();
    expect(store.set('simpleKey', false)).toEqual(true);
    expect(store.get('simpleKey', true)).toEqual(false);
    expect(store.set('simpleKey', 123 as any)).toEqual(false);
    expect(store.get('simpleKey', null)).toEqual(false);
    expect(store.set('simpleKey', {} as any)).toEqual(false);
    expect(store.get('simpleKey', null)).toEqual(false);
    expect(
      store.set('dynamicKey${0}', true, { variables: { 0: '1' } })
    ).toEqual(true);
    expect(
      store.get('dynamicKey${0}', null, { variables: { 0: '1' } })
    ).toEqual(true);
    expect(
      store.set('dynamicKey${alias}', true, { variables: { alias: 'alias' } })
    ).toEqual(true);
    expect(
      store.get('dynamicKey${alias}', null, { variables: { alias: 'alias' } })
    ).toEqual(true);
    expect(
      store.set('dynamicKey${0}', 123 as any, { variables: { 0: '1' } })
    ).toEqual(false);
    expect(
      store.get('dynamicKey${0}', null, { variables: { 0: '1' } })
    ).toEqual(true);
    expect(
      store.set('dynamicKey${alias}', 123 as any, {
        variables: { alias: 'alias' },
      })
    ).toEqual(false);
  });

  it('remove value', () => {
    expect(store.set('simpleKey', true)).toEqual(true);
    expect(store.get('simpleKey', null)).toEqual(true);
    store.remove('simpleKey');
    expect(store.get('simpleKey', null)).toEqual(null);

    expect(store.set('dynamicKey${alias}', true)).toEqual(true);
    expect(store.get('dynamicKey${alias}', null)).toEqual(true);
    store.remove('dynamicKey${alias}');
    expect(store.get('dynamicKey${alias}', null)).toEqual(null);

    expect(
      store.set('dynamicKey${alias}', true, { variables: { alias: 'alias' } })
    ).toEqual(true);
    expect(
      store.get('dynamicKey${alias}', null, { variables: { alias: 'alias' } })
    ).toEqual(true);
    store.remove('dynamicKey${alias}', { variables: { alias: 'alias' } });
    expect(
      store.get('dynamicKey${alias}', null, { variables: { alias: 'alias' } })
    ).toEqual(null);
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
    expect(calls).toEqual(2);

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
    expect(dynamicCalls).toEqual(1);
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
    expect(dynamicCalls).toEqual(2);
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
      validateOnEmit: true,
    });
    expect(
      keyStore.set('dynamicKey${0}', false, { variables: { 0: '1' } })
    ).toEqual(true);
    expect(memStore.state[`dynamicKey${1}`]).toEqual(false);

    expect(
      keyStore.set('dynamicKey${0}', true, { variables: { 0: '1' } })
    ).toEqual(true);
    expect(memStore.state[`dynamicKey${1}`]).toEqual(true);

    expect(
      keyStore.set('dynamicKey${}', false, { variables: { '': '1' } })
    ).toEqual(true);
    expect(memStore.state['dynamicKey${}']).toEqual(false);

    expect(keyStore.set('simpleKey\\${}', false)).toEqual(true);
    expect(memStore.state['simpleKey\\${}']).toEqual(false);

    expect(
      keyStore.set('simpleKey${alias}test', false, {
        variables: { alias: 'alias' },
      })
    ).toEqual(true);
    expect(memStore.state[`simpleKey${'alias'}test`]).toEqual(false);

    expect(
      keyStore.set('simpleKey${alias}tes${alias}t', false, {
        variables: { alias: 'alias' },
      })
    ).toEqual(true);
    expect(memStore.state[`simpleKey${'alias'}tes${'alias'}t`]).toEqual(false);

    expect(
      keyStore.set('${0}simpleKey${alias}tes${alias}t', false, {
        variables: { alias: 'alias', 0: '1' },
      })
    ).toEqual(true);
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
      defaultSerialize: (v) => JSON.stringify(v),
      defaultDeserialize: (v) => JSON.parse(v),
      validateOnSet: true,
      validateOnGet: true,
      validateOnEmit: true,
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
      expect(simpleKeyApi.get(true)).toEqual(true);
      expect(simpleKeyApi.get(false)).toEqual(false);
    });

    it('set value', () => {
      expect(simpleKeyApi.set(true)).toEqual(true);
      expect(simpleKeyApi.get(null)).toEqual(true);
      expect(simpleKeyApi.set(null)).toEqual(true);
      expect(simpleKeyApi.get(true)).toBeNull();
      expect(simpleKeyApi.set(false)).toEqual(true);
      expect(simpleKeyApi.get(true)).toEqual(false);
      expect(simpleKeyApi.set(123 as any)).toEqual(false);
      expect(simpleKeyApi.get(null)).toEqual(false);
      expect(simpleKeyApi.set({} as any)).toEqual(false);
      expect(simpleKeyApi.get(null)).toEqual(false);
      expect(dynamicKey1Api.set(true)).toEqual(true);
      expect(dynamicKey1Api.get(null)).toEqual(true);
      expect(dynamicKeyAliasApi.set(true)).toEqual(true);
      expect(dynamicKeyAliasApi.get(null)).toEqual(true);
      expect(dynamicKey1Api.set(123 as any)).toEqual(false);
      expect(dynamicKey1Api.get(null)).toEqual(true);
      expect(dynamicKeyAliasApi.set(123 as any)).toEqual(false);
    });

    it('remove value', () => {
      expect(simpleKeyApi.set(true)).toEqual(true);
      expect(simpleKeyApi.get(null)).toEqual(true);
      simpleKeyApi.remove();
      expect(simpleKeyApi.get(null)).toEqual(null);

      expect(dynamicKeyUndefinedApi.set(true)).toEqual(true);
      expect(dynamicKeyUndefinedApi.get(null)).toEqual(true);
      dynamicKeyUndefinedApi.remove();
      expect(dynamicKeyUndefinedApi.get(null)).toEqual(null);

      expect(dynamicKeyAliasApi.set(true)).toEqual(true);
      expect(dynamicKeyAliasApi.get(null)).toEqual(true);
      dynamicKeyAliasApi.remove();
      expect(dynamicKeyAliasApi.get(null)).toEqual(null);
    });

    it('subscribe and emit', () => {
      let calls = 0;
      const emittedEvents: unknown[] = [];
      const unsub = simpleKeyApi.subscribe((e) => {
        calls += 1;
        emittedEvents.push(e);
      });
      simpleKeyApi.set(false);
      simpleKeyApi.emit('set', false);
      dynamicKeyUndefinedApi.emit('set', false);
      simpleKeyApi.emit('set', false);
      unsub();
      simpleKeyApi.emit('set', false);
      simpleKeyApi.emit('set', false);
      expect(calls).toEqual(3);
      expect(emittedEvents).toEqual([
        { action: 'set', data: false },
        { action: 'set', data: false },
        { action: 'set', data: false },
      ]);

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
      expect(dynamicCalls).toEqual(1);
    });
  });
});
