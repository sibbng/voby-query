import {
	$,
	type Observable,
	useMemo,
	type ObservableReadonly,
	useTimeout,
	useRoot,
	type ObservableMaybe,
	type FunctionMaybe,
	useEffect,
} from "voby";
import { useQueryClient, type QueryClient, type QueryKey } from "./useQuery";
import { hashFn } from "./utils";

type MutationStatus = "idle" | "pending" | "success" | "error";

export type MutationState<
	TData = unknown,
	TError = unknown,
	TVariables = unknown,
	TContext = unknown,
> = {
	data: Observable<TData | undefined>;
	error: Observable<TError | null>;
	status: Observable<MutationStatus>;
	failureCount: Observable<number>;
	failureReason: Observable<TError | null>;
	isPaused: Observable<boolean>;
	submittedAt: Observable<number | undefined>;
	variables: Observable<TVariables | undefined>;
	isError: Observable<boolean>;
	isIdle: Observable<boolean>;
	isPending: Observable<boolean>;
	isSuccess: Observable<boolean>;
	meta: Observable<Record<string, unknown>>;
};

export type MutationObject<
	TData = unknown,
	TError = unknown,
	TVariables = unknown,
	TContext = unknown,
> = {
	state: MutationState<TData, TError, TVariables, TContext>;
	options: MutationOptions<TData, TError, TVariables, TContext>;
	mutate: (
		variables: TVariables,
		options?: MutateOptions<TData, TError, TVariables, TContext>,
	) => Promise<TData | undefined>;
	mutateAsync: MutationObject<TData, TError, TVariables, TContext>["mutate"];
	reset: () => void;
	destroy: () => void;
	destroyDisposer: () => void;
	addInstance: () => () => void;
	removeInstance: () => void;
	scheduleDestroy: () => void;
	instances: number;
};
export type MutationKey = FunctionMaybe<ObservableMaybe<string | number>[]>;
export type MutationOptions<
	TData = unknown,
	TError = unknown,
	TVariables = TData,
	TContext = unknown,
> = {
	mutationFn?: (variables: TVariables) => Promise<TData>;
	mutationKey?: MutationKey;
	onMutate?: (variables: TVariables) => Promise<TContext> | TContext;
	onSuccess?: (
		data: TData,
		variables: TVariables,
		context: TContext,
	) => Promise<unknown> | unknown;
	onError?: (
		error: TError,
		variables: TVariables,
		context: TContext | undefined,
	) => Promise<unknown> | unknown;
	onSettled?: (
		data: TData | undefined,
		error: TError | null,
		variables: TVariables,
		context: TContext | undefined,
	) => Promise<unknown> | unknown;
	retry?: boolean | number | ((failureCount: number, error: TError) => boolean);
	retryDelay?: number | ((retryAttempt: number, error: TError) => number);
	gcTime?: number;
	networkMode?: "online" | "always" | "offlineFirst";
	throwOnError?: boolean | ((error: TError) => boolean);
	meta?: Record<string, unknown>;
	queryClient?: QueryClient;
};

type MutateOptions<TData, TError, TVariables, TContext> = {
	onSuccess?: (data: TData, variables: TVariables, context: TContext) => void;
	onError?: (
		error: TError,
		variables: TVariables,
		context: TContext | undefined,
	) => void;
	onSettled?: (
		data: TData | undefined,
		error: TError | null,
		variables: TVariables,
		context: TContext | undefined,
	) => void;
};

export type Mutation<
	TData = unknown,
	TError = unknown,
	TVariables = unknown,
	TContext = unknown,
> = {
	data: Observable<TData | undefined>;
	error: Observable<TError | null>;
	isError: Observable<boolean>;
	isIdle: Observable<boolean>;
	isPending: Observable<boolean>;
	isPaused: Observable<boolean>;
	isSuccess: Observable<boolean>;
	failureCount: Observable<number>;
	failureReason: Observable<TError | null>;
	status: Observable<MutationStatus>;
	submittedAt: Observable<number | undefined>;
	variables: Observable<TVariables | undefined>;
	meta: Observable<Record<string, unknown>>;
	mutate: (
		variables: TVariables,
		options?: MutateOptions<TData, TError, TVariables, TContext>,
	) => Promise<TData | undefined>;
	mutateAsync: (
		variables: TVariables,
		options?: MutateOptions<TData, TError, TVariables, TContext>,
	) => Promise<TData | undefined>;
	reset: () => void;
};

function createMutation<
	TData,
	TError = Error,
	TVariables = void,
	TContext = unknown,
>(
	queryClient: QueryClient,
	options: MutationOptions<TData, TError, TVariables, TContext>,
): MutationObject<TData, TError, TVariables, TContext> {
	const mutationKey = options.mutationKey
		? hashFn(options.mutationKey)
		: undefined;

	// Early return if mutation is in cache
	if (mutationKey && queryClient.mutationCache.has(mutationKey)) {
		return queryClient.mutationCache.get(mutationKey) as MutationObject<
			TData,
			TError,
			TVariables,
			TContext
		>;
	}

	const resolvedOptions = {
		...(queryClient.getDefaultOptions().mutations as MutationOptions<
			TData,
			TError,
			TVariables,
			TContext
		>),
		...(queryClient.getMutationDefaults(options.mutationKey) as MutationOptions<
			TData,
			TError,
			TVariables,
			TContext
		>),
		...options,
	};

	const shouldRetry = (failureCount: number, error: TError): boolean => {
		if (!resolvedOptions.retry) return false;
		if (typeof resolvedOptions.retry === "function") {
			return resolvedOptions.retry(failureCount, error);
		}
		return typeof resolvedOptions.retry === "boolean"
			? resolvedOptions.retry
			: resolvedOptions.retry > failureCount;
	};

	const state: MutationState<TData, TError, TVariables, TContext> = {
		data: $(undefined),
		error: $<TError | null>(null),
		status: $<MutationStatus>("idle"),
		failureCount: $(0),
		failureReason: $<TError | null>(null),
		isPaused: $(false),
		submittedAt: $(undefined),
		variables: $(undefined),
		isError: useMemo(() => state.status() === "error"),
		isIdle: useMemo(() => state.status() === "idle"),
		isPending: useMemo(() => state.status() === "pending"),
		isSuccess: useMemo(() => state.status() === "success"),
		meta: $({}),
	};

	const mutate = async (
		variables: TVariables,
		mutateOptions?: MutateOptions<TData, TError, TVariables, TContext>,
	) => {
		let context: TContext | undefined;
		state.status("pending");
		state.variables(variables);
		state.submittedAt(Date.now());

		try {
			if (resolvedOptions.onMutate) {
				context = await resolvedOptions.onMutate(variables);
			}

			const data = await resolvedOptions.mutationFn!(variables);
			state.status("success");
			state.data(data);

			await resolvedOptions.onSuccess?.(data, variables, context as TContext);
			mutateOptions?.onSuccess?.(data, variables, context as TContext);

			await resolvedOptions.onSettled?.(data, null, variables, context);
			mutateOptions?.onSettled?.(data, null, variables, context);

			return data;
		} catch (error) {
			state.status("error");
			state.error(error as TError);
			state.failureCount((count) => count + 1);
			state.failureReason(error as TError);

			await resolvedOptions.onError?.(error as TError, variables, context);
			mutateOptions?.onError?.(error as TError, variables, context);

			await resolvedOptions.onSettled?.(
				undefined,
				error as TError,
				variables,
				context,
			);
			mutateOptions?.onSettled?.(
				undefined,
				error as TError,
				variables,
				context,
			);

			if (shouldRetry(state.failureCount(), error as TError)) {
				// Implement retry logic
				const retryDelay = resolvedOptions.retryDelay ?? 1000;
				const maxRetries =
					typeof resolvedOptions.retry === "number" ? resolvedOptions.retry : 3;

				if (state.failureCount() <= maxRetries) {
					const resolvedRetryDelay =
						typeof retryDelay === "function"
							? retryDelay(state.failureCount(), error as TError)
							: retryDelay;
					useTimeout(
						() => {
							mutate(variables, mutateOptions);
						},
						resolvedRetryDelay * 2 ** (state.failureCount() - 1),
					);
				} else {
					if (resolvedOptions.throwOnError) {
						throw error;
					}
				}
			} else {
				if (resolvedOptions.throwOnError) {
					throw error;
				}
			}
		}
		return state.data();
	};

	const reset = () => {
		state.status("idle");
		state.data(undefined);
		state.error(null);
		state.failureCount(0);
		state.failureReason(null);
		state.isPaused(false);
		state.submittedAt(undefined);
		state.variables(undefined);
		if (mutationKey) {
			queryClient.mutationCache.delete(mutationKey);
		}
	};

	const mutationObject: MutationObject<TData, TError, TVariables, TContext> = {
		instances: 0,
		state,
		options: resolvedOptions,
		mutate,
		mutateAsync: mutate,
		reset,
		destroy: () => {
			if (mutationKey) {
				queryClient.mutationCache.delete(mutationKey);
			}
		},
		addInstance: () => {
			mutationObject.destroyDisposer();
			mutationObject.instances++;
			return mutationObject.removeInstance;
		},
		removeInstance: () => {
			mutationObject.instances--;
			if (mutationObject.instances === 0) {
				mutationObject.scheduleDestroy();
			}
		},
		scheduleDestroy: () => {
			useRoot(() => {
				mutationObject.destroyDisposer = useTimeout(
					() => {
						mutationObject.destroy();
					},
					resolvedOptions.gcTime ?? 5 * 60 * 1000,
				); // Default to 5 minutes if gcTime is not provided
			});
		},
		destroyDisposer: () => {},
	};

	if (mutationKey) {
		queryClient.mutationCache.set(mutationKey, mutationObject);
	}

	return mutationObject;
}
export function useMutation<
	TData,
	TError = Error,
	TVariables = void,
	TContext = unknown,
>(
	options: MutationOptions<TData, TError, TVariables, TContext>,
): ObservableReadonly<
	{
		[K in keyof Omit<
			MutationState<TData, TError, TVariables, TContext>,
			"meta"
		>]: ObservableReadonly<
			ReturnType<MutationState<TData, TError, TVariables, TContext>[K]>
		>;
	} & {
		meta: MutationState<TData, TError, TVariables, TContext>["meta"];
	} & Pick<
			Mutation<TData, TError, TVariables, TContext>,
			"mutate" | "mutateAsync" | "reset"
		>
> {
	const queryClient = useQueryClient(options.queryClient);

	const mutation = useMemo(() => createMutation(queryClient, options));

	useEffect(() => mutation().addInstance());

	// @ts-expect-error I don't know what is going on here
	return useMemo(() => ({
		data: useMemo(() => mutation().state.data()),
		error: useMemo(() => mutation().state.error()),
		isError: useMemo(() => mutation().state.isError()),
		isIdle: useMemo(() => mutation().state.isIdle()),
		isPending: useMemo(() => mutation().state.isPending()),
		isSuccess: useMemo(() => mutation().state.isSuccess()),
		isPaused: useMemo(() => mutation().state.isPaused()),
		failureCount: useMemo(() => mutation().state.failureCount()),
		failureReason: useMemo(() => mutation().state.failureReason()),
		mutate: mutation().mutate,
		mutateAsync: mutation().mutateAsync,
		reset: mutation().reset,
		status: useMemo(() => mutation().state.status),
		submittedAt: useMemo(() => mutation().state.submittedAt()),
		variables: useMemo(() => mutation().state.variables()),
		meta: mutation().state.meta,
	}));
}

export type MutationFilters = {
	mutationKey?: QueryKey;
	exact?: boolean;
	status?: MutationStatus;
};
type MutationStateOptions<TResult = MutationState> = {
	filters?: MutationFilters;
	select?: (mutation: MutationObject<any, any, any, any>) => TResult;
};
export function useMutationState<TResult = MutationState>({
	filters,
	select,
}: MutationStateOptions<TResult>): ObservableReadonly<TResult[]> {
	const queryClient = useQueryClient();
	const mutationHash =
		filters?.mutationKey && JSON.stringify(filters?.mutationKey);
	const cache = queryClient.mutationCache;
	return useMemo(() => {
		return Array.from(mutationHash ? [cache.get(mutationHash)] : cache.values())
			.filter(
				(mutation): mutation is MutationObject<any, any, any, any> =>
					mutation !== undefined &&
					(filters?.status ? mutation.state.status() === filters.status : true),
			)
			.map((mutation) =>
				select ? select(mutation) : (mutation as unknown as TResult),
			);
	}) as ObservableReadonly<TResult[]>;
}
