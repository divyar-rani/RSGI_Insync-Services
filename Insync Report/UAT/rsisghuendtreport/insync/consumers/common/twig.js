const utils = require('./utils');
const xmlescape = require('xml-escape');
const aws = require('./aws');
const {performance} = require('perf_hooks');

class twig {
    constructor(ish) {
        this.ish = ish;
        this.conf = ish.conf;
    }

    _xml_escale_json(obj) {
        if (typeof obj === 'string') {
            return xmlescape(obj);
        }
        if (!obj || !utils.is_obj(obj)) return obj;

        let o = JSON.parse(JSON.stringify(obj));
        for (let k in o) {
            if (o[k] instanceof Array) {
                for (let i=0; i<o[k].length; i++) {
                    o[k][i] = this._xml_escale_json(o[k][i]);
                }
            } else {
                o[k] = this._xml_escale_json(o[k]);
            }
        }
        return o;
    }

    async transform_local(policy, twig, rendered) {
        let headers = {'Content-Type':'application/x-www-form-urlencoded'};
        let data = {j: {...this._xml_escale_json(policy), rendered}, t: twig};
        if (!this.conf.twig.url) throw new Error('Twig URL not configured');

        let res = await this.ish.apost(this.conf.twig.url, data, headers);
        return JSON.parse(res);
    }
    async transform_lambda(policy, twig, rendered) {
        let start = performance.now();
        let data = {j: {...policy, rendered}, t: twig};
        let res = await aws.transform(data);
        // console.log('twig:', (performance.now()-start).toFixed(0));
        return typeof res === 'string' ? JSON.parse(res) : res;
    }

    async transform(policy, twig, rendered) {
	//console.log("Lamda AccessKeyID >>>>>",aws.twig.lambda.accessKeyId,aws.twig.lambda.iamRole);
        if (process.env['IS_LAMBDA_IAMROLE'])
            return await this.transform_lambda(policy, twig, rendered);
        return await this.transform_local(policy, twig, rendered);
    }
}

module.exports = twig;