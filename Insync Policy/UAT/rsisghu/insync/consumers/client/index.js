const { workerData } = require('worker_threads');
const twigbase = require('../common/twigbase');
const ish = require('./../common/ishelper');
const utils = require('../common/utils')


class client extends twigbase {
	
	async __add_additional_data(policy) {
     if(policy.proposal?.data?.customer_id != '' && policy.proposal?.data?.customer_id != null){
        let client_id = policy.proposal?.data?.customer_id;
        await this.ish.set_attr(policy.policy_id,'client_id',client_id);
     }
    }
	
    async _process_service(service, policy) {
        await this.__add_additional_data(policy);	
        if (await this.__check_service_status(service, policy)) { return true};						
        let ndata = await this.__transform_all(service, policy);
        if (ndata === null) return false;
        if (!(await this.__call_service(service, policy, ndata[ndata.length-1]))) {
            return false;
        }
        return true;
    }
 
}

(new client('client')).run(workerData);
