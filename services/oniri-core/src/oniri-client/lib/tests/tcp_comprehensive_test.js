#!/usr/bin/env node

/**
 * Comprehensive test for TCP Client and Server
 * Tests basic functionality and resource cleanup
 */

const Manager = require("../servicesManager");
const AllowedStore = require("../allowedStore");

// Test configuration
const serverSeed = "1abe20c841aaece99de215a52ee8501b1b450f183834e231e2d2fb87d5dd12cf";
const clientSeed = "cdd14d13f5fe1e501ef836eb3b1abc253a54e421e9abcf0017959a88af1cd8a0";
const peerToConnect = "bdccd8a69dbd56d5c95915a95f0308408d34e2e1941174a133c418dce09357ac";

let testsPassed = 0;
let testsFailed = 0;

function log(message) {
    console.log(`[TEST] ${message}`);
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

async function testServerStartStop() {
    log("Test 1: TCP Server Start/Stop");

    try {
        const allowedStore = new AllowedStore();
        const manager = new Manager({ allowedStore });

        const info = manager.createServer({
            seed: serverSeed,
            name: "Test TCP Server",
            targetPort: 8080,
            targetHost: "127.0.0.1",
            allowed: [clientSeed],
        });

        log(`Server created with serviceKey: ${info.serviceKey}`);

        // Wait for server to start
        await sleep(2000);

        const server = manager.getServer(info.serviceKey);
        if (server && server.server) {
            logSuccess("Server created and initialized");
        } else {
            logError("Server not properly initialized");
            return;
        }

        // Stop the server
        await manager.stopServerById(info.serviceKey);
        await sleep(1000);

        logSuccess("Server stopped successfully");

        // Cleanup
        await manager.close();
        logSuccess("Manager closed successfully");

    } catch (error) {
        logError(`Server test failed: ${error.message}`);
        console.error(error);
    }
}

async function testClientStartStop() {
    log("\nTest 2: TCP Client Start/Stop");

    try {
        const allowedStore = new AllowedStore();
        const manager = new Manager({ allowedStore });

        const info = manager.createClient({
            seed: clientSeed,
            name: "Test TCP Client",
            proxyPort: 0, // Use dynamic port allocation to avoid EADDRINUSE
            peerToConnect,
        });

        log(`Client created with serviceKey: ${info.serviceKey}`);

        // Wait for client to initialize
        await sleep(2000);

        const client = manager.getClient(info.serviceKey);
        if (client && client.client) {
            logSuccess("Client created and initialized");
        } else {
            logError("Client not properly initialized");
            return;
        }

        // Stop the client
        await manager.stopClientById(info.serviceKey);
        await sleep(2000); // Increased delay for port cleanup

        logSuccess("Client stopped successfully");

        // Cleanup
        await manager.close();
        await sleep(1000); // Wait for full cleanup
        logSuccess("Manager closed successfully");

    } catch (error) {
        logError(`Client test failed: ${error.message}`);
        console.error(error);
    }
}

async function testMultipleStartStop() {
    log("\\nTest 3: Multiple Start/Stop Cycles (Memory Leak Test)");

    try {
        const allowedStore = new AllowedStore();
        const manager = new Manager({ allowedStore });

        const cycles = 3;

        for (let i = 0; i < cycles; i++) {
            log(`Cycle ${i + 1}/${cycles}`);

            // Create server
            const serverInfo = manager.createServer({
                seed: serverSeed,
                name: `Test Server ${i}`,
                targetPort: 8080,
                allowed: [],
            });

            await sleep(2000); // Increased delay for initialization

            // Stop server
            await manager.stopServerById(serverInfo.serviceKey);
            await sleep(2000); // Increased delay for cleanup
        }

        logSuccess(`Completed ${cycles} start/stop cycles without errors`);

        // Cleanup
        await manager.close();
        logSuccess("Manager closed after multiple cycles");

    } catch (error) {
        logError(`Multiple start/stop test failed: ${error.message}`);
        console.error(error);
    }
}

async function testResourceCleanup() {
    log("\nTest 4: Resource Cleanup Verification");

    try {
        const allowedStore = new AllowedStore();
        const manager = new Manager({ allowedStore });

        // Create server
        const serverInfo = manager.createServer({
            seed: serverSeed,
            name: "Cleanup Test Server",
            targetPort: 8080,
            allowed: [],
        });

        await sleep(1000);

        const serverWrapper = manager.getServer(serverInfo.serviceKey);

        // Verify server exists
        if (serverWrapper && serverWrapper.server) {
            logSuccess("Server properly initialized");
        } else {
            logError("Server not properly initialized");
            return;
        }

        // Get reference to the actual server instance
        const serverInstance = serverWrapper.server;

        // Stop and verify cleanup
        await manager.stopServerById(serverInfo.serviceKey);
        await sleep(500);

        // Check if resources were cleaned up on the server instance
        if (serverInstance.server === null) {
            logSuccess("Server DHT server properly nullified");
        } else {
            logError("Server DHT server not properly cleaned up");
        }

        if (serverInstance.dht === null) {
            logSuccess("DHT properly nullified");
        } else {
            logError("DHT not properly cleaned up");
        }

        if (serverInstance.started === false) {
            logSuccess("Started flag properly set to false");
        } else {
            logError("Started flag not properly updated");
        }

        // Cleanup
        await manager.close();

    } catch (error) {
        logError(`Resource cleanup test failed: ${error.message}`);
        console.error(error);
    }
}

async function runAllTests() {
    log("=".repeat(60));
    log("TCP Client and Server Test Suite");
    log("=".repeat(60));

    await testServerStartStop();
    await sleep(2000); // Increased delay between tests

    await testClientStartStop();
    await sleep(3000); // Extra delay after client test for port cleanup

    await testMultipleStartStop();
    await sleep(2000);

    await testResourceCleanup();

    log("\n" + "=".repeat(60));
    log("Test Summary");
    log("=".repeat(60));
    log(`Tests Passed: ${testsPassed}`);
    log(`Tests Failed: ${testsFailed}`);
    log(`Total Tests: ${testsPassed + testsFailed}`);

    if (testsFailed === 0) {
        log("\n✓ All tests passed!");
        process.exit(0);
    } else {
        log("\n✗ Some tests failed!");
        process.exit(1);
    }
}

// Run tests
runAllTests().catch((error) => {
    console.error("Fatal error running tests:", error);
    process.exit(1);
});
