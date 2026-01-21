/** @typedef {import('pear-interface')} */ /* global Pear */
import { isBare, platform, arch, isWindows, isLinux } from 'which-runtime'
import { header, footer, summary, command, flag, arg, bail, description, validate } from 'paparam'
// import minimist from 'minimist' // Required to parse CLI arguments

import process from 'bare-process'
import { spawn } from 'bare-daemon'
// import pearRun from 'pear-run'

// import IPC from 'bare-ipc'
import IPC from 'pear-ipc'
import fs, { stat } from 'bare-fs'
import https from 'bare-https'
import path from 'bare-path'
import { URL } from 'bare-url'
// import path from 'bare-path'
// import os from 'bare-os'

const SOCKET_PATH = isWindows
    ? '\\\\.\\pipe\\my-bare-pipe'
    : '/tmp/my-bare-pipe.sock';


async function downloadFile(urlString, output) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(output)
        let downloaded = 0
        let total = 0

        // Parse the URL
        const url = new URL(urlString)
        const options = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname + url.search,
            method: 'GET'
        }

        const req = https.request(options, (res) => {
            total = parseInt(res.headers['content-length'], 10) || 0

             const drawBar = (percent) => {
        const width = 40
        const filled = Math.round((percent / 100) * width)
        const empty = width - filled
        process.stdout.write(`\r[${'█'.repeat(filled)}${' '.repeat(empty)}] ${percent.toFixed(2)}%`)
      }

      res.on('data', (chunk) => {
        downloaded += chunk.length
        if (total) {
          drawBar((downloaded / total) * 100)
        }
      })

            res.pipe(file)

            file.on('close', () => {
                console.log(` Download complete: ${output}`)
                resolve()
            })

            res.on('error', reject)
            file.on('error', reject)
        })

        req.on('error', reject)
        req.end()
    })
}

function table(headers, rows, options = {}) {
    const align = options.align || headers.map(() => 'left')
    const maxWidth = options.width || process.stdout.columns || 80 // default terminal width

    // Normalize rows
    rows = rows.map(r => headers.map((_, i) => r[i] ?? ''))

    // Convert all to strings
    const all = [headers, ...rows].map(row => row.map(c => String(c)))

    // Compute column widths
    const colWidths = headers.map((_, i) => {
        const maxCell = Math.max(...all.map(r => r[i].length))
        return maxCell
    })

    // Total width including padding and borders
    let totalWidth = colWidths.reduce((a, b) => a + b, 0) + colWidths.length * 3 + 1

    // Scale columns if total exceeds maxWidth
    if (totalWidth > maxWidth) {
        const scale = (maxWidth - colWidths.length * 3 - 1) / colWidths.reduce((a, b) => a + b, 0)
        for (let i = 0; i < colWidths.length; i++) {
            colWidths[i] = Math.max(1, Math.floor(colWidths[i] * scale))
        }
    }

    // Helper to truncate text
    const truncate = (text, width) =>
        text.length > width ? text.slice(0, width - 1) + '…' : text

    // Helper for line
    const line = (left, mid, right) =>
        left + colWidths.map(w => '─'.repeat(w + 2)).join(mid) + right

    // Helper to render a row
    const renderRow = (row) => {
        return '│' +
            row.map((c, i) => {
                const t = truncate(String(c), colWidths[i])
                return ' ' + (align[i] === 'right' ? t.padStart(colWidths[i]) : t.padEnd(colWidths[i])) + ' '
            }).join('│') +
            '│'
    }

    const top = line('┌', '┬', '┐')
    const headerLine = renderRow(headers)
    const mid = line('├', '┼', '┤')
    const body = rows.map(renderRow).join('\n')
    const bottom = line('└', '┴', '┘')

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

let client
let serverProcess = null;


async function exit() {
    if (client !== undefined) {
        client.close()

    }
    process.exit(0);
}


const init = async (startServer = true) => {
    try {

        // console.log('Starting Oniri IPC client...');
        // Check if the IPC server is already running
        if (fs.existsSync(SOCKET_PATH)) {

            // Connect to the existing IPC server
            client = new IPC.Client({
                socketPath: SOCKET_PATH,
                methods,
                connect: true
            })
            await client.ready()
            return true
        } else {
            // Start the IPC server

            //console.log('No existing Service is running. Starting new Oniri Service...');
            // TODO: check if oniri-service binary exists, if not, download it 
            // if(fs.existsSync('oniri-service')) {

                // const url = 'https://ash-speed.hetzner.com/100MB.bin'
                // const output = '100MB.bin'

                // console.log('Downloading file...')
                // await downloadFile(url, output)
                // console.log('Download complete!')

            // }
           

            if (!startServer) {
                return false
            }

            // console.log('Starting Oniri IPC server...');
            const child = spawn(
                "/Users/sce9sc/.nvm/versions/node/v18.20.5/bin/bare",        // or just "myExecutable" if in PATH
                ["/Users/sce9sc/Documents/work/oniriTunnel-terminal-app/server.js"],          // arguments
                {
                    detached: true,
                }
            );

            // Wait a bit to ensure supervisor started and wrote PID file
            await new Promise(resolve => setTimeout(resolve, 1500));
            console.log('Connecting to Oniri IPC server...');

            // Start client after server is ready
            client = new IPC.Client({
                socketPath: SOCKET_PATH,
                methods,
                connect: true
            })

            await client.ready()
            return true
        }
    } catch (err) {
        console.error("Error initializing Oniri IPC client:", err);
        return false
    }
}

const RunCommand = async () => {

    const commands = {
        oniri: {
            name: "oniri",
            execute: async (flags, args) => {
                console.log( "\n","Please specify a subcommand. Use --help for more information.", "\n") 
            },
            shouldContinue: false
        },
        start: {
            name: "start",
            execute: async (flags, args) => {
                // console.log("start command executed", flags, args)
                const startRes = await client.START_ONIRI_SERVICE()
                const startResData = JSON.parse(startRes)
                // console.log('Start response data:', startResData)
                if (startResData.error) {
                    console.error('Error starting Oniri Service:', startResData.error)
                } else {
                    startResData.data.started && console.log('Oniri Service started successfully')
                }
                await commands.status.execute({}, [])
                console.log('You can now use "oniri status" to check the service status.');
            },
            shouldContinue: true
        },
        stop: {
            name: "stop",
            execute: async (flags, args) => {
                // console.log("stop command executed", flags, args)
                const stopRes = await client.STOP_ONIRI_SERVICE()
                const stopResData = JSON.parse(stopRes)
                // console.log('Stop response data:', stopResData)
                if (stopResData.error) {
                    console.error('Error stopping Oniri Service:', stopResData.error)
                } else {
                    stopResData.stopped && console.log('Oniri Service stopped successfully:', stopResData.data)
                }
                await client.close()
            },
            shouldContinue: false
        },
        reset: {
            name: "reset",
            execute: async (flags, args) => {
                // console.log("reset command executed", flags, args)
                // let answer = await askQuestion("Do you want to continue? (yes/no): ");
                // if (answer.toLowerCase() !== 'yes') {
                //     console.log("Configuration Aborted by user.");
                //     return;
                // }
                const res = await client.RESET_CONFIG()
                const resData = JSON.parse(res)
                if (resData.error) {
                    console.error('Error resetting Oniri Service configuration:', resData.error)
                    return
                } else {
                    console.log('Oniri Service configuration reset successfully:', resData)
                }
                // console.log("reset command executed", flags, args)
            },
            shouldContinue: false
        },
        config: {
            name: "config",
            execute: async (flags, args) => {
                console.log("configuration started", flags, args)
                const res = await client.CONFIGURE({ password: flags.pass, seed: flags.seed })
                const resData = JSON.parse(res)
                if (resData.error) {
                    console.error('Error configuring Oniri Service:', resData.error)
                    return
                } else {
                    console.log('Oniri Service configured successfully:', resData)
                }
                console.log("config command executed")
            },
            shouldContinue: false
        },
        status: {
            name: "status",
            shouldContinue: false,
            execute: async (flags, args) => {
                const statusRes = await client.GET_STATUS()
                const statusResData = JSON.parse(statusRes)
                if (statusResData.error) {
                    console.error('Error getting Oniri Service status:', statusResData.error)
                } else {
                    console.log(table(
                                ["Configured", "Status", "Pid", "Service Status","Uptime"],
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

    const start = command(
        commands.start,
        header('Start the server'),
        footer('Use this command to start the server'),
    )

    const stop = command(
        commands.stop,
        header('Stop the server'),
        footer('Use this command to stop the server'),
    )

    const config = command(
        commands.config,
        header('Configure the Oniri Tunnel Service'),
        flag('--seed|-s [seed]', 'The client seed found in oniricloud.com dashboard'),
        flag('--pass|-p [pass]', 'The password for the Oniri client'),
        //  flag('--flag [val] ', 'Test flag').choices(['val1', 'val2', 'val3'])
        validate((p) => (p.flags.seed && p.flags.pass), "You must provide both client seed and password")

    )

    const reset = command(
        commands.reset,
        header('Reset the Configuration'),
        footer('Use this command to reset the configuration'),
    )

    const status = command(
        commands.status,
        header('Get the Oniri Service status'),
        footer('Use this command to get the Oniri Service status'),
    )

    const cmd = command(
        commands.oniri,
        description('Command line interface for Oniri services'),
        header('Welcome to the Oniri Tunnel CLI'),
        footer('oniricloud.com'),
        start,
        stop,
        reset,
        config,
        status,
        bail((bail) => {
            if (bail.reason === "UNKNOWN_FLAG" || bail.reason === "UNKNOWN_ARG") {
                console.log("\n", "========= No such command found =========", "\n")
            } else {
                console.log("\n", "=========", bail.reason, "===========", "\n")
            }
        })
    )

    const program = cmd.parse()

    if (program == null) {
        console.log("\n", "You can always run the help command: --help", "\n")
    } else {

        //console.log("Program Name:", program.name)
        //console.log()
        if (!!commands[program.name]) {
            console.log("Executing Oniri command:", program.name)
            if (commands[program.name]?.execute) {
                const shouldContinue = await init(commands[program.name]?.shouldContinue)
                if (!shouldContinue) {
                    if (!commands[program.name]?.shouldContinue) {
                        console.log("\n", "No running Oniri Service found to stop.", "\n")
                        console.log("Run 'oniri start' to start the service.")
                    } else {
                        console.log("Could not initialize IPC client. Exiting.")
                    }
                    return
                }
                await commands[program.name].execute(program.flags, program.args)
                console.log("Command executed:", program.name)

                // Close client connection and exit

            } else {
                console.log("No execute function for this command")
                cmd.parse(['--help'])

            }

        } else {
            console.log("Unknown command:", program.name)

        }

    }



    //If no program was parsed, close client and exit
    if (client) {
        // console.log("Closing client connection...")
        // client.unref() // Don't keep process alive
        await client.close() // Clean shutdown

    }
    console.log("------------------------------------------------------")



}



process
    .on('unhandledRejection', (reason, p) => {
        console.error(reason, 'Unhandled Rejection at Promise', p);
        //client.close()
    })
    .on('uncaughtException', err => {
        if (err.message === 'RPC destroyed') {
            console.log('Connection to Oniri service closed.');
        }
    });

await RunCommand()



