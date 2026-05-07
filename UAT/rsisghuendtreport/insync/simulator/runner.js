const fs = require('fs');
const path =require('path');
const request = require('request');
const http  = require('http');
const https = require('https');
const crypto = require('crypto');
const {performance} = require('perf_hooks');

const keepAliveAgent = new http.Agent({ keepAlive: true, maxSockets: 200 });
const keepAliveAgentS= new https.Agent({ keepAlive: true, maxSockets: 200 });

let tokens = {};

let servermap = {
    // P1: 'http://127.0.0.1:9097',
    P2: 'http://127.0.0.1:9077'
    // P3: 'http://127.0.0.1:9087',
};


async function _apost(url, data, headers, ignoreCertErrs, options){
    headers = headers || {};
    return new Promise(function(resolve, reject){
        options = options || {};
        options.url = url;
        options.agent = keepAliveAgent;
        if (url.indexOf('https') === 0) options.agent = keepAliveAgentS;
        else options.agent = keepAliveAgent;

        if (headers && headers['Content-Type'] == 'application/json') {
            options.json=data;
        } else if (headers && headers['Content-Type'] == 'application/vnd.flux') {
            options.body = data;
        } else if (data.hasOwnProperty('file')) {
            options.formData=data;
        } else {
            options.form= data;
        }

        if(ignoreCertErrs)options.rejectUnauthorized = false;
        headers['Connection'] = 'keep-alive';
        options.headers = headers;
        request.post(options, function(err, resp, body){
            if( err )return reject(err);
            else if(resp && resp.statusCode != 200 && resp.statusCode != 204)return reject(resp.statusCode+' '+body);
            else return resolve(body);
        }).on('error', (err) => reject(err));
    });
}

async function auth(email, mpwd, server) {
    if (tokens[server]) return tokens[server];
    try {
        console.log('authenticating', email, server);
        let ret = JSON.parse(await _apost(server+'/api/v1/auth', {email, mpwd}));
        if (ret.status==0) {
            tokens[server] = ret.data.token;
        }
        else console.log('auth failed', ret);
    } catch(e) {
        console.log('auth failed', e);
    }
}

async function process_pid(pid) {
    let server = servermap[pid.substring(0,2)];
    if (!server) return true;

    if (!tokens[server]) {
        await auth('uw', crypto.createHash('md5').update('test').digest('hex'), server);
        if (!tokens[server]) return false;
    }

    let headers = {'Authorization': "Bearer " + tokens[server]};
    try {
        let ret = JSON.parse(await _apost(server+'/api/v1/oob', {policy_id: pid, name: 'policy'}, headers));
        if (ret.status != 0) console.log("   ", ret.txt);
        
        return true;
    } catch(e) {
        console.log('oob failed', e);
        return false;
    }
}

async function process_folder(folder, limit) {
    let fcount = 0;
    if (!fs.existsSync(folder)) return console.log('folder does not exist', folder);
    let list = fs.readdirSync(folder);
    let cutOff = new Date(2022, 5, 8).getTime();
    let start = performance.now();
    let total = 0;
    for (let fname of list) {
        let name = path.join(folder, fname);
        let stats = fs.statSync(name);
        if (stats.isDirectory()) {
            if (fname != 'ThinClient') await process_folder(name);
        } else {
            if (stats.mtimeMs >= cutOff) {
                let pid = fname.split('.')[0];
                console.log("   ", pid, fcount, '/', list.length, (total/(fcount+1)).toFixed(2));
                if (!await process_pid(pid)) break;
                fcount ++;
                if (limit > 0 && fcount >= limit) break;
                total = (performance.now()-start);
            }
        }
    }
    console.log(folder, fcount, 'in', total.toFixed(2), 'ms');
}


let pids = [];
let total = 0;
async function collect_pids(folder) {
    if (!fs.existsSync(folder)) return console.log('folder does not exist', folder);
    let list = fs.readdirSync(folder);
    for (let fname of list) {
        let name = path.join(folder, fname);
        let stats = fs.statSync(name);
        if (stats.isDirectory()) {
            if (fname != 'ThinClient') await collect_pids(name);
        } else {
            let pid = fname.split('.')[0];
            pids.push(pid);
        }
    }
}

async function process_one() {
    let pid = pids.shift();
    let start = performance.now();
    if (!pid || !await process_pid(pid)) return false;
    console.log(pid.padEnd(16), (performance.now()-start).toFixed(0), 'ms', pids.length, 'left');
    total += (performance.now()-start);
    return true;
}

function _interleave(pids) {
    let bkt = {};
    for (let pid of pids) {
        let key = pid.substring(0, 2);
        if (!servermap[key]) continue;

        if (!bkt[key]) bkt[key] = [];
        bkt[key].push(pid);
    }

    

    let npids = [];
    let keys = Object.keys(bkt);
    for (let key of keys) {
        console.log(key, bkt[key].length);
    }

    while (true) {
        let found = false;
        for (let key of keys) {
            let pid = bkt[key].pop();
            if (pid) {npids.push(pid); found = true;}
        }
        if (!found) break;
    }
    console.log('interleaved:', pids.length, npids.length);
    return npids;
}

async function process_folder2(folder) {
    await collect_pids(folder);
    pids = _interleave(pids);
    let pcount = pids.length;
    let start = performance.now();
    let parallels = 20;
    while (pids.length > 0) {
        let awaits = [];
        for (let i=0; i<parallels; i++) awaits.push(process_one());
        await Promise.all(awaits);
    }
    console.log('processed: ', pcount, 'in', (performance.now()-start).toFixed(0), 'ms');
}


async function init() {
    let folder = process.argv[2];
    if (!folder) return console.log('expected folder name parameter');
    let limit = +process.argv[3];
    if (isNaN(limit)) limit = 0;
    // await process_folder(folder, limit);
    await process_folder2(folder);
}

setTimeout(async () => await init());

