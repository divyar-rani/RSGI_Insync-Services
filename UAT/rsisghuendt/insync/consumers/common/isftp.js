const sclient = require('ssh2-sftp-client');
const moment = require('moment');

class isftp {
    async upload(policy, filename, data, options) {
        if (!options.remote_path) throw 'missing paramter remote_path';

        let sftp = new sclient();
        if (await sftp.connect(options.connect_options)===false) throw ('retry 60 sftp connect failed');

        let remote_path = options.remote_path;
        if (options.use_date) {
            let mdt = (policy?.issue_date ? moment(policy?.issue_date) : moment()).format('YYYY-MM-DD');
            remote_path = path.join(remote_path, mdt);
        }

        if (options.use_suffix) {
            remote_path = path.join(remote_path, policy.policy_id.substring(policy.policy_id.length-2));
        }

        let rp = await sftp.exists(options.remote_path);
        if (rp === false) await sftp.mkdir(options.remote_path, true);
        else if (rp !== 'd') throw ('sftp remote path is not folder');

        if (!(data instanceof Buffer)) data = new Buffer.from(data);

        let full_path = path.join(options.remote_path, filename);
        await sftp.put(data, full_path);
        await sftp.end();
        return full_path;
    }
}

module.exports = isftp;