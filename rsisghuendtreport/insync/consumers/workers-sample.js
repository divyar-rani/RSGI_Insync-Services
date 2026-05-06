module.exports = {
    "client-create": {
        script: "./client-request/index.js",
        config: "./config.js",
        workers: 1
    },
    "receipt": {
        script: "./receipt/index.js",
        config: "./config.js",
        workers: 1
    },
    "proposal": {
        script: "./proposal/index.js",
        config: "./config.js",
        workers: 1
    },
    "subreceipt": {
        script: "./subreceipt/index.js",
        config: "./config.js",
        workers: 1
    },
    "tagging": {
        script: "./tagging/index.js",
        config: "./config.js",
        workers: 1
    },

}