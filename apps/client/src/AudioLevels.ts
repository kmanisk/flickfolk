// Imperative meter subscriptions keep audio samples out of React's render path.
export class AudioLevels {
  private listeners = new Map<string, Set<(value: number) => void>>();
  publish(id: string, rms: number) {
    const value = Math.max(0, Math.min(1, rms * 12));
    this.listeners.get(id)?.forEach((listener) => listener(value));
  }
  subscribe(id: string, listener: (value: number) => void) {
    const listeners = this.listeners.get(id) ?? new Set();
    listeners.add(listener);
    this.listeners.set(id, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(id);
    };
  }
}
