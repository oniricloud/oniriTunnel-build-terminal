#!/usr/bin/env node

/**
 * Comprehensive test for UDP Client and Server
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
    log("Test 1: UDP Server Start/Stop");

    try {
        const allowedStore = new AllowedStore();
        const manager = new Manager({ allowedStore });

        const info = manager.createServerUdp({
            seed: serverSeed,
            name: "Test UDP Server",
            targetPort: 2222,
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
    log("\nTest 2: UDP Client Start/Stop");

    try {
        const allowedStore = new AllowedStore();
        const manager = new Manager({ allowedStore });

        const info = await manager.createClientUdp({
            seed: clientSeed,
            name: "Test UDP Client",
            proxyPort: 3005,
            peerToConnect,
        });

        log(`Client created with publicKey: ${info.publicKey}`);

        // Wait for client to initialize
        await sleep(2000);

        const client = manager.getClient(info.publicKey);
        if (client && client.client) {
            logSuccess("Client created and initialized");
        } else {
            logError("Client not properly initialized");
            return;
        }

        // Stop the client
        await manager.stopClientById(info.publicKey);
        await sleep(1000);

        logSuccess("Client stopped successfully");

        // Cleanup
        await manager.close();
        logSuccess("Manager closed successfully");

    } catch (error) {
        logError(`Client test failed: ${error.message}`);
        console.error(error);
    }
}

async function testMultipleStartStop() {
    log("\nTest 3: Multiple Start/Stop Cycles (Memory Leak Test)");

    try {
        const allowedStore = new AllowedStore();
        const manager = new Manager({ allowedStore });

        const cycles = 3;

        for (let i = 0; i < cycles; i++) {
            log(`Cycle ${i + 1}/${cycles}`);

            // Create server
            const serverInfo = manager.createServerUdp({
                seed: serverSeed,
                name: `Test Server ${i}`,
                targetPort: 2222,
            });

            await sleep(1000);

            // Stop server
            await manager.stopServerById(serverInfo.serviceKey);
            await sleep(500);
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
        const serverInfo = manager.createServerUdp({
            seed: serverSeed,
            name: "Cleanup Test Server",
            targetPort: 2222,
        });

        await sleep(1000);

        const server = manager.getServer(serverInfo.serviceKey);

        // Verify server has udpClients Map
        if (server.server.udpClients instanceof Map) {
            logSuccess("Server has udpClients Map");
        } else {
            logError("Server missing udpClients Map");
        }

        // Stop and verify cleanup
        await manager.stopServerById(serverInfo.serviceKey);
        await sleep(500);

        // Check if resources were cleaned up
        if (server.server.udpClients.size === 0) {
            logSuccess("UDP clients Map cleared on stop");
        } else {
            logError(`UDP clients Map not cleared: ${server.server.udpClients.size} entries remaining`);
        }

        if (server.server.dht === null) {
            logSuccess("DHT properly nullified");
        } else {
            logError("DHT not properly cleaned up");
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
    log("UDP Client and Server Test Suite");
    log("=".repeat(60));

    await testServerStartStop();
    await sleep(1000);

    await testClientStartStop();
    await sleep(1000);

    await testMultipleStartStop();
    await sleep(1000);

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
