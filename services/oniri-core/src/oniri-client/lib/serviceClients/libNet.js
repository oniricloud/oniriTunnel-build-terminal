import { gzip, gunzip } from 'node:zlib';
import { pipeline } from 'streamx';
import { logger } from '../../../logger';

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

    // Remove all event listeners to prevent memory leaks, but attach no-op error handlers
    // to prevent uncaught exceptions if streams emit error after destroy
    loc.removeListener('end', onLocEnd)
    connection.removeListener('end', onConnEnd)
    loc.removeListener('finish', onLocFinish)
    connection.removeListener('finish', onConnFinish)
    loc.removeListener('close', onLocClose)
    connection.removeListener('close', onConnClose)

    // Clear idle timeout
    if (idleTimeoutId) clearTimeout(idleTimeoutId)
    if (finishTimer) clearTimeout(finishTimer)
    loc.removeListener('data', onActivity)
    connection.removeListener('data', onActivity)

    loc.removeListener('error', onError)
    connection.removeListener('error', onError)

    // Attach dummy error listeners to catch any trailing errors
    loc.on('error', () => { })
    connection.on('error', () => { })

    // Clean up compression streams if they exist
    if (l2c) {
      l2c.removeAllListeners('error')
      l2c.on('error', () => { }) // Dummy listener
      try { l2c.destroy() } catch (e) { /* ignore */ }
      l2c = null
    }
    if (c2l) {
      c2l.removeAllListeners('error')
      c2l.on('error', () => { }) // Dummy listener
      try { c2l.destroy() } catch (e) { /* ignore */ }
      c2l = null
    }

    // Unpipe streams to break references
    try { loc.unpipe(connection) } catch (e) { /* ignore */ }
    try { connection.unpipe(loc) } catch (e) { /* ignore */ }

    // AGGRESSIVE CLEANUP: Check if sockets are already destroyed before calling destroy()
    // This prevents issues with DHT connections that might be in a half-closed state
    try {
      if (!loc.destroyed) {
        loc.destroy(err)
      }
    } catch (e) { /* ignore */ }

    try {
      if (!connection.destroyed) {
        connection.destroy(err)
      }
    } catch (e) { /* ignore */ }

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

  // // Enable KeepAlive to detect broken networks (Layer 4 check)
  // // This complements our Idle Timeout (Layer 7 check)
  // This was disabled because it was causing issues with the connection
  // if (typeof connection.setKeepAlive === 'function') connection.setKeepAlive(true, 5000)
  // if (typeof loc.setKeepAlive === 'function') loc.setKeepAlive(true, 5000)

  // Set buffer sizes for throughput vs memory balance (256KB)
  // Reduced from 1MB to prevent excessive memory accumulation during iperf3-style tests
  const bufferSize = opts.bufferSize || 256 * 1024
  if (connection._readableState) connection._readableState.highWaterMark = bufferSize
  if (connection._writableState) connection._writableState.highWaterMark = bufferSize
  if (loc._readableState) loc._readableState.highWaterMark = bufferSize
  if (loc._writableState) loc._writableState.highWaterMark = bufferSize

  // Store compression streams for cleanup
  let l2c = null
  let c2l = null

  // SIMPLIFIED PIPING with streamx
  if (opts.compress) {
    // With compression (slower but needed for some use cases)
    // Add memory limits to compression streams to prevent unbounded growth
    const zlibOpts = {
      level: 6, // Default compression level (balance speed vs ratio)
      memLevel: 8, // Default memory usage (8 = 256KB buffer)
      chunkSize: 64 * 1024, // 64KB chunks (smaller than highWaterMark)
    };
    
    l2c = opts.isServer ? gzip(zlibOpts) : gunzip(zlibOpts)
    c2l = opts.isServer ? gunzip(zlibOpts) : gzip(zlibOpts)

    // Use streamx pipeline for robust error handling in the compression chain
    // pipeline(source, transform, dest, callback)
    pipeline(loc, l2c, connection, (err) => {
      if (err) destroy(err)
    })

    pipeline(connection, c2l, loc, (err) => {
      if (err) destroy(err)
    })
  } else {
    // Direct piping with manual end handling to support half-open connections (e.g. iperf3)
    // Note: pipe() automatically handles backpressure via pause()/resume()
    loc.pipe(connection, { end: false })
    connection.pipe(loc, { end: false })
  }

  // Graceful shutdown handling (important for speed tests)
  const onLocEnd = () => {
    if (!destroyed) {
      try { connection.end() } catch (e) { /* ignore */ }
    }
  }
  const onConnEnd = () => {
    if (!destroyed) {
      try { loc.end() } catch (e) { /* ignore */ }
    }
  }

  // Finish event handlers - detect when writable side completes
  // With {end: false} piping, we need to track BOTH readable (end) and writable (finish)
  let locFinished = false
  let connFinished = false

  const checkBothFinished = () => {
    // If both sides have finished writing, cleanup the connection immediately
    if (locFinished && connFinished && !destroyed) {
      if (opts.debug) {
        console.log('[libNet] Both sides finished, cleaning up')
      }
      destroy()
    }
  }

  // HALF-CLOSE GRACE PERIOD: 
  // If one side finishes, give the other side a short time (2s) to finish, then destroy.
  // This prevents connections from lingering in a half-open state for the full 30s timeout.
  let finishTimer = null
  const startFinishTimer = () => {
    if (!finishTimer && !destroyed) {
      finishTimer = setTimeout(() => {
        if (!destroyed) {
          destroy()
        }
      }, 2000) // 2s grace period
    }
  }

  const onLocFinish = () => {
    if (!destroyed) {
      locFinished = true
      checkBothFinished()
      startFinishTimer()
    }
  }

  const onConnFinish = () => {
    if (!destroyed) {
      connFinished = true
      checkBothFinished()
      startFinishTimer()
    }
  }

  // Close event handlers - CRITICAL for proper cleanup
  // The 'close' event is ALWAYS emitted when a socket closes,
  // unlike 'end' which only fires when the readable side ends.
  // This ensures destroy() is called even with {end: false} piping.
  const onLocClose = () => {
    if (!destroyed) {
      destroy()
    }
  }
  const onConnClose = () => {
    if (!destroyed) {
      destroy()
    }
  }

  loc.once('end', onLocEnd)
  connection.once('end', onConnEnd)
  loc.once('finish', onLocFinish)
  connection.once('finish', onConnFinish)
  loc.once('close', onLocClose)
  connection.once('close', onConnClose)

  // Idle timeout handlers - FAILSAFE for stuck connections
  // If no data flows for 30s, assume connection is dead and kill it
  const idleTimeoutMs = opts.idleTimeout || 30000
  let idleTimeoutId = null

  const resetIdleTimeout = () => {
    if (destroyed) return
    if (idleTimeoutId) clearTimeout(idleTimeoutId)

    idleTimeoutId = setTimeout(() => {
      if (!destroyed) {
        if (opts.debug) console.log('[libNet] Connection idle timeout, destroying')
        destroy(new Error('Connection idle timeout'))
      }
    }, idleTimeoutMs)
  }

  const onActivity = () => {
    resetIdleTimeout()
  }

  // Monitor data activity to keep connection alive
  loc.on('data', onActivity)
  connection.on('data', onActivity)

  // Start initial timeout
  resetIdleTimeout()

  // Error handling - cleanup happens in destroy()
  // Catch ECONNRESET and other connection errors
  const onError = (err) => {
    // Suppress common errors that are expected during normal operation
    if (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.code === 'ETIMEDOUT') {
      // These are normal - connection closed by peer
      destroy()
    } else {
      // Log unexpected errors
      if (opts.debug) {
        console.error('[libNet] Connection error:', err)
      }
      destroy(err)
    }
  }

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

export {
  connPiper,
  connRemoteCtrl
};