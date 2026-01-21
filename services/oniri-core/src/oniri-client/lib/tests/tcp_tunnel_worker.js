// Worker script for a single tunnel client and source
const net = require('net');
const Manager = require('../servicesManager');

const clientSeed = 'cdd14d13f5fe1e501ef836eb3b1abc253a54e421e9abcf0017959a88af1cd8a0';
const serverPublicKey = 'bdccd8a69dbd56d5c95915a95f0308408d34e2e1941174a133c418dce09357ac';

// arguments: proxyPort, dataSizeMb, chunkSize
const [proxyPortArg, dataSizeMbArg, chunkSizeArg] = process.argv.slice(2);
const proxyPort = parseInt(proxyPortArg, 10) || 9000;  // Default: 9000
const DATA_SIZE_MB = parseInt(dataSizeMbArg, 10) || 10;  // Default: 10 MB
const CHUNK_SIZE = parseInt(chunkSizeArg, 10) || 65536;  // Default: 64KB

(async () => {
    const clientMgr = new Manager();
    const clientInfo = clientMgr.createClient({
        seed: clientSeed,
        name: `Worker Client ${proxyPort}`,
        proxyPort,
        peerToConnect: serverPublicKey,
    });
    clientMgr.startClientById(clientInfo.serviceKey);

    // give the tunnel a moment to establish
    await new Promise(res => setTimeout(res, 2000));

    const socket = net.connect(proxyPort, '127.0.0.1', () => {
        socket.setNoDelay(true);
        let bytesSent = 0;
        const totalBytes = DATA_SIZE_MB * 1024 * 1024;
        const buffer = Buffer.alloc(CHUNK_SIZE, 'a');
        const send = () => {
            while (bytesSent < totalBytes) {
                const ok = socket.write(buffer);
                bytesSent += buffer.length;
                if (!ok) {
                    socket.once('drain', send);
                    return;
                }
            }
            socket.end();
        };
        send();
    });

    socket.on('close', async () => {
        await clientMgr.close();
        process.exit(0);
    });
})();
