import { IndexableKeyOf, type KeyVariables } from '../types';
import { BuildSync } from '../sync';
export declare function useSyncStore<TStore extends ReturnType<BuildSync<any, any, any>>, TKey extends IndexableKeyOf<TStore['schema']['validate']>>(store: TStore, key: TKey, defaultValue: Exclude<ReturnType<TStore['schema']['validate'][TKey]>, Error>, options?: KeyVariables<TKey> & {
    validateOnGet?: boolean;
    validateOnSet?: boolean;
    validateOnEmit?: boolean;
}): {
    value: Exclude<ReturnType<TStore["schema"]["validate"][TKey]>, Error>;
    error: undefined;
    set: ReturnType<ReturnType<BuildSync<Pick<TStore["schema"]["validate"], TKey>, any, any>>["buildKeyApi"]>["set"];
    remove: () => boolean;
    emit: ReturnType<ReturnType<BuildSync<Pick<TStore["schema"]["validate"], TKey>, any, any>>["buildKeyApi"]>["emit"];
    subscribe: ReturnType<ReturnType<BuildSync<Pick<TStore["schema"]["validate"], TKey>, any, any>>["buildKeyApi"]>["subscribe"];
};
