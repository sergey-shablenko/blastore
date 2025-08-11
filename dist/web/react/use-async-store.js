import { useEffect, useMemo, useRef, useState } from 'react';
export function useAsyncStore(store, key, defaultValue, options) {
    const out = useRef({ error: undefined }).current;
    const keyApi = useMemo(() => store.buildKeyApi(key, { ...(options ?? {}), out }), [key, options]);
    const [value, setValue] = useState(defaultValue);
    const [isInitialised, setIsInitialised] = useState(false);
    useEffect(() => {
        keyApi.get(defaultValue).then((v) => {
            setValue(v);
            setIsInitialised(true);
        });
        return keyApi.subscribe(async () => {
            setValue(await keyApi.get(defaultValue));
            setIsInitialised(true);
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
