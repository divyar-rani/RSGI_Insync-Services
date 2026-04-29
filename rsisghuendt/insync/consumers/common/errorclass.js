const fs = require('fs');
const path = require('path');
const istatsd = require("./istatsd");

class errors {
    constructor(conf) {
        this.errclass = {};
        let fpath = conf.errorClass || '';
        if (!fpath.startsWith('/')) fpath = path.join(__dirname, '..', '..', fpath);

        if (conf.errorClass && fs.existsSync(fpath))
            this.errclass = require(fpath);
    }

    attributes(service, policyId, err) {
        err = '' + err; // make it a string
        let attr = {};
        for (let pat of this.errclass.attributes||[]) {
            let res = (!(pat.regex instanceof Array)) ? [pat.regex] : pat.regex;
            for (let re of res) {
                let matches = re.exec(err);
                if (matches && pat.index >= 0 && matches.length > pat.index) {
                    attr[pat.attr] = matches[pat.index];
                    break;
                }
            }
        }
        return Object.keys(attr).length > 0 ? attr : null;
    }

    classify(service, policyId, err, ignores) {
        if (!err) return {bucket: null, state: null};
        err = (err+'').toLowerCase();
        if (ignores) {
            for (let i=0; i<ignores.length; i++) {
                if (err == ignores[i]) return {bucket: null, state: null};
                // if (err.indexOf(ignores[i]) >= 0) return null;
            }
        }

        for (let pat of this.errclass.patterns||[]) {
            // console.log('test:pattern', pat.regex, pat.regex.test(err));
            let res = (!(pat.regex instanceof Array)) ? [pat.regex] : pat.regex;
            for (let re of res) {
                if (re.test(err)) {
                    if (pat.event) istatsd.event(pat.bucket ? pat.event+'.'+pat.bucket : pat.event);
                    return {bucket: pat.bucket, state: pat.state};
                }
            }
        }
        return {bucket: 'unk', state: null};
    }
}

module.exports = errors;