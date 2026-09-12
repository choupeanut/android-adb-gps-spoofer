/** Stops admission synchronously, then drains commands already accepted. */
export class CommandGate {
  private accepting = true
  private pending = new Set<Promise<unknown>>()
  run<T>(operation: () => T): T {
    if (!this.accepting) throw new Error('Application is shutting down')
    const result = operation()
    if (result && typeof (result as any).then === 'function') {
      const tracked = Promise.resolve(result).finally(() => this.pending.delete(tracked))
      this.pending.add(tracked)
      return tracked as T
    }
    return result
  }
  async closeAndDrain(): Promise<void> {
    this.accepting = false
    await Promise.allSettled([...this.pending])
  }
}
