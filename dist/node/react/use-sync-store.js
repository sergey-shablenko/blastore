"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSyncStore = useSyncStore;
const react_1 = require("react");
function useSyncStore(store, key, defaultValue, options) {
    const out = (0, react_1.useRef)({ error: undefined }).current;
    const keyApi = (0, react_1.useMemo)(() => store.buildKeyApi(key, { ...(options ?? {}), out }), [key, options]);
    const initialValue = (0, react_1.useMemo)(() => keyApi.get(defaultValue), [keyApi]);
    const [value, setValue] = (0, react_1.useState)(initialValue);
    (0, react_1.useEffect)(() => {
        setValue(initialValue);
        return keyApi.subscribe(() => setValue(keyApi.get(defaultValue)));
    }, [keyApi]);
    return {
        value,
        error: out.error,
        set: keyApi.set,
        remove: keyApi.remove,
        emit: keyApi.emit,
        subscribe: keyApi.subscribe,
    };
}
