const net = require("net");
const Manager = require("../servicesManager");
const goodbye = require("graceful-goodbye");
const AllowedStore = require("../allowedStore");

const SINK_PORT = 8081;
const PROXY_PORT = 3004;
const DATA_SIZE_MB = 100;
const CHUNK_SIZE = 256 * 1024; // 256KB (larger chunks reduce syscalls)

const serverSeed = "1abe20c841aaece99de215a52ee8501b1b450f183834e231e2d2fb87d5dd12cf";
const clientSeed = "cdd14d13f5fe1e501ef836eb3b1abc253a54e421e9abcf0017959a88af1cd8a0";
const clientPublicKey = "c52d88563a809b7b953383590c5e6fdd214ca8a5fa6a5e902ca8cfba4d4e5cd0";
const serverPublicKey = "bdccd8a69dbd56d5c95915a95f0308408d34e2e1941174a133c418dce09357ac";

const main = async () => {
    console.log(`Starting TCP Speed Test (${DATA_SIZE_MB} MB)...`);

    // 1. Start Sink Server
    let bytesReceived = 0;
    let startTime = 0;
    const sinkServer = net.createServer((socket) => {
        // Reduce latency
        socket.setNoDelay(true);

        socket.on("data", (chunk) => {
            if (bytesReceived === 0) startTime = Date.now();
            bytesReceived += chunk.length;
        });
        socket.on("end", () => {
            const duration = (Date.now() - startTime) / 1000;
            const speed = (bytesReceived / 1024 / 1024) / duration;
            const speedMbps = speed * 8;
            const speedGbps = speedMbps / 1000;
            console.log(`Received ${bytesReceived} bytes in ${duration.toFixed(2)}s`);
            console.log(`Speed: ${speed.toFixed(2)} MB/s`);
            console.log(`Speed: ${speedMbps.toFixed(2)} Mbps`);
            console.log(`Speed: ${speedGbps.toFixed(4)} Gbps`);
        });
    });
    sinkServer.listen(SINK_PORT, () => {
        console.log(`Sink server listening on ${SINK_PORT}`);
    });

    // 2. Start Tunnel Server
    const allowedStore = new AllowedStore();
    const serverManager = new Manager({ allowedStore });
    const serverInfo = serverManager.createServer({
        seed: serverSeed,
        name: "Speed Test Server",
        targetPort: SINK_PORT,
    });
    serverManager.startServerById(serverInfo.serviceKey);

    // Allow the client
    setTimeout(() => {
        serverManager.setServerAllowedList(serverInfo.serviceKey, [clientPublicKey]);
    }, 500);

    // 3. Start Tunnel Client
    const clientManager = new Manager();
    const clientInfo = clientManager.createClient({
        seed: clientSeed,
        name: "Speed Test Client",
        proxyPort: PROXY_PORT,
        peerToConnect: serverPublicKey,
    });
    clientManager.startClientById(clientInfo.serviceKey);

    // 4. Start Source Client (Generator)
    setTimeout(() => {
        console.log("Starting data transmission...");
        const socket = net.connect(PROXY_PORT, "127.0.0.1", () => {
            // Reduce latency
            socket.setNoDelay(true);

            let bytesSent = 0;
            const totalBytes = DATA_SIZE_MB * 1024 * 1024;
            const buffer = Buffer.alloc(CHUNK_SIZE, "a");

            const send = () => {
                while (bytesSent < totalBytes) {
                    const canContinue = socket.write(buffer);
                    bytesSent += buffer.length;
                    if (!canContinue) {
                        socket.once("drain", send);
                        return;
                    }
                }
                socket.end();
                console.log("Finished sending data.");
            };
            send();
        });
    }, 2000); // Wait for tunnel to establish

    goodbye(async () => {
        await serverManager.close();
        await clientManager.close();
        sinkServer.close();
    });
};

main();
