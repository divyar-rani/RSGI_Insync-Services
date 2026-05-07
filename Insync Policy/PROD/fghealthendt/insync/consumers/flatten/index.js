const { workerData } = require('worker_threads');
const twigbase = require('../common/twigbase');
const moment = require('moment');
const conf = require("./config");
const db = require("../common/db");
const additionalinfo = require('./additionalinfo');
const dest_db = require("./../common/orcldb");
//const dest_db = require("./../common/mysqldb");
const db_type = (process.env['IS_DB_TYPE'] ||'').toLowerCase();
//const dest_db = db_type == 'oracle' ? require("../common/orcldb") : require("../common/mysqldb");

class policy extends twigbase {


constructor(...args) {
    super(...args);

    let dbType = (process.env['IS_DB_TYPE'] || '').toLowerCase();

    if (dbType === 'oracle') {
        this.dest_db = require("./../common/orcldb");
    } else if (dbType === 'mysql') {
        this.dest_db = require("./../common/mysqldb");
    } else {
        this.dest_db = require("./../common/db");
    }
}


    _deep_to_shallow(json, jpath) {
        //console.log('jpath:', jpath);
        let parts = jpath.split('.');
        let js = json;
        while (parts.length > 1 && js) js = js[parts.shift()];
        return js ? js[parts[0]] : undefined;
    }

    async _check_processed(policy, table, tname) {
        let params = [];
        let jpath = "";
        let row;
        let sql = "select count(*) as CNT from " + tname + " where 1=1"
       let cond = "";
	    if (!table.uniques) return 'uniqueid not configured';

        for (let fl of table.uniques || []) {
            if (db_type && db_type === 'oracle') {
                cond += " and " + fl + " = :" + fl;
            } else {
                cond += " and " + fl + " = ?";
            }
            if (fl == 'policy_id') {
                params.push(policy.policy_id);
            } else {
                for (let fld of table.fields) {
                    if (fld.name == fl && fl != 'policy_id') {
                        jpath = fld.jpath;
                        let val = this._deep_to_shallow(policy, jpath);
                        params.push(val);
                    }
                }
            }
        }
	    row = await dest_db.row(sql+cond, params);
        if (row[0].CNT>0 && (table.repush)){
		await dest_db.row("delete from "+tname+" where 1=1 " + cond,params);
		await this.ish.__log('info', 'deleted existing data['+tname+']', policy.policy_id);
		return 0;
	}else{
		return row[0].CNT;
	}
       // row = await dest_db.row(sql, params);
       // return row.CNT;
        //return row instanceof Array ? row[0].CNT : row.CNT; // oracle returns in array whereas mysql object
        //return {sql:sql,param:params};
    }

async __check_policy_status(policy_id){
                let ret = await db.row("select sync_state from is_policy where policy_id = ?" , [policy_id]);
                //console.log("checkpolicystatus",ret,policy_id);
                if(ret.sync_state == 'completed'){
                        return true;
                }else{
                        return false;
                }
        }

    async _add_to_table(policy, tname, table, subid) {
        // step: 1
        let row = await this._check_processed(policy, table, tname)
        console.log('row exist ?...', row);
        if (row > 0) {
            await this.ish.__log('info', 'Already completed', policy.policy_id);
            await this.ish.__state(policy.policy_id, '');
            return true; // already processed
        } else if (row && row.startsWith('uniqueid')) {
            await this.ish.__log('info', row, policy.policy_id);
            return true;
        }

        let flat = {};
        let haserrors = false;
        let fvals = [];
		let dFmt = 'YYYY-MM-DD hh:mm:ss A';
        // step: 2
        for (let fld of table.fields) {
            let val = null;
            if (fld.name == 'policy_id')
                val = policy.policy_id;
            else if (fld.jpath == '*') {
                val = policy;
            }
            else {
                let paths = fld.jpath.split(',');
                for (let jpath of paths) {
                    val = this._deep_to_shallow(policy, jpath);
                    if (val !== undefined) break;
                }
            }

            // mandatory field must have values otherthan undefined
            if (val === undefined && fld.mandatory) {
                await this.ish.__log('error', 'mandatory field (' + tname + '): ' + fld.name + ' missing', policy.policy_id);
                haserrors = true;
            } else {
                if ((val !== null && val !== 'null' && val !== undefined && val !== '') || fld.default === undefined) {
                    /*if (db_type && db_type == 'oracle') {
                        if (fld.type.toLowerCase() == 'date') val = moment(val).format('DD-MMM-YYYY hh:mm:ss A');
                    } else {
                        if (fld.type.toLowerCase() == 'date') val = moment(val).format('YYYY-MM-DD hh:mm:ss A');
                    } */
                    if (fld.hasOwnProperty("fmt") && fld.fmt.length>0) dFmt = fld.fmt; 
                    if (fld.type.toLowerCase() == 'date') val = moment(val,dFmt).format('YYYY-MM-DD hh:mm:ss A');
                    //if (fld.type.toLowerCase() == 'date') val = moment(val,dFmt).format(dFmt);
                    if (fld.type == 'json') val = JSON.stringify(val);

                    flat[fld.name] = val;
                    /*bind fields with format date ( oracle ':fld', others '?' )*/
                    if (db_type && db_type == 'oracle') {
                        if (fld.type.toLowerCase() == 'date') {
                            //fvals.push('to_date(:' + fld.name + ',\'DD-MON-YYYY HH:MI:SS AM\')');
                            fvals.push('to_date(:' + fld.name + ',\'YYYY-MM-DD HH:MI:SS AM\')');
                        } else {
                            fvals.push(':' + fld.name);
                        }
                    } else {
                        fvals.push('?');
                    }

                } else {
                    // do not include this (null) in insert list (leave it to default)
                }
            }
        }

        if (haserrors) {
            await this.ish.__state(policy.policy_id, 'data-missing');
            return false;
        }

        let fnames = Object.keys(flat); // we only insert fields with values found, leave the rest to default values
        /*let fvals;
        if (db_type && db_type =='oracle'){
            fvals = fnames.map(x => ':'+x); // only bind parameters allowed
        }else{
            fvals = fnames.map(x => '?');
        }*/
        // step: 3
        let sql = "insert into " + tname + "(" + fnames.join(',') + ") values (" + fvals.join(',') + ")";
        let ins = await dest_db.exec(sql, fnames.map(x => flat[x]));
        let ret = db_type == 'oracle' ? ins.lastRowid : ins;
        if (!(ret)) {
            await this.ish.__log('error', 'dest_db insert failed:' + tname + ': ' + dest_db.error, policy.policy_id);
            await this.ish.__state(policy.policy_id, 'db-error');
            return false;
        } else {
            await this.ish.set_attr(policy.policy_id, tname + '_' + subid + '_ref_no', policy.policy_id);
            await this.ish.__log('info', 'processed ' + tname, policy.policy_id);
        }
        return true;
    }

    async process_policy(policy) {
        let name = this.ish.name;
        // step 1: ensure this record has not been already processed by checking the backend
        //          if already processed, mark it completed
        //
        // step 2: validate all the inputs (mandatory etc) are present and valid
        //          if error found, mark the state as "data-missing"
        //          use this.ish.__log to register actual error
        //
        // step 3: add to the back-end
        //          if failed, mark the state as "db-error" or "[bkend]-error"
        //          use this.ish.__log to register actual error
        //
        // use this.ish.__log to log progress or intermediary stage or error messages
	if (await this.__check_policy_status(policy.policy_id)) return true;
	   await (new additionalinfo()).__add_addtional_data(policy);
        try {
            let tablerrors = false;
            for (let tname in conf[name].schema) {
                if (tablerrors) break;
				let prds = conf[name].schema[tname].products;
                let array_obj = conf[name].schema[tname].array_obj || '';
                if (prds.includes(policy.is_product_code) == true || prds == 'all') {
                    if (array_obj) { // array_obj to be executed for each item, so simplify the array for multiple insert
                        let obj = this._deep_to_shallow(policy, array_obj);
                        let idx = 1;
                        for (let dp of obj || []) {
                            idx = idx+1;
							let data = await (new additionalinfo()).__merge_array(policy, dp, obj);
                            //console.log('derived policy.............', data);
                            this.__fs_log(tname, policy.policy_id + '-0.json', JSON.stringify(data), policy);
                            if (!(await this._add_to_table(data, tname, conf[name].schema[tname], idx))) {
                                tablerrors = true;
                                break;
                            }
                        }
                    } else {
                        this.__fs_log(tname, policy.policy_id + '-0.json', JSON.stringify(policy), policy);
                        if (!(await this._add_to_table(policy, tname, conf[name].schema[tname], ''))) {
                            tablerrors = true;
                            break;
                        }
                    }
                } else {
                    await this.ish.__log('info', 'skipped table (' + tname + ')', policy.policy_id);
                }
            }

            if (!tablerrors) await this.ish.__state(policy.policy_id, 'completed');
            else await this.ish.__log('error', 'table errors found ' + policy.policy_id, policy.policy_id);

        } catch (e) {
            this.ish.__log('error', 'processing failed ' + e.message, policy.policy_id, this.constructor.name);
            this.ish.__state(policy.policy_id, 'generic');
        }
    }
    // process and mark policies
    //
    async process_next() {
		let msgs = await this.ish.fetch(1);
       // console.log("**************",msgs);
	  //  console.log("policy", policy.policy_id);
        //return msgs.length;
		for (let msg of msgs) {
			//let pid = msg.Body || msg.messageText || msg.content;	// aws/azure/oci value(policy id)
			let pid = msg;
			//console.log("pidd",pid);
			let mid = msg.messageId || ''; 	
			//console.log("mid",mid);
			// need this id only for remove Azure queue
            let policy = await this.ish.policy(pid);        // no exception will be thrown
			//console.log("policy",policy);
            //await (new additionalinfo()).__add_addtional_data(policy);
            if (policy) await this.process_policy(policy);  // handle exceptions inside this function
			await this.ish.mark(mid,pid); 
        }
		return msgs.length;
    }
}
(new policy('policydata')).run(workerData);
