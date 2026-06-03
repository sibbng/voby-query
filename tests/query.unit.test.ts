import { describe, expect, it, vi } from 'vite-plus/test';
import { createQueryClient } from '../src/index.ts';

let keyCounter = 0;
const queryKey = () => [`query_${keyCounter++}`];

describe('query', () => {
  it('should provide context to queryFn', async () => {
    const key = queryKey();
    const queryClient = createQueryClient();
    const queryFn = vi.fn().mockResolvedValue('data');

    await queryClient.prefetchQuery({
      queryKey: key,
      queryFn,
    });

    expect(queryFn).toHaveBeenCalledTimes(1);
    const args = queryFn.mock.calls[0]![0];
    expect(args).toBeDefined();
    expect(args.queryKey).toEqual(key);
    expect(args.signal).toBeInstanceOf(AbortSignal);
  });

  it('cancelling a resolved query should not have any effect', async () => {
    const key = queryKey();
    const queryClient = createQueryClient();

    await queryClient.prefetchQuery({
      queryKey: key,
      queryFn: async () => 'data',
    });
    const query = queryClient.getQueryCache().find({ queryKey: key })!;
    await query.cancel({ revert: false, silent: true }).catch(() => {});

    expect(query.state.data()).toBe('data');
  });

  it('cancelling a rejected query should not have any effect', async () => {
    const key = queryKey();
    const queryClient = createQueryClient();
    const error = new Error('error');

    await queryClient.prefetchQuery({
      queryKey: key,
      queryFn: async () => {
        throw error;
      },
    });
    const query = queryClient.getQueryCache().find({ queryKey: key })!;
    await query.cancel({ revert: false, silent: true }).catch(() => {});

    expect(query.state.error()).toBe(error);
  });

  it('stores meta object in query options', async () => {
    const meta = { it: 'works' };
    const key = queryKey();
    const queryClient = createQueryClient();

    await queryClient.prefetchQuery({
      queryKey: key,
      queryFn: async () => 'data',
      meta,
    });

    const query = queryClient.getQueryCache().find({ queryKey: key })!;
    expect(query.resolvedOptions.meta).toBe(meta);
  });

  it('updates meta object on change', async () => {
    const meta = { it: 'works' };
    const key = queryKey();
    const queryClient = createQueryClient();
    const queryFn = async () => 'data';

    await queryClient.prefetchQuery({ queryKey: key, queryFn, meta });

    await queryClient.prefetchQuery({ queryKey: key, queryFn, meta: undefined });

    const query = queryClient.getQueryCache().find({ queryKey: key })!;
    expect(query.resolvedOptions.meta).toBeUndefined();
  });

  it('should not change state on invalidate() if already invalidated', async () => {
    const key = queryKey();
    const queryClient = createQueryClient();

    await queryClient.prefetchQuery({ queryKey: key, queryFn: async () => 'data' });
    const query = queryClient.getQueryCache().find({ queryKey: key })!;

    void queryClient.invalidateQueries({ queryKey: key });
    expect(query.state.isInvalidated()).toBeTruthy();

    void queryClient.invalidateQueries({ queryKey: key });
    expect(query.state.isInvalidated()).toBeTruthy();
  });

  it('should error if reset while pending', async () => {
    const key = queryKey();
    const queryClient = createQueryClient();
    const queryFn = vi.fn().mockImplementation(async () => {
      await new Promise((_resolve) => {});
      throw new Error();
    });

    queryClient
      .fetchQuery({
        queryKey: key,
        queryFn,
        retry: false,
      })
      .catch(() => {});

    const query = queryClient.getQueryCache().find({ queryKey: key })!;
    expect(query.state.status()).toBe('pending');

    query.reset();

    expect(query.state.data()).toBeUndefined();
    expect(query.state.error()).toBeNull();
    expect(query.state.status()).toBe('pending');
    expect(query.state.fetchStatus()).toBe('idle');
  });

  it('initialDataUpdatedAt: 0 sets dataUpdatedAt to 0', async () => {
    const key = queryKey();
    const queryClient = createQueryClient();
    const cache = queryClient.getQueryCache();

    cache.build(queryClient, {
      queryKey: key,
      queryFn: async () => 'data',
      staleTime: 1000000,
      initialData: 'initial',
      initialDataUpdatedAt: 0,
    } as any);

    const query = cache.find({ queryKey: key })!;
    expect(query.state.data()).toBe('initial');
    expect(query.state.status()).toBe('success');
    expect(query.state.dataUpdatedAt()).toBe(0);
  });

  it('the previous query status should be kept when refetching', async () => {
    const key = queryKey();
    const queryClient = createQueryClient();

    await queryClient.prefetchQuery({ queryKey: key, queryFn: async () => 'data' });
    const query = queryClient.getQueryCache().find({ queryKey: key })!;
    expect(query.state.status()).toBe('success');

    await queryClient.prefetchQuery({
      queryKey: key,
      queryFn: async () => {
        throw 'reject';
      },
      retry: false,
    });
    expect(query.state.status()).toBe('error');

    void queryClient.prefetchQuery({
      queryKey: key,
      queryFn: async () => new Promise((_resolve) => {}),
    });
    expect(query.state.status()).toBe('error');
  });

  it('should be able to refetch a cancelled query', async () => {
    const key = queryKey();
    const queryClient = createQueryClient();
    const queryFn = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return 'data';
    });

    await queryClient.prefetchQuery({ queryKey: key, queryFn });
    const query = queryClient.getQueryCache().find({ queryKey: key })!;

    await query.cancel({ revert: false, silent: true }).catch(() => {});

    await query.fetch({ force: true });
    expect(query.state.data()).toBe('data');
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it('should not retry on the server', async () => {
    const key = queryKey();
    const queryClient = createQueryClient();
    let count = 0;

    await queryClient.prefetchQuery({
      queryKey: key,
      queryFn: async () => {
        count++;
        throw new Error('error');
      },
      retry: 3,
    });

    expect(count).toBe(1);
  });

  it('should provide an AbortSignal that gets aborted on cancel', async () => {
    const key = queryKey();
    const queryClient = createQueryClient();
    const onAbort = vi.fn();

    const queryFn = vi.fn().mockImplementation(async ({ signal }) => {
      signal.addEventListener('abort', onAbort);
      await new Promise((r) => setTimeout(r, 100));
      return 'data';
    });

    const promise = queryClient.fetchQuery({
      queryKey: key,
      queryFn,
      retry: false,
    });
    await new Promise((r) => setTimeout(r, 10));

    const query = queryClient.getQueryCache().find({ queryKey: key })!;
    const signal = queryFn.mock.calls[0]![0].signal;
    expect(signal.aborted).toBe(false);

    await query.cancel({ revert: false, silent: true }).catch(() => {});
    await promise.catch(() => {});

    expect(signal.aborted).toBe(true);
    expect(onAbort).toHaveBeenCalled();
  });

  it('can use default meta', async () => {
    const meta = { it: 'works' };
    const key = queryKey();
    const queryClient = createQueryClient();

    queryClient.setQueryDefaults(key, { meta } as any);

    await queryClient.prefetchQuery({ queryKey: key, queryFn: async () => 'data' });

    const query = queryClient.getQueryCache().find({ queryKey: key })!;
    expect(query.resolvedOptions.meta).toBe(meta);
  });

  it('should have an error status when queryFn data causes structural sharing error', async () => {
    const data = {
      get foo(): never {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        this.foo;
        return this.foo as never;
      },
    };

    const key = queryKey();
    const queryClient = createQueryClient();

    await queryClient
      .fetchQuery({
        queryKey: key,
        queryFn: async () => data,
        initialData: { foo: 'bar' } as any,
        retry: false,
      })
      .catch(() => {});

    const query = queryClient.getQueryCache().find({ queryKey: key })!;
    expect(query.state.status()).toBe('error');
  });

  it('should have an error status when structuralSharing throws', async () => {
    const key = queryKey();
    const queryClient = createQueryClient();

    await queryClient
      .fetchQuery({
        queryKey: key,
        queryFn: async () => 'data',
        structuralSharing: () => {
          throw new Error('Any error');
        },
        retry: false,
      })
      .catch(() => {});

    const query = queryClient.getQueryCache().find({ queryKey: key })!;
    expect(query.state.status()).toBe('error');
  });

  it('fetch should not dispatch duplicate events when already fetching', async () => {
    const key = queryKey();
    const queryClient = createQueryClient();
    const queryFn = vi
      .fn()
      .mockImplementation(() => new Promise((r) => setTimeout(r, 100)).then(() => 'data'));

    await queryClient.prefetchQuery({ queryKey: key, queryFn });
    const query = queryClient.getQueryCache().find({ queryKey: key })!;

    const updates: string[] = [];
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      updates.push(event.type);
    });

    void query.fetch({ force: true });
    await query.fetch({ force: true });

    expect(updates).toContain('updated');
    unsubscribe();
  });
});
