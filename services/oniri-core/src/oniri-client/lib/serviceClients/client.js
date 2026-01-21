#!/usr/bin/env node
import HyperDHT from "hyperdht";
import net from "net";
import b4a from "b4a";
import { connPiper } from "./libNet.js";
import { isPortAvailable } from "../utils.js";
import { logger } from "../../../logger";
import TunedUDX from "../tunedUDX.js";

class Client {
  constructor(opts = {}) {
    this.dht = null;
    this.proxy = null;
    this.serviceKey = opts.serviceKey;
    this.name = opts.name;
    this.bootstrap = opts.bootstrap || null;
    this.seed = opts.seed || null;
    this.keyPair = opts.keyPair || null;
    this.keepAlive = opts.keepAlive || 5000;
    this.compress = opts.compress || false;
    this.stats = {};
    this.proxyPort = opts.proxyPort || 0;
    this.proxyHost = opts.proxyHost || "127.0.0.1";
    this.peerToConnect = opts.peerToConnect || null;
    this.dhtPort = opts.dhtPort || null;
    this.relayThrough = opts.relayThrough || null;
    this.started = false;
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
      failedConnections: 0,
      bytesIn: 0,
      bytesOut: 0,
    } : null;
  }

  noOp() { }

  sendUpdateMessage(msg) {
    this.onUpdate({
      service: { serviceKey: this.serviceKey, name: this.name },
      msg,
    });
  }

  getKeyPair(seed) {
    return HyperDHT.keyPair(b4a.from(seed, "hex"));
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

  onProxyConnect(c) {
    const connId = this.connectionId++;
    const localAddr = `${c.remoteAddress}:${c.remotePort}`;

    // Log new local connection
    logger.debug(`[${this.name}] 🔗 New local connection #${connId} from ${localAddr}`);

    if (this.enableMetrics) {
      this.metrics.totalConnections++;
      this.metrics.activeConnections++;
    }

    // 1. Immediate safety handler to catch early resets (race condition fix)
    const safetyHandler = (err) => {
      logger.debug(`[${this.name}] Socket error during setup: ${err.message}`);
      c.destroy();
    };
    c.on('error', safetyHandler);

    try {
      const result = connPiper(
        c,
        () => {
          try {
            const stream = this.dht.connect(
              Buffer.from(this.peerToConnect, "hex"),
              {
                relayThrough: this.relayThrough
                  ? Buffer.from(this.relayThrough, "hex")
                  : null,
                reusableSocket: true,
              }
            );
            stream.on('open', () => {
              const isDirect = !!stream.rawStream;
              const type = isDirect ? 'Direct (P2P)' : 'Relayed';
              logger.info(`[${this.name}] 🔗 Connection established. Type: ${type} | Address: ${stream.remoteAddress}`);
            });

            logger.debug(`[${this.name}] DHT connection initialized: ${stream.remotePublicKey.toString("hex")}`);
            return stream;
          } catch (e) {
            if (this.enableMetrics) this.metrics.failedConnections++;
            logger.error(`[${this.name}] Failed to create DHT connection:`, e);
            // Return null to signal connPiper to cleanup the source connection
            return null;
          }
        },
        {
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

      // 2. Handover complete - connPiper now handles errors
      c.removeListener('error', safetyHandler);

      this.activeConnections.set(connId, result);
      return result;
    } catch (err) {
      logger.error(`[${this.name}] Error in onProxyConnect:`, err);
      // Ensure the socket is destroyed if connPiper failed to initialize
      if (!c.destroyed) c.destroy(err);
      return null;
    }
  }

  getPublicKey() {
    return this.keyPair.publicKey.toString("hex");
  }

  async stop() {
    logger.info(`[${this.name}] Stopping client, ${this.activeConnections.size} active connections`);

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

      // Wait a bit for connections to close gracefully
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Clean up proxy server
    if (this.proxy) {
      try {
        this.proxy.removeAllListeners();

        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Proxy close timeout'));
          }, 5000);

          this.proxy.close((err) => {
            clearTimeout(timeout);
            if (err) reject(err);
            else resolve();
          });
        });

        logger.info(`[${this.name}] Proxy server closed`);
      } catch (e) {
        logger.error(`[${this.name}] Error closing proxy:`, e);
      }
      this.proxy = null;
    }

    // Clean up DHT
    if (this.dht) {
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
    }

    this.started = false;
    this.sendUpdateMessage({ type: "stopped", data: null });
    return true;
  }

  async startProxy() {
    try {
      logger.debug(`[${this.name}] Starting proxy on ${this.proxyHost}:${this.proxyPort}`);

      const res = await isPortAvailable(this.proxyPort);
      if (!res) {
        const error = `Cannot start proxy, port is already taken ${this.proxyPort}`;
        logger.error(`[${this.name}] ${error}`);
        this.sendUpdateMessage({
          type: "error",
          data: { msg: error },
        });
        return;
      }

      this.proxy = net.createServer(
        { allowHalfOpen: true, keepAlive: true, noDelay: true },
        this.onProxyConnect.bind(this)
      );

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Proxy listen timeout'));
        }, 30000);

        const onListening = () => {
          cleanup();
          const { address, port } = this.proxy.address();
          logger.info(`[${this.name}] Proxy server ready @ ${address}:${port}`);
          this.started = true;
          this.sendUpdateMessage({ type: "started", data: { address, port } });
          resolve();
        };

        const onError = (err) => {
          cleanup();
          logger.error(`[${this.name}] Failed to start proxy:`, err);
          this.sendUpdateMessage({
            type: "error",
            data: { msg: `Failed to start proxy: ${err.message}` },
          });
          reject(err);
        };

        const cleanup = () => {
          clearTimeout(timeout);
          this.proxy.removeListener('listening', onListening);
          this.proxy.removeListener('error', onError);
        };

        // We attach the error listener for the lifetime of the server elsewhere?
        // The existing code attached a permanent error listener at line 246.
        // We should just hook into 'error' for the startup phase.
        // But wait, line 246 handler logs and sends update message. 
        // If we add another one here, we might duplicate logs or messages, but it's important for the Promise to reject.
        // Actually, the permanent error listener at 246 is good for runtime errors.
        // For startup, we want to capture the error to reject the promise.

        this.proxy.once('listening', onListening);
        this.proxy.once('error', onError);

        this.proxy.listen(this.proxyPort, this.proxyHost);
      });
    } catch (e) {
      logger.error(`[${this.name}] Error starting proxy:`, e);
      this.sendUpdateMessage({
        type: "error",
        data: { msg: `Error starting proxy: ${e.message}` },
      });
    }
  }

  init() {
    logger.debug(`[${this.name}] Initializing client with DHT port ${this.dhtPort}`);
    if (this.enableMetrics) {
      this.metrics.startTime = Date.now();
    }

    this.dht = new HyperDHT({
      bootstrap: this.bootstrap,
      keyPair: this.keyPair,
      connectionKeepAlive: this.keepAlive,
      port: this.dhtPort,
      udx: new TunedUDX(), // Inject tuned UDX for enhanced buffer sizes
    });

    this.startProxy();
  }
}

export default Client;
