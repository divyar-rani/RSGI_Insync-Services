const mq = require("./mq");
const {WebSocket} = require("ws");
const db = require("./db");
const utils = require("./utils");
const moment = require('moment');
const request = require('request');
const http  = require('http');
const https = require('https');
const istatsd = require("./istatsd");
const idata = require('../../lib/is3');
const path = require('path');
const fs = require('fs');


const keepAliveAgent = new http.Agent({ keepAlive: true, maxSockets: 200 });
const keepAliveAgentS= new https.Agent({ keepAlive: true, maxSockets: 200 });


class masters {
    constructor(base) {
        this.base = base;
        if (!fs.existsSync(base)) throw "masters base path " + base + " does not exists";

        this.masters = {
            insurers: {file: "insurers.json", values: null},
        };
    }

    _reload_master(name) {
        if (!this.masters[name]) return;
        try {
            this.masters[name].values = JSON.parse(fs.readFileSync(path.join(this.base, this.masters[name].file), 'utf-8'));
        } catch (e) {
            this.masters[name].values = null;
            console.log(e);
        }

    }

    _reload() {
        for (let key in this.masters) {
            this._reload_master(key);
        }
    }

    _master(key) {
        this._reload_master(key);
        if (!this.masters[key]?.values) throw "invalid master " + key;
        return this.masters[key]?.values;
    }

    _lookup(key, name) {
        let m = this._master(key);
        return m[name]||'';
    }
}


class ishelper {
    constructor(name, conf) {
        this.name = name;
        this.conf = conf;
        this.pmap = {};
        this.handles = [];

        let qurl = conf[name].sqs.name ? conf.queues[conf[name].sqs.name].url : conf[name].sqs.srcUrl;
        this.mq = new mq(qurl, null);
        
        this.masters = new masters(conf.basePath);
        if (process.env.IS_WS_SERVER) {
            this._ws_connect(process.env.IS_WS_SERVER);
        }
        this.colors = true;
        this.trace = conf[name].trace || false;
    }

    _ws_connect(server) {
        this.ws = new WebSocket(process.env['IS_WS_SERVER']);
        this.ws.on('close', () => setTimeout(() => this._ws_connect(server), 15*1000));
        this.ws.on('error', (err) => {console.log('ws: not available '+err.code);});
    }


    __notify(type, message) {
        if (!this.ws) return;
        try {
            this.ws.send(JSON.stringify({type, message, time: moment().utc()}));
        } catch (e) {
            console.log('sending ....', e);
        }
    }

    colorize(type) {
        if (type == 'info') return "\x1b[36m" + type + "\x1b[0m";
        if (type == 'error') return "\x1b[1m\x1b[31m" + type + "\x1b[0m";
        if (type == 'warning') return "\x1b[1m\x1b[32m" + type + "\x1b[0m";
        if (type == 'exception') return "\x1b[1m\x1b[31m" + type + "\x1b[0m";
        return type;
    }

    async __log(type, message, policyId, modname, events, bkt) {
        if (message instanceof Error) {
            message = message.stack;
            type = 'exception';
        }
        if (typeof message == 'string' && message.length > 8000) message = message.substring(0, 8000);
        
        if (this.trace || type == 'exception') {
            if (this.colors) console.log('   ', this.colorize(type), modname||'', message);
            else console.log('log:', type, modname||'', message);
        }
        bkt = bkt || '';

        let params = [type, this.name, policyId||'', message, modname||'', bkt];
        await db.exec("insert into is_log_messages(type, def_name, policy_id, message, mod_name, usr_bucket) values (?,?,?,?,?,?)", params);
        this.__notify(type, message + (policyId ? '-'+policyId: ''));
        if (events) istatsd.event(events);
    }

    async __state(pid, state, ackId, bkt) {
        let sql = "update is_policy set sync_state=?, usr_bucket=? where policy_id=?";
        let params = [state, bkt||'', pid];
        if (state == 'completed') {
            params = [state, ackId||'', pid];
            sql = "update is_policy set sync_state=?, ack_id=?, usr_bucket='', completed_at=now() where policy_id=?";
        }
        if (!(await db.exec(sql, params))) {
            await this.__log('error', 'changing state failed ' + db.error, pid);
        }
    }

    async fetch(count) {
        // check if pause is enabled (presence of file under tmp/../isync-lock)
        let fname = path.join(this.conf.tmp, 'pause.lock');
        if (fs.existsSync(fname)) {
            this.__notify('warning',  'paused ' + this.name + '...');
            console.log('paused ' + this.name + '...');
            return [];
        }

        try {
            let next = await this.mq.fetch(count||5);
            if (!next) {console.log('failed to fetch next message'); return [];}
            if (!next.Messages || next.Messages.length == 0) return [];

            for (let msg of next.Messages) this.pmap[msg.Body] = msg.ReceiptHandle;
            return next.Messages.map(x => x.Body);
        } catch (e) {
            console.log('fetch:', e);
            return [];
        }
    }

    async reschedule(pid, secs, message, name) {
        name = name || this.name;
        let ipolicy = await db.row("select * from is_policy where policy_id=?", [pid]);
        if (!ipolicy) {console.log('could not get ispolicy', pid); return;}

        let max = (this.conf.max_retries ? +this.conf.max_retries : 10) || 10;
        if (+ipolicy.retry_count >= max) {
            await this.mark(pid);
            this.__log('warning', 'max re-tries exceeded', pid, name);
            return;
        }

        await db.row("update is_policy set retry_count=retry_count+1 where policy_id=?", [pid]);  // increment retry count

        if (message) this.__log('info', message, pid, name);

        if (!this.pmap[pid]) return;
        try {
            await this.mq.reschedule(this.pmap[pid], secs);
        } catch (e) {
            console.log('reschedule: exception:', pid, e);
        }
        delete this.pmap[pid];
    }

    async mark(pid) {
        if (!this.pmap[pid]) return;
        try {
            if (!(await this.mq.delet(this.pmap[pid])))
                this.handles.push(this.pmap[pid]);   // if we cannot delete now, lets try later
            delete this.pmap[pid];
        } catch (e) {
            console.log('mark: exception:', pid, e);
        }
    }

    async ispolicy(pid) {
        return await db.row("select * from is_policy where policy_id=?", [pid]);
    }

    async policy(pid) {
        let row = await db.row("select sync_state from is_policy where policy_id=?", [pid]);
        if (!row) { // failed to get policy state, likely to have been manually deleted mark it as error and bail out
            await this.__log('error', 'Could not locate policy in downloaded table', pid);
            return null;
        }

        if (row.sync_state == 'completed') {
            if (this.trace) console.log('skipping', pid, 'already completed');
            return null;
        }

        row = await db.row("select policy_id, data from is_policy_json where policy_id=?", [pid]);
        if (!row) { // failed to get policy json, likely to have been manually deleted mark it as error and bail out
            await this.__log('error', 'Could not locate policy json in downloaded table', pid);
            await this.__state(pid, 'json-missing');
            return null;
        }

        try {
            if (!await idata.fix(row)) {
                await this.__log('error', 'Could not download policy json from store', pid);
                await this.__state(pid, 'json-missing');
                return null;
            }

            let policy = JSON.parse(typeof row.data === 'string' ? row.data : Buffer.from(row.data).toString('utf8'));
            if (policy.endorsement_id != pid) {
                if (this.trace) console.log('***** ', pid, ' does not match', policy.policy_id);
                return null;
            }

            return policy;
        } catch (e) {
            console.log(e);
            await this.__log('error', 'Could not parse policy json ' + e.message, pid);
            await this.__state(pid, 'parse-failed');
            return null;
        }
    }

    async retrieve(pid, key) {
        key = key ? pid + '-' + key : pid;
        let row = await db.row("select * from is_policy_transformed where policy_id=?", [key]);
        if (!row) return null;
        return await idata.get(Buffer.from(row.data).toString('utf8'));
    }

    async store(pid, data, key) {
        key = key ? pid + '-' + key : pid;
        data = await idata.store(pid, data, 'xml/'+key);

        let row = await db.row("select * from is_policy_transformed where policy_id=?", [key]);
        if (row) {
            await db.row("update is_policy_transformed set data=? where policy_id=?", [data, key]);
        } else {
            await db.exec("insert into is_policy_transformed(def_name, policy_id, data, author, ip) values (?,?,?,'insync','')", [this.name, key, data]);
        }
        return;
    }

    async push_to_other_queues(service, policy) {
        if (!service.sqs) return;
        for (let name of service.sqs.others||[]) {
            let durl = this.conf.queues[name].url;
            let ret = await this.mq.post(policy, durl);
            if (ret !== true) {
                await this.__log('error', 'queue-others:' + ret, policy.policy_id, this.name);
            }
        }
    }

    async push_to_target_queue(service, policy, state) {
        if (!service.sqs) return;
        let surl = this.conf[this.name].sqs.name ? this.conf.queues[this.conf[this.name].sqs.name].url : this.conf[this.name].sqs.srcUrl;
        let durl = service.sqs.name ? this.conf.queues[service.sqs.name].url : service.sqs.dstUrl;
        // let q = new mq(surl, durl);

        // doing this after post causes the state to be set even if another process has changed it
        //
        if (state) await this.__state(policy.policy_id, 'queue-'+state);
		console.log("push_to_target_queue ---> ",policy.policy_id, "--------->" ,state);
        let ret = await this.mq.post(policy, durl);
        if (ret !== true) {
            await this.__log('error', 'queue:' + ret, policy.policy_id, this.name);
            await this.__state(policy.policy_id, 'queue-error');
            return false;
        }
        return true;
    }

    async set_attr(pid, name, value) {
        let json = JSON.stringify({[name]: value});
        let row = await db.row("select policy_id from is_policy_attr where policy_id=?", [pid]);
        try {
            if (row) {
                await db.exec("update is_policy_attr set data=cast(JSON_MERGE_PATCH(cast(data as json), cast(? as json)) as char) where policy_id=?", [json, pid]);
            } else {
                await db.exec("insert into is_policy_attr(policy_id, data, author) values (?,?,'insync')", [pid, json]);
            }
        } catch (e) {
            await this.__log('error', 'failed to set ' + name + ' to ' + value, pid, this.name);
            await this.__log('error', 'db-trans:' + (e.message||e), pid, this.name);
        }



        // let conn = null;
        
        // try {
        //     conn = await db.conn();
        //     await conn.beginTransaction();
        //     const [rows, meta] = await conn.query("select * from is_policy_attr where policy_id=? FOR UPDATE", [pid]);
        //     let row = rows[0];

        //     let data = {};
        //     try {data = JSON.parse(Buffer.from(row ? row.data : '{}').toString('utf8'));}catch(e){console.log(e);}
        //     data[name] = value;
        //     if (row)
        //         await conn.query("update is_policy_attr set data=? where policy_id=?", [JSON.stringify(data), pid]);
        //     else
        //         await conn.query("insert into is_policy_attr(policy_id, data, author) values (?,?,'insync')", [pid, JSON.stringify(data)]);
        //     await conn.commit();
        // } catch (e) {
        //     await this.__log('error', 'failed to set ' + name + ' to ' + value, pid, this.name);
        //     await this.__log('error', 'db-trans:' + (e.message||e), pid, this.name);
        //     console.log(e);
        //     if (conn) await conn.rollback();
        // } finally {
        //     if (conn) await conn.release();
        // }

        // let row = await db.row("select * from is_policy_attr where policy_id=?", [pid]);
        // let data = {};
        // try {data = JSON.parse(Buffer.from(row ? row.data : '{}').toString('utf8'));}catch(e){console.log(e);}
        // data[name] = value;
        // if (row)
        //     await db.exec("update is_policy_attr set data=? where policy_id=?", [JSON.stringify(data), pid]);
        // else
        //     await db.exec("insert into is_policy_attr(policy_id, data, author) values (?,?,'insync')", [pid, JSON.stringify(data)]);
    }

    async get_attr(pid, name) {
        let data = await this.get_attrs(pid);
        return data[name] || null;
    }

    async get_attrs(pid) {
        let row = await db.row("select data from is_policy_attr where policy_id=?", [pid]);
        try {
            if (row) {
                let ret = JSON.parse(Buffer.from(row.data).toString('utf8'));
                for (let key in ret) {
                    if (typeof ret[key] == 'number') ret[key] = '' + ret[key];
                }
                // return JSON.parse(Buffer.from(row.data).toString('utf8'));
                return ret;
            }
        } catch (e) {
            console.log(e);
        }
        return {};
    }


    async _apost(url, data, headers, ignoreCertErrs, options){
        headers = headers || {};
        return new Promise(function(resolve, reject){
            options = options || {};
            options.url = url;
            options.agent = keepAliveAgent;
            if (url.indexOf('https') === 0) options.agent = keepAliveAgentS;
            else options.agent = keepAliveAgent;
            if (headers['Content-Type'] == 'application/json') {
                options.json=data;
            } else if (headers['Content-Type'] && 
                (headers['Content-Type'].startsWith('application/vnd.flux') || headers['Content-Type'].startsWith('application/soap+xml') || headers['Content-Type'].startsWith('text/plain') || headers['Content-Type'].startsWith('text/xml'))) {
                options.body = data;
            } else if (data.hasOwnProperty('file')) {
                options.formData=data;
            } else {
                options.form= data;
            }
			
            if(ignoreCertErrs)options.rejectUnauthorized = false;
            headers['Connection'] = 'keep-alive';
            options.headers = headers;
            // console.log('ct:', headers['Content-Type'], options.url)
			
            const req = request.post(options, function(err, resp, body){
                if( err )return reject(err);
				else if(resp && resp.statusCode == 400)return resolve(body);
                //else if(resp && resp.statusCode != 200 && resp.statusCode != 204)return reject(resp.statusCode+' '+body);
				else if(resp && resp.statusCode != 200 && resp.statusCode != 204)return resolve(body);
                else return resolve(body);
            }).on('error', (err) => reject(err)).on('timeout', () => {req.destroy();});
        });
    }

    async apost(url, data, headers, ignoreCertErrs, options, count) {
        if (count > 0) console.log('   **** retry ', count, url);
        if (count > 5) throw('retry: server not reachable '+url);
        try{
            return await this._apost(url, data, headers, ignoreCertErrs, options);
        }catch(e){
            let retryon = ['hang up', 'socket hang up', 'econnreset', 'econnrefused'];
            if (retryon.indexOf((e.message || e).toLowerCase()) >= 0) {
                return await this.apost(url, data, headers, ignoreCertErrs, options, (count||0)+1);
            }

            if ((e.message+'').toLowerCase().indexOf('time out') >= 0) throw('retry: server timed out');

            if (this.trace) console.log('apost: ', typeof e == 'object' ? e.message : e);
            throw(e);
        }
    }

    async __lock(policyId, modname) {
        let uuid = utils.uuid(24);
        await db.row("insert IGNORE into is_policy_lock(policy_id, modname, uuid, locked_at) values (?,?,?,now())", [policyId, modname, uuid]);
        let row = await db.row("select uuid from is_policy_lock where policy_id=? and modname=?", [policyId, modname]);
        return (row.uuid == uuid);
    }

    async __unlock(policyId, modname) {
        await db.exec("delete from is_policy_lock where policy_id=? and modname=?", [policyId, modname]);
        return true;
    }

    async __global_lock(name, modname) {
        let folder = path.join(this.conf.tmp, '..', 'isync-lock');
        if (!fs.existsSync(folder)) fs.mkdirSync(folder, {recursive: true});
        if (!fs.existsSync(folder)) throw ('could not create tmp folder at ' + folder);

        // see if lock already exists
        let fname = path.join(folder, name+'.lock');
        if (fs.existsSync(fname)) {
            // check if it is stale lock
            let stat = fs.statSync(fname);
            if ((new Date().getTime() - stat.birthtimeMs) > 30*60*1000) {
                fs.unlinkSync(fname);
            } else {
                return false;   // some-one else is holding the lock
            }
        }
        
        // create a file and write the time of creation in it
        fs.writeFileSync(fname, (new Date().getTime())+'');
        return true;
    }

    async __global_unlock(name, modname) {
        let fname = path.join(this.conf.tmp, '..', 'isync-lock', name+'.lock');
        if (fs.existsSync(fname)) fs.unlinkSync(fname);
    }

    async __global_store_read(name) {
        let fname = path.join(this.conf.tmp, '..', 'isync-lock', name+'.ref');
        if (fs.existsSync(fname)) return fs.readFileSync(fname, 'utf-8');
        return null;
    }
    async __global_store_write(name, ref) {
        let fname = path.join(this.conf.tmp, '..', 'isync-lock', name+'.ref');
        fs.writeFileSync(fname, ref);
    }

    // moved to mysql db events
    //
    async __clean_lock() {
        await db.exec("delete from is_policy_lock where TIMESTAMPDIFF(MINUTE, locked_at, NOW())>3");
    }
	async get_pruned_policy(policyId) {
		console.log("Pruned Policy method called..........");
		console.log("policyId::::::::::::",policyId);

		let db_data = await db.exec("select * from is_policy_json where policy_id=?", [policyId]) || [];
		console.log("Policy_id :::",db_data);
		for (let policy  of db_data) {
 		    let data=policy.data;
   		    try {
      		let uripath = new URL(data.substring(3));
  			console.log("uripath ::",uripath)
  			let versionId = data.split('versionId=')[1];
  			console.log("versionId :",versionId)
  			let key=uripath.pathname.substring(1);
  			console.log("key :",key)
  			let bucket = data.split('S3:https://')[1];
  			console.log("bucket : ",bucket)
  			let bucket_code = bucket.split('.s3.ap-south-1')[0];
  			console.log("bucket_code :",bucket_code);
			//await this._Get_S3(bucket_code, policyId+".zip",folder);
  		    }
  			catch (e) {console.log('invalid Data', e);}
  		}
		//let response = await this._Get_from_s3(bucket_code, policyId,folder);
		//await this._Get_S3(bucket_code, policyId+".zip",folder);
		var data_res;
		var file_path=folder+"/"+policyId+".zip";
		const zipFilePath = path.join(folder, policyId+".zip");
 
		// Read the ZIP file as a binary buffer
		/*const blob = fs.readFileSync(zipFilePath);
		fs.writeFileSync("/binary.txt", JSON.stringify(blob));*/

		const base64Zip = await this.zipToBase64(zipFilePath);
		console.log('Base64 ZIP:', base64Zip)
		fs.unlinkSync(zipFilePath);
		this.response(0,'Success',base64Zip);
    	}

	
}

module.exports = ishelper;