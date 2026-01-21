/** @typedef {import('pear-interface')} */ /* global Pear */
import { isBare, platform, arch, isWindows, isLinux } from 'which-runtime'
import goodbye from 'graceful-goodbye'

// import pearRun from 'pear-run'

// import IPC from 'bare-ipc'
import IPC from 'pear-ipc'
import FramedStream from 'framed-stream'

import RPC from 'bare-rpc'
import path from 'bare-path'
import pipe from "bare-pipe"
import fs from 'bare-fs'
import os from 'bare-os'

import oniriService from '../services/oniri-core/src/oniriService/oniriService.js'
import { setEncKey, getEncKey, delEncKey } from '../services/oniri-core/src/oniriService/encKey.js'
import { logger } from '../services/oniri-core/src/logger/index.js'

// const { versions } = Pear
console.log('Pear terminal application running')
// console.log(await versions())

const SOCKET_PATH = isWindows
    ? '\\\\.\\pipe\\my-bare-pipe'
    : '/tmp/my-bare-pipe.sock';


// Global state
let rpc
let oniriServiceInstance = null
let oniriServiceInstanceInitialized = false
let serviceStartTime = null  // Track when service was started
let settings = {
    autoLaunch: false,
    autoStartDaemon: false
}


const methods = [
     { id: 102, name: 'START_ONIRI_SERVICE'},
     { id: 103, name: 'STOP_ONIRI_SERVICE' },
     { id: 104, name: 'GET_ONIRI_SERVICE_STATUS' },
     { id: 105, name: 'SEND_NOTIFICATION'},
    { id: 106, name: 'RESTART_ONIRI_SERVICE'},
    { id: 107, name: 'GET_STATUS'},
    { id: 108, name: 'CONFIGURE'},
    { id: 109, name: 'RESET_CONFIG'},
    { id: 110, name: 'GET_LOGS'},
    { id: 111, name: 'SET_AUTO_LAUNCH'},
    { id: 112, name: 'SET_AUTO_START_DAEMON'},
    { id: 113, name: 'GET_ALL_SERVICES'},
    { id: 114, name: 'GET_ALLOWED_LIST'},
]


const handleRpcCommand = {

    START_ONIRI_SERVICE: async (data) => {
        try {
            if (!oniriServiceInstance) {
                logger.info('Starting Oniri service...');
                oniriServiceInstance = await oniriService(rpc);
                const isConfigured = oniriServiceInstance.isConfigured()

                if (!isConfigured) {
                    logger.warn('No configuration found');
                    return JSON.stringify({ data: { started: false, msg: 'No configuration found' } })
                    return
                }

                oniriServiceInstance.init()
                oniriServiceInstanceInitialized = true
                serviceStartTime = Date.now();
                return JSON.stringify({ data: { started: true } })
            } else {
                if (!oniriServiceInstanceInitialized) {
                    const isConfigured = oniriServiceInstance.isConfigured()

                    if (!isConfigured) {
                        logger.warn('No configuration found');
                        return JSON.stringify({ data: { started: false, msg: 'No configuration found' } })
                        return
                    }
                    oniriServiceInstance.init()
                    oniriServiceInstanceInitialized = true
                    serviceStartTime = Date.now();
                    return JSON.stringify({ data: { started: true } })
                }
                logger.warn('Oniri service already running');
                return JSON.stringify({ data: { started: true } })
            }
        } catch (error) {
            logger.error('Error starting Oniri service:', error);
            return JSON.stringify({ data: { started: false, error: error.message } })
        }
    },


    STOP_ONIRI_SERVICE: async (data) => {
        try {
            if (oniriServiceInstance) {
                logger.info('Stopping Oniri service...');
                // Properly close the Oniri client instance
                if (oniriServiceInstance.isInitialized) {
                    await oniriServiceInstance.close();
                }
                oniriServiceInstance = null;
                serviceStartTime = null;
                return JSON.stringify({ data: { started: false } })
            } else {
                logger.warn('Oniri service not running');
                return JSON.stringify({ data: { started: false } })
            }
        } catch (error) {
            logger.error('Error stopping Oniri service:', error);
            return JSON.stringify({ error: error.message })
        }
    },


    RESTART_ONIRI_SERVICE: async (data) => {
        try {
            logger.info('Restarting Oniri service...');
            // Close existing instance if running
            if (oniriServiceInstance && oniriServiceInstance.isInitialized) {
                await oniriServiceInstance.close();
            }
            oniriServiceInstance = null;
            serviceStartTime = null;
            // Start new instance
            oniriServiceInstance = await oniriService(rpc);
            oniriServiceInstance.init()
            oniriServiceInstanceInitialized = true

            serviceStartTime = Date.now();
            return JSON.stringify({ data: { started: true } })
        } catch (error) {
            logger.error('Error restarting Oniri service:', error);
            return JSON.stringify({ data: { started: false, error: error.message } })
        }
    },

    GET_ONIRI_SERVICE_STATUS: async (data) => {
        return JSON.stringify({
            data: oniriServiceInstance ? 'running' : 'stopped'
        })
    },


    GET_STATUS: async (data) => {
        try {
            const encData = getEncKey();
            const configured = !!encData.encKey;

            // Get actual services if instance is running
            let servicesData = { local: {}, remote: {} };
            if (oniriServiceInstance && oniriServiceInstance.isInitialized) {
                const localServices = oniriServiceInstance.getLocalServices();
                const remoteServices = oniriServiceInstance.getRemoteServices();
                servicesData = oniriServiceInstance.getAllServices()
            }

            return JSON.stringify({
                data: {
                    daemon: {
                        status: 'online',
                        pid: Bare.pid || 0,
                        uptime: Date.now()
                    },
                    service: {
                        status: oniriServiceInstance ? 'online' : 'offline',
                        uptime: serviceStartTime || null
                    },
                    configured,
                    services: servicesData,
                    autoLaunch: settings.autoLaunch,
                    autoStartDaemon: settings.autoStartDaemon
                }
            })
        } catch (error) {
            logger.error('Error getting status:', error);
            return JSON.stringify({ error: error.message })
        }
    },

    CONFIGURE: async (data) => {
        try {
            const { password, seed } = data;

            if (!password || !seed) {
                return JSON.stringify({
                    error: 'Password and seed are required'
                })

            }

            logger.info('Saving configuration...');

            // Save encryption key
            oniriServiceInstance = await oniriService(rpc);
            const res = await oniriServiceInstance.setConfiguration(password, seed);
            oniriServiceInstance.init()
            oniriServiceInstanceInitialized = true
            serviceStartTime = Date.now();

            if (!res) {
                return JSON.stringify({
                    status: false,
                    error: 'Failed to save configuration'
                })
            }

            logger.info('Configuration saved successfully');
            return JSON.stringify({ data: { status: true } })
        } catch (error) {
            logger.error('Error saving configuration:', error);
            return JSON.stringify({
                status: false,
                error: `Failed to save configuration: ${error.message}`
            })
        }
    },


    RESET_CONFIG: async (data) => {
        try {
            logger.info('Resetting configuration...');

            if (oniriServiceInstance && oniriServiceInstance.isInitialized) {
                await oniriServiceInstance.close();
            }
            oniriServiceInstance = null;
            serviceStartTime = null;

            // Delete encryption key
            delEncKey(false, false);

            // Delete config.json if it exists
            const configPath = path.join(os.homedir(), '.oniri', 'config.json');
            if (fs.existsSync(configPath)) {
                fs.unlinkSync(configPath);
            }

            logger.info('Configuration reset successfully');
            return JSON.stringify({ data: 'Configuration reset' })
        } catch (error) {
            logger.error('Error resetting configuration:', error);
            return JSON.stringify({ error: error.message })
        }

    },
    GET_LOGS: async (data) => {
        try {
            const { logType } = data;
            const logsDir = path.join(os.homedir(), '.oniri', 'logs');
            const logFile = logType === 'error' ? 'error.log' : 'output.log';
            const logPath = path.join(logsDir, logFile);

            logger.info('Reading logs:', logPath);

            if (fs.existsSync(logPath)) {
                const logs = fs.readFileSync(logPath, 'utf8');
                return JSON.stringify({ logs })
            } else {
                return JSON.stringify({
                    logs: `No ${logType} logs found.\nLog file: ${logPath}`
                })
            }
        } catch (error) {
            logger.error('Error reading logs:', error);
            return JSON.stringify({
                logs: `Error reading logs: ${error.message}`
            })
        }
    },


    SET_AUTO_LAUNCH: async (data) => {
        try {
            const { enabled: autoLaunchEnabled } = data;
            logger.info('Setting auto-launch:', autoLaunchEnabled);
            settings.autoLaunch = autoLaunchEnabled;

            // TODO: Implement OS-specific auto-launch
            // For macOS: Create/remove LaunchAgent plist
            // For Windows: Create/remove registry entry
            // For Linux: Create/remove .desktop file in autostart

            return JSON.stringify({ data: 'Auto-launch setting updated' })
        } catch (error) {
            logger.error('Error setting auto-launch:', error);
            return JSON.stringify({ error: error.message })
        }
    },

    SET_AUTO_START_DAEMON: async (data) => {
        try {
            const { enabled: autoStartEnabled } = data;
            logger.info('Setting auto-start daemon:', autoStartEnabled);
            settings.autoStartDaemon = autoStartEnabled;
            return JSON.stringify({ data: 'Auto-start daemon setting updated' })
        } catch (error) {
            logger.error('Error setting auto-start daemon:', error);
            return JSON.stringify({ error: error.message })
        }
    },

    GET_ALL_SERVICES: async (data) => {
        try {
            logger.info('Getting all services');

            let localServices = {};
            let remoteServices = {};

            if (oniriServiceInstance && oniriServiceInstance.isInitialized) {
                // Get actual services from Oniri instance
                const allLocalServices = oniriServiceInstance.getLocalServices();
                const allRemoteServices = oniriServiceInstance.getRemoteServices();

                localServices = allLocalServices || {};
                remoteServices = allRemoteServices || {};
            }

            return JSON.stringify({
                data: {
                    local: localServices,
                    remote: remoteServices
                }
            })

        } catch (error) {
            logger.error('Error getting services:', error);
            return JSON.stringify({ error: error.message })
        }
    },


    GET_ALLOWED_LIST: async (data) => {
        try {
            logger.info('Getting allowed list');

            let allowedList = {};

            if (oniriServiceInstance && oniriServiceInstance.isInitialized) {
                // Get actual allowed list from Oniri instance
                const allAllowedList = oniriServiceInstance.getServerAllowedList(serviceKey);

                allowedList = allAllowedList || {};
            }

            return JSON.stringify({
                data: allowedList
            })
        } catch (error) {
            logger.error('Error getting allowed list:', error);
            return JSON.stringify({ error: error.message })
        }
    }


}







export const start = async () => {
    const server = new IPC.Server({
        socketPath: SOCKET_PATH,
        methods,
        handlers: handleRpcCommand
    })

    server.on('close', () => {
        console.log('IPC server closed')
    })

    await server.ready()




    const api = {
        startOniri(method) {
            return async (params) => {
                const result = await method.request(params)
                console.log('IPC START_ONIRI_SERVICE result:', result)
                return result
            }
        }
    }

    const client = new IPC.Client({
        socketPath: SOCKET_PATH,
        methods,
        api,
        connect: true
    })

    await client.ready()


    const res = await client.START_ONIRI_SERVICE({ result: 'good' })
    console.log('IPC response:', res)

     await client.close()

 goodbye(async () => {

    console.log('Shutting down IPC client and server...')
    await oniriServiceInstance?.close()
   
    await server.close()
  })

}


start()