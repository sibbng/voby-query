import { expect, test } from 'vitest'
import { createQueryClient, useQuery } from '../src/useQuery'
import { QueryClientProvider } from '../src/context'
import { render, If } from 'voby'

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

  expect(result2).toBe('data 2')
  
  const cachedData2 = queryClient.getQueryData(['refetch'])
  expect(cachedData2).toBe('data 2')
}) 

test('useQuery with provider', async () => {
  const queryClient = createQueryClient()
  
  function TestComponent() {
    const query = useQuery({
      queryKey: ['test'],
      queryFn: async () => {
        return 'test data'
      },
      staleTime: 0
    })

    return <>
        <If when={() => query().isLoading()}>
            Loading...
        </If>
        <If when={() => query().isError()}>
            Error
        </If>   
        <If when={() => query().isSuccess()}>
            {() => query().data()}
        </If>
    </>
  }

 render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body
  )

  expect(document.body.textContent).toBe('Loading...')

  await new Promise(resolve => setTimeout(resolve, 0))

  expect(document.body.textContent).toBe('test data')

  const cachedData = queryClient.getQueryData(['test'])
  expect(cachedData).toBe('test data')
})

test('useQuery staleTime behavior', async () => {
  const queryClient = createQueryClient()

  let fetchCount = 0
  function TestComponent() {
    const query = useQuery({
      queryKey: ['stale-test'],
      queryFn: async () => {
        fetchCount++
        return 'stale data'
      },
      staleTime: 50
    })

    return <>
        <p>Data: {() => query().data()}</p>
        <p>Stale: {() => query().isStale().toString()}</p>
    </>
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body
  )

  await new Promise(resolve => setTimeout(resolve, 0))
  expect(document.body.textContent).toBe('Data: stale dataStale: false')

  await new Promise(resolve => setTimeout(resolve, 60))
  expect(document.body.textContent).toBe('Data: stale dataStale: true')

  await queryClient.refetchQueries({ queryKey: ['stale-test'] })
  expect(document.body.textContent).toBe('Data: stale dataStale: false')
  expect(fetchCount).toBe(2)
}) 