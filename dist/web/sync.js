import { MemoryStorage } from './memory-storage';
import { getFullKey, parseKey } from './util';
const subscriptions = new WeakMap();
const defaultStore = new MemoryStorage();
export function buildSync(scheme, store = defaultStore) {
    // only holds compiled keys, not simple keys
    const keys = Object.keys(scheme.validate).reduce((obj, key) => {
        const parts = parseKey(key);
        if (parts.length) {
            obj[key] = new Function('vars', `return ${parts.map(([s, i]) => `'${s}' + (vars[${i}] === null ? '' : vars[${i}])`).join(' + ')};`);
        }
        return obj;
    }, {});
    const emit = (key, variables) => {
        const subs = subscriptions
            .get(store)
            ?.get(getFullKey(keys, key, variables));
        if (subs?.length) {
            for (let i = 0; i < subs.length; i++) {
                subs[i]();
            }
        }
    };
    const untypedEmit = (key) => emit(key);
    const get = (key, defaultValue, options) => {
        try {
            const deserializer = scheme.deserialize?.[key] ?? scheme.defaultDeserialize;
            const value = store.getItem(getFullKey(keys, key, options?.variables));
            const validated = scheme.validate[key](deserializer ? deserializer(value) : value);
            if (validated instanceof Error) {
                return defaultValue;
            }
            return validated;
        }
        catch (e) {
            console.error(e);
            return defaultValue;
        }
    };
    const tryGet = (key, options) => {
        try {
            const deserializer = scheme.deserialize?.[key] ?? scheme.defaultDeserialize;
            const value = store.getItem(getFullKey(keys, key, options?.variables));
            return scheme.validate[key](deserializer ? deserializer(value) : value);
        }
        catch (e) {
            return e instanceof Error ? e : new Error(String(e));
        }
    };
    const set = (key, value, options) => {
        try {
            const validated = scheme.validate[key](value);
            if (validated instanceof Error) {
                return false;
            }
            const serializer = scheme.serialize?.[key] ?? scheme.defaultSerialize;
            const fullKey = getFullKey(keys, key, options?.variables);
            store.setItem(fullKey, serializer
                ? serializer(validated)
                : validated);
            untypedEmit(fullKey);
            return true;
        }
        catch (e) {
            console.error(e);
            return false;
        }
    };
    const trySet = (key, value, options) => {
        try {
            const validated = scheme.validate[key](value);
            if (validated instanceof Error) {
                return validated;
            }
            const serializer = scheme.serialize?.[key] ?? scheme.defaultSerialize;
            const fullKey = getFullKey(keys, key, options?.variables);
            store.setItem(fullKey, serializer
                ? serializer(validated)
                : validated);
            untypedEmit(fullKey);
        }
        catch (e) {
            return e instanceof Error ? e : new Error(String(e));
        }
    };
    const remove = (key, variables) => {
        try {
            const fullKey = getFullKey(keys, key, variables);
            store.removeItem(fullKey);
            untypedEmit(fullKey);
            return true;
        }
        catch (e) {
            console.error(e);
            return false;
        }
    };
    const tryRemove = (key, variables) => {
        try {
            const fullKey = getFullKey(keys, key, variables);
            store.removeItem(fullKey);
            untypedEmit(fullKey);
        }
        catch (e) {
            return e instanceof Error ? e : new Error(String(e));
        }
    };
    const subscribe = (key, trigger, options) => {
        let storeSubscriptions = subscriptions.get(store);
        const fullKey = getFullKey(keys, key, options?.variables);
        if (!storeSubscriptions) {
            storeSubscriptions = new Map();
            subscriptions.set(store, storeSubscriptions);
        }
        const subscriber = storeSubscriptions.get(fullKey);
        if (subscriber) {
            subscriber.push(trigger);
        }
        else {
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
    const untypedSubscribe = (key, trigger) => subscribe(key, trigger);
    const buildKeyApi = (key, variables) => {
        const validator = scheme.validate[key];
        const serializer = scheme.serialize?.[key] ?? scheme.defaultSerialize;
        const deserializer = scheme.deserialize?.[key] ?? scheme.defaultDeserialize;
        const precompiledKey = getFullKey(keys, key, variables);
        const emit = () => {
            const subs = subscriptions.get(store)?.get(precompiledKey);
            if (subs?.length) {
                for (let i = 0; i < subs.length; i++) {
                    subs[i]();
                }
            }
        };
        const get = (defaultValue) => {
            try {
                const value = store.getItem(precompiledKey);
                const validated = validator(deserializer ? deserializer(value) : value);
                if (validated instanceof Error) {
                    return defaultValue;
                }
                return validated;
            }
            catch (e) {
                console.error(e);
                return defaultValue;
            }
        };
        const tryGet = () => {
            try {
                const value = store.getItem(precompiledKey);
                return validator(deserializer ? deserializer(value) : value);
            }
            catch (e) {
                return e instanceof Error ? e : new Error(String(e));
            }
        };
        const set = (value) => {
            try {
                const validated = validator(value);
                if (validated instanceof Error) {
                    return false;
                }
                store.setItem(precompiledKey, serializer
                    ? serializer(validated)
                    : validated);
                untypedEmit(precompiledKey);
                return true;
            }
            catch (e) {
                console.error(e);
                return false;
            }
        };
        const trySet = (value) => {
            try {
                const validated = validator(value);
                if (validated instanceof Error) {
                    return validated;
                }
                store.setItem(precompiledKey, serializer
                    ? serializer(validated)
                    : validated);
                untypedEmit(precompiledKey);
            }
            catch (e) {
                return e instanceof Error ? e : new Error(String(e));
            }
        };
        const remove = () => {
            try {
                store.removeItem(precompiledKey);
                untypedEmit(precompiledKey);
                return true;
            }
            catch (e) {
                console.error(e);
                return false;
            }
        };
        const tryRemove = () => {
            try {
                store.removeItem(precompiledKey);
                untypedEmit(precompiledKey);
            }
            catch (e) {
                return e instanceof Error ? e : new Error(String(e));
            }
        };
        const subscribe = (trigger) => {
            let storeSubscriptions = subscriptions.get(store);
            if (!storeSubscriptions) {
                storeSubscriptions = new Map();
                subscriptions.set(store, storeSubscriptions);
            }
            const subscriber = storeSubscriptions.get(precompiledKey);
            if (subscriber) {
                subscriber.push(trigger);
            }
            else {
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
