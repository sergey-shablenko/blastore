import { describe, expect, it } from 'vitest';
import { buildSync } from '../src/sync';
import { MemoryStorage } from '../src/memory-storage';

describe(' mode test', () => {
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
    new MemoryStorage()
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
    expect(store.set('dynamicKey${0}', true, { variables: [1] })).toBe(true);
    expect(store.get('dynamicKey${0}', null, { variables: [1] })).toBe(true);
    expect(
      store.set('dynamicKey${alias}', true, { variables: ['alias'] })
    ).toBe(true);
    expect(
      store.get('dynamicKey${alias}', null, { variables: ['alias'] })
    ).toBe(true);
    expect(store.set('dynamicKey${0}', 123 as any, { variables: [1] })).toBe(
      false
    );
    expect(store.get('dynamicKey${0}', null, { variables: [1] })).toBe(true);
    expect(
      store.set('dynamicKey${alias}', 123 as any, {
        variables: ['alias'],
      })
    ).toBe(false);
  });

  it('tryGet', () => {
    expect(store.tryRemove('simpleKey')).toBeUndefined();
    expect(store.tryGet('simpleKey')).toBeInstanceOf(Error);
    expect(store.set('simpleKey', true)).toBe(true);
    expect(store.tryGet('simpleKey')).toBe(true);
  });

  it('trySet value', () => {
    expect(store.trySet('simpleKey', true)).toBeUndefined();
    expect(store.get('simpleKey', null)).toBe(true);
    expect(store.trySet('simpleKey', null)).toBeUndefined();
    expect(store.get('simpleKey', true)).toBeNull();
    expect(store.trySet('simpleKey', false)).toBeUndefined();
    expect(store.get('simpleKey', true)).toBe(false);
    expect(store.trySet('simpleKey', 123 as any)).toBeInstanceOf(Error);
    expect(store.get('simpleKey', null)).toBe(false);
    expect(store.trySet('simpleKey', {} as any)).toBeInstanceOf(Error);
    expect(store.get('simpleKey', null)).toBe(false);
    expect(
      store.trySet('dynamicKey${0}', true, { variables: [1] })
    ).toBeUndefined();
    expect(store.get('dynamicKey${0}', null, { variables: [1] })).toBe(true);
    expect(
      store.trySet('dynamicKey${alias}', true, { variables: ['alias'] })
    ).toBeUndefined();
    expect(
      store.get('dynamicKey${alias}', null, { variables: ['alias'] })
    ).toBe(true);
    expect(
      store.trySet('dynamicKey${0}', 123 as any, { variables: [1] })
    ).toBeInstanceOf(Error);
    expect(store.get('dynamicKey${0}', null, { variables: [1] })).toBe(true);
    expect(
      store.trySet('dynamicKey${alias}', 123 as any, {
        variables: ['alias'],
      })
    ).toBeInstanceOf(Error);
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
      store.set('dynamicKey${alias}', true, { variables: ['alias'] })
    ).toBe(true);
    expect(
      store.get('dynamicKey${alias}', null, { variables: ['alias'] })
    ).toBe(true);
    store.remove('dynamicKey${alias}', ['alias']);
    expect(
      store.get('dynamicKey${alias}', null, { variables: ['alias'] })
    ).toBe(null);
  });

  it('tryRemove value', () => {
    expect(store.set('simpleKey', true)).toBe(true);
    expect(store.get('simpleKey', null)).toBe(true);
    expect(store.tryRemove('simpleKey')).toBeUndefined();
    expect(store.get('simpleKey', null)).toBe(null);

    expect(store.set('dynamicKey${alias}', true)).toBe(true);
    expect(store.get('dynamicKey${alias}', null)).toBe(true);
    expect(store.tryRemove('dynamicKey${alias}')).toBeUndefined();
    expect(store.get('dynamicKey${alias}', null)).toBe(null);

    expect(
      store.set('dynamicKey${alias}', true, { variables: ['alias'] })
    ).toBe(true);
    expect(
      store.get('dynamicKey${alias}', null, { variables: ['alias'] })
    ).toBe(true);
    expect(store.tryRemove('dynamicKey${alias}', ['alias']));
    expect(
      store.get('dynamicKey${alias}', null, { variables: ['alias'] })
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
      { variables: ['alias'] }
    );
    store.emit('simpleKey');
    store.emit('dynamicKey${alias}');
    store.emit('dynamicKey${alias}', [123]);
    store.emit('dynamicKey${alias}', ['alias']);
    store.emit('simpleKey');
    dynamicUnsub();
    store.emit('dynamicKey${alias}', ['alias']);
    expect(dynamicCalls).toBe(1);
  });

  it('untypedSubscribe', () => {
    let dynamicCalls = 0;
    const dynamicUnsub = store.untypedSubscribe('dynamicKeyalias', () => {
      dynamicCalls += 1;
    });
    store.emit('simpleKey');
    store.emit('dynamicKey${alias}');
    store.emit('dynamicKey${alias}', [123]);
    store.emit('dynamicKey${alias}', ['alias']);
    store.untypedEmit('dynamicKeyalias');
    store.emit('simpleKey');
    dynamicUnsub();
    store.emit('dynamicKey${alias}', ['alias']);
    expect(dynamicCalls).toBe(2);
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
      new MemoryStorage()
    );
    const simpleKeyApi = newStore.buildKeyApi('simpleKey');
    const dynamicKeyAliasApi = newStore.buildKeyApi('dynamicKey${alias}', [
      'alias',
    ]);
    const dynamicKey1Api = newStore.buildKeyApi('dynamicKey${0}', [1]);
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

    it('tryGet', () => {
      expect(simpleKeyApi.tryRemove()).toBeUndefined();
      expect(simpleKeyApi.tryGet()).toBeInstanceOf(Error);
      expect(simpleKeyApi.set(true)).toBe(true);
      expect(simpleKeyApi.tryGet()).toBe(true);
    });

    it('trySet value', () => {
      expect(simpleKeyApi.trySet(true)).toBeUndefined();
      expect(simpleKeyApi.get(null)).toBe(true);
      expect(simpleKeyApi.trySet(null)).toBeUndefined();
      expect(simpleKeyApi.get(true)).toBeNull();
      expect(simpleKeyApi.trySet(false)).toBeUndefined();
      expect(simpleKeyApi.get(true)).toBe(false);
      expect(simpleKeyApi.trySet(123 as any)).toBeInstanceOf(Error);
      expect(simpleKeyApi.get(null)).toBe(false);
      expect(simpleKeyApi.trySet({} as any)).toBeInstanceOf(Error);
      expect(simpleKeyApi.get(null)).toBe(false);
      expect(dynamicKey1Api.trySet(true)).toBeUndefined();
      expect(dynamicKey1Api.get(null)).toBe(true);
      expect(dynamicKeyAliasApi.trySet(true)).toBeUndefined();
      expect(dynamicKeyAliasApi.get(null)).toBe(true);
      expect(dynamicKey1Api.trySet(123 as any)).toBeInstanceOf(Error);
      expect(dynamicKey1Api.get(null)).toBe(true);
      expect(dynamicKeyAliasApi.trySet(123 as any)).toBeInstanceOf(Error);
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

    it('tryRemove value', () => {
      expect(simpleKeyApi.set(true)).toBe(true);
      expect(simpleKeyApi.get(null)).toBe(true);
      expect(simpleKeyApi.tryRemove()).toBeUndefined();
      expect(simpleKeyApi.get(null)).toBe(null);

      expect(dynamicKeyUndefinedApi.set(true)).toBe(true);
      expect(dynamicKeyUndefinedApi.get(null)).toBe(true);
      expect(dynamicKeyUndefinedApi.tryRemove()).toBeUndefined();
      expect(dynamicKeyUndefinedApi.get(null)).toBe(null);

      expect(dynamicKeyAliasApi.set(true)).toBe(true);
      expect(dynamicKeyAliasApi.get(null)).toBe(true);
      expect(dynamicKeyAliasApi.tryRemove()).toBeUndefined();
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
