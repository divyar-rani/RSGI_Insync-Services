const utils = require('../common/utils');
const moment = require('moment');
const twigbase = require('../common/twigbase');
const ish = require('../common/ishelper');
const conf = require("./config");
class additionalinfo extends twigbase {
    _fix_date(str, outfmt) {
        let fmt = utils._guess_date_format(str);
        let mdt = moment(str, fmt);
        if (!outfmt) outfmt = 'DD/MM/YYYY';
        return mdt.isValid() ? mdt.format(outfmt) : str;
    }
	async __add_addtional_data(policy) {
		if(policy.is_product_code == 'gpa'){
			console.log("policy_gpa",policy.policy_id);
			let url = 'https://rsghpu.royalsundaram.net/api/v1/commonservice/member_download/GPA/' + encodeURIComponent(policy.policy_id) + '?member_status=Active&fmt=json';

     let ret = await utils.iget(url, 'policy');
        //console.log("retresponse",ret);
const gpares = ret;
/*const gpares = {
    "status": 0,
    "txt": "",
    "data": [
        {
            "Sno": 1,
            "PolicyNumber": "GPP0000100275100",
            "EndoNumber": "000",
            "EndorsementDescription": "New Business",
            "EffectiveDate": "01-Apr-2026",
            "EmpNoFamilyID": "BA2026",
            "EmpDependentId": 1,
            "Name": "Test1",
            "Relationship": "Self",
            "Gender": "Male",
            "DateofBirth": "23-Jan-2000",
            "Age": "",
            "AgeBand": "",
            "SI Type": "Individual",
            "occupation_master": "Professional/ Administrative/ Managerial",
            "Designation": "Designer",
            "Monthly CTC": "",
            "Annual CTC": "",
            "Multiplier of CTC": "1",
            "Sum Insured": "100000",
            "MembershipNo": "",
            "Remarks": "",
            "Premium": "",
            "Partycode": "GP000532",
            "Member Status": "Active",
            "Nominee Name": "Test2",
            "Nominee Relationship": "Spouse",
            "Nominee age": "",
            "If minor, Guardian Name": "",
            "Guardian relationship": "",
            "Guardian Age": "",
            "Email_ID": "",
            "Contact_No": ""
        },
        {
            "Sno": 2,
            "PolicyNumber": "GPP0000100275100",
            "EndoNumber": "GPP0000100275100-003",
            "EndorsementDescription": "Non Financial Member",
            "EffectiveDate": "16-Apr-2026",
            "EmpNoFamilyID": "KEY01",
            "EmpDependentId": 1,
            "Name": "A Duraimurugan",
            "Relationship": "Self",
            "Gender": "Male",
            "DateofBirth": "​03-Jul-1996",
            "Age": "",
            "AgeBand": "",
            "SI Type": "Individual",
            "occupation_master": "Professional/ Administrative/ Managerial",
            "Designation": "",
            "Monthly CTC": "",
            "Annual CTC": "100000",
            "Multiplier of CTC": "1",
            "Sum Insured": "100000",
            "MembershipNo": "",
            "Remarks": "",
            "Premium": "",
            "Partycode": "GP000001",
            "Member Status": "Active",
            "Nominee Name": "A Duraimurugan",
            "Nominee Relationship": "Spouse",
            "Nominee age": "",
            "If minor, Guardian Name": "",
            "Guardian relationship": "",
            "Guardian Age": "",
            "Email_ID": "",
            "Contact_No": ""
        },
        {
            "Sno": 3,
            "PolicyNumber": "GPP0000100275100",
            "EndoNumber": "000",
            "EndorsementDescription": "New Business",
            "EffectiveDate": "01-Apr-2026",
            "EmpNoFamilyID": "KEY010",
            "EmpDependentId": 1,
            "Name": "Abhi V Sisupal",
            "Relationship": "Self",
            "Gender": "Male",
            "DateofBirth": "​20-May-1992",
            "Age": "",
            "AgeBand": "",
            "SI Type": "Individual",
            "occupation_master": "Professional/ Administrative/ Managerial",
            "Designation": "",
            "Monthly CTC": "",
            "Annual CTC": "100000",
            "Multiplier of CTC": "1",
            "Sum Insured": "100000",
            "MembershipNo": "",
            "Remarks": "",
            "Premium": 89.1592,
            "Partycode": "GP000010",
            "Member Status": "Active",
            "Nominee Name": "Abhi V Sisupal",
            "Nominee Relationship": "Spouse",
            "Nominee age": "",
            "If minor, Guardian Name": "",
            "Guardian relationship": "",
            "Guardian Age": "",
            "Email_ID": "",
            "Contact_No": ""
        }
]
};*/

const gpamemdetails = gpares.data;
policy.proposal.data.gpa_mem = gpamemdetails;
		}
//console.log("policy_data",policy);
		//		policy.d_policy_no = (policy.policy_no).substr(0, 14) || '';
	//			console.log("policy_json",policy.policy_id);
	if(policy.is_product_code == 'ghealth'){
		let url = 'https://rsghpu.royalsundaram.net/api/v1/commonservice/member_download/GMC/' + encodeURIComponent(policy.policy_id) + '?member_status=Active&fmt=json';

     let ret = await utils.iget(url, 'policy');
	//console.log("retresponse",ret);
const response = ret;
/*	const response = {
    "status": 0,
    "txt": "",
    "data": [
        {
            "Sno": 1,
            "PolicyNumber": "GMP0000001000100",
            "EndorsementNumber": "000",
            "EndorsementDescription": "New Business",
            "EffectiveDate (DD-MMM-YYYY)": "30-Apr-2026",
            "EmpNoFamilyID": "RSO0068",
            "EmpDependentId": "1",
            "Name": "A K SUNIL KUMAR",
            "Relationship": "Self",
            "Gender": "Male",
            "DateofBirth (DD-MMM-YYYY)": "06-Apr-1981",
            "Age": "",
            "AgeBand": "41-45",
            "SI Type": "Floater",
            "Individual or Floater SI": "500000",
            "Family Definition": "Self, Spouse and Dependant Children",
            "Location": "Delhi",
            "MembershipNo": "GMP10032928A",
            "Remarks": "",
            "Premium": 6788.126226896109,
            "Partycode": "GR015150",
            "Member Status": "Active",
            "Email ID": "",
            "Contact_No": ""
        },
        {
            "Sno": 2,
            "PolicyNumber": "GMP0000001000100",
            "EndorsementNumber": "000",
            "EndorsementDescription": "New Business",
            "EffectiveDate (DD-MMM-YYYY)": "30-Apr-2026",
            "EmpNoFamilyID": "RSO0088",
            "EmpDependentId": "1",
            "Name": "AASHYA D VORA",
            "Relationship": "Daughter",
            "Gender": "Female",
            "DateofBirth (DD-MMM-YYYY)": "26-Aug-2010",
            "Age": "",
            "AgeBand": "0-25",
            "SI Type": "Floater",
            "Individual or Floater SI": "500000",
            "Family Definition": "Self, Spouse and Dependant Children",
            "Location": "Delhi",
            "MembershipNo": "GMP10032948B",
            "Remarks": "",
            "Premium": 2695.4109649280335,
            "Partycode": "",
            "Member Status": "Active",
            "Email ID": "",
            "Contact_No": ""
        },
        {
            "Sno": 3,
            "PolicyNumber": "GMP0000001000100",
            "EndorsementNumber": "000",
            "EndorsementDescription": "New Business",
            "EffectiveDate (DD-MMM-YYYY)": "30-Apr-2026",
            "EmpNoFamilyID": "RSO0071",
            "EmpDependentId": "1",
            "Name": "ABHISHEK M MANUEL",
            "Relationship": "Son",
            "Gender": "Male",
            "DateofBirth (DD-MMM-YYYY)": "11-Jan-2010",
            "Age": "",
            "AgeBand": "0-25",
            "SI Type": "Floater",
            "Individual or Floater SI": "500000",
            "Family Definition": "Self, Spouse and Dependant Children",
            "Location": "Delhi",
            "MembershipNo": "GMP10032931C",
            "Remarks": "",
            "Premium": 2695.4109649280335,
            "Partycode": "",
            "Member Status": "Active",
            "Email ID": "",
            "Contact_No": ""
        },
]
};*/
const memdetails = response.data;
policy.proposal.data.gmc_mem = memdetails;
	}
	}
	
	// Merge one array element and add some additional data 
	async __merge_array(policy,dp,arr_obj){
		dp.policy_id = policy.policy_id;
		dp.d_policy_no = (policy.policy_no).substr(0, 14);
		return {...arr_obj, ...dp}; 
	}
}

module.exports = additionalinfo;
