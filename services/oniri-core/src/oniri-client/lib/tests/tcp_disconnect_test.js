const net = require("net");
const Manager = require("../servicesManager");
const goodbye = require("graceful-goodbye");
const AllowedStore = require("../allowedStore");

const SINK_PORT = 8084;
const PROXY_PORT = 3008;

console.log(`=== DISCONNECT TEST ===`);
console.log(`Testing connection handling with premature disconnects\n`);

const main = async () => {
    let testsPassed = 0;
    let testsFailed = 0;

    // Test 1: Normal disconnect
    console.log('Test 1: Normal disconnect after data transfer...');
    await new Promise((resolve) => {
        const sinkServer = net.createServer((socket) => {
            let received = 0;
            socket.on('data', (chunk) => {
                received += chunk.length;
            });
            socket.on('end', () => {
                if (received > 0) {
                    console.log(`✅ Test 1 PASSED: Received ${received} bytes, clean disconnect`);
                    testsPassed++;
                } else {
                    console.log(`❌ Test 1 FAILED: No data received`);
                    testsFailed++;
                }
                sinkServer.close();
                resolve();
            });
        });
        sinkServer.listen(SINK_PORT, async () => {
            const allowedStore = new AllowedStore();
            const serverManager = new Manager({ allowedStore });
            const serverInfo = serverManager.createServer({
                seed: "1abe20c841aaece99de215a52ee8501b1b450f183834e231e2d2fb87d5dd12cf",
                name: "Test Server",
                targetPort: SINK_PORT,
            });
            serverManager.startServerById(serverInfo.serviceKey);

            const clientManager = new Manager();
            const clientInfo = clientManager.createClient({
                seed: "cdd14d13f5fe1e501ef836eb3b1abc253a54e421e9abcf0017959a88af1cd8a0",
                name: "Test Client",
                proxyPort: PROXY_PORT,
                peerToConnect: serverInfo.serviceKey,
            });

            setTimeout(() => {
                serverManager.setServerAllowedList(serverInfo.serviceKey, [clientInfo.serviceKey]);
            }, 500);

            clientManager.startClientById(clientInfo.serviceKey);

            setTimeout(() => {
                const client = net.connect(PROXY_PORT, "127.0.0.1", () => {
                    client.write(Buffer.alloc(1024, 'a'));
                    setTimeout(() => {
                        client.end(); // Normal disconnect
                    }, 100);
                });
            }, 1500);

            setTimeout(async () => {
                await serverManager.close();
                await clientManager.close();
            }, 3000);
        });
    });

    // Test 2: Abrupt disconnect (destroy)
    console.log('\nTest 2: Abrupt disconnect (socket.destroy())...');
    await new Promise((resolve) => {
        const sinkServer = net.createServer((socket) => {
            let received = 0;
            let errorReceived = false;
            socket.on('data', (chunk) => {
                received += chunk.length;
            });
            socket.on('error', () => {
                errorReceived = true;
            });
            socket.on('close', () => {
                if (received > 0) {
                    console.log(`✅ Test 2 PASSED: Received ${received} bytes, handled abrupt disconnect`);
                    testsPassed++;
                } else {
                    console.log(`❌ Test 2 FAILED: No data received before disconnect`);
                    testsFailed++;
                }
                sinkServer.close();
                resolve();
            });
        });
        sinkServer.listen(SINK_PORT + 1, async () => {
            const allowedStore = new AllowedStore();
            const serverManager = new Manager({ allowedStore });
            const serverInfo = serverManager.createServer({
                seed: "2abe20c841aaece99de215a52ee8501b1b450f183834e231e2d2fb87d5dd12cf",
                name: "Test Server 2",
                targetPort: SINK_PORT + 1,
            });
            serverManager.startServerById(serverInfo.serviceKey);

            const clientManager = new Manager();
            const clientInfo = clientManager.createClient({
                seed: "ddd14d13f5fe1e501ef836eb3b1abc253a54e421e9abcf0017959a88af1cd8a0",
                name: "Test Client 2",
                proxyPort: PROXY_PORT + 1,
                peerToConnect: serverInfo.serviceKey,
            });

            setTimeout(() => {
                serverManager.setServerAllowedList(serverInfo.serviceKey, [clientInfo.serviceKey]);
            }, 500);

            clientManager.startClientById(clientInfo.serviceKey);

            setTimeout(() => {
                const client = net.connect(PROXY_PORT + 1, "127.0.0.1", () => {
                    client.write(Buffer.alloc(1024, 'b'));
                    setTimeout(() => {
                        client.destroy(); // Abrupt disconnect
                    }, 100);
                });
                client.on('error', () => { }); // Ignore errors
            }, 1500);

            setTimeout(async () => {
                await serverManager.close();
                await clientManager.close();
            }, 3000);
        });
    });

    // Test 3: Multiple rapid connections
    console.log('\nTest 3: Multiple rapid connections...');
    await new Promise((resolve) => {
        let connections = 0;
        const sinkServer = net.createServer((socket) => {
            connections++;
            socket.on('data', () => { });
            socket.on('end', () => {
                socket.end();
            });
        });
        sinkServer.listen(SINK_PORT + 2, async () => {
            const allowedStore = new AllowedStore();
            const serverManager = new Manager({ allowedStore });
            const serverInfo = serverManager.createServer({
                seed: "3abe20c841aaece99de215a52ee8501b1b450f183834e231e2d2fb87d5dd12cf",
                name: "Test Server 3",
                targetPort: SINK_PORT + 2,
            });
            serverManager.startServerById(serverInfo.serviceKey);

            const clientManager = new Manager();
            const clientInfo = clientManager.createClient({
                seed: "edd14d13f5fe1e501ef836eb3b1abc253a54e421e9abcf0017959a88af1cd8a0",
                name: "Test Client 3",
                proxyPort: PROXY_PORT + 2,
                peerToConnect: serverInfo.serviceKey,
            });

            setTimeout(() => {
                serverManager.setServerAllowedList(serverInfo.serviceKey, [clientInfo.serviceKey]);
            }, 500);

            clientManager.startClientById(clientInfo.serviceKey);

            setTimeout(() => {
                // Create 5 rapid connections
                for (let i = 0; i < 5; i++) {
                    const client = net.connect(PROXY_PORT + 2, "127.0.0.1", () => {
                        client.write(Buffer.alloc(100, 'c'));
                        setTimeout(() => client.end(), 50);
                    });
                    client.on('error', () => { });
                }
            }, 1500);

            setTimeout(async () => {
                if (connections >= 5) {
                    console.log(`✅ Test 3 PASSED: Handled ${connections} rapid connections`);
                    testsPassed++;
                } else {
                    console.log(`❌ Test 3 FAILED: Only ${connections}/5 connections succeeded`);
                    testsFailed++;
                }
                await serverManager.close();
                await clientManager.close();
                sinkServer.close();
                resolve();
            }, 4000);
        });
    });

    // Test 4: Large data transfer with disconnect
    console.log('\nTest 4: Large data transfer (10 MB)...');
    await new Promise((resolve) => {
        let received = 0;
        const sinkServer = net.createServer((socket) => {
            socket.on('data', (chunk) => {
                received += chunk.length;
            });
            socket.on('end', () => {
                const expectedSize = 10 * 1024 * 1024;
                if (received === expectedSize) {
                    console.log(`✅ Test 4 PASSED: Received all ${received} bytes`);
                    testsPassed++;
                } else {
                    console.log(`❌ Test 4 FAILED: Received ${received}/${expectedSize} bytes`);
                    testsFailed++;
                }
                sinkServer.close();
                resolve();
            });
        });
        sinkServer.listen(SINK_PORT + 3, async () => {
            const allowedStore = new AllowedStore();
            const serverManager = new Manager({ allowedStore });
            const serverInfo = serverManager.createServer({
                seed: "4abe20c841aaece99de215a52ee8501b1b450f183834e231e2d2fb87d5dd12cf",
                name: "Test Server 4",
                targetPort: SINK_PORT + 3,
            });
            serverManager.startServerById(serverInfo.serviceKey);

            const clientManager = new Manager();
            const clientInfo = clientManager.createClient({
                seed: "fdd14d13f5fe1e501ef836eb3b1abc253a54e421e9abcf0017959a88af1cd8a0",
                name: "Test Client 4",
                proxyPort: PROXY_PORT + 3,
                peerToConnect: serverInfo.serviceKey,
            });

            setTimeout(() => {
                serverManager.setServerAllowedList(serverInfo.serviceKey, [clientInfo.serviceKey]);
            }, 500);

            clientManager.startClientById(clientInfo.serviceKey);

            setTimeout(() => {
                const client = net.connect(PROXY_PORT + 3, "127.0.0.1", () => {
                    const totalSize = 10 * 1024 * 1024;
                    const chunkSize = 1024 * 1024;
                    let sent = 0;

                    const send = () => {
                        while (sent < totalSize) {
                            const canContinue = client.write(Buffer.alloc(chunkSize, 'd'));
                            sent += chunkSize;
                            if (!canContinue) {
                                client.once('drain', send);
                                return;
                            }
                        }
                        client.end();
                    };
                    send();
                });
            }, 1500);

            setTimeout(async () => {
                await serverManager.close();
                await clientManager.close();
            }, 8000);
        });
    });

    // Summary
    console.log(`\n=== TEST SUMMARY ===`);
    console.log(`Passed: ${testsPassed}/4`);
    console.log(`Failed: ${testsFailed}/4`);

    if (testsFailed === 0) {
        console.log(`\n✅ ALL TESTS PASSED! Simplified piping is reliable.`);
    } else {
        console.log(`\n❌ SOME TESTS FAILED! May need to add error handling.`);
    }

    process.exit(testsFailed > 0 ? 1 : 0);
};

main().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
