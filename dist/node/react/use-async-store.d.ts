import { type KeyVariables } from '../types';
import { BuildAsync } from '../async';
export declare function useAsyncStore<TStore extends ReturnType<BuildAsync<any, any, any, any>>, TKey extends keyof TStore['schema']['validate'] & string>(store: TStore, key: TKey, defaultValue: Exclude<ReturnType<TStore['schema']['validate'][TKey]>, Error>, options?: KeyVariables<TKey> & {
    validateOnGet?: boolean;
    validateOnSet?: boolean;
}): {
    isInitialised: boolean;
    value: Exclude<Awaited<ReturnType<TStore["schema"]["validate"][TKey]>>, Error>;
    error: undefined;
    set: ReturnType<ReturnType<BuildAsync<TStore["schema"]["validate"], TStore["schema"]["serialize"], TStore["schema"]["deserialize"], TKey>>["buildKeyApi"]>["set"];
    remove: () => Promise<boolean>;
    emit: () => void;
    subscribe: (trigger: import("../types").Trigger) => import("../types").Unsubscribe;
};
