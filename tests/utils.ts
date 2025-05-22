import { render as vobyRender } from "voby";

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const flush = () => new Promise(resolve => setTimeout(resolve, 0));
export const render: typeof vobyRender = (...args: Parameters<typeof vobyRender>) => {
    // @ts-ignore
    globalThis.unmount?.();
    const disposer = vobyRender(...args);
    // @ts-ignore
    globalThis.unmount = disposer;
    return disposer;
}