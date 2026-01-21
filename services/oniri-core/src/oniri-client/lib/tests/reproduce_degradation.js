const HyperDHT = require('hyperdht')
const TunedUDX = require('../tunedUDX')
const crypto = require('crypto')
const b4a = require('b4a')

const ITERATIONS = 5

async function runBenchmark(iteration) {
    console.log(`\n=== Run ${iteration + 1}/${ITERATIONS} ===`)

    const keyPair = HyperDHT.keyPair()
    const serverNode = new HyperDHT({ udx: new TunedUDX() })
    const clientNode = new HyperDHT({ udx: new TunedUDX() })
    //   const serverNode = new HyperDHT()
    //   const clientNode = new HyperDHT()

    const server = serverNode.createServer(socket => {
        socket.on('data', () => { }) // Explicit data consumer
        socket.on('end', () => socket.end()) // Echo close
    })

    await server.listen(keyPair)

    const socket = clientNode.connect(keyPair.publicKey)

    return new Promise(resolve => {
        const start = Date.now()
        let bytes = 0
        const duration = 5000 // 5 seconds
        const buf = b4a.alloc(65536)

        function write() {
            while (!socket.destroyed) {
                if (Date.now() - start > duration) {
                    console.log('Duration reached, ending socket...')
                    socket.end()
                    return
                }
                const dragged = socket.write(buf)
                bytes += buf.byteLength
                if (!dragged) {
                    // console.log('Waiting for drain...') 
                    socket.once('drain', write)
                    return
                }
            }
        }

        socket.on('close', async () => {
            const mb = bytes / 1024 / 1024
            const speed = mb / (duration / 1000)
            console.log(`Speed: ${speed.toFixed(2)} MB/s`)

            await server.close()
            await serverNode.destroy()
            await clientNode.destroy()
            resolve(speed)
        })

        write()
    })
}

async function main() {
    const speeds = []
    for (let i = 0; i < ITERATIONS; i++) {
        speeds.push(await runBenchmark(i))
        // Small pause between runs
        await new Promise(r => setTimeout(r, 1000))
    }

    console.log('\n=== Results ===')
    speeds.forEach((s, i) => console.log(`Run ${i + 1}: ${s.toFixed(2)} MB/s`))
}

main().catch(console.error)
