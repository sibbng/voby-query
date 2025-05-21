import { expect, test, vi } from 'vitest'
import { createQueryClient, useQuery } from '../src/useQuery'
import { flush } from "./utils"

test('useQuery basic functionality', async () => {
  const queryClient = createQueryClient()
  
  const result = await queryClient.fetchQuery({
    queryKey: ['test'],
    queryFn: async () => {
      return 'test data'
    },
    staleTime: 0
  })

  expect(result).toBe('test data')
  
  const cachedData = queryClient.getQueryData(['test'])
  expect(cachedData).toBe('test data')
})

test('useQuery error handling', async () => {
  const queryClient = createQueryClient()
  
  try {
    await queryClient.fetchQuery({
      queryKey: ['error'],
      queryFn: async () => {
        throw new Error('Test error')
      },
      staleTime: 0,
      throwOnError: true
    })
  } catch (error: any) {
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('Test error')
  }
})

test('useQuery refetch', async () => {
  const queryClient = createQueryClient()
  let callCount = 0
  
  const result1 = await queryClient.fetchQuery({
    queryKey: ['refetch'],
    queryFn: async () => {
      callCount++
      return `data ${callCount}`
    },
    staleTime: 0
  })

  expect(result1).toBe('data 1')
  
  const cachedData1 = queryClient.getQueryData(['refetch'])
  expect(cachedData1).toBe('data 1')

  await queryClient.invalidateQueries({ queryKey: ['refetch'] })

  const result2 = await queryClient.fetchQuery({
    queryKey: ['refetch'],
    queryFn: async () => {
      callCount++
      return `data ${callCount}`
    },
    staleTime: 0
  })

  expect(result2).toBe('data 3')
  
  const cachedData2 = queryClient.getQueryData(['refetch'])
  expect(cachedData2).toBe('data 3')
})

test('queryClient.prefetchQuery basic functionality', async () => {
  const queryClient = createQueryClient()
  const queryFnMock = vi.fn(async () => {
    await new Promise(resolve => setTimeout(resolve, 10)); // Simulate async work
    return 'prefetched data';
  })

  // Scenario 1: Prefetch with a long staleTime
  await queryClient.prefetchQuery({
    queryKey: ['prefetch-test-1'],
    queryFn: queryFnMock,
    staleTime: 1000 * 60, // 1 minute
  })

  expect(queryFnMock).toHaveBeenCalledTimes(1)
  expect(queryClient.getQueryData(['prefetch-test-1'])).toBe('prefetched data')

  // Calling fetchQuery immediately should use the cached data and not call queryFn again
  const dataFromFetch = await queryClient.fetchQuery({
    queryKey: ['prefetch-test-1'],
    queryFn: queryFnMock, // Pass the same mock
  })
  expect(dataFromFetch).toBe('prefetched data')
  expect(queryFnMock).toHaveBeenCalledTimes(1) // Should not be called again

  // Scenario 2: Prefetch with staleTime: 0 (or default)
  const queryFnMock2 = vi.fn(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    return 'prefetched data stale';
  })
  await queryClient.prefetchQuery({
    queryKey: ['prefetch-test-2'],
    queryFn: queryFnMock2,
    staleTime: 0, // Explicitly stale
  })
  expect(queryFnMock2).toHaveBeenCalledTimes(1)
  expect(queryClient.getQueryData(['prefetch-test-2'])).toBe('prefetched data stale')
  
  // Calling fetchQuery should call queryFn again because data is stale
  const dataFromFetchStale = await queryClient.fetchQuery({
    queryKey: ['prefetch-test-2'],
    queryFn: queryFnMock2,
  })
  expect(dataFromFetchStale).toBe('prefetched data stale')
  expect(queryFnMock2).toHaveBeenCalledTimes(2) // Called again
})

test('queryClient.removeQueries', async () => {
  const queryClient = createQueryClient()
  const queryKey = ['remove-test']
  const queryFn = async () => 'data to remove'

  // 1. Fetch data
  await queryClient.fetchQuery({ queryKey, queryFn })

  // 2. Verify data is in cache
  expect(queryClient.getQueryData(queryKey)).toBe('data to remove')

  // 3. Call removeQueries
  queryClient.removeQueries({ queryKey })

  // 4. Verify data is undefined
  expect(queryClient.getQueryData(queryKey)).toBeUndefined()

  // Test removing non-existent query (should not throw)
  expect(() => queryClient.removeQueries({ queryKey: ['non-existent'] })).not.toThrow()
})

test('queryClient.clear', async () => {
  const queryClient = createQueryClient()
  const queryKey1 = ['clear-test-1']
  const queryKey2 = ['clear-test-2']
  const queryFn1 = async () => 'data 1'
  const queryFn2 = async () => 'data 2'

  // 1. Fetch data for multiple keys
  await queryClient.fetchQuery({ queryKey: queryKey1, queryFn: queryFn1 })
  await queryClient.fetchQuery({ queryKey: queryKey2, queryFn: queryFn2 })

  // 2. Verify data is in cache
  expect(queryClient.getQueryData(queryKey1)).toBe('data 1')
  expect(queryClient.getQueryData(queryKey2)).toBe('data 2')

  // 3. Call clear
  queryClient.clear()

  // 4. Verify data is undefined for all keys
  expect(queryClient.getQueryData(queryKey1)).toBeUndefined()
  expect(queryClient.getQueryData(queryKey2)).toBeUndefined()
})
