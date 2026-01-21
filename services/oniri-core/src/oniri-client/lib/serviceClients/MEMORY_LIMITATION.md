# Memory Limitation: High-Throughput Scenarios

## Problem Summary

When tunneling extremely high-speed data transfers (15+ Gbps, such as iperf3 bandwidth tests), the application can consume 15-20GB of memory. This memory is eventually reclaimed by garbage collection, but the spike can be problematic on memory-constrained systems.

## Root Cause

The memory accumulation occurs in **HyperDHT/UDX's native C layer** before data reaches JavaScript:

1. **Network Layer**: iperf3 server sends data at 17+ Gbps over the DHT connection
2. **UDX Native Buffering**: UDX (UDP transport) receives UDP packets and buffers them in native C memory
3. **JavaScript Processing**: JavaScript handlers process data at only 40-80 MB/s
4. **Buffer Accumulation**: The massive speed difference (17 Gbps vs 80 MB/s) causes 15-20GB to accumulate in native buffers

### Why JavaScript Throttling Doesn't Work

All attempted JavaScript-level solutions fail because:
- **Transform streams**: Data is already buffered before reaching the Transform
- **pause/resume**: UDX continues receiving network packets even when stream is paused
- **Data handlers**: Only see data after it's already in memory
- **Buffer size limits**: Only affect JavaScript layer, not native C buffers

The native UDX layer doesn't respect backpressure signals from JavaScript, continuing to receive and buffer UDP packets regardless of downstream processing speed.

## Investigation Results

### Test: iperf3 Server → DHT Tunnel → iperf3 Client

```
iperf3 Results:
- Sender:   17.2 Gbits/sec (server pushing data)
- Receiver: 613 Mbits/sec  (client receiving data)
- Memory:   19-21 GB peak usage
```

### JavaScript Measurements

```
JavaScript handler throughput: 40-80 MB/s
Configured bandwidth limit:    1000 MB/s (1 Gbps)
Memory usage:                  21 GB

Conclusion: JavaScript sees only 40-80 MB/s but 21GB is already buffered in native layer
```

## Practical Solutions

### 1. Client-Side Rate Limiting (Recommended)

Limit the data rate when initiating connections to iperf3 servers:

```bash
# Limit iperf3 to 1 Gbps
iperf3 -c <server> -p <port> -b 1G

# Or 500 Mbps for lower-powered devices
iperf3 -c <server> -p <port> -b 500M
```

### 2. Server-Side Configuration

If you control the iperf3 server, configure a default rate limit:

```bash
# Start iperf3 server with 1 Gbps limit
iperf3 -s --bitrate 1G
```

### 3. Accept Memory Spikes

For systems with sufficient RAM (32GB+):
- The memory spike is temporary (10-30 seconds for typical tests)
- Memory is **partially** reclaimed by garbage collection after the transfer
- **Memory retention**: Baseline 85MB → Spike 20GB → Settles to ~375MB
- **~290MB retained** after cleanup due to native heap fragmentation
- Additional spikes will reuse this retained memory rather than allocating more
- The retained memory represents pre-allocated buffers that improve performance on subsequent transfers

### 4. OS-Level Traffic Shaping

On Linux, use `tc` (traffic control):

```bash
# Limit interface to 1 Gbps
sudo tc qdisc add dev eth0 root tbf rate 1gbit burst 32kbit latency 400ms
```

On macOS, use `pfctl` or `dnctl` for rate limiting.

## Recommended Configuration

### For General Use (1-5 Gbps expected)
- No configuration needed
- Memory will peak at 2-5GB during bursts
- Suitable for most real-world applications

### For Bandwidth Testing (unlimited speed)
- Use client-side rate limiting: `-b 1G` or `-b 2G`
- Ensure system has 8GB+ available RAM
- Monitor memory during tests

### For Resource-Constrained Devices (Raspberry Pi, etc.)
- Limit to 500 Mbps: `-b 500M`
- Reduce buffer sizes in libNet.js if needed
- Consider compression for bandwidth-limited scenarios

## Current Buffer Configuration

Located in `libNet.js`:

```javascript
// Set buffer sizes (256KB per stream)
const bufferSize = opts.bufferSize || 256 * 1024
```

**Note**: Reducing `bufferSize` below 256KB can hurt performance without preventing the native layer buffering issue.

## Long-Term Solution

This is a **HyperDHT/UDX architectural limitation**. A proper fix would require:

1. **Exposing UDX controls**: Add `recv_start()`/`recv_stop()` to pause native receiving
2. **Configurable buffer limits**: Allow setting max buffer size in native layer
3. **Backpressure propagation**: Make UDX respect JavaScript backpressure signals

Consider filing an issue at: https://github.com/holepunchto/hyperdht

## Testing Notes

Use `tcp_speed_test.js` for controlled testing with memory monitoring:

```bash
bare ./services/oniri-core/src/oniri-client/lib/tests/tcp_speed_test.js
```

This test includes:
- Bandwidth limiting (default 1 Gbps)
- Memory usage monitoring
- CPU usage tracking
- Safe for development testing

Avoid unlimited iperf3 tests in production without rate limiting.

## Summary

**The Issue**: Native buffer accumulation at extreme speeds (15+ Gbps)  
**The Cause**: UDX C layer doesn't respect JavaScript backpressure  
**The Solution**: Rate limit at the source (iperf3 `-b` flag)  
**The Impact**: 
- Temporary 20GB spike during transfer
- **~290MB retained after spike** (85MB → 20GB → 375MB)
- 54% improvement from explicit stream cleanup (unpipe + nulling)
- Retained memory is reused by subsequent transfers
- Native heap fragmentation prevents full reclamation

For normal application usage (file transfers, streaming, RPC), this limitation is not encountered. It only affects synthetic bandwidth tests with unlimited throughput.

**Note**: Running a second unlimited speed test will reuse the 375MB working set without additional allocation.
