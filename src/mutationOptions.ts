import type { MutationKey } from './types.ts';

export function mutationOptions<
  TData = unknown,
  TError = unknown,
  TVariables = void,
  TContext = unknown,
>(
  options: {
    mutationKey: MutationKey;
  } & Omit<
    import('./types.ts').MutationOptions<TData, TError, TVariables, TContext>,
    'mutationKey'
  >,
): import('./types.ts').MutationOptions<TData, TError, TVariables, TContext>;

export function mutationOptions<
  TData = unknown,
  TError = unknown,
  TVariables = void,
  TContext = unknown,
>(
  options: Omit<
    import('./types.ts').MutationOptions<TData, TError, TVariables, TContext>,
    'mutationKey'
  >,
): Omit<import('./types.ts').MutationOptions<TData, TError, TVariables, TContext>, 'mutationKey'>;

export function mutationOptions(options: unknown) {
  return options;
}
