const { Worker } = require('worker_threads');
const path = require('path');
const fs = require('fs');

function runService(conf, id) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(conf.script, {workerData: {...conf, id}});
        console.log('worker:', conf.name, worker.threadId)
        worker.on('message', resolve);
        worker.on('error', reject);
        worker.on('exit', (code) => {
            if (code !== 0) reject(new Error(`Worker stopped with exit code `+code));
        });
    });
}

let fname = process.argv[2];
if (fname && !fname.startsWith('/') && fname.indexOf(':') < 0) fname = path.join(__dirname, fname);
if (!fname || !fs.existsSync(fname)) {
    console.log('invalid script parameter', fname);
    process.exit(-1);
}
let conf = require(fname);
for (let name in conf) {
    let wc = conf[name];
    wc.name = name;
	console.log(wc)
    for (let i=0; i<(wc.workers || 1); i++)
        setTimeout(async () => {try{await runService(wc, i)}catch(e){console.log(e)}});
}

// let script = process.argv[2];
// if (!script || !fs.existsSync(path.join(__dirname, script))) console.log('invalid script parameter');
// else {
//     let count = +process.argv[3];
//     if (!count || isNaN(count) || count > 5) count = 1;

//     for (let i=0; i<count; i++)
//         setTimeout(async () => await runService(script), 0);
// }