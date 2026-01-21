# TCP Client and Server Review

## Overview
Reviewed the TCP tunnel implementations (`client.js` and `server.js`) for resource management issues, comparing them against the UDP implementations and the fixes applied.

## Files Reviewed
- [client.js](file:///Users/sce9sc/Documents/work/oniricloud/packages/oniri-client/src/lib/serviceClients/client.js) - TCP client (creates local proxy)
- [server.js](file:///Users/sce9sc/Documents/work/oniricloud/packages/oniri-client/src/lib/serviceClients/server.js) - TCP server (tunnels to target)

---

## Findings

### ✅ Good Practices Found

#### 1. **Proper Use of connPiper**
Both client and server use the `connPiper` utility from `libNet.js` which handles:
- Stream piping between connections
- Error handling
- Connection cleanup

This is better than the manual UDP implementation.

#### 2. **Firewall Integration (Server)**
The TCP server properly integrates with `allowedStore`:
```javascript
async firewall(remotePublicKey, remoteHandshakePayload) {
  const remoteClientKey = remotePublicKey.toString("hex");
  const isAllowed = await this.allowedStore.isAllowed(
    this.getPublicKey(),
    remoteClientKey
  );
  return !isAllowed; // true = block, false = allow
}
```

Unlike UDP server which has a stubbed firewall.

#### 3. **Correct Target Configuration**
Server uses `this.targetPort` and `this.targetHost` correctly (lines 75-76):
```javascript
return net.connect({
  port: this.targetPort,
  host: this.targetHost,
  // ...
});
```

No hardcoded values like we found in UDP server.

---

### ⚠️ Issues Found

#### 1. **Incomplete Cleanup in stop() Methods**

**Client (lines 71-85):**
```javascript
async stop() {
  if (this.dht) {
    await this.dht.destroy();
    if (this.proxy) {
      this.proxy.close();
    }
    this.dht = null;
    this.proxy = null;
    this.started = false;
    this.sendUpdateMessage({ type: "stopped", data: null });
    return true;
  }
  this.sendUpdateMessage({ type: "error", data: { msg: "failled to Stop" } });
  return false;
}
```

**Issues:**
- No error handling around `proxy.close()`
- No listener removal before closing
- Typo: "failled" → "failed"

**Server (lines 91-106):**
```javascript
async stop() {
  if (this.dht) {
    await this.dht.destroy();
    this.server.close();
    this.dht = null;
    this.server = null;
    this.started = false;
    this.sendUpdateMessage({ type: "stopped", data: null });
    return true;
  }
  this.sendUpdateMessage({ type: "error", data: { msg: "failled to Stop" } });
  return false;
}
```

**Issues:**
- No error handling around `server.close()`
- No listener removal
- Typo: "failled" → "failed"
- Should await `server.close()` for proper cleanup

#### 2. **Missing Null Checks**
Both stop() methods don't check if `proxy`/`server` exist before calling `.close()`:
- Client checks `if (this.proxy)` but server doesn't check `if (this.server)`
- Could throw if server/proxy is undefined

#### 3. **No Active Connection Tracking**
Unlike RPC implementations, TCP client/server don't track:
- Active proxy connections (client)
- Active tunnel connections (server)

This means on `stop()`, active connections aren't explicitly closed - they rely on DHT/proxy server closure to cascade.

---

## Comparison with UDP Implementations

| Feature | TCP Client | TCP Server | UDP Client | UDP Server |
|---------|-----------|-----------|-----------|-----------|
| Resource cleanup | ⚠️ Basic | ⚠️ Basic | ✅ Fixed | ✅ Fixed |
| Error handling in stop() | ❌ No | ❌ No | ✅ Yes | ✅ Yes |
| Listener removal | ❌ No | ❌ No | ✅ Yes | ✅ Yes |
| Typo "failled" | ❌ Yes | ❌ Yes | ✅ Fixed | ✅ Fixed |
| Connection tracking | ❌ No | ❌ No | ✅ Yes (clients Map) | ✅ Yes (udpClients Map) |
| Hardcoded values | ✅ None | ✅ None | ✅ Fixed | ✅ Fixed |
| Firewall integration | N/A | ✅ Yes | N/A | ❌ Stubbed |

---

## Recommendations

### High Priority

#### 1. **Improve stop() Methods**
Apply similar fixes as UDP implementations:

**Client:**
```javascript
async stop() {
  // Clean up proxy server
  if (this.proxy) {
    try {
      this.proxy.removeAllListeners();
      await new Promise((resolve) => {
        this.proxy.close(() => resolve());
      });
    } catch (e) {
      console.log("Error cleaning up proxy:", e);
    }
    this.proxy = null;
  }

  // Clean up DHT
  if (this.dht) {
    await this.dht.destroy();
    this.dht = null;
    this.started = false;
    this.sendUpdateMessage({ type: "stopped", data: null });
    return true;
  }
  
  this.sendUpdateMessage({ type: "error", data: { msg: "failed to Stop" } });
  return false;
}
```

**Server:**
```javascript
async stop() {
  // Clean up DHT server
  if (this.server) {
    try {
      await this.server.close();
    } catch (e) {
      console.log("Error closing server:", e);
    }
    this.server = null;
  }

  // Clean up DHT
  if (this.dht) {
    await this.dht.destroy();
    this.dht = null;
    this.started = false;
    this.sendUpdateMessage({ type: "stopped", data: null });
    return true;
  }
  
  this.sendUpdateMessage({ type: "error", data: { msg: "failed to Stop" } });
  return false;
}
```

#### 2. **Fix Typos**
Change "failled" to "failed" in both files.

### Medium Priority

#### 3. **Add Connection Tracking**
Consider tracking active connections for better cleanup control, similar to UDP implementations.

#### 4. **Implement UDP Server Firewall**
The UDP server should have proper firewall integration like the TCP server.

---

## Overall Assessment

**TCP implementations are more mature than UDP:**
- ✅ Use proper utility functions (`connPiper`)
- ✅ No hardcoded values
- ✅ Proper firewall integration (server)

**But still need improvements:**
- ⚠️ Resource cleanup could be more robust
- ⚠️ Missing error handling in stop() methods
- ⚠️ No listener removal
- ⚠️ Minor typos

**Risk Level:** **Low-Medium**
- TCP implementations are functional and likely work well in practice
- The `connPiper` utility probably handles most edge cases
- Resource leaks are less likely than in UDP, but still possible
- Improvements would make them more robust and consistent with fixed UDP code

---

## Next Steps

1. Apply stop() method improvements to both TCP files
2. Fix typos
3. Consider adding connection tracking
4. Test TCP implementations with start/stop cycles
5. Create E2E test for TCP tunnel (similar to UDP E2E test)
