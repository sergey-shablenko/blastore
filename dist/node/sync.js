"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSync = void 0;
const util_1 = require("./util");
const subscriptions = new WeakMap();
const buildSync = (schema) => {
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
        const parts = (0, util_1.parseKey)(key);
        const regex = (0, util_1.buildRegexForKeyTemplate)(parts);
        if (parts.some(([, variable]) => variable)) {
            const builder = new Function('vars', `return ${parts.map(([s, i]) => [`'${s}'`, i ? `vars${/^\d+$/i.test(i) || i === 'true' || i === 'false' ? `[${i}]` : /^([^0-9a-z]+|)$/i.test(i) ? `['${i}']` : `.${i}`}` : null].filter(Boolean).join(' + ')).join(' + ')};`);
            return { key, parts, regex, builder };
        }
        return { key, parts, regex };
    });
    const getFullKey = (0, util_1.createKeyBuilder)(keys);
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
    const untypedEmit = ((key, action, data, options) => {
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
                            dataToEmit = deserializer(data);
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
        const validator = validate[key];
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
        if (validateOnEmit) {
            try {
                const value = validator(data);
                if (value instanceof Error) {
                    if (out) {
                        out.error = value;
                    }
                    return false;
                }
                _untypedEmit(fullKey, action, value);
                return true;
            }
            catch (e) {
                if (out) {
                    out.error = e instanceof Error ? e : new Error(String(e));
                }
                return false;
            }
        }
        _untypedEmit(fullKey, action, data);
        return true;
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
        const validator = validate[key];
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
        const validator = validate[key];
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
        try {
            let insertValue = value;
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
        const validator = validate[key];
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
            if (validateOnEmit) {
                try {
                    const value = action === 'remove' ? undefined : validator(data);
                    if (value instanceof Error) {
                        if (out) {
                            out.error = value;
                        }
                        return false;
                    }
                    _untypedEmit(fullKey, action, value);
                    return true;
                }
                catch (e) {
                    if (out) {
                        out.error = e instanceof Error ? e : new Error(String(e));
                    }
                    return false;
                }
            }
            _untypedEmit(fullKey, action, data);
            return true;
        });
        const _get = (defaultValue) => {
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
            try {
                let insertValue = value;
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
            }
            catch (e) {
                if (out) {
                    out.error = e instanceof Error ? e : new Error(String(e));
                }
                return false;
            }
        };
        const _remove = () => {
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
};
exports.buildSync = buildSync;
