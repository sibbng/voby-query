import { describe, expect, it, vi } from 'vite-plus/test';
import {
  addToEnd,
  addToStart,
  hashFn,
  hashQueryKeyByOptions,
  isPlainArray,
  isPlainObject,
  partialMatchKey,
  replaceEqualDeep,
  shouldThrowError,
  skipToken,
  ensureQueryFn,
} from '../src/utils.ts';

describe('core/utils', () => {
  describe('isPlainObject', () => {
    it('should return `true` for a plain object', () => {
      expect(isPlainObject({})).toEqual(true);
    });

    it('should return `false` for an array', () => {
      expect(isPlainObject([])).toEqual(false);
    });

    it('should return `false` for null', () => {
      expect(isPlainObject(null)).toEqual(false);
    });

    it('should return `false` for undefined', () => {
      expect(isPlainObject(undefined)).toEqual(false);
    });

    it('should return `true` for object with an undefined constructor', () => {
      expect(isPlainObject(Object.create(null))).toBeTruthy();
    });

    it('should return `false` if constructor does not have an Object-specific method', () => {
      class Foo {
        abc: any;
        constructor() {
          this.abc = {};
        }
      }
      expect(isPlainObject(new Foo())).toBeFalsy();
    });

    it('should return `false` if the object has a modified prototype', () => {
      function Graph(this: any) {
        this.vertices = [];
        this.edges = [];
      }
      Graph.prototype.addVertex = function (v: any) {
        this.vertices.push(v);
      };
      expect(isPlainObject(Object.create(Graph))).toBeFalsy();
    });

    it('should return `false` for object with custom prototype', () => {
      const CustomProto = Object.create({ a: 1 });
      const obj = Object.create(CustomProto);
      obj.b = 2;
      expect(isPlainObject(obj)).toBeFalsy();
    });
  });

  describe('isPlainArray', () => {
    it('should return `true` for plain arrays', () => {
      expect(isPlainArray([1, 2])).toEqual(true);
    });

    it('should return `false` for non plain arrays', () => {
      expect(isPlainArray(Object.assign([1, 2], { a: 'b' }))).toEqual(false);
    });
  });

  describe('partialMatchKey', () => {
    // voby-query: partialMatchKey(subset, superset) — checks if first is subset of second
    // TanStack:   partialMatchKey(a, b) — checks if a includes b (b is subset of a)
    // So for TanStack test `partialMatchKey(a, b)`, call `partialMatchKey(b, a)` here

    it('should return `true` if a includes b', () => {
      const a = [{ a: { b: 'b' }, c: 'c', d: [{ d: 'd ' }] }];
      const b = [{ a: { b: 'b' }, c: 'c', d: [] }];
      expect(partialMatchKey(b, a)).toEqual(true);
    });

    it('should return `false` if a does not include b', () => {
      const a = [{ a: { b: 'b' }, c: 'c', d: [] }];
      const b = [{ a: { b: 'b' }, c: 'c', d: [{ d: 'd ' }] }];
      expect(partialMatchKey(b, a)).toEqual(false);
    });

    it('should return `true` if array a includes array b', () => {
      const a = [1, 2, 3];
      const b = [1, 2];
      expect(partialMatchKey(b, a)).toEqual(true);
    });

    it('should return `false` if a is null and b is not', () => {
      const a = [null];
      const b = [{ a: { b: 'b' }, c: 'c', d: [{ d: 'd ' }] }];
      expect(partialMatchKey(b, a)).toEqual(false);
    });

    it('should return `false` if a contains null and b is not', () => {
      const a = [{ a: null, c: 'c', d: [] }];
      const b = [{ a: { b: 'b' }, c: 'c', d: [{ d: 'd ' }] }];
      expect(partialMatchKey(b, a)).toEqual(false);
    });

    it('should return `false` if b is null and a is not', () => {
      const a = [{ a: { b: 'b' }, c: 'c', d: [] }];
      const b = [null];
      expect(partialMatchKey(b, a)).toEqual(false);
    });

    it('should return `false` if b contains null and a is not', () => {
      const a = [{ a: { b: 'b' }, c: 'c', d: [] }];
      const b = [{ a: null, c: 'c', d: [{ d: 'd ' }] }];
      expect(partialMatchKey(b, a)).toEqual(false);
    });
  });

  describe('replaceEqualDeep', () => {
    it('should return the previous value when the next value is an equal primitive', () => {
      expect(replaceEqualDeep(1, 1)).toBe(1);
      expect(replaceEqualDeep('1', '1')).toBe('1');
      expect(replaceEqualDeep(true, true)).toBe(true);
      expect(replaceEqualDeep(false, false)).toBe(false);
      expect(replaceEqualDeep(null, null)).toBe(null);
      expect(replaceEqualDeep(undefined, undefined)).toBe(undefined);
    });

    it('should return the next value when the previous value is a different value', () => {
      const date1 = new Date();
      const date2 = new Date();
      expect(replaceEqualDeep(1, 0)).toBe(0);
      expect(replaceEqualDeep(1, 2)).toBe(2);
      expect(replaceEqualDeep('1', '2')).toBe('2');
      expect(replaceEqualDeep(true, false)).toBe(false);
      expect(replaceEqualDeep(false, true)).toBe(true);
      expect(replaceEqualDeep(date1, date2)).toBe(date2);
    });

    it('should return the next value when the previous value is a different type', () => {
      const array = [1];
      const object = { a: 'a' };
      expect(replaceEqualDeep(0, undefined)).toBe(undefined);
      expect(replaceEqualDeep(undefined, 0)).toBe(0);
      expect(replaceEqualDeep(2, undefined)).toBe(undefined);
      expect(replaceEqualDeep(undefined, 2)).toBe(2);
      expect(replaceEqualDeep(undefined, null)).toBe(null);
      expect(replaceEqualDeep(null, undefined)).toBe(undefined);
      expect(replaceEqualDeep({}, undefined)).toBe(undefined);
      expect(replaceEqualDeep([], undefined)).toBe(undefined);
      expect(replaceEqualDeep(array, object)).toBe(object);
      expect(replaceEqualDeep(object, array)).toBe(array);
    });

    it('should return the previous value when the next value is an equal array', () => {
      const prev = [1, 2];
      const next = [1, 2];
      expect(replaceEqualDeep(prev, next)).toBe(prev);
    });

    it('should return a copy when the previous value is a different array subset', () => {
      const prev = [1, 2];
      const next = [1, 2, 3];
      const result = replaceEqualDeep(prev, next);
      expect(result).toEqual(next);
      expect(result).not.toBe(prev);
      expect(result).not.toBe(next);
    });

    it('should return a copy when the previous value is a different array superset', () => {
      const prev = [1, 2, 3];
      const next = [1, 2];
      const result = replaceEqualDeep(prev, next);
      expect(result).toEqual(next);
      expect(result).not.toBe(prev);
      expect(result).not.toBe(next);
    });

    it('should return the previous value when the next value is an equal empty array', () => {
      const prev: Array<any> = [];
      const next: Array<any> = [];
      expect(replaceEqualDeep(prev, next)).toBe(prev);
    });

    it('should return the previous value when the next value is an equal empty object', () => {
      const prev = {};
      const next = {};
      expect(replaceEqualDeep(prev, next)).toBe(prev);
    });

    it('should return the previous value when the next value is an equal object', () => {
      const prev = { a: 'a' };
      const next = { a: 'a' };
      expect(replaceEqualDeep(prev, next)).toBe(prev);
    });

    it('should replace different values in objects', () => {
      const prev = { a: { b: 'b' }, c: 'c' };
      const next = { a: { b: 'b' }, c: 'd' };
      const result = replaceEqualDeep(prev, next);
      expect(result).toEqual(next);
      expect(result).not.toBe(prev);
      expect(result).not.toBe(next);
      expect(result.a).toBe(prev.a);
      expect(result.c).toBe(next.c);
    });

    it('should replace different values in arrays', () => {
      const prev = [1, { a: 'a' }, { b: { b: 'b' } }, [1]] as const;
      const next = [1, { a: 'a' }, { b: { b: 'c' } }, [1]] as const;
      const result = replaceEqualDeep(prev, next);
      expect(result).toEqual(next);
      expect(result).not.toBe(prev);
      expect(result).not.toBe(next);
      expect(result[0]).toBe(prev[0]);
      expect(result[1]).toBe(prev[1]);
      expect(result[2]).not.toBe(next[2]);
      expect(result[2].b.b).toBe(next[2].b.b);
      expect(result[3]).toBe(prev[3]);
    });

    it('should replace different values in arrays when the next value is a subset', () => {
      const prev = [{ a: 'a' }, { b: 'b' }, { c: 'c' }];
      const next = [{ a: 'a' }, { b: 'b' }];
      const result = replaceEqualDeep(prev, next);
      expect(result).toEqual(next);
      expect(result).not.toBe(prev);
      expect(result).not.toBe(next);
      expect(result[0]).toBe(prev[0]);
      expect(result[1]).toBe(prev[1]);
      expect(result[2]).toBeUndefined();
    });

    it('should replace different values in arrays when the next value is a superset', () => {
      const prev = [{ a: 'a' }, { b: 'b' }];
      const next = [{ a: 'a' }, { b: 'b' }, { c: 'c' }];
      const result = replaceEqualDeep(prev, next);
      expect(result).toEqual(next);
      expect(result).not.toBe(prev);
      expect(result).not.toBe(next);
      expect(result[0]).toBe(prev[0]);
      expect(result[1]).toBe(prev[1]);
      expect(result[2]).toBe(next[2]);
    });

    it('should support equal objects which are not arrays or objects', () => {
      const map = new Map();
      const prev = [map, [1]];
      const next = [map, [1]];
      const result = replaceEqualDeep(prev, next);
      expect(result).toBe(prev);
    });

    it('should be able to share values that contain undefined', () => {
      const current = [
        {
          data: undefined,
          foo: true,
        },
      ];
      const next = replaceEqualDeep(current, [
        {
          data: undefined,
          foo: true,
        },
      ]);
      expect(current).toBe(next);
    });

    it('should return the previous value when both values are an array of undefined', () => {
      const current = [undefined];
      const next = replaceEqualDeep(current, [undefined]);
      expect(next).toBe(current);
    });

    it('should return the previous value when both values are an array that contains undefined', () => {
      const current = [{ foo: 1 }, undefined];
      const next = replaceEqualDeep(current, [{ foo: 1 }, undefined]);
      expect(next).toBe(current);
    });
  });

  describe('hashFn', () => {
    it('should hash primitives correctly', () => {
      expect(hashFn(['test'])).toEqual(JSON.stringify(['test']));
      expect(hashFn([123])).toEqual(JSON.stringify([123]));
      expect(hashFn([null])).toEqual(JSON.stringify([null]));
    });

    it('should hash objects with sorted keys consistently', () => {
      const key1 = [{ b: 2, a: 1 }];
      const key2 = [{ a: 1, b: 2 }];
      const hash1 = hashFn(key1);
      const hash2 = hashFn(key2);
      expect(hash1).toEqual(hash2);
      expect(hash1).toEqual(JSON.stringify([{ a: 1, b: 2 }]));
    });

    it('should hash arrays consistently', () => {
      const arr1 = [{ b: 2, a: 1 }, 'test', 123];
      const arr2 = [{ a: 1, b: 2 }, 'test', 123];
      expect(hashFn(arr1)).toEqual(hashFn(arr2));
    });

    it('should handle nested objects with sorted keys', () => {
      const nested1 = [{ a: { d: 4, c: 3 }, b: 2 }];
      const nested2 = [{ b: 2, a: { c: 3, d: 4 } }];
      expect(hashFn(nested1)).toEqual(hashFn(nested2));
    });
  });

  describe('addToEnd', () => {
    it('should add item to the end of the array', () => {
      const items = [1, 2, 3];
      const newItems = addToEnd(items, 4);
      expect(newItems).toEqual([1, 2, 3, 4]);
    });

    it('should not exceed max if provided', () => {
      const items = [1, 2, 3];
      const newItems = addToEnd(items, 4, 3);
      expect(newItems).toEqual([2, 3, 4]);
    });

    it('should add item to the end of the array when max = 0', () => {
      const items = [1, 2, 3];
      const item = 4;
      const max = 0;
      expect(addToEnd(items, item, max)).toEqual([1, 2, 3, 4]);
    });

    it('should add item to the end of the array when max is undefined', () => {
      const items = [1, 2, 3];
      const item = 4;
      const max = undefined;
      expect(addToEnd(items, item, max)).toEqual([1, 2, 3, 4]);
    });
  });

  describe('addToStart', () => {
    it('should add an item to the start of the array', () => {
      const items = [1, 2, 3];
      const item = 4;
      const newItems = addToStart(items, item);
      expect(newItems).toEqual([4, 1, 2, 3]);
    });

    it('should respect the max argument', () => {
      const items = [1, 2, 3];
      const item = 4;
      const max = 2;
      const newItems = addToStart(items, item, max);
      expect(newItems).toEqual([4, 1, 2]);
    });

    it('should not remove any items if max = 0', () => {
      const items = [1, 2, 3];
      const item = 4;
      const max = 0;
      const newItems = addToStart(items, item, max);
      expect(newItems).toEqual([4, 1, 2, 3]);
    });

    it('should not remove any items if max is undefined', () => {
      const items = [1, 2, 3];
      const item = 4;
      const max = undefined;
      expect(addToStart(items, item, max)).toEqual([4, 1, 2, 3]);
    });
  });

  describe('hashQueryKeyByOptions', () => {
    it('should use custom hash function when provided in options', () => {
      const key = ['test', { a: 1, b: 2 }];
      const customHashFn = vi.fn(() => 'custom-hash');

      const result = hashQueryKeyByOptions(key, {
        queryKeyHashFn: customHashFn,
      } as any);

      expect(customHashFn).toHaveBeenCalledWith(key);
      expect(result).toEqual('custom-hash');
    });

    it('should use default hash function when no options provided', () => {
      const key = ['test', { a: 1, b: 2 }];
      const defaultResult = hashFn(key);
      const result = hashQueryKeyByOptions(key);

      expect(result).toEqual(defaultResult);
    });
  });

  describe('shouldThrowError', () => {
    it('should return the result of executing throwOnError if throwOnError parameter is a function', () => {
      const throwOnError = (error: Error) => error.message === 'test error';
      expect(shouldThrowError(throwOnError, [new Error('test error')])).toBe(true);
      expect(shouldThrowError(throwOnError, [new Error('other error')])).toBe(false);
    });

    it('should return throwOnError parameter itself if throwOnError is not a function', () => {
      expect(shouldThrowError(true, [new Error('test error')])).toBe(true);
      expect(shouldThrowError(false, [new Error('test error')])).toBe(false);
      expect(shouldThrowError(undefined, [new Error('test error')])).toBe(false);
    });
  });

  describe('ensureQueryFn', () => {
    const context = {} as any;

    it('should return a function that resolves to initialPromise when queryFn is missing and initialPromise is provided', async () => {
      const initialPromise = Promise.resolve('initial-data');
      const resolved = ensureQueryFn({ queryHash: '["key"]' }, { initialPromise });
      await expect(resolved(context)).resolves.toBe('initial-data');
    });

    it('should return a function that rejects when initialPromise rejects', async () => {
      const error = new Error('initial-promise-error');
      const initialPromise = Promise.reject(error);
      const resolved = ensureQueryFn({ queryHash: '["key"]' }, { initialPromise });
      await expect(resolved(context)).rejects.toBe(error);
    });

    it('should return a function that rejects with missing queryFn error when queryFn is set to skipToken', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const resolved = ensureQueryFn({
        queryFn: skipToken,
        queryHash: '["skip"]',
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Attempted to invoke queryFn when set to skipToken'),
      );
      await expect(resolved(context)).rejects.toThrow('Missing queryFn: \'["skip"]\'');

      consoleErrorSpy.mockRestore();
    });
  });
});
