import { useEffect, useMemo, useRef, useState } from 'react';
import { type KeyVariables } from '../types';
import { BuildAsync } from '../async';

export function useAsyncStore<
  TStore extends ReturnType<BuildAsync<any, any, any>>,
  TKey extends keyof TStore['schema']['validate'] & string,
>(
  store: TStore,
  key: TKey,
  defaultValue: Exclude<ReturnType<TStore['schema']['validate'][TKey]>, Error>,
  options?: KeyVariables<TKey> & {
    validateOnGet?: boolean;
    validateOnSet?: boolean;
  }
) {
  const out = useRef({ error: undefined }).current;
  const keyApi = useMemo(
    () => store.buildKeyApi(key, { ...((options ?? {}) as any), out }),
    [key, options]
  );
  const [value, setValue] =
    useState<
      Exclude<Awaited<ReturnType<TStore['schema']['validate'][TKey]>>, Error>
    >(defaultValue);
  const [isInitialised, setIsInitialised] = useState(false);

  useEffect(() => {
    keyApi.get(defaultValue).then((v: any) => {
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
    set: keyApi.set as ReturnType<
      ReturnType<
        BuildAsync<TStore['schema']['validate'], any, any>
      >['buildKeyApi']
    >['set'],
    remove: keyApi.remove,
    emit: keyApi.emit,
    subscribe: keyApi.subscribe,
  };
}
