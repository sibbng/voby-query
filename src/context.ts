import { createContext, type Context } from 'voby';
import type { QueryClient } from './useQuery';

// #region Context
export const QueryClientContext: Context<QueryClient> =
  createContext<QueryClient>();
export const QueryClientProvider =
  QueryClientContext.Provider as typeof QueryClientContext.Provider;
