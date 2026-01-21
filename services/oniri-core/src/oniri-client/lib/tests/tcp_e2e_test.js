#!/usr/bin/env node

/**
 * End-to-End TCP Test
 * This test starts both a TCP server and client, sends data through the tunnel,
 * and verifies the communication works correctly.
 */

const Manager = require("../servicesManager");
const AllowedStore = require("../allowedStore");
const net = require("net");

// Test configuration
const serverSeed = "1abe20c841aaece99de215a52ee8501b1b450f183834e231e2d2fb87d5dd12cf";
const clientSeed = "cdd14d13f5fe1e501ef836eb3b1abc253a54e421e9abcf0017959a88af1cd8a0";
const peerToConnect = "bdccd8a69dbd56d5c95915a95f0308408d34e2e1941174a133c418dce09357ac";

const TARGET_PORT = 8888;
const PROXY_PORT = 3006;

let testsPassed = 0;
let testsFailed = 0;

function log(message) {
    console.log(`[E2E] ${message}`);
}

function logSuccess(message) {
    console.log(`✓ [PASS] ${message}`);
    testsPassed++;
}

function logError(message) {
    console.error(`✗ [FAIL] ${message}`);
    testsFailed++;
}

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runE2ETest() {
    log("=".repeat(60));
    log("TCP End-to-End Communication Test");
    log("=".repeat(60));

    const allowedStore = new AllowedStore();
    const manager = new Manager({ allowedStore });

    let targetTcpServer = null;
    let testClient = null;

    try {
        // Step 1: Create a simple TCP server on port 8888 (the target)
        log("\n1. Creating target TCP server on port 8888...");

        const receivedMessages = [];

        targetTcpServer = net.createServer((socket) => {
            log(`Target server: Client connected from ${socket.remoteAddress}:${socket.remotePort}`);

            socket.on("data", (data) => {
                const message = data.toString();
                log(`Target server received: "${message}"`);
                receivedMessages.push(message);

                // Echo back
                const response = `Echo: ${message}`;
                socket.write(response);
                log(`Target server sent echo: "${response}"`);
            });

            socket.on("error", (err) => {
                log(`Target server socket error: ${err.message}`);
            });

            socket.on("end", () => {
                log("Target server: Client disconnected");
            });
        });

        await new Promise((resolve) => {
            targetTcpServer.listen(TARGET_PORT, "127.0.0.1", () => {
                log(`Target TCP server listening on port ${TARGET_PORT}`);
                logSuccess("Target TCP server started");
                resolve();
            });
        });

        // Step 2: Create HyperDHT TCP Server (tunnels to port 8888)
        log("\n2. Creating HyperDHT TCP server...");

        // Add client's public key to allowed list
        const clientPublicKey = "c52d88563a809b7b953383590c5e6fdd214ca8a5fa6a5e902ca8cfba4d4e5cd0";

        const serverInfo = manager.createServer({
            seed: serverSeed,
            name: "Test TCP Server",
            targetPort: TARGET_PORT,
            targetHost: "127.0.0.1",
            allowed: [clientPublicKey],
        });

        log(`Server serviceKey: ${serverInfo.serviceKey}`);

        // Start the server (it doesn't auto-initialize)
        manager.startServerById(serverInfo.serviceKey);

        await sleep(2000);
        logSuccess("HyperDHT TCP server started");

        // Step 3: Create HyperDHT TCP Client (creates proxy on port 3006)
        log("\n3. Creating HyperDHT TCP client...");
        const clientInfo = manager.createClient({
            seed: clientSeed,
            name: "Test TCP Client",
            proxyPort: PROXY_PORT,
            proxyHost: "127.0.0.1",
            peerToConnect,
        });

        log(`Client serviceKey: ${clientInfo.serviceKey}`);

        // Start the client (it doesn't auto-initialize)
        manager.startClientById(clientInfo.serviceKey);

        await sleep(2000); // Initial wait for client to start
        logSuccess("HyperDHT TCP client started");

        // Step 4: Verify proxy is listening
        log("\n4. Verifying proxy is listening...");
        let proxyReady = false;
        for (let i = 0; i < 5; i++) {
            try {
                const testSocket = new net.Socket();
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        testSocket.destroy();
                        reject(new Error("Timeout"));
                    }, 1000);

                    testSocket.connect(PROXY_PORT, "127.0.0.1", () => {
                        clearTimeout(timeout);
                        testSocket.destroy();
                        resolve();
                    });

                    testSocket.on("error", (err) => {
                        clearTimeout(timeout);
                        reject(err);
                    });
                });
                proxyReady = true;
                logSuccess(`Proxy is ready on port ${PROXY_PORT}`);
                break;
            } catch (err) {
                log(`Proxy not ready yet (attempt ${i + 1}/5): ${err.message}`);
                await sleep(1000);
            }
        }

        if (!proxyReady) {
            logError("Proxy failed to start");
            return;
        }

        // Step 5: Create a test TCP client to send data through the proxy
        log("\n5. Creating test client to send data through proxy...");

        const testMessage = "Hello from TCP test client!";
        let echoReceived = false;
        let receivedEcho = "";

        testClient = new net.Socket();

        testClient.on("data", (data) => {
            receivedEcho = data.toString();
            log(`Test client received: "${receivedEcho}"`);
            echoReceived = true;
        });

        testClient.on("error", (err) => {
            logError(`Test client error: ${err.message}`);
        });

        // Step 6: Connect and send test message through the proxy
        log("\n6. Connecting to proxy and sending test message...");

        await new Promise((resolve, reject) => {
            testClient.connect(PROXY_PORT, "127.0.0.1", () => {
                log(`Test client connected to proxy at localhost:${PROXY_PORT}`);

                // Send test message
                testClient.write(testMessage);
                log(`Sent "${testMessage}" through proxy`);

                // Wait longer for response
                setTimeout(() => {
                    if (!testClient.destroyed) {
                        testClient.end();
                    }
                    resolve();
                }, 5000); // Increased from 2000 to 5000
            });

            testClient.on("error", (err) => {
                reject(err);
            });
        });

        // Wait for message to propagate
        await sleep(2000);

        // Step 7: Verify results
        log("\n7. Verifying results...");

        if (receivedMessages.length > 0) {
            logSuccess(`Target server received ${receivedMessages.length} message(s)`);
            if (receivedMessages.includes(testMessage)) {
                logSuccess("Correct message received by target server");
            } else {
                logError(`Expected "${testMessage}", got "${receivedMessages[0]}"`);
            }
        } else {
            logError("No messages received by target server");
        }

        if (echoReceived) {
            logSuccess("Echo received by test client");
            if (receivedEcho === `Echo: ${testMessage}`) {
                logSuccess("Echo content is correct");
            } else {
                logError(`Expected "Echo: ${testMessage}", got "${receivedEcho}"`);
            }
        } else {
            logError("Echo not received by test client");
        }

    } catch (error) {
        logError(`Test failed with error: ${error.message}`);
        console.error(error);
    } finally {
        // Cleanup
        log("\n8. Cleaning up...");

        if (testClient && !testClient.destroyed) {
            testClient.destroy();
            log("Test client closed");
        }

        if (targetTcpServer) {
            await new Promise((resolve) => {
                targetTcpServer.close(() => {
                    log("Target TCP server closed");
                    resolve();
                });
            });
        }

        await manager.close();
        log("Manager closed");

        logSuccess("Cleanup complete");
    }

    // Summary
    log("\n" + "=".repeat(60));
    log("Test Summary");
    log("=".repeat(60));
    log(`Tests Passed: ${testsPassed}`);
    log(`Tests Failed: ${testsFailed}`);

    if (testsFailed === 0) {
        log("\n✓ E2E test completed successfully!");
        process.exit(0);
    } else {
        log("\n✗ E2E test had failures!");
        process.exit(1);
    }
}

// Run the test
runE2ETest().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
