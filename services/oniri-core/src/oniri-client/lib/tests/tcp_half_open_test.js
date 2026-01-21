const net = require("net");
const Manager = require("../servicesManager");
const AllowedStore = require("../allowedStore");

const SINK_PORT = 8085;
const PROXY_PORT = 3015;

console.log(`=== HALF-OPEN CONNECTION TEST ===`);
console.log(`Testing if server can send data back after client sends FIN (simulating iperf3 stats)\n`);

const main = async () => {
    let testsPassed = 0;
    let testsFailed = 0;

    await new Promise((resolve) => {
        const sinkServer = net.createServer({ allowHalfOpen: true }, (socket) => {
            console.log('[Sink] Client connected');
            let received = 0;
            socket.on('data', (chunk) => {
                received += chunk.length;
                console.log(`[Sink] Received ${chunk.length} bytes`);
            });
            socket.on('end', () => {
                console.log('[Sink] Client sent FIN. Sending stats back...');
                // Simulate calculating stats and sending back
                setTimeout(() => {
                    const stats = "STATS_REPORT: 100 MB transferred";
                    socket.write(stats, () => {
                        console.log('[Sink] Stats sent. Ending socket.');
                        socket.end();
                    });
                }, 500);
            });
            socket.on('error', (err) => console.error('[Sink] Error:', err));
        });

        sinkServer.listen(SINK_PORT, async () => {
            const allowedStore = new AllowedStore();
            const serverManager = new Manager({ allowedStore });
            const serverInfo = serverManager.createServer({
                seed: "5abe20c841aaece99de215a52ee8501b1b450f183834e231e2d2fb87d5dd12cf",
                name: "HO Server",
                targetPort: SINK_PORT,
            });
            serverManager.startServerById(serverInfo.serviceKey);

            const clientManager = new Manager();
            const clientInfo = clientManager.createClient({
                seed: "6dd14d13f5fe1e501ef836eb3b1abc253a54e421e9abcf0017959a88af1cd8a0",
                name: "HO Client",
                proxyPort: PROXY_PORT,
                peerToConnect: serverInfo.serviceKey,
            });

            setTimeout(() => {
                serverManager.setServerAllowedList(serverInfo.serviceKey, [clientInfo.serviceKey]);
            }, 500);

            clientManager.startClientById(clientInfo.serviceKey);

            setTimeout(() => {
                console.log('[Test] Connecting to proxy...');
                const client = net.createConnection(PROXY_PORT, "127.0.0.1", () => {
                    console.log('[Test] Connected. Sending data...');
                    client.write(Buffer.alloc(20 * 1024 * 1024, 'a'));
                    // Send FIN immediately after queuing data
                    client.end();
                    console.log('[Test] Data sent. FIN sent. Waiting for stats...');
                });

                let receivedStats = "";
                client.on('data', (chunk) => {
                    receivedStats += chunk.toString();
                    console.log(`[Test] Received chunk: ${chunk.toString()}`);
                });

                client.on('end', () => {
                    console.log('[Test] Client socket ended.');
                    if (receivedStats.includes("STATS_REPORT")) {
                        console.log(`✅ TEST PASSED: Received stats after sending FIN.`);
                        testsPassed++;
                    } else {
                        console.log(`❌ TEST FAILED: Did not receive full stats. Got: "${receivedStats}"`);
                        testsFailed++;
                    }
                    cleanup();
                });

                client.on('error', (err) => {
                    console.error('[Test] Client error:', err);
                    cleanup();
                });

                async function cleanup() {
                    client.destroy();
                    await serverManager.close();
                    await clientManager.close();
                    sinkServer.close();
                    resolve();
                }
            }, 1500);
        });
    });

    console.log(`\n=== TEST SUMMARY ===`);
    console.log(`Passed: ${testsPassed}`);
    console.log(`Failed: ${testsFailed}`);
    process.exit(testsFailed > 0 ? 1 : 0);
};

main().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
