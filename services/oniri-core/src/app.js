
import { rpc } from './rpc'
import { API } from './api'
import { logger } from './logger/index.js'

import os from 'os'

const client = rpc

console.log('Sending RPC request to server...', os.platform())

//  const testCommand = async () => {
//     try {
//         const response = await client.request({
//             command: API.TESTCOMMAND,
//             data: { message: 'Hello from app.js' }
//         })

//         console.log('Response from RPC server:', response)
//     } catch (error) {
//         console.error('Error sending RPC request:', error)
//     }
// }

export { rpc }

