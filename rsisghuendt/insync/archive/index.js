const mysql2 = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
const moment = require('moment');
const archiver= require('archiver');


async function sleep(toms){
    return new Promise((resolve, reject) => setTimeout(resolve, toms));
}

async function rmdirs(dir) {
    if (!fs.existsSync(dir)) return;
    let entries = await fs.promises.readdir(dir, { withFileTypes: true })
    await Promise.all(entries.map(async (entry) => {
        let fullPath = path.join(dir, entry.name);
        return entry.isDirectory() ? rmdirs(fullPath) : fs.promises.unlink(fullPath);
    }));

    await sleep(100);
    await fs.promises.rmdir(dir);
}


class imysql {
    constructor() {
        this.connect();
    }
    
    connect(){
        this.name = process.env['IS_DB_NAME'];
        let conf = {
            host: process.env['IS_DB_HOST'],
            port: process.env['IS_DB_PORT'],
            database: process.env['IS_DB_NAME'],
            user: process.env['IS_DB_USER'],
            password: process.env['IS_DB_PASS'],
            charset: 'utf8_unicode_ci',
            supportBigNumbers: true,
            dateStrings: true
        }
        this.pool = mysql2.createPool(conf);
    }

    async query(sql, params){
        var start = performance.now();
        this.error= '';

        if (!this.pool) {console.log('imysql.query: connection not established ', sql, params); return null;}
        if (!(params instanceof Array)) {console.log('idb.query: invalid params, expected array ', sql, params);}

        try {
            return await this.pool.query(sql, params);
        } catch(e) {
            console.log(sql + JSON.stringify(params), e);
            if (e.message && e.message.indexOf('Deadlock') >=0 ){
                console.log('idb: found dead lock: retrying ', sql, e.message);
                try {
                    return  await this.pool.query(sql, params);
                } catch(ee) {
                    console.log('idb: retry failed.', sql, ee.message);
                }
            }
            this.error = e.message;
            this.errorsql=sql;
            return [null, null];
        }
    }


    async exec(sql, params) {
        const [rows/*, flds*/] = await this.query(sql, params||[]);
        return rows;
    }
}

const db = new imysql();
class archive {
    constructor() {

    }


    async zipFolder(folder, target){
        return new Promise( (resolve, reject)=>{
            var archive = archiver('zip', {zlib: { level: 9 }});
            var output = fs.createWriteStream(target);
            output.on('close', () => resolve(target));
            output.on('end', () => {});
            archive.on('warning', (err) => err.code === 'ENOENT' ? '' : reject(null));
            archive.on('error', (err) => reject(null));
            archive.pipe(output);
            archive.glob('**/*', {cwd: folder, ignore: '*.zip'});
            archive.finalize();
        });
    }

    async _compress_folder(folder) {
        let zipfile = folder + ".zip";
        await this.zipFolder(folder, zipfile);
        return zipfile;
    }



    async __archive_policy(policyId) {
        let folder = path.join(process.env.IS_ARCHIVE_FOLDER || 'z:\\archive', moment().format('YYYY-MM-DD'), policyId);
        fs.mkdirSync(folder, {recursive: true});
        let row = await db.exec("select * from is_policy where policy_id=?", [policyId]);
        fs.writeFileSync(path.join(folder, 'policy-state.json'), JSON.stringify(row));

        row = await db.exec("select * from is_policy_attr where policy_id=?", [policyId]);
        fs.writeFileSync(path.join(folder, 'policy-attr.json'), JSON.stringify(row));
       
        row = await db.exec("select * from is_log_messages where policy_id=?", [policyId]);
        fs.writeFileSync(path.join(folder, 'policy-logs.json'), JSON.stringify(row));

        row = await db.exec("select * from is_policy_json where policy_id=?", [policyId]);
        fs.writeFileSync(path.join(folder, 'policy.json'), JSON.stringify(row));

        row = await db.exec("select * from is_policy_json_history where policy_id=?", [policyId]);
        fs.writeFileSync(path.join(folder, 'policy-history.json'), JSON.stringify(row));

        row = await db.exec("select * from is_policy_transformed where policy_id=?", [policyId]);
        let hist = await db.exec("select * from is_policy_transformed_history where policy_id=?", [policyId]);
        if (!hist) hist = [];
        if (row && row[0]) hist.unshift(row[0]);
        fs.writeFileSync(path.join(folder, 'policy-transform.json'), JSON.stringify(hist));

        await db.exec("delete from is_policy_transformed_history where policy_id=?", [policyId]);
        await db.exec("delete from is_policy_transformed where policy_id=?", [policyId]);
        await db.exec("delete from is_policy_json_history where policy_id=?", [policyId]);
        await db.exec("delete from is_policy_json where policy_id=?", [policyId]);
        await db.exec("delete from is_log_messages where policy_id=?", [policyId]);
        await db.exec("delete from is_policy_attr where policy_id=?", [policyId]);
        await db.exec("delete from is_policy where policy_id=?", [policyId]);

        await this._compress_folder(folder);
        await rmdirs(folder);
    }

    async __get_older_policies() {
        let days = process.env['IS_ARCHIVE_DAYS'] || 90;
        let rows = await db.exec("select * from is_policy where issue_date < DATE_ADD(NOW(), INTERVAL ? DAY)", [-1*days]);
        if (!rows) return;

        let count = 0;
        for (let row of rows) {
            if (row.sync_state == 'completed' || row.sync_state == 'skipped') {
                try {
                    await this.__archive_policy(row.policy_id);
                    count ++;
                } catch (e) {
                    console.log('archive failed: ', e.message, e);
                }
            } else {
                console.log('skipped: ', row.policy_id, row.sync_state);
            }
        }
        console.log('archived', count, 'policies');
        return;
    }

    async run() {
        await this.__get_older_policies();
        setTimeout(async () => await this.run(), 6*60*60*1000);
    }
}

let a = new archive();
setTimeout(async () => a.run());