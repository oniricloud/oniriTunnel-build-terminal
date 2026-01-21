import Client from "./serviceClients/client.js";
import Server from "./serviceClients/server.js";
import ClientRpc from "./serviceClients/clientRpc.js";
import ServerRpc from "./serviceClients/serverRpc.js";
import ClientUdp from "./serviceClients/clientUdp.js";
import ServerUdp from "./serviceClients/serverUdp.js";
import HyperDHT from "hyperdht";
import { logger } from "../../logger";

class ServicesManager {
  constructor(opts = {}) {
    this.allowedStore = opts.allowedStore;
    this.servers = new Map();
    this.clients = new Map();
    this.relay = null;
  }

  createRelay() { }

  createClientRpc(opts = {}) {
    const seed = opts.seed || null;
    if (!seed) {
      logger.error("[ServicesManager] Seed is required");
      throw new Error("Seed is required");
    }
    const keyPair = HyperDHT.keyPair(Buffer.from(seed, "hex"));
    const dhtPort = opts.dhtPort || null;
    const name = opts.name || "default";

    const serviceKey = keyPair.publicKey.toString("hex");

    const params = {
      serviceKey,
      name,
      topic: opts.topic,
      seed,
      keyPair,
      dhtPort,
      relayThrough: opts.relayThrough,
      shareLocalAddress: opts.shareLocalAddress,
      onUpdate: opts.onUpdate,
      methods: opts.methods,
      enableMetrics: opts.enableMetrics || false,
    };
    const client = new ClientRpc(params);

    this.clients.set(serviceKey, { ...params, client });

    // Auto-start by default for immediate tunnel usage
    if (opts.autoStart !== false) {
      client.init();
    }

    return { name, serviceKey };
  }

  createServerRpc(opts = {}) {
    const seed = opts.seed || null;
    if (!seed) {
      logger.error("[ServicesManager] Seed is required");
      throw new Error("Seed is required");
    }
    const keyPair = HyperDHT.keyPair(Buffer.from(seed, "hex"));
    const name = opts.name || "default";
    const allowed = opts.allowed || [];

    const serviceKey = keyPair.publicKey.toString("hex");
    this.allowedStore.createServiceStore(serviceKey, allowed);

    const params = {
      serviceKey,
      name,
      seed,
      topic: opts.topic,
      keyPair,
      allowedStore: this.allowedStore,
      onUpdate: opts.onUpdate,
      methods: opts.methods,
      enableMetrics: opts.enableMetrics || false,
    };
    const server = new ServerRpc(params);
    this.servers.set(serviceKey, {
      ...params,
      server,
    });

    // Auto-start by default for immediate tunnel usage
    if (opts.autoStart !== false) {
      server.init();
    }

    return { name, serviceKey };
  }

  createClient(opts = {}) {
    const seed = opts.seed || null;
    if (!seed) {
      logger.error("[ServicesManager] Seed is required");
      throw new Error("Seed is required");
    }
    const keyPair = HyperDHT.keyPair(Buffer.from(seed, "hex"));
    const proxyPort = opts.proxyPort || 0;
    const proxyHost = opts.proxyHost || "127.0.0.1";
    const peerToConnect = opts.peerToConnect || null;
    const dhtPort = opts.dhtPort || null;
    const name = opts.name || "default";

    if (!peerToConnect) {
      logger.error("[ServicesManager] peerToConnect is required");
      throw new Error("peerToConnect is required");
    }
    const serviceKey = keyPair.publicKey.toString("hex");

    const params = {
      serviceKey,
      proxyPort,
      proxyHost,
      peerToConnect,
      seed,
      keyPair,
      name,
      dhtPort,
      relayThrough: opts.relayThrough,
      shareLocalAddress: opts.shareLocalAddress,
      onUpdate: opts.onUpdate,
      enableMetrics: opts.enableMetrics || false,
    };
    const client = new Client(params);

    this.clients.set(serviceKey, { ...params, client });

    // Auto-start by default for immediate tunnel usage
    if (opts.autoStart !== false) {
      client.init();
    }

    return { name, serviceKey };
  }

  createServer(opts = {}) {
    const seed = opts.seed || null;
    if (!seed) {
      logger.error("[ServicesManager] Seed is required");
      throw new Error("Seed is required");
    }
    const keyPair = HyperDHT.keyPair(Buffer.from(seed, "hex"));
    const targetPort = opts.targetPort || 8080;
    const targetHost = opts.targetHost || "127.0.0.1";
    const name = opts.name || "default";
    const allowed = opts.allowed;

    const serviceKey = keyPair.publicKey.toString("hex");
    this.allowedStore.createServiceStore(serviceKey, allowed);

    const params = {
      serviceKey,
      name,
      targetPort,
      targetHost,
      seed,
      keyPair,
      allowedStore: this.allowedStore,
      onUpdate: opts.onUpdate,
      enableMetrics: opts.enableMetrics || false,
    };
    const server = new Server(params);
    this.servers.set(serviceKey, {
      ...params,
      server,
    });

    // Auto-start by default for immediate tunnel usage
    if (opts.autoStart !== false) {
      server.init();
    }

    return { name, serviceKey };
  }

  setServerAllowedList(serviceKey, allowedList) {
    const res = this.getServer(serviceKey);
    if (res) {
      res.server.setAllowed(allowedList);
      return true;
    }
    return false;
  }

  getServerAllowedList(serviceKey) {
    const res = this.getServer(serviceKey);
    if (res) {
      return res.server.getAllowed();
    }
    return null;
  }

  getServer(serviceKey) {
    return this.servers.get(serviceKey);
  }

  getClient(serviceKey) {
    return this.clients.get(serviceKey);
  }

  hasServer(serviceKey) {
    return this.servers.has(serviceKey);
  }

  hasClient(serviceKey) {
    return this.clients.has(serviceKey);
  }

  getServers() {
    return [...this.servers.values()];
  }

  getClients() {
    return [...this.clients.values()];
  }

  async restartClientById(serviceKey) {
    await this.stopClientById(serviceKey);
    this.startClientById(serviceKey);
  }

  async restartServerById(serviceKey) {
    await this.stopServerById(serviceKey);
    this.startServerById(serviceKey);
  }

  async restartAllServices() {
    const clientServices = this.getClients();
    const serverServices = this.getServers();

    try {
      await Promise.all([
        ...clientServices.map((s) => this.restartClientById(s.serviceKey)),
        ...serverServices.map((s) => this.restartServerById(s.serviceKey))
      ]);
      logger.info('[ServicesManager] All services restarted successfully');
    } catch (e) {
      logger.error('[ServicesManager] Error restarting services:', e);
      throw e;
    }
  }

  startServerById(serviceKey) {
    const service = this.servers.get(serviceKey);
    if (!service) {
      logger.error(`[ServicesManager] Server not found: ${serviceKey}`);
      throw new Error(`Server not found: ${serviceKey}`);
    }
    logger.info(`[ServicesManager] Starting server: ${service.name}`);
    service.server.init();
  }

  startClientById(serviceKey) {
    const service = this.clients.get(serviceKey);
    if (!service) {
      logger.error(`[ServicesManager] Client not found: ${serviceKey}`);
      throw new Error(`Client not found: ${serviceKey}`);
    }
    logger.info(`[ServicesManager] Starting client: ${service.name}`);
    service.client.init();
  }

  async removeClientById(serviceKey) {
    await this.stopClientById(serviceKey);
    this.clients.delete(serviceKey);
  }

  async removeServerById(serviceKey) {
    await this.stopServerById(serviceKey);
    this.servers.delete(serviceKey);
  }

  async stopServerById(serviceKey) {
    const service = this.servers.get(serviceKey);
    if (!service) {
      logger.error(`[ServicesManager] Server not found: ${serviceKey}`);
      throw new Error(`Server not found: ${serviceKey}`);
    }
    logger.info(`[ServicesManager] Stopping server: ${service.name}`);
    await service.server.stop();
  }

  async stopClientById(serviceKey) {
    const service = this.clients.get(serviceKey);
    if (!service) {
      logger.error(`[ServicesManager] Client not found: ${serviceKey}`);
      throw new Error(`Client not found: ${serviceKey}`);
    }
    logger.info(`[ServicesManager] Stopping client: ${service.name}`);
    await service.client.stop();
  }

  createClientUdp(opts = {}) {
    const seed = opts.seed || null;
    if (!seed) {
      logger.error("[ServicesManager] Seed is required");
      throw new Error("Seed is required");
    }
    const keyPair = HyperDHT.keyPair(Buffer.from(seed, "hex"));
    const proxyPort = opts.proxyPort || 3005;
    const proxyHost = opts.proxyHost || "127.0.0.1";
    const peerToConnect = opts.peerToConnect || null;
    const dhtPort = opts.dhtPort || null;
    const name = opts.name || "default";
    if (!peerToConnect) {
      logger.error("[ServicesManager] peerToConnect is required");
      throw new Error("peerToConnect is required");
    }

    const params = {
      proxyPort,
      proxyHost,
      peerToConnect,
      seed,
      keyPair,
      name,
      dhtPort,
      relayThrough: opts.relayThrough,
      shareLocalAddress: opts.shareLocalAddress,
      onUpdate: opts.onUpdate,
      enableMetrics: opts.enableMetrics || false,
    };
    const serviceKey = keyPair.publicKey.toString("hex");

    const client = new ClientUdp({ ...params, serviceKey });

    this.clients.set(serviceKey, { ...params, serviceKey, client });

    // Auto-start by default for immediate tunnel usage
    if (opts.autoStart !== false) {
      client.init();
    }

    return { name, publicKey: serviceKey };
  }

  createServerUdp(opts = {}) {
    const seed = opts.seed || null;
    if (!seed) {
      logger.error("[ServicesManager] Seed is required");
      throw new Error("Seed is required");
    }
    const keyPair = HyperDHT.keyPair(Buffer.from(seed, "hex"));
    const targetPort = opts.targetPort || 8080;
    const targetHost = opts.targetHost || "127.0.0.1";
    const name = opts.name || "default";
    const serviceKey = keyPair.publicKey.toString("hex");

    const params = {
      serviceKey,
      name,
      targetPort,
      targetHost,
      seed,
      keyPair,
      enableMetrics: opts.enableMetrics || false,
    };
    const server = new ServerUdp(params);

    this.servers.set(serviceKey, {
      ...params,
      server,
    });

    // Auto-start by default for immediate tunnel usage
    if (opts.autoStart !== false) {
      server.init();
    }

    return { name, serviceKey };
  }


  async close() {
    logger.info('[ServicesManager] Closing all services');

    const errors = [];

    // Stop all services in PARALLEL for faster shutdown
    const stopPromises = [];

    // Add all server stop promises
    for (const serviceKey of this.servers.keys()) {
      stopPromises.push(
        this.stopServerById(serviceKey).catch(e => {
          logger.error(`[ServicesManager] Failed to stop server ${serviceKey}:`, e);
          errors.push({ type: 'server', serviceKey, error: e });
        })
      );
    }

    // Add all client stop promises
    for (const serviceKey of this.clients.keys()) {
      stopPromises.push(
        this.stopClientById(serviceKey).catch(e => {
          logger.error(`[ServicesManager] Failed to stop client ${serviceKey}:`, e);
          errors.push({ type: 'client', serviceKey, error: e });
        })
      );
    }

    // Wait for all services to stop in parallel
    await Promise.all(stopPromises);

    // Always clear maps, even if some services failed
    this.servers.clear();
    this.clients.clear();

    if (errors.length > 0) {
      logger.warn(`[ServicesManager] Closed with ${errors.length} errors`);
      throw new Error(`Failed to close ${errors.length} service(s)`);
    }

    logger.info('[ServicesManager] All services closed successfully');
  }

  init() { }
}

export default ServicesManager;
