import { SyncMemoryStorage } from './sync-memory-storage';
import { getFullKey, parseKey } from './util';
const subscriptions = new WeakMap();
const defaultStore = new SyncMemoryStorage();
export const buildSync = ((schema, store = defaultStore, defaultOptions) => {
    const keys = Object.freeze(Object.keys(schema.validate).reduce((obj, key) => {
        const parts = parseKey(key);
        if (parts.some(([, variable]) => variable)) {
            obj[key] = new Function('vars', `return ${parts.map(([s, i]) => [`'${s}'`, i ? `vars${/^\d+$/i.test(i) || i === 'true' || i === 'false' ? `[${i}]` : /^([^0-9a-z]+|)$/i.test(i) ? `['${i}']` : `.${i}`}` : null].filter(Boolean).join(' + ')).join(' + ')};`);
        }
        return obj;
    }, {}));
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
    const subscribe = (key, trigger, variables) => {
        const fullKey = variables ? getFullKey(keys, key, variables) : key;
        return untypedSubscribe(fullKey, trigger);
    };
    const untypedEmit = (key) => {
        const storeSubs = subscriptions.get(store);
        const subs = storeSubs && storeSubs.get(key);
        if (subs && subs.length) {
            for (let i = 0; i < subs.length; i++) {
                subs[i]();
            }
        }
    };
    const emit = (key, variables) => {
        const fullKey = variables ? getFullKey(keys, key, variables) : key;
        untypedEmit(fullKey);
    };
    const get = (key, defaultValue, options) => {
        const deserializer = typeof schema.deserialize?.[key] === 'function'
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
                fullKey = getFullKey(keys, key, options.variables);
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
        const serializer = typeof schema.serialize?.[key] === 'function'
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
                fullKey = getFullKey(keys, key, options.variables);
            }
            if (options.out && typeof options.out === 'object') {
                out = options.out;
            }
            if (typeof options.validate === 'boolean') {
                validate = options.validate;
            }
        }
        try {
            let insertValue = value;
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
                insertValue = serializer(insertValue);
            }
            store.setItem(fullKey, insertValue);
            untypedEmit(fullKey);
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
                fullKey = getFullKey(keys, key, options.variables);
            }
            if (options.out && typeof options.out === 'object') {
                out = options.out;
            }
        }
        try {
            store.removeItem(fullKey);
            untypedEmit(fullKey);
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
        const deserializer = typeof schema.deserialize?.[key] === 'function'
            ? schema.deserialize[key]
            : typeof schema.defaultDeserialize === 'function'
                ? schema.defaultDeserialize
                : undefined;
        const serializer = typeof schema.serialize?.[key] === 'function'
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
                fullKey = getFullKey(keys, key, options.variables);
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
        const _emit = () => {
            untypedEmit(fullKey);
        };
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
                if (serializer) {
                    insertValue = serializer(insertValue);
                }
                store.setItem(fullKey, insertValue);
                untypedEmit(fullKey);
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
                untypedEmit(fullKey);
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
    };
});
