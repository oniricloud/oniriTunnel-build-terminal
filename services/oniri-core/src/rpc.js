import RPC from 'bare-rpc'
import FramedStream from 'framed-stream'
import pipe from 'pear-pipe'
import { API } from './api'
import oniriService from './oniriService/oniriService.js'
import { setEncKey, getEncKey, delEncKey } from './oniriService/encKey.js'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { logger } from './logger/index.js'

// Global state
let rpc
let oniriServiceInstance = null
let oniriServiceInstanceInitialized = false
let serviceStartTime = null  // Track when service was started
let settings = {
  autoLaunch: false,
  autoStartDaemon: false
}

export const setupIPC = () => {
  const ipc = pipe()//Pear.worker.pipe() 

  ipc.on('close', async () => {
    // eslint-disable-next-line no-undef
    Bare.exit(0)
  })

  ipc.on('end', async () => {
    // eslint-disable-next-line no-undef
    Bare.exit(0)
  })

  return ipc
}



const handleRpcCommand = async (req) => {
  const data = req.data ? JSON.parse(req.data) : {};

  switch (req.command) {
    case API.TESTCOMMAND:
      logger.info('Test command received');
      req.reply(JSON.stringify({ data: 'Hello from oniri-core service!' }))
      break

    case API.START_ONIRI_SERVICE:
      try {
        if (!oniriServiceInstance) {
          logger.info('Starting Oniri service...');
          oniriServiceInstance = await oniriService(rpc);
          const isConfigured = oniriServiceInstance.isConfigured()

          if (!isConfigured) {
            logger.warn('No configuration found');
            req.reply(JSON.stringify({ data: { started: false, msg: 'No configuration found' } }))
            return
          }

          oniriServiceInstance.init()
          oniriServiceInstanceInitialized = true
          serviceStartTime = Date.now();
          req.reply(JSON.stringify({ data: { started: true } }))
        } else {
          if (!oniriServiceInstanceInitialized) {
            const isConfigured = oniriServiceInstance.isConfigured()

            if (!isConfigured) {
              logger.warn('No configuration found');
              req.reply(JSON.stringify({ data: { started: false, msg: 'No configuration found' } }))
              return
            }
            oniriServiceInstance.init()
            oniriServiceInstanceInitialized = true
            serviceStartTime = Date.now();
            req.reply(JSON.stringify({ data: { started: true } }))
          }
          logger.warn('Oniri service already running');
          req.reply(JSON.stringify({ data: { started: true } }))
        }
      } catch (error) {
        logger.error('Error starting Oniri service:', error);
        req.reply(JSON.stringify({ data: { started: false, error: error.message } }))
      }
      break

    case API.STOP_ONIRI_SERVICE:
      try {
        if (oniriServiceInstance) {
          logger.info('Stopping Oniri service...');
          // Properly close the Oniri client instance
          if (oniriServiceInstance.isInitialized) {
            await oniriServiceInstance.close();
          }
          oniriServiceInstance = null;
          serviceStartTime = null;
          req.reply(JSON.stringify({ data: { started: false } }))
        } else {
          logger.warn('Oniri service not running');
          req.reply(JSON.stringify({ data: { started: false } }))
        }
      } catch (error) {
        logger.error('Error stopping Oniri service:', error);
        req.reply(JSON.stringify({ error: error.message }))
      }
      break

    case API.RESTART_ONIRI_SERVICE:
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
        req.reply(JSON.stringify({ data: { started: true } }))
      } catch (error) {
        logger.error('Error restarting Oniri service:', error);
        req.reply(JSON.stringify({ data: { started: false, error: error.message } }))
      }
      break

    case API.GET_ONIRI_SERVICE_STATUS:
      req.reply(JSON.stringify({
        data: oniriServiceInstance ? 'running' : 'stopped'
      }))
      break

    case API.GET_STATUS:
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

        req.reply(JSON.stringify({
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
        }))
      } catch (error) {
        logger.error('Error getting status:', error);
        req.reply(JSON.stringify({ error: error.message }))
      }
      break

    case API.CONFIGURE:
      try {
        const { password, seed } = data;

        if (!password || !seed) {
          req.reply(JSON.stringify({
            error: 'Password and seed are required'
          }))
          return;
        }

        logger.info('Saving configuration...');

        // Save encryption key
        oniriServiceInstance = await oniriService(rpc);
        const res = await oniriServiceInstance.setConfiguration(password, seed);
        oniriServiceInstance.init()
        oniriServiceInstanceInitialized = true
        serviceStartTime = Date.now();

        if (!res) {
          req.reply(JSON.stringify({
            status: false,
            error: 'Failed to save configuration'
          }))
          return;
        }

        logger.info('Configuration saved successfully');
        req.reply(JSON.stringify({ data: { status: true } }))
      } catch (error) {
        logger.error('Error saving configuration:', error);
        req.reply(JSON.stringify({
          status: false,
          error: `Failed to save configuration: ${error.message}`
        }))
      }
      break

    case API.RESET_CONFIG:
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
        req.reply(JSON.stringify({ data: 'Configuration reset' }))
      } catch (error) {
        logger.error('Error resetting configuration:', error);
        req.reply(JSON.stringify({ error: error.message }))
      }
      break

    case API.GET_LOGS:
      try {
        const { logType } = data;
        const logsDir = path.join(os.homedir(), '.oniri', 'logs');
        const logFile = logType === 'error' ? 'error.log' : 'output.log';
        const logPath = path.join(logsDir, logFile);

        logger.info('Reading logs:', logPath);

        if (fs.existsSync(logPath)) {
          const logs = fs.readFileSync(logPath, 'utf8');
          req.reply(JSON.stringify({ logs }))
        } else {
          req.reply(JSON.stringify({
            logs: `No ${logType} logs found.\nLog file: ${logPath}`
          }))
        }
      } catch (error) {
        logger.error('Error reading logs:', error);
        req.reply(JSON.stringify({
          logs: `Error reading logs: ${error.message}`
        }))
      }
      break

    case API.SET_AUTO_LAUNCH:
      try {
        const { enabled: autoLaunchEnabled } = data;
        logger.info('Setting auto-launch:', autoLaunchEnabled);
        settings.autoLaunch = autoLaunchEnabled;

        // TODO: Implement OS-specific auto-launch
        // For macOS: Create/remove LaunchAgent plist
        // For Windows: Create/remove registry entry
        // For Linux: Create/remove .desktop file in autostart

        req.reply(JSON.stringify({ data: 'Auto-launch setting updated' }))
      } catch (error) {
        logger.error('Error setting auto-launch:', error);
        req.reply(JSON.stringify({ error: error.message }))
      }
      break

    case API.SET_AUTO_START_DAEMON:
      try {
        const { enabled: autoStartEnabled } = data;
        logger.info('Setting auto-start daemon:', autoStartEnabled);
        settings.autoStartDaemon = autoStartEnabled;
        req.reply(JSON.stringify({ data: 'Auto-start daemon setting updated' }))
      } catch (error) {
        logger.error('Error setting auto-start daemon:', error);
        req.reply(JSON.stringify({ error: error.message }))
      }
      break

    case API.GET_ALL_SERVICES:
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

        req.reply(JSON.stringify({
          data: {
            local: localServices,
            remote: remoteServices
          }
        }))
      } catch (error) {
        logger.error('Error getting services:', error);
        req.reply(JSON.stringify({ error: error.message }))
      }
      break

    case API.GET_ALLOWED_LIST:
      try {
        logger.info('Getting allowed list');

        let allowedList = {};

        if (oniriServiceInstance && oniriServiceInstance.isInitialized) {
          // Get actual allowed list from Oniri instance
          const allAllowedList = oniriServiceInstance.getServerAllowedList(serviceKey);

          allowedList = allAllowedList || {};
        }

        req.reply(JSON.stringify({
          data: allowedList
        }))
      } catch (error) {
        logger.error('Error getting allowed list:', error);
        req.reply(JSON.stringify({ error: error.message }))
      }
      break

    default:
      req.reply(JSON.stringify({ error: 'Unknown command' }))
  }
}

export const createRPC = (ipc) => {
  rpc = new RPC(new FramedStream(ipc), (req) => {
    try {
      return handleRpcCommand(req)
    } catch (error) {
      req.reply(
        JSON.stringify({
          error: `Unexpected error: ${error} `
        })
      )
    }
  })
  return rpc
}

  ; (async () => {
    try {
      //console.log(typeof Pear !== 'undefined')
      console.log('testing service app.js started')
      const ipc = setupIPC()
      rpc = createRPC(ipc)


    } catch (error) {
      console.error('Fatal error in app initialization:', error)
    }
  })()




export { rpc }

