import Oniri from './oniriClient.js'
import goodbye from 'graceful-goodbye';
import { getEncKey } from './encKey.js'
import { logger } from '../logger/index.js'
import { API } from '../api.js'


let app = null

const main = async (rpc) => {


  if (app) {
    return app
  }

  const sendNotification = async (message) => {
    try {
      //const req = rpc.request(API.SEND_NOTIFICATION)
      //req.send(JSON.stringify(message))
      logger.info('Notification sent via RPC', { message });
    } catch (error) {
      logger.error('Error sending notification via RPC', { error });
    }
  }

  const onOniriMessage = (info) => {
    if (info.service.name === "no-config") {
      logger.warn('No configuration found', { service: info.service.name });
    }
    if (info.service.name === "updateLatestConf") {
      logger.info('Configuration updated', { service: info.service.name });
    }
    if (info.service.name === "oniriStarted") {
      logger.info('Oniri started', { service: info.service.name });
    }

    sendNotification(info);
  }

  app = new Oniri({ devMode: false, onOniriMessage })



  goodbye(async () => {
    if (app.isInitialized) {
      logger.info('Shutting down Oniri client...');
      await app.close()
      logger.info('Oniri client closed successfully');
    }
  })


  return app

}

export default main;
