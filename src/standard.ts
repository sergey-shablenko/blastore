import {
  CompiledKeys,
  IndexableKeyOf,
  KeyVariable,
  KeyVariables,
  MaybePromisify,
  StandardSchema,
  StandardSchemaV1,
  StandardStore,
  Switch,
  Trigger,
  Unsubscribe,
} from './types';
import { buildRegexForKeyTemplate, createKeyBuilder, parseKey } from './util';

const subscriptions = new WeakMap<
  StandardStore<any, any>,
  Map<string, Trigger<any>[]>
>();

export type BuildStandard<
  TValidate extends Record<string, StandardSchemaV1>,
  TKeyMode extends {
    [K in keyof TValidate]: TOutput extends Promise<any>
      ? 'async'
      : 'sync' | 'async';
  },
  TInput,
  TOutput,
> = (
  schema: StandardSchema<TValidate, TKeyMode, TInput, TOutput>,
  defaultOptions?: { validateOnGet?: boolean; validateOnSet?: boolean }
) => Readonly<{
  schema: StandardSchema<TValidate, TKeyMode, TInput, TOutput>;
  get<TGetKey extends IndexableKeyOf<TValidate>>(
    key: TGetKey,
    defaultValue: NonNullable<
      TValidate[TGetKey]['~standard']['types']
    >['output'],
    options?: KeyVariables<TGetKey> & {
      validate?: boolean;
      out?: { error?: Error };
    }
  ): MaybePromisify<
    TKeyMode[TGetKey],
    NonNullable<TValidate[TGetKey]['~standard']['types']>['output']
  >;
  set<TSetKey extends IndexableKeyOf<TValidate>>(
    key: TSetKey,
    value: NonNullable<TValidate[TSetKey]['~standard']['types']>['input'],
    options?: KeyVariables<TSetKey> & {
      validate?: boolean;
      out?: { error?: Error };
    }
  ): MaybePromisify<TKeyMode[TSetKey], boolean>;
  remove<TRemoveKey extends IndexableKeyOf<TValidate>>(
    key: TRemoveKey,
    options?: KeyVariables<TRemoveKey> & {
      out?: { error?: Error };
    }
  ): MaybePromisify<TKeyMode[TRemoveKey], boolean>;
  subscribe<TSubKey extends IndexableKeyOf<TValidate>>(
    key: TSubKey,
    trigger: Trigger<
      NonNullable<TValidate[TSubKey]['~standard']['types']>['output']
    >,
    options?: KeyVariables<TSubKey>
  ): Unsubscribe;
  untypedSubscribe(
    key: string,
    trigger: Trigger<
      NonNullable<TValidate[string]['~standard']['types']>['output']
    >
  ): Unsubscribe;
  emit<TEmitKey extends IndexableKeyOf<TValidate>>(
    key: TEmitKey,
    action: 'remove'
  ): MaybePromisify<TKeyMode[TEmitKey], boolean>;
  emit<TEmitKey extends IndexableKeyOf<TValidate>>(
    key: TEmitKey,
    action: 'set' | string,
    data: NonNullable<TValidate[TEmitKey]['~standard']['types']>['input'],
    options?: KeyVariables<TEmitKey> & {
      validate?: boolean;
      out?: { error?: Error };
    }
  ): MaybePromisify<TKeyMode[TEmitKey], boolean>;
  untypedEmit(key: string, action: 'remove'): Promise<boolean>;
  untypedEmit<TFDeserialize extends boolean>(
    key: string,
    action: 'set' | string,
    data: Switch<
      TFDeserialize,
      TOutput,
      NonNullable<TValidate[keyof TValidate]['~standard']['types']>['input']
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
      defaultValue: NonNullable<
        TValidate[TApiKey]['~standard']['types']
      >['output']
    ): MaybePromisify<
      TKeyMode[TApiKey],
      NonNullable<TValidate[TApiKey]['~standard']['types']>['output']
    >;
    set(
      value: NonNullable<TValidate[TApiKey]['~standard']['types']>['input']
    ): MaybePromisify<TKeyMode[TApiKey], boolean>;
    remove(): MaybePromisify<TKeyMode[TApiKey], boolean>;
    subscribe(
      trigger: Trigger<
        NonNullable<TValidate[TApiKey]['~standard']['types']>['output']
      >
    ): Unsubscribe;
    emit(action: 'remove'): MaybePromisify<TKeyMode[TApiKey], boolean>;
    emit(
      action: 'set' | string,
      data: NonNullable<TValidate[TApiKey]['~standard']['types']>['input']
    ): MaybePromisify<TKeyMode[TApiKey], boolean>;
  };
}>;

export const buildStandard = (<
  TValidate extends Record<string, StandardSchemaV1>,
  TKeyMode extends {
    [K in keyof TValidate]: TOutput extends Promise<any>
      ? 'async'
      : 'sync' | 'async';
  },
  TInput,
  TOutput,
>(
  schema: StandardSchema<TValidate, TKeyMode, TInput, TOutput>
) => {
  const store = schema.store;
  const validate = Object.freeze({ ...schema.validate });
  const keyMode = Object.freeze({ ...schema.keyMode });
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
    BuildStandard<TValidate, TKeyMode, TInput, TOutput>
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
    BuildStandard<TValidate, TKeyMode, TInput, TOutput>
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
    BuildStandard<TValidate, TKeyMode, TInput, TOutput>
  >['untypedEmit'] = (async (
    key: any,
    action: any,
    data: any,
    options: any
  ) => {
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
            dataToEmit =
              await validate[parsedKey.key]['~standard'].validate(dataToEmit);

            if ('issues' in dataToEmit) {
              if (out) {
                out.error = new Error(
                  JSON.stringify(dataToEmit.issues, null, 2)
                );
              }
              return false;
            }
            _untypedEmit(key, action, dataToEmit.value as any);
            return true;
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
  }) as ReturnType<
    BuildStandard<TValidate, TKeyMode, TInput, TOutput>
  >['untypedEmit'];

  const emit: ReturnType<
    BuildStandard<TValidate, TKeyMode, TInput, TOutput>
  >['emit'] = ((key: any, action: any, data: any, options: any) => {
    let fullKey = key;
    let out = undefined;
    let validateOnEmit = defaultValidateOnEmit;
    const validator = validate[key]['~standard'].validate;
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

    if (keyMode[key] === 'async' && validateOnEmit) {
      return Promise.resolve(validator(data))
        .then((value) => {
          if ('issues' in value) {
            if (out) {
              out.error = new Error(JSON.stringify(value.issues, null, 2));
            }
            return;
          }
          _untypedEmit(fullKey, action, value.value);
        })
        .catch((e) => {
          if (out) {
            out.error = e instanceof Error ? e : new Error(String(e));
          }
        });
    }

    if (validateOnEmit) {
      try {
        const value: any = validator(data);

        if ('issues' in value) {
          if (out) {
            out.error = new Error(JSON.stringify(value.issues, null, 2));
          }
          return;
        }
        _untypedEmit(fullKey, action, value.value);
        return;
      } catch (e) {
        if (out) {
          out.error = e instanceof Error ? e : new Error(String(e));
        }
        return;
      }
    }
    _untypedEmit(fullKey, action, data);
  }) as unknown as ReturnType<
    BuildStandard<TValidate, TKeyMode, TInput, TOutput>
  >['emit'];

  const get: ReturnType<
    BuildStandard<TValidate, TKeyMode, TInput, TOutput>
  >['get'] = (key, defaultValue, options) => {
    const deserializer =
      typeof deserialize?.[key] === 'function'
        ? deserialize[key]
        : typeof defaultDeserialize === 'function'
          ? defaultDeserialize
          : undefined;
    let fullKey = key;
    let out = undefined;
    let validateOnGet = defaultValidateOnGet;
    const validator = validate[key]['~standard'].validate;

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

    if (keyMode[key] === 'async') {
      return Promise.resolve(store.getItem(fullKey))
        .then(async (value: any) => {
          if (deserializer) {
            value = await deserializer(value);
          }

          if (validateOnGet) {
            value = await validator(value);

            if ('issues' in value) {
              if (out) {
                out.error = new Error(JSON.stringify(value.issues, null, 2));
              }
              return defaultValue;
            }
            return value.value as any;
          }

          return value as any;
        })
        .catch((e) => {
          if (out) {
            out.error = e instanceof Error ? e : new Error(String(e));
          }
          return defaultValue;
        });
    }

    try {
      let value: any = store.getItem(fullKey);

      if (deserializer) {
        value = deserializer(value);
      }

      if (validateOnGet) {
        value = validator(value);

        if ('issues' in value) {
          if (out) {
            out.error = new Error(JSON.stringify(value.issues, null, 2));
          }
          return defaultValue;
        }
        return value.value as any;
      }

      return value as any;
    } catch (e) {
      if (out) {
        out.error = e instanceof Error ? e : new Error(String(e));
      }
      return defaultValue;
    }
  };

  const set: ReturnType<
    BuildStandard<TValidate, TKeyMode, TInput, TOutput>
  >['set'] = (
    key,
    value,
    options
  ): ReturnType<
    ReturnType<BuildStandard<TValidate, TKeyMode, TInput, TOutput>>['set']
  > => {
    const serializer =
      typeof serialize?.[key] === 'function'
        ? serialize[key]
        : typeof defaultSerialize === 'function'
          ? defaultSerialize
          : undefined;
    let fullKey = key;
    let out = undefined;
    let validateOnSet = defaultValidateOnSet;
    const validator = validate[key]['~standard'].validate;

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

    if (keyMode[key] === 'async') {
      return Promise.resolve(value as any)
        .then(async (insertValue) => {
          if (validateOnSet) {
            insertValue = await validator(insertValue);

            if ('issues' in (insertValue as any)) {
              if (out) {
                out.error = new Error(
                  JSON.stringify((insertValue as any).issues, null, 2)
                );
              }
              return false as any;
            }
            insertValue = (insertValue as any).value;
          }
          if (serializer) {
            insertValue = await serializer(insertValue as any);
          }

          await store.setItem(fullKey, insertValue);
          _untypedEmit(fullKey, 'set', insertValue);
          return true as any;
        })
        .catch((e) => {
          if (out) {
            out.error = e instanceof Error ? e : new Error(String(e));
          }
          return false as any;
        }) as any;
    }

    try {
      let insertValue: any = value;
      if (validateOnSet) {
        insertValue = validator(insertValue);

        if ('issues' in (insertValue as any)) {
          if (out) {
            out.error = new Error(
              JSON.stringify((insertValue as any).issues, null, 2)
            );
          }
          return false as any;
        }
        insertValue = (insertValue as any).value;
      }
      const beforeSerialization = insertValue;
      if (serializer) {
        insertValue = serializer(insertValue as any);
      }

      store.setItem(fullKey, insertValue);
      _untypedEmit(fullKey, 'set', beforeSerialization);
      return true as any;
    } catch (e) {
      if (out) {
        out.error = e instanceof Error ? e : new Error(String(e));
      }
      return false as any;
    }
  };

  const remove: ReturnType<
    BuildStandard<TValidate, TKeyMode, TInput, TOutput>
  >['remove'] = (key, options) => {
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

    if (keyMode[key] === 'async') {
      return Promise.resolve(store.removeItem(fullKey))
        .then(() => {
          _untypedEmit(fullKey, 'remove');
          return true;
        })
        .catch((e) => {
          if (out) {
            out.error = e instanceof Error ? e : new Error(String(e));
          }
          return false;
        }) as any;
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
    BuildStandard<TValidate, TKeyMode, TInput, TOutput>
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
    const isAsync = keyMode[key] === 'async';
    const validator = validate[key]['~standard'].validate;

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
      ReturnType<
        BuildStandard<TValidate, TKeyMode, TInput, TOutput>
      >['buildKeyApi']
    >['emit'] = ((action: any, data: any) => {
      if (isAsync && validateOnEmit) {
        return Promise.resolve(validator(data))
          .then((value) => {
            if ('issues' in value) {
              if (out) {
                out.error = new Error(JSON.stringify(value.issues, null, 2));
              }
              return;
            }
            _untypedEmit(fullKey, action, value.value);
          })
          .catch((e) => {
            if (out) {
              out.error = e instanceof Error ? e : new Error(String(e));
            }
          });
      }

      if (validateOnEmit) {
        try {
          const value = validator(data);

          if ('issues' in value) {
            if (out) {
              out.error = new Error(JSON.stringify(value.issues, null, 2));
            }
            return;
          }
          _untypedEmit(fullKey, action, (value as any).value);
          return;
        } catch (e) {
          if (out) {
            out.error = e instanceof Error ? e : new Error(String(e));
          }
          return;
        }
      }
      _untypedEmit(fullKey, data);
    }) as unknown as ReturnType<
      ReturnType<
        BuildStandard<TValidate, TKeyMode, TInput, TOutput>
      >['buildKeyApi']
    >['emit'];

    const _get: ReturnType<
      ReturnType<
        BuildStandard<TValidate, TKeyMode, TInput, TOutput>
      >['buildKeyApi']
    >['get'] = (defaultValue) => {
      if (isAsync) {
        return Promise.resolve(store.getItem(fullKey))
          .then(async (value: any) => {
            if (deserializer) {
              value = await deserializer(value);
            }

            if (validateOnGet) {
              value = await validator(value);

              if ('issues' in value) {
                if (out) {
                  out.error = new Error(JSON.stringify(value.issues, null, 2));
                }
                return defaultValue;
              }
              return value.value as any;
            }

            return value as any;
          })
          .catch((e) => {
            if (out) {
              out.error = e instanceof Error ? e : new Error(String(e));
            }
            return defaultValue;
          });
      }

      try {
        let value: any = store.getItem(fullKey);

        if (deserializer) {
          value = deserializer(value);
        }

        if (validateOnGet) {
          value = validator(value);

          if ('issues' in value) {
            if (out) {
              out.error = new Error(JSON.stringify(value.issues, null, 2));
            }
            return defaultValue;
          }
          return value.value as any;
        }

        return value as any;
      } catch (e) {
        if (out) {
          out.error = e instanceof Error ? e : new Error(String(e));
        }
        return defaultValue;
      }
    };

    const _set: ReturnType<
      ReturnType<
        BuildStandard<TValidate, TKeyMode, TInput, TOutput>
      >['buildKeyApi']
    >['set'] = (value) => {
      if (isAsync) {
        return Promise.resolve(value as any)
          .then(async (insertValue) => {
            if (validateOnSet) {
              insertValue = await validator(insertValue);

              if ('issues' in (insertValue as any)) {
                if (out) {
                  out.error = new Error(
                    JSON.stringify((insertValue as any).issues, null, 2)
                  );
                }
                return false as any;
              }
              insertValue = (insertValue as any).value;
            }
            const beforeSerialization = insertValue;
            if (serializer) {
              insertValue = await serializer(insertValue as any);
            }

            await store.setItem(fullKey, insertValue);
            _untypedEmit(fullKey, 'set', beforeSerialization);
            return true as any;
          })
          .catch((e) => {
            if (out) {
              out.error = e instanceof Error ? e : new Error(String(e));
            }
            return false as any;
          }) as any;
      }

      try {
        let insertValue: any = value;
        if (validateOnSet) {
          insertValue = validator(insertValue);

          if ('issues' in (insertValue as any)) {
            if (out) {
              out.error = new Error(
                JSON.stringify((insertValue as any).issues, null, 2)
              );
            }
            return false as any;
          }
          insertValue = (insertValue as any).value;
        }
        const beforeSerialization = insertValue;
        if (serializer) {
          insertValue = serializer(insertValue as any);
        }

        store.setItem(fullKey, insertValue);
        _untypedEmit(fullKey, 'set', beforeSerialization);
        return true as any;
      } catch (e) {
        if (out) {
          out.error = e instanceof Error ? e : new Error(String(e));
        }
        return false as any;
      }
    };

    const _remove: ReturnType<
      ReturnType<
        BuildStandard<TValidate, TKeyMode, TInput, TOutput>
      >['buildKeyApi']
    >['remove'] = () => {
      if (isAsync) {
        return Promise.resolve(store.removeItem(fullKey))
          .then(() => {
            _untypedEmit(fullKey, 'remove');
            return true;
          })
          .catch((e) => {
            if (out) {
              out.error = e instanceof Error ? e : new Error(String(e));
            }
            return false;
          }) as any;
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

    const _subscribe: ReturnType<
      ReturnType<
        BuildStandard<TValidate, TKeyMode, TInput, TOutput>
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
  }) as ReturnType<BuildStandard<TValidate, TKeyMode, TInput, TOutput>>;
}) satisfies BuildStandard<any, any, any, any>;
