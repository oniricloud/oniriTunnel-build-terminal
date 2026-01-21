import UDX from 'udx-native';

// Tuning constants - use 8MB for high-performance WAN links
// This helps with TCP window scaling equivalent in userspace UDP transport
const DESIRED_BUFFER_SIZE = 8 * 1024 * 1024;

class TunedUDX extends UDX {
    createSocket(opts) {
        const socket = super.createSocket(opts);

        // Try to increase Receive/Send buffers
        // Note: The OS might cap this. On Linux, sysctl net.core.rmem_max controls the ceiling.
        try {
            const preRecv = socket.getRecvBufferSize();
            const preSend = socket.getSendBufferSize();

            socket.setRecvBufferSize(DESIRED_BUFFER_SIZE);
            socket.setSendBufferSize(DESIRED_BUFFER_SIZE);

            // Optionally log if debug is enabled, but for now we just attempt it silently.
            // We could also check if it actually changed by calling getRecvBufferSize() again.
        } catch (err) {
            // Ignore errors if the OS rejects the size (e.g. permission denied or invalid size)
            // System will fallback to default
        }

        return socket;
    }
}

export default TunedUDX;
