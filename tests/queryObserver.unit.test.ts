import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { QueryClient } from '../src';
import { QueryObserver } from '../src/queryObserver';
import { queryKey, sleep } from './utils';

describe('queryObserver stale timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('arms the stale timer relative to dataUpdatedAt when staleTime shortens', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    await queryClient.fetchQuery({
      queryKey: key,
      queryFn: async () => 'data',
      staleTime: 100,
    });

    const query = queryCache.find({ queryKey: key }) as any;
    const observer = new QueryObserver(query, { staleTime: 100 });
    const listener = vi.fn();
    const unsubscribe = observer.subscribe(listener);

    await vi.advanceTimersByTimeAsync(40);
    expect(listener).not.toHaveBeenCalled();

    observer.setOptions({ staleTime: 50 });

    await vi.advanceTimersByTimeAsync(29);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it('should allow staleTime as a function', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    const query = queryCache.build(queryClient, {
      queryKey: key,
      queryFn: () =>
        sleep(5).then(() => ({
          data: 'data',
          staleTime: 20,
        })),
    });

    const observer = new QueryObserver(query, {
      staleTime: (q: any) => q.state.data()?.staleTime ?? 0,
    });
    const results: Array<any> = [];
    const unsubscribe = observer.subscribe(() => results.push(observer.getCurrentResult()));

    await vi.advanceTimersByTimeAsync(25);
    expect(results).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(results).toHaveLength(1);
    expect(results[0]?.isStale).toBe(true);

    unsubscribe();
  });

  it('should not see queries as stale if staleTime is Static', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    const query = queryCache.build(queryClient, {
      queryKey: key,
      queryFn: async () => 'data',
    });

    const observer = new QueryObserver(query, { staleTime: 'static' });
    const listener = vi.fn();
    const unsubscribe = observer.subscribe(listener);

    await vi.advanceTimersByTimeAsync(1000);
    expect(listener).not.toHaveBeenCalled();
    expect(observer.getCurrentResult().isStale).toBe(false);

    unsubscribe();
  });
});
