import { Subscribable } from './subscribable.ts';

type SetupFn = (setFocused: (focused: boolean) => void) => (() => void) | undefined;

export class FocusManager extends Subscribable<() => void> {
  #focused?: boolean;
  #cleanup?: () => void;
  #setup: SetupFn;

  constructor() {
    super();
    this.#setup = (setFocused) => {
      if (!(typeof window !== 'undefined' && typeof window.document !== 'undefined')) {
        return;
      }

      const visibilityHandler = () => {
        setFocused(document.visibilityState === 'visible');
      };

      document.addEventListener('visibilitychange', visibilityHandler);

      return () => {
        document.removeEventListener('visibilitychange', visibilityHandler);
      };
    };
  }

  protected onSubscribe(): void {
    if (!this.#cleanup) {
      this.#cleanup = this.#setup(this.setFocused.bind(this));
    }
  }

  protected onUnsubscribe(): void {
    if (!this.hasListeners()) {
      this.#cleanup?.();
      this.#cleanup = undefined;
      this.#focused = undefined;
    }
  }

  setFocused(focused?: boolean): void {
    if (this.#focused !== focused) {
      this.#focused = focused;
      this.listeners.forEach((listener) => listener());
    }
  }

  isFocused(): boolean {
    if (typeof this.#focused !== 'undefined') {
      return this.#focused;
    }

    if (typeof document !== 'undefined') {
      return document.visibilityState !== 'hidden';
    }

    return true;
  }
}

export const focusManager = new FocusManager();
