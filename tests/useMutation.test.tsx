import { expect, test } from 'vitest'
import { useMutation } from '../src/useMutation'
import { createQueryClient } from '../src/useQuery'
import { QueryClientProvider } from '../src/context'
import { render, If } from 'voby'

// Helper to flush microtasks
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

async function waitForText(expected: string, timeout = 100) {
  const start = Date.now();
  while (document.body.textContent !== expected) {
    if (Date.now() - start > timeout) {
      throw new Error(`Timed out waiting for text: ${expected}`);
    }
    await flush();
  }
}

test('useMutation basic functionality', async () => {
  const queryClient = createQueryClient()
  let mutationResult: any

  function TestComponent() {
    const mutation = useMutation<string, Error, string>({
      mutationFn: async (variables: string) => {
        await new Promise(res => setTimeout(res, 50));
        return `Processed: ${variables}`;
      }
    })
    mutationResult = mutation
    return (
      <>
        <If when={() => mutation().isIdle()}>
          Idle
        </If>
        <If when={() => mutation().isPending()}>
          Pending
        </If>
        <If when={() => mutation().isSuccess()}>
          {() => mutation().data()}
        </If>
        <If when={() => mutation().isError()}>
          Error
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

  expect(document.body.textContent).toBe('Idle')
  const promise = mutationResult().mutate('test')
  await waitForText('Pending')
  await promise
  await flush()
  expect(document.body.textContent).toBe('Processed: test')
  expect(mutationResult().isSuccess()).toBe(true)
  expect(mutationResult().data()).toBe('Processed: test')
})

test('useMutation error handling', async () => {
  const queryClient = createQueryClient()
  let mutationResult: any

  function TestComponent() {
    const mutation = useMutation<string, Error, string>({
      mutationFn: async () => {
        await new Promise(res => setTimeout(res, 50));
        throw new Error('fail')
      }
    })
    mutationResult = mutation
    return (
      <>
        <If when={() => mutation().isIdle()}>
          Idle
        </If>
        <If when={() => mutation().isPending()}>
          Pending
        </If>
        <If when={() => mutation().isError()}>
          {() => mutation().error()?.message}
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

  expect(document.body.textContent).toBe('Idle')
  const promise = mutationResult().mutate('fail').catch(() => {})
  await waitForText('Pending')
  await promise
  await flush()
  expect(document.body.textContent).toBe('fail')
  expect(mutationResult().isError()).toBe(true)
  expect(mutationResult().error()?.message).toBe('fail')
})

test('useMutation reset', async () => {
  const queryClient = createQueryClient()
  let mutationResult: any

  function TestComponent() {
    const mutation = useMutation<string, Error, string>({
      mutationFn: async (variables: string) => {
        await new Promise(res => setTimeout(res, 50));
        return `Processed: ${variables}`;
      }
    })
    mutationResult = mutation
    return (
      <>
        <If when={() => mutation().isIdle()}>
          Idle
        </If>
        <If when={() => mutation().isSuccess()}>
          {() => mutation().data()}
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

  expect(document.body.textContent).toBe('Idle')
  await mutationResult().mutate('reset')
  await flush()
  expect(document.body.textContent).toBe('Processed: reset')
  mutationResult().reset()
  await flush()
  expect(document.body.textContent).toBe('Idle')
})