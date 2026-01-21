/** @typedef {import('pear-interface')} */ /* global Pear */
import { isBare, platform, arch, isWindows, isLinux } from 'which-runtime'
import goodbye from 'graceful-goodbye'
import { header, footer, summary, command, flag, arg, bail, description, validate } from 'paparam'
// import pearRun from 'pear-run'

// import IPC from 'bare-ipc'
import process from 'bare-process'
import IPC from 'pear-ipc'
import FramedStream from 'framed-stream'

import RPC from 'bare-rpc'
import path from 'bare-path'
import pipe from "bare-pipe"

import readline from 'bare-readline'  // Module for reading user input in terminal
import tty from 'bare-tty'

import oniriService from './services/oniri-core/src/oniriService/oniriService.js'
import { setEncKey, getEncKey, delEncKey } from './services/oniri-core/src/oniriService/encKey.js'
import fs from 'bare-fs'
import os from 'os'
import { logger } from './services/oniri-core/src/logger/index.js'

// const { versions } = Pear
console.log('\n', 'Oniri Service running', '\n')
console.log('\n', 'use --help for available commands', '\n')
// console.log(await versions())

const SOCKET_PATH = isWindows
    ? '\\\\.\\pipe\\my-bare-pipe'
    : '/tmp/my-bare-pipe.sock';

const rl = readline.createInterface({
    input: new tty.ReadStream(0),
    output: new tty.WriteStream(1)
})

// Global state
let rpc
let oniriServiceInstance = null
let oniriServiceInstanceInitialized = false
let serviceStartTime = null  // Track when service was started
let settings = {
    autoLaunch: false,
    autoStartDaemon: false
}
let server = null
let isConfigured = false;
let showTty = true

function table(headers, rows, options = {}) {
    const align = options.align || headers.map(() => 'left')
    const maxWidth = options.width || process.stdout.columns || 80

    const forceUnicode = options.unicode === true

    const B = (!isWindows || forceUnicode)
        ? {
            topL: '┌', topM: '┬', topR: '┐',
            midL: '├', midM: '┼', midR: '┤',
            botL: '└', botM: '┴', botR: '┘',
            h: '─', v: '│'
        }
        : {
            topL: '+', topM: '+', topR: '+',
            midL: '+', midM: '+', midR: '+',
            botL: '+', botM: '+', botR: '+',
            h: '-', v: '|'
        }

    // Normalize rows
    rows = rows.map(r => headers.map((_, i) => r[i] ?? ''))

    // Convert all to strings
    const all = [headers, ...rows].map(row => row.map(c => String(c)))

    // Compute column widths
    let colWidths = headers.map((_, i) =>
        Math.max(...all.map(r => r[i].length))
    )

    // Compute total width
    const borderWidth = colWidths.length * 3 + 1
    let totalWidth = colWidths.reduce((a, b) => a + b, 0) + borderWidth

    // Scale columns if needed
    if (totalWidth > maxWidth) {
        const scale =
            (maxWidth - borderWidth) /
            colWidths.reduce((a, b) => a + b, 0)

        colWidths = colWidths.map(w =>
            Math.max(1, Math.floor(w * scale))
        )
    }

    // Truncate helper
    const truncate = (text, width) =>
        text.length > width
            ? text.slice(0, width - 1) + '…'
            : text

    // Line helper
    const line = (left, mid, right) =>
        left +
        colWidths.map(w => B.h.repeat(w + 2)).join(mid) +
        right

    // Row renderer
    const renderRow = (row) =>
        B.v +
        row.map((c, i) => {
            const t = truncate(String(c), colWidths[i])
            return (
                ' ' +
                (align[i] === 'right'
                    ? t.padStart(colWidths[i])
                    : t.padEnd(colWidths[i])) +
                ' '
            )
        }).join(B.v) +
        B.v

    const top = line(B.topL, B.topM, B.topR)
    const headerLine = renderRow(headers)
    const mid = line(B.midL, B.midM, B.midR)
    const body = rows.map(renderRow).join('\n')
    const bottom = line(B.botL, B.botM, B.botR)

    return [top, headerLine, mid, body, bottom].join('\n')
}


const methods = [
    { id: 102, name: 'START_ONIRI_SERVICE' },
    { id: 103, name: 'STOP_ONIRI_SERVICE' },
    { id: 104, name: 'GET_ONIRI_SERVICE_STATUS' },
    { id: 105, name: 'SEND_NOTIFICATION' },
    { id: 106, name: 'RESTART_ONIRI_SERVICE' },
    { id: 107, name: 'GET_STATUS' },
    { id: 108, name: 'CONFIGURE' },
    { id: 109, name: 'RESET_CONFIG' },
    { id: 110, name: 'GET_LOGS' },
    { id: 111, name: 'SET_AUTO_LAUNCH' },
    { id: 112, name: 'SET_AUTO_START_DAEMON' },
    { id: 113, name: 'GET_ALL_SERVICES' },
    { id: 114, name: 'GET_ALLOWED_LIST' },
]

const handleRpcCommand = {

    START_ONIRI_SERVICE: async (data) => {
        try {
            if (!oniriServiceInstance) {
                logger.info('Starting Oniri service...');
                oniriServiceInstance = await oniriService(rpc);
                isConfigured = oniriServiceInstance.isConfigured()

                if (!isConfigured) {
                    logger.warn('No configuration found');
                    return JSON.stringify({ data: { started: false, msg: 'No configuration found' } })
                }

                oniriServiceInstance.init()
                oniriServiceInstanceInitialized = true
                serviceStartTime = Date.now();
                return JSON.stringify({ data: { started: true } })
            } else {
                if (!oniriServiceInstanceInitialized) {
                    isConfigured = oniriServiceInstance.isConfigured()

                    if (!isConfigured) {
                        logger.warn('No configuration found');
                        return JSON.stringify({ data: { started: false, msg: 'No configuration found' } })
                    }
                    oniriServiceInstance.init()
                    oniriServiceInstanceInitialized = true
                    serviceStartTime = Date.now();
                    return JSON.stringify({ data: { started: true } })
                }
                logger.warn('Oniri service already running');
                return JSON.stringify({ data: { started: true } })
            }
        } catch (error) {
            logger.error('Error starting Oniri service:', error);
            return JSON.stringify({ data: { started: false, error: error.message } })
        }
    },


    STOP_ONIRI_SERVICE: async (data) => {
        try {
            if (oniriServiceInstance) {
                logger.info('Stopping Oniri service...');
                // Properly close the Oniri client instance
                if (oniriServiceInstance.isInitialized) {
                    await oniriServiceInstance.close();
                }
                oniriServiceInstance = null;
                oniriServiceInstanceInitialized = false;
                serviceStartTime = null;
                //server.close()
                return JSON.stringify({ data: { started: false } })
            } else {
                logger.warn('Oniri service not running');
                return JSON.stringify({ data: { started: false } })
            }
        } catch (error) {
            logger.error('Error stopping Oniri service:', error);
            return JSON.stringify({ error: error.message })
        }
    },


    RESTART_ONIRI_SERVICE: async (data) => {
        try {
            logger.info('Restarting Oniri service...');
            // Close existing instance if running
            if (oniriServiceInstance && oniriServiceInstance.isInitialized) {
                await oniriServiceInstance.close();
            }
            oniriServiceInstance = null;
            serviceStartTime = null;
            // Start new instance
            oniriServiceInstance = await oniriService(rpc);
            oniriServiceInstance.init()
            oniriServiceInstanceInitialized = true

            serviceStartTime = Date.now();
            return JSON.stringify({ data: { started: true } })
        } catch (error) {
            logger.error('Error restarting Oniri service:', error);
            return JSON.stringify({ data: { started: false, error: error.message } })
        }
    },

    GET_ONIRI_SERVICE_STATUS: async (data) => {
        return JSON.stringify({
            data: oniriServiceInstance ? 'running' : 'stopped'
        })
    },


    GET_STATUS: async (data) => {
        try {

            if (!oniriServiceInstance?.isInitialized) {
                return JSON.stringify({ error: "Not Started" })
            }
            const encData = getEncKey();
            const configured = !!encData.encKey;

            // Get actual services if instance is running
            let servicesData = { local: {}, remote: {} };
            if (oniriServiceInstance && oniriServiceInstance.isInitialized) {
                servicesData = oniriServiceInstance.getAllServices()
            }

            return JSON.stringify({
                data: {
                    daemon: {
                        status: 'online',
                        pid: Bare.pid || 0,
                        uptime: Date.now()
                    },
                    service: {
                        status: oniriServiceInstance ? 'online' : 'offline',
                        uptime: serviceStartTime || null
                    },
                    configured,
                    services: servicesData,
                    autoLaunch: settings.autoLaunch,
                    autoStartDaemon: settings.autoStartDaemon
                }
            })
        } catch (error) {
            logger.error('Error getting status:', error);
            return JSON.stringify({ error: error.message })
        }
    },

    CONFIGURE: async (data) => {
        try {
            const { password, seed } = data;

            if (!password || !seed) {
                return JSON.stringify({
                    error: 'Password and seed are required'
                })

            }

            logger.info('Saving configuration...');

            // Save encryption key
            oniriServiceInstance = await oniriService(rpc);
            const res = await oniriServiceInstance.setConfiguration(password, seed);
            oniriServiceInstance.init()
            oniriServiceInstanceInitialized = true
            serviceStartTime = Date.now();

            if (!res) {
                return JSON.stringify({
                    status: false,
                    error: 'Failed to save configuration'
                })
            }

            logger.info('Configuration saved successfully');
            return JSON.stringify({ data: { status: true } })
        } catch (error) {
            logger.error('Error saving configuration:', error);
            return JSON.stringify({
                status: false,
                error: `Failed to save configuration: ${error.message}`
            })
        }
    },


    RESET_CONFIG: async (data) => {
        try {
            logger.info('Resetting configuration...');

            if (oniriServiceInstance && oniriServiceInstance.isInitialized) {
                await oniriServiceInstance.close();
            }
            oniriServiceInstance = null;
            serviceStartTime = null;

            // Delete encryption key
            delEncKey(false, false);

            // Delete config.json if it exists
            const configPath = path.join(os.homedir(), '.oniri', 'config.json');
            if (fs.existsSync(configPath)) {
                fs.unlinkSync(configPath);
            }

            logger.info('Configuration reset successfully');
            return JSON.stringify({ data: 'Configuration reset' })
        } catch (error) {
            logger.error('Error resetting configuration:', error);
            return JSON.stringify({ error: error.message })
        }

    },
    GET_LOGS: async (data) => {
        try {
            const { logType } = data;
            const logsDir = path.join(os.homedir(), '.oniri', 'logs');
            const logFile = logType === 'error' ? 'error.log' : 'output.log';
            const logPath = path.join(logsDir, logFile);

            logger.info('Reading logs:', logPath);

            if (fs.existsSync(logPath)) {
                const logs = fs.readFileSync(logPath, 'utf8');
                return JSON.stringify({ logs })
            } else {
                return JSON.stringify({
                    logs: `No ${logType} logs found.\nLog file: ${logPath}`
                })
            }
        } catch (error) {
            logger.error('Error reading logs:', error);
            return JSON.stringify({
                logs: `Error reading logs: ${error.message}`
            })
        }
    },


    SET_AUTO_LAUNCH: async (data) => {
        try {
            const { enabled: autoLaunchEnabled } = data;
            logger.info('Setting auto-launch:', autoLaunchEnabled);
            settings.autoLaunch = autoLaunchEnabled;

            // TODO: Implement OS-specific auto-launch
            // For macOS: Create/remove LaunchAgent plist
            // For Windows: Create/remove registry entry
            // For Linux: Create/remove .desktop file in autostart

            return JSON.stringify({ data: 'Auto-launch setting updated' })
        } catch (error) {
            logger.error('Error setting auto-launch:', error);
            return JSON.stringify({ error: error.message })
        }
    },

    SET_AUTO_START_DAEMON: async (data) => {
        try {
            const { enabled: autoStartEnabled } = data;
            logger.info('Setting auto-start daemon:', autoStartEnabled);
            settings.autoStartDaemon = autoStartEnabled;
            return JSON.stringify({ data: 'Auto-start daemon setting updated' })
        } catch (error) {
            logger.error('Error setting auto-start daemon:', error);
            return JSON.stringify({ error: error.message })
        }
    },

    GET_ALL_SERVICES: async (data) => {
        try {
            logger.info('Getting all services');

            let localServices = {};
            let remoteServices = {};

            if (oniriServiceInstance && oniriServiceInstance.isInitialized) {
                // Get actual services from Oniri instance
                const allLocalServices = oniriServiceInstance.getLocalServices();
                const allRemoteServices = oniriServiceInstance.getRemoteServices();

                localServices = allLocalServices || {};
                remoteServices = allRemoteServices || {};
            }

            return JSON.stringify({
                data: {
                    local: localServices,
                    remote: remoteServices
                }
            })

        } catch (error) {
            logger.error('Error getting services:', error);
            return JSON.stringify({ error: error.message })
        }
    },


    GET_ALLOWED_LIST: async (data) => {
        try {
            logger.info('Getting allowed list');

            let allowedList = {};

            if (oniriServiceInstance && oniriServiceInstance.isInitialized) {
                // Get actual allowed list from Oniri instance
                const allAllowedList = oniriServiceInstance.getServerAllowedList(serviceKey);

                allowedList = allAllowedList || {};
            }

            return JSON.stringify({
                data: allowedList
            })
        } catch (error) {
            logger.error('Error getting allowed list:', error);
            return JSON.stringify({ error: error.message })
        }
    }


}



const init = async () => {
    if (fs.existsSync(SOCKET_PATH)) {
        fs.unlinkSync(SOCKET_PATH);
    }
    server = new IPC.Server({
        socketPath: SOCKET_PATH,
        methods,
        handlers: handleRpcCommand
    })

    server.on('close', () => {
        console.log('IPC server closed')
        process.exit(0);
    })

    await server.ready()

}

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Application specific logging, throwing an error, or other logic here
});
goodbye(() => {
    console.log("Received termination signal, shutting down...")
    if (server !== null) {
        server.close()
    }
})

const runService = async () => {



    const commands = {
        oniriTunnel: {
            name: "oniriTunnel",
            execute: async (flags, args) => {
                console.log("\n", "To start the service you need to run 'oniriTunnel start' or use --help", "\n")

            },
            shouldContinue: false
        },
        stop: {
            name: "stop",
            execute: async (flags, args) => {
                // console.log("stop command executed", flags, args)
                const stopRes = await handleRpcCommand.STOP_ONIRI_SERVICE()
                const stopResData = JSON.parse(stopRes)
                // console.log('Stop response data:', stopResData)
                if (stopResData.error) {
                    console.error('Error stopping Oniri Service:', stopResData.error)
                } else {
                    stopResData.stopped && console.log('Oniri Service stopped successfully')
                }

            },
            shouldContinue: false
        },
        exit: {
            name: "exit",
            execute: async (flags, args) => {
                // console.log("stop command executed", flags, args)
                process.exit()

            },
            shouldContinue: false
        },
        start: {
            name: "start",
            execute: async (flags, args) => {
                // console.log("start command executed", flags, args)
                const startRes = await handleRpcCommand.START_ONIRI_SERVICE()
                const startResData = JSON.parse(startRes)
                // console.log('Start response data:', startResData)
                if (startResData.error) {
                    console.error('Error starting Oniri Service:', startResData.error)
                } else {
                    if (startResData.data.msg) {
                        console.error('Oniri Service could not start:', startResData.data.msg)
                        return
                    }
                    startResData.data.started && console.log('Oniri Service started successfully')
                    await commands.status.execute({}, [])
                }


            },
            shouldContinue: true
        },
        reset: {
            name: "reset",
            execute: async (flags, args) => {
                const res = await handleRpcCommand.RESET_CONFIG()
                const resData = JSON.parse(res)
                if (resData.error) {
                    console.error('Error resetting Oniri Service configuration:', resData.error)
                    return
                } else {
                    console.log('Oniri Service configuration reset successfully:')
                }
                // console.log("reset command executed", flags, args)
            },
            shouldContinue: false
        },
        config: {
            name: "config",
            execute: async (flags, args) => {
                console.log("Configuring Oniri Service with seed and password...", flags.pass, flags.seed)
                if (flags.notty) {
                    showTty = false
                }
                const res = await handleRpcCommand.CONFIGURE({ password: flags.pass, seed: flags.seed })
                const resData = JSON.parse(res)
                if (resData.error) {
                    console.error('Error configuring Oniri Service:', resData.error)
                    return
                } else {
                    console.log('Oniri Service configured successfully:')
                }
                console.log("config command executed")
            },
            shouldContinue: false
        },

        status: {
            name: "status",
            shouldContinue: false,
            execute: async (flags, args) => {
                const statusRes = await handleRpcCommand.GET_STATUS();
                const statusResData = JSON.parse(statusRes)
                if (statusResData.error) {
                    console.error('Error getting Oniri Service status:', statusResData.error)
                } else {
                    console.log(table(
                        ["Configured", "Status", "Pid", "Service Status", "Uptime"],
                        [[
                            statusResData.data.configured,
                            statusResData.data.daemon.status,
                            statusResData.data.daemon.pid, statusResData.data.service.status,
                            statusResData.data.service.uptime
                        ]]
                    ));
                    if (statusResData.data.configured) {
                        if (statusResData.data.services.remotes.length > 0) {
                            console.log("\n", `Remotes:`, "\n")
                            console.log(table(
                                ["name", "port", "host", "started"],
                                statusResData.data.services.remotes.map(remote => [remote.name, remote.proxyPort, remote.proxyHost, remote.started]),
                                { width: 100, align: ['left', 'left', 'center'] }
                            ));
                        }

                        if (statusResData.data.services.local.length > 0) {
                            console.log("\n", `Locals:`, "\n")
                            console.log(table(
                                ["name", "port", "host", "started"],
                                statusResData.data.services.local.map(local => [local.name, local.targetPort, local.targetHost, local.started]),
                                { width: 100, align: ['left', 'left', 'center'] }
                            ));
                            console.log("\n", `Allowed Store:`, "\n");
                            console.log(table(
                                ["name", "allowed"],
                                statusResData.data.services.local.reduce((acc, local) => {
                                    const res = Object.values(local.allowedStore.store[local.serviceKey]).map(allowed => {
                                        return [local.name, allowed]
                                    })
                                    acc.push(...res)
                                    return acc
                                }, []),
                                { width: 100, align: ['left', 'left', 'center'] }
                            ));

                            // console.log("\n", `------------------------------`, "\n")
                        }
                    }


                }
            }
        }


    }
    // Initialization logic here

    const start = command(
        commands.start.name,
        header('Start the server'),
        summary('start the Oniri Tunnel Service'),
        footer('Use this command to start the server'),
    )

    const config = command(
        commands.config.name,
        header('Configure the Oniri Tunnel Service'),
        summary('config --seed <seed> --pass <password> -notty (-n disable tty) used when running in docker'),
        flag('--seed|-s [seed]', 'The client seed found in oniricloud.com dashboard'),
        flag('--pass|-p [pass]', 'The password for the Oniri client'),
        flag('--notty|-n', 'Disable TTY mode'),
        //  flag('--flag [val] ', 'Test flag').choices(['val1', 'val2', 'val3'])
        validate((p) => (p.flags.seed && p.flags.pass), "You must provide both client seed and password")

    )

    const reset = command(
        commands.reset.name,
        header('Reset the Configuration'),
        summary('Reset the Configuration of Oniri Tunnel Service'),
        footer('Use this command to reset the configuration'),
    )

    const status = command(
        commands.status.name,
        header('Get the Oniri Service status'),
        footer('Use this command to get the Oniri Service status'),
    )

    const stop = command(
        commands.stop.name,
        header('Stop the server'),
        footer('Use this command to stop the server'),
    )

    const exit = command(
        commands.exit.name,
        header('Exit the server'),
        footer('Use this command to exit the server'),
    )

    const cmd = command(
        commands.oniriTunnel.name,
        description('Command line interface for OniriTunnel service'),
        header('Welcome to the Oniri Tunnel CLI'),
        footer('oniricloud.com'),
        start,
        reset,
        config,
        status,
        stop,
        exit,
        bail((bail) => {
            if (bail.reason === "UNKNOWN_FLAG" || bail.reason === "UNKNOWN_ARG") {
                console.log("\n", "========= No such command found =========", "\n")
            } else {
                console.log("\n", "=========", bail.reason, "===========", "\n")
            }
        })
    )

    await commands.start.execute({}, [])




    const initcmd = command(
        "oniriTunnel",
        description('Command line interface for OniriTunnel service'),
        header('Welcome to the Oniri Tunnel CLI'),
        footer('oniricloud.com'),
        config,
        bail((bail) => {
            if (bail.reason === "UNKNOWN_FLAG" || bail.reason === "UNKNOWN_ARG") {
                console.log("\n", "========= No such command found =========", "\n")
            } else {
                console.log("\n", "=========", bail.reason, "===========", "\n")
            }
        })
    )

    const initcmdParsed = initcmd.parse(process.argv.slice(1))
    if (initcmdParsed == null) {
        // console.log("\n", "You need to configure the Oniri Tunnel Service before using it. Use the config command.", "\n")
        // process.exit(0)
    } else {
        if (initcmdParsed.name === "config") {
            if (!isConfigured) {
                console.log("Configuring Oniri Tunnel Service...")
                await commands.config.execute(initcmdParsed.flags, initcmdParsed.args)
                console.log("\n", "Oniri Tunnel Service configured successfully.", "\n")
            }else{
                if(initcmdParsed.flags.notty){
                    showTty = false
                }
                console.log("\n", "Oniri Tunnel Service is already configured.", "\n")
            }
        } else {
            // console.log("\n", "You need to configure the Oniri Tunnel Service before using it. Use the config command.", "\n")
            // process.exit(0)
        }
    }

    if (showTty) {

        rl.setPrompt('oniri> ')
        rl.input.setMode(tty.constants.MODE_RAW) // Enable raw input mode for efficient key reading

        rl.on('data', async (line) => {
            const argv = line.toString().trim().split(' ').filter(Boolean)
            const program = cmd.parse(argv)
            if (program == null) {
                console.log("\n", "You can always run the help command: --help", "\n")
            } else {

                if (!!commands[program.name]) {
                    console.log("Executing Oniri command:", program.name)
                    if (commands[program.name]?.execute) {
                        // await init()
                        await commands[program.name].execute(program.flags, program.args)
                        //console.log("Command executed:", program.name)
                    } else {
                        console.log("No execute function for this command")
                        cmd.parse(['--help'])

                    }

                } else {
                    console.log("Unknown command:", program.name)

                }

            }
            rl.prompt()
        })
        rl.prompt()

        rl.on('close', () => {
            process.exit()
        })
    }
    //console.log("Parsing command line arguments...",process.argv.slice(1))


}
// await start()
await runService()


