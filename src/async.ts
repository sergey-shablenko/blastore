import {
  AsyncSchema,
  AsyncStore,
  CompiledKeys,
  IndexableKeyOf,
  KeyVariable,
  KeyVariables,
  Switch,
  Trigger,
  Unsubscribe,
} from './types';
import { buildRegexForKeyTemplate, createKeyBuilder, parseKey } from './util';

const subscriptions = new WeakMap<
  AsyncStore<any, any>,
  Map<string, Trigger<any>[]>
>();

export type BuildAsync<
  TValidate extends Record<string, (v: unknown) => Promise<unknown | Error>>,
  TInput,
  TOutput,
> = (schema: AsyncSchema<TValidate, TInput, TOutput>) => Readonly<{
  schema: AsyncSchema<TValidate, TInput, TOutput>;
  get<TGetKey extends IndexableKeyOf<TValidate>>(
    key: TGetKey,
    defaultValue: Exclude<Awaited<ReturnType<TValidate[TGetKey]>>, Error>,
    options?: KeyVariables<TGetKey> & {
      validate?: boolean;
      out?: { error?: Error };
    }
  ): Promise<Exclude<Awaited<ReturnType<TValidate[TGetKey]>>, Error>>;
  set<TSetKey extends IndexableKeyOf<TValidate>>(
    key: TSetKey,
    value: Exclude<Awaited<ReturnType<TValidate[TSetKey]>>, Error>,
    options?: KeyVariables<TSetKey> & {
      validate?: boolean;
      out?: { error?: Error };
    }
  ): Promise<boolean>;
  remove<TRemoveKey extends IndexableKeyOf<TValidate>>(
    key: TRemoveKey,
    options?: KeyVariables<TRemoveKey> & {
      out?: { error?: Error };
    }
  ): Promise<boolean>;
  subscribe<TSubKey extends IndexableKeyOf<TValidate>>(
    key: TSubKey,
    trigger: Trigger<Exclude<Awaited<ReturnType<TValidate[TSubKey]>>, Error>>,
    options?: KeyVariables<TSubKey>
  ): Unsubscribe;
  untypedSubscribe(
    key: string,
    trigger: Trigger<
      Exclude<Awaited<ReturnType<TValidate[keyof TValidate]>>, Error>
    >
  ): Unsubscribe;
  emit<TEmitKey extends IndexableKeyOf<TValidate>>(
    key: TEmitKey,
    action: 'remove'
  ): Promise<boolean>;
  emit<TEmitKey extends IndexableKeyOf<TValidate>>(
    key: TEmitKey,
    action: 'set' | string,
    data: Exclude<Awaited<ReturnType<TValidate[TEmitKey]>>, Error>,
    options?: KeyVariables<TEmitKey> & {
      validate?: boolean;
      out?: { error?: Error };
    }
  ): Promise<boolean>;
  untypedEmit(key: string, action: 'remove'): Promise<boolean>;
  untypedEmit<TFDeserialize extends boolean>(
    key: string,
    action: 'set' | string,
    data: Switch<
      TFDeserialize,
      TOutput,
      Exclude<Awaited<ReturnType<TValidate[keyof TValidate]>>, Error>
    >,
    options?: {
      validate?: boolean;
      deserialize?: TFDeserialize;
      out?: { error?: Error };
    }
  ): Promise<boolean>;
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
      defaultValue: Exclude<Awaited<ReturnType<TValidate[TApiKey]>>, Error>
    ): Promise<Exclude<Awaited<ReturnType<TValidate[TApiKey]>>, Error>>;
    set(
      value: Exclude<Awaited<ReturnType<TValidate[TApiKey]>>, Error>
    ): Promise<boolean>;
    remove(): Promise<boolean>;
    subscribe(
      trigger: Trigger<Exclude<Awaited<ReturnType<TValidate[TApiKey]>>, Error>>
    ): Unsubscribe;
    emit(action: 'remove'): Promise<boolean>;
    emit(
      action: 'set' | string,
      data: Exclude<Awaited<ReturnType<TValidate[TApiKey]>>, Error>
    ): Promise<boolean>;
  };
}>;

export const buildAsync = (<
  TValidate extends Record<string, (v: unknown) => Promise<unknown | Error>>,
  TInput,
  TOutput,
>(
  schema: AsyncSchema<TValidate, TInput, TOutput>
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
    BuildAsync<TValidate, TInput, TOutput>
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
    BuildAsync<TValidate, TInput, TOutput>
  >['subscribe'] = (key, trigger, options) => {
    const fullKey = options?.variables
      ? getFullKey(key, options.variables)
      : key;
    return untypedSubscribe(fullKey, trigger);
  };

  const _untypedEmit = (
    key: string,
    action: 'remove' | 'set' | string,
    data?: any
  ) => {
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
    BuildAsync<TValidate, TInput, TOutput>
  >['untypedEmit'] = (async (key, action, data, options) => {
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
              dataToEmit = await deserializer(data as any);
            }
          }
          if (options?.validate) {
            dataToEmit = await validate[parsedKey.key](dataToEmit);
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
  }) as ReturnType<BuildAsync<TValidate, TInput, TOutput>>['untypedEmit'];

  const emit: ReturnType<BuildAsync<TValidate, TInput, TOutput>>['emit'] =
    (async (key, action, data, options) => {
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
          const value = await validator(data as any);

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
    }) as ReturnType<BuildAsync<TValidate, TInput, TOutput>>['emit'];

  const get: ReturnType<BuildAsync<TValidate, TInput, TOutput>>['get'] = async (
    key,
    defaultValue,
    options
  ) => {
    const deserializer =
      typeof deserialize?.[key] === 'function'
        ? deserialize[key]
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
      let value: any = await store.getItem(fullKey);

      if (deserializer) {
        value = await deserializer(value);
      }

      if (validateOnGet) {
        value = await validator(value);

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

  const set: ReturnType<BuildAsync<TValidate, TInput, TOutput>>['set'] = async (
    key,
    value,
    options
  ) => {
    const serializer =
      typeof serialize?.[key] === 'function'
        ? serialize[key]
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
        insertValue = await validator(insertValue);

        if (insertValue instanceof Error) {
          if (out) {
            out.error = insertValue;
          }
          return false;
        }
      }
      if (serializer) {
        insertValue = await serializer(insertValue);
      }
      await store.setItem(fullKey, insertValue);
      _untypedEmit(fullKey, 'set', insertValue);
      return true;
    } catch (e) {
      if (out) {
        out.error = e instanceof Error ? e : new Error(String(e));
      }
      return false;
    }
  };

  const remove: ReturnType<
    BuildAsync<TValidate, TInput, TOutput>
  >['remove'] = async (key, options) => {
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
      await store.removeItem(fullKey);
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
    BuildAsync<TValidate, TInput, TOutput>
  >['buildKeyApi'] = (key, options) => {
    const deserializer =
      typeof deserialize?.[key] === 'function'
        ? deserialize[key]
        : typeof defaultDeserialize === 'function'
          ? defaultDeserialize
          : undefined;
    const serializer =
      typeof serialize?.[key] === 'function'
        ? serialize[key]
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
      ReturnType<BuildAsync<TValidate, TInput, TOutput>>['buildKeyApi']
    >['emit'] = (async (action, data) => {
      if (validateOnEmit) {
        try {
          const value =
            action === 'remove' ? undefined : await validator(data as any);

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
      ReturnType<BuildAsync<TValidate, TInput, TOutput>>['buildKeyApi']
    >['emit'];

    const _get: ReturnType<
      ReturnType<BuildAsync<TValidate, TInput, TOutput>>['buildKeyApi']
    >['get'] = async (defaultValue) => {
      try {
        let value: any = await store.getItem(fullKey);
        if (deserializer) {
          value = await deserializer(value);
        }
        if (validateOnGet) {
          value = await validator(value);
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
      ReturnType<BuildAsync<TValidate, TInput, TOutput>>['buildKeyApi']
    >['set'] = async (value) => {
      try {
        let insertValue: any = value;
        if (validateOnSet) {
          insertValue = await validator(insertValue);

          if (insertValue instanceof Error) {
            if (out) {
              out.error = insertValue;
            }
            return false;
          }
        }
        if (serializer) {
          insertValue = await serializer(insertValue as any);
        }
        await store.setItem(fullKey, insertValue);
        _untypedEmit(fullKey, 'set', insertValue);
        return true;
      } catch (e) {
        if (out) {
          out.error = e instanceof Error ? e : new Error(String(e));
        }
        return false;
      }
    };

    const _remove: ReturnType<
      ReturnType<BuildAsync<TValidate, TInput, TOutput>>['buildKeyApi']
    >['remove'] = async () => {
      try {
        await store.removeItem(fullKey);
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
      ReturnType<BuildAsync<TValidate, TInput, TOutput>>['buildKeyApi']
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
  }) as ReturnType<BuildAsync<TValidate, TInput, TOutput>>;
}) satisfies BuildAsync<any, any, any>;
