import { describe, expect, it } from 'vitest';
import { buildSync } from '../src/sync';
import { SyncMemoryStorage } from '../src/sync-memory-storage';

describe('sync mode test', () => {
  const testMemStore = new SyncMemoryStorage();
  const store = buildSync(
    {
      validate: {
        simpleKey: (v) =>
          v === null || typeof v === 'boolean' ? v : new Error('invalid'),
        'dynamicKey${alias}': (v) =>
          v === null || typeof v === 'boolean' ? v : new Error('invalid'),
        'dynamicKey${0}': (v) =>
          v === null || typeof v === 'boolean' ? v : new Error('invalid'),
        'dynamicKey${}': (v) =>
          v === null || typeof v === 'boolean' ? v : new Error('invalid'),
        'simpleKey\${}': (v) =>
          v === null || typeof v === 'boolean' ? v : new Error('invalid'),
      },
    },
    testMemStore,
    { validateOnGet: true, validateOnSet: true }
  );

  it('get default value', () => {
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
    store.emit('simpleKey');
    store.emit('dynamicKey${0}');
    store.emit('simpleKey');
    unsub();
    store.emit('simpleKey');
    store.emit('simpleKey');
    expect(calls).toBe(2);

    let dynamicCalls = 0;
    const dynamicUnsub = store.subscribe(
      'dynamicKey${alias}',
      () => {
        dynamicCalls += 1;
      },
      { alias: 'alias' }
    );
    store.emit('simpleKey');
    store.emit('dynamicKey${alias}');
    store.emit('dynamicKey${alias}', { alias: '123' });
    store.emit('dynamicKey${alias}', { alias: 'alias' });
    store.emit('simpleKey');
    dynamicUnsub();
    store.emit('dynamicKey${alias}', { alias: 'alias' });
    expect(dynamicCalls).toBe(1);
  });

  it('untypedSubscribe', () => {
    let dynamicCalls = 0;
    const dynamicUnsub = store.untypedSubscribe('dynamicKeyalias', () => {
      dynamicCalls += 1;
    });
    store.emit('simpleKey');
    store.emit('dynamicKey${alias}');
    store.emit('dynamicKey${alias}', { alias: '123' });
    store.emit('dynamicKey${alias}', { alias: 'alias' });
    store.untypedEmit('dynamicKeyalias');
    store.emit('simpleKey');
    dynamicUnsub();
    store.emit('dynamicKey${alias}', { alias: 'alias' });
    expect(dynamicCalls).toBe(2);
  });

  it('key format', () => {
    const memStore = new SyncMemoryStorage();
    const keyStore = buildSync(
      {
        validate: {
          'dynamicKey${alias}': (v) =>
            v === null || typeof v === 'boolean' ? v : new Error('invalid'),
          'dynamicKey${0}': (v) =>
            v === null || typeof v === 'boolean' ? v : new Error('invalid'),
          'dynamicKey${}': (v) =>
            v === null || typeof v === 'boolean' ? v : new Error('invalid'),
          'simpleKey\\${}': (v) =>
            v === null || typeof v === 'boolean' ? v : new Error('invalid'),
          'simpleKey${alias}test': (v) =>
            v === null || typeof v === 'boolean' ? v : new Error('invalid'),
          'simpleKey${alias}tes${alias}t': (v) =>
            v === null || typeof v === 'boolean' ? v : new Error('invalid'),
          '${0}simpleKey${alias}tes${alias}t': (v) =>
            v === null || typeof v === 'boolean' ? v : new Error('invalid'),
        },
      },
      memStore,
      { validateOnSet: true, validateOnGet: true }
    );
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
    const newStore = buildSync(
      {
        validate: {
          simpleKey: (v) =>
            v === null || typeof v === 'boolean' ? v : new Error('invalid'),
          'dynamicKey${alias}': (v) =>
            v === null || typeof v === 'boolean' ? v : new Error('invalid'),
          'dynamicKey${0}': (v) =>
            v === null || typeof v === 'boolean' ? v : new Error('invalid'),
          'dynamicKey${}': (v) =>
            v === null || typeof v === 'boolean' ? v : new Error('invalid'),
          'simpleKey\${}': (v) =>
            v === null || typeof v === 'boolean' ? v : new Error('invalid'),
        },
      },
      new SyncMemoryStorage(),
      { validateOnSet: true, validateOnGet: true }
    );
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
      simpleKeyApi.emit();
      dynamicKeyUndefinedApi.emit();
      simpleKeyApi.emit();
      unsub();
      simpleKeyApi.emit();
      simpleKeyApi.emit();
      expect(calls).toBe(2);

      let dynamicCalls = 0;
      const dynamicUnsub = dynamicKeyAliasApi.subscribe(() => {
        dynamicCalls += 1;
      });
      simpleKeyApi.emit();
      dynamicKeyUndefinedApi.emit();
      dynamicKey1Api.emit();
      dynamicKeyAliasApi.emit();
      simpleKeyApi.emit();
      dynamicUnsub();
      dynamicKeyAliasApi.emit();
      expect(dynamicCalls).toBe(1);
    });
  });
});
