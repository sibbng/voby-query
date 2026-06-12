import { render as vobyRender } from 'voby';

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export const render: typeof vobyRender = (...args: Parameters<typeof vobyRender>) => {
  // @ts-ignore
  globalThis.unmount?.();
  const disposer = vobyRender(...args);
  // @ts-ignore
  globalThis.unmount = disposer;
  return disposer;
};

let keyCounter = 0;
export const queryKey = () => [`query_${keyCounter++}`];
export const mutationKey = () => [`mutation_${keyCounter++}`];
