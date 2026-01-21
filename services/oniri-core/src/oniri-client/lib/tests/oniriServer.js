const Manager = require("../servicesManager");
const goodbye = require("graceful-goodbye");
const AllowedStore = require("../allowedStore");
// console.log = () => {};

const main = async () => {

  const allowedStore = new AllowedStore();
  const managerService = new Manager({ allowedStore });

  const serverSeed =
    "1abe20c841aaece99de215a52ee8501b1b450f183834e231e2d2fb87d5dd12cf";

  const clientPublicKey = "c52d88563a809b7b953383590c5e6fdd214ca8a5fa6a5e902ca8cfba4d4e5cd0";

  const info = managerService.createServer({
    seed: serverSeed,
    name: "Http Server",
    targetPort: 8080,
    //allowed: [clientPublicKey],
  });

  managerService.startServerById(info.serviceKey);

  setTimeout(() => {
    console.log("setting allowed");
    const allowed = [
      "c52d88563a809b7b953383590c5e6fdd214ca8a5fa6a5e902ca8cfba4d4e5cd0",
    ];
    managerService.setServerAllowedList(info.serviceKey, allowed);

    // setTimeout(async () => {
    //   console.log("closing allll =========================================");
    //   await managerService.close();
    // }, 10000);

    // setTimeout(() => {
    //   console.log("clossing =========================================");
    //   managerService.stopServerById(info.serviceKey);

    //   setTimeout(() => {
    //     console.log("starting =========================================");
    //     managerService.startServerById(info.serviceKey);
    //   }, 10000);
    // }, 10000);
  }, 0);

  console.log(info);

  goodbye(async () => {
    await managerService.close();
  });
};

main();
