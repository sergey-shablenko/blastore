/** The Standard Schema interface. */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
    /** The Standard Schema properties. */
    readonly '~standard': StandardSchemaV1.Props<Input, Output>;
}
export declare namespace StandardSchemaV1 {
    /** The Standard Schema properties interface. */
    interface Props<Input = unknown, Output = Input> {
        /** The version number of the standard. */
        readonly version: 1;
        /** The vendor name of the schema library. */
        readonly vendor: string;
        /** Validates unknown input values. */
        readonly validate: (value: unknown) => Result<Output> | Promise<Result<Output>>;
        /** Inferred types associated with the schema. */
        readonly types?: Types<Input, Output> | undefined;
    }
    /** The result interface of the validate function. */
    type Result<Output> = SuccessResult<Output> | FailureResult;
    /** The result interface if validation succeeds. */
    interface SuccessResult<Output> {
        /** The typed output value. */
        readonly value: Output;
        /** The non-existent issues. */
        readonly issues?: undefined;
    }
    /** The result interface if validation fails. */
    interface FailureResult {
        /** The issues of failed validation. */
        readonly issues: ReadonlyArray<Issue>;
    }
    /** The issue interface of the failure output. */
    interface Issue {
        /** The error message of the issue. */
        readonly message: string;
        /** The path of the issue, if any. */
        readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
    }
    /** The path segment interface of the issue. */
    interface PathSegment {
        /** The key representing a path segment. */
        readonly key: PropertyKey;
    }
    /** The Standard Schema types interface. */
    interface Types<Input = unknown, Output = Input> {
        /** The input type of the schema. */
        readonly input: Input;
        /** The output type of the schema. */
        readonly output: Output;
    }
    /** Infers the input type of a Standard Schema. */
    type InferInput<Schema extends StandardSchemaV1> = NonNullable<Schema['~standard']['types']>['input'];
    /** Infers the output type of a Standard Schema. */
    type InferOutput<Schema extends StandardSchemaV1> = NonNullable<Schema['~standard']['types']>['output'];
}
export interface StandardSchema<TValidate extends Record<string, StandardSchemaV1>, TKeyMode extends {
    [K in keyof TValidate]: TOutput extends Promise<any> ? 'async' : 'sync' | 'async';
}, TInput, TOutput> {
    store: StandardStore<TInput, TOutput>;
    validate: TValidate;
    keyMode: TKeyMode;
    defaultSerialize?: (v: NonNullable<TValidate[keyof TValidate]['~standard']['types']>['output']) => TInput;
    defaultDeserialize?: (v: TOutput) => NonNullable<TValidate[keyof TValidate]['~standard']['types']>['output'];
    serialize?: Partial<{
        [K in keyof TValidate]: (v: NonNullable<TValidate[K]['~standard']['types']>['output']) => TKeyMode[K] extends 'async' ? Promise<TInput> : TInput;
    }>;
    deserialize?: Partial<{
        [K in keyof TValidate]: (v: Awaited<TOutput>) => TKeyMode[K] extends 'async' ? Promise<NonNullable<TValidate[K]['~standard']['types']>['output']> : NonNullable<TValidate[K]['~standard']['types']>['output'];
    }>;
    validateOnGet?: boolean;
    validateOnSet?: boolean;
    validateOnEmit?: boolean;
}
export interface SyncSchema<TValidate extends Record<string, (v: unknown) => unknown | Error>, TInput, TOutput> {
    store: SyncStore<TInput, TOutput>;
    validate: TValidate;
    defaultSerialize?: (v: Exclude<ReturnType<TValidate[keyof TValidate]>, Error>) => TInput;
    defaultDeserialize?: (v: TOutput) => Exclude<ReturnType<TValidate[keyof TValidate]>, Error>;
    serialize?: Partial<{
        [K in keyof TValidate]: (v: Exclude<ReturnType<TValidate[K]>, Error>) => TInput;
    }>;
    deserialize?: Partial<{
        [K in keyof TValidate]: (v: TOutput) => Exclude<ReturnType<TValidate[K]>, Error>;
    }>;
    validateOnGet?: boolean;
    validateOnSet?: boolean;
    validateOnEmit?: boolean;
}
export interface AsyncSchema<TValidate extends Record<string, (v: unknown) => Promise<unknown | Error>>, TInput, TOutput> {
    store: AsyncStore<TInput, TOutput>;
    validate: TValidate;
    defaultSerialize?: (v: Exclude<ReturnType<TValidate[keyof TValidate]>, Error>) => Promise<TInput>;
    defaultDeserialize?: (v: TOutput) => Promise<Exclude<ReturnType<TValidate[keyof TValidate]>, Error>>;
    serialize?: Partial<{
        [K in keyof TValidate]: (v: Exclude<Awaited<ReturnType<TValidate[K]>>, Error>) => Promise<TInput>;
    }>;
    deserialize?: Partial<{
        [K in keyof TValidate]: (v: TOutput) => Promise<Exclude<Awaited<ReturnType<TValidate[K]>>, Error>>;
    }>;
    validateOnGet?: boolean;
    validateOnSet?: boolean;
    validateOnEmit?: boolean;
}
export interface SyncStore<TInput, TOutput> {
    getItem(key: string): TOutput;
    setItem(key: string, value: TInput): unknown;
    removeItem(key: string): unknown;
}
export interface AsyncStore<TInput, TOutput> {
    getItem(key: string): Promise<TOutput>;
    setItem(key: string, value: TInput): Promise<unknown>;
    removeItem(key: string): Promise<unknown>;
}
export interface StandardStore<TInput, TOutput> {
    getItem(key: string): TOutput;
    setItem(key: string, value: TInput): unknown | Promise<unknown>;
    removeItem(key: string): unknown | Promise<unknown>;
}
export type Trigger<T> = (params: {
    action: 'remove';
    data: undefined;
} | {
    action: 'set';
    data: T;
} | {
    action: string;
    data: T;
}) => unknown;
export type Unsubscribe = () => void;
export type KeyVariable = string | number | boolean;
export type CompiledKeys = {
    key: string;
    parts: [string, string][];
    regex: string;
    builder?: (vars: Record<string, KeyVariable>) => string;
}[];
export type ExtractVars<S extends string> = S extends `${string}\${${infer Var}}${infer Rest}` ? Var | ExtractVars<Rest> : never;
export type KeyVariables<K extends string> = [ExtractVars<K>] extends [never] ? {
    variables?: never;
} : {
    variables: Record<ExtractVars<K>, string>;
};
export type MaybePromisify<TInput extends 'async' | 'sync', TOutput> = TInput extends 'async' ? Promise<TOutput> : TInput extends 'sync' ? TOutput : never;
export type IndexableKeyOf<T> = keyof T & string;
export type Switch<TFlag extends boolean, TType1, TTyp2> = TFlag extends true ? TType1 : TTyp2;
