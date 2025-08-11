import { useEffect, useMemo, useRef, useState } from 'react';
export function useSyncStore(store, key, defaultValue, options) {
    const out = useRef({ error: undefined }).current;
    const keyApi = useMemo(() => store.buildKeyApi(key, { ...(options ?? {}), out }), [key, options]);
    const initialValue = useMemo(() => keyApi.get(defaultValue), [keyApi]);
    const [value, setValue] = useState(initialValue);
    useEffect(() => {
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
