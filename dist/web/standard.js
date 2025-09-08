import { buildRegexForKeyTemplate, createKeyBuilder, parseKey } from './util';
const subscriptions = new WeakMap();
export const buildStandard = ((schema) => {
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
            const builder = new Function('vars', `return ${parts.map(([s, i]) => [`'${s}'`, i ? `vars${/^\d+$/i.test(i) || i === 'true' || i === 'false' ? `[${i}]` : /^([^0-9a-z]+|)$/i.test(i) ? `['${i}']` : `.${i}`}` : null].filter(Boolean).join(' + ')).join(' + ')};`);
            return { key, parts, regex, builder };
        }
        return { key, parts, regex };
    });
    const getFullKey = createKeyBuilder(keys);
    const untypedSubscribe = (key, trigger) => {
        let storeSubscriptions = subscriptions.get(store);
        if (!storeSubscriptions) {
            storeSubscriptions = new Map();
            subscriptions.set(store, storeSubscriptions);
        }
        const subscriber = storeSubscriptions.get(key);
        if (subscriber) {
            subscriber.push(trigger);
        }
        else {
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
    const subscribe = (key, trigger, options) => {
        const fullKey = options?.variables
            ? getFullKey(key, options.variables)
            : key;
        return untypedSubscribe(fullKey, trigger);
    };
    const _untypedEmit = (key, action, data) => {
        const storeSubs = subscriptions.get(store);
        const subs = storeSubs && storeSubs.get(key);
        if (subs && subs.length) {
            const payload = { action, data };
            for (let i = 0; i < subs.length; i++) {
                subs[i](payload);
            }
        }
    };
    const untypedEmit = (async (key, action, data, options) => {
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
                    let dataToEmit = data;
                    if (options?.deserialize) {
                        const deserializer = typeof deserialize?.[key] ===
                            'function'
                            ? deserialize[key]
                            : typeof defaultDeserialize === 'function'
                                ? defaultDeserialize
                                : undefined;
                        if (deserializer) {
                            dataToEmit = await deserializer(data);
                        }
                    }
                    if (options?.validate) {
                        dataToEmit =
                            await validate[parsedKey.key]['~standard'].validate(dataToEmit);
                        if ('issues' in dataToEmit) {
                            if (out) {
                                out.error = new Error(JSON.stringify(dataToEmit.issues, null, 2));
                            }
                            return false;
                        }
                        _untypedEmit(key, action, dataToEmit.value);
                        return true;
                    }
                    _untypedEmit(key, action, dataToEmit);
                    return true;
                }
            }
        }
        catch (e) {
            if (out) {
                out.error = e instanceof Error ? e : new Error(String(e));
            }
        }
        return false;
    });
    const emit = ((key, action, data, options) => {
        let fullKey = key;
        let out = undefined;
        let validateOnEmit = defaultValidateOnEmit;
        const validator = validate[key]['~standard'].validate;
        if (options) {
            if (options.variables) {
                fullKey = getFullKey(key, options.variables);
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
                const value = validator(data);
                if ('issues' in value) {
                    if (out) {
                        out.error = new Error(JSON.stringify(value.issues, null, 2));
                    }
                    return;
                }
                _untypedEmit(fullKey, action, value.value);
                return;
            }
            catch (e) {
                if (out) {
                    out.error = e instanceof Error ? e : new Error(String(e));
                }
                return;
            }
        }
        _untypedEmit(fullKey, action, data);
    });
    const get = (key, defaultValue, options) => {
        const deserializer = typeof deserialize?.[key] === 'function'
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
                fullKey = getFullKey(key, options.variables);
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
                .then(async (value) => {
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
                    return value.value;
                }
                return value;
            })
                .catch((e) => {
                if (out) {
                    out.error = e instanceof Error ? e : new Error(String(e));
                }
                return defaultValue;
            });
        }
        try {
            let value = store.getItem(fullKey);
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
                return value.value;
            }
            return value;
        }
        catch (e) {
            if (out) {
                out.error = e instanceof Error ? e : new Error(String(e));
            }
            return defaultValue;
        }
    };
    const set = (key, value, options) => {
        const serializer = typeof serialize?.[key] === 'function'
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
                fullKey = getFullKey(key, options.variables);
            }
            if (options.out && typeof options.out === 'object') {
                out = options.out;
            }
            if (typeof options.validate === 'boolean') {
                validateOnSet = options.validate;
            }
        }
        if (keyMode[key] === 'async') {
            return Promise.resolve(value)
                .then(async (insertValue) => {
                if (validateOnSet) {
                    insertValue = await validator(insertValue);
                    if ('issues' in insertValue) {
                        if (out) {
                            out.error = new Error(JSON.stringify(insertValue.issues, null, 2));
                        }
                        return false;
                    }
                    insertValue = insertValue.value;
                }
                if (serializer) {
                    insertValue = await serializer(insertValue);
                }
                await store.setItem(fullKey, insertValue);
                _untypedEmit(fullKey, 'set', insertValue);
                return true;
            })
                .catch((e) => {
                if (out) {
                    out.error = e instanceof Error ? e : new Error(String(e));
                }
                return false;
            });
        }
        try {
            let insertValue = value;
            if (validateOnSet) {
                insertValue = validator(insertValue);
                if ('issues' in insertValue) {
                    if (out) {
                        out.error = new Error(JSON.stringify(insertValue.issues, null, 2));
                    }
                    return false;
                }
                insertValue = insertValue.value;
            }
            if (serializer) {
                insertValue = serializer(insertValue);
            }
            store.setItem(fullKey, insertValue);
            _untypedEmit(fullKey, 'set', insertValue);
            return true;
        }
        catch (e) {
            if (out) {
                out.error = e instanceof Error ? e : new Error(String(e));
            }
            return false;
        }
    };
    const remove = (key, options) => {
        let fullKey = key;
        let out = undefined;
        if (options) {
            if (options.variables) {
                fullKey = getFullKey(key, options.variables);
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
            });
        }
        try {
            store.removeItem(fullKey);
            _untypedEmit(fullKey, 'remove');
            return true;
        }
        catch (e) {
            if (out) {
                out.error = e instanceof Error ? e : new Error(String(e));
            }
            return false;
        }
    };
    const buildKeyApi = (key, options) => {
        const deserializer = typeof deserialize?.[key] === 'function'
            ? deserialize[key]
            : typeof defaultDeserialize === 'function'
                ? defaultDeserialize
                : undefined;
        const serializer = typeof serialize?.[key] === 'function'
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
                fullKey = getFullKey(key, options.variables);
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
        const _emit = ((action, data) => {
            if (isAsync && validateOnEmit) {
                return Promise.resolve(validator(data))
                    .then((value) => {
                    if ('issues' in value) {
                        if (out) {
                            out.error = new Error(JSON.stringify(value.issues, null, 2));
                        }
                        return;
                    }
                    _untypedEmit(fullKey, action, value);
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
                    _untypedEmit(fullKey, action, value);
                    return;
                }
                catch (e) {
                    if (out) {
                        out.error = e instanceof Error ? e : new Error(String(e));
                    }
                    return;
                }
            }
            _untypedEmit(fullKey, data);
        });
        const _get = (defaultValue) => {
            if (isAsync) {
                return Promise.resolve(store.getItem(fullKey))
                    .then(async (value) => {
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
                        return value.value;
                    }
                    return value;
                })
                    .catch((e) => {
                    if (out) {
                        out.error = e instanceof Error ? e : new Error(String(e));
                    }
                    return defaultValue;
                });
            }
            try {
                let value = store.getItem(fullKey);
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
                    return value.value;
                }
                return value;
            }
            catch (e) {
                if (out) {
                    out.error = e instanceof Error ? e : new Error(String(e));
                }
                return defaultValue;
            }
        };
        const _set = (value) => {
            if (isAsync) {
                return Promise.resolve(value)
                    .then(async (insertValue) => {
                    if (validateOnSet) {
                        insertValue = await validator(insertValue);
                        if ('issues' in insertValue) {
                            if (out) {
                                out.error = new Error(JSON.stringify(insertValue.issues, null, 2));
                            }
                            return false;
                        }
                        insertValue = insertValue.value;
                    }
                    if (serializer) {
                        insertValue = await serializer(insertValue);
                    }
                    await store.setItem(fullKey, insertValue);
                    _untypedEmit(fullKey, 'set', insertValue);
                    return true;
                })
                    .catch((e) => {
                    if (out) {
                        out.error = e instanceof Error ? e : new Error(String(e));
                    }
                    return false;
                });
            }
            try {
                let insertValue = value;
                if (validateOnSet) {
                    insertValue = validator(insertValue);
                    if ('issues' in insertValue) {
                        if (out) {
                            out.error = new Error(JSON.stringify(insertValue.issues, null, 2));
                        }
                        return false;
                    }
                    insertValue = insertValue.value;
                }
                if (serializer) {
                    insertValue = serializer(insertValue);
                }
                store.setItem(fullKey, insertValue);
                _untypedEmit(fullKey, 'set', insertValue);
                return true;
            }
            catch (e) {
                if (out) {
                    out.error = e instanceof Error ? e : new Error(String(e));
                }
                return false;
            }
        };
        const _remove = () => {
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
                });
            }
            try {
                store.removeItem(fullKey);
                _untypedEmit(fullKey, 'remove');
                return true;
            }
            catch (e) {
                if (out) {
                    out.error = e instanceof Error ? e : new Error(String(e));
                }
                return false;
            }
        };
        const _subscribe = (trigger) => {
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
    });
});
