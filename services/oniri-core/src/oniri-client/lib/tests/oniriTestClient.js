const Oniri = require("../oniriClient");
const goodbye = require("graceful-goodbye");
// console.log = () => {};

const main = async () => {
  const app = new Oniri({ devMode: true });
  app.init();

  goodbye(async () => {
    await app.close();
  });
};

main();
