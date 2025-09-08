import { useEffect, useMemo, useRef, useState } from 'react';
import { type KeyVariables } from '../types';
import { BuildStandard } from '../standard';

export function useStandardStore<
  TStore extends ReturnType<BuildStandard<any, any, any, any>>,
  TKeyMode extends {
    [K in keyof TStore['schema']['validate']]: 'sync' | 'async';
  },
  TKey extends keyof TStore['schema']['validate'] & string,
>(
  store: TStore,
  key: TKey,
  defaultValue: NonNullable<
    TStore['schema']['validate'][TKey]['~standard']['types']
  >['output'],
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
        ...((options ?? {}) as KeyVariables<TKey> & {
          validateOnGet?: boolean;
          validateOnSet?: boolean;
          validateOnEmit?: boolean;
        }),
        out,
      }),
    [key, options]
  );
  const [value, setValue] =
    useState<
      Exclude<Awaited<ReturnType<TStore['schema']['validate'][TKey]>>, Error>
    >(defaultValue);
  const [isInitialised, setIsInitialised] = useState(false);

  useEffect(() => {
    Promise.resolve(keyApi.get(defaultValue)).then((v: any) => {
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
        BuildStandard<
          Pick<TStore['schema']['validate'], TKey>,
          TKeyMode,
          any,
          any
        >
      >['buildKeyApi']
    >['set'],
    remove: keyApi.remove,
    emit: keyApi.emit as ReturnType<
      ReturnType<
        BuildStandard<
          Pick<TStore['schema']['validate'], TKey>,
          TKeyMode,
          any,
          any
        >
      >['buildKeyApi']
    >['emit'],
    subscribe: keyApi.subscribe as ReturnType<
      ReturnType<
        BuildStandard<
          Pick<TStore['schema']['validate'], TKey>,
          TKeyMode,
          any,
          any
        >
      >['buildKeyApi']
    >['subscribe'],
  };
}
