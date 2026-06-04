import { describe, expect, it } from 'vite-plus/test';
import {
  type DataTag,
  type InferDataFromTag,
  type InferErrorFromTag,
  type InfiniteData,
  dataTagSymbol,
  dataTagErrorSymbol,
  unsetMarker,
  queryOptions,
  infiniteQueryOptions,
  createQueryClient,
} from '../src/index.ts';

type Expect<T extends true> = T
type Equal<T, U> = [T, U] extends [U, T] ? true : false

// Static type checks for DataTag branding via queryOptions
;(() => {
  const options = queryOptions({
    queryKey: ['todos', 1],
    queryFn: async () => ({ id: 1, title: 'test' }),
    initialData: { id: 1, title: 'test' },
  })
  type TaggedValue = typeof options.queryKey extends DataTag<unknown, infer V, unknown> ? V : never
  const _check1: Expect<Equal<TaggedValue, { id: number; title: string }>> = true
  void _check1
})()

// Static type checks for DataTag branding via infiniteQueryOptions
;(() => {
  const options = infiniteQueryOptions({
    queryKey: ['posts', 'infinite'],
    queryFn: async ({ pageParam }: { pageParam: number }) => ({ items: [pageParam] }),
    initialPageParam: 1,
    getNextPageParam: (lastPage: { items: number[] }) => lastPage.items.length + 1,
    initialData: { pages: [{ items: [1] }], pageParams: [1] },
  })
  type TaggedValue = typeof options.queryKey extends DataTag<unknown, infer V, unknown> ? V : never
  const _check2: Expect<Equal<TaggedValue, InfiniteData<{ items: number[] }>>> = true
  void _check2
})()

// Static type checks for InferDataFromTag/InferErrorFromTag
;(() => {
  type Key = ['todos'] & DataTag<['todos'], string, TypeError>
  type InferredData = InferDataFromTag<unknown, Key>
  type InferredError = InferErrorFromTag<Error, Key>
  const _check3: Expect<Equal<InferredData, string>> = true
  const _check4: Expect<Equal<InferredError, TypeError>> = true
  void _check3
  void _check4
})()

// Static type check: untagged keys fall through
;(() => {
  type InferredData = InferDataFromTag<string, ['untagged']>
  const _check5: Expect<Equal<InferredData, string>> = true
  void _check5
})()

describe('DataTag', () => {
  it('should export symbols', () => {
    expect(typeof dataTagSymbol).toBe('symbol')
    expect(typeof dataTagErrorSymbol).toBe('symbol')
    expect(typeof unsetMarker).toBe('symbol')
  })

  it('queryOptions should return the same object', () => {
    const options = { queryKey: ['test'], queryFn: async () => 'data' }
    const result = queryOptions(options)
    expect(result).toBe(options)
  })

  it('getQueryData should work with tagged keys', () => {
    const client = createQueryClient()
    const options = queryOptions({
      queryKey: ['test-key'],
      queryFn: async () => 'data',
      initialData: 'data',
    })
    client.setQueryData(options.queryKey, 'updated')
    const data = client.getQueryData(options.queryKey)
    expect(data).toBe('updated')
  })

  it('getQueryData should return undefined for missing key', () => {
    const client = createQueryClient()
    const data = client.getQueryData(['nonexistent'])
    expect(data).toBeUndefined()
  })

  it('getQueryState should work with tagged keys', () => {
    const client = createQueryClient()
    const options = queryOptions({
      queryKey: ['state-test'],
      queryFn: async () => 'data',
    })
    client.setQueryData(options.queryKey, 'data')
    const state = client.getQueryState(options.queryKey)
    expect(state).toBeDefined()
    expect(state!.data()).toBe('data')
  })

  it('setQueryData should work with tagged keys', () => {
    const client = createQueryClient()
    const options = queryOptions({
      queryKey: ['set-test'],
      queryFn: async () => 'old',
      initialData: 'old',
    })
    client.setQueryData(options.queryKey, 'new')
    const data = client.getQueryData(options.queryKey)
    expect(data).toBe('new')
  })

  it('should handle infiniteQueryOptions', () => {
    const options = infiniteQueryOptions({
      queryKey: ['inf-test'],
      queryFn: async ({ pageParam }: { pageParam: number }) => pageParam,
      initialPageParam: 1,
      getNextPageParam: (lastPage: number) => lastPage + 1,
      initialData: { pages: [1], pageParams: [1] },
    })
    expect(options.initialPageParam).toBe(1)
    expect(options.getNextPageParam(1, [1], 1, [1])).toBe(2)
  })

  it('queryOptions with undefined initialData should work', () => {
    const options = queryOptions({
      queryKey: ['no-init'],
      queryFn: async () => 'data',
    })
    expect(options.queryKey).toEqual(['no-init'])
  })
})
