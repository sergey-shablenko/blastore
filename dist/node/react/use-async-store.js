"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAsyncStore = useAsyncStore;
const react_1 = require("react");
function useAsyncStore(store, key, defaultValue, options) {
    const out = (0, react_1.useRef)({ error: undefined }).current;
    const keyApi = (0, react_1.useMemo)(() => store.buildKeyApi(key, { ...(options ?? {}), out }), [key, options]);
    const [value, setValue] = (0, react_1.useState)(defaultValue);
    const [isInitialised, setIsInitialised] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        keyApi.get(defaultValue).then((v) => {
            setValue(v);
            setIsInitialised(true);
        });
        return keyApi.subscribe((e) => {
            if (e.action === 'remove') {
                setValue(defaultValue);
                setIsInitialised(true);
            }
            if (e.action === 'set') {
                setValue(e.data);
                setIsInitialised(true);
            }
            // ignore custom actions
        });
    }, [keyApi]);
    return {
        isInitialised,
        value,
        error: out.error,
        set: keyApi.set,
        remove: keyApi.remove,
        emit: keyApi.emit,
        subscribe: keyApi.subscribe,
    };
}
