import fs from "fs";
import os from 'os';
import path from "path";

import jsonfile from "../oniri-client/lib/jsonfile/index.js";
import { logger } from '../logger/index.js'

const geEncPath = (dev = false, server = false, customPath = null) => {
    // logger.info("geEncPath =========server", server);
    const userHomeDir = customPath || (dev ? "./" : os.homedir());
    const configFolderPath = ".oniri";
    const configFile = server ? "encpServ.json" : "encp.json";
    const configFolder = path.join(userHomeDir, configFolderPath);
    const configPath = path.join(configFolder, configFile);
    return { configFolder, configPath }
}

const setEncKey = (data, dev = false, server = false, customPath = null) => {
    try {
        const paths = geEncPath(dev, server, customPath)
        if (!fs.existsSync(paths.configFolder)) {
            fs.mkdirSync(paths.configFolder);
        }
        jsonfile.writeFileSync(paths.configPath, data);
        return true
    } catch (e) {
        logger.error('error', e)
        return false
    }
}

const getEncKey = (dev = false, server = false, customPath = null) => {
    const paths = geEncPath(dev, server, customPath)
    // logger.info('paths getEncKey', paths)
    if (!fs.existsSync(paths.configFolder)) {
        return {}
    } else {
        if (fs.existsSync(paths.configPath)) {
            const data = jsonfile.readFileSync(paths.configPath);
            return data
        } else {
            return {}
        }
    }
}

const delEncKey = (dev = false, server = false, customPath = null) => {
    const paths = geEncPath(dev, server, customPath)
    fs.rmSync(paths.configPath, { recursive: true, force: true });
}

export {
    setEncKey,
    delEncKey,
    getEncKey,
};