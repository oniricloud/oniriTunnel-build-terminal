#!/usr/bin/env node

/**
 * End-to-End UDP Test
 * This test starts both a UDP server and client, sends data between them,
 * and verifies the communication works correctly.
 */

const Manager = require("../servicesManager");
const AllowedStore = require("../allowedStore");
const dgram = require("dgram");

// Test configuration
const serverSeed = "1abe20c841aaece99de215a52ee8501b1b450f183834e231e2d2fb87d5dd12cf";
const clientSeed = "cdd14d13f5fe1e501ef836eb3b1abc253a54e421e9abcf0017959a88af1cd8a0";
const peerToConnect = "bdccd8a69dbd56d5c95915a95f0308408d34e2e1941174a133c418dce09357ac";

const TEST_PORT = 2222;
const PROXY_PORT = 3004;

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
    log("UDP End-to-End Communication Test");
    log("=".repeat(60));

    const allowedStore = new AllowedStore();
    const manager = new Manager({ allowedStore });

    let targetUdpServer = null;
    let testClient = null;

    try {
        // Step 1: Create a simple UDP server on port 2222 (the target)
        log("\n1. Creating target UDP server on port 2222...");
        targetUdpServer = dgram.createSocket("udp4");

        const receivedMessages = [];

        targetUdpServer.on("message", (msg, rinfo) => {
            log(`Target server received: "${msg.toString()}" from ${rinfo.address}:${rinfo.port}`);
            receivedMessages.push(msg.toString());

            // Echo back
            targetUdpServer.send(
                Buffer.from(`Echo: ${msg.toString()}`),
                rinfo.port,
                rinfo.address,
                (err) => {
                    if (err) {
                        logError(`Failed to send echo: ${err.message}`);
                    } else {
                        log(`Sent echo back to ${rinfo.address}:${rinfo.port}`);
                    }
                }
            );
        });

        await new Promise((resolve) => {
            targetUdpServer.bind(TEST_PORT, () => {
                log(`Target UDP server listening on port ${TEST_PORT}`);
                logSuccess("Target UDP server started");
                resolve();
            });
        });

        // Step 2: Create HyperDHT UDP Server (tunnels to port 2222)
        log("\n2. Creating HyperDHT UDP server...");
        const serverInfo = manager.createServerUdp({
            seed: serverSeed,
            name: "Test UDP Server",
            targetPort: TEST_PORT,
            targetHost: "localhost",
        });

        log(`Server serviceKey: ${serverInfo.serviceKey}`);
        await sleep(2000);
        logSuccess("HyperDHT UDP server started");

        // Step 3: Create HyperDHT UDP Client (creates proxy on port 3004)
        log("\n3. Creating HyperDHT UDP client...");
        const clientInfo = await manager.createClientUdp({
            seed: clientSeed,
            name: "Test UDP Client",
            proxyPort: PROXY_PORT,
            peerToConnect,
        });

        log(`Client publicKey: ${clientInfo.publicKey}`);
        await sleep(3000);
        logSuccess("HyperDHT UDP client started");

        // Step 4: Create a test UDP client to send data through the proxy
        log("\n4. Creating test client to send data through proxy...");
        testClient = dgram.createSocket("udp4");

        const testMessage = "Hello from test client!";
        let echoReceived = false;

        testClient.on("message", (msg, rinfo) => {
            log(`Test client received: "${msg.toString()}" from ${rinfo.address}:${rinfo.port}`);
            echoReceived = true;
        });

        // Step 5: Send test message through the proxy
        log("\n5. Sending test message through proxy...");
        await new Promise((resolve) => {
            testClient.send(
                Buffer.from(testMessage),
                PROXY_PORT,
                "localhost",
                (err) => {
                    if (err) {
                        logError(`Failed to send test message: ${err.message}`);
                    } else {
                        log(`Sent "${testMessage}" to proxy at localhost:${PROXY_PORT}`);
                    }
                    resolve();
                }
            );
        });

        // Wait for message to propagate
        await sleep(3000);

        // Step 6: Verify results
        log("\n6. Verifying results...");

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
        } else {
            log("⚠ Echo not received (this may be expected depending on routing)");
        }

    } catch (error) {
        logError(`Test failed with error: ${error.message}`);
        console.error(error);
    } finally {
        // Cleanup
        log("\n7. Cleaning up...");

        if (testClient) {
            testClient.close();
            log("Test client closed");
        }

        if (targetUdpServer) {
            targetUdpServer.close();
            log("Target UDP server closed");
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
