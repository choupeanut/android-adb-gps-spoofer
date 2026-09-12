/** Validate the untyped IPC-over-HTTP/WS envelope before invoking any handler. */
export function assertCall(message: unknown): asserts message is { channel: string; args?: unknown[]; id?: string } {
  if (!message || typeof message !== 'object') throw new Error('Invalid command envelope')
  const { channel, args, id } = message as any
  if (typeof channel !== 'string' || !/^[a-z][a-z0-9-]{0,79}$/.test(channel) ||
      (args !== undefined && (!Array.isArray(args) || args.length > 16)) ||
      (id !== undefined && (typeof id !== 'string' || !id.length || id.length > 128))) {
    throw new Error('Invalid command envelope')
  }
}
