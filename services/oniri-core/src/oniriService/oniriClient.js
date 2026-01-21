import { Oniri } from "../oniri-client/index.js";
import { logger } from '../logger/index.js'
import { getEncKey, setEncKey } from './encKey.js'

class OniriClient extends Oniri {
  constructor(opts = {}) {
    opts.isServer = false;
    super(opts);
    this.onOniriMessage = opts.onOniriMessage.bind(this) || this.noOp()
    this.shouldPing = false;
    this.isPinging = false;
    this.encKey = null
  }

  noOp() { }

  setEncKey(encKey) {
    this.encKey = encKey
  }

  isConfigured() {
    const encData = getEncKey()
    const configData = this.checkConfig()
    if (!!configData && !!encData.encKey) {
      this.setEncKey(encData.encKey)
      return true
    }
    return false
  }

  startServices() {
    this.startAllowedStore();
    this.startServiceManager();
    if (this.checkConfig()) {
      this.startConfig();
      this.populateServices();
      this.onUpdate({ service: { name: "oniriStarted" }, msg: {} })

    } else {
      logger.info('need to notify the client that there is no config')
      this.onUpdate({ service: { name: "no-config" }, msg: { type: "error" } })
    }
  }



  async onUpdate(info) {
    logger.info("onUpdate", info);
    this.onOniriMessage(info)
    // if the client
    // if (rpcClient && rpcClient?.client.connected) {
    //   console.log("--------------connected");
    //   const rpcClient = this.servicesManager.getServer(info.service.serviceKey);
    //   const res = await rpcClient.client.sendRequest(
    //     "echo",
    //     { pipes: "adsada" },
    //     remotePeer
    //   );
    //   console.log("got============", res);
    // }

    if (info.service.name === "cloudClient" && info.msg.type === "connected") {
      // console.log();
      // const rpcClient = this.getControlService();
      // const res = await rpcClient.client.sendRequest(
      //   "getClientConfig",
      //   { pipes: "adsada" },
      //   info.msg.data
      // );
      // console.log("got============", res);
      // this.updateAllServices(res);

      await this.getLatestConfig(info.service.serviceKey);
      // if (!this.shouldPing) {
      //   this.shouldPing = true;
      //   await this.startPing(info.service.serviceKey);
      // }
    }

    if (
      info.service.name === "cloudClient" &&
      info.msg.type === "disconnected"
    ) {
      this.shouldPing = false;
    }
  }

  async setConfiguration(password, seed) {
    try {
      if (password === null || seed === null) {
        return false
      }
      await this.removeConfig()
      const resSetEncKey = setEncKey({ encKey: password }, false, false);
      if (!resSetEncKey) {
        return false
      }
      this.setEncKey(password);
      const config = this.generateConfigForCloud(seed)
      return true
    }
    catch (e) {
      logger.error("error setting configuration", e);
      return false
    }
  }



  async startPing(serviceId) {
    if (this.shouldPing && !this.isPinging) {
      try {
        this.isPinging = true;
        const rpcClient = this.getControlService();
        const res = await rpcClient.client.sendRequest(
          "ping",
          {},
          serviceId || null
        );
        logger.info("ping response", res);
        await new Promise((res) => {
          setTimeout(res, 10000);
        });
        this.isPinging = false;
        this.startPing(serviceId);
      } catch (e) {
        logger.error("error pinging", e);
        this.shouldPing = false;
      }
    }
  }

  _rpc_getAllServices() {
    const services = this.getAllServices();
    return services;
  }

  _rpc_restartAllServices() {
    this.servicesManager.restartAllServices();
    return true;
  }

  _rpc_updateConfig() {
    logger.info("updateConfig");
    return true;
  }

  async getLatestConfig(serviceId) {
    const rpcClient = this.getControlService();
    const res = await rpcClient.client.sendRequest(
      "getClientConfig",
      {},
      serviceId || null
    );
    await this.updateAllServices(res);
    logger.info('getLatestConfig updateAllServices')
    this.onUpdate({ service: { name: "updateLatestConf" }, msg: {} })
  }

  async _rpc_nofifyOfUpdate(a, b) {
    logger.info("_rpc_nofifyOfUpdate", a, b);
    await this.getLatestConfig();
    return true;
  }

  getMethods() {
    return {
      ...super.getMethods(),
      getAllServices: this._rpc_getAllServices.bind(this),
      restartAllServices: this._rpc_restartAllServices.bind(this),
      updateConfig: this._rpc_updateConfig.bind(this),
      nofifyOfUpdate: this._rpc_nofifyOfUpdate.bind(this),
    };
  }
}

export default OniriClient;
