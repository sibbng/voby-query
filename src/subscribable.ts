export class Subscribable<TListener extends (...args: any[]) => void> {
  protected listeners = new Set<TListener>();

  subscribe(listener: TListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  hasListeners(): boolean {
    return this.listeners.size > 0;
  }
}
