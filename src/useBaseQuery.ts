import { useCleanup, useMemo } from 'voby';
import { useQueryClient } from './queryClient.ts';
import type { QueryClient } from './types.ts';

export function useBaseQuery<T>(
  queryClient: QueryClient | undefined,
  buildQuery: (client: QueryClient) => T,
) {
  const client = useQueryClient(queryClient);

  return useMemo(() => {
    const q = buildQuery(client);
    useCleanup((q as any).addInstance());
    return q;
  });
}
