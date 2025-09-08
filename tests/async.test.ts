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
  });

  it('get default value', async () => {
    expect(await store.get('simpleKey', null)).toBeNull();
    expect(await store.get('simpleKey', true)).toBe(true);
    expect(await store.get('simpleKey', false)).toBe(false);
  });

  it('set value', async () => {
    expect(await store.set('simpleKey', true)).toBe(true);
    expect(await store.get('simpleKey', null)).toBe(true);
    expect(await store.set('simpleKey', null)).toBe(true);
    expect(await store.get('simpleKey', true)).toBeNull();
    expect(await store.set('simpleKey', false)).toBe(true);
    expect(await store.get('simpleKey', true)).toBe(false);
    expect(await store.set('simpleKey', 123 as any)).toBe(false);
    expect(await store.get('simpleKey', null)).toBe(false);
    expect(await store.set('simpleKey', {} as any)).toBe(false);
    expect(await store.get('simpleKey', null)).toBe(false);
    expect(
      await store.set('dynamicKey${0}', true, { variables: { 0: '1' } })
    ).toBe(true);
    expect(
      await store.get('dynamicKey${0}', null, { variables: { 0: '1' } })
    ).toBe(true);
    expect(
      await store.set('dynamicKey${alias}', true, {
        variables: { alias: 'alias' },
      })
    ).toBe(true);
    expect(
      await store.get('dynamicKey${alias}', null, {
        variables: { alias: 'alias' },
      })
    ).toBe(true);
    expect(
      await store.set('dynamicKey${0}', 123 as any, { variables: { 0: '1' } })
    ).toBe(false);
    expect(
      await store.get('dynamicKey${0}', null, { variables: { 0: '1' } })
    ).toBe(true);
    expect(
      await store.set('dynamicKey${alias}', 123 as any, {
        variables: { alias: 'alias' },
      })
    ).toBe(false);
  });

  it('remove value', async () => {
    expect(await store.set('simpleKey', true)).toBe(true);
    expect(await store.get('simpleKey', null)).toBe(true);
    await store.remove('simpleKey');
    expect(await store.get('simpleKey', null)).toBe(null);

    expect(await store.set('dynamicKey${alias}', true)).toBe(true);
    expect(await store.get('dynamicKey${alias}', null)).toBe(true);
    await store.remove('dynamicKey${alias}');
    expect(await store.get('dynamicKey${alias}', null)).toBe(null);

    expect(
      await store.set('dynamicKey${alias}', true, {
        variables: { alias: 'alias' },
      })
    ).toBe(true);
    expect(
      await store.get('dynamicKey${alias}', null, {
        variables: { alias: 'alias' },
      })
    ).toBe(true);
    await store.remove('dynamicKey${alias}', { variables: { alias: 'alias' } });
    expect(
      await store.get('dynamicKey${alias}', null, {
        variables: { alias: 'alias' },
      })
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

  it('untypedSubscribe', () => {
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
    store.untypedEmit('dynamicKeyalias', 'set', false);
    store.emit('simpleKey', 'set', false);
    dynamicUnsub();
    store.emit('dynamicKey${alias}', 'set', false, {
      variables: { alias: 'alias' },
    });
    expect(dynamicCalls).toBe(2);
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
      validateOnSet: true,
      validateOnGet: true,
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
      expect(await simpleKeyApi.get(true)).toBe(true);
      expect(await simpleKeyApi.get(false)).toBe(false);
    });

    it('set value', async () => {
      expect(await simpleKeyApi.set(true)).toBe(true);
      expect(await simpleKeyApi.get(null)).toBe(true);
      expect(await simpleKeyApi.set(null)).toBe(true);
      expect(await simpleKeyApi.get(true)).toBeNull();
      expect(await simpleKeyApi.set(false)).toBe(true);
      expect(await simpleKeyApi.get(true)).toBe(false);
      expect(await simpleKeyApi.set(123 as any)).toBe(false);
      expect(await simpleKeyApi.get(null)).toBe(false);
      expect(await simpleKeyApi.set({} as any)).toBe(false);
      expect(await simpleKeyApi.get(null)).toBe(false);
      expect(await dynamicKey1Api.set(true)).toBe(true);
      expect(await dynamicKey1Api.get(null)).toBe(true);
      expect(await dynamicKeyAliasApi.set(true)).toBe(true);
      expect(await dynamicKeyAliasApi.get(null)).toBe(true);
      expect(await dynamicKey1Api.set(123 as any)).toBe(false);
      expect(await dynamicKey1Api.get(null)).toBe(true);
      expect(await dynamicKeyAliasApi.set(123 as any)).toBe(false);
    });

    it('remove value', async () => {
      expect(await simpleKeyApi.set(true)).toBe(true);
      expect(await simpleKeyApi.get(null)).toBe(true);
      await simpleKeyApi.remove();
      expect(await simpleKeyApi.get(null)).toBe(null);

      expect(await dynamicKeyUndefinedApi.set(true)).toBe(true);
      expect(await dynamicKeyUndefinedApi.get(null)).toBe(true);
      await dynamicKeyUndefinedApi.remove();
      expect(await dynamicKeyUndefinedApi.get(null)).toBe(null);

      expect(await dynamicKeyAliasApi.set(true)).toBe(true);
      expect(await dynamicKeyAliasApi.get(null)).toBe(true);
      await dynamicKeyAliasApi.remove();
      expect(await dynamicKeyAliasApi.get(null)).toBe(null);
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
      ).toBe(true);
      expect(memStore.state[`dynamicKey${1}`]).toBe(false);

      expect(
        await keyStore.set('dynamicKey${0}', true, { variables: { 0: '1' } })
      ).toBe(true);
      expect(memStore.state[`dynamicKey${1}`]).toBe(true);

      expect(
        await keyStore.set('dynamicKey${}', false, { variables: { '': '1' } })
      ).toBe(true);
      expect(memStore.state['dynamicKey${}']).toBe(false);

      expect(await keyStore.set('simpleKey\\${}', false)).toBe(true);
      expect(memStore.state['simpleKey\\${}']).toBe(false);

      expect(
        await keyStore.set('simpleKey${alias}test', false, {
          variables: { alias: 'alias' },
        })
      ).toBe(true);
      expect(memStore.state[`simpleKey${'alias'}test`]).toBe(false);

      expect(
        await keyStore.set('simpleKey${alias}tes${alias}t', false, {
          variables: { alias: 'alias' },
        })
      ).toBe(true);
      expect(memStore.state[`simpleKey${'alias'}tes${'alias'}t`]).toBe(false);

      expect(
        await keyStore.set('${0}simpleKey${alias}tes${alias}t', false, {
          variables: { alias: 'alias', 0: '1' },
        })
      ).toBe(true);
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
