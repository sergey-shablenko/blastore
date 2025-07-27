import type {
  CompiledKeys,
  KeyId,
  Scheme,
  SyncStore,
  Trigger,
  Unsubscribe,
} from './types';
import { MemoryStorage } from './memory-storage';
import { getFullKey, parseKey } from './util';

const subscriptions = new WeakMap<SyncStore, Map<string, Trigger[]>>();

const defaultStore = new MemoryStorage();

export function buildSync<
  TValidate extends Record<string, (v: unknown) => unknown | Error>,
  TSerialize extends Partial<
    Record<TKey, (v: Exclude<ReturnType<TValidate[TKey]>, Error>) => unknown>
  >,
  TDeserialize extends Partial<
    Record<TKey, (v: unknown) => Exclude<ReturnType<TValidate[TKey]>, Error>>
  >,
  TKey extends keyof TValidate & string,
>(
  scheme: Scheme<TValidate, TSerialize, TDeserialize, TKey, TKey>,
  store: SyncStore = defaultStore satisfies SyncStore
) {
  // only holds compiled keys, not simple keys
  const keys = Object.keys(scheme.validate).reduce((obj, key) => {
    const parts = parseKey(key);
    if (parts.length) {
      obj[key] = new Function(
        'vars',
        `return ${parts.map(([s, i]) => `'${s}' + (vars[${i}] === null ? '' : vars[${i}])`).join(' + ')};`
      ) as (vars: KeyId[]) => string;
    }
    return obj;
  }, {} as CompiledKeys);

  const emit = (key: TKey, variables?: KeyId[]): void => {
    const subs = subscriptions
      .get(store)
      ?.get(getFullKey(keys, key, variables));
    if (subs?.length) {
      for (let i = 0; i < subs.length; i++) {
        subs[i]();
      }
    }
  };

  const untypedEmit = (key: string): void => emit(key as TKey);

  const get = <TGetKey extends TKey>(
    key: TGetKey,
    defaultValue: Exclude<ReturnType<TValidate[TGetKey]>, Error>,
    options?: { variables?: KeyId[] }
  ): Exclude<ReturnType<TValidate[TGetKey]>, Error> => {
    try {
      const deserializer =
        scheme.deserialize?.[key] ?? scheme.defaultDeserialize;
      const value = store.getItem(getFullKey(keys, key, options?.variables));
      const validated = scheme.validate[key](
        deserializer ? deserializer(value) : value
      );
      if (validated instanceof Error) {
        return defaultValue;
      }
      return validated as Exclude<
        Awaited<ReturnType<TValidate[TGetKey]>>,
        Error
      >;
    } catch (e) {
      console.error(e);
      return defaultValue;
    }
  };

  const tryGet = <TGetKey extends TKey>(
    key: TGetKey,
    options?: { variables?: KeyId[] }
  ): ReturnType<TValidate[TGetKey]> | Error => {
    try {
      const deserializer =
        scheme.deserialize?.[key] ?? scheme.defaultDeserialize;
      const value = store.getItem(getFullKey(keys, key, options?.variables));
      return scheme.validate[key](
        deserializer ? deserializer(value) : value
      ) as ReturnType<TValidate[TGetKey]>;
    } catch (e) {
      return e instanceof Error ? e : new Error(String(e));
    }
  };

  const set = <TSetKey extends TKey>(
    key: TSetKey,
    value: Exclude<ReturnType<TValidate[TSetKey]>, Error>,
    options?: { variables?: KeyId[] }
  ): boolean => {
    try {
      const validated = scheme.validate[key](value);
      if (validated instanceof Error) {
        return false;
      }
      const serializer = scheme.serialize?.[key] ?? scheme.defaultSerialize;
      const fullKey = getFullKey(keys, key, options?.variables);
      store.setItem(
        fullKey,
        serializer
          ? serializer(
              validated as Exclude<
                Awaited<ReturnType<TValidate[TSetKey]>>,
                Error
              >
            )
          : validated
      );
      untypedEmit(fullKey);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const trySet = <TSetKey extends TKey>(
    key: TSetKey,
    value: Exclude<ReturnType<TValidate[TSetKey]>, Error>,
    options?: { variables?: KeyId[] }
  ): void | Error => {
    try {
      const validated = scheme.validate[key](value);
      if (validated instanceof Error) {
        return validated;
      }
      const serializer = scheme.serialize?.[key] ?? scheme.defaultSerialize;
      const fullKey = getFullKey(keys, key, options?.variables);
      store.setItem(
        fullKey,
        serializer
          ? serializer(
              validated as Exclude<
                Awaited<ReturnType<TValidate[TSetKey]>>,
                Error
              >
            )
          : validated
      );
      untypedEmit(fullKey);
    } catch (e) {
      return e instanceof Error ? e : new Error(String(e));
    }
  };

  const remove = <TRemoveKey extends TKey>(
    key: TRemoveKey,
    variables?: KeyId[]
  ): boolean => {
    try {
      const fullKey = getFullKey(keys, key, variables);
      store.removeItem(fullKey);
      untypedEmit(fullKey);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const tryRemove = <TRemoveKey extends TKey>(
    key: TRemoveKey,
    variables?: KeyId[]
  ): void | Error => {
    try {
      const fullKey = getFullKey(keys, key, variables);
      store.removeItem(fullKey);
      untypedEmit(fullKey);
    } catch (e) {
      return e instanceof Error ? e : new Error(String(e));
    }
  };

  const subscribe = <TSubKey extends TKey>(
    key: TSubKey,
    trigger: Trigger,
    options?: { variables?: KeyId[] }
  ): Unsubscribe => {
    let storeSubscriptions = subscriptions.get(store);
    const fullKey = getFullKey(keys, key, options?.variables);

    if (!storeSubscriptions) {
      storeSubscriptions = new Map<string, Trigger[]>();
      subscriptions.set(store, storeSubscriptions);
    }

    const subscriber = storeSubscriptions.get(fullKey);

    if (subscriber) {
      subscriber.push(trigger);
    } else {
      storeSubscriptions.set(fullKey, [trigger]);
    }

    return () => {
      const subs = storeSubscriptions.get(fullKey);
      if (!subs) {
        return;
      }
      subs[subs.indexOf(trigger)] = subs[subs.length - 1];
      subs.pop();
    };
  };

  const untypedSubscribe = (key: string, trigger: Trigger) =>
    subscribe(key as TKey, trigger);

  const buildKeyApi = <TApiKey extends TKey>(
    key: TApiKey,
    variables?: KeyId[]
  ) => {
    const validator = scheme.validate[key];
    const serializer = scheme.serialize?.[key] ?? scheme.defaultSerialize;
    const deserializer = scheme.deserialize?.[key] ?? scheme.defaultDeserialize;
    const precompiledKey = getFullKey(keys, key, variables);

    const emit = (): void => {
      const subs = subscriptions.get(store)?.get(precompiledKey);
      if (subs?.length) {
        for (let i = 0; i < subs.length; i++) {
          subs[i]();
        }
      }
    };

    const get = (
      defaultValue: Exclude<ReturnType<TValidate[TApiKey]>, Error>
    ): Exclude<ReturnType<TValidate[TApiKey]>, Error> => {
      try {
        const value = store.getItem(precompiledKey);
        const validated = validator(deserializer ? deserializer(value) : value);
        if (validated instanceof Error) {
          return defaultValue;
        }
        return validated as Exclude<
          Awaited<ReturnType<TValidate[TApiKey]>>,
          Error
        >;
      } catch (e) {
        console.error(e);
        return defaultValue;
      }
    };

    const tryGet = (): ReturnType<TValidate[TApiKey]> | Error => {
      try {
        const value = store.getItem(precompiledKey);
        return validator(
          deserializer ? deserializer(value) : value
        ) as ReturnType<TValidate[TApiKey]>;
      } catch (e) {
        return e instanceof Error ? e : new Error(String(e));
      }
    };

    const set = (
      value: Exclude<ReturnType<TValidate[TApiKey]>, Error>
    ): boolean => {
      try {
        const validated = validator(value);
        if (validated instanceof Error) {
          return false;
        }
        store.setItem(
          precompiledKey,
          serializer
            ? serializer(
                validated as Exclude<
                  Awaited<ReturnType<TValidate[TApiKey]>>,
                  Error
                >
              )
            : validated
        );
        untypedEmit(precompiledKey);
        return true;
      } catch (e) {
        console.error(e);
        return false;
      }
    };

    const trySet = (
      value: Exclude<ReturnType<TValidate[TApiKey]>, Error>
    ): void | Error => {
      try {
        const validated = validator(value);
        if (validated instanceof Error) {
          return validated;
        }
        store.setItem(
          precompiledKey,
          serializer
            ? serializer(
                validated as Exclude<
                  Awaited<ReturnType<TValidate[TApiKey]>>,
                  Error
                >
              )
            : validated
        );
        untypedEmit(precompiledKey);
      } catch (e) {
        return e instanceof Error ? e : new Error(String(e));
      }
    };

    const remove = (): boolean => {
      try {
        store.removeItem(precompiledKey);
        untypedEmit(precompiledKey);
        return true;
      } catch (e) {
        console.error(e);
        return false;
      }
    };

    const tryRemove = (): void | Error => {
      try {
        store.removeItem(precompiledKey);
        untypedEmit(precompiledKey);
      } catch (e) {
        return e instanceof Error ? e : new Error(String(e));
      }
    };

    const subscribe = (trigger: Trigger): Unsubscribe => {
      let storeSubscriptions = subscriptions.get(store);

      if (!storeSubscriptions) {
        storeSubscriptions = new Map<string, Trigger[]>();
        subscriptions.set(store, storeSubscriptions);
      }

      const subscriber = storeSubscriptions.get(precompiledKey);

      if (subscriber) {
        subscriber.push(trigger);
      } else {
        storeSubscriptions.set(precompiledKey, [trigger]);
      }

      return () => {
        const subs = storeSubscriptions.get(precompiledKey);
        if (!subs) {
          return;
        }
        subs[subs.indexOf(trigger)] = subs[subs.length - 1];
        subs.pop();
      };
    };

    return { get, set, remove, trySet, tryGet, tryRemove, subscribe, emit };
  };

  return {
    get,
    set,
    remove,
    trySet,
    tryGet,
    tryRemove,
    subscribe,
    untypedSubscribe,
    emit,
    untypedEmit,
    buildKeyApi,
  };
}
