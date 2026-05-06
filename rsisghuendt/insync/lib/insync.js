const conf = require('../config');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const mq = require('./mq');
const WebSocket = require('ws');
const utils = require('./utils');
const notify= require('./notify');
const moment = require('moment');
const {performance} = require('perf_hooks');
const istatsd = require('./istatsd');
const idata = require('./is3');

class insync {
    
    constructor() {
        this.ws = {};
        this.batch = {};
        this.pause = true;
        this.batch_size = 512;
        this.catching_up = false;
        this.verbose = 1;
        this._load_custom_config();

    }

    _load_custom_config() {
        if (!process.env.CUST_CONFIG) {
            console.log('CUST_CONFIG not set');
            process.exit(-1);
        }

        let fname = process.env.CUST_CONFIG;
        if (!fname.startsWith('/') && fname.indexOf(':') < 0) fname = path.join(__dirname, '..', fname);
        if (!fs.existsSync(fname)) {
            console.log('custom config file', fname, 'missing');
            process.exit(-1);
        }
        this.cust = require(fname);
        this.pause = this.cust.policy?.pause ? true : false;
        if (this.cust.policy?.tmp) {
            let fname = path.join(this.cust.policy.tmp, 'pause.lock');
            if (fs.existsSync(fname)) this.pause = true;
        }

    }
    async _process_unqueued(def) {
        let rows = await db.exec("select policy_id from is_policy where sync_state='downloaded' and def_name=?", [def.name]);
        if (rows) {
            for (let row of rows) {
                if (!await this.add_to_queue(def, row.policy_id)) break; //queue still not ready, will try in next cycle ...
                // remove from purgatory if found
                await db.exec("update is_purgatory set status=1 where policy_id=?", [row.policy_id]);
            }
        }

        // all purgatory entries with cause of queue can also be retried
        rows = await db.exec("select policy_id from is_purgatory where def_name=? and cause='queue' and status=0", [def.name]);
        if (rows) {
            for (let row of rows) {
                if (!await this.add_to_queue(def, row.policy_id)) break; //queue still not ready, will try in next cycle ...
                await db.exec("update is_purgatory set status=1 where policy_id=?", [row.policy_id]);
            }
    
        }

        await this._missing_downloads(def);
    }

    // repeat this every batch_interval
    //
    async _do_one_batch(def) {
        let wait = def.batch_interval;
        if (this.pause) {
            if (def.trace) this.trace(def, 'paused: wait ' + wait + ' ms ...');
            this.notify(def, 'info', 'download paused');
            this.batch[def.name] = setTimeout(() => this._do_one_batch(def), wait);
            return;
        }

        let start = performance.now();
        let count=0, time=0, ptime=0, iptime=0;
        try {
            ({count, time, ptime, iptime} = await this.download_next_batch(def));
            if (count !== false) {
                istatsd.event(['download.batch.time'], time);
                istatsd.increment(['download.batch.count'], count);
                if (count >= this.batch_size) wait = 10*1000;  // more to be processed in this batch, wait 10 seconds and get next batch
                if (this.catching_up) wait = 5*1000;
            } else {
                wait = def.batch_interval;
            }
            
        } catch (e) {
            console.log(e);
            this.notify(def, 'error', 'batch download failed: ' + e.message);
        }

        // if (def.trace) this.trace(def, 'batch: wait ' + wait + ' ms ...');
        this.notify(def, 'info', 'completed batch(' + count + ') in ' + (performance.now()-start).toFixed(0) + ' ms' +  ' (delta: '+time.toFixed(0)+') (down: '+ptime.toFixed(0)+') issued: ' + iptime.toFixed(0)+' wait: '+wait);
        this.batch[def.name] = setTimeout(() => this._do_one_batch(def), wait);

        try{await this._process_unqueued(def);} catch (e) {console.log(e);}
    }

    async add_to_queue(def, policyId) {
        // changing state after the queue has been posted causes the consumers to pick it up and 
        // update status before current thread gets a chance (occassionaly)
        //
        await db.exec("update is_policy set sync_state='queued' where policy_id=?", [policyId]);
        let ret = await mq.post(def, {policy_id: policyId});
        if (!ret) {
            await this._queue_failed(def, policyId);
            istatsd.event(['queue.error']);
            return false;
        } else {
            if (def.trace && this.verbose > 1) this.trace(def, 'moved ' + policyId + ' to queue');
            await db.exec("update is_policy set message_id=? where policy_id=?", [ret.MessageId, policyId]);
            istatsd.event(['queue.entry']);
            return true;
        }
    }

    // redownload over-writes the manually changed entries in policy json
    // choose wisely what needs redownload
    //
    async __allow_redownload(p) {
        // if not downloaded yet or still in downloaded state (not yet queued)
        //
        if (!p || p.sync_state == 'downloaded' || p.sync_state == 'name-map' || p.sync_state == 'skipped') return true;

        // held at a stage and waiting for action
        //
        if (p.sync_state == 'hold' || p.sync_state.startsWith('hold-')) return true;

        // queuing failed or policy has not been issued yet
        //
        if (p.sync_state == 'queue-failed' || !p.issue_date) return true;

        return false;
    }

    async __update_custom_fields(def, policy, cur) {
        if (!def.products || !policy?.is_product_code) return;
        if (!def.products[policy.is_product_code]) return;

        let cust = def.products[policy.is_product_code]?.custom_fields||{};
        let values = {};
        for (let key in cust) {
            let value = await utils.jpath_value(policy, cust[key], null);
            if (value !== undefined && value !== null && cur?.[key] != value) {
                values[key] = value;
            }
        }

        let keys = Object.keys(values);
        if (keys.length > 0) { // found one or more values to be updated into is_policy
            let sql = "update is_policy set " + keys.map(x => x + '=?').join(',') + ' where policy_id=?';
            let params = keys.map(x => values[x]);
            params.push(policy.endorsement_id);
            await db.exec(sql, params);
            console.log('cust fields: ', policy.endorsement_id, values);
        } else {
            console.log('no cust fields: ', policy.endorsement_id);
        }

    }

    async _download_policy(def, policyId) {
        // check if we already have this policy downloaded
        //
        let p = await db.row("select * from is_policy where policy_id=?", [policyId]);
        if (!await this.__allow_redownload(p)) {
            this.notify(def, 'info', 'redownload of '+policyId+' skipped [' + p.sync_state+']', policyId);
            return;
        }

        let start = performance.now();
        //let url = def.server + '/api/v1/policy/' + encodeURIComponent(policyId);
        /* ak:22-Dec-22: downlaod endorsement data */
        let url = def.server + '/api/v2/endorsement/' + encodeURIComponent(policyId);
        let ret = await utils.iget(url, def);
		
        if (!ret || ret.status != 0) {
            istatsd.event(['download.policy.failed']);
            await this._add_to_purgatory(def, policyId, ret ? ret.txt: 'Auth?', 'download');
        } else {
            istatsd.event(['download.policy.time'], (performance.now()-start));
            istatsd.increment(['download.policy']);

            let policy = ret.data[0];
            let prodname = policy.quote?.data.product_name || policy.proposal?.data.product_name || '';

            // empty issue date and policy no are allowed for cases when
            // include_payment is defined
            //
            // if (policy.endorsement_date === 'null') policy.endorsement_date = null;
            if (policy.endorsement_date === 'null') policy.endorsement_date = policy.c_ts;

            if (+policy.status == 8) {
                // cancelled policy, just mark completed or push through cancellation consumer
            }

            // do not process policies issued before cut-off date (useful for transitions)
            //
            //if (def.cutoff && policy.issue_date && moment(policy.issue_date || policy.c_ts).isBefore(moment(def.cutoff))) {
            /*ak:22-Dec-22: Cutoff date based on endorsementdate */
            if (def.cutoff && policy.endorsement_date && moment(policy.endorsement_date || policy.c_ts).isBefore(moment(def.cutoff))) {
                await this._add_to_purgatory(def, policyId, 'before cutoff', 'cutoff');
                return;
            }
            
            // valid policy no is needed for non-payment mode
            //
            if (!policy.endorsement_no && !def.include_paid) {
                await this._add_to_purgatory(def, policyId, 'endorsement_no not issued yet', 'issue_date');
                return;
            }

            // wait till at least one payment is made (sync may kick in and download policy as soon as
            // the proposal finalize is completed, before actual payment is made)
            //
            if (def.include_paid && ((policy.payment?.details||[]).length <= 0)) {
                await this.__log_and_state(def, 'info', policyId, 'payment not done yet', 'hold-payment');
                return;
            }


            let res = null;
            if (p) {
                res = await db.exec("update is_policy set policy_no=?, product_name=?, issue_date=?, proposal_no=? where policy_id=?", [policy.policy_no||null, prodname, policy.endorsement_date, policy.propoal_no||'', policyId]);
            } else {
                let params = [policyId, policy.policy_no, prodname, policy.product_id, policy.endorsement_date, policy.proposal_no, def.name];
                res = await db.exec("insert into is_policy(policy_id, policy_no, product_name, product_id, issue_date, sync_state, proposal_no, def_name) values (?,?,?,?,?,'downloaded',?,?)", params);
            }

            if (res == null) {
                istatsd.event(['db.error']);
                await this._add_to_purgatory(def, policyId, 'db insert/update failed ' + db.error, 'db');
                return;
            }

            // normalize the product name to sync specific code (and store it back in policy json, local)
            //
            policy.is_product_code = def.product_names?.[prodname.toLowerCase()];

            await this.__update_custom_fields(def, policy, p);

            let row = await db.row("select * from is_policy_json where policy_id=?", [policyId]);
            try {
                let res = null;
                
                // store/update json in external store and put the reference in local db
                //
                let sdata = await idata.store(policy.endorsement_id, JSON.stringify(policy));
                if (!sdata) throw('failed to store in s3 ' + policy.endorsement_id);
                
                if (row) res = await db.exec("update is_policy_json set data=?, author='insync', ip='' where policy_id=?", [sdata, policyId]);
                else res = await db.exec("insert into is_policy_json(def_name, policy_id, data, author, ip) values (?,?,?,'insync','')", [def.name, policyId, sdata]);

                if (res) {
                    if (!policy.is_product_code) {
                        let msg = 'policy product name '+prodname+' not found in map';
                        await this.__log_and_state(def, 'info', policyId, msg, 'name-map');
                    } else {
                        await this.add_to_queue(def, policyId);
                    }
                } else {
                    await this._add_to_purgatory(def, policyId, 'db insert/update failed ' + db.error, 'db');
                }

                if (def.include_paid) await this.__update_payment_details(def, policy);
            } catch (e) {
                console.log(e);
                istatsd.event(['exception']);
                await this._add_to_purgatory(def, policyId, e.message, 'unknown');
            }
        }
    }

    async __update_payment_details(def, policy) {
        if (!policy.payment?.details) return;

        let prodname = policy.quote?.data.product_name || policy.proposal?.data.product_name || '';
        let sql = "insert into is_policy_payment (policy_id, payment_details_id, payment_id, product_name, pay_date, downloaded, c_ts) values (?,?,?,?,?,'Yes',?) as x on duplicate key update downloaded='Yes', policy_id=x.policy_id, product_name=x.product_name";
        
        for (let pd of policy.payment.details) {
            if (!await db.exec(sql, [policy.policy_id, pd.payment_details_id, pd.payment_id, prodname, pd.pay_date||null, pd.c_ts])) {
                console.log('failed to add payment download details', db.error);
            }
        }
    }

    async _queue_failed(def, policyId) {
        this.notify(def, 'error', 'queue failed '+policyId+'');
        await db.exec("update is_policy set sync_state='queue-failed' where policy_id=?", [policyId]); // if found in is_policy
    }


    async _add_to_purgatory(def, policyId, reason, cause) {
        this.notify(def, 'error', 'moving '+policyId+' to purgatory [' + reason + ']');
        await db.exec("update is_policy set sync_state='purgatory' where policy_id=?", [policyId]); // if found in is_policy
        let rec = await db.row("select * from is_purgatory where policy_id=?", [policyId]);
        if (rec) await db.exec("update is_purgatory set reason=?, cause=? where policy_id=?", [reason.substring(0, 4094), cause||'', policyId]);
        else await db.exec("insert into is_purgatory(def_name, policy_id, reason, cause, status) values(?,?,?,?,0)", [def.name, policyId, reason?.substring(0, 4094)||'', cause||'']);
    }

    async _get_last_download_time(name) {
        let row = await db.row("select * from is_last_ts where def_name=?", [name]);
        if (!row) {
            await db.exec("insert into is_last_ts(def_name, l_ts) values (?, now())", [name]);
            row = await db.row("select * from is_last_ts where def_name=?", [name]);
        }
        return row ? row.l_ts : moment().toISOString().replace('T', ' ');
    }


    async _put_last_download_time(name, l_ts) {
        let row = await db.row("select * from is_last_ts where def_name=?", [name]);
        if (row) await db.exec("update is_last_ts set l_ts=? where def_name=?", [l_ts, name]);
        else await db.exec("insert into is_last_ts(def_name, l_ts) values(?,?)", [name, l_ts]);
    }

    // if we are loading from distant past, try using a range instead of start -> now
    // there is a chance that we may not find any record during that time window, in that case
    // update the l_ts with time upto a second less than what we got
    //
    async __next_batch(def, l_ts, depth) {
        let mlts = moment(l_ts.replace(' ', 'T').replace('Z', '')+'Z');
        let diff = moment().diff(mlts, 'hour');
        //let url = def.server + '/api/v1/policy/list2?fields=policy_id,issue_date,u_ts';
        /* ak:22-Dec-22: downlaod endorsement policy list */
        let url = def.server + '/api/v2/endorsement/list2?fields=endorsement_id,endorsement_no,endorsement_date,u_ts';
        
        // include all paid, cancelled policies
       // if (def.include_paid) url += '&policy.payment_id='+encodeURIComponent('!')+'&quote.status=^0,2,8';
	if (def.include_paid) url += '&endorsement.payment_id='+encodeURIComponent('!');
        // max of 2 hours from last time stamp (only if last timestamp is earlier than 8 hours)
        //
        let mets = mlts.clone().add(1, 'hour');
        if (diff >= 8) {
            depth = depth === undefined ? 24 : depth;
            let e_ts = mets.toISOString().replace('T', ' ').replace('Z', '');    
            url += '&u_ts=' + encodeURIComponent('(]'+l_ts+','+e_ts);
            this.catching_up = true;
        } else {
            depth = -1;
            url += '&u_ts=' + encodeURIComponent('('+l_ts);
            this.catching_up = false;
        }
        //let ret = await utils.iget(url, def);

        let reqData = {
             'endorsement.status': 2,
              'order': 'u_ts desc',
              'schema': '1',
              'fields': 'endorsement_id,policy_id,quote_id,policy_no,endorsement_no,u_ts,endorsement_date',
              'u_ts': '('+l_ts
            }

        let ret = {};
        ret = await utils.ipost(url, reqData, def);		
        console.log("********************** reqDatareqData", ret);
        // let ret = await utils.iget(url, def);

        if (!ret) {
            istatsd.event(['download.batch.failed']);
            if (def.trace) this.trace(def, 'failed to download next batch');
            return false;
        }
        if (ret.status != 0) {
            istatsd.event(['download.batch.failed']);
            await this.notify(def, 'error', 'batch download failed: ' + ret.status +': '+ ret.txt, def.name);
            return false;
        }

        // if we are catching up and we didn't have any in the current 2 hour period,
        // we need to give a second lead to avoid 11:59:59.xxxx updates
        //
        if (ret.data.length == 0 && this.catching_up) {
            let ts = mets.clone().add(-1, 'second').toISOString().replace('T', ' ').replace('Z', '');
            console.log('    batch: past: no entry found in range', depth);
            await this._put_last_download_time(def.name, ts);
            if (depth >= 0) {
                console.log('    batch: trying next hour ', ts);
                // await (new Promise((resolve, reject) => setTimeout(resolve, 3000)));
                return this.__next_batch(def, ts, --depth);
            }
            return false;
        }

        return ret.data;
    }

    async _process_chunked(rows, count, l_ts) {
        let chunks = [rows];
        if (rows.length > 30) {
            let chunk = (rows.length/count)|0;
            chunks = [];
            for (let i=0; i<rows.length; i+=chunk) {
                chunks.push(rows.slice(i, i + chunk));
            }
        }
        let ts = l_ts;
        for (let i=0; i<chunks[0].length; i++) {
            let proms = [];
            for (let j=0; j<chunks.length; j++) {
                if (chunks[j][i]) proms.push(this._download_policy(def, chunks[j][i].policy_id));
            }
            if (proms.length > 0) await Promise.all(proms);

            for (let j=0; j<chunks.length; j++) {
                if (chunks[j][i] && ts < chunks[j][i].u_ts) ts = chunks[j][i].u_ts;
            }
        }
        return ts;
    }

    async download_next_batch(def) {
        let iptime = 0;
        let l_ts = await this._get_last_download_time(def.name);
        if (def.trace) this.trace(def, 'download_next_batch from ', l_ts);

        let dnld = performance.now();
        let rows = await this.__next_batch(def, l_ts);
        dnld = performance.now() - dnld;
        if (rows === false) return {count: 0, time: dnld, ptime: 0, iptime};

        // lets try and get the issued policies upto this moment (before we process the downloaded policies)
        //
        if (!this.catching_up) {
            try {iptime = await this._update_issued_polciies(def);} catch(e) {console.log(e);}
        }

        let proc = performance.now();
        // let ts = await this._process_chunked(rows, 1, l_ts);

        let ts = l_ts;
        for (let row of rows) {
            //await this._download_policy(def, row.policy_id);
            /*ak:23-Dec-22 */
			await this._download_policy(def, row.endorsement_id);
            if (ts < row.u_ts) ts = row.u_ts;
        }
        proc = performance.now() - proc;
        if (ts != l_ts) {
            if (def.trace) this.trace(def, 'new ts found', ts);
            await this._put_last_download_time(def.name, ts);
            await this.notify(def, 'info', 'downloaded upto '+ts);
        } else {
            // if (def.trace) this.trace(def, 'no new ts found', ts);
        }
        return {count: rows.length, time: dnld, ptime: proc, iptime};
    }

    async __log_and_state(def, type, policyId, message, state) {
        let params = [type, def ? def.name:'insync', policyId||'', message.substring(0, 4094)];
        await db.exec("insert into is_log_messages(type, def_name, policy_id, message) values (?,?,?,?)", params);
        if (state) {
            await db.exec("update is_policy set sync_state=? where policy_id=?", [state, policyId]);
        }
    }

    async notify(def, type, message, policyId) {
        let params = [type, def ? def.name:'insync', policyId||'', message.substring(0, 4094)];
        await db.exec("insert into is_log_messages(type, def_name, policy_id, message) values (?,?,?,?)", params);
        notify.send(type, message);
        if (def && def.trace) this.trace(def, '(n):', type, message);
    }

    trace(def, ...args) {
        console.log(def?def.name: '', ...args);
    }

    async _check() {
        let rows = await db.row("select * from is_auth limit 1");
        if (!rows || rows.length <= 0) {
            console.log('auth table not ready, pausing ...');
            this.pause = true;
        }
    }

    async _init() {
        await this._check();
        await idata.wait_for_ready();
        let names = Object.keys(this.cust);
        for (let i=0; i<names.length; i++) {
            
            // fix insillion user name / password
            this.cust[names[i]].server = this.cust[names[i]].server || process.env.IS_INSILLION_SERVER || '';
            this.cust[names[i]].user = this.cust[names[i]].user || process.env.IS_INSILLION_USER || '';
            this.cust[names[i]].mpwd = this.cust[names[i]].mpwd || process.env.IS_INSILLION_MPWD || '';


            // fix product name map case
            for (let pname in this.cust[names[i]].product_names||{})
                this.cust[names[i]].product_names[pname.toLowerCase()] = this.cust[names[i]].product_names[pname];

            if (!this.batch[names[i]]) {
                this.batch[names[i]] = setTimeout(() => this._do_one_batch(this.cust[names[i]]), i * 5000);
            }
        }
    }

    stop() {
        for (let i=0; i<names.length; i++) {
            if (this.batch[names[i]]) clearTimeout(this.batch[names[i]]);
            this.batch[names[i]] = null;
        }
    }

    async _update_paid_polciies(def, start, end) {
        if (!def.include_paid) return 0;

        if (!start) start = moment().add(-2, 'hour').format('YYYY-MM-DD HH:mm:ss');
        if (!end) end = moment().format('YYYY-MM-DD HH:mm:ss');

        let ret = await utils.iget(def.server+'/api/v1/stats/query/policy_paid?start='+encodeURIComponent(start)+'&end='+encodeURIComponent(end), this.cust?.[def.name]);
        if (ret?.status !== 0) {
            console.log('paid download failed', ret.txt);
            return 0;
        }
        let pdids = ret.data.map(x => x.payment_details_id);
        if (pdids.length == 0) return 0;

        let found = await db.exec("select payment_details_id from is_policy_payment where payment_details_id in (?)", [pdids]) || [];
        found = found.reduce((a, x) => {a[x.payment_details_id]=1; return a;}, {});

        for (let row of ret.data||[]) {
            if (found[row.payment_details_id]) continue;
            let sql = "insert into is_policy_payment (payment_details_id, payment_id, pay_date, c_ts) values (?,?,?,?) on duplicate key update payment_details_id=payment_details_id";
            if (!await db.exec(sql, [row.payment_details_id, row.payment_id, row.pay_date||null, row.c_ts])) {
                console.log('failed to add payment download details', db.error);
            }
        }
        return pdids.length;
    }

    async _missing_downloads(def) {
        let sql = "select is_policy_issued.policy_id as policy_id from is_policy_issued left join is_policy on is_policy_issued.policy_id=is_policy.policy_id where is_policy.policy_id is null ";
        sql += " and is_policy_issued.issue_date > CURRENT_TIMESTAMP - INTERVAL 1 DAY and is_policy_issued.issue_date < CURRENT_TIMESTAMP - INTERVAL 5 MINUTE "
        let rows = await db.exec(sql, []) || [];
        for (let row of rows||[]) {
            await this._download_policy(def, row.policy_id);
            // let ret = await utils.ipost(def.server+'/api/v1/policy/update_json', {policy_id: row.policy_id}, def);
            console.log('*** force download:', row.policy_id);
        }
        if (rows.length) console.log('missed out policies', rows.length);
    }

    async _update_issued_polciies(def, start, end) {
        if (!start) start = moment().add(-2, 'hour').format('YYYY-MM-DD HH:mm:ss');
        if (!end) end = moment().format('YYYY-MM-DD HH:mm:ss');

        let time = performance.now();

        await this._update_paid_polciies(def, start, end);
        let ret = await utils.iget(def.server+'/api/v1/stats/query/endorsement_issued?start='+encodeURIComponent(start)+'&end='+encodeURIComponent(end), def);
        if (ret.status != 0) {
            console.log('_update_issued_polciies:', ret.txt);
            return 0;
        }

        let pids = ret.data.map(x => x.endorsement_id);
        if (pids.length == 0) return (performance.now()-time);

        let eids = await db.exec("select policy_id from is_policy_issued where policy_id in (?)", [pids]) || [];
        eids = eids.reduce((a, x) => {a[x.endorsement_id]=1; return a;}, {});

        let values = [];
        for (let policy of ret.data) {
            if (eids[policy.policy_id]) continue;
            values.push([policy.policy_id, policy.policy_no, policy.product_id, policy.product_group_id, policy.issue_date]);
            if (values.length>=1000) {
                console.log('insert/update', values.length);
                await db.exec("insert into is_policy_issued(policy_id, policy_no, product_id, product_group_id, issue_date) values ? on duplicate key UPDATE policy_id=policy_id", [values]);
                values = [];
            }
        }
        if (values.length>0) {
            await db.exec("insert into is_policy_issued(policy_id, policy_no, product_id, product_group_id, issue_date) values ? on duplicate key UPDATE policy_id=policy_id", [values]);
        }


        return (performance.now()-time);
    }
}

let is = new insync();
is._init();
module.exports = is;
