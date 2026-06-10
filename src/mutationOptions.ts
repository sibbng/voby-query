import type { MutationKey, MutationOptions as MO } from './types.ts';

export function mutationOptions<
  TData = unknown,
  TError = unknown,
  TVariables = void,
  TContext = unknown,
>(
  options: {
    mutationKey: MutationKey;
  } & Omit<MO<TData, TError, TVariables, TContext>, 'mutationKey'>,
): MO<TData, TError, TVariables, TContext>;

export function mutationOptions<
  TData = unknown,
  TError = unknown,
  TVariables = void,
  TContext = unknown,
>(
  options: Omit<MO<TData, TError, TVariables, TContext>, 'mutationKey'>,
): Omit<MO<TData, TError, TVariables, TContext>, 'mutationKey'>;

export function mutationOptions(options: unknown) {
  return options;
}
