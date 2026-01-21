import libKeys from "hyper-cmd-lib-keys";
import sodium from "sodium-universal";
import b4a from "b4a";
import fs from "fs";
import os from 'os';
import path from "path";
import net from "net";

import jsonfile from "./jsonfile/index.js";

// const encryptpwd = require('encrypt-with-password');

import { ONIRI_SERVER_NAME, ONIRI_CLIENT_NAME } from "./constants.js";

import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';


const isPortAvailable = async (port) => {
  const resPort = await new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(true));
    server.once("listening", () => {
      server.close();
      resolve(false);
    });

    server.listen(port, "0.0.0.0");
  });

  return !resPort;
}

function decryptString(encryptedString, password) {
  const encryptedData = Buffer.from(encryptedString, 'base64');

  // Extract nonce and ciphertext from the encrypted data
  const nonce = encryptedData.slice(0, nacl.secretbox.nonceLength);
  const encrypted = encryptedData.slice(nacl.secretbox.nonceLength);

  // Derive key from password
  const key = nacl.hash(naclUtil.decodeUTF8(password));
  const derivedKey = key.slice(0, nacl.secretbox.keyLength); // Ensure 32 bytes key size

  // Decrypt the message
  const decrypted = nacl.secretbox.open(encrypted, nonce, derivedKey);

  if (!decrypted) {
    throw new Error('Decryption failed. Invalid password or corrupted data.');
  }

  return naclUtil.encodeUTF8(decrypted);
}

const checkPassword = (value, pass) => {
  try {
    var res = decryptString(value, pass)
    return true
  } catch (e) {
    return false
  }
}

const generateSeed = () => {
  return libKeys.randomBytes(32).toString("hex");
};

const getKeypairFormSeed = (seed) => {
  const publicKey = b4a.alloc(32);
  const secretKey = b4a.alloc(64);
  sodium.crypto_sign_seed_keypair(
    publicKey,
    secretKey,
    Buffer.from(seed, "hex")
  );
  return { publicKey, secretKey };
};

const generateSeedAndKeys = (howmany) => {
  const generated = [];
  for (let n = 0; n < howmany; n++) {
    const seed = generateSeed();
    const keypair = getKeypairFormSeed(seed);
    generated.push({
      seed,
      keypair,
      seedStr: seed.toString("hex"),
      publicKeyStr: keypair.publicKey.toString("hex"),
    });
  }
  return generated;
};


const removeConfig = (dev = false, server = false, customPath = null) => {
  const userHomeDir = customPath || (dev ? "./" : os.homedir());
  const configFolderPath = ".oniri";
  const configFile = server ? "configServer.json" : "config.json";
  const configFolder = path.join(userHomeDir, configFolderPath);
  const configPath = path.join(configFolder, configFile);
  fs.rmSync(configPath, { recursive: true, force: true });
}

const generateConfig = (server = false) => {
  const keys = generateSeedAndKeys(1);
  const topicRpcCloud = Buffer.alloc(32).fill("oniriCloudRpc");

  const data = {
    services: {
      local: {},
      remote: {},
    },
  };
  if (server) {
    data.services.local[keys[0].publicKeyStr] = {
      name: ONIRI_SERVER_NAME,
      seed: keys[0].seedStr,
      topic: topicRpcCloud.toString("hex"),
      transport: "rpc",
      allowed: [],
    };
  } else {
    data.services.remote[keys[0].publicKeyStr] = {
      name: ONIRI_CLIENT_NAME,
      seed: keys[0].seedStr,
      topic: topicRpcCloud.toString("hex"),
      transport: "rpc",
    };
  }

  return data;
};


const hasConfig = (dev = false, server = false, customPath = null) => {

  const userHomeDir = customPath || (dev ? "./" : os.homedir());
  const configFolderPath = ".oniri";
  const configFile = server ? "configServer.json" : "config.json";
  const configFolder = path.join(userHomeDir, configFolderPath);
  const configPath = path.join(configFolder, configFile);
  if (!fs.existsSync(configFolder)) {
    return false
  } else {
    if (!fs.existsSync(configPath)) {
      return false
    }
  }
  return true
}

const generateConfigRemoteFromSeed = (seed = null, topicRpcCloud = null) => {
  if (seed === null) {
    return false
  }
  const keypair = getKeypairFormSeed(seed);
  const info = {
    seed,
    keypair,
    seedStr: seed,
    publicKeyStr: keypair.publicKey.toString("hex")
  }
  if (topicRpcCloud === null) {
    topicRpcCloud = Buffer.alloc(32).fill("oniriCloudRpc");
  }

  const data = {
    services: {
      local: {},
      remote: {},
    },
  };
  data.services.remote[info.publicKeyStr] = {
    name: ONIRI_CLIENT_NAME,
    seed: info.seedStr,
    topic: topicRpcCloud.toString("hex"),
    transport: "rpc",
  };

  return data;
};

const generateConfigForConnecting = (seed = null, topic = null, dev = false, server = false, customPath = null) => {
  if (seed === null) {
    return false
  }

  const userHomeDir = customPath || (dev ? "./" : os.homedir());
  const configFolderPath = ".oniri";
  const configFile = server ? "configServer.json" : "config.json";
  const configFolder = path.join(userHomeDir, configFolderPath);
  const configPath = path.join(configFolder, configFile);
  // console.log('configFolder', configFolder)
  if (!fs.existsSync(configFolder)) {
    fs.mkdirSync(configFolder);
    const data = generateConfigRemoteFromSeed(seed, topic);
    jsonfile.writeFileSync(configPath, data);
    return data;
  } else {
    if (!fs.existsSync(configPath)) {
      console.log("config file not found generating new one");
      const data = generateConfigRemoteFromSeed(seed, topic);
      jsonfile.writeFileSync(configPath, data);
      return data;
    } else {
      const data = jsonfile.readFileSync(configPath);
      console.log(data);
      return data;
    }
  }
}

const getConfig = (dev = false, server = false, customPath = null) => {

  const userHomeDir = customPath || (dev ? "./" : os.homedir());
  const configFolderPath = ".oniri";
  const configFile = server ? "configServer.json" : "config.json";
  const configFolder = path.join(userHomeDir, configFolderPath);
  const configPath = path.join(configFolder, configFile);
  if (!fs.existsSync(configFolder)) {
    fs.mkdirSync(configFolder);
    const data = generateConfig(server);
    jsonfile.writeFileSync(configPath, data);
    return data;
  } else {
    if (!fs.existsSync(configPath)) {
      console.log("config file not found generating new one");
      const data = generateConfig(server);
      jsonfile.writeFileSync(configPath, data);
      return data;
    } else {
      const data = jsonfile.readFileSync(configPath);
      // console.log(data); 
      return data;
    }
  }
};

const updateConfig = (data, dev = false, server = false, customPath = null) => {
  const userHomeDir = customPath || (dev ? "./" : os.homedir());
  const configFolderPath = ".oniri";
  const configFile = server ? "configServer.json" : "config.json";
  const configFolder = path.join(userHomeDir, configFolderPath);
  const configPath = path.join(configFolder, configFile);
  jsonfile.writeFileSync(configPath, data);
};

function getRandomPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}


const decrypt = (data, pass) => {
  try {
    if (data.length > 64) {
      const dData = decryptString(data, pass);
      return dData;
    } else {
      return data;
    }
  } catch (e) {
    return data;
  }
};


// const decrypt = (data,pass)=>{
//   try{
//     const dData = encryptpwd.decrypt(data,pass);
//     return dData
//   }catch(e){
//     return data
//   }
// }

export {
  hasConfig,
  generateSeed,
  getKeypairFormSeed,
  generateSeedAndKeys,
  getConfig,
  updateConfig,
  generateConfigForConnecting,
  removeConfig,
  decrypt,
  checkPassword,
  getRandomPort,
  isPortAvailable
};
