const Manager = require("../servicesManager");

const main = async () => {
  const managerService = new Manager();

  const serverSeed =
    "1abe20c841aaece99de215a52ee8501b1b450f183834e231e2d2fb87d5dd12cf";

  const info = managerService.createServerUdp({
    seed: serverSeed,
    name: "Http Server",
    targetPort: 2222,
  });

  console.log(info);
};

main();
