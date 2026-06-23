// Use this to include a unique hash within new records to help ensure edits
// really work as expected, rather than seeing stale data from a previous test run.
export const generateDateHash = (prefix: string): string => {
  if (!prefix) {
    throw new Error('Prefix is required for generateDateHash')
  }
  const hash = Date.now().toString().slice(-8)
  if (prefix.endsWith('.')) {
    return `${prefix.slice(0, -1)} ${hash}.`
  }
  if (prefix.includes(' ')) {
    return `${prefix} ${hash}`
  }
  return `${prefix}-${hash}`
}
