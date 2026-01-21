#!/usr/bin/env node
import HyperDHT from "hyperdht";
import UDP from "dgram";
import b4a from "b4a";
import { logger } from "../../../logger"
import * as helper from "./helper.js";
import TunedUDX from "../tunedUDX.js";
class ClientUdp {
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
    this.proxyPort = opts.proxyPort || 8080;
    this.proxyHost = opts.proxyHost || "127.0.0.1";
    this.peerToConnect = opts.peerToConnect || null;
    this.dhtPort = opts.dhtPort || null;
    this.relayThrough = opts.relayThrough || null;
    this.clients = new Map();
    this.onUpdate = opts.onUpdate || this.noOp.bind(this);
    this.started = false;

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

  getMetrics() {
    if (!this.enableMetrics) {
      return { enabled: false, activeConnections: this.clients.size };
    }
    return {
      ...this.metrics,
      uptime: this.metrics.startTime ? Date.now() - this.metrics.startTime : 0,
      activeConnections: this.clients.size,
    };
  }

  async stop() {
    logger.info(`[${this.name}] Stopping UDP client, ${this.clients.size} active connections`);

    for (const [clientId, stream] of this.clients.entries()) {
      try {
        stream.removeAllListeners();
        stream.end();
        stream.destroy();
      } catch (e) {
        logger.error(`[${this.name}] Error cleaning up client stream:`, e);
      }
    }
    this.clients.clear();

    if (this.proxy) {
      try {
        this.proxy.removeAllListeners();
        this.proxy.close();
      } catch (e) {
        logger.error(`[${this.name}] Error cleaning up proxy:`, e);
      }
      this.proxy = null;
    }

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
      this.started = false;
      this.sendUpdateMessage({ type: "stopped", data: null });
      return true;
    }

    this.sendUpdateMessage({ type: "error", data: { msg: "failed to Stop" } });
    return false;
  }

  getKeyPair(seed) {
    return HyperDHT.keyPair(b4a.from(seed, "hex"));
  }

  getPublicKey() {
    return this.keyPair.publicKey.toString("hex");
  }

  init() {
    logger.debug(`[${this.name}] Initializing UDP client with DHT port ${this.dhtPort}`);
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

    this.proxy = UDP.createSocket({
      type: "udp4",
      reuseAddr: true,
    });

    this.proxy.on("message", (message, info) => {
      if (this.enableMetrics) this.metrics.bytesIn += message.length;

      const clientId = `${info.address}-${info.port}`;

      if (this.clients.has(clientId)) {
        const stream = this.clients.get(clientId);
        stream.write(helper.createNewMesssage(message, info));
      } else {
        // Log new UDP client connection
        logger.debug(`[${this.name}] 🔗 New UDP client ${clientId}`);

        if (this.enableMetrics) {
          this.metrics.totalConnections++;
          this.metrics.activeConnections++;
        }

        try {
          const stream = this.dht.connect(
            Buffer.from(this.peerToConnect, "hex"),
            {
              relayThrough: this.relayThrough,
              reusableSocket: true,
            }
          );
          this.clients.set(clientId, stream);

          stream.on("data", (d) => {
            const { client_msg, client_rinfo } = helper.retriveMessage(d);

            this.proxy.send(client_msg, info.port, info.address, (err) => {
              if (err) {
                logger.error(`[${this.name}] Failed to send response`);
              } else {
                if (this.enableMetrics) this.metrics.bytesOut += client_msg.length;
              }
            });
          });

          stream.on("error", (err) => {
            logger.error(`[${this.name}] ❌ UDP client ${clientId} error: ${err.message}`);

            if (this.enableMetrics) {
              this.metrics.failedConnections++;
              this.metrics.activeConnections--;
            }
            stream.removeAllListeners();
            stream.end();
            stream.destroy();
            this.clients.delete(clientId);

            logger.debug(`[${this.name}] Active UDP clients: ${this.clients.size}`);
          });

          stream.on("close", () => {
            logger.debug(`[${this.name}] 🔌 UDP client ${clientId} disconnected`);

            if (this.enableMetrics) this.metrics.activeConnections--;
            stream.removeAllListeners();
            stream.destroy();
            this.clients.delete(clientId);

            logger.debug(`[${this.name}] Active UDP clients: ${this.clients.size}`);
          });

          stream.write(helper.createNewMesssage(message, info));
        } catch (err) {
          if (this.enableMetrics) this.metrics.failedConnections++;
          logger.error(`[${this.name}] Failed to create DHT connection:`, err);
        }
      }
    });

    this.proxy.on("error", (err) => {
      logger.error(`[${this.name}] Proxy error:`, err);
      this.sendUpdateMessage({
        type: "error",
        data: { msg: `Proxy error: ${err.message}` },
      });
    });

    this.proxy.on("listening", () => {
      const { address, port } = this.proxy.address();
      logger.info(`[${this.name}] UDP proxy listening on ${address}:${port}`);
      this.started = true;
      this.sendUpdateMessage({ type: "started", data: { address, port } });
    });

    try {
      this.proxy.bind(this.proxyPort);
    } catch (err) {
      logger.error(`[${this.name}] Failed to bind proxy:`, err);
      this.sendUpdateMessage({
        type: "error",
        data: { msg: `Failed to bind: ${err.message}` },
      });
      throw err;
    }
  }
}

export default ClientUdp;
