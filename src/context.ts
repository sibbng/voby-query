import { type Context, createContext } from 'voby';
import type { QueryClient } from './types.ts';

// #region Context
export const QueryClientContext: Context<QueryClient> = createContext<QueryClient>();
export const QueryClientProvider =
  QueryClientContext.Provider as typeof QueryClientContext.Provider;
