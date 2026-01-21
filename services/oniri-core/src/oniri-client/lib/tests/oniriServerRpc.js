const Manager = require("../servicesManager");
const goodbye = require("graceful-goodbye");
const AllowedStore = require("../allowedStore");
// console.log = () => {};

const main = async () => {
  const managerService = new Manager({ allowedStore: new AllowedStore() });

  const serverSeed =
    "1abe20c841aaece99de215a52ee8501b1b450f183834e231e2d2fb87d5dd12cf";

  const info = managerService.createServerRpc({
    seed: serverSeed,
    name: "Http Server",
    targetPort: 8080,
    allowed: [
      "c52d88563a809b7b953383590c5e6fdd214ca8a5fa6a5e902ca8cfba4d4e5cd0",
    ],
  });

  managerService.startServerById(info.serviceKey);

  // const allowed = [
  //   "c52d88563a809b7b953383590c5e6fdd214ca8a5fa6a5e902ca8cfba4d4e5cd0",
  // ];

  // setTimeout(() => {
  //   console.log("setting allowed");
  //   managerService.setServerAllowedList(info.serviceKey, allowed);
  // }, 0)

  console.log(info);

  goodbye(async () => {
    await managerService.close();
  });
};

main();
