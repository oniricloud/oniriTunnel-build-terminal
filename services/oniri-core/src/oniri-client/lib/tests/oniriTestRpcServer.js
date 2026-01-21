const Oniri = require("../oniriBase");

const main = async () => {
  const app = new Oniri({ devMode: true });
  app.init();
  const localInfo = app.createLocalRpcService({
    name: "Rpc Server",
    topic: Buffer.alloc(32).fill("oniriCloudRpc").toString("hex"),
    allowed: [], // service
  });

  console.log(localInfo);

  app.startLocalServiceById(localInfo.serviceKey);

  const remoteInfo = app.createRemoteRpcService({
    name: "Remote rpc",
    topic: Buffer.alloc(32).fill("oniriCloudRpc").toString("hex"),
  });

  console.log(remoteInfo);
  app.startRemoteServiceById(remoteInfo.serviceKey);
};

main();
