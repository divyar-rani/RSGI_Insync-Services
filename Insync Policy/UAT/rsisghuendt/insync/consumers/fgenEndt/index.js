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
        if (!isNaN(value)) {			
            const baseDate = new Date(1899, 11, 30); // Excel base date
            baseDate.setDate(baseDate.getDate() + Number(value));
            policy.proposal.data.is_fg_policy_end_date =  utils._fix_date(baseDate.toISOString().split("T")[0]);
        }
        else{
            policy.proposal.data.is_fg_policy_end_date = utils._fix_date(value);
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
            let xpath = 'soapenv:Envelope.soapenv:Body.ns2:FGUWResponseVO';
            let val = await utils.jpath_value(jx, xpath, service.target.strobjs);
            if (!val) {
                let faultXpath = 'soapenv:Envelope.soapenv:Body.soapenv:Fault';
                let fault = await utils.jpath_value(jx, faultXpath, service.target.strobjs);
    
                if (fault) {
                    let code = fault.Code?.Value || fault['soapenv:Code']?.['soapenv:Value'];
                    let message = fault.Reason?.Text || fault['soapenv:Reason']?.['soapenv:Text'];
    
                    code = Array.isArray(code) ? code[0] : code;
                    message = Array.isArray(message) ? message[0] : message;
    
                    console.log("FAULT ERROR", code, message);
                    return `${code || 'FAULT'} - ${message || 'Unknown SOAP Fault'}`;
                }
    
                return 'Invalid response from FG';
            }
            let status = Array.isArray(val.status) ? val.status[0] : val.status;
            let errorMsg = Array.isArray(val.errorMsg) ? val.errorMsg[0] : val.errorMsg;
            let errorDetail = val.errorDetailVOList;
    
            if (status === 'FAIL' || (errorDetail && errorDetail.errorDesc) || errorMsg) {
    
                const errorDesc = errorDetail?.errorDesc || '';
    
                if (errorDesc.toLowerCase().includes('policy already exists')) {
                    return null;
                }
    
                let errors = [];
    
                if (errorMsg) {
                    errors.push({
                        error_code: errorMsg,
                        error_desc: errorMsg
                    });
                } else if (errorDetail) {
                    if (Array.isArray(errorDetail)) {
                        errorDetail.forEach(err => {
                            errors.push({
                                error_code: err.errorCode || null,
                                error_desc: err.errorDesc || null
                            });
                        });
                    } else {
                        errors.push({
                            error_code: errorDetail.errorCode || null,
                            error_desc: errorDetail.errorDesc || null
                        });
                    }
                }
    
                console.log("final-errors", errorMsg ? errorMsg : JSON.stringify(errorDetail));
                return val.errorMsg ? val.errorMsg : JSON.stringify(val.errorDetailVOList);
                // return val;
            }
    
            return null;
        }
    //SUCCESS
    async __get_fg_endt_status(service, jx, policyId, subid, attr) {
            let xpath = 'soapenv:Envelope.soapenv:Body.ns2:FGUWResponseVO';
            let val = await utils.jpath_value(jx, xpath, service.target.strobjs);
            if (val?.status == 'SUCCESS' || (val?.status == 'FAIL' && (val?.errorDetailVOList?.errorDesc.toLowerCase().includes('policy already exists')))) {
                const errorCode_exe = val?.errorMsg ? val?.errorMsg : JSON.stringify(val?.errorDetailVOList?.errorCode);
                const errorDesc_exe = val?.errorMsg ? val?.errorMsg : JSON.stringify(val?.errorDetailVOList?.errorDesc);
                let policy_no = await utils.jpath_value(jx, "soapenv:Envelope.soapenv:Body.ns2:FGUWResponseVO.polNo", service.target.strobjs);
                return policy_no;
            }
            // console.log("failed-----");
            return null;
        }
    }
}

(new fgenEndt('fgenEndt')).run(workerData);
