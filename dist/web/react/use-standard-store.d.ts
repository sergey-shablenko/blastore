import { type KeyVariables } from '../types';
import { BuildStandard } from '../standard';
export declare function useStandardStore<TStore extends ReturnType<BuildStandard<any, any, any, any>>, TKeyMode extends {
    [K in keyof TStore['schema']['validate']]: 'sync' | 'async';
}, TKey extends keyof TStore['schema']['validate'] & string>(store: TStore, key: TKey, defaultValue: NonNullable<TStore['schema']['validate'][TKey]['~standard']['types']>['output'], options?: KeyVariables<TKey> & {
    validateOnGet?: boolean;
    validateOnSet?: boolean;
    validateOnEmit?: boolean;
}): {
    isInitialised: boolean;
    value: NonNullable<TStore["schema"]["validate"][TKey]["~standard"]["types"]>["output"];
    error: undefined;
    set: ReturnType<ReturnType<BuildStandard<Pick<TStore["schema"]["validate"], TKey>, TKeyMode, any, any>>["buildKeyApi"]>["set"];
    remove: () => boolean | Promise<boolean>;
    emit: ReturnType<ReturnType<BuildStandard<Pick<TStore["schema"]["validate"], TKey>, TKeyMode, any, any>>["buildKeyApi"]>["emit"];
    subscribe: ReturnType<ReturnType<BuildStandard<Pick<TStore["schema"]["validate"], TKey>, TKeyMode, any, any>>["buildKeyApi"]>["subscribe"];
};
