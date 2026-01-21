import ServicesManager from "./servicesManager.js";
import {
  generateSeed,
  removeConfig,
  decrypt,
  getConfig,
  updateConfig,
  hasConfig,
  generateConfigForConnecting,
  getRandomPort
} from "./utils.js";
import { ONIRI_SERVER_NAME, ONIRI_CLIENT_NAME } from "./constants.js";
import AllowedStore from "./allowedStore.js";
import { logger } from "../../logger";

class Oniri {
  constructor(opts = {}) {
    this.servicesManager = null;
    this.config = {};
    this.devMode = opts.devMode || false;
    this.isServer = opts.isServer || false;
    this.controlService = null;
    this.allowedStore = opts.allowedStore || null;
    this.isInitialized = false;
    this.configPath = opts.configPath || null;
  }

  startAllowedStore() {
    if (this.allowedStore === null) {
      this.allowedStore = new AllowedStore();
    }
  }

  startServiceManager() {
    this.servicesManager = new ServicesManager({
      allowedStore: this.allowedStore,
    });
  }

  startConfig() {
    this.config = getConfig(this.devMode, this.isServer, this.configPath);
  }

  checkConfig() {
    return hasConfig(this.devMode, this.isServer, this.configPath);
  }

  generateConfigForCloud(seed, topic) {
    try {
      this.config = generateConfigForConnecting(
        decrypt(seed, this.encKey),
        topic,
        this.devMode,
        this.isServer,
        this.configPath
      );
    } catch (e) {
      logger.error('[Oniri] Failed to generate config for cloud:', e);
      throw e;
    }
  }

  startServices() {
    this.startAllowedStore();
    this.startServiceManager();
    this.startConfig();
    this.populateServices();
  }

  async onUpdate(info) {
    if (
      info.service.name === ONIRI_SERVER_NAME &&
      info.msg.type === "connected"
    ) {
      const remotePeer = info.msg.data;
      const rpcServer = this.servicesManager.getServer(info.service.serviceKey);

      if (this.devMode && rpcServer) {
        try {
          const res = await rpcServer.server.sendRequest(
            "echo",
            { timestamp: Date.now() },
            remotePeer
          );
          logger.debug('[Oniri] Echo response:', res);
        } catch (e) {
          logger.error('[Oniri] Failed to send echo:', e);
        }
      }
    }
  }

  populateServices() {
    if (!this.servicesManager) {
      throw new Error('[Oniri] ServicesManager not initialized');
    }

    this.config = getConfig(this.devMode, this.isServer, this.configPath);

    if (!this.config || !this.config.services) {
      logger.warn('[Oniri] No services in config');
      return;
    }

    const local = Object.keys(this.config.services.local || {});
    const remote = Object.keys(this.config.services.remote || {});

    local.forEach((s) => {
      try {
        if (this.config.services.local[s].transport === "rpc") {
          this.controlService = s;
          this.createLocalRpcService(this.config.services.local[s], true);
        } else {
          this.createLocalService(this.config.services.local[s], true);
        }
        this.startLocalServiceById(s);
      } catch (e) {
        logger.error(`[Oniri] Failed to populate local service ${s}:`, e);
      }
    });

    remote.forEach((s) => {
      try {
        if (this.config.services.remote[s].transport === "rpc") {
          this.createRemoteRpcService(this.config.services.remote[s], true);
          this.controlService = s;
        } else {
          logger.debug(this.config.services.remote[s]);
          this.createRemoteService(this.config.services.remote[s], true);
        }
        this.startRemoteServiceById(s);
      } catch (e) {
        logger.error(`[Oniri] Failed to populate remote service ${s}:`, e);
      }
    });
  }

  async updateAllServices(services) {
    logger.info('[Oniri] Updating all services', services);
    const allRemotesServices = this.config.services.remote;
    const remotes = Object.keys(services.remote);
    //logger.debug('[Oniri] Remote services:', remotes);

    if (remotes) {
      const existingRemotes = Object.keys(allRemotesServices);
      const filtered = existingRemotes.filter((r) => !remotes.includes(r));

      for (const remote of filtered) {
        await this.servicesManager.removeClientById(remote);
        delete this.config.services.remote[remote];
      }

      for (const remote of remotes) {
        if (allRemotesServices[remote]) {
          if (services.remote[remote].transport === "rpc") {
            // RPC services don't need restart
          } else {
            this.config.services.remote[remote] = services.remote[remote];
            await this.servicesManager.restartClientById(remote);
          }
        } else {
          await this.createRemoteService(services.remote[remote], false);
          this.startRemoteServiceById(remote);
        }
      }
    }

    const allLocalServices = this.config.services.local;
    const locals = Object.keys(services.local);
    logger.info('[Oniri] Local services:', locals);

    if (locals) {
      const existingLocals = Object.keys(allLocalServices);
      const filteredLocal = existingLocals.filter((l) => !locals.includes(l));

      for (const local of filteredLocal) {
        this.allowedStore.clearAllowedList(local);
        await this.servicesManager.removeServerById(local);
        delete this.config.services.local[local];
      }

      logger.info('[Oniri] Current config:', this.config);

      for (const local of locals) {
        logger.info('[Oniri] Processing local service:', services.local[local]);

        if (allLocalServices[local]) {
          this.config.services.local[local] = services.local[local];
          this.allowedStore.setAllowedList(
            local,
            services.local[local].allowed
          );
          await this.servicesManager.restartServerById(local);
        } else {
          this.allowedStore.createServiceStore(
            local,
            services.local[local].allowed
          );
          this.createLocalService(services.local[local], false);
          this.startLocalServiceById(local);
        }
      }

      logger.info('[Oniri] Config updated:', this.config);
      updateConfig(this.config, this.devMode, false, this.configPath);
    }
  }

  setAllowedList(serviceKey, allowedList = []) {
    const done = this.servicesManager.setServerAllowedList(
      serviceKey,
      allowedList
    );
    if (done) {
      updateConfig(this.config, this.devMode, this.isServer, this.configPath);
      return true;
    }
    return false;
  }

  getAllowedList(serviceKey) {
    return this.servicesManager.getServerAllowedList(serviceKey);
  }

  getMethods() {
    return { echo: this._rpcEcho.bind(this) };
  }



  createRemoteRpcService(opts = {}, init = false) {
    try {
      const seed = opts.seed || generateSeed();
      const transport = opts.transport || "rpc";

      const info = this.servicesManager.createClientRpc({
        seed: decrypt(opts.seed, this.encKey),
        name: opts.name,
        topic: opts.topic,
        onUpdate: this.onUpdate.bind(this),
        methods: this.getMethods(),
        enableMetrics: opts.enableMetrics || false,
        autoStart: false,
      });

      if (!init) {
        this.config.services.remote[info.serviceKey] = {
          ...opts,
          seed,
          transport,
        };
        updateConfig(this.config, this.devMode, this.isServer, this.configPath);
      }
      return info;
    } catch (e) {
      logger.error('[Oniri] Failed to create remote RPC service:', e);
      throw e;
    }
  }

  _rpcEcho(params) {
    logger.info('[Oniri] RPC Echo called:', params);
    return { echo: params, timestamp: Date.now() };
  }

  createLocalRpcService(opts = {}, init = false) {
    try {
      const nOpts = { ...opts };
      delete nOpts.allowed;
      const seed = opts.seed || generateSeed();
      const allowed = opts.allowed || [];
      const transport = opts.transport || "rpc";

      const info = this.servicesManager.createServerRpc({
        seed: decrypt(opts.seed, this.encKey),
        name: opts.name,
        topic: opts.topic,
        allowed,
        onUpdate: this.onUpdate.bind(this),
        methods: this.getMethods(),
        enableMetrics: opts.enableMetrics || false,
        autoStart: false,
      });

      if (!init) {
        this.config.services.local[info.serviceKey] = {
          ...nOpts,
          seed,
          topic: opts.topic,
          transport,
        };
        updateConfig(this.config, this.devMode, this.isServer, this.configPath);
      }
      return info;
    } catch (e) {
      logger.error('[Oniri] Failed to create local RPC service:', e);
      throw e;
    }
  }

  createLocalService(opts = {}, init = false) {
    try {
      const nOpts = { ...opts };
      delete nOpts.allowed;
      const seed = opts.seed || generateSeed();
      const allowed = opts.allowed || [];
      const transport = opts.transport || "tcp";

      const info = this.servicesManager.createServer({
        seed: decrypt(opts.seed, this.encKey),
        name: opts.name,
        targetPort: opts.targetPort,
        targetHost: opts.targetHost,
        allowed,
        onUpdate: this.onUpdate.bind(this),
        enableMetrics: opts.enableMetrics || false,
        autoStart: false,
      });

      if (!init) {
        this.config.services.local[info.serviceKey] = {
          ...nOpts,
          seed,
          transport,
        };
        updateConfig(this.config, this.devMode, this.isServer, this.configPath);
      }
      return info;
    } catch (e) {
      logger.error('[Oniri] Failed to create local service:', e);
      throw e;
    }
  }

  async createRemoteService(opts = {}, init = false) {
    try {
      const seed = opts.seed || generateSeed();
      const transport = opts.transport || "tcp";

      let proxyPort = opts.proxyPort;
      if (opts.proxyPort == 0) {
        proxyPort = await getRandomPort();
      }

      const decryptedSeed = decrypt(opts.seed, this.encKey);
      const info = this.servicesManager.createClient({
        seed: decryptedSeed,
        name: opts.name,
        proxyPort: proxyPort,
        proxyHost: opts.proxyHost,
        peerToConnect: opts.remoteServiceKey,
        relayThrough: opts.relayThrough,
        onUpdate: this.onUpdate.bind(this),
        enableMetrics: opts.enableMetrics || false,
        autoStart: false,  // Don't auto-start, will be started explicitly
      });

      this.config.services.remote[info.serviceKey] = {
        ...opts,
        seed,
        proxyPort,
        transport,
      };
      updateConfig(this.config, this.devMode, this.isServer, this.configPath);

      return info;
    } catch (e) {
      logger.error('[Oniri] Failed to create remote service:', e);
      throw e;
    }
  }

  startLocalServiceById(serviceKey) {
    if (!this.servicesManager) {
      throw new Error('[Oniri] ServicesManager not initialized');
    }
    this.servicesManager.startServerById(serviceKey);
  }

  startRemoteServiceById(serviceKey) {
    if (!this.servicesManager) {
      throw new Error('[Oniri] ServicesManager not initialized');
    }
    this.servicesManager.startClientById(serviceKey);
  }

  async stopLocalServiceById(serviceKey) {
    if (!this.servicesManager) {
      throw new Error('[Oniri] ServicesManager not initialized');
    }
    await this.servicesManager.stopServerById(serviceKey);
  }

  async stopRemoteServiceById(serviceKey) {
    if (!this.servicesManager) {
      throw new Error('[Oniri] ServicesManager not initialized');
    }
    await this.servicesManager.stopClientById(serviceKey);
  }

  getControlService() {
    if (this.controlService) {
      if (this.isServer) {
        const rpcServer = this.servicesManager.getServer(this.controlService);
        return rpcServer;
      } else {
        const rpcServer = this.servicesManager.getClient(this.controlService);
        return rpcServer;
      }
    }
    return null;
  }

  getLocalServices() {
    const localServices = this.servicesManager.getServers();
    const res = localServices.map((s) => {
      const d = { ...s };
       d.started = d.server.started
      delete d.server;
      delete d.seed;
      delete d.keyPair;
      delete d.onUpdate;
      delete d.methods;
      return d;
    });
    return res;
  }

  getRemoteServices() {
    const res = this.servicesManager.getClients().map((s) => {
      const d = { ...s };
      d.started = d.client.started
      delete d.client;
      delete d.seed;
      delete d.keyPair;
      delete d.onUpdate;
      delete d.methods;
      return d;
    });
    //logger.info('[Oniri] Remote services:', res);
    return res;
  }

  getAllServices() {
    const controlService = this.getControlService();
    return {
      remotes: this.getRemoteServices(),
      local: this.getLocalServices(),
      controlService: { seed: controlService?.seed, publicKey: controlService?.serviceKey }
    };
  }

  async removeConfig() {
    if (this.servicesManager) {
      await this.servicesManager.close();
    }
    removeConfig(this.devMode, this.isServer, this.configPath);
    this.isInitialized = false;
  }

  async close() {
    if (this.servicesManager) {
      try {
        // Add timeout to prevent hanging
        await Promise.race([
          this.servicesManager.close(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Close timeout after 10s')), 10000)
          )
        ]);
      } catch (e) {
        logger.error('[Oniri] Error during close:', e);
        // Continue cleanup even if close fails
      }
    }
    this.isInitialized = false;
  }

  init() {
    try {
      this.startServices();
      this.isInitialized = true;
      logger.info('[Oniri] Initialized successfully');
    } catch (e) {
      logger.error('[Oniri] Failed to initialize:', e);
      this.isInitialized = false;
      throw e;
    }
  }
}

export default Oniri;
