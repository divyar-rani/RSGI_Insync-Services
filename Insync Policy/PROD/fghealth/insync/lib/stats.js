const conf = require("./../config");
const base = require("./base");
const db = require('./db');
const mq = require('./mq');
const is = require('./insync');
const utils = require('./utils');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const idata = require('./is3');
const {performance} = require('perf_hooks');
const is_int = (n) => !isNaN(parseInt(n)) && isFinite(n);
const itwig = require('./itwig');

class stats extends base {

    __get_period() {
        let period = this._param('period');
        if (!period) period = moment().add(-6, 'hour').format('YYYY-MM-DD HH:00:00');
        let parts = period.split(',');
        if (parts.length == 1) parts.push(moment().format('YYYY-MM-DD HH:mm:ss'));
        return parts;
    }

    __is_op_allowed(name, op) {
        if (!is.cust || !is.cust[name]?.privs) return true;
        if (is.cust[name].privs[op] <= this.req.priv_level) return true;
        return false;
    }
	

    async get_queue() {
        let pending = await mq.pending();
        let ret = [{name: 'Entry', data: pending.Attributes}];
        for (let url of conf.sqs.urls) {
            let data = await mq.pending(url.url);
            ret.push({name: url.name, data: data.Attributes});
        }
        this.response(0, '', ret);
    }

    async get_summary() {
        let interval = this._param('interval');
        let field = this._param('field') || 'sync_state';
        let groupby = this._param('groupby');
        let product = this._param('product');
        let period = this.__get_period();
        let ts = this._param('ts') === 'c_ts' ? this._param('ts') : 'issue_date';

        if (field != 'sync_state' && field != 'usr_bucket') throw new Error('invalid parameter '+field);

        let fields = [field, 'count(*) as total'];
        let grpby = [field];
        let cond = [ts + ' >= ?', ts + ' <= ?'];
        let params = [period[0], period[1]];
        if (interval == 'h') {grpby.unshift("hour("+ts+")"); fields.push('hour('+ts+') as hour');}
        if (groupby) {
            grpby.push(groupby);
            fields.push(groupby);
        }
        if (product) {
            cond.push('product_id=?');
            params.push(product);
        }

        let sql = "select " + fields.join(",") + " from is_policy where " + cond.join(' and ') + ' group by ' + grpby.join(",");		
        let rows = await db.exec(sql, params);
        if (!rows) rows = [];

        this.response(0, '', rows||[]);
    }

    async get_payment_summary() {
        let fields = ["coalesce(sync_state, 'not-issued') as sync_state", 'count(*) as total'];
        let grpby = ['sync_state'];

        let period = this.__get_period();
        let ts = this._param('ts') === 'c_ts' ? this._param('ts') : 'pay_date';
        
        let groupby = this._param('groupby');
        if (groupby) {
            grpby.push(groupby);
            fields.push(groupby);
        }
        let cond = [ts + ' >= ?', ts + ' <= ?'];
        let params = [period[0], period[1]];

        let sql = "select " + fields.join(",") + " from is_policy_payment left join is_policy on ";
        sql += " is_policy_payment.policy_id=is_policy.policy_id where " + cond.join(' and ') + ' group by ' + grpby.join(",");
        this.response(0, '', await db.exec(sql, params)||[]);
    }

    async get_purgatory() {
        let period = this.__get_period();
        let cond = ['c_ts >= ?', 'c_ts <= ?', 'status=0'];
        let params = [period[0], period[1]];
        let sql = "select * from is_purgatory where " + cond.join(' and ');
        this.response(0, '', await db.exec(sql, params)||[]);
    }

    async get_policies() {
        let period = this.__get_period();
        let cond = ['c_ts >= ?', 'c_ts <= ?'];
        if (this._param('use_issue_date') == 1) cond = ['issue_date >= ?', 'issue_date <= ?'];
        let params = [period[0], period[1]];
        for (let fld of conf.schema.is_policy.fields) {
            if (this._param(fld.name)) {cond.push(fld.name+'=?'); params.push(this._param(fld.name));}
        }
        let sql = "select * from is_policy where " + cond.join(' and ') + " order by c_ts desc";
        let rows = await db.exec(sql, params)||[];

        if (this._param("with_attr")) {
            let pids = rows.map(x => x.policy_id);
            if (pids.length > 0) {
                let atts = await db.exec("select policy_id, data from is_policy_attr where policy_id in (?)", [pids])||[];
                let amap = atts.reduce((a, x) => {a[x.policy_id]=x.data; return a;}, {});
                for (let row of rows) {
                    row.attr = amap[row.policy_id] || "{}";
                }
            }    
        }
        this.response(0, '', rows);
    }
    async get_logs() {
        let period = this.__get_period();
        let product = this._param('product');
        let cond = ['is_log_messages.u_ts >= ?', 'is_log_messages.u_ts <= ?'];
        let params = [period[0], period[1]];
        for (let fld of conf.schema.is_log_messages.fields) {
            if (this._param(fld.name)) {cond.push('is_log_messages.'+fld.name+'=?'); params.push(this._param(fld.name));}
        }
        if (product) {cond.push('product_id=?'); params.push(product)}
        // let sql = "select * from is_log_messages where " + cond.join(' and ') + " order by u_ts desc";
        let sql = "select is_log_messages.*, policy_no, sync_state, product_id from is_log_messages left join is_policy on is_log_messages.policy_id=is_policy.policy_id where " + cond.join(' and ') + " order by u_ts desc";
        this.response(0, '', await db.exec(sql, params)||[]);
    }

    async __find_files(base, policy) {
        let ret = {};
        let ppath = path.join(base, policy.policy_id+'-0.json');
        if (fs.existsSync(ppath)) ret[policy.policy_id+'-0.json'] = 1;

        ppath = path.join(base, policy.policy_id+'-0.xml');
        if (fs.existsSync(ppath)) ret[policy.policy_id+'-0.xml'] = 1;

        ppath = path.join(base, policy.policy_id+'-req.txt');
        if (fs.existsSync(ppath)) ret[policy.policy_id+'-req.txt'] = 1;

        ppath = path.join(base, policy.policy_id+'-res.txt');
        if (fs.existsSync(ppath)) ret[policy.policy_id+'-res.txt'] = 1;

        ppath = path.join(base, policy.policy_no+'-req.txt');
        if (fs.existsSync(ppath)) ret[policy.policy_no+'-req.txt'] = 1;
        ppath = path.join(base, policy.policy_no+'-res.txt');
        if (fs.existsSync(ppath)) ret[policy.policy_no+'-res.txt'] = 1;

        for (let pd of policy.payment?.details||[]) {
            ppath = path.join(base, pd.payment_details_id+'-req.txt');
            if (fs.existsSync(ppath)) ret[pd.payment_details_id+'-req.txt'] = 1;
            ppath = path.join(base, pd.payment_details_id+'-res.txt');
            if (fs.existsSync(ppath)) ret[pd.payment_details_id+'-res.txt'] = 1;
        }
		//Divya Added on 27.04.2025
		for (let dd of policy.document?.details||[]) {
            ppath = path.join(base, dd.document_details_id+'-req.txt');
            if (fs.existsSync(ppath)) ret[dd.document_details_id+'-req.txt'] = 1;
            ppath = path.join(base, dd.document_details_id+'-res.txt');
            if (fs.existsSync(ppath)) ret[dd.document_details_id+'-res.txt'] = 1;
        }
		//Divya Added on 11.11.2025
		ppath = path.join(base, policy.policy_id+'-0-req.txt');
        if (fs.existsSync(ppath)) ret[policy.policy_id+'-0-req.txt'] = 1;
		
		ppath = path.join(base, policy.policy_id+'-0-res.txt');
        if (fs.existsSync(ppath)) ret[policy.policy_id+'-0-res.txt'] = 1;
		
        return ret;
    }

    async __get_req_resp(policy) {
        let ret = {};
        if (!policy.policy_id) return ret;
        let folder = path.join(process.env.IS_TMP, 'isync');
        if (!fs.existsSync(folder)) return ret;

        let modules = await fs.promises.readdir(folder);
        for (let mod of modules) {
            let sub = path.join(folder, mod, policy.policy_id.substring(policy.policy_id.length-2));
            if (!fs.existsSync(sub)) continue;
            ret[mod] = await this.__find_files(sub, policy)
        }
        return ret;
    }
    async get_debug_log() {
        let policyId = this.__param('policy_id');
        let file = this.__param('file');
        let mod = this.__param('mod');
        let dnld = this._param('dnld');
        let fpath = path.join(process.env.IS_TMP, 'isync', mod, policyId.substring(policyId.length-2), file);
        if (fs.existsSync(fpath)) {
            if (dnld) {
                this.res.setHeader('Content-Type', 'text/plain');
                this.res.send(fs.readFileSync(fpath, 'utf8'));
            } else {
                this.response(0, '', {file, data: fs.readFileSync(fpath, 'utf8')});
            }
        } else {
            this.response(0, '', {file, data: 'file not found'});
        }
    }

    async get_policy() {
        let policyId = this._param('policy_id');
        let policyNo = this._param('policy_no');
        let proposalNo = this._param('proposal_no');
        if (!policyId && policyNo) policyId = await db.value("select policy_id from is_policy where policy_no=?", [policyNo]);
        if (!policyId && proposalNo) policyId = await db.value("select policy_id from is_policy where proposal_no=?", [proposalNo]);
        if (!policyId) throw new Error('invalid parameter');

        let state = await db.row("select * from is_policy where policy_id=?", [policyId]);
        let prec = await db.row("select * from is_policy_json where policy_id=?", [policyId]);
        let phist = await db.exec("select * from is_policy_json_history where policy_id=? order by u_ts desc", [policyId]) || [];
        let trans = await db.exec("select * from is_policy_transformed where policy_id=? order by u_ts desc", [policyId]) || [];
        let thist = await db.exec("select * from is_policy_transformed_history where policy_id=? order by u_ts desc", [policyId]) || [];
        let logs = await db.exec("select * from is_log_messages where policy_id=? order by u_ts desc", [policyId]);
        let purgatory = await db.row("select * from is_purgatory where policy_id=?", [policyId]);
        let attrs = await db.row("select data from is_policy_attr where policy_id=?", [policyId]);
        let balance = await db.exec("select * from is_balance_sync where policy_id=?", [policyId]);
        let reverse = await db.row("select * from is_policy_insillion where policy_id=?", [policyId]) || null;

        let policy = {};
        if (prec) {
            await idata.fix(prec);
            policy = JSON.parse(Buffer.from(prec.data).toString('utf8'));
            phist.unshift(prec);
        }
        
        phist = phist.slice(0, 100);

        for (let h of phist) {
            try {
                await idata.fix(h);
                h.data = JSON.parse(Buffer.from(h.data).toString('utf8'));
            }
            catch (e) {console.log('invalid json', e);}
        }
        thist = [...(trans || []), ...(thist || [])];
        for (let h of thist) h.data = await idata.get(Buffer.from(h.data).toString('utf8'));
        if (attrs) attrs = JSON.parse(Buffer.from(attrs.data).toString('utf8'));
        else attrs = {}

        let rr = await  this.__get_req_resp(policy);

        this.response(0, '', {state, policy, logs, purgatory, history: phist, transformed: thist, attrs, rr, balance, reverse});
    }

    async post_oob() {
        let name = this.__param('name');
        let policyId = this.__param('policy_id');
        if (!this.cust[name]) return this.response(-101, 'Invalid name, not found in custom.js');
        if (!this.__is_op_allowed(name, 'oob')) return this.response(-102, 'Privillege needed');

        // if redownload not enabled, just requeue it
        //
        let p = await db.row("select * from is_policy where policy_id=?", [policyId]);
        if (!await is.__allow_redownload(p)) return await this.post_requeue();

        // do download and queue
        //
        await is._download_policy(this.cust[name], policyId);
        p = await db.row("select * from is_policy where policy_id=?", [policyId]);
        if (!p) return this.response(-101, 'policy not downloaded');
        return this.response(0, '', {...p});
    }

    async post_revfeed() {
        let name = this.__param('name');
        let policyId = this.__param('policy_id');
        if (!this.cust[name]) return this.response(-101, 'Invalid name, not found in custom.js');
        if (!this.__is_op_allowed(name, 'revfeed')) return this.response(-102, 'Privillege needed');

        let p = await db.row("select * from is_policy where policy_id=?", [policyId]);
        if (p.sync_state != 'completed') return this.response(-101, 'Invalid policy, sync not completed');

        let qurl = this.cust[name].sqs?.ins;
        if (qurl) await mq.post(this.cust[name], {policy_id: policyId}, qurl);
        return this.response(0, '', {...p});
    }

    async get_revfeed() {
        let period = this.__get_period();
        let completed = this.__param('completed');
        let params = [period[0], period[1]];
        let sql = "select is_policy.policy_id, is_policy.u_ts as u_ts, policy_no, product_name, last_update, completed_at, issue_date, sync_state";
        sql += " from is_policy left join is_policy_insillion on is_policy.policy_id=is_policy_insillion.policy_id where ";
        if (completed) sql += "sync_state='completed' and "
        sql += " issue_date >= ? and issue_date <= ? order by issue_date desc";
        return this.response(0, '', await db.exec(sql, params));
    }

    async post_requeue() {
        let name = this.__param('name');
        let policyId = this.__param('policy_id');
        
        if (!this.cust[name]) return this.response(-101, 'Invalid name, not found in custom.js');
        let state = await db.row("select * from is_policy where policy_id=?", [policyId]);
        if (!state) return this.response(-101, 'Invalid policy id '+policyId);
        if (!this.__is_op_allowed(name, 'requeue')) return this.response(-102, 'Privillege needed');

        if (state.sync_state != 'completed') {
            let policy = await db.row("select * from is_policy_json where policy_id=?", [policyId]);
            if (!policy) {
                await is.notify(null, 'error', 'could not locate json but the policy is in state', state.sync_state, policyId);
                await db.exec("update is_policy set sync_state='downloaded' where policy_id=?", [policyId]);
                await is._download_policy(this.cust[name], policyId);
            } else {
                // if (moment(state.issue_date).isBefore('2022-06-08')) return this.response(-101, 'ignored - issue date' + state.issue_date);

                if (await is.add_to_queue(this.cust[name], policyId)) {
                    is.notify(null, 'info', 'requeue: moved '+policyId+' to queue', policyId);
                }
            }
            state = await db.row("select * from is_policy where policy_id=?", [policyId]);
        }
        return this.response(0, '', {...state});
    }

    async delete_attr() {
        let name = this.__param('name');
        let policyId = this.__param('policy_id');
        let attrName = this.__param('attr_name');

        if (!this.cust[name]) return this.response(-101, 'Invalid name, not found in custom.js');
        //if (!this.__is_op_allowed(name, 'attr')) return this.response(-102, 'Privillege needed');
        let state = await db.row("select * from is_policy where policy_id=?", [policyId]);
        if (!state) return this.response(-101, 'Invalid policy id '+policyId);
        if (state.sync_state == 'completed') return this.response(-101, 'Already completed');
        
        let arow = await db.row("select data from is_policy_attr where policy_id=?", [policyId]);
        if (!arow) return this.response(0, '', {});

        let attrs = JSON.parse(Buffer.from(arow.data).toString('utf8'));
        attrs[attrName] = '';
        
        await db.exec("insert into is_log_messages (type, def_name, policy_id, message) values ('info', ?, ?, ?)", 
            [name, policyId, 'user '+this.req.user+' reset ' + attrName + ' to empty']);


        await db.exec("update is_policy_attr set data=cast(JSON_MERGE_PATCH(cast(data as json), cast(? as json)) as char) where policy_id=?", [JSON.stringify({[attrName]: ""}), policyId]);

        // await db.exec("update is_policy_attr set data=? where policy_id=?", [JSON.stringify(attrs), policyId]);
        return this.response(0, '', {});
    }

    async post_attr() {
        let name = this.__param('name');
        let policyId = this.__param('policy_id');
        let attrName = this.__param('attr_name');
        let attrValue = this.__param('attr_value');

        if (!this.cust[name]) return this.response(-101, 'Invalid name, not found in custom.js');
        if (!this.__is_op_allowed(name, 'attr')) return this.response(-102, 'Privillege needed');

        let state = await db.row("select * from is_policy where policy_id=?", [policyId]);
        if (!state) return this.response(-101, 'Invalid policy id '+policyId);
        if (state.sync_state == 'completed') return this.response(-101, 'Already completed');
        let arow = await db.row("select data from is_policy_attr where policy_id=?", [policyId]);
        let attrs = arow ? JSON.parse(Buffer.from(arow.data).toString('utf8')) : {};
        attrs[attrName] = attrValue;
        
        await db.exec("insert into is_log_messages (type, def_name, policy_id, message) values ('info', ?, ?, ?)", 
            [name, policyId, 'user '+this.req.user+' changed ' + attrName + ' to ' + attrValue]);

        if (arow) 
            await db.exec("update is_policy_attr set data=cast(JSON_MERGE_PATCH(cast(data as json), cast(? as json)) as char) where policy_id=?", [JSON.stringify({[attrName]: attrValue}), policyId]);
            // await db.exec("update is_policy_attr set data=? where policy_id=?", [JSON.stringify(attrs), policyId]);
        //else await db.exec("insert into is_policy_attr (policy_id, data, author)", [policyId, JSON.stringify(attrs), this.req.user]);
		else await db.exec("insert into is_policy_attr (policy_id, data, author) values (?,?,?)", [policyId, JSON.stringify(attrs), this.req.user]); // Thillai
        return this.response(0, '', {});
    }

    async __update_issued_policies(policies) {
        let pids = policies.map(x => x.policy_id);
        let eids = await db.exec("select policy_id from is_policy_issued where policy_id in (?)", [pids]) || [];
        
        eids = eids.reduce((a, x) => {a[x.policy_id]=1; return a;}, {});
        let values = [];
        for (let policy of policies) {
            if (eids[policy.policy_id]) continue;
            let params = [policy.policy_id, policy.policy_no, policy.product_id, policy.product_group_id, policy.issue_date];
            values.push(params);
            if (values.length>=1000) {
                console.log('insert/update', values.length);
                await db.exec("insert into is_policy_issued(policy_id, policy_no, product_id, product_group_id, issue_date) values ? on duplicate key UPDATE policy_id=policy_id", [values]);
                values = [];
            }
        }
        if (values.length>0) {
            await db.exec("insert into is_policy_issued(policy_id, policy_no, product_id, product_group_id, issue_date) values ? on duplicate key UPDATE policy_id=policy_id", [values]);
        }
    }

    async _remote_calendar(name, start, end) {
        if (!this.cust[name]) return;
        try {
            await utils.iauth(this.cust[name]);
            let time = performance.now();
            let ret = await utils.iget(this.cust[name].server+'/api/v1/stats/query/policy_issued?start='+encodeURIComponent(start)+'&end='+encodeURIComponent(end), this.cust[name]);
            console.log('remote download time: ', (performance.now()-time).toFixed(2), 'ms');
            if (ret.status == 0) {
                let sum = {};
                for (let i=0; i<ret.data.length; i++) {
                    let id = ret.data[i].issue_date.split(' ');
                    if (sum[id[0]] === undefined) sum[id[0]] = 1;
                    else sum[id[0]]++;
                }
                let arr = [];
                for (let day in sum) arr.push({total: sum[day], day: day, mday: +(day.split('-')[2])});
                await this.__update_issued_policies(ret.data);
                return arr;
            }
        } catch (e) {
            console.log(e);
        }
        return [];
    }

    async _update_remote_calendar(name, start, end) {
        if (!this.cust[name]) return;
        return await is._update_issued_polciies(this.cust[name], start, end);


        // try {
        //     await utils.iauth(this.cust[name]);
        //     let time = performance.now();
        //     let ret = await utils.iget(this.cust[name].server+'/b2c/api/v1/stats/query/policy_issued?start='+encodeURIComponent(start)+'&end='+encodeURIComponent(end), this.cust[name]);
        //     console.log('_update_remote_calendar: remote download time: ', (performance.now()-time).toFixed(2), 'ms');
        //     if (ret.status == 0) {
        //         await this.__update_issued_policies(ret.data);
        //     }
        // } catch (e) {
        //     console.log(e);
        // }
    }


    async get_calendar() {
        let year = +this.__param('year');
        let month = +this.__param('month');
        let product = this._param('product');

        let start = moment(Date.UTC(year, month, 1)).startOf('month');
        let end = start.clone().endOf('month');

        start = start.utcOffset(-330);
        end = end.utcOffset(-330);

        let table = this._param('remote') ? "is_policy_issued" : "is_policy";
        let sql = "select count(*) as total, DAY(CONVERT_TZ(issue_date, '+00:00', '+05:30')) as mday from "+table+" where issue_date>=? and issue_date<=?";
        let params = [start.format('YYYY-MM-DD HH:mm:ss.000'), end.format('YYYY-MM-DD HH:mm:ss.999')];

        if (!this._param('remote')) {
            if (+this.__param('completed')) sql += " and (sync_state='completed' or sync_state='skipped')";
        }

        if (product) {sql += ' and product_id=?'; params.push(product);}

        sql += " group by mday";
        let rows = await db.exec(sql, params);

        this.response(0, '', rows||[]);
    }

    async post_calendar() {
        let year = +this.__param('year');
        let month = +this.__param('month');
        let start = moment(Date.UTC(year, month, 1)).startOf('month');
        let end = start.clone().endOf('month');
        if (!this.__is_op_allowed('policy', 'calendar')) return this.response(-102, 'Privillege needed');
        return this.response(0, '', await this._update_remote_calendar(this.__param('remote'), start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD 23:59:59.999')));
    }

    async get_compare() {
        let date = this.__param('date');
        let name = this.__param('name');
        let start = moment(date, 'YYYY-MM-DD').startOf('day');
        if (!start.isValid()) return this.response(-101, 'Invalid date '+date);
        if (!this.cust[name]) return this.response(-101, 'Invalid name '+name);

        let end = start.clone().endOf('day').format('YYYY-MM-DD HH:mm:ss');;

        start = start.format('YYYY-MM-DD HH:mm:ss');
        let sql = "select * from is_policy where issue_date>=? and issue_date<=?";
        let local = await db.exec(sql, [start, end]);
        
        await utils.iauth(this.cust[name]);
        let ret = await utils.iget(this.cust[name].server+'/api/v1/stats/query/policy_issued?start='+encodeURIComponent(start)+'&end='+encodeURIComponent(end), this.cust[name]);
        let remote = [];
        if (ret?.status == 0) return this.response(0, '', {local, remote: ret.data});
        return this.response(-101, 'Invalid query (check permissions) ' + ret?.txt);
    }

    async post_updatejson() {
        let policyId = this.__param('policy_id');
        let name = this.__param('name');
        if (!this.cust[name]) return this.response(-101, 'Invalid name '+name);
        if (!this.__is_op_allowed(name, 'updatejson')) return this.response(-102, 'Privillege needed');
        await utils.iauth(this.cust[name]);
        let ret = await utils.ipost(this.cust[name].server+'/api/v1/policy/update_json', {policy_id: policyId}, this.cust[name]);
        if (ret?.status==0) {
            // not likely to be there, still
            await db.exec("update is_policy set sync_state='downloaded' where policy_id=?", [policyId]);
            await is._download_policy(this.cust[name], policyId);
        } else {
            console.log('updatejson:', ret);
        }
        return this.response(ret?.status||-101, ret?.txt, ret?.data);
    }

    async _find_field(name, product, fname, jpath) {
        let moddef = this.cust[name];
        if (!moddef) throw new Error('Invalid name '+name);
        let isprodcode = moddef.product_names?.[product.toLowerCase()];
        
        let edit = moddef.edit?.[product] || moddef.edit?.[isprodcode];
        if (!edit) throw new Error('Edit not allowed '+product);

        // remove array indices
        jpath = jpath.split('.').filter(x => !is_int(x)).join('.');
        for (let fld of edit.fields||[]) {
            if (fld.name == fname || fld.jpath == jpath) return fld;
        }
        throw new Error('Field not allowed '+name+' '+jpath);
    }

    async get_fields() {
        let policyId = this.__param('policy_id');
        let name = this.__param('name');
        
        let state = await db.row("select * from is_policy where policy_id=?", [policyId]);
        if (!state) return this.response(-101, 'Invalid policy id '+policyId);
        
        let prec = await db.row("select * from is_policy_json where policy_id=?", [policyId]);
        if (!prec) return this.response(-101, 'Invalid policy id (not downloaded) '+policyId);
        
        let moddef = this.cust[name];
        if (!moddef) throw new Error('Invalid name '+name);
        if (!moddef.edit) moddef.edit = {};
        let isprodcode = moddef.product_names[state.product_name.toLowerCase()];
        return this.response(0, '', moddef.edit[state.product_name] || moddef.edit[isprodcode] || []);
    }

    async post_edit() {
        let policyId = this.__param('policy_id');
        let state = await db.row("select * from is_policy where policy_id=?", [policyId]);
        if (!state) this.response(-101, 'Invalid policy id '+policyId);
        let prec = await db.row("select * from is_policy_json where policy_id=?", [policyId]);
        if (!prec) this.response(-101, 'Invalid policy id (not downloaded) '+policyId);

        if (!this.__is_op_allowed('policy', 'edit')) return this.response(-102, 'Privillege needed');

        await idata.fix(prec);

        let jpath = this._param('jpath');
        let fld = await this._find_field(this.__param('name'), state.product_name, this._param('fname'), jpath);
        let policy = JSON.parse(Buffer.from(prec.data).toString('utf8'));
        let parts = jpath.split('.');
        let obj = policy;
        for (let i=0; i<parts.length-1; i++) {
            let part = parts[i];
            if (!obj[part]) throw new Error('Invalid jpath '+part + " not found in policy");
            if (typeof obj[part] !== 'object' /*|| Array.isArray(obj[part])*/) throw new Error('Invalid jpath '+part + " is not sub object " + typeof obj[part]);
            obj = obj[part];
        }
        if (!obj) throw new Error('Invalid jpath not found in policy');

        let value = this.__param('value');
        if (fld.type == 'number') {
            value = +value;
            if (isNaN(value)) throw new Error('Expected value to be a number');
        }
        obj[parts[parts.length-1]] = value;

        let sdata = await idata.store(policy.policy_id, JSON.stringify(policy));
        if (!sdata) sdata = JSON.stringify(policy);
        await db.exec("update is_policy_json set data=?, author=? where policy_id=?", [sdata, this.req.user, policy.policy_id]);
        return this.response(0, '', policy);
    }

    async get_config() {
        let name = this.__param('name');
        let ret = await db.exec("select distinct product_id, product_name from is_policy where issue_date > date_add(now(), INTERVAL -60 DAY)");		
        let config = {sqs: {url: this.cust[name]?.sqs.url}, products: ret};
		console.log("Custom Msge :::::> ",config);
        return this.response(0, '', config);
    }

    async post_twigtest() {
        let twig = this.__param('twig');
        let json = this.__param('json');
        let data = {j: JSON.parse(json), t: twig};
        let res = await itwig.transform(data);
        return this.response(0, '', res);
    }
}

module.exports = stats;