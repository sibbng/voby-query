import { beforeEach } from "vitest"

beforeEach(() => {
  // @ts-ignore
  globalThis.unmount?.()
  document.body.innerHTML = ''
})