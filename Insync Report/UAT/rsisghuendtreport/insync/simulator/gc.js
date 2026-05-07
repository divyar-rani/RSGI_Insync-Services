const {XMLParser} = require('fast-xml-parser');
const fs = require('fs');
const path = require('path');
const compare = require('./compare');
const {performance} = require('perf_hooks');

let ignore = [
    // "soapenv:Envelope.soapenv:Body.cus:addCustomer.cus:medium",
    // "soapenv:Envelope.soapenv:Body.cus:addCustomer.cus:campaingn",
    "soapenv:Envelope.soapenv:Body.acc:proposalTaggingcumpolicygenration.acc:objUserDataPaymentTaging.wcf:TransactionTime",
    "soapenv:Envelope.soapenv:Body.bres:PvtCarSaveProposal.bres:objRiskDtls.web:IsCNGLPG",
    "soapenv:Envelope.soapenv:Body.acc:saveReceiptData.acc:objUserDataSubReceipt.wcf:ApplicationNo",
    "soapenv:Envelope.soapenv:Body.acc:saveReceiptData.acc:objUserDataSubReceipt.wcf:ConcatPaymentID",
    "soapenv:Envelope.soapenv:Body.acc:saveReceiptData.acc:objUserDataSubReceipt.wcf:WorkflowGUID",
    "soapenv:Envelope.soapenv:Body.acc:proposalTaggingcumpolicygenration.acc:objUserDataPaymentTaging.wcf:GUIDWorkFlow",
    "soapenv:Envelope.soapenv:Body.web:WebService_Medicare.web:objPolicyDetails.web:MedicarePolicyDetail.web:ProposalDt"
];
function is_obj(o) {
    return null !== o && typeof o === 'object' && Object.getPrototypeOf(o).isPrototypeOf(Object);
}

const dircache = {};

const prod_to_folder = {
    'private car': "privatecar",
    // "two wheeler": ""
    "accident guard plus": "agpproposalcreation",
    "agp": "agpproposalcreation",
    "asp": "asproposalcreation",
    "critimedicareproposal": "critimedicareproposal",
    "sfp": "sfp",
    "sacpaproposal": "sacpaproposal",
    "smpproposal": "smpproposal",
    "medicare": "proposal"
};

class simulategc {
    constructor() {
        this.root = 'Z:\\Request_Response';
        if (!fs.existsSync(this.root)) this.root = '/mnt/ebs1/req_res';
        this.log = '/mnt/ebs1/tmp/sim/diff';
        if (!fs.existsSync(this.log)) fs.mkdirSync(this.log, {recursive: true});

        
    }

    _parse_xml(str) {
        const options = {
            ignoreAttributes: false,
            attributeNamePrefix : "@_",
            allowBooleanAttributes: true
        };
        const parser = new XMLParser(options);
        return parser.parse(str);
    }

    _check_if_folder_has_file(folder, subid, policyid, policyno) {
        if (subid && fs.existsSync(path.join(folder, subid+'.txt'))) return path.join(folder, subid+'.txt');
        if (policyno && fs.existsSync(path.join(folder, policyno+'.txt'))) return path.join(folder, policyno+'.txt');
        if (fs.existsSync(path.join(folder, policyid+'.txt'))) return path.join(folder, policyid+'.txt');
        return null;
    }

    async _get_files_and_folders(root) {
        if (!dircache[root]) {
            let files = {};
            let folders = {};
            let items = fs.existsSync(root) ? await fs.promises.readdir(root) : [];
            if (items) {
                for (let item of items) {
                    if (item.startsWith('processed')) continue;
                    let dfolder = path.join(root, item);
                    let stat = await fs.promises.stat(dfolder);
                    if (stat?.isDirectory()) {
                        folders[item] = 1;
                    } else {
                        files[item] = path.join(root, item);
                    }
                }
            }
            dircache[root] = {files, folders};
        }
        return dircache[root];
    }

    async _find_test_folder_prod(jx, modname, prodname, subid, policyid, policyno, servicename) {
        let subfolder = "";
        if (servicename.toLowerCase() == 'proposal-inspection') subfolder =  "pcinspection";
        else if (servicename.toLowerCase() == 'proposal-nstp') subfolder =  "pcreferral";
        else if (servicename.toLowerCase() == 'receipt-others') subfolder =  "client/ThinClient";
        else if (servicename.toLowerCase() == 'sub-receipt') subfolder =  "sub_receipt";
        else if (modname === 'client') subfolder = "client";
        else if (modname === 'receipt') subfolder = "receipt";
        else if (modname === 'subreceipt') subfolder = "sub_receipt";
        else if (modname === 'tag') subfolder = "tagging";
        else if (modname === 'proposal') subfolder = prod_to_folder[prodname.toLowerCase()] || 'proposal';

        if (!subfolder) {
            // console.log('could not find sub folder for ', prodname, policyid, subid, policyno);
            return null;
        }

        let ff = await this._get_files_and_folders(this.root);
        for (let date in ff.folders) {
            let dfolder = path.join(this.root, date, subfolder);
            let pp = await this._get_files_and_folders(dfolder);
            if (subid && pp.files[subid+'.txt']) return pp.files[subid+'.txt'];
            if (policyno && pp.files[policyno+'.txt']) return pp.files[policyno+'.txt'];
            if (policyno && pp.files[policyid+'.txt']) return pp.files[policyid+'.txt'];
        }
        return null;
    }

    _find_test_folder(jx, modname) {
        if (!jx) return null;
        
        if (modname === 'client') return "Client";
        if (modname === 'receipt') return "Receipt";
        if (modname === 'tag') return "Tagging";


        let val = jx?.['soapenv:Envelope']?.['soapenv:Body']['cus:addCustomer'];
        if (val) return "Client";

        if (jx?.['soapenv:Envelope']?.["@_xmlns:acc"]?.indexOf("AccidentGuardPlusService")>0) {
            return "AGPProposal";
        }
        if (jx?.['soapenv:Envelope']?.["@_xmlns:bhar"]?.indexOf("BharatGrihaRakshaService")>0) {
            return "BGRProposal";
        }
        if (jx?.['soapenv:Envelope']?.["soapenv:Body"]?.["gcs:saveProposalAccidentShield"]) {
            return "ASProposalCreation";
        }
        if (jx?.['soapenv:Envelope']?.["soapenv:Body"]?.["acc:receiptEntryForBFL"]) {
            return "Receipt";
        }
        if (jx?.['soapenv:Envelope']?.["soapenv:Body"]?.["gcs:saveProposalStandAloneCPA"]) {
            return "SACPAProposal";
        }

        if (jx?.['soapenv:Envelope']?.["soapenv:Body"]?.["AccidentShieldServicePolicy"]) {
            return "ASProposalCreation";
        }
        if (jx?.['soapenv:Envelope']?.["soapenv:Body"]?.["acc:saveReceiptData"]) {
            return "SubReceipt";
        }

        if (jx?.['soapenv:Envelope']?.["soapenv:Body"]?.["acc:proposalTaggingcumpolicygenration"]) {
            return "Tagging";
        }
        return null;
    }


    __remove_path(json, path) {
        let parts = path.split('.');
        let o = json;
        for (let i=0; i<parts.length-1; i++) {
            let k = parts[i];
            if (!o[k] || !is_obj(o[k])) return;
            o = o[k];
        }
        delete o[parts[parts.length-1]];
    }

    __remove_ignored(json) {
        for (let path of ignore) {
            this.__remove_path(json, path);
        }
    }

    __remove_empty(json) {
        for (let k in json) {
            if (!json[k] || !is_obj(json[k])) continue;
            this.__remove_empty(json[k]);
            if (Object.keys(json[k]).length == 0) delete json[k];
        }
        return json;
    }

    __parse_sub_xmls(obj, keys) {
        for (let k in obj) {
            if (!obj[k]) continue;
            if (keys.indexOf(k) >= 0) obj[k] = this._parse_xml(obj[k]);
            else if (obj[k] instanceof Array) {
                for (let i=0; i<obj[k].length; i++) this.__parse_sub_xmls(obj[k][i], keys);
            } else if (is_obj(obj[k])) {
                this.__parse_sub_xmls(obj[k], keys);
            }
        }
    }

    async process(xml, params) {
        let start = performance.now();
        let jx = this._parse_xml(xml); // parser.parse(xml);

        let subxmls = ['gcs:InputXML', 'gcs:OtherDetailsGridXML', 'acc:InputXML', 'acc:OtherDetailsGridXML'];

        this.__parse_sub_xmls(jx, subxmls);

        // fs.writeFileSync('z:\\'+policyId+"-in.txt", xml);
        // fs.writeFileSync('z:\\'+policyId+"-as.txt", JSON.stringify(jx));
        // let sfolder = this._find_test_folder(jx, params.ins_module);

        let sfolder = null;
        try {
            sfolder = await this._find_test_folder_prod(jx, params.ins_module, params.ins_prod_name, params.ins_sub_id, params.ins_policy_id, params.ins_policy_no, params.ins_service_name);
        } catch (e) {
            console.log(e);
        }
       
        let id = params.ins_sub_id || params.ins_policy_id;
        if (!sfolder) {
            let fname = path.join(this.log, params.ins_service_name+'-missing.txt');
            fs.appendFileSync(fname, id.padEnd(16) + params.ins_policy_id.padEnd(16) + params.ins_policy_no.padEnd(16) + params.ins_prod_name + "\n");
            console.log('\x1b[2m\x1b[33m\x1b[1m', id.padEnd(16), "\x1b[0m", params.ins_service_name.padEnd(12), params.ins_prod_name, params.ins_policy_id, params.ins_policy_no, params.ins_sub_id, (performance.now()-start).toFixed(0));
            return null;
        }

        let log = fs.readFileSync(sfolder, 'utf8');
        let parts = log.split("======  ##### Response  ######### =======================");
        if (parts.length != 2) parts = log.split("======  ##########  Response  ######### =======================");
        if (parts.length != 2) parts = log.split("======  ##### Response ######### =======================");
        if (parts.length != 2) {
            console.log('expected two parts found', parts.length, params.ins_module, params.ins_service_name, params.ins_prod_name, sfolder);
            return null;
        }

        
        let c = new compare();
        let rx = this._parse_xml(parts[0]);
        this.__parse_sub_xmls(rx, subxmls);

        let diff = c.json(rx, jx);
        
        if (diff) {
            this.__remove_ignored(diff);
            this.__remove_empty(diff);
            if (Object.keys(diff).length != 0 ) {
                console.log('\x1b[31m\x1b[1m', id.padEnd(16), "\x1b[0m", params.ins_service_name.padEnd(12), sfolder, JSON.stringify(diff, null, 3));
                
                let dpath = path.join(this.log, params.ins_module);
                if (!fs.existsSync(dpath)) fs.mkdirSync(dpath, {recursive: true});
                dpath = path.join(dpath, params.ins_service_name + '-' + id + '-' + params.ins_policy_id + '.json');
                fs.writeFileSync(dpath, JSON.stringify(diff, null, 3));

            } else {
                console.log('\x1b[32m', id.padEnd(16), "\x1b[0m", params.ins_service_name.padEnd(12), params.ins_policy_id, (performance.now()-start).toFixed(0));
            }
        } else {
            console.log('\x1b[32m', id.padEnd(16), "\x1b[0m", params.ins_service_name.padEnd(12), params.ins_policy_id, (performance.now()-start).toFixed(0));
        }
        return parts[1];
    }
}

module.exports = simulategc;