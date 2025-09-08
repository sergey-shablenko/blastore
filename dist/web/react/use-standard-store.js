import { useEffect, useMemo, useRef, useState } from 'react';
export function useStandardStore(store, key, defaultValue, options) {
    const out = useRef({ error: undefined }).current;
    const keyApi = useMemo(() => store.buildKeyApi(key, {
        ...(options ?? {}),
        out,
    }), [key, options]);
    const [value, setValue] = useState(defaultValue);
    const [isInitialised, setIsInitialised] = useState(false);
    useEffect(() => {
        Promise.resolve(keyApi.get(defaultValue)).then((v) => {
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
