const { ONIRI_SERVER_NAME, ONIRI_CLIENT_NAME } = require("./constants");

const Oniri = require("./oniriBase");

class OniriServer extends Oniri {
  constructor(opts = {}) {
    opts.isServer = true;
    super(opts);
    // this.shouldrestart = true;
  }

  async onUpdate(info) {
    console.log("on -----update", info);
    if (info.msg.type === "connected") {
      console.log("seeeeeeeeeendingggggggg ----------------------");
      const remotePeer = info.msg.data;
      const rpcServer = this.getControlService();

      const res = await rpcServer.server.sendRequest(
        "getAllServices",
        { pipes: "adsada" },
        remotePeer
      );
      console.log("got============", res);

      // if (this.shouldrestart) {
      //   this.shouldrestart = false;
      //   const res1 = await rpcServer.server.sendRequest(
      //     "restartAllServices",
      //     { pipes: "adsada" },
      //     remotePeer
      //   );
      //   console.log("got restart============", res1);
      // }
    }
  }

  _rpc_OnStatusUpdate(params) {
    console.log("_rpcOnStatusUpdate", params);
    return "11111111";
  }

  getMethods() {
    return {
      ...super.getMethods(),
      statusUpdate: this._rpc_OnStatusUpdate.bind(this),
    };
  }
}

module.exports = OniriServer;
