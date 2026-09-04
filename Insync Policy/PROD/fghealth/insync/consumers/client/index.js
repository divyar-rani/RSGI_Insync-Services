const { workerData } = require('worker_threads');
const twigbase = require('../common/twigbase');
const utils = require('../common/utils')


class client extends twigbase {
	
	async __add_additional_data(policy) {
		const customerType = policy?.proposal?.data?.customer_type;
		const partyId = policy?.proposal?.data?.party_id;

		if ((customerType === 'Existing' || customerType === 'New') && partyId) {
			await this.ish.set_attr(policy.policy_id, 'client_id', partyId);
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
