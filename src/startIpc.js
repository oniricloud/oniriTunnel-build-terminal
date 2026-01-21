
import pearRun from pear
import EventEmitter from 'bare-events'
import RPC from 'bare-rpc'
import FramedStream from 'framed-stream'
import { API, API_BY_VALUE } from '../services/oniri-core/src/api.js';
import ReadyResource from 'ready-resource'

function getWorkletPath() {
    const fromDisk = Pear.app.key === null

    const WORKLET_PATH_DEV =
        './node_modules/oniri-core/src/app.js'
    const WORKLET_PATH_PROD =
        Pear.config.applink +
        '/services/oniri-core/src/app.js'

    const WORKLET_PATH = fromDisk ? WORKLET_PATH_DEV : WORKLET_PATH_PROD

    return { WORKLET_PATH, WORKLET_PATH_DEV, WORKLET_PATH_PROD }
}



export class RpcClient extends ReadyResource {
    constructor(debugMode = false) {
        super()
        this.ipc = null
        this.rpc = null


        this.debugMode = debugMode

        this._logger = {
            log: (...args) => {
                if (!this.debugMode) {
                    return
                }

                console.log(...args)
            },
            error: (...args) => {
                console.error(...args)
            }
        }

        // this.init()
    }

     async _open() {
    // open the resource
    this.init()
  }

  async _close() {
    // close the resource
  }

    handleIncomingMessage(req) {
        //console.log('Incoming RPC message:', req)
        switch (req.command) {
            case API.SEND_NOTIFICATION:
                const parsedData = JSON.parse(req.data)
                this._logger.log('Received event notification:', parsedData)
                this.emit('event', parsedData)
                break
            default:
                this._logger.log('Received unknown incoming message:', req)
        }
    }

    async _handleRequest({ command, data }) {
        const commandName = API_BY_VALUE[command]

        if (!commandName) {
            throw new Error('Unknown command:', command)
        }

        this._logger.log('Sending request:', commandName, data ?? '')

        const req = this.rpc.request(command)

        req.send(data ? JSON.stringify(data) : undefined)

        const res = await req.reply('utf8')

        const parsedRes = JSON.parse(res)

        this._handleError(parsedRes)

        this._logger.log('Received response:', API_BY_VALUE[req.command], parsedRes)

        return parsedRes?.data
    }

    _handleError(parsedRes) {
        const error = parsedRes?.error

        if (error?.includes('ELOCKED')) {
            throw new Error('ELOCKED')
        }

        if (error) {
            throw new Error(error)
        }
    }

    async init() {
        try {
            console.log('Starting IPC with worklet at path:', getWorkletPath().WORKLET_PATH)
            this.ipc = pearRun(getWorkletPath().WORKLET_PATH)
            // this.rpc = new RPC(new FramedStream(this.ipc), (req) => {
            //     //console.log('Handling incoming RPC request:', req)
            //     this.handleIncomingMessage(req)
            // })

            console.log('Setting up RPC client...')

        } catch (error) {
            console.error('Error setting up IPC:', error)
        }
    }


    async sendTestCommand(data) {
        return this._handleRequest({ command: API.TESTCOMMAND, data })
    }

    // service control methods
    async startService(data) {
        return this._handleRequest({ command: API.START_ONIRI_SERVICE, data })
    }

    async stopService() {
        return this._handleRequest({ command: API.STOP_ONIRI_SERVICE })
    }

    async restartService() {
        return this._handleRequest({ command: API.RESTART_ONIRI_SERVICE })
    }

    async getStatus() {
        return this._handleRequest({ command: API.GET_STATUS })
    }

    // Configuration methods
    async configure(password, seed) {
        return this._handleRequest({
            command: API.CONFIGURE,
            data: { password, seed }
        })
    }

    async resetConfig() {
        return this._handleRequest({ command: API.RESET_CONFIG })
    }

    // Logs methods
    async getLogs(logType) {
        return this._handleRequest({
            command: API.GET_LOGS,
            data: { logType }
        })
    }

    // Settings methods
    async setAutoLaunch(enabled) {
        return this._handleRequest({
            command: API.SET_AUTO_LAUNCH,
            data: { enabled }
        })
    }

    async setAutoStartDaemon(enabled) {
        return this._handleRequest({
            command: API.SET_AUTO_START_DAEMON,
            data: { enabled }
        })
    }

    // Services methods
    async getAllServices() {
        return this._handleRequest({ command: API.GET_ALL_SERVICES })
    }
}



