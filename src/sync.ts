import type {
  CompiledKeys,
  ExtractVars,
  KeyVariable,
  KeyVariables,
  SyncSchema,
  SyncStore,
  Trigger,
  Unsubscribe,
} from './types';
import { SyncMemoryStorage } from './sync-memory-storage';
import { getFullKey, parseKey } from './util';

const subscriptions = new WeakMap<SyncStore, Map<string, Trigger[]>>();

const defaultStore = new SyncMemoryStorage();

export type BuildSync<
  TValidate extends Record<string, (v: unknown) => unknown | Error>,
  TSerialize extends Partial<
    Record<TKey, (v: Exclude<ReturnType<TValidate[TKey]>, Error>) => unknown>
  >,
  TDeserialize extends Partial<
    Record<TKey, (v: unknown) => Exclude<ReturnType<TValidate[TKey]>, Error>>
  >,
  TKey extends keyof TValidate & string,
> = (
  schema: SyncSchema<TValidate, TSerialize, TDeserialize, TKey, TKey>,
  store: SyncStore,
  defaultOptions?: { validateOnGet?: boolean; validateOnSet?: boolean }
) => {
  schema: SyncSchema<TValidate, TSerialize, TDeserialize, TKey, TKey>;
  get<TGetKey extends TKey>(
    key: TGetKey,
    defaultValue: Exclude<ReturnType<TValidate[TGetKey]>, Error>,
    options?: KeyVariables<TGetKey> & {
      validate?: boolean;
      out?: { error?: Error };
    }
  ): Exclude<ReturnType<TValidate[TGetKey]>, Error>;
  set<TSetKey extends TKey>(
    key: TSetKey,
    value: Exclude<ReturnType<TValidate[TSetKey]>, Error>,
    options?: KeyVariables<TSetKey> & {
      validate?: boolean;
      out?: { error?: Error };
    }
  ): boolean;
  remove<TRemoveKey extends TKey>(
    key: TRemoveKey,
    options?: KeyVariables<TRemoveKey> & {
      out?: { error?: Error };
    }
  ): boolean;
  subscribe<TSubKey extends TKey>(
    key: TSubKey,
    trigger: Trigger,
    variables?: KeyVariables<TSubKey>['variables']
  ): Unsubscribe;
  untypedSubscribe(key: string, trigger: Trigger): Unsubscribe;
  emit<TEmitKey extends TKey>(
    key: TEmitKey,
    variables?: KeyVariables<TEmitKey>['variables']
  ): void;
  untypedEmit(key: string): void;
  buildKeyApi: <TApiKey extends TKey>(
    key: TApiKey,
    options?: KeyVariables<TApiKey> & {
      validateOnGet?: boolean;
      validateOnSet?: boolean;
      out?: { error?: Error };
    }
  ) => {
    get(
      defaultValue: Exclude<ReturnType<TValidate[TApiKey]>, Error>
    ): Exclude<ReturnType<TValidate[TApiKey]>, Error>;
    set(value: Exclude<ReturnType<TValidate[TApiKey]>, Error>): boolean;
    remove(): boolean;
    subscribe(trigger: Trigger): Unsubscribe;
    emit(): void;
  };
};

export const buildSync = (<
  TValidate extends Record<string, (v: unknown) => unknown | Error>,
  TSerialize extends Partial<
    Record<TKey, (v: Exclude<ReturnType<TValidate[TKey]>, Error>) => unknown>
  >,
  TDeserialize extends Partial<
    Record<TKey, (v: unknown) => Exclude<ReturnType<TValidate[TKey]>, Error>>
  >,
  TKey extends keyof TValidate & string,
>(
  schema: SyncSchema<TValidate, TSerialize, TDeserialize, TKey, TKey>,
  store: SyncStore = defaultStore satisfies SyncStore,
  defaultOptions?: { validateOnGet?: boolean; validateOnSet?: boolean }
) => {
  const keys = Object.freeze(
    Object.keys(schema.validate).reduce((obj, key) => {
      const parts = parseKey(key);
      if (parts.some(([, variable]) => variable)) {
        obj[key] = new Function(
          'vars',
          `return ${parts.map(([s, i]) => [`'${s}'`, i ? `vars${/^\d+$/i.test(i) || i === 'true' || i === 'false' ? `[${i}]` : /^([^0-9a-z]+|)$/i.test(i) ? `['${i}']` : `.${i}`}` : null].filter(Boolean).join(' + ')).join(' + ')};`
        ) as (vars: Record<string, KeyVariable>) => string;
      }
      return obj;
    }, {} as CompiledKeys)
  );

  const untypedSubscribe: ReturnType<
    BuildSync<TValidate, TSerialize, TDeserialize, TKey>
  >['untypedSubscribe'] = (key, trigger) => {
    let storeSubscriptions = subscriptions.get(store);

    if (!storeSubscriptions) {
      storeSubscriptions = new Map<string, Trigger[]>();
      subscriptions.set(store, storeSubscriptions);
    }

    const subscriber = storeSubscriptions.get(key);

    if (subscriber) {
      subscriber.push(trigger);
    } else {
      storeSubscriptions.set(key, [trigger]);
    }

    return () => {
      const subs = storeSubscriptions.get(key);
      if (!subs) {
        return;
      }
      subs[subs.indexOf(trigger)] = subs[subs.length - 1];
      subs.pop();
    };
  };

  const subscribe: ReturnType<
    BuildSync<TValidate, TSerialize, TDeserialize, TKey>
  >['subscribe'] = (key, trigger, variables) => {
    const fullKey = variables ? getFullKey(keys, key, variables) : key;
    return untypedSubscribe(fullKey, trigger);
  };

  const untypedEmit: ReturnType<
    BuildSync<TValidate, TSerialize, TDeserialize, TKey>
  >['untypedEmit'] = (key) => {
    const storeSubs = subscriptions.get(store);
    const subs = storeSubs && storeSubs.get(key);
    if (subs && subs.length) {
      for (let i = 0; i < subs.length; i++) {
        subs[i]();
      }
    }
  };

  const emit: ReturnType<
    BuildSync<TValidate, TSerialize, TDeserialize, TKey>
  >['emit'] = (key, variables) => {
    const fullKey = variables ? getFullKey(keys, key, variables) : key;
    untypedEmit(fullKey);
  };

  const get: ReturnType<
    BuildSync<TValidate, TSerialize, TDeserialize, TKey>
  >['get'] = (key, defaultValue, options) => {
    const deserializer =
      typeof schema.deserialize?.[key] === 'function'
        ? schema.deserialize[key]
        : typeof schema.defaultDeserialize === 'function'
          ? schema.defaultDeserialize
          : undefined;
    let fullKey = key;
    let out = undefined;
    let validate = defaultOptions?.validateOnGet === true;
    const validator = schema.validate[key];

    if (options) {
      if (options.variables) {
        fullKey = getFullKey(keys, key, options.variables) as any;
      }
      if (options.out && typeof options.out === 'object') {
        out = options.out;
      }
      if (typeof options.validate === 'boolean') {
        validate = options.validate;
      }
    }

    try {
      let value = store.getItem(fullKey);

      if (deserializer) {
        value = deserializer(value);
      }

      if (validate) {
        value = validator(value);

        if (value instanceof Error) {
          if (out) {
            out.error = value;
          }
          return defaultValue;
        }
      }

      return value as Exclude<Awaited<ReturnType<TValidate[TKey]>>, Error>;
    } catch (e) {
      if (out) {
        out.error = e instanceof Error ? e : new Error(String(e));
      }
      return defaultValue;
    }
  };

  const set: ReturnType<
    BuildSync<TValidate, TSerialize, TDeserialize, TKey>
  >['set'] = (key, value, options) => {
    const serializer =
      typeof schema.serialize?.[key] === 'function'
        ? schema.serialize[key]
        : typeof schema.defaultSerialize === 'function'
          ? schema.defaultSerialize
          : undefined;
    let fullKey = key;
    let out = undefined;
    let validate = defaultOptions?.validateOnSet === true;
    const validator = schema.validate[key];

    if (options) {
      if (options.variables) {
        fullKey = getFullKey(keys, key, options.variables) as any;
      }
      if (options.out && typeof options.out === 'object') {
        out = options.out;
      }
      if (typeof options.validate === 'boolean') {
        validate = options.validate;
      }
    }

    try {
      let insertValue: unknown = value;
      if (validate) {
        insertValue = validator(insertValue);

        if (insertValue instanceof Error) {
          if (out) {
            out.error = insertValue;
          }
          return false;
        }
      }
      if (serializer) {
        insertValue = serializer(insertValue as any);
      }
      store.setItem(fullKey, insertValue);
      untypedEmit(fullKey);
      return true;
    } catch (e) {
      if (out) {
        out.error = e instanceof Error ? e : new Error(String(e));
      }
      return false;
    }
  };

  const remove: ReturnType<
    BuildSync<TValidate, TSerialize, TDeserialize, TKey>
  >['remove'] = (key, options) => {
    let fullKey = key;
    let out = undefined;

    if (options) {
      if (options.variables) {
        fullKey = getFullKey(keys, key, options.variables) as any;
      }
      if (options.out && typeof options.out === 'object') {
        out = options.out;
      }
    }

    try {
      store.removeItem(fullKey);
      untypedEmit(fullKey);
      return true;
    } catch (e) {
      if (out) {
        out.error = e instanceof Error ? e : new Error(String(e));
      }
      return false;
    }
  };

  const buildKeyApi: ReturnType<
    BuildSync<TValidate, TSerialize, TDeserialize, TKey>
  >['buildKeyApi'] = (key, options) => {
    const deserializer =
      typeof schema.deserialize?.[key] === 'function'
        ? schema.deserialize[key]
        : typeof schema.defaultDeserialize === 'function'
          ? schema.defaultDeserialize
          : undefined;
    const serializer =
      typeof schema.serialize?.[key] === 'function'
        ? schema.serialize[key]
        : typeof schema.defaultSerialize === 'function'
          ? schema.defaultSerialize
          : undefined;
    let fullKey = key;
    let out = undefined;
    let validateOnSet = defaultOptions?.validateOnSet === true;
    let validateOnGet = defaultOptions?.validateOnGet === true;
    const validator = schema.validate[key];

    if (options) {
      if (options.variables) {
        fullKey = getFullKey(keys, key, options.variables) as any;
      }
      if (options.out && typeof options.out === 'object') {
        out = options.out;
      }
      if (typeof options.validateOnSet === 'boolean') {
        validateOnSet = options.validateOnSet;
      }
      if (typeof options.validateOnGet === 'boolean') {
        validateOnGet = options.validateOnGet;
      }
    }

    const _emit: ReturnType<
      ReturnType<
        BuildSync<TValidate, TSerialize, TDeserialize, TKey>
      >['buildKeyApi']
    >['emit'] = () => {
      untypedEmit(fullKey);
    };

    const _get: ReturnType<
      ReturnType<
        BuildSync<TValidate, TSerialize, TDeserialize, TKey>
      >['buildKeyApi']
    >['get'] = (defaultValue) => {
      try {
        let value = store.getItem(fullKey);
        if (deserializer) {
          value = deserializer(value);
        }
        if (validateOnGet) {
          value = validator(value);
          if (value instanceof Error) {
            if (out) {
              out.error = value;
            }
            return defaultValue;
          }
        }
        return value as Exclude<
          Awaited<ReturnType<TValidate[typeof key]>>,
          Error
        >;
      } catch (e) {
        if (out) {
          out.error = e instanceof Error ? e : new Error(String(e));
        }
        return defaultValue;
      }
    };

    const _set: ReturnType<
      ReturnType<
        BuildSync<TValidate, TSerialize, TDeserialize, TKey>
      >['buildKeyApi']
    >['set'] = (value) => {
      try {
        let insertValue: unknown = value;
        if (validateOnSet) {
          insertValue = validator(insertValue);

          if (insertValue instanceof Error) {
            if (out) {
              out.error = insertValue;
            }
            return false;
          }
        }
        if (serializer) {
          insertValue = serializer(insertValue as any);
        }
        store.setItem(fullKey, insertValue);
        untypedEmit(fullKey);
        return true;
      } catch (e) {
        if (out) {
          out.error = e instanceof Error ? e : new Error(String(e));
        }
        return false;
      }
    };

    const _remove: ReturnType<
      ReturnType<
        BuildSync<TValidate, TSerialize, TDeserialize, TKey>
      >['buildKeyApi']
    >['remove'] = () => {
      try {
        store.removeItem(fullKey);
        untypedEmit(fullKey);
        return true;
      } catch (e) {
        if (out) {
          out.error = e instanceof Error ? e : new Error(String(e));
        }
        return false;
      }
    };

    const _subscribe: ReturnType<
      ReturnType<
        BuildSync<TValidate, TSerialize, TDeserialize, TKey>
      >['buildKeyApi']
    >['subscribe'] = (trigger) => {
      return untypedSubscribe(fullKey, trigger);
    };

    return Object.freeze({
      get: _get,
      set: _set,
      remove: _remove,
      subscribe: _subscribe,
      emit: _emit,
    });
  };

  return {
    schema,
    get,
    set,
    remove,
    subscribe,
    untypedSubscribe,
    emit,
    untypedEmit,
    buildKeyApi,
  } as ReturnType<BuildSync<TValidate, TSerialize, TDeserialize, TKey>>;
}) satisfies BuildSync<any, any, any, any>;
