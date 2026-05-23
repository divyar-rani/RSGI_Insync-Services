const { workerData } = require('worker_threads');
const twigbase = require('../common/twigbase');
const utils = require('../common/utils')


class client extends twigbase {
	
	async __add_additional_data(policy) {
     //
    }
	
    async _process_service(service, policy) {

        if (await this.__check_service_status(service, policy)) { console.log("Return true***************** ",service.name,  policy.policy_id); return true};
		// await this.__add_additional_data(policy);					
        let ndata = await this.__transform_all(service, policy);
        if (ndata === null) return false;
        if (!(await this.__call_service(service, policy, ndata[ndata.length-1]))) {
            return false;
        }
        return true;
    }
 
}

(new client('client')).run(workerData);
