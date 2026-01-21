// ------------------------------------------------------------
// Parallel‑tunnel speed test (4 concurrent tunnels)
// ------------------------------------------------------------
const net = require('net');
const Manager = require('../servicesManager');
const goodbye = require('graceful-goodbye');
const AllowedStore = require('../allowedStore');

const SINK_PORT = 8081;          // the real target server
const BASE_PROXY = 3004;          // first proxy port (others will be +1, +2, +3)
const DATA_SIZE_MB = 100;
const CHUNK_SIZE = 256 * 1024;   // 256 KB – larger chunks = fewer syscalls
const PARALLEL_TUNNELS = 4;        // ← change this to any number you like

// ------------------------------------------------------------------
// 1️⃣  Start the sink server (unchanged)
let bytesReceived = 0;
let startTime = 0;
const sinkServer = net.createServer(socket => {
    socket.setNoDelay(true);
    socket.on('data', chunk => {
        if (bytesReceived === 0) startTime = Date.now();
        bytesReceived += chunk.length;
    });
    socket.on('end', () => {
        const dur = (Date.now() - startTime) / 1000;
        const mb = bytesReceived / 1024 / 1024;
        console.log(`\n=== Aggregate result across ${PARALLEL_TUNNELS} tunnels ===`);
        console.log(`Received ${bytesReceived} bytes (${mb.toFixed(2)} MiB) in ${dur.toFixed(2)} s`);
        console.log(`Overall speed: ${(mb / dur).toFixed(2)} MiB/s`);
        console.log(`Overall speed: ${(mb / dur * 8).toFixed(2)} Mbps`);
    });
});
sinkServer.listen(SINK_PORT, () => console.log(`Sink server listening on ${SINK_PORT}`));

// ------------------------------------------------------------------
// 2️⃣  Create the tunnel **server** (single instance is enough)
const allowedStore = new AllowedStore();
const serverMgr = new Manager({ allowedStore });
const serverInfo = serverMgr.createServer({
    seed: '1abe20c841aaece99de215a52ee8501b1b450f183834e231e2d2fb87d5dd12cf',
    name: 'Speed Test Server',
    targetPort: SINK_PORT,
});
serverMgr.startServerById(serverInfo.serviceKey);

// ------------------------------------------------------------------
// 3️⃣  Allow the client(s) – we’ll reuse the same public key for all
setTimeout(() => {
    serverMgr.setServerAllowedList(serverInfo.serviceKey, [
        'c52d88563a809b7b953383590c5e6fdd214ca8a5fa6a5e902ca8cfba4d4e5cd0',
    ]);
}, 500);

// ------------------------------------------------------------------
// 4️⃣  Spin up N **client** tunnels, each on its own proxy port
// ------------------------------------------------------------------
// 4️⃣  Spawn a separate process for each tunnel client and source
const { fork } = require('child_process');
const path = require('path');
const workers = [];
for (let i = 0; i < PARALLEL_TUNNELS; i++) {
    const proxyPort = BASE_PROXY + i;
    const worker = fork(path.join(__dirname, 'tcp_tunnel_worker.js'), [proxyPort, DATA_SIZE_MB, CHUNK_SIZE]);
    workers.push(worker);
}

// Placeholder removed – workers now handle source transmission

// ------------------------------------------------------------------
// 5️⃣  When all tunnels are ready, start **N** source sockets in parallel
// Workers handle the source transmission; no in‑process sockets needed.
// The main script only spawns workers and waits for cleanup.

// ------------------------------------------------------------------
// 6️⃣  Clean‑up on exit
// ------------------------------------------------------------------
// 6️⃣  Clean‑up on exit (terminate workers, then close server & sink)
goodbye(async () => {
    // give workers a moment to finish sending
    await new Promise(res => setTimeout(res, 2000));
    for (const w of workers) w.kill();
    await serverMgr.close();
    sinkServer.close();
});