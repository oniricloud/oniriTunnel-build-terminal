
const fromDisk = false//Pear?.app.key === null

const logger = {
    info: (a, b, ...args) => {
        if (fromDisk) {
            console.log(a, b, ...args)
        }
    },
    warn: (a, b, ...args) => {
        if (fromDisk) {
            console.log(a, b, ...args)
        }
    },
    error: (a, b, ...args) => {
        if (fromDisk) {
            console.log(a, b, ...args)
        }

    },
    debug: (a, b, ...args) => {
        if (fromDisk) {
            console.log(a, b, ...args)
        }
    },

}

export {
    logger
};
