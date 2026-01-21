/** @typedef {import('pear-interface')} */ /* global Pear */
import {isBare, platform, arch, isWindows, isLinux } from 'which-runtime'

// import pearRun from 'pear-run'

// import IPC from 'bare-ipc'
import IPC from 'pear-ipc'
import FramedStream from 'framed-stream'

import RPC from 'bare-rpc'
import path from 'bare-path'
import pipe from "bare-pipe"

const { versions } = Pear
console.log('Pear terminal application running')
console.log(await versions())

const SOCKET_PATH = isWindows
    ? '\\\\.\\pipe\\my-bare-pipe'
    : '/tmp/my-bare-pipe.sock';



let rpc = null

const createRPC = (ipc) => {
    const rpc = new RPC(ipc, (req) => {
        try {
            console.log('RPC request received:', req)
        } catch (error) {
            req.reply(
                JSON.stringify({
                    error: `Unexpected error: ${error} `
                })
            )
        }
    })
    return rpc
}

export const setupServerIPC = () => {
    const server = pipe.createServer()
    server
        .on('connection', (pipe) => {
            pipe.on('data', (data) => console.log(data.toString())).end()
        })
        .listen(SOCKET_PATH)

    return server
}

export const setupClientIPC = () => {
    const ipc = pipe.createConnection(SOCKET_PATH)//Pear.worker.pipe() 
    ipc.on('close', async () => {
        // eslint-disable-next-line no-undef
        //Bare.exit(0)
    })

    ipc.on('end', async () => {
        // eslint-disable-next-line no-undef
        //Bare.exit(0)
    })

    return ipc
}

async function start() {


    // console.log('isBare:', isBare)
    // const pipe = setupServerIPC()

    // const rpc = createRPC(pipe)

    // console.log('RPC server started on socket:', rpc)

    // const pipeClient = setupClientIPC()

    // const rpcClient = createRPC(pipeClient)

    // rpcClient.call('ping', { time: Date.now() }).then((response) => {
    //   console.log('Received response from ping:', response)
    // }).catch((error) => {
    //   console.error('Error calling ping:', error)
    // })



    // const IPCSertver = new IPC.Server({socketPath: SOCKET_PATH})

    // IPCSertver.on('connection', (ipc) => {
    //   console.log('Client connected to IPC server') })

    //   await IPCSertver.ready()

    // const rpc = createRPC(IPCSertver)


    // const IPCClient = new IPC.Client({socketPath: SOCKET_PATH})
    // await IPCClient.ready()

    // IPCClient.on('connect', () => {
    //   console.log('Connected to IPC server')
    // })

    // const rpcClient = createRPC(IPCClient)

//       const server = pipe.createServer()
//   server
//     .on('close', () => console.log('server closed'))
//     // .on('connection', (pipe) => {
//     //   pipe
//     //     .on('close', () => console.log('server socket closed'))
//     //     .on('data', (data) => console.log(data, Buffer.from('hello server')))
//     //     .on('end', () => console.log('server ended'))
//     //     .end('hello client')
//     // })


//     createRPC(server)
//     server.listen(SOCKET_PATH)

//   const client = new pipe(SOCKET_PATH)
//   client
//     .on('close', () => console.log('client socket closed'))
//     // .on('data', (data) => console.log(data, Buffer.from('hello client')))
//     // .on('end', () => console.log('client ended'))
//     // .end('hello server')

  

//   //server.close()



// SOULTION WITH pear-ipc
// Create on server and client IPC instances bundle separately
//  const server = new IPC.Server({
//     socketPath:SOCKET_PATH,
//     handlers: { get: (params) => params.result }
//   })

//   const client = new IPC.Client({
//     socketPath:SOCKET_PATH,
//     connect: true
//   })

//   await server.ready()
//   await client.ready()
//   const res = await client.get({ result: 'good' })
//     console.log('IPC response:', res)




    // const ipc = pearRun('pear://mroxjysk6hoptms3qcdnfi3p7mykdtjg5ut8n4pqszbpwn7nbkdo',['--detached '])


    

}


start()