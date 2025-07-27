import type {
  AsyncScheme,
  AsyncStore,
  CompiledKeys,
  KeyId,
  Trigger,
  Unsubscribe,
} from './types';
import { AsyncMemoryStorage } from './async-memory-storage';
import { getFullKey, parseKey } from './util';

const subscriptions = new WeakMap<AsyncStore, Map<string, Trigger[]>>();

const defaultStore = new AsyncMemoryStorage();

export function buildAsync<
  TValidate extends Record<string, (v: unknown) => Promise<unknown | Error>>,
  TSerialize extends Partial<
    Record<
      TKey,
      (
        v: Exclude<Awaited<ReturnType<TValidate[TKey]>>, Error>
      ) => Promise<unknown>
    >
  >,
  TDeserialize extends Partial<
    Record<
      TKey,
      (
        v: unknown
      ) => Promise<Exclude<Awaited<ReturnType<TValidate[TKey]>>, Error>>
    >
  >,
  TKey extends keyof TValidate & string,
>(
  scheme: AsyncScheme<TValidate, TSerialize, TDeserialize, TKey, TKey>,
  store: AsyncStore = defaultStore satisfies AsyncStore
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

  const get = async <TGetKey extends TKey>(
    key: TGetKey,
    defaultValue: Exclude<Awaited<ReturnType<TValidate[TGetKey]>>, Error>,
    options?: { variables?: KeyId[] }
  ): Promise<Exclude<Awaited<ReturnType<TValidate[TGetKey]>>, Error>> => {
    try {
      const deserializer =
        scheme.deserialize?.[key] ?? scheme.defaultDeserialize;
      const value = await store.getItem(
        getFullKey(keys, key, options?.variables)
      );
      const validated = await scheme.validate[key](
        deserializer ? await deserializer(value) : value
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

  const tryGet = async <TGetKey extends TKey>(
    key: TGetKey,
    options?: { variables?: KeyId[] }
  ): Promise<ReturnType<TValidate[TGetKey]> | Error> => {
    try {
      const deserializer =
        scheme.deserialize?.[key] ?? scheme.defaultDeserialize;
      const value = await store.getItem(
        getFullKey(keys, key, options?.variables)
      );
      return scheme.validate[key](
        deserializer ? await deserializer(value) : value
      ) as ReturnType<TValidate[TGetKey]>;
    } catch (e) {
      return e instanceof Error ? e : new Error(String(e));
    }
  };

  const set = async <TSetKey extends TKey>(
    key: TSetKey,
    value: Exclude<Awaited<ReturnType<TValidate[TSetKey]>>, Error>,
    options?: { variables?: KeyId[] }
  ): Promise<boolean> => {
    try {
      const validated = await scheme.validate[key](value);
      if (validated instanceof Error) {
        return false;
      }
      const serializer = scheme.serialize?.[key] ?? scheme.defaultSerialize;
      const fullKey = getFullKey(keys, key, options?.variables);
      await store.setItem(
        fullKey,
        serializer
          ? await serializer(
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

  const trySet = async <TSetKey extends TKey>(
    key: TSetKey,
    value: Exclude<Awaited<ReturnType<TValidate[TSetKey]>>, Error>,
    options?: { variables?: KeyId[] }
  ): Promise<void | Error> => {
    try {
      const validated = await scheme.validate[key](value);
      if (validated instanceof Error) {
        return validated;
      }
      const serializer = scheme.serialize?.[key] ?? scheme.defaultSerialize;
      const fullKey = getFullKey(keys, key, options?.variables);
      await store.setItem(
        fullKey,
        serializer
          ? await serializer(
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

  const remove = async <TRemoveKey extends TKey>(
    key: TRemoveKey,
    variables?: KeyId[]
  ): Promise<boolean> => {
    try {
      const fullKey = getFullKey(keys, key, variables);
      await store.removeItem(fullKey);
      untypedEmit(fullKey);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const tryRemove = async <TRemoveKey extends TKey>(
    key: TRemoveKey,
    variables?: KeyId[]
  ): Promise<void | Error> => {
    try {
      const fullKey = getFullKey(keys, key, variables);
      await store.removeItem(fullKey);
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

    const get = async (
      defaultValue: Exclude<Awaited<ReturnType<TValidate[TApiKey]>>, Error>
    ): Promise<Exclude<Awaited<ReturnType<TValidate[TApiKey]>>, Error>> => {
      try {
        const value = await store.getItem(precompiledKey);
        const validated = await validator(
          deserializer ? await deserializer(value) : value
        );
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

    const tryGet = async (): Promise<
      ReturnType<TValidate[TApiKey]> | Error
    > => {
      try {
        const value = await store.getItem(precompiledKey);
        return validator(
          deserializer ? await deserializer(value) : value
        ) as Awaited<ReturnType<TValidate[TApiKey]>>;
      } catch (e) {
        return e instanceof Error ? e : new Error(String(e));
      }
    };

    const set = async (
      value: Exclude<Awaited<ReturnType<TValidate[TApiKey]>>, Error>
    ): Promise<boolean> => {
      try {
        const validated = await validator(value);
        if (validated instanceof Error) {
          return false;
        }
        await store.setItem(
          precompiledKey,
          serializer
            ? await serializer(
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

    const trySet = async (
      value: Exclude<Awaited<ReturnType<TValidate[TApiKey]>>, Error>
    ): Promise<void | Error> => {
      try {
        const validated = await validator(value);
        if (validated instanceof Error) {
          return validated;
        }
        await store.setItem(
          precompiledKey,
          serializer
            ? await serializer(
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

    const remove = async (): Promise<boolean> => {
      try {
        await store.removeItem(precompiledKey);
        untypedEmit(precompiledKey);
        return true;
      } catch (e) {
        console.error(e);
        return false;
      }
    };

    const tryRemove = async (): Promise<void | Error> => {
      try {
        await store.removeItem(precompiledKey);
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
