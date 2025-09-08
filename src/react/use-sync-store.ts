import { useEffect, useMemo, useRef, useState } from 'react';
import { IndexableKeyOf, type KeyVariables } from '../types';
import { BuildSync } from '../sync';

export function useSyncStore<
  TStore extends ReturnType<BuildSync<any, any, any>>,
  TKey extends IndexableKeyOf<TStore['schema']['validate']>,
>(
  store: TStore,
  key: TKey,
  defaultValue: Exclude<ReturnType<TStore['schema']['validate'][TKey]>, Error>,
  options?: KeyVariables<TKey> & {
    validateOnGet?: boolean;
    validateOnSet?: boolean;
    validateOnEmit?: boolean;
  }
) {
  const out = useRef({ error: undefined }).current;
  const keyApi = useMemo(
    () =>
      store.buildKeyApi(key, {
        ...(options ?? {}),
        out,
      } as KeyVariables<TKey> & {
        validateOnGet?: boolean;
        validateOnSet?: boolean;
        validateOnEmit?: boolean;
      }),
    [key, options]
  );
  const initialValue = useMemo(() => keyApi.get(defaultValue), [keyApi]);
  const [value, setValue] =
    useState<Exclude<ReturnType<TStore['schema']['validate'][TKey]>, Error>>(
      initialValue
    );

  useEffect(() => {
    setValue(initialValue);
    return keyApi.subscribe((e) => {
      if (e.action === 'remove') {
        setValue(defaultValue);
      }
      if (e.action === 'set') {
        setValue(e.data);
      }
      // ignore custom actions
    });
  }, [keyApi]);

  return {
    value,
    error: out.error,
    set: keyApi.set as ReturnType<
      ReturnType<
        BuildSync<Pick<TStore['schema']['validate'], TKey>, any, any>
      >['buildKeyApi']
    >['set'],
    remove: keyApi.remove,
    emit: keyApi.emit as ReturnType<
      ReturnType<
        BuildSync<Pick<TStore['schema']['validate'], TKey>, any, any>
      >['buildKeyApi']
    >['emit'],
    subscribe: keyApi.subscribe as ReturnType<
      ReturnType<
        BuildSync<Pick<TStore['schema']['validate'], TKey>, any, any>
      >['buildKeyApi']
    >['subscribe'],
  };
}
