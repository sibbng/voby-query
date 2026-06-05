import { isDevelopment } from 'std-env';

export type TimeoutCallback = (_: void) => void;

export type ManagedTimerId = number | { [Symbol.toPrimitive]: () => number };

export type TimeoutProvider<TTimerId extends ManagedTimerId = ManagedTimerId> = {
  readonly setTimeout: (callback: TimeoutCallback, delay: number) => TTimerId;
  readonly clearTimeout: (timeoutId: TTimerId | undefined) => void;
  readonly setInterval: (callback: TimeoutCallback, delay: number) => TTimerId;
  readonly clearInterval: (intervalId: TTimerId | undefined) => void;
};

type SystemTimerId = ReturnType<typeof setTimeout>;

export const defaultTimeoutProvider: TimeoutProvider = {
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (timeoutId) => clearTimeout(timeoutId as SystemTimerId | undefined),

  setInterval: (callback, delay) => setInterval(callback, delay),
  clearInterval: (intervalId) => clearInterval(intervalId as SystemTimerId | undefined),
};

export class TimeoutManager {
  #provider: TimeoutProvider<any> = defaultTimeoutProvider;
  #providerCalled = false;

  setTimeoutProvider<TTimerId extends ManagedTimerId>(provider: TimeoutProvider<TTimerId>): void {
    if (isDevelopment) {
      if (this.#providerCalled && provider !== this.#provider) {
        console.error(
          `[timeoutManager]: Switching provider after calls to previous provider might result in unexpected behavior.`,
          { previous: this.#provider, provider },
        );
      }
    }

    this.#provider = provider;
    if (isDevelopment) {
      this.#providerCalled = false;
    }
  }

  setTimeout(callback: TimeoutCallback, delay: number): ManagedTimerId {
    if (isDevelopment) {
      this.#providerCalled = true;
    }
    return this.#provider.setTimeout(callback, delay);
  }

  clearTimeout(timeoutId: ManagedTimerId | undefined): void {
    this.#provider.clearTimeout(timeoutId);
  }

  setInterval(callback: TimeoutCallback, delay: number): ManagedTimerId {
    if (isDevelopment) {
      this.#providerCalled = true;
    }
    return this.#provider.setInterval(callback, delay);
  }

  clearInterval(intervalId: ManagedTimerId | undefined): void {
    this.#provider.clearInterval(intervalId);
  }
}

export const timeoutManager = new TimeoutManager();

export function systemSetTimeoutZero(callback: TimeoutCallback): void {
  setTimeout(callback, 0);
}
