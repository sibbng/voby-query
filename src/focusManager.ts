import { Subscribable } from './subscribable.ts';

type Listener = (focused: boolean) => void;
type SetupFn = (setFocused: (focused?: boolean) => void) => (() => void) | undefined;

export class FocusManager extends Subscribable<Listener> {
  #focused?: boolean;
  #cleanup?: () => void;
  #setup: SetupFn;

  constructor() {
    super();
    this.#setup = (setFocused) => {
      if (!(typeof window !== 'undefined' && typeof window.addEventListener !== 'undefined')) {
        return;
      }

      const visibilityHandler = () => setFocused();

      window.addEventListener('visibilitychange', visibilityHandler);

      return () => {
        window.removeEventListener('visibilitychange', visibilityHandler);
      };
    };
  }

  protected onSubscribe(): void {
    if (!this.#cleanup) {
      this.setEventListener(this.#setup);
    }
  }

  protected onUnsubscribe(): void {
    if (!this.hasListeners()) {
      this.#cleanup?.();
      this.#cleanup = undefined;
    }
  }

  setEventListener(setup: SetupFn): void {
    this.#setup = setup;
    this.#cleanup?.();
    this.#cleanup = setup((focused) => {
      if (typeof focused === 'boolean') {
        this.setFocused(focused);
      } else {
        this.onFocus();
      }
    });
  }

  setFocused(focused?: boolean): void {
    const changed = this.#focused !== focused;
    if (changed) {
      this.#focused = focused;
      this.onFocus();
    }
  }

  onFocus(): void {
    const isFocused = this.isFocused();
    this.listeners.forEach((listener) => listener(isFocused));
  }

  isFocused(): boolean {
    if (typeof this.#focused === 'boolean') {
      return this.#focused;
    }

    return globalThis.document?.visibilityState !== 'hidden';
  }
}

export const focusManager = new FocusManager();
