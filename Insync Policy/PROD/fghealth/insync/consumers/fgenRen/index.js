const { workerData } = require('worker_threads');
const twigbase = require('../common/twigbase');
const utils = require('../common/utils');
const db = require("../common/db");
const { error } = require('../common/db');

const dest_db = require("./../common/orcldb");
let policydata = ""; // exception

class fgenRen extends twigbase {

    async __add_additional_data(policy) {
        let endorsement_no = '000';

        policy.proposal.data.is_fg_policy_no = policy.policy_no.slice(0, 10) + policy.policy_no.slice(-2) + endorsement_no;
		
		policy.proposal.data.is_fg_policy_start_date = utils._fix_date(policy.proposal.data.policy_start_date);
		policy.proposal.data.is_fg_policy_end_date = utils._fix_date(policy.proposal.data.policy_end_date);
        policy.proposal.data.is_fg_issue_date = utils._fix_date(policy.data.issue_date);
        policy.proposal.data.is_fg_proposal_date = utils._fix_date(policy.proposal.proposal_date);
        policy.proposal.data.is_fg_acc_date = new Date(policy.proposal.data.is_fg_policy_start_date) > new Date(policy.proposal.data.is_fg_issue_date) ? policy.proposal.data.is_fg_policy_start_date : policy.proposal.data.is_fg_issue_date;
        // console.log("Proposal data Check ", policy.proposal.data.is_fg_policy_no,' -> ',policy.proposal.data.is_is_fg_policy_start_date,' -> ',policy.proposal.data.is_fg_policy_end_date ,' -> ',policy.proposal.data.is_fg_issue_date,' -> ',policy.proposal.data.is_fg_proposal_date,' -> ',policy.proposal.data.is_fg_acc_date);
    }

    async _process_service(service, policy) {
        policydata = policy; //exception
        if (await this.__check_service_status(service, policy)) { console.log("Return true***************** ",service.name,  policy.policy_id); return true};
        await this.__add_additional_data(policy);
        let ndata = await this.__transform_all(service, policy);
		if(policy?.proposal?.data?.coinsurance_type?.toLowerCase() != 'no co-insurance' && policy?.proposal?.data?.co_insurance_type?.toLowerCase() != 'no co-insurance' ){
			await db.exec("update is_policy set sync_state='hold' where policy_id=?", [policy.policy_id]);
			return false;
		}
        if (ndata === null) return false;
        if (!(await this.__call_service(service, policy, ndata[ndata.length - 1]))) {
            return false;
        }
        return true;
    }

    async __exception(data) {
            try {
                await dest_db.exec(
                    `INSERT INTO FGEN_INSYNC_EXCEPTION
                   (
                     product_code,
                     policy_number,
                     endt_number,
                     agent_code,
                     branch_code,
                     error_date,
                     fgen_error_code,
                     fgen_error_desc,
                     error_status,
                     premium_value,
                     total_tax,
                     entry_operator_id,
                     imd_channel,
                     imd_subchannel,
                     cgst,
                     ugst,
                     igst,
                     sgst,
                     error_flag,
                 policy_issue_date,
                 policy_transaction_type
                   )
                   VALUES
                   (
                     :product_code,
                     :policy_number,
                     :endt_number,
                     :agent_code,
                     :branch_code,
                     SYSDATE,
                     :error_code,
                     :error_desc,
                     :error_status,
                     :premium_value,
                     :total_tax,
                     :entry_operator_id,
                     :imd_channel,
                     :imd_subchannel,
                     :cgst,
                     :ugst,
                     :igst,
                     :sgst,
                     :error_flag,
                 TO_TIMESTAMP(:policy_issue_date, 'YYYY-MM-DD HH24:MI:SS'),
                 :policy_transaction_type
                   )`,
                    [
                        data.product_code,
                        data.policy_number,
                        data.endt_number,
                        data.agent_code,
                        data.branch_code,
                        data.error_code,
                        data.error_desc,
                        data.error_status,
                        data.premium_value,
                        data.total_tax,
                        data.entry_operator_id,
                        data.imd_channel,
                        data.imd_subchannel,
                        data.cgst,
                        data.ugst,
                        data.igst,
                        data.sgst,
                        data.error_flag,
                        data.policy_issue_date,
                        data.policy_transaction_type
                    ]
                );
    
            } catch (err) {
                console.error("Exception insert failed:", err);
            }
        }
    
        async __getGST(res) {
            let gst = { cgst: 0, sgst: 0, igst: 0, ugst: 0 };
            const data = res.quote.data;
    
            gst.cgst = data.cgst_amount ?? gst.cgst;
            gst.sgst = data.sgst_amount ?? gst.sgst;
            gst.igst = data.igst_amount ?? gst.igst;
            gst.ugst = data.ugst_amount ?? gst.ugst;
    
            gst.cgst = data.premium_value_cgst ?? gst.cgst;
            gst.sgst = data.premium_value_sgst ?? gst.sgst;
            gst.igst = data.premium_value_igst ?? gst.igst;
            gst.ugst = data.premium_value_ugst ?? gst.ugst;
    
            if (data.tax_details && data.tax_details.tax_parts) {
                data.tax_details.tax_parts.forEach(tax => {
                    if (tax.name === 'CGST') gst.cgst = tax.value;
                    if (tax.name === 'SGST') gst.sgst = tax.value;
                    if (tax.name === 'IGST') gst.igst = tax.value;
                    if (tax.name === 'UGST') gst.ugst = tax.value;
                });
            }
            return gst;
        }


    //FAILURE
    async __get_fg_ren_err_status(service, jx, policyId, subid, attr) {
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

            if (errorDesc?.toLowerCase().includes('policy already exists')) {
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

            let policy_data = policydata;
                        let imdsubchannel = policy_data.proposal.data.imd_subchannel;
                        let gstdetails = await this.__getGST(policy_data);
                        let policy_trans_type = policy_data.proposal.data.policy_transaction_type;
                        let fg_prod_code = policy_data.product_id == 'M200000000002' ? 'AMG' : 'APG';
                        // await dest_db.exec(
                        //     `UPDATE FGEN_INSYNC_EXCEPTION
                        //                                    SET error_flag = 0
                        //                                    WHERE policy_number = :policy_number
                        //                                      AND error_flag = 1`,
                        //     [
                        //         policy_data.policy_no
                        //     ]
            
                        // );
            
                        console.log("errors>>>>>>>>>>", errors);
                        console.log("productname", policy_data.is_product_code);
                        for (const err of errors) {
                            let exceptiondata = {
                                product_code: fg_prod_code,
                                policy_number: policy_data.policy_no,
                                endt_number: '000',
                                agent_code: policy_data.quote.data.imd_code,
                                branch_code: policy_data.quote.data.branch_code,
                                error_code: err.error_code,
                                error_desc: err.error_desc,
                                error_status: 'Failed',
                                premium_value: policy_data.payment.premium_value,
                                total_tax: policy_data.payment.total_tax,
                                entry_operator_id: 'GHIPOLICY',
                                imd_channel: policy_data.proposal.data.imd_channel,
                                imd_subchannel: imdsubchannel,
                                cgst: gstdetails.cgst,
                                ugst: gstdetails.ugst,
                                igst: gstdetails.igst,
                                sgst: gstdetails.sgst,
                                error_flag: '1',
                                policy_issue_date: policy_data.issue_date,
                                policy_transaction_type: policy_trans_type
                            };
            
                            console.log("exceptiondata", exceptiondata);
                            let excepcal1 = await this.__exception(exceptiondata);
                            console.log("excepcal1>>>>", excepcal1);
                            console.log("after completion exception");
                            //return val.errorMsg ? val.errorMsg : JSON.stringify(val.errorDetailVOList);
                        }

            console.log("final-errors", errorMsg ? errorMsg : JSON.stringify(errorDetail));
            return val.errorMsg ? val.errorMsg : JSON.stringify(val.errorDetailVOList);
            // return val;
        }

        return null;
    }
    //SUCCESS
    async __get_fg_ren_status(service, jx, policyId, subid, attr) {
        let xpath = 'soapenv:Envelope.soapenv:Body.ns2:FGUWResponseVO';
        let val = await utils.jpath_value(jx, xpath, service.target.strobjs);
        if (val?.status == 'SUCCESS' || (val?.status == 'FAIL' && (val?.errorDetailVOList?.errorDesc?.toLowerCase().includes('policy already exists')))) {
            const errorCode_exe = val?.errorMsg ? val?.errorMsg : JSON.stringify(val?.errorDetailVOList?.errorCode);
            const errorDesc_exe = val?.errorMsg ? val?.errorMsg : JSON.stringify(val?.errorDetailVOList?.errorDesc);

            let policy_data = policydata;
			let imdsubchannel = policy_data.proposal.data.imd_subchannel;
			let policy_trans_type = policy_data.proposal.data.policy_transaction_type;
			let gstdetails = await this.__getGST(policy_data);
            let fg_prod_code = policy_data.product_id == 'M200000000002' ? 'AMG' : 'APG';
			let exceptiondata = {
				product_code: fg_prod_code,
				policy_number: policy_data.policy_no,
				endt_number: '000',
				agent_code: policy_data.quote.data.imd_code,
				branch_code: policy_data.quote.data.branch_code,
				error_code: errorCode_exe,
				error_desc: errorDesc_exe,
				error_status: 'Success',
				premium_value: policy_data.payment.premium_value,
				total_tax: policy_data.payment.total_tax,
				entry_operator_id: 'GHIPOLICY',
				imd_channel: policy_data.proposal.data.imd_channel,
				imd_subchannel: imdsubchannel,
				cgst: gstdetails.cgst,
				ugst: gstdetails.ugst,
				igst: gstdetails.igst,
				sgst: gstdetails.sgst,
                error_flag: '0',
				policy_issue_date: policy_data.issue_date,
				policy_transaction_type: policy_trans_type
			};
			// console.log("exceptiondata",exceptiondata);
			let excepcall = await this.__exception(exceptiondata);

            let policy_no = await utils.jpath_value(jx, "soapenv:Envelope.soapenv:Body.ns2:FGUWResponseVO.polNo", service.target.strobjs);
            return policy_no;
        }
        // console.log("failed-----");
        return null;
    }
}

(new fgenRen('fgenRen')).run(workerData);
