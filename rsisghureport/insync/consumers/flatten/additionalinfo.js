const utils = require('../common/utils');
const moment = require('moment');

class additionalinfo {
    _fix_date(str, outfmt) {
        let fmt = utils._guess_date_format(str);
        let mdt = moment(str, fmt);
        if (!outfmt) outfmt = 'DD/MM/YYYY';
        return mdt.isValid() ? mdt.format(outfmt) : str;
    }
	async __add_addtional_data(policy) {
			policy.d_policy_no = (policy.policy_no).substr(0, 14) || '';
	}
	
	// Merge one array element and add some additional data 
	async __merge_array(policy,dp,arr_obj){
		dp.policy_id = policy.policy_id;
		dp.d_policy_no = (policy.policy_no).substr(0, 14);
		return {...arr_obj, ...dp}; 
	}
}

module.exports = additionalinfo;