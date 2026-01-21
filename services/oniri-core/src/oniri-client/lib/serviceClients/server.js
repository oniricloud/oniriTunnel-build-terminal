#!/usr/bin/env node
import HyperDHT from "hyperdht";
import net from "net";
import b4a from "b4a";
import libNet from "hyper-cmd-lib-net";
import { logger } from "../../../logger"
import { connPiper } from "./libNet.js";
import TunedUDX from "../tunedUDX.js";

class Server {
  constructor(opts = {}) {
    this.dht = null;
    this.server = null;
    this.serviceKey = opts.serviceKey;
    this.name = opts.name;
    this.bootstrap = opts.bootstrap || null;
    this.seed = opts.seed || null;
    this.keyPair = opts.keyPair || null;
    this.keepAlive = opts.keepAlive || 5000;
    this.compress = opts.compress || false;
    this.stats = {};
    this.targetPort = opts.targetPort || 8080;
    this.targetHost = opts.targetHost || "127.0.0.1";
    this.peerToConnect = opts.peerToConnect || null;
    this.dhtPort = opts.dhtPort || null;
    this.shareLocalAddress = opts.shareLocalAddress || true;
    this.started = false;
    this.allowed = opts.allowed || []; //TODO: remove this
    this.allowedStore = opts.allowedStore;
    this.onUpdate = opts.onUpdate || this.noOp.bind(this);

    // Connection tracking
    this.activeConnections = new Map();
    this.connectionId = 0;

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

  async firewall(remotePublicKey, remoteHandshakePayload) {
    const remoteClientKey = remotePublicKey.toString("hex");

    try {
      const isAllowed = await this.allowedStore.isAllowed(
        this.getPublicKey(),
        remoteClientKey
      );

      if (isAllowed) {
        logger.debug(`[${this.name}] Firewall: Allowed ${remoteClientKey}`);
        return false; // Allow connection
      } else {
        if (this.enableMetrics) this.metrics.rejectedConnections++;
        logger.info(`[${this.name}] Firewall: Rejected ${remoteClientKey}`);
        return true; // Reject connection
      }
    } catch (e) {
      logger.error(`[${this.name}] Firewall error:`, e);
      // Fail closed - reject on error
      if (this.enableMetrics) this.metrics.rejectedConnections++;
      return true;
    }
  }

  getAllowed() {
    return this.allowedStore.getAllowedList();
  }

  setAllowed(allowedList) {
    this.allowedStore.setAllowedList(this.serviceKey, allowedList);
  }

  getMetrics() {
    if (!this.enableMetrics) {
      return { enabled: false, activeConnections: this.activeConnections.size };
    }
    return {
      ...this.metrics,
      uptime: this.metrics.startTime ? Date.now() - this.metrics.startTime : 0,
      activeConnections: this.activeConnections.size,
      stats: { ...this.stats },
    };
  }

  onConnectHandler(c) {
    const connId = this.connectionId++;
    const remoteKey = c.remotePublicKey.toString("hex");

    // Log new connection
    logger.debug(`[${this.name}] 🔗 New connection #${connId} from ${remoteKey.substring(0, 16)}...`);

    if (this.enableMetrics) {
      this.metrics.totalConnections++;
      this.metrics.activeConnections++;
    }

    const result = connPiper(
      c,
      () => {
        try {
          return net.connect({
            port: this.targetPort,
            host: this.targetHost,
            allowHalfOpen: true,
            keepAlive: true,
            noDelay: true,
          });
        } catch (e) {
          if (this.enableMetrics) this.metrics.failedConnections++;
          logger.error(`[${this.name}] Failed to create target connection:`, e);
          throw e;
        }
      },
      {
        debug: true,
        isServer: true,
        compress: this.compress,
        onDestroy: (err) => {
          // Log disconnection
          if (err) {
            logger.debug(`[${this.name}] ❌ Connection #${connId} closed with error: ${err.message}`);
          } else {
            logger.debug(`[${this.name}] ✅ Connection #${connId} closed normally`);
          }

          if (this.enableMetrics) {
            this.metrics.activeConnections--;
            if (err) this.metrics.failedConnections++;
          }
          this.activeConnections.delete(connId);

          // Log current active connections count
          logger.debug(`[${this.name}] Active connections: ${this.activeConnections.size}`);
        }
      },
      this.stats
    );

    this.activeConnections.set(connId, result);
  }

  getPublicKey() {
    return this.keyPair.publicKey.toString("hex");
  }

  async stop() {
    logger.info(`[${this.name}] Stopping server, ${this.activeConnections.size} active connections`);

    // Close all active connections first
    if (this.activeConnections.size > 0) {
      logger.info(`[${this.name}] Cleaning up ${this.activeConnections.size} active connections`);

      for (const [id, conn] of this.activeConnections.entries()) {
        try {
          conn.cleanup();
        } catch (e) {
          logger.error(`[${this.name}] Error cleaning up connection ${id}:`, e);
        }
      }

      this.activeConnections.clear();

      // Wait for connections to close gracefully
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Clean up DHT server
    if (this.server) {
      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Server close timeout'));
          }, 5000);

          this.server.close().then(() => {
            clearTimeout(timeout);
            resolve();
          }).catch((err) => {
            clearTimeout(timeout);
            reject(err);
          });
        });

        logger.info(`[${this.name}] DHT server closed`);
      } catch (e) {
        logger.error(`[${this.name}] Error closing server:`, e);
      }
      this.server = null;
    }

    // Clean up DHT
    if (this.dht) {
      try {
        await this.dht.destroy();
        logger.info(`[${this.name}] DHT destroyed`);
      } catch (e) {
        logger.error(`[${this.name}] Error destroying DHT:`, e);
      }
      this.dht = null;
    }

    this.started = false;
    this.sendUpdateMessage({ type: "stopped", data: null });
    return true;
  }

  init() {
    if (!this.seed) {
      throw new Error("no seed provided");
    }

    logger.debug(`[${this.name}] Initializing server with DHT port ${this.dhtPort}`);
    if (this.enableMetrics) {
      this.metrics.startTime = Date.now();
    }

    this.dht = new HyperDHT({
      bootstrap: this.bootstrap,
      connectionKeepAlive: this.keepAlive,
      port: this.dhtPort,
      udx: new TunedUDX(), // Inject tuned UDX for enhanced buffer sizes
    });

    this.server = this.dht.createServer(
      {
        firewall: this.firewall.bind(this),
        reusableSocket: true,
        shareLocalAddress: this.shareLocalAddress,
      },
      this.onConnectHandler.bind(this)
    );

    this.server.listen(this.keyPair)
      .then(() => {
        logger.info(`[${this.name}] Server listening on ${this.keyPair.publicKey.toString("hex")}`);
        logger.debug(`[${this.name}] Server address:`, this.server.address());
        this.started = true;
        this.sendUpdateMessage({ type: "started", data: null });
      })
      .catch((err) => {
        logger.error(`[${this.name}] Failed to start server:`, err);
        this.sendUpdateMessage({
          type: "error",
          data: { msg: `Failed to start server: ${err.message}` },
        });
      });
  }
}

export default Server;
