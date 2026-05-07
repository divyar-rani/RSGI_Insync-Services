const { workerData } = require('worker_threads');
const idata = require('../../lib/is3');
const utils = require('./../common/utils');
const db = require('./../common/db');
const ish = require('./../common/ishelper');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const twigbase = require('../common/twigbase');


class insillion extends twigbase {

    async __add_additional_data(policy) {

    }
    async __make_meta_data(policy, adata) {
        let ret = {};
        ret.fgen_client_id = adata['fgen_client_id'] || '';		
		ret.fgen_policy_no = adata['fgen_policy_no'] || '';		
        ret.fgen_endt_policy_no = adata['fgen_endt_policy_no'] || '';		
        return ret;   
    }

    async __update_ins_meta(policy, adata, attr) {

        let ins = await db.row("select * from is_policy_insillion where policy_id=?", [policy.policy_id]);
        if (ins?.last_update && moment(ins.last_update).isSameOrAfter(moment(attr.u_ts))) return true;

        let meta = await this.__make_meta_data(policy, adata);

        let url = 'http://localhost:8000/api/v1/policy/meta/' + encodeURIComponent(policy.policy_id);

        let ret = await utils.ipost(url, meta, this.ish.conf[this.ish.name]);
		 console.log("Return true***************** insillionnnn", policy.policy_id, ret); 
        if (ret && ret.status == 0) {
            let params = [policy.policy_id, attr.u_ts];
            if (!await db.exec("insert into is_policy_insillion(policy_id, last_update) values (?, ?) as x on duplicate key update last_update=x.last_update", params))
                console.log('***', db.error);
            return true;
        }

        console.log('revfeed:', ret ? ret.txt : 'error');
        return false;
    }

    async _process_service(service, policy) {
		 console.log("Return true***************** ",service.name,  policy.policy_id); ;
        let attr = await db.row('select * from is_policy_attr where policy_id=?', [policy.policy_id]);
        let adata = JSON.parse(attr?.data || {});
        if (Object.keys(adata).length == 0) return false
        let ret = await this.__update_ins_meta(policy, adata, attr);
		await this.ish.__log('info', `RevFeed: ${policy.policy_id} SUCCESS`, policy.policy_id, service.name);
		await this.ish.set_attr(policy.policy_id, `revfeed-${policy.policy_id}`, 'SUCCESS');		
        return ret;
    }

}

(new insillion('insillion')).run(workerData);