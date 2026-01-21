const { ONIRI_SERVER_NAME, ONIRI_CLIENT_NAME } = require("./constants");

const Oniri = require("./oniriBase");

class OniriClient extends Oniri {
  constructor(opts = {}) {
    opts.isServer = false;
    super(opts);
  }

  async onUpdate(info) {
    const rpcClient = this.getControlService();
    // if the client
    if (rpcClient && rpcClient?.client.connected) {
      const rpcClient = this.servicesManager.getServer(info.service.serviceKey);
      const res = await rpcClient.client.sendRequest(
        "echo",
        { pipes: "adsada" },
        remotePeer
      );
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

  getMethods() {
    return {
      ...super.getMethods(),
      getAllServices: this._rpc_getAllServices.bind(this),
      restartAllServices: this._rpc_restartAllServices.bind(this),
    };
  }
}

module.exports = OniriClient;
