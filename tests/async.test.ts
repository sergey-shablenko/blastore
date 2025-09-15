import { describe, expect, it } from 'vitest';
import { buildAsync } from '../src/async';
import { AsyncMemoryStorage } from '../src/async-memory-storage';

describe('async mode test', () => {
  const store = buildAsync({
    store: new AsyncMemoryStorage(),
    validate: {
      simpleKey: async (v) =>
        v === null || typeof v === 'boolean' ? v : new Error('invalid'),
      'dynamicKey${alias}': async (v) =>
        v === null || typeof v === 'boolean' ? v : new Error('invalid'),
      'dynamicKey${0}': async (v) =>
        v === null || typeof v === 'boolean' ? v : new Error('invalid'),
      'dynamicKey${}': async (v) =>
        v === null || typeof v === 'boolean' ? v : new Error('invalid'),
      'simpleKey\${}': async (v) =>
        v === null || typeof v === 'boolean' ? v : new Error('invalid'),
    },
    validateOnSet: true,
    validateOnGet: true,
    validateOnEmit: true,
  });

  it('get default value', async () => {
    expect(await store.get('simpleKey', null)).toBeNull();
    expect(await store.get('simpleKey', true)).toEqual(true);
    expect(await store.get('simpleKey', false)).toEqual(false);
  });

  it('set value', async () => {
    expect(await store.set('simpleKey', true)).toEqual(true);
    expect(await store.get('simpleKey', null)).toEqual(true);
    expect(await store.set('simpleKey', null)).toEqual(true);
    expect(await store.get('simpleKey', true)).toBeNull();
    expect(await store.set('simpleKey', false)).toEqual(true);
    expect(await store.get('simpleKey', true)).toEqual(false);
    expect(await store.set('simpleKey', 123 as any)).toEqual(false);
    expect(await store.get('simpleKey', null)).toEqual(false);
    expect(await store.set('simpleKey', {} as any)).toEqual(false);
    expect(await store.get('simpleKey', null)).toEqual(false);
    expect(
      await store.set('dynamicKey${0}', true, { variables: { 0: '1' } })
    ).toEqual(true);
    expect(
      await store.get('dynamicKey${0}', null, { variables: { 0: '1' } })
    ).toEqual(true);
    expect(
      await store.set('dynamicKey${alias}', true, {
        variables: { alias: 'alias' },
      })
    ).toEqual(true);
    expect(
      await store.get('dynamicKey${alias}', null, {
        variables: { alias: 'alias' },
      })
    ).toEqual(true);
    expect(
      await store.set('dynamicKey${0}', 123 as any, { variables: { 0: '1' } })
    ).toEqual(false);
    expect(
      await store.get('dynamicKey${0}', null, { variables: { 0: '1' } })
    ).toEqual(true);
    expect(
      await store.set('dynamicKey${alias}', 123 as any, {
        variables: { alias: 'alias' },
      })
    ).toEqual(false);
  });

  it('remove value', async () => {
    expect(await store.set('simpleKey', true)).toEqual(true);
    expect(await store.get('simpleKey', null)).toEqual(true);
    await store.remove('simpleKey');
    expect(await store.get('simpleKey', null)).toEqual(null);

    expect(await store.set('dynamicKey${alias}', true)).toEqual(true);
    expect(await store.get('dynamicKey${alias}', null)).toEqual(true);
    await store.remove('dynamicKey${alias}');
    expect(await store.get('dynamicKey${alias}', null)).toEqual(null);

    expect(
      await store.set('dynamicKey${alias}', true, {
        variables: { alias: 'alias' },
      })
    ).toEqual(true);
    expect(
      await store.get('dynamicKey${alias}', null, {
        variables: { alias: 'alias' },
      })
    ).toEqual(true);
    await store.remove('dynamicKey${alias}', { variables: { alias: 'alias' } });
    expect(
      await store.get('dynamicKey${alias}', null, {
        variables: { alias: 'alias' },
      })
    ).toEqual(null);
  });

  it('subscribe and emit', async () => {
    let calls = 0;
    const unsub = store.subscribe('simpleKey', () => {
      calls += 1;
    });
    await store.emit('simpleKey', 'set', false);
    await store.emit('dynamicKey${0}', 'set', false);
    await store.emit('simpleKey', 'set', false);
    unsub();
    await store.emit('simpleKey', 'set', false);
    await store.emit('simpleKey', 'set', false);
    expect(calls).toEqual(2);

    let dynamicCalls = 0;
    const dynamicUnsub = store.subscribe(
      'dynamicKey${alias}',
      () => {
        dynamicCalls += 1;
      },
      { variables: { alias: 'alias' } }
    );
    await store.emit('simpleKey', 'set', false);
    await store.emit('dynamicKey${alias}', 'set', false);
    await store.emit('dynamicKey${alias}', 'set', false, {
      variables: { alias: '123' },
    });
    await store.emit('dynamicKey${alias}', 'set', false, {
      variables: { alias: 'alias' },
    });
    await store.emit('simpleKey', 'set', false);
    dynamicUnsub();
    await store.emit('dynamicKey${alias}', 'set', false, {
      variables: { alias: 'alias' },
    });
    expect(dynamicCalls).toEqual(1);
  });

  it('untypedSubscribe', async () => {
    let dynamicCalls = 0;
    const dynamicUnsub = store.untypedSubscribe('dynamicKeyalias', () => {
      dynamicCalls += 1;
    });
    await store.emit('simpleKey', 'set', false);
    await store.emit('dynamicKey${alias}', 'set', false);
    await store.emit('dynamicKey${alias}', 'set', false, {
      variables: { alias: '123' },
    });
    await store.emit('dynamicKey${alias}', 'set', false, {
      variables: { alias: 'alias' },
    });
    await store.untypedEmit('dynamicKeyalias', 'set', false);
    await store.emit('simpleKey', 'set', false);
    dynamicUnsub();
    await store.emit('dynamicKey${alias}', 'set', false, {
      variables: { alias: 'alias' },
    });
    expect(dynamicCalls).toEqual(2);
  });

  describe('buildKeyApi', () => {
    const newStore = buildAsync({
      store: new AsyncMemoryStorage(),
      validate: {
        simpleKey: async (v) =>
          v === null || typeof v === 'boolean' ? v : new Error('invalid'),
        'dynamicKey${alias}': async (v) =>
          v === null || typeof v === 'boolean' ? v : new Error('invalid'),
        'dynamicKey${0}': async (v) =>
          v === null || typeof v === 'boolean' ? v : new Error('invalid'),
        'dynamicKey${}': async (v) =>
          v === null || typeof v === 'boolean' ? v : new Error('invalid'),
        'simpleKey\${}': async (v) =>
          v === null || typeof v === 'boolean' ? v : new Error('invalid'),
      },
      defaultSerialize: async (v) => JSON.stringify(v),
      defaultDeserialize: async (v) => JSON.parse(v),
      validateOnSet: true,
      validateOnGet: true,
      validateOnEmit: true,
    });
    const simpleKeyApi = newStore.buildKeyApi('simpleKey');
    const dynamicKeyAliasApi = newStore.buildKeyApi('dynamicKey${alias}', {
      variables: {
        alias: 'alias',
      },
    });
    const dynamicKey1Api = newStore.buildKeyApi('dynamicKey${0}', {
      variables: { 0: '1' },
    });
    const dynamicKeyUndefinedApi = newStore.buildKeyApi('dynamicKey${0}');

    it('get default value', async () => {
      expect(await simpleKeyApi.get(null)).toBeNull();
      expect(await simpleKeyApi.get(true)).toEqual(true);
      expect(await simpleKeyApi.get(false)).toEqual(false);
    });

    it('set value', async () => {
      expect(await simpleKeyApi.set(true)).toEqual(true);
      expect(await simpleKeyApi.get(null)).toEqual(true);
      expect(await simpleKeyApi.set(null)).toEqual(true);
      expect(await simpleKeyApi.get(true)).toBeNull();
      expect(await simpleKeyApi.set(false)).toEqual(true);
      expect(await simpleKeyApi.get(true)).toEqual(false);
      expect(await simpleKeyApi.set(123 as any)).toEqual(false);
      expect(await simpleKeyApi.get(null)).toEqual(false);
      expect(await simpleKeyApi.set({} as any)).toEqual(false);
      expect(await simpleKeyApi.get(null)).toEqual(false);
      expect(await dynamicKey1Api.set(true)).toEqual(true);
      expect(await dynamicKey1Api.get(null)).toEqual(true);
      expect(await dynamicKeyAliasApi.set(true)).toEqual(true);
      expect(await dynamicKeyAliasApi.get(null)).toEqual(true);
      expect(await dynamicKey1Api.set(123 as any)).toEqual(false);
      expect(await dynamicKey1Api.get(null)).toEqual(true);
      expect(await dynamicKeyAliasApi.set(123 as any)).toEqual(false);
    });

    it('remove value', async () => {
      expect(await simpleKeyApi.set(true)).toEqual(true);
      expect(await simpleKeyApi.get(null)).toEqual(true);
      await simpleKeyApi.remove();
      expect(await simpleKeyApi.get(null)).toEqual(null);

      expect(await dynamicKeyUndefinedApi.set(true)).toEqual(true);
      expect(await dynamicKeyUndefinedApi.get(null)).toEqual(true);
      await dynamicKeyUndefinedApi.remove();
      expect(await dynamicKeyUndefinedApi.get(null)).toEqual(null);

      expect(await dynamicKeyAliasApi.set(true)).toEqual(true);
      expect(await dynamicKeyAliasApi.get(null)).toEqual(true);
      await dynamicKeyAliasApi.remove();
      expect(await dynamicKeyAliasApi.get(null)).toEqual(null);
    });

    it('key format', async () => {
      const memStore = new AsyncMemoryStorage();
      const keyStore = buildAsync({
        store: memStore,
        validate: {
          'dynamicKey${alias}': async (v) =>
            v === null || typeof v === 'boolean' ? v : new Error('invalid'),
          'dynamicKey${0}': async (v) =>
            v === null || typeof v === 'boolean' ? v : new Error('invalid'),
          'dynamicKey${}': async (v) =>
            v === null || typeof v === 'boolean' ? v : new Error('invalid'),
          'simpleKey\\${}': async (v) =>
            v === null || typeof v === 'boolean' ? v : new Error('invalid'),
          'simpleKey${alias}test': async (v) =>
            v === null || typeof v === 'boolean' ? v : new Error('invalid'),
          'simpleKey${alias}tes${alias}t': async (v) =>
            v === null || typeof v === 'boolean' ? v : new Error('invalid'),
          '${0}simpleKey${alias}tes${alias}t': async (v) =>
            v === null || typeof v === 'boolean' ? v : new Error('invalid'),
        },
      });
      expect(
        await keyStore.set('dynamicKey${0}', false, { variables: { 0: '1' } })
      ).toEqual(true);
      expect(memStore.state[`dynamicKey${1}`]).toEqual(false);

      expect(
        await keyStore.set('dynamicKey${0}', true, { variables: { 0: '1' } })
      ).toEqual(true);
      expect(memStore.state[`dynamicKey${1}`]).toEqual(true);

      expect(
        await keyStore.set('dynamicKey${}', false, { variables: { '': '1' } })
      ).toEqual(true);
      expect(memStore.state['dynamicKey${}']).toEqual(false);

      expect(await keyStore.set('simpleKey\\${}', false)).toEqual(true);
      expect(memStore.state['simpleKey\\${}']).toEqual(false);

      expect(
        await keyStore.set('simpleKey${alias}test', false, {
          variables: { alias: 'alias' },
        })
      ).toEqual(true);
      expect(memStore.state[`simpleKey${'alias'}test`]).toEqual(false);

      expect(
        await keyStore.set('simpleKey${alias}tes${alias}t', false, {
          variables: { alias: 'alias' },
        })
      ).toEqual(true);
      expect(memStore.state[`simpleKey${'alias'}tes${'alias'}t`]).toEqual(false);

      expect(
        await keyStore.set('${0}simpleKey${alias}tes${alias}t', false, {
          variables: { alias: 'alias', 0: '1' },
        })
      ).toEqual(true);
    });

    it('subscribe and emit', async () => {
      let calls = 0;
      const emittedEvents: unknown[] = [];
      const unsub = simpleKeyApi.subscribe((e) => {
        calls += 1;
        emittedEvents.push(e);
      });
      await simpleKeyApi.set(false);
      await simpleKeyApi.emit('set', false);
      await dynamicKeyUndefinedApi.emit('set', false);
      await simpleKeyApi.emit('set', false);
      unsub();
      await simpleKeyApi.emit('set', false);
      await simpleKeyApi.emit('set', false);
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
      await simpleKeyApi.emit('set', false);
      await dynamicKeyUndefinedApi.emit('set', false);
      await dynamicKey1Api.emit('set', false);
      await dynamicKeyAliasApi.emit('set', false);
      await simpleKeyApi.emit('set', false);
      dynamicUnsub();
      await dynamicKeyAliasApi.emit('set', false);
      expect(dynamicCalls).toEqual(1);
    });
  });
});
