const { workerData } = require('worker_threads');
const twigbase = require('../common/twigbase');
const utils = require('../common/utils');
const { error } = require('../common/db');


class fgenEndt extends twigbase {

    async __add_additional_data(policy) {
        let endorsement_no = '000';

        policy.proposal.data.is_fg_policy_start_date = utils._fix_date(policy.endorsement?.data?.endorsement_start_date);
        //policy.proposal.data.is_fg_policy_end_date = utils._fix_date(policy.endorsement?.data?.policy_end_date);
        let value = policy.endorsement?.data?.policy_end_date ; 
        console.log("************* ", value);
        if (!isNaN(value)) {
            const baseDate = new Date(1899, 11, 30); // Excel base date
            baseDate.setDate(baseDate.getDate() + Number(value));
            policy.proposal.data.is_fg_policy_end_date =  utils._fix_date(baseDate.toISOString().split("T")[0]);
        }
        else{
            policy.proposal.data.is_fg_policy_end_date = utils._fix_date(policy.endorsement?.data?.policy_end_date);
        }

        policy.proposal.data.is_fg_issue_date = utils._fix_date(policy.data.u_ts);
        policy.proposal.data.is_fg_proposal_date = utils._fix_date(policy?.eproposal?.eproposal_date);
        policy.proposal.data.is_fg_acc_date = new Date(policy.proposal.data.is_fg_policy_start_date) > new Date(policy.proposal.data.is_fg_issue_date) ? policy.proposal.data.is_fg_policy_start_date : policy.proposal.data.is_fg_issue_date;

        const val = policy.endorsement_no;
        const result = val.slice(0, 10) + val.split('-')[0].slice(-2) + val.split('-')[1];
        policy.proposal.data.is_taxinvoice_id = result;
    }

    async _process_service(service, policy) {
        if (await this.__check_service_status(service, policy)) return true;
        await this.__add_additional_data(policy);
        let ndata = await this.__transform_all(service, policy);
        if (ndata === null) return false;
        if (!(await this.__call_service(service, policy, ndata[ndata.length - 1]))) {
            return false;
        }
        return true;
    }

    //FAILURE
    async __get_fg_endt_err_status(service, jx, policyId, subid, attr) {
        let err_status = await utils.jpath_value(jx, "soapenv:Envelope.soapenv:Body?.ns2:FGUWResponseVO.status", service.target.strobjs) || '';
        if (err_status == 'FAIL')
            return null;
        else
            return "Response Error Plse check response.txt";


    }
    //SUCCESS
    async __get_fg_endt_status(service, jx, policyId, subid, attr) {
        let status = await utils.jpath_value(jx, "soapenv:Envelope.soapenv:Body.ns2:FGUWResponseVO.status", service.target.strobjs);
        let errorMessage = '';
        if (status && status == 'SUCCESS') errorMessage = await utils.jpath_value(jx, "soapenv:Envelope.soapenv:Body.ns2:FGUWResponseVO.successMsg", service.target.strobjs);
        else errorMessage = await utils.jpath_value(jx, "soapenv:Envelope.soapenv:Body.ns2:FGUWResponseVO.errorDetailVOList.errorDesc", service.target.strobjs) || '';
        console.log("******************* ", status, " ** ", errorMessage);
        let policy_no = "";
        if (errorMessage) {
            if (status == 'SUCCESS' || errorMessage.includes('Posted Successfully') || errorMessage.includes('UnCategorised Error::Policy already Exists in Master')) {
                policy_no = await utils.jpath_value(jx, "soapenv:Envelope.soapenv:Body.ns2:FGUWResponseVO.polNo", service.target.strobjs);
                return policy_no;
            }
        }
        return null;
    }
}

(new fgenEndt('fgenEndt')).run(workerData);
