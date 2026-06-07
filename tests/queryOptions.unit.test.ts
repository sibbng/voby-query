import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { queryOptions } from '../src/index.ts';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('queryOptions', () => {
  it('should return the same object', () => {
    const options = { queryKey: ['test'] };
    const result = queryOptions(options);
    expect(result).toBe(options);
  });

  it('should return the same object with queryFn', () => {
    const queryFn = async () => 'data';
    const options = { queryKey: ['test'], queryFn };
    const result = queryOptions(options);
    expect(result).toBe(options);
    expect(result.queryFn).toBe(queryFn);
  });

  it('should return the same object with all options', () => {
    const options = {
      queryKey: ['test'],
      queryFn: async () => 'data',
      staleTime: 5000,
      gcTime: 60000,
      retry: 3,
      enabled: true,
    };
    const result = queryOptions(options);
    expect(result).toBe(options);
    expect(result.staleTime).toBe(5000);
    expect(result.gcTime).toBe(60000);
    expect(result.retry).toBe(3);
  });

  it('should accept initialData', () => {
    const options = {
      queryKey: ['test'],
      queryFn: async () => 'data',
      initialData: 'initial',
      initialDataUpdatedAt: 0,
    };
    const result = queryOptions(options);
    expect(result.initialData).toBe('initial');
    expect(result.initialDataUpdatedAt).toBe(0);
  });

  it('should accept select function', () => {
    const options = {
      queryKey: ['test'],
      queryFn: async () => ({ name: 'test', age: 25 }),
      select: (data: { name: string; age: number }) => data.name,
    };
    const result = queryOptions(options);
    expect(result.select).toBe(options.select);
  });
});
