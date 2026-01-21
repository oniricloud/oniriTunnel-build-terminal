const HyperDHT = require("hyperdht");

const serverSeed = "1abe20c841aaece99de215a52ee8501b1b450f183834e231e2d2fb87d5dd12cf";
const clientSeed = "cdd14d13f5fe1e501ef836eb3b1abc253a54e421e9abcf0017959a88af1cd8a0";

const serverKeyPair = HyperDHT.keyPair(Buffer.from(serverSeed, "hex"));
const clientKeyPair = HyperDHT.keyPair(Buffer.from(clientSeed, "hex"));

console.log("Server Public Key (Generated):", serverKeyPair.publicKey.toString("hex"));
console.log("Client Public Key (Generated):", clientKeyPair.publicKey.toString("hex"));

const expectedServerKey = "bdccd8a69dbd56d5c95915a95f0308408d34e2e1941174a133c418dce09357ac";
const expectedClientKey = "c52d88563a809b7b953383590c5e6fdd214ca8a5fa6a5e902ca8cfba4d4e5cd0";

console.log("Server Key Matches Expected:", serverKeyPair.publicKey.toString("hex") === expectedServerKey);
console.log("Client Key Matches Expected:", clientKeyPair.publicKey.toString("hex") === expectedClientKey);
