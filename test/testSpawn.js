/** @typedef {import('pear-interface')} */ /* global Pear */
import { isBare, platform, arch, isWindows, isLinux } from 'which-runtime'
 

import { spawn } from 'bare-daemon'
import process from 'bare-process'
//import subprocess from 'bare-subprocess'
// import pearRun from 'pear-run'

// import IPC from 'bare-ipc'
import fs from 'bare-fs'
import path from 'bare-path'


const SOCKET_PATH = isWindows
    ? '\\\\.\\pipe\\my-bare-pipe'
    : '/tmp/my-bare-pipe.sock';


const init = async () => {
    try {
        // console.log('Starting Oniri IPC client...');
        // Check if the IPC server is already running
        if (fs.existsSync(SOCKET_PATH)) {

            console.log(' IPC server is already running. Connecting to it...');

        } else {

         
            // console.log('Starting Oniri IPC server...');
            const child = spawn(
                "/Users/sce9sc/.nvm/versions/node/v18.20.5/bin/bare",        // or just "myExecutable" if in PATH
                ["server.js"],          // arguments
                {
                    detached: true,
                }
            );
            console.log(`Started IPC server with PID: ${child.pid}`);
        

            // Wait a bit to ensure supervisor started and wrote PID file
            await new Promise(resolve => setTimeout(resolve, 1500));
            console.log('Connecting to IPC server...');
            throw new Error('Exiting for test purposes');

           
        }
    } catch (err) {
        console.error("Error initializing IPC client:", err);
      

    }
}

init()

