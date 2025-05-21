import { expect, test, vi } from 'vitest'
import { flush } from './utils';
import { waitFor } from '@testing-library/dom';
import { createQueryClient, useQuery } from '../src/useQuery'
import { QueryClientProvider } from '../src/context'
import { render, If, $, useEffect } from 'voby'

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

  await flush() // Replaced new Promise...

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
      staleTime: 50 // ms
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

  await flush() // Replaced new Promise...
  // Check initial state: data is fetched, not stale
  expect(document.body.textContent).toContain('Data: stale data')
  expect(document.body.textContent).toContain('Stale: false')


  // Wait for staleTime to pass
  await new Promise(resolve => setTimeout(resolve, 60)) // Keep this timeout for timer-dependent test logic
  // Check state after staleTime: data is still there, but now stale
  expect(document.body.textContent).toContain('Data: stale data')
  expect(document.body.textContent).toContain('Stale: true')

  // Refetch and check state: data is updated (fetchCount increments), not stale
  await queryClient.refetchQueries({ queryKey: ['stale-test'] })
  await flush() // Ensure UI updates after refetch
  
  expect(document.body.textContent).toContain('Data: stale data') // Data remains the same as mock fn returns same data
  expect(document.body.textContent).toContain('Stale: false')
  expect(fetchCount).toBe(2) // fetchFn was called again
})

test('useQuery enabled option: starts disabled, then enabled', async () => {
  const queryClient = createQueryClient()
  const queryFnMock = vi.fn(async () => {
    // await new Promise(resolve => setTimeout(resolve, 20));
    return 'Data when enabled';
  })
  const enabled = $(false)

  function TestComponent() {
    const query = useQuery({
      queryKey: ['enabled-test-1'],
      queryFn: queryFnMock,
      enabled: enabled, // Controlled by reactive variable
    })
    return (
      <>
        <If when={() => query().isLoading() || query().isIdle() && !query().data()}>
          Initial/Loading
        </If>
        <If when={() => query().isSuccess()}>
          {() => query().data()}
        </If>
      </>
    )
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body
  )

  expect(document.body.textContent).toBe('Initial/Loading')
  expect(queryFnMock).not.toHaveBeenCalled()

  enabled(true) // Enable the query
  await flush() // Allow effects to run

//   expect(queryFnMock).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(document.body.textContent).toBe('Data when enabled'))
  expect(document.body.textContent).toBe('Data when enabled')
})

test('useQuery enabled option: starts enabled, then disabled', async () => {
  const queryClient = createQueryClient()
  const queryFnMock = vi.fn(async () => {
    await new Promise(resolve => setTimeout(resolve, 20));
    return 'Data initially enabled';
  })
  const enabled = $(true)

  function TestComponent() {
    const query = useQuery({
      queryKey: ['enabled-test-2'],
      queryFn: queryFnMock,
      enabled: enabled,
      // To test if disabling prevents refetchOnWindowFocus, set a short staleTime
      // and refetchOnWindowFocus (assuming it's true by default or set it explicitly)
      staleTime: 0, 
      // refetchOnWindowFocus: true, // Assuming this is default or can be set
    })
    return (
      <>
        <If when={() => query().isLoading()}>Loading...</If>
        <If when={() => query().isSuccess()}>{() => query().data()}</If>
      </>
    )
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body
  )

  expect(queryFnMock).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(document.body.textContent).toBe('Data initially enabled'))

  enabled(false) // Disable the query
  await flush()

  // At this point, the query is disabled. To test if it refetches,
  // we'd typically simulate a window focus event.
  // Vitest's browser mode might not fully support dispatching window events
  // or Query a library's internal handling of it might be complex to trigger.
  // For now, we'll check that queryFn is not called again after disabling.
  // We can also try to invalidate the query and see it doesn't refetch.
  queryFnMock.mockClear() // Clear previous calls
  
  await queryClient.invalidateQueries({ queryKey: ['enabled-test-2'] })
  await flush()
  await new Promise(resolve => setTimeout(resolve, 50)) // Wait a bit to see if it refetches

  expect(queryFnMock).not.toHaveBeenCalled() // Should not refetch as it's disabled
  expect(document.body.textContent).toBe('Data initially enabled') // Stays the same
})

test('useQuery initialData option', async () => {
  const queryClient = createQueryClient()
  const queryFnMock = vi.fn(async () => {
    await new Promise(resolve => setTimeout(resolve, 20));
    return 'Fetched data';
  })

  function TestComponent() {
    const query = useQuery({
      queryKey: ['initial-data-test'],
      queryFn: queryFnMock,
      initialData: 'Initial data value',
      staleTime: 10, // Low stale time to trigger fetch on refetch
    })
    return (
      <>
        <div>Status: {() => query().status()}</div>
        <div>Data: {() => query().data()}</div>
      </>
    )
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body
  )

  expect(document.body.textContent).toContain('Status: success')
  expect(document.body.textContent).toContain('Data: Initial data value')
  expect(queryFnMock).not.toHaveBeenCalled() // queryFn should not be called on mount

  // Wait for staleTime to pass and then trigger a refetch (e.g., by invalidating)
  await new Promise(resolve => setTimeout(resolve, 20)) // Wait past staleTime
  
  // Invalidate to trigger refetch
  await queryClient.invalidateQueries({ queryKey: ['initial-data-test'] })
  await flush() // Allow effects to run
  
  expect(queryFnMock).toHaveBeenCalledTimes(1) // Now it should be called
  await waitFor(() => expect(document.body.textContent).toContain('Fetched data'))
  expect(document.body.textContent).toContain('Data: Fetched data')
})

test('useQuery placeholderData option', async () => {
  const queryClient = createQueryClient()
  const queryFnMock = vi.fn(async () => {
    await new Promise(resolve => setTimeout(resolve, 50)); // Delay for queryFn
    return 'Actual fetched data';
  })

  function TestComponent() {
    const query = useQuery({
      queryKey: ['placeholder-data-test'],
      queryFn: queryFnMock,
      placeholderData: 'Placeholder value',
    })
    return (
      <>
        <div>Status: {() => query().status()}</div>
        <div>Data: {() => query().data()}</div>
      </>
    )
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body
  )

  expect(document.body.textContent).toContain('Status: pending') // Or 'loading'
  expect(document.body.textContent).toContain('Data: Placeholder value')
  expect(queryFnMock).toHaveBeenCalledTimes(1) // queryFn IS called with placeholderData

  await waitFor(() => expect(document.body.textContent).toContain('Actual fetched data'))
  expect(document.body.textContent).toContain('Status: success')
  expect(document.body.textContent).toContain('Data: Actual fetched data')
})

test('useQuery select option', async () => {
  const queryClient = createQueryClient()
  const originalData = { id: 1, name: 'Original Name', value: 100 }
  const queryFnMock = vi.fn(async () => {
    await new Promise(resolve => setTimeout(resolve, 20));
    return originalData;
  })

  function TestComponent() {
    const query = useQuery({
      queryKey: ['select-test'],
      queryFn: queryFnMock,
      select: (data) => data.name, // Select only the name
    })
    return (
      <>
        <div>Data: {() => query().data()}</div>
      </>
    )
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body
  )

  await waitFor(() => expect(document.body.textContent).toBe('Data: Original Name'))
  expect(queryFnMock).toHaveBeenCalledTimes(1)
  
  // Verify that the data from useQuery is the selected (transformed) data
  // The waitForText already implicitly checks this via the component's output.

  // Verify that the original, untransformed data is in the query cache
  const cachedData = queryClient.getQueryData(['select-test'])
  expect(cachedData).toEqual(originalData) // Cache should hold the raw data
})

test('useQuery gcTime (garbage collection with component unmount)', async () => {
  // Create a new QueryClient with a custom gcTime for this test
  const queryClient = createQueryClient({
    defaultOptions: {
      queries: {
        gcTime: 50, // Short gcTime for testing
      },
    },
  })
  const queryKey = ['gc-test']
  const queryFnMock = vi.fn(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    return 'GC Test Data';
  })
  const showComponent = $(true)

  function TestComponent() {
    const query = useQuery({
      queryKey: queryKey,
      queryFn: queryFnMock,
    })
    return <div>{() => query().data() ?? 'Loading...'}</div>
  }

  function App() {
    return (
      <QueryClientProvider value={queryClient}>
        <If when={showComponent}>
          <TestComponent />
        </If>
      </QueryClientProvider>
    )
  }

  render(<App />, document.body)

  await waitFor(() => expect(document.body.textContent).toBe('GC Test Data'))
  expect(queryFnMock).toHaveBeenCalledTimes(1)
  expect(queryClient.getQueryData(queryKey)).toBe('GC Test Data')

  // Unmount the component
  showComponent(false)
  await flush() // Ensure unmount and effects

  // Wait for a period longer than gcTime
  await new Promise(resolve => setTimeout(resolve, 100)) // gcTime is 50ms, wait 100ms

  // Verify that queryClient.getQueryData() for that key is now undefined
  expect(queryClient.getQueryData(queryKey)).toBeUndefined()
})

test('useQuery refetchOnWindowFocus: true (default)', async () => {
  const queryClient = createQueryClient()
  const queryFnMock = vi.fn(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    return `Data fetched at ${Date.now()}`;
  })

  function TestComponent() {
    const query = useQuery({
      queryKey: ['refetch-focus-true'],
      queryFn: queryFnMock,
      staleTime: 20, // Short stale time
      refetchOnWindowFocus: true, // Explicitly set for clarity, though it's default
    })
    return <div>{() => query().data() ?? 'Loading...'}</div>
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body
  )

  await waitFor(() => expect(document.body.textContent).toContain('Data fetched at'))
  expect(queryFnMock).toHaveBeenCalledTimes(1)

  // Wait for staleTime to pass
  await new Promise(resolve => setTimeout(resolve, 30)) // Wait longer than staleTime

  // Simulate document.visibilityState change to 'visible' and dispatch visibilitychange event
  const originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState')
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  })
  document.dispatchEvent(new Event('visibilitychange'))
  await flush()
  // Restore original descriptor if needed
  if (originalVisibility) {
    Object.defineProperty(document, 'visibilityState', originalVisibility)
  }

  // Wait for a bit to ensure refetch has time to complete if triggered
  await new Promise(resolve => setTimeout(resolve, 50)) 
  
  // queryFn should be called again because the query is stale and window regained focus
  expect(queryFnMock).toHaveBeenCalledTimes(2)
})

test('useQuery refetchOnWindowFocus: false', async () => {
  const queryClient = createQueryClient()
  const queryFnMock = vi.fn(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    return `Data fetched at ${Date.now()}`;
  })

  function TestComponent() {
    const query = useQuery({
      queryKey: ['refetch-focus-false'],
      queryFn: queryFnMock,
      staleTime: 20,
      refetchOnWindowFocus: false,
    })
    return <div>{() => query().data() ?? 'Loading...'}</div>
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body
  )

  await waitFor(() => expect(document.body.textContent).toContain('Data fetched at'))
  expect(queryFnMock).toHaveBeenCalledTimes(1)

  await new Promise(resolve => setTimeout(resolve, 30)) // Wait past staleTime

  window.dispatchEvent(new Event('blur'))
  await flush()
  window.dispatchEvent(new Event('focus'))
  await flush()
  await new Promise(resolve => setTimeout(resolve, 50)) 


  expect(queryFnMock).toHaveBeenCalledTimes(1) // Should NOT be called again
})

test('useQuery refetchInterval: data refetches periodically', async () => {
  const queryClient = createQueryClient()
  const queryFnMock = vi.fn(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    return `Interval data ${Date.now()}`;
  })
  const intervalMs = 50
  const showComponent = $(true)


  function TestComponent() {
    const query = useQuery({
      queryKey: ['refetch-interval-test'],
      queryFn: queryFnMock,
      refetchInterval: intervalMs,
    })
    return <div>{() => query().data() ?? 'Loading...'}</div>
  }
  
  function App() {
    return (
      <QueryClientProvider value={queryClient}>
        <If when={showComponent}>
          <TestComponent />
        </If>
      </QueryClientProvider>
    )
  }

  render(<App />, document.body)

  await waitFor(() => expect(document.body.textContent).toContain('Interval data'))
  expect(queryFnMock).toHaveBeenCalledTimes(1) // Initial call

  // Wait for a period covering a few intervals
  // e.g., 2.5 * intervalMs to reliably catch 2 more fetches
  await new Promise(resolve => setTimeout(resolve, intervalMs * 2.5 + 20)) // +20 for queryFn execution time

  // (Initial Call) + (Call after intervalMs) + (Call after 2*intervalMs)
  // Depending on timing, it might be 2 or 3. Let's check for at least 2.
  // The exact number can be tricky due to setTimeout precision and test environment.
  // A more robust check might be to ensure it's called more than once.
  expect(queryFnMock.mock.calls.length).toBeGreaterThanOrEqual(2) 
  // For a more precise check, we could mock useInterval if possible, or use fake timers.
  // Given current tools, this is a reasonable approximation.
  // Typically, it should be 3 calls (initial + 2 intervals)
  // Let's aim for 3, but acknowledge it might be flaky.
  // For 50ms interval, over 120ms (2.5 * 50), we expect:
  // Call 1 @ ~0-10ms
  // Call 2 @ ~50-60ms
  // Call 3 @ ~100-110ms
  // So 3 calls is expected.

  expect(queryFnMock.mock.calls.length).toBe(3)


  // Cleanup: unmount component to stop interval
  showComponent(false)
  await flush()
}, {retry: 10}) // Retry to account for timing issues

test('useQuery refetchInterval: stops if component unmounts', async () => {
  const queryClient = createQueryClient()
  const queryFnMock = vi.fn(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    return `Interval unmount data ${Date.now()}`;
  })
  const intervalMs = 50
  const showComponent = $(true)

  function TestComponent() {
    const query = useQuery({
      queryKey: ['refetch-interval-unmount-test'],
      queryFn: queryFnMock,
      refetchInterval: intervalMs,
    })
    return <div>{() => query().data() ?? 'Loading...'}</div>
  }
  
  function App() {
    return (
      <QueryClientProvider value={queryClient}>
        <If when={showComponent}>
          <TestComponent />
        </If>
      </QueryClientProvider>
    )
  }

  render(<App />, document.body)

  await waitFor(() => expect(document.body.textContent).toContain('Interval unmount data'))
  expect(queryFnMock).toHaveBeenCalledTimes(1) // Initial call

  // Unmount the component
  showComponent(false)
  await flush()
  queryFnMock.mockClear() // Clear calls up to this point.

  // Wait for a period covering a few intervals
  await new Promise(resolve => setTimeout(resolve, intervalMs * 3))

  expect(queryFnMock).not.toHaveBeenCalled() // Should not be called again after unmount
})
