import { describe, expect, it } from 'vitest';
import { buildAsync } from '../src/async';
import { AsyncMemoryStorage } from '../src/async-memory-storage';

describe('async mode test', () => {
  const store = buildAsync(
    {
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
    },
    new AsyncMemoryStorage()
  );

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
    expect(await store.set('dynamicKey${0}', true, { variables: [1] })).toBe(
      true
    );
    expect(await store.get('dynamicKey${0}', null, { variables: [1] })).toBe(
      true
    );
    expect(
      await store.set('dynamicKey${alias}', true, { variables: ['alias'] })
    ).toBe(true);
    expect(
      await store.get('dynamicKey${alias}', null, { variables: ['alias'] })
    ).toBe(true);
    expect(
      await store.set('dynamicKey${0}', 123 as any, { variables: [1] })
    ).toBe(false);
    expect(await store.get('dynamicKey${0}', null, { variables: [1] })).toBe(
      true
    );
    expect(
      await store.set('dynamicKey${alias}', 123 as any, {
        variables: ['alias'],
      })
    ).toBe(false);
  });

  it('tryGet', async () => {
    expect(await store.tryRemove('simpleKey')).toBeUndefined();
    expect(await store.tryGet('simpleKey')).toBeInstanceOf(Error);
    expect(await store.set('simpleKey', true)).toBe(true);
    expect(await store.tryGet('simpleKey')).toBe(true);
  });

  it('trySet value', async () => {
    expect(await store.trySet('simpleKey', true)).toBeUndefined();
    expect(await store.get('simpleKey', null)).toBe(true);
    expect(await store.trySet('simpleKey', null)).toBeUndefined();
    expect(await store.get('simpleKey', true)).toBeNull();
    expect(await store.trySet('simpleKey', false)).toBeUndefined();
    expect(await store.get('simpleKey', true)).toBe(false);
    expect(await store.trySet('simpleKey', 123 as any)).toBeInstanceOf(Error);
    expect(await store.get('simpleKey', null)).toBe(false);
    expect(await store.trySet('simpleKey', {} as any)).toBeInstanceOf(Error);
    expect(await store.get('simpleKey', null)).toBe(false);
    expect(
      await store.trySet('dynamicKey${0}', true, { variables: [1] })
    ).toBeUndefined();
    expect(await store.get('dynamicKey${0}', null, { variables: [1] })).toBe(
      true
    );
    expect(
      await store.trySet('dynamicKey${alias}', true, { variables: ['alias'] })
    ).toBeUndefined();
    expect(
      await store.get('dynamicKey${alias}', null, { variables: ['alias'] })
    ).toBe(true);
    expect(
      await store.trySet('dynamicKey${0}', 123 as any, { variables: [1] })
    ).toBeInstanceOf(Error);
    expect(await store.get('dynamicKey${0}', null, { variables: [1] })).toBe(
      true
    );
    expect(
      await store.trySet('dynamicKey${alias}', 123 as any, {
        variables: ['alias'],
      })
    ).toBeInstanceOf(Error);
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
      await store.set('dynamicKey${alias}', true, { variables: ['alias'] })
    ).toBe(true);
    expect(
      await store.get('dynamicKey${alias}', null, { variables: ['alias'] })
    ).toBe(true);
    await store.remove('dynamicKey${alias}', ['alias']);
    expect(
      await store.get('dynamicKey${alias}', null, { variables: ['alias'] })
    ).toBe(null);
  });

  it('tryRemove value', async () => {
    expect(await store.set('simpleKey', true)).toBe(true);
    expect(await store.get('simpleKey', null)).toBe(true);
    expect(await store.tryRemove('simpleKey')).toBeUndefined();
    expect(await store.get('simpleKey', null)).toBe(null);

    expect(await store.set('dynamicKey${alias}', true)).toBe(true);
    expect(await store.get('dynamicKey${alias}', null)).toBe(true);
    expect(await store.tryRemove('dynamicKey${alias}')).toBeUndefined();
    expect(await store.get('dynamicKey${alias}', null)).toBe(null);

    expect(
      await store.set('dynamicKey${alias}', true, { variables: ['alias'] })
    ).toBe(true);
    expect(
      await store.get('dynamicKey${alias}', null, { variables: ['alias'] })
    ).toBe(true);
    expect(await store.tryRemove('dynamicKey${alias}', ['alias']));
    expect(
      await store.get('dynamicKey${alias}', null, { variables: ['alias'] })
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
    const newStore = buildAsync(
      {
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
      },
      new AsyncMemoryStorage()
    );
    const simpleKeyApi = newStore.buildKeyApi('simpleKey');
    const dynamicKeyAliasApi = newStore.buildKeyApi('dynamicKey${alias}', [
      'alias',
    ]);
    const dynamicKey1Api = newStore.buildKeyApi('dynamicKey${0}', [1]);
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

    it('tryGet', async () => {
      expect(await simpleKeyApi.tryRemove()).toBeUndefined();
      expect(await simpleKeyApi.tryGet()).toBeInstanceOf(Error);
      expect(await simpleKeyApi.set(true)).toBe(true);
      expect(await simpleKeyApi.tryGet()).toBe(true);
    });

    it('trySet value', async () => {
      expect(await simpleKeyApi.trySet(true)).toBeUndefined();
      expect(await simpleKeyApi.get(null)).toBe(true);
      expect(await simpleKeyApi.trySet(null)).toBeUndefined();
      expect(await simpleKeyApi.get(true)).toBeNull();
      expect(await simpleKeyApi.trySet(false)).toBeUndefined();
      expect(await simpleKeyApi.get(true)).toBe(false);
      expect(await simpleKeyApi.trySet(123 as any)).toBeInstanceOf(Error);
      expect(await simpleKeyApi.get(null)).toBe(false);
      expect(await simpleKeyApi.trySet({} as any)).toBeInstanceOf(Error);
      expect(await simpleKeyApi.get(null)).toBe(false);
      expect(await dynamicKey1Api.trySet(true)).toBeUndefined();
      expect(await dynamicKey1Api.get(null)).toBe(true);
      expect(await dynamicKeyAliasApi.trySet(true)).toBeUndefined();
      expect(await dynamicKeyAliasApi.get(null)).toBe(true);
      expect(await dynamicKey1Api.trySet(123 as any)).toBeInstanceOf(Error);
      expect(await dynamicKey1Api.get(null)).toBe(true);
      expect(await dynamicKeyAliasApi.trySet(123 as any)).toBeInstanceOf(Error);
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

    it('tryRemove value', async () => {
      expect(await simpleKeyApi.set(true)).toBe(true);
      expect(await simpleKeyApi.get(null)).toBe(true);
      expect(await simpleKeyApi.tryRemove()).toBeUndefined();
      expect(await simpleKeyApi.get(null)).toBe(null);

      expect(await dynamicKeyUndefinedApi.set(true)).toBe(true);
      expect(await dynamicKeyUndefinedApi.get(null)).toBe(true);
      expect(await dynamicKeyUndefinedApi.tryRemove()).toBeUndefined();
      expect(await dynamicKeyUndefinedApi.get(null)).toBe(null);

      expect(await dynamicKeyAliasApi.set(true)).toBe(true);
      expect(await dynamicKeyAliasApi.get(null)).toBe(true);
      expect(await dynamicKeyAliasApi.tryRemove()).toBeUndefined();
      expect(await dynamicKeyAliasApi.get(null)).toBe(null);
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
