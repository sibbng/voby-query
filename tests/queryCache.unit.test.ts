import { describe, expect, it, vi } from 'vite-plus/test';
import { QueryCache } from '../src/queryCache.ts';
import { createQueryClient } from '../src/index.ts';

let queryKeyCounter = 0;
const queryKey = () => [`query_${queryKeyCounter++}`];

describe('queryCache', () => {
  describe('subscribe', () => {
    it('should pass the correct query', () => {
      const queryClient = createQueryClient();
      const queryCache = queryClient.getQueryCache() as unknown as QueryCache;
      const key = queryKey();
      const subscriber = vi.fn();
      const unsubscribe = queryCache.subscribe(subscriber);
      queryClient.setQueryData(key, 'foo');
      const query = queryCache.find({ queryKey: key }) as any;
      expect(subscriber).toHaveBeenCalledWith({ query, type: 'added' });
      unsubscribe();
    });

    it('should include the queryCache and query when notifying listeners', async () => {
      const queryClient = createQueryClient();
      const queryCache = queryClient.getQueryCache() as unknown as QueryCache;
      const key = queryKey();
      const callback = vi.fn();
      queryCache.subscribe(callback);
      await queryClient.prefetchQuery({
        queryKey: key,
        queryFn: async () => 'data',
      });
      const query = queryCache.find({ queryKey: key }) as any;
      expect(callback).toHaveBeenCalledWith({ query, type: 'added' });
    });

    it('should notify subscribers when new query with initialData is added', async () => {
      const queryClient = createQueryClient();
      const queryCache = queryClient.getQueryCache() as unknown as QueryCache;
      const key = queryKey();
      const callback = vi.fn();
      queryCache.subscribe(callback);
      await queryClient.prefetchQuery({
        queryKey: key,
        queryFn: async () => 'data',
        initialData: 'initial',
      });
      expect(callback).toHaveBeenCalled();
    });

    it('should fire updated on setQueryData', async () => {
      const queryClient = createQueryClient();
      const queryCache = queryClient.getQueryCache() as unknown as QueryCache;
      const key = queryKey();
      await queryClient.fetchQuery({
        queryKey: key,
        queryFn: async () => 'initial',
      });
      const events: string[] = [];
      queryCache.subscribe((event) => {
        events.push(event.type);
      });
      queryClient.setQueryData(key, 'new value');
      expect(events).toContain('updated');
    });

    it('should fire removed on removeQueries', async () => {
      const queryClient = createQueryClient();
      const queryCache = queryClient.getQueryCache() as unknown as QueryCache;
      const key = queryKey();
      await queryClient.fetchQuery({
        queryKey: key,
        queryFn: async () => 'data',
      });
      const events: string[] = [];
      queryCache.subscribe((event) => {
        events.push(event.type);
      });
      queryClient.removeQueries({ queryKey: key });
      expect(events).toContain('removed');
    });
  });

  describe('build', () => {
    it('should compute queryHash from queryKey when queryHash is not provided', () => {
      const queryClient = createQueryClient();
      const queryCache = queryClient.getQueryCache() as unknown as QueryCache;
      const key = queryKey();
      const query = queryCache.build(queryClient, { queryKey: key });
      expect(query.queryHash).toBeTruthy();
    });
  });

  describe('find', () => {
    it('find should filter correctly', async () => {
      const queryClient = createQueryClient();
      const queryCache = queryClient.getQueryCache() as unknown as QueryCache;
      const key = queryKey();
      await queryClient.prefetchQuery({
        queryKey: key,
        queryFn: async () => 'data1',
      });
      const query = queryCache.find({ queryKey: key }) as any;
      expect(query).toBeDefined();
    });
  });

  describe('findAll', () => {
    it('should return all the queries when no filters are defined', async () => {
      const queryClient = createQueryClient();
      const queryCache = queryClient.getQueryCache() as unknown as QueryCache;
      const key1 = queryKey();
      const key2 = queryKey();
      await queryClient.prefetchQuery({ queryKey: key1, queryFn: async () => 'data1' });
      await queryClient.prefetchQuery({ queryKey: key2, queryFn: async () => 'data2' });
      expect(queryCache.findAll().length).toBe(2);
    });

    it('should filter by stale status', async () => {
      const queryClient = createQueryClient();
      const queryCache = queryClient.getQueryCache() as unknown as QueryCache;
      await queryClient.fetchQuery({
        queryKey: queryKey(),
        queryFn: async () => 'stale data',
        staleTime: 0,
      });
      await queryClient.fetchQuery({
        queryKey: queryKey(),
        queryFn: async () => 'fresh data',
        staleTime: 10000,
      });
      const staleQueries = queryCache.findAll({ stale: true });
      const freshQueries = queryCache.findAll({ stale: false });
      expect(staleQueries.length).toBeGreaterThanOrEqual(1);
      expect(freshQueries.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('QueryCacheConfig success callbacks', () => {
    it('should call onSuccess and onSettled when a query is successful', async () => {
      const onSuccess = vi.fn();
      const onSettled = vi.fn();
      const cache = new QueryCache({ onSuccess, onSettled });
      const queryClient = createQueryClient({ queryCache: cache as any });
      const key = queryKey();
      await queryClient.prefetchQuery({
        queryKey: key,
        queryFn: async () => ({ data: 5 }),
      });
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSettled).toHaveBeenCalledTimes(1);
    });
  });
});
