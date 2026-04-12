/**
 * Shared data listener registry used by the script runner to observe
 * connection output without going through IPC → renderer → IPC.
 *
 * Transport handlers (ssh, serial, telnet) call notifyDataListeners()
 * whenever they receive data. The script runner subscribes/unsubscribes
 * per connection.
 */

type DataListener = (chunk: string) => void

const listeners = new Map<string, Set<DataListener>>()

export function addDataListener(connId: string, cb: DataListener): () => void {
  if (!listeners.has(connId)) listeners.set(connId, new Set())
  listeners.get(connId)!.add(cb)
  return () => {
    const set = listeners.get(connId)
    if (set) {
      set.delete(cb)
      if (set.size === 0) listeners.delete(connId)
    }
  }
}

export function notifyDataListeners(connId: string, chunk: string): void {
  const set = listeners.get(connId)
  if (set) {
    for (const cb of set) cb(chunk)
  }
}
