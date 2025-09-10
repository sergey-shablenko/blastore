import { IndexableKeyOf, KeyVariables, MaybePromisify, StandardSchema, StandardSchemaV1, Switch, Trigger, Unsubscribe } from './types';
export type BuildStandard<TValidate extends Record<string, StandardSchemaV1>, TKeyMode extends {
    [K in keyof TValidate]: TOutput extends Promise<any> ? 'async' : 'sync' | 'async';
}, TInput, TOutput> = (schema: StandardSchema<TValidate, TKeyMode, TInput, TOutput>, defaultOptions?: {
    validateOnGet?: boolean;
    validateOnSet?: boolean;
}) => Readonly<{
    schema: StandardSchema<TValidate, TKeyMode, TInput, TOutput>;
    get<TGetKey extends IndexableKeyOf<TValidate>>(key: TGetKey, defaultValue: NonNullable<TValidate[TGetKey]['~standard']['types']>['output'], options?: KeyVariables<TGetKey> & {
        validate?: boolean;
        out?: {
            error?: Error;
        };
    }): MaybePromisify<TKeyMode[TGetKey], NonNullable<TValidate[TGetKey]['~standard']['types']>['output']>;
    set<TSetKey extends IndexableKeyOf<TValidate>>(key: TSetKey, value: NonNullable<TValidate[TSetKey]['~standard']['types']>['input'], options?: KeyVariables<TSetKey> & {
        validate?: boolean;
        out?: {
            error?: Error;
        };
    }): MaybePromisify<TKeyMode[TSetKey], boolean>;
    remove<TRemoveKey extends IndexableKeyOf<TValidate>>(key: TRemoveKey, options?: KeyVariables<TRemoveKey> & {
        out?: {
            error?: Error;
        };
    }): MaybePromisify<TKeyMode[TRemoveKey], boolean>;
    subscribe<TSubKey extends IndexableKeyOf<TValidate>>(key: TSubKey, trigger: Trigger<NonNullable<TValidate[TSubKey]['~standard']['types']>['output']>, options?: KeyVariables<TSubKey>): Unsubscribe;
    untypedSubscribe(key: string, trigger: Trigger<NonNullable<TValidate[string]['~standard']['types']>['output']>): Unsubscribe;
    emit<TEmitKey extends IndexableKeyOf<TValidate>>(key: TEmitKey, action: 'remove'): MaybePromisify<TKeyMode[TEmitKey], boolean>;
    emit<TEmitKey extends IndexableKeyOf<TValidate>>(key: TEmitKey, action: 'set' | string, data: NonNullable<TValidate[TEmitKey]['~standard']['types']>['input'], options?: KeyVariables<TEmitKey> & {
        validate?: boolean;
        out?: {
            error?: Error;
        };
    }): MaybePromisify<TKeyMode[TEmitKey], boolean>;
    untypedEmit(key: string, action: 'remove'): Promise<boolean>;
    untypedEmit<TFDeserialize extends boolean>(key: string, action: 'set' | string, data: Switch<TFDeserialize, TOutput, NonNullable<TValidate[keyof TValidate]['~standard']['types']>['input']>, options?: {
        validate?: boolean;
        deserialize?: TFDeserialize;
        out?: {
            error?: Error;
        };
    }): Promise<boolean>;
    buildKeyApi: <TApiKey extends IndexableKeyOf<TValidate>>(key: TApiKey, options?: KeyVariables<TApiKey> & {
        validateOnGet?: boolean;
        validateOnSet?: boolean;
        validateOnEmit?: boolean;
        out?: {
            error?: Error;
        };
    }) => {
        get(defaultValue: NonNullable<TValidate[TApiKey]['~standard']['types']>['output']): MaybePromisify<TKeyMode[TApiKey], NonNullable<TValidate[TApiKey]['~standard']['types']>['output']>;
        set(value: NonNullable<TValidate[TApiKey]['~standard']['types']>['input']): MaybePromisify<TKeyMode[TApiKey], boolean>;
        remove(): MaybePromisify<TKeyMode[TApiKey], boolean>;
        subscribe(trigger: Trigger<NonNullable<TValidate[TApiKey]['~standard']['types']>['output']>): Unsubscribe;
        emit(action: 'remove'): MaybePromisify<TKeyMode[TApiKey], boolean>;
        emit(action: 'set' | string, data: NonNullable<TValidate[TApiKey]['~standard']['types']>['input']): MaybePromisify<TKeyMode[TApiKey], boolean>;
    };
}>;
export declare const buildStandard: <TValidate extends Record<string, StandardSchemaV1>, TKeyMode extends { [K in keyof TValidate]: TOutput extends Promise<any> ? "async" : "sync" | "async"; }, TInput, TOutput>(schema: StandardSchema<TValidate, TKeyMode, TInput, TOutput>) => ReturnType<BuildStandard<TValidate, TKeyMode, TInput, TOutput>>;
