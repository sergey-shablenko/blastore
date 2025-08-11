import { useEffect, useMemo, useRef, useState } from 'react';
import { type KeyVariables } from '../types';
import { BuildSync } from '../sync';

export function useSyncStore<
  TStore extends ReturnType<BuildSync<any, any, any, any>>,
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
  const initialValue = useMemo(() => keyApi.get(defaultValue), [keyApi]);
  const [value, setValue] =
    useState<Exclude<ReturnType<TStore['schema']['validate'][TKey]>, Error>>(
      initialValue
    );

  useEffect(() => {
    setValue(initialValue);
    return keyApi.subscribe(() => setValue(keyApi.get(defaultValue)));
  }, [keyApi]);

  return {
    value,
    error: out.error,
    set: keyApi.set as ReturnType<
      ReturnType<
        BuildSync<
          TStore['schema']['validate'],
          TStore['schema']['serialize'],
          TStore['schema']['deserialize'],
          TKey
        >
      >['buildKeyApi']
    >['set'],
    remove: keyApi.remove,
    emit: keyApi.emit,
    subscribe: keyApi.subscribe,
  };
}
