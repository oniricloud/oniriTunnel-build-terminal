const OniriBase = require('../oniriBase');
const { generateSeed } = require('../utils');
const HyperDHT = require('hyperdht');

async function measureThroughput(label, streamCount, durationMs = 5000) {
    const serverSeed = generateSeed();
    const serverDHT = new HyperDHT({ keyPair: HyperDHT.keyPair(Buffer.from(serverSeed, 'hex')) });
    const clientDHT = new HyperDHT();

    const serverKey = serverDHT.defaultKeyPair.publicKey;
    let totalBytes = 0;

    // Server: Accept connections and count bytes
    const server = serverDHT.createServer((socket) => {
        socket.on('data', (chunk) => {
            totalBytes += chunk.length;
        });
    });
    await server.listen();

    // Clients: Pump data
    const clients = [];
    const activeSockets = [];
    let active = true;

    for (let i = 0; i < streamCount; i++) {
        const socket = clientDHT.connect(serverKey);
        activeSockets.push(socket);

        socket.on('error', (err) => {
            if (active) console.error('Socket error:', err.message);
        });

        socket.on('open', () => {
            // Pump data as fast as possible
            const chunk = Buffer.alloc(64 * 1024).fill('a');

            function write() {
                if (!active || socket.destroyed) return;
                let ok = true;
                try {
                    while (active && ok && !socket.destroyed) {
                        ok = socket.write(chunk);
                    }
                } catch (e) { return; }

                if (active && !socket.destroyed) socket.once('drain', write);
            }
            write();
        });
    }

    // Measure
    const start = Date.now();
    await new Promise(resolve => setTimeout(resolve, durationMs));
    active = false;
    const end = Date.now();

    // Graceful stop - wait longer
    await new Promise(r => setTimeout(r, 1000));

    // Cleanup
    const promises = [];
    for (const s of activeSockets) {
        s.removeAllListeners('error');
        s.on('error', () => { });
        s.destroy();
    }
    await new Promise(r => setTimeout(r, 500)); // Wait for destroys

    await server.close();
    await serverDHT.destroy();
    await clientDHT.destroy();

    const durationSec = (end - start) / 1000;
    const mb = totalBytes / 1024 / 1024;
    const mbps = mb / durationSec; // MB/s

    console.log(`${label} [${streamCount} streams]: ${mbps.toFixed(2)} MB/s`);
    return mbps;
}

process.on('uncaughtException', (e) => {
    console.error('Ignored Error:', e.message);
});

async function run() {
    console.log('=== DHT Throughput Benchmark ===');

    await measureThroughput('Single Stream', 1);
    await new Promise(r => setTimeout(r, 1000));

    await measureThroughput('Dual Stream', 2);
    await new Promise(r => setTimeout(r, 1000));

    await measureThroughput('Quad Stream', 4);
    await new Promise(r => setTimeout(r, 1000));

    console.log('=== Done ===');
    process.exit(0);
}

run();
