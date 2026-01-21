#!/usr/bin/env node
import HyperDHT from "hyperdht";
import {
  JSONRPCClient,
  JSONRPCServer,
  JSONRPCServerAndClient,
} from "json-rpc-2.0";
import { logger } from "../../../logger"

import TunedUDX from "../tunedUDX.js";

class ServerRpc {
  constructor(opts = {}) {
    this.dht = null;
    this.server = null;
    this.serviceKey = opts.serviceKey;
    this.name = opts.name;
    this.bootstrap = opts.bootstrap || null;
    this.seed = opts.seed || null;
    this.keyPair = opts.keyPair || null;
    this.keepAlive = opts.keepAlive || 5000;
    this.dhtPort = opts.dhtPort || null;
    this.shareLocalAddress = opts.shareLocalAddress || true;
    this.started = false;
    this.allowed = opts.allowed || [];
    this.allowedStore = opts.allowedStore;
    this.topic =
      opts.topic || Buffer.alloc(32).fill("oniriCloudRpc").toString("hex");
    this.connected = new Map();
    this.methodList = opts.methods || {};
    this.onUpdate = opts.onUpdate || this.noOp.bind(this);
    this.announceTimeout = null;

    // Metrics (optional for performance)
    this.enableMetrics = opts.enableMetrics || false;
    this.metrics = this.enableMetrics ? {
      startTime: null,
      totalConnections: 0,
      activeConnections: 0,
      rejectedConnections: 0,
      failedConnections: 0,
    } : null;
  }

  noOp() { }

  sendUpdateMessage(msg) {
    this.onUpdate({
      service: { serviceKey: this.serviceKey, name: this.name },
      msg,
    });
  }

  getMetrics() {
    if (!this.enableMetrics) {
      return { enabled: false, activeConnections: this.connected.size };
    }
    return {
      ...this.metrics,
      uptime: this.metrics.startTime ? Date.now() - this.metrics.startTime : 0,
      activeConnections: this.connected.size,
    };
  }

  async firewall(remotePublicKey, remoteHandshakePayload) {
    const remoteClientKey = remotePublicKey.toString("hex");

    try {
      const isAllowed = await this.allowedStore.isAllowed(
        this.getPublicKey(),
        remoteClientKey
      );

      if (isAllowed) {
        return false;
      } else {
        if (this.enableMetrics) this.metrics.rejectedConnections++;
        logger.info(`[${this.name}] Firewall: Rejected ${remoteClientKey}`);
        return true;
      }
    } catch (e) {
      if (this.enableMetrics) this.metrics.rejectedConnections++;
      logger.error(`[${this.name}] Firewall error:`, e);
      return true;
    }
  }

  getAllowed() {
    return this.allowedStore.getAllowedList(this.publicKey);
  }

  setAllowed(allowedList) {
    this.allowedStore.setAllowedList(this.publicKey, allowedList);
  }

  addMethods(serverAndClient) {
    Object.keys(this.methodList).forEach((methodName) => {
      serverAndClient.addMethod(methodName, this.methodList[methodName]);
    });
  }

  startRpcServer(stream) {
    const serverAndClient = new JSONRPCServerAndClient(
      new JSONRPCServer(),
      new JSONRPCClient((request) => {
        try {
          stream.write(JSON.stringify(request));
          return Promise.resolve();
        } catch (error) {
          return Promise.reject(error);
        }
      })
    );
    this.addMethods(serverAndClient);

    // CRITICAL: Track data listener for cleanup
    const dataHandler = (data) => {
      if (data.toString() != "") {
        serverAndClient.receiveAndSend(JSON.parse(data.toString()));
      }
    };
    stream.on("data", dataHandler);
    
    // Store handler for cleanup
    stream._rpcDataHandler = dataHandler;
    
    return serverAndClient;
  }

  async sendRequest(method, data, remoteKey) {
    try {
      const { rpcServer } = this.connected.get(remoteKey);
      const res = await rpcServer.request(method, {
        publicKey: this.serviceKey,
        data,
      });
      return res;
    } catch (e) {
      logger.error(`[${this.name}] Error sending request:`, e);
    }
  }

  onConnectHandler(stream) {
    const remotePeer = stream.remotePublicKey.toString("hex");
    logger.info(`[${this.name}] New connection from ${remotePeer}`);

    if (this.enableMetrics) {
      this.metrics.totalConnections++;
      this.metrics.activeConnections++;
    }

    const rpcServer = this.startRpcServer(stream);

    const endHandler = () => {
      this.cleanupConnection(remotePeer);
    };

    const closeHandler = async () => {
      try {
        this.cleanupConnection(remotePeer);
        this.sendUpdateMessage({ type: "disconnected", data: remotePeer });
      } catch (e) {
        logger.error(`[${this.name}] Error in close handler:`, e);
      }
    };

    const errorHandler = (err) => {
      if (this.enableMetrics) this.metrics.failedConnections++;
      this.cleanupConnection(remotePeer);
    };

    stream.on("end", endHandler);
    stream.on("close", closeHandler);
    stream.on("error", errorHandler);

    this.connected.set(remotePeer, {
      rpcServer,
      stream,
      handlers: { endHandler, closeHandler, errorHandler },
    });

    this.sendUpdateMessage({ type: "connected", data: remotePeer });
  }

  cleanupConnection(remotePeer) {
    const connection = this.connected.get(remotePeer);
    if (connection) {
      logger.debug(`[${this.name}] 🔌 Disconnected from ${remotePeer.substring(0, 16)}...`);

      if (this.enableMetrics) this.metrics.activeConnections--;

      // CRITICAL: Remove data listener FIRST
      if (connection.stream._rpcDataHandler) {
        connection.stream.removeListener("data", connection.stream._rpcDataHandler);
        delete connection.stream._rpcDataHandler;
      }

      connection.stream.removeListener("end", connection.handlers.endHandler);
      connection.stream.removeListener("close", connection.handlers.closeHandler);
      connection.stream.removeListener("error", connection.handlers.errorHandler);

      connection.rpcServer.rejectAllPendingRequests("Connection closed - cleanup");

      try {
        connection.stream.end();
        connection.stream.destroy();
      } catch (e) {
        logger.error(`[${this.name}] Error destroying stream:`, e);
      }

      this.connected.delete(remotePeer);
      logger.debug(`[${this.name}] Active connections: ${this.connected.size}`);
    }
  }

  getPublicKey() {
    return this.keyPair.publicKey.toString("hex");
  }

  async stop() {
    logger.info(`[${this.name}] Stopping RPC server, ${this.connected.size} active connections`);

    try {
      if (this.announceTimeout) {
        clearTimeout(this.announceTimeout);
        this.announceTimeout = null;
      }

      if (this.dht) {
        const peers = [...this.connected.keys()];
        peers.forEach((remotePeer) => {
          this.cleanupConnection(remotePeer);
        });

        try {
          await Promise.race([
            this.server.close(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Server close timeout')), 5000)
            )
          ]);
          logger.info(`[${this.name}] Server closed`);
        } catch (e) {
          logger.error(`[${this.name}] Error closing server:`, e);
        }

        try {
          await Promise.race([
            this.dht.destroy(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('DHT destroy timeout')), 5000)
            )
          ]);
          logger.info(`[${this.name}] DHT destroyed`);
        } catch (e) {
          logger.error(`[${this.name}] Error destroying DHT:`, e);
        }

        this.dht = null;
        this.server = null;
        this.started = false;
        this.sendUpdateMessage({ type: "stopped", data: null });
        return true;
      }

      this.sendUpdateMessage({
        type: "error",
        data: { msg: "failed to Stop" },
      });
      return false;
    } catch (e) {
      logger.error(`[${this.name}] Error during stop:`, e);
      return false;
    }
  }

  async announce(topic) {
    try {
      await this.dht.announce(topic, this.keyPair, []).finished();

      this.announceTimeout = setTimeout(() => {
        if (this.started) {
          this.announce(topic);
        }
      }, 30000);
    } catch (e) {
      logger.error(`[${this.name}] Error announcing:`, e);
    }
  }

  async init() {
    if (!this.seed) {
      throw new Error("no seed provided");
    }

    logger.debug(`[${this.name}] Initializing RPC server with DHT port ${this.dhtPort}`);
    if (this.enableMetrics) {
      this.metrics.startTime = Date.now();
    }

    this.dht = new HyperDHT({
      bootstrap: this.bootstrap,
      port: this.dhtPort,
      udx: new TunedUDX(),
    });

    this.server = this.dht.createServer(
      {
        firewall: this.firewall.bind(this),
        reusableSocket: true,
        shareLocalAddress: this.shareLocalAddress,
      },
      this.onConnectHandler.bind(this)
    );

    try {
      await this.server.listen(this.keyPair);
      logger.info(`[${this.name}] RPC server listening on ${this.keyPair.publicKey.toString("hex")}`);
      this.sendUpdateMessage({ type: "started", data: null });
      this.started = true;
      await this.announce(Buffer.from(this.topic, "hex"));
    } catch (err) {
      logger.error(`[${this.name}] Failed to start RPC server:`, err);
      this.sendUpdateMessage({
        type: "error",
        data: { msg: `Failed to start: ${err.message}` },
      });
      throw err;
    }
  }
}

export default ServerRpc;
