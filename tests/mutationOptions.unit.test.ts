import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { mutationOptions } from '../src/index.ts';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('mutationOptions', () => {
  it('should return the same object', () => {
    const options = { mutationFn: async () => 'data' };
    const result = mutationOptions(options);
    expect(result).toBe(options);
  });

  it('should return the same object with mutationFn', () => {
    const mutationFn = async () => 'data';
    const options = { mutationFn };
    const result = mutationOptions(options);
    expect(result).toBe(options);
    expect(result.mutationFn).toBe(mutationFn);
  });

  it('should work without mutationKey', () => {
    const options = { mutationFn: async () => 'data' };
    const result = mutationOptions(options);
    expect(result).toBe(options);
  });

  it('should return the same object with all options', () => {
    const options = {
      mutationKey: ['test'],
      mutationFn: async () => 'data',
      retry: 3,
      retryDelay: 1000,
    };
    const result = mutationOptions(options);
    expect(result).toBe(options);
    expect(result.mutationKey).toEqual(['test']);
    expect(result.retry).toBe(3);
  });

  it('should accept callbacks', () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const onSettled = vi.fn();
    const options = {
      mutationKey: ['test'],
      mutationFn: async () => 'data',
      onSuccess,
      onError,
      onSettled,
    };
    const result = mutationOptions(options);
    expect(result.onSuccess).toBe(onSuccess);
    expect(result.onError).toBe(onError);
    expect(result.onSettled).toBe(onSettled);
  });
});
