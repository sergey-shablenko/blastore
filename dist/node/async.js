"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAsync = buildAsync;
const async_memory_storage_1 = require("./async-memory-storage");
const util_1 = require("./util");
const subscriptions = new WeakMap();
const defaultStore = new async_memory_storage_1.AsyncMemoryStorage();
function buildAsync(scheme, store = defaultStore) {
    // only holds compiled keys, not simple keys
    const keys = Object.keys(scheme.validate).reduce((obj, key) => {
        const parts = (0, util_1.parseKey)(key);
        if (parts.length) {
            obj[key] = new Function('vars', `return ${parts.map(([s, i]) => `'${s}' + (vars[${i}] === null ? '' : vars[${i}])`).join(' + ')};`);
        }
        return obj;
    }, {});
    const emit = (key, variables) => {
        const subs = subscriptions
            .get(store)
            ?.get((0, util_1.getFullKey)(keys, key, variables));
        if (subs?.length) {
            for (let i = 0; i < subs.length; i++) {
                subs[i]();
            }
        }
    };
    const untypedEmit = (key) => emit(key);
    const get = async (key, defaultValue, options) => {
        try {
            const deserializer = scheme.deserialize?.[key] ?? scheme.defaultDeserialize;
            const value = await store.getItem((0, util_1.getFullKey)(keys, key, options?.variables));
            const validated = await scheme.validate[key](deserializer ? await deserializer(value) : value);
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
    const tryGet = async (key, options) => {
        try {
            const deserializer = scheme.deserialize?.[key] ?? scheme.defaultDeserialize;
            const value = await store.getItem((0, util_1.getFullKey)(keys, key, options?.variables));
            return scheme.validate[key](deserializer ? await deserializer(value) : value);
        }
        catch (e) {
            return e instanceof Error ? e : new Error(String(e));
        }
    };
    const set = async (key, value, options) => {
        try {
            const validated = await scheme.validate[key](value);
            if (validated instanceof Error) {
                return false;
            }
            const serializer = scheme.serialize?.[key] ?? scheme.defaultSerialize;
            const fullKey = (0, util_1.getFullKey)(keys, key, options?.variables);
            await store.setItem(fullKey, serializer
                ? await serializer(validated)
                : validated);
            untypedEmit(fullKey);
            return true;
        }
        catch (e) {
            console.error(e);
            return false;
        }
    };
    const trySet = async (key, value, options) => {
        try {
            const validated = await scheme.validate[key](value);
            if (validated instanceof Error) {
                return validated;
            }
            const serializer = scheme.serialize?.[key] ?? scheme.defaultSerialize;
            const fullKey = (0, util_1.getFullKey)(keys, key, options?.variables);
            await store.setItem(fullKey, serializer
                ? await serializer(validated)
                : validated);
            untypedEmit(fullKey);
        }
        catch (e) {
            return e instanceof Error ? e : new Error(String(e));
        }
    };
    const remove = async (key, variables) => {
        try {
            const fullKey = (0, util_1.getFullKey)(keys, key, variables);
            await store.removeItem(fullKey);
            untypedEmit(fullKey);
            return true;
        }
        catch (e) {
            console.error(e);
            return false;
        }
    };
    const tryRemove = async (key, variables) => {
        try {
            const fullKey = (0, util_1.getFullKey)(keys, key, variables);
            await store.removeItem(fullKey);
            untypedEmit(fullKey);
        }
        catch (e) {
            return e instanceof Error ? e : new Error(String(e));
        }
    };
    const subscribe = (key, trigger, options) => {
        let storeSubscriptions = subscriptions.get(store);
        const fullKey = (0, util_1.getFullKey)(keys, key, options?.variables);
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
        const precompiledKey = (0, util_1.getFullKey)(keys, key, variables);
        const emit = () => {
            const subs = subscriptions.get(store)?.get(precompiledKey);
            if (subs?.length) {
                for (let i = 0; i < subs.length; i++) {
                    subs[i]();
                }
            }
        };
        const get = async (defaultValue) => {
            try {
                const value = await store.getItem(precompiledKey);
                const validated = await validator(deserializer ? await deserializer(value) : value);
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
        const tryGet = async () => {
            try {
                const value = await store.getItem(precompiledKey);
                return validator(deserializer ? await deserializer(value) : value);
            }
            catch (e) {
                return e instanceof Error ? e : new Error(String(e));
            }
        };
        const set = async (value) => {
            try {
                const validated = await validator(value);
                if (validated instanceof Error) {
                    return false;
                }
                await store.setItem(precompiledKey, serializer
                    ? await serializer(validated)
                    : validated);
                untypedEmit(precompiledKey);
                return true;
            }
            catch (e) {
                console.error(e);
                return false;
            }
        };
        const trySet = async (value) => {
            try {
                const validated = await validator(value);
                if (validated instanceof Error) {
                    return validated;
                }
                await store.setItem(precompiledKey, serializer
                    ? await serializer(validated)
                    : validated);
                untypedEmit(precompiledKey);
            }
            catch (e) {
                return e instanceof Error ? e : new Error(String(e));
            }
        };
        const remove = async () => {
            try {
                await store.removeItem(precompiledKey);
                untypedEmit(precompiledKey);
                return true;
            }
            catch (e) {
                console.error(e);
                return false;
            }
        };
        const tryRemove = async () => {
            try {
                await store.removeItem(precompiledKey);
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
