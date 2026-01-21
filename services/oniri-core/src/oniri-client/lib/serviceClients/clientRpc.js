#!/usr/bin/env node
import HyperDHT from "hyperdht";
import b4a from "b4a";
import {
  JSONRPCClient,
  JSONRPCServer,
  JSONRPCServerAndClient,
} from "json-rpc-2.0";
import { logger } from "../../../logger";

import TunedUDX from "../tunedUDX.js";

class ClientRpc {
  constructor(opts = {}) {
    this.dht = null;
    this.bootstrap = opts.bootstrap || null;
    this.serviceKey = opts.serviceKey;
    this.name = opts.name;
    this.seed = opts.seed || null;
    this.keyPair = opts.keyPair || null;
    this.keepAlive = opts.keepAlive || 5000;
    this.dhtPort = opts.dhtPort || null;
    this.relayThrough = opts.relayThrough || null;
    this.started = false;
    this.topic =
      opts.topic || Buffer.alloc(32).fill("oniriCloudRpc").toString("hex");
    this.methodList = opts.methods || {};
    this.onUpdate = opts.onUpdate || this.noOp.bind(this);
    this.connected = false;
    this.currentStream = null;
    this.reconnectTimeouts = [];

    // Metrics (optional for performance)
    this.enableMetrics = opts.enableMetrics || false;
    this.metrics = this.enableMetrics ? {
      startTime: null,
      totalConnections: 0,
      activeConnections: 0,
      failedConnections: 0,
      reconnectAttempts: 0,
    } : null;
  }

  noOp() { }

  getKeyPair(seed) {
    return HyperDHT.keyPair(b4a.from(seed, "hex"));
  }

  getPublicKey() {
    return this.keyPair.publicKey.toString("hex");
  }

  getMetrics() {
    if (!this.enableMetrics) {
      return { enabled: false, connected: this.connected };
    }
    return {
      ...this.metrics,
      uptime: this.metrics.startTime ? Date.now() - this.metrics.startTime : 0,
      connected: this.connected,
    };
  }

  async stop() {
    logger.info(`[${this.name}] Stopping RPC client`);

    this.reconnectTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.reconnectTimeouts = [];

    if (this.currentStream) {
      try {
        // CRITICAL: Remove data listener before removeAllListeners
        if (this.currentStream._rpcDataHandler) {
          this.currentStream.removeListener("data", this.currentStream._rpcDataHandler);
          delete this.currentStream._rpcDataHandler;
        }
        this.currentStream.removeAllListeners();
        this.currentStream.end();
        this.currentStream.destroy();
      } catch (e) {
        logger.error(`[${this.name}] Error cleaning up stream:`, e);
      }
      this.currentStream = null;
    }

    if (this.rpcServer) {
      this.rpcServer.rejectAllPendingRequests("Client stopping");
      this.rpcServer = null;
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

  async findPeerForTopic(topic) {
    let stream = null;
    try {
      // Check if DHT is still alive before starting lookup
      if (!this.dht) {
        logger.debug(`[${this.name}] DHT not available for lookup`);
        return {};
      }

      const result = [];
      stream = this.dht.lookup(topic);

      for await (const data of stream) {
        // Double-check DHT still exists during iteration
        if (!this.dht) {
          logger.debug(`[${this.name}] DHT destroyed during lookup, stopping iteration`);
          break;
        }
        result.push(data);
      }

      const filtered = result
        .flatMap((r) => r.peers)
        .reduce((init, current) => {
          const key = current.publicKey.toString("hex");
          if (init[key]) {
            return init;
          } else {
            init[key] = current;
            return init;
          }
        }, {});

      return filtered;
    } catch (e) {
      logger.error(`[${this.name}] Error finding peers:`, e);
      return {};
    } finally {
      // CRITICAL: Always destroy lookup stream to prevent orphaning
      if (stream) {
        try {
          stream.destroy();
        } catch (e) {
          // Suppress "Node was destroyed" errors during cleanup
          if (!e.message.includes("Node was destroyed")) {
            logger.error(`[${this.name}] Error destroying lookup stream:`, e);
          }
        }
      }
    }
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
      serverAndClient.receiveAndSend(JSON.parse(data.toString()));
    };
    stream.on("data", dataHandler);
    
    // Store handler for cleanup
    stream._rpcDataHandler = dataHandler;
    
    this.connected = true;

    return serverAndClient;
  }

  sendUpdateMessage(msg) {
    this.onUpdate({
      service: { serviceKey: this.serviceKey, name: this.name },
      msg,
    });
  }

  async sendRequest(method, data, remoteKey) {
    try {
      const res = await this.rpcServer.request(method, {
        publicKey: this.serviceKey,
        data,
      });
      return res;
    } catch (e) {
      logger.error(`[${this.name}] Error sending request:`, e);
    }
  }

  async connect(omit = []) {
    if (!this.dht) return; // Prevent connecting if destroyed
    if (this.enableMetrics) this.metrics.reconnectAttempts++;

    if (this.currentStream) {
      try {
        // CRITICAL: Remove data listener before removeAllListeners
        if (this.currentStream._rpcDataHandler) {
          this.currentStream.removeListener("data", this.currentStream._rpcDataHandler);
          delete this.currentStream._rpcDataHandler;
        }
        this.currentStream.removeAllListeners();
        this.currentStream.end();
        this.currentStream.destroy();
      } catch (e) {
        logger.error(`[${this.name}] Error cleaning up old stream:`, e);
      }
      this.currentStream = null;
    }

    if (this.rpcServer) {
      this.rpcServer.rejectAllPendingRequests("Reconnecting");
      this.rpcServer = null;
    }

    const res = await this.findPeerForTopic(Buffer.from(this.topic, "hex"));
    const publicKeys = Object.keys(res || {});

    if (publicKeys.length === 0) {
      // Clear old timeouts before scheduling new one
      this.reconnectTimeouts.forEach((t) => clearTimeout(t));
      this.reconnectTimeouts = [];
      
      const timeout = setTimeout(() => {
        this.connect();
      }, 3000);
      this.reconnectTimeouts.push(timeout);
    } else {
      const peersToConnect = publicKeys.filter((p) => !omit.includes(p));

      if (peersToConnect.length === 0) {
        // Clear old timeouts before scheduling new one
        this.reconnectTimeouts.forEach((t) => clearTimeout(t));
        this.reconnectTimeouts = [];
        
        const timeout = setTimeout(() => {
          this.connect();
        }, 2000);
        this.reconnectTimeouts.push(timeout);
      } else {
        const peerToConn = peersToConnect[0];
        logger.debug(`[${this.name}] 🔗 Connecting to peer ${peerToConn.substring(0, 16)}...`);

        try {
          const stream = await this.dht.connect(res[peerToConn].publicKey, {
            relayThrough: res[peerToConn].relayAddresses,
            reusableSocket: true,
          });

          this.currentStream = stream;
          this.rpcServer = this.startRpcServer(stream);

          stream.on("end", (err) => {
            // Silent - not hot path
          });

          stream.on("close", async (err) => {
            try {
              // CRITICAL: Remove data listener before removeAllListeners
              if (stream._rpcDataHandler) {
                stream.removeListener("data", stream._rpcDataHandler);
                delete stream._rpcDataHandler;
              }
              stream.removeAllListeners();
              stream.end();
              stream.destroy();
              if (this.rpcServer) {
                this.rpcServer.rejectAllPendingRequests(
                  "Connection is closed rejectAllPendingRequests"
                );
              }

              // Enhanced disconnect logging
              if (err) {
                logger.debug(`[${this.name}] ❌ Disconnected from ${peerToConn.substring(0, 16)}... (error)`);
              } else {
                logger.debug(`[${this.name}] 🔌 Disconnected from ${peerToConn.substring(0, 16)}...`);
              }

              this.connected = false;
              if (this.enableMetrics) {
                this.metrics.activeConnections = 0;
                if (err) this.metrics.failedConnections++;
              }
              this.currentStream = null;
              this.sendUpdateMessage({ type: "disconnected", data: peerToConn });
            } catch (e) {
              logger.error(`[${this.name}] Error in close handler:`, e);
            }
          });

          stream.on("error", (err) => {
            // CRITICAL: Remove data listener before removeAllListeners
            if (stream._rpcDataHandler) {
              stream.removeListener("data", stream._rpcDataHandler);
              delete stream._rpcDataHandler;
            }
            stream.removeAllListeners();
            stream.end();
            stream.destroy();
            this.currentStream = null;
            if (this.enableMetrics) this.metrics.failedConnections++;
            logger.error(`[${this.name}] ❌ Stream error: ${err.code}`);
            
            // Clear timeouts before reconnecting
            this.reconnectTimeouts.forEach((t) => clearTimeout(t));
            this.reconnectTimeouts = [];

            if (err.code === "PEER_CONNECTION_FAILED") {
              this.connect([...omit, peerToConn]);
            } else {
              this.connect();
            }
          });

          stream.on("open", () => {
            if (this.enableMetrics) {
              this.metrics.totalConnections++;
              this.metrics.activeConnections = 1;
            }
            logger.debug(`[${this.name}] ✅ Connected to ${peerToConn.substring(0, 16)}...`);
            this.sendUpdateMessage({ type: "connected", data: peerToConn });
          });

          this.connected = false;
        } catch (err) {
          if (this.enableMetrics) this.metrics.failedConnections++;
          logger.error(`[${this.name}] ❌ Connection failed:`, err);

          if (err.code === "PEER_CONNECTION_FAILED" || err.message.includes("PEER_CONNECTION_FAILED")) {
            this.connect([...omit, peerToConn]);
          } else {
            this.connect();
          }
        }
      }
    }
  }

  async init() {
    logger.debug(`[${this.name}] Initializing RPC client with DHT port ${this.dhtPort}`);
    if (this.enableMetrics) {
      this.metrics.startTime = Date.now();
    }

    this.dht = new HyperDHT({
      bootstrap: this.bootstrap,
      keyPair: this.keyPair,
      port: this.dhtPort,
      udx: new TunedUDX(),
    });

    this.connect();
    this.started = true;
    this.sendUpdateMessage({ type: "started", data: null });
  }
}

export default ClientRpc;
