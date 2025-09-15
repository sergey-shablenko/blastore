import {
  CompiledKeys,
  IndexableKeyOf,
  KeyVariable,
  KeyVariables,
  Switch,
  SyncSchema,
  SyncStore,
  Trigger,
  Unsubscribe,
} from './types';
import { buildRegexForKeyTemplate, createKeyBuilder, parseKey } from './util';

const subscriptions = new WeakMap<
  SyncStore<any, any>,
  Map<string, Trigger<any>[]>
>();

export type BuildSync<
  TValidate extends Record<string, (v: unknown) => unknown | Error>,
  TInput,
  TOutput,
> = (schema: SyncSchema<TValidate, TInput, TOutput>) => Readonly<{
  schema: SyncSchema<TValidate, TInput, TOutput>;
  get<TGetKey extends IndexableKeyOf<TValidate>>(
    key: TGetKey,
    defaultValue: Exclude<ReturnType<TValidate[TGetKey]>, Error>,
    options?: KeyVariables<TGetKey> & {
      validate?: boolean;
      out?: { error?: Error };
    }
  ): Exclude<ReturnType<TValidate[TGetKey]>, Error>;
  set<TSetKey extends IndexableKeyOf<TValidate>>(
    key: TSetKey,
    value: Exclude<ReturnType<TValidate[TSetKey]>, Error>,
    options?: KeyVariables<TSetKey> & {
      validate?: boolean;
      out?: { error?: Error };
    }
  ): boolean;
  remove<TRemoveKey extends IndexableKeyOf<TValidate>>(
    key: TRemoveKey,
    options?: KeyVariables<TRemoveKey> & {
      out?: { error?: Error };
    }
  ): boolean;
  subscribe<TSubKey extends IndexableKeyOf<TValidate>>(
    key: TSubKey,
    trigger: Trigger<Exclude<ReturnType<TValidate[TSubKey]>, Error>>,
    options?: KeyVariables<TSubKey>
  ): Unsubscribe;
  untypedSubscribe(
    key: string,
    trigger: Trigger<Exclude<ReturnType<TValidate[keyof TValidate]>, Error>>
  ): Unsubscribe;
  emit<TEmitKey extends IndexableKeyOf<TValidate>>(
    key: TEmitKey,
    action: 'remove'
  ): boolean;
  emit<TEmitKey extends IndexableKeyOf<TValidate>>(
    key: TEmitKey,
    action: 'set' | string,
    data: Exclude<ReturnType<TValidate[TEmitKey]>, Error>,
    options?: KeyVariables<TEmitKey> & {
      validate?: boolean;
      out?: { error?: Error };
    }
  ): boolean;
  untypedEmit(key: string, action: 'remove'): boolean;
  untypedEmit<TFDeserialize extends boolean>(
    key: string,
    action: 'set' | string,
    data: Switch<
      TFDeserialize,
      TOutput,
      Exclude<ReturnType<TValidate[keyof TValidate]>, Error>
    >,
    options?: {
      validate?: boolean;
      deserialize?: TFDeserialize;
      out?: { error?: Error };
    }
  ): boolean;
  buildKeyApi: <TApiKey extends IndexableKeyOf<TValidate>>(
    key: TApiKey,
    options?: KeyVariables<TApiKey> & {
      validateOnGet?: boolean;
      validateOnSet?: boolean;
      validateOnEmit?: boolean;
      out?: { error?: Error };
    }
  ) => {
    get(
      defaultValue: Exclude<ReturnType<TValidate[TApiKey]>, Error>
    ): Exclude<ReturnType<TValidate[TApiKey]>, Error>;
    set(value: Exclude<ReturnType<TValidate[TApiKey]>, Error>): boolean;
    remove(): boolean;
    subscribe(
      trigger: Trigger<Exclude<ReturnType<TValidate[TApiKey]>, Error>>
    ): Unsubscribe;
    emit(action: 'remove'): boolean;
    emit(
      action: 'set' | string,
      data: Exclude<ReturnType<TValidate[TApiKey]>, Error>
    ): boolean;
  };
}>;

export const buildSync = <
  TValidate extends Record<string, (v: unknown) => unknown | Error>,
  TInput,
  TOutput,
>(
  schema: SyncSchema<TValidate, TInput, TOutput>
) => {
  const store = schema.store;
  const validate = Object.freeze({ ...schema.validate });
  const defaultSerialize = schema.defaultSerialize;
  const defaultDeserialize = schema.defaultDeserialize;
  const serialize = Object.freeze({ ...schema.serialize });
  const deserialize = Object.freeze({ ...schema.deserialize });
  const defaultValidateOnGet = schema.validateOnGet === true;
  const defaultValidateOnSet = schema.validateOnSet === true;
  const defaultValidateOnEmit = schema.validateOnEmit === true;

  const keys = Object.keys(validate).map((key) => {
    const parts = parseKey(key);
    const regex = buildRegexForKeyTemplate(parts);
    if (parts.some(([, variable]) => variable)) {
      const builder = new Function(
        'vars',
        `return ${parts.map(([s, i]) => [`'${s}'`, i ? `vars${/^\d+$/i.test(i) || i === 'true' || i === 'false' ? `[${i}]` : /^([^0-9a-z]+|)$/i.test(i) ? `['${i}']` : `.${i}`}` : null].filter(Boolean).join(' + ')).join(' + ')};`
      ) as (vars: Record<string, KeyVariable>) => string;
      return { key, parts, regex, builder };
    }
    return { key, parts, regex };
  }) satisfies CompiledKeys;
  const getFullKey = createKeyBuilder(keys);

  const untypedSubscribe: ReturnType<
    BuildSync<TValidate, TInput, TOutput>
  >['untypedSubscribe'] = (key, trigger) => {
    let storeSubscriptions = subscriptions.get(store);

    if (!storeSubscriptions) {
      storeSubscriptions = new Map<string, Trigger<any>[]>();
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
    BuildSync<TValidate, TInput, TOutput>
  >['subscribe'] = (key, trigger, options) => {
    const fullKey = options?.variables
      ? getFullKey(key, options.variables)
      : key;
    return untypedSubscribe(fullKey, trigger as any);
  };

  const _untypedEmit = (key: string, action: string, data?: any) => {
    const storeSubs = subscriptions.get(store);
    const subs = storeSubs && storeSubs.get(key);
    if (subs && subs.length) {
      const payload = { action, data };
      for (let i = 0; i < subs.length; i++) {
        subs[i](payload);
      }
    }
  };

  const untypedEmit: ReturnType<
    BuildSync<TValidate, TInput, TOutput>
  >['untypedEmit'] = ((key, action, data, options) => {
    let out = undefined;
    if (options) {
      if (options.out && typeof options.out === 'object') {
        out = options.out;
      }
    }

    try {
      for (let i = 0; i < keys.length; i++) {
        const parsedKey = keys[i];
        if (new RegExp(parsedKey.regex).test(key)) {
          let dataToEmit: any = data;
          if (options?.deserialize) {
            const deserializer =
              typeof deserialize?.[key as keyof typeof deserialize] ===
              'function'
                ? deserialize[key as keyof typeof deserialize]
                : typeof defaultDeserialize === 'function'
                  ? defaultDeserialize
                  : undefined;
            if (deserializer) {
              dataToEmit = deserializer(data as any);
            }
          }
          if (options?.validate) {
            dataToEmit = validate[parsedKey.key](dataToEmit);
          }

          if (dataToEmit instanceof Error) {
            if (out) {
              out.error = dataToEmit;
            }
            return false;
          }
          _untypedEmit(key, action, dataToEmit as any);
          return true;
        }
      }
    } catch (e) {
      if (out) {
        out.error = e instanceof Error ? e : new Error(String(e));
      }
    }
    return false;
  }) as ReturnType<BuildSync<TValidate, TInput, TOutput>>['untypedEmit'];

  const emit: ReturnType<BuildSync<TValidate, TInput, TOutput>>['emit'] = ((
    key,
    action,
    data,
    options: any
  ) => {
    let fullKey = key;
    let out = undefined;
    let validateOnEmit = defaultValidateOnEmit;
    const validator = validate[key];
    if (options) {
      if (options.variables) {
        fullKey = getFullKey(key, options.variables) as any;
      }
      if (options.out && typeof options.out === 'object') {
        out = options.out;
      }
      if (typeof options.validate === 'boolean') {
        validateOnEmit = options.validate;
      }
    }

    if (validateOnEmit) {
      try {
        const value = validator(data as any);

        if (value instanceof Error) {
          if (out) {
            out.error = value;
          }
          return false;
        }
        _untypedEmit(fullKey, action, value as any);
        return true;
      } catch (e) {
        if (out) {
          out.error = e instanceof Error ? e : new Error(String(e));
        }
        return false;
      }
    }
    _untypedEmit(fullKey, action, data as any);
    return true;
  }) as ReturnType<BuildSync<TValidate, TInput, TOutput>>['emit'];

  const get: ReturnType<BuildSync<TValidate, TInput, TOutput>>['get'] = (
    key,
    defaultValue,
    options
  ) => {
    const deserializer =
      typeof deserialize?.[key as keyof typeof deserialize] === 'function'
        ? deserialize[key as keyof typeof deserialize]
        : typeof defaultDeserialize === 'function'
          ? defaultDeserialize
          : undefined;
    let fullKey = key;
    let out = undefined;
    let validateOnGet = defaultValidateOnGet;
    const validator = validate[key];

    if (options) {
      if (options.variables) {
        fullKey = getFullKey(key, options.variables) as any;
      }
      if (options.out && typeof options.out === 'object') {
        out = options.out;
      }
      if (typeof options.validate === 'boolean') {
        validateOnGet = options.validate;
      }
    }

    try {
      let value: any = store.getItem(fullKey);

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

      return value;
    } catch (e) {
      if (out) {
        out.error = e instanceof Error ? e : new Error(String(e));
      }
      return defaultValue;
    }
  };

  const set: ReturnType<BuildSync<TValidate, TInput, TOutput>>['set'] = (
    key,
    value,
    options
  ) => {
    const serializer =
      typeof serialize?.[key as keyof typeof serialize] === 'function'
        ? serialize[key as keyof typeof serialize]
        : typeof defaultSerialize === 'function'
          ? defaultSerialize
          : undefined;
    let fullKey = key;
    let out = undefined;
    let validateOnSet = defaultValidateOnSet;
    const validator = validate[key];

    if (options) {
      if (options.variables) {
        fullKey = getFullKey(key, options.variables) as any;
      }
      if (options.out && typeof options.out === 'object') {
        out = options.out;
      }
      if (typeof options.validate === 'boolean') {
        validateOnSet = options.validate;
      }
    }

    try {
      let insertValue: any = value;
      if (validateOnSet) {
        insertValue = validator(insertValue);

        if (insertValue instanceof Error) {
          if (out) {
            out.error = insertValue;
          }
          return false;
        }
      }
      const beforeSerialization = insertValue;
      if (serializer) {
        insertValue = serializer(insertValue);
      }
      store.setItem(fullKey, insertValue);
      _untypedEmit(fullKey, 'set', beforeSerialization);
      return true;
    } catch (e) {
      if (out) {
        out.error = e instanceof Error ? e : new Error(String(e));
      }
      return false;
    }
  };

  const remove: ReturnType<BuildSync<TValidate, TInput, TOutput>>['remove'] = (
    key,
    options
  ) => {
    let fullKey = key;
    let out = undefined;

    if (options) {
      if (options.variables) {
        fullKey = getFullKey(key, options.variables) as any;
      }
      if (options.out && typeof options.out === 'object') {
        out = options.out;
      }
    }

    try {
      store.removeItem(fullKey);
      _untypedEmit(fullKey, 'remove');
      return true;
    } catch (e) {
      if (out) {
        out.error = e instanceof Error ? e : new Error(String(e));
      }
      return false;
    }
  };

  const buildKeyApi: ReturnType<
    BuildSync<TValidate, TInput, TOutput>
  >['buildKeyApi'] = (key, options) => {
    const deserializer =
      typeof deserialize?.[key as keyof typeof deserialize] === 'function'
        ? deserialize[key as keyof typeof deserialize]
        : typeof defaultDeserialize === 'function'
          ? defaultDeserialize
          : undefined;
    const serializer =
      typeof serialize?.[key as keyof typeof serialize] === 'function'
        ? serialize[key as keyof typeof serialize]
        : typeof defaultSerialize === 'function'
          ? defaultSerialize
          : undefined;
    let fullKey = key;
    let out = undefined;
    let validateOnSet = defaultValidateOnSet;
    let validateOnGet = defaultValidateOnGet;
    let validateOnEmit = defaultValidateOnEmit;
    const validator = validate[key];

    if (options) {
      if (options.variables) {
        fullKey = getFullKey(key, options.variables) as any;
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
      if (typeof options.validateOnEmit === 'boolean') {
        validateOnEmit = options.validateOnEmit;
      }
    }

    const _emit: ReturnType<
      ReturnType<BuildSync<TValidate, TInput, TOutput>>['buildKeyApi']
    >['emit'] = ((action, data) => {
      if (validateOnEmit) {
        try {
          const value =
            action === 'remove' ? undefined : validator(data as any);

          if (value instanceof Error) {
            if (out) {
              out.error = value;
            }
            return false;
          }
          _untypedEmit(fullKey, action, value as any);
          return true;
        } catch (e) {
          if (out) {
            out.error = e instanceof Error ? e : new Error(String(e));
          }
          return false;
        }
      }
      _untypedEmit(fullKey, action, data as any);
      return true;
    }) as ReturnType<
      ReturnType<BuildSync<TValidate, TInput, TOutput>>['buildKeyApi']
    >['emit'];

    const _get: ReturnType<
      ReturnType<BuildSync<TValidate, TInput, TOutput>>['buildKeyApi']
    >['get'] = (defaultValue) => {
      try {
        let value: any = store.getItem(fullKey);
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
      ReturnType<BuildSync<TValidate, TInput, TOutput>>['buildKeyApi']
    >['set'] = (value) => {
      try {
        let insertValue: any = value;
        if (validateOnSet) {
          insertValue = validator(insertValue);

          if (insertValue instanceof Error) {
            if (out) {
              out.error = insertValue;
            }
            return false;
          }
        }
        const beforeSerialization = insertValue;
        if (serializer) {
          insertValue = serializer(insertValue);
        }
        store.setItem(fullKey, insertValue);
        _untypedEmit(fullKey, 'set', beforeSerialization);
        return true;
      } catch (e) {
        if (out) {
          out.error = e instanceof Error ? e : new Error(String(e));
        }
        return false;
      }
    };

    const _remove: ReturnType<
      ReturnType<BuildSync<TValidate, TInput, TOutput>>['buildKeyApi']
    >['remove'] = () => {
      try {
        store.removeItem(fullKey);
        _untypedEmit(fullKey, 'remove');
        return true;
      } catch (e) {
        if (out) {
          out.error = e instanceof Error ? e : new Error(String(e));
        }
        return false;
      }
    };

    const _subscribe: ReturnType<
      ReturnType<BuildSync<TValidate, TInput, TOutput>>['buildKeyApi']
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

  return Object.freeze({
    schema,
    get,
    set,
    remove,
    subscribe,
    untypedSubscribe,
    emit,
    untypedEmit,
    buildKeyApi,
  }) as ReturnType<BuildSync<TValidate, TInput, TOutput>>;
};
