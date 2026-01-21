const { gzip, gunzip } = require('node:zlib')

function connPiper(connection, _dst, opts = {}, stats = {}) {
  const loc = _dst()
  if (!loc) {
    connection.destroy()
    stats.rejectCnt = (stats.rejectCnt || 0) + 1
    return { cleanup: () => { } }
  }

  // Initialize stats
  stats.locCnt = (stats.locCnt || 0) + 1
  stats.remCnt = (stats.remCnt || 0) + 1

  let destroyed = false

  // Simplified destroy function
  function destroy(err) {
    if (destroyed) return
    destroyed = true

    stats.locCnt = (stats.locCnt || 0) - 1
    stats.remCnt = (stats.remCnt || 0) - 1

    try { loc.destroy(err) } catch (e) { /* ignore */ }
    try { connection.destroy(err) } catch (e) { /* ignore */ }

    if (opts.onDestroy) {
      try {
        opts.onDestroy(err)
      } catch (e) {
        console.error('Error in onDestroy callback:', e)
      }
    }
  }

  // Enable TCP optimizations
  if (typeof connection.setNoDelay === 'function') connection.setNoDelay(true)
  if (typeof loc.setNoDelay === 'function') loc.setNoDelay(true)

  // Set larger buffer sizes for better throughput (1MB instead of 512KB)
  const bufferSize = opts.bufferSize || 1024 * 1024
  if (connection._readableState) connection._readableState.highWaterMark = bufferSize
  if (connection._writableState) connection._writableState.highWaterMark = bufferSize
  if (loc._readableState) loc._readableState.highWaterMark = bufferSize
  if (loc._writableState) loc._writableState.highWaterMark = bufferSize

  // SIMPLIFIED PIPING - Use Node.js built-in .pipe() for minimal overhead
  if (opts.compress) {
    // With compression (slower but needed for some use cases)
    const l2c = opts.isServer ? gzip() : gunzip()
    const c2l = opts.isServer ? gunzip() : gzip()

    loc.pipe(l2c).pipe(connection)
    connection.pipe(c2l).pipe(loc)
  } else {
    // Direct piping (fastest - no transforms, no manual backpressure, no timeout resets)
    loc.pipe(connection)
    connection.pipe(loc)
  }

  // Minimal error handling
  const onError = destroy
  loc.on('error', onError)
  connection.on('error', onError)

  return {
    destroy,
    cleanup: destroy,
    isDestroyed: () => destroyed,
    getStats: () => ({ ...stats })
  }
}

function connRemoteCtrl(connection, opts = {}, stats = {}) {
  // Initialize stats FIRST
  stats.remCnt = (stats.remCnt || 0) + 1
  stats.bytesSent = stats.bytesSent || 0

  let destroyed = false
  const timeout = opts.timeout || 30000
  let timeoutId = null
  let lastReset = 0
  const RESET_INTERVAL = 5000

  function resetTimeout() {
    const now = Date.now()
    if (now - lastReset < RESET_INTERVAL) return

    lastReset = now
    if (timeoutId) clearTimeout(timeoutId)
    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        destroy(new Error('Control connection timeout'))
      }, timeout)
    }
  }

  function destroy(err) {
    if (destroyed) return
    destroyed = true

    if (timeoutId) clearTimeout(timeoutId)

    // Decrement stats (FIXED: use || 0)
    stats.remCnt = (stats.remCnt || 0) - 1

    try {
      connection.destroy(err)
    } catch (e) {
      console.error('Error destroying connection:', e)
    }

    if (opts.onDestroy) {
      try {
        opts.onDestroy(err)
      } catch (e) {
        console.error('Error in onDestroy callback:', e)
      }
    }

    if (opts.debug && err) {
      console.error('connRemoteCtrl destroyed:', err)
    }
  }

  const onError = destroy
  const onClose = () => destroy()
  const onData = () => resetTimeout()

  connection.on('error', onError)
  connection.on('close', onClose)
  connection.on('data', onData)

  resetTimeout()

  return {
    send(data) {
      if (destroyed) return false
      try {
        resetTimeout()
        stats.bytesSent += data.length
        return connection.write(data)
      } catch (err) {
        destroy(err)
        return false
      }
    },
    destroy,
    isDestroyed() {
      return destroyed
    },
    connection,
    cleanup() {
      connection.removeListener('error', onError)
      connection.removeListener('close', onClose)
      connection.removeListener('data', onData)
      destroy()
    }
  }
}

module.exports = {
  connPiper,
  connRemoteCtrl
}