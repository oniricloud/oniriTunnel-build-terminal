# UDP Testing Guide

## Overview
This guide explains how to test the UDP client and server implementations.

## Test Files

### 1. Individual Component Tests
- **`oniriServerUdp.js`** - Starts only the UDP server (runs indefinitely)
- **`oniriClientUdp.js`** - Starts only the UDP client (runs indefinitely)

These are meant to be run manually in separate terminals for manual testing.

### 2. Automated Tests
- **`udp_comprehensive_test.js`** - Tests start/stop, memory leaks, resource cleanup
- **`udp_e2e_test.js`** - End-to-end communication test (NEW)

## How to Test

### Option 1: Automated End-to-End Test (Recommended)
This test verifies that UDP packets actually flow through the tunnel:

```bash
cd packages/oniri-client
node src/lib/tests/udp_e2e_test.js
```

**What it does:**
1. Creates a real UDP server on port 2222 (target)
2. Creates HyperDHT UDP server (tunnels to port 2222)
3. Creates HyperDHT UDP client (creates proxy on port 3004)
4. Sends UDP packet through proxy → tunnel → target server
5. Verifies message received
6. Cleans up all resources

**Expected output:**
```
✓ Target UDP server started
✓ HyperDHT UDP server started
✓ HyperDHT UDP client started
✓ Target server received message(s)
✓ Correct message received by target server
✓ All tests passed!
```

### Option 2: Comprehensive Resource Test
Tests start/stop cycles and memory leak prevention:

```bash
cd packages/oniri-client
node src/lib/tests/udp_comprehensive_test.js
```

**Expected output:**
```
✓ All tests passed!
Tests Passed: 11
Tests Failed: 0
```

### Option 3: Manual Testing
For interactive testing, run server and client in separate terminals:

**Terminal 1 - Start UDP Server:**
```bash
cd packages/oniri-client/src/lib/tests
node oniriServerUdp.js
```

You should see:
```
{
  name: 'Http Server',
  serviceKey: 'bdccd8a69dbd56d5c95915a95f0308408d34e2e1941174a133c418dce09357ac'
}
hypertele: bdccd8a69dbd56d5c95915a95f0308408d34e2e1941174a133c418dce09357ac
```

**Terminal 2 - Start UDP Client:**
```bash
cd packages/oniri-client/src/lib/tests
node oniriClientUdp.js
```

You should see:
```
Listining to  Address:  0.0.0.0 Port:  3004
```

**Terminal 3 - Send test UDP packet:**
```bash
# Using netcat to send UDP packet to the proxy
echo "test message" | nc -u localhost 3004
```

Press `Ctrl+C` in each terminal to stop the services.

## What Each Test Verifies

### udp_comprehensive_test.js
- ✅ Server can start and stop cleanly
- ✅ Client can start and stop cleanly
- ✅ Multiple start/stop cycles work without errors
- ✅ Resources (Maps, DHT, sockets) are properly cleaned up
- ✅ No memory leaks

### udp_e2e_test.js
- ✅ UDP packets flow through the tunnel
- ✅ Server receives packets from client
- ✅ Message content is preserved
- ✅ Full communication pipeline works
- ✅ Cleanup works after communication

## Troubleshooting

### "Port already in use"
If you get port errors, make sure no other instances are running:
```bash
lsof -i :2222  # Check target port
lsof -i :3004  # Check proxy port
```

### "Cannot find module"
Make sure you're in the correct directory:
```bash
cd packages/oniri-client
```

### Tests hang
The manual tests (`oniriServerUdp.js`, `oniriClientUdp.js`) are meant to run indefinitely. Use `Ctrl+C` to stop them. For automated testing, use the test scripts instead.

## Next Steps

After verifying the tests pass:
1. Review the resource cleanup implementation
2. Consider adding more edge case tests
3. Test with actual UDP applications (e.g., DNS, game servers)
4. Monitor memory usage over extended periods
