const Oniri = require("../oniriBase");

const main = async () => {
  const app = new Oniri({ devMode: true });
  app.init();
};

main();
