const Manager = require("../servicesManager");

const main = async () => {
  const managerService = new Manager();

  const clientSeed =
    "cdd14d13f5fe1e501ef836eb3b1abc253a54e421e9abcf0017959a88af1cd8a0";

  const peerToConnect =
    "bdccd8a69dbd56d5c95915a95f0308408d34e2e1941174a133c418dce09357ac"; // Service to connect . This is the public key of the above

  managerService.createClientUdp({
    seed: clientSeed,
    name: "Http Server",
    proxyPort: 3004,
    peerToConnect,
    // relayThrough: Buffer.from(
    //   "b9a5c817a6b9712d71f7191cf7cde25429bc5021b3949c5d616c6670d6e7400c",
    //   "hex"
    // ),
  });
};

main();
