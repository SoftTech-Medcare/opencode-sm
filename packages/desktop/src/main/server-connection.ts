export function createServerReadyGate<T>(onRestartReady: (data: T) => void): (data: T) => void {
  let first = true
  return (data: T) => {
    if (first) {
      first = false
      return
    }
    onRestartReady(data)
  }
}
