#!/usr/bin/env node
import HyperDHT from "hyperdht";
import udp from "dgram";
import b4a from "b4a";
import libNet from "hyper-cmd-lib-net";
import * as helper from "./helper.js";
import { logger } from "../../../logger"
import TunedUDX from "../tunedUDX.js";

class ServerUdp {
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
    this.udpClients = new Map();
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

  getMetrics() {
    if (!this.enableMetrics) {
      return { enabled: false, activeConnections: this.udpClients.size };
    }
    return {
      ...this.metrics,
      uptime: this.metrics.startTime ? Date.now() - this.metrics.startTime : 0,
      activeConnections: this.udpClients.size,
    };
  }

  async stop() {
    logger.info(`[${this.name}] Stopping UDP server, ${this.udpClients.size} active UDP clients`);

    for (const [clientId, udpClient] of this.udpClients.entries()) {
      try {
        udpClient.removeAllListeners();
        udpClient.close();
      } catch (e) {
        logger.error(`[${this.name}] Error cleaning up UDP client:`, e);
      }
    }
    this.udpClients.clear();

    if (this.server) {
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
      this.server = null;
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

  sendUpdateMessage(msg) {
    this.onUpdate({
      service: { serviceKey: this.serviceKey, name: this.name },
      msg,
    });
  }

  firewall(remotePublicKey, remoteHandshakePayload) {
    return false;
  }

  onConnectHandler(c) {
    const remotePeer = c.remotePublicKey.toString("hex");
    logger.debug(`[${this.name}] 🔗 New connection from ${remotePeer.substring(0, 16)}...`);

    if (this.enableMetrics) {
      this.metrics.totalConnections++;
      this.metrics.activeConnections++;
    }

    c.on("data", (d) => {
      if (this.enableMetrics) this.metrics.bytesIn += d.length;

      const { client_msg, client_rinfo } = helper.retriveMessage(d);
      const clientId = `${client_rinfo.address}-${client_rinfo.port}`;

      if (this.udpClients.has(clientId)) {
        const client = this.udpClients.get(clientId);
        client.send(client_msg, this.targetPort, this.targetHost, (error) => {
          if (error) {
            logger.error(`[${this.name}] Error sending to target:`, error);
            client.close();
          } else {
            if (this.enableMetrics) this.metrics.bytesOut += client_msg.length;
          }
        });
      } else {
        // Log new UDP client
        logger.debug(`[${this.name}] 🔗 New UDP client ${clientId}`);

        const client = udp.createSocket({
          type: "udp4",
          reuseAddr: true,
        });

        this.udpClients.set(clientId, client);

        client.on("message", (msg, info) => {
          if (this.enableMetrics) this.metrics.bytesIn += msg.length;
          c.write(helper.createNewMesssage(msg, info));
        });

        client.on("error", (err) => {
          logger.error(`[${this.name}] ❌ UDP client ${clientId} error: ${err.message}`);

          if (this.enableMetrics) this.metrics.failedConnections++;
          client.removeAllListeners();
          client.close();
          this.udpClients.delete(clientId);

          logger.debug(`[${this.name}] Active UDP clients: ${this.udpClients.size}`);
        });

        client.send(client_msg, this.targetPort, this.targetHost, (error) => {
          if (error) {
            logger.error(`[${this.name}] Error sending first message:`, error);
            client.close();
          } else {
            if (this.enableMetrics) this.metrics.bytesOut += client_msg.length;
          }
        });
      }
    });

    c.on("error", (err) => {
      logger.error(`[${this.name}] ❌ DHT connection error from ${remotePeer.substring(0, 16)}...: ${err.message}`);

      if (this.enableMetrics) {
        this.metrics.failedConnections++;
        this.metrics.activeConnections--;
      }
      c.removeAllListeners();
      c.end();
      c.destroy();
    });

    c.on("close", () => {
      logger.debug(`[${this.name}] 🔌 Connection closed from ${remotePeer.substring(0, 16)}...`);

      if (this.enableMetrics) this.metrics.activeConnections--;
      c.removeAllListeners();
      c.destroy();

      logger.debug(`[${this.name}] Active connections: ${this.udpClients.size}`);
    });
  }

  getPublicKey() {
    return this.keyPair.publicKey.toString("hex");
  }

  init() {
    if (!this.seed) {
      throw new Error("no seed provided");
    }

    logger.debug(`[${this.name}] Initializing UDP server with DHT port ${this.dhtPort}`);
    if (this.enableMetrics) {
      this.metrics.startTime = Date.now();
    }

    this.dht = new HyperDHT({
      bootstrap: this.bootstrap,
      connectionKeepAlive: this.keepAlive,
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

    this.server.listen(this.keyPair)
      .then(() => {
        logger.info(`[${this.name}] UDP server listening on ${this.keyPair.publicKey.toString("hex")}`);
        this.started = true;
        this.sendUpdateMessage({ type: "started", data: null });
      })
      .catch((err) => {
        logger.error(`[${this.name}] Failed to start UDP server:`, err);
        this.sendUpdateMessage({
          type: "error",
          data: { msg: `Failed to start: ${err.message}` },
        });
      });
  }
}

export default ServerUdp;
