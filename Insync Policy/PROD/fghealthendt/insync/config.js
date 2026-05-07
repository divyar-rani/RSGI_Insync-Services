const conf = {
   /* port: 8097,
    tmp: '/mnt/ebs1/tmp/is_sitnexus',
    dbtype: 'mysql',
    server_id: 'is_sitnexus',
    db: {
        host: 'localhost',
        port: 3306,
        database: 'is_sitnexus',
        user: 'is_sitnexus',
        password: 'is_sitnexus',
        charset: 'utf8_unicode_ci',
        supportBigNumbers: true,
        dateStrings: true
    },*/

	port: 8097,
    tmp: '/mnt/ebs1/tmp/is_rsisghureport',
    dbtype: 'mysql',
    server_id: 'is_rsisghureport',
    db: {
        host: 'rs-uat-webapp.cq2cwczu14rw.ap-south-1.rds.amazonaws.com',
        port: 3306,
        database: 'is_rsisghureport',
        user: 'admin',
        password: 'PyupxQPXXzzSuKKt9NTc',
        charset: 'utf8_unicode_ci',
        supportBigNumbers: true,
        dateStrings: true
    },	

    ws: {
        port: 8098
    },

    sqs: {
        url: "https://sqs.ap-south-1.amazonaws.com/920043513072/uat-report-insillion",
        region: 'ap-south-1',
        accessKeyId: '',
        secretAccessKey: '',
        iamRole: '',
        urls: []
    },

    statsd: {
        host: "instats.cloware.in",
        port: 8125,
        protocol: "tcp"
    },

    schema: {
        is_auth: {
            fields: [
                { name: 'email',        type: 'varchar', size: 32, primary: true, null: 'NO'  },
                { name: 'mpwd',         type: 'varchar', size: 48, null: 'YES'  },
                { name: 'priv_level',   type: 'integer', null: 'NO', default: '0'},
                { name: 'status',       type: 'integer', null: 'NO', default: '0'},
                { name: 'c_ts',         type: 'datetime',null: 'NO', default: 'current_timestamp'},
                { name: 'u_ts',         type: 'timestamp'},
            ],
            unique : [],
            index: []
        },
        is_policy: {
            fields: [
                { name: 'policy_id',    type: 'varchar', size: 32, primary: true, null: 'NO'  },
                { name: 'policy_no',    type: 'varchar', size: 48, null: 'YES'  },
                { name: 'proposal_no',  type: 'varchar', size: 48, null: 'YES'  },
                { name: 'sync_state',   type: 'varchar', size: 32, null: 'NO', default: ''},
                { name: 'def_name',     type: 'varchar', size: 32, null: 'NO', default: ''},
                { name: 'product_id',   type: 'varchar', size: 32, null: 'NO', default: ''},
                { name: 'product_name', type: 'varchar', size: 128, null: 'NO', default: ''},
                { name: 'issue_date',   type: 'datetime', size: 32,  null: 'YES'},
                { name: 'message_id',   type: 'varchar', size: 128, null: 'NO', default: ''},
                { name: 'ack_id',       type: 'varchar', size: 128, null: 'NO', default: ''},
                { name: 'usr_bucket',   type: 'varchar', size: 128, null: 'NO', default: ''},
                { name: 'completed_at', type: 'datetime',null: 'YES'},
                { name: 'retry_count',  type: 'integer', null: 'NO', default: '0'},
                { name: 'cust1',        type: 'varchar', size: 128, null: 'NO', default: ''},
                { name: 'cust2',        type: 'varchar', size: 128, null: 'NO', default: ''},
                { name: 'cust3',        type: 'varchar', size: 128, null: 'NO', default: ''},
                { name: 'cust4',        type: 'varchar', size: 128, null: 'NO', default: ''},
                { name: 'cust5',        type: 'varchar', size: 128, null: 'NO', default: ''},
                { name: 'c_ts',         type: 'datetime',null: 'NO', default: 'current_timestamp'},
                { name: 'u_ts',         type: 'timestamp'},
            ],
            unique : [[ 'policy_no' ]],
            index: [['sync_state', 'policy_id'], ['issue_date'], ['cust1'], ['cust2'], ['cust3'], ['proposal_no']]
        },
        is_policy_issued: {
            fields: [
                { name: 'policy_id',    type: 'varchar', size: 32, primary: true, null: 'NO'  },
                { name: 'policy_no',    type: 'varchar', size: 48, null: 'YES'  },
                { name: 'product_id',   type: 'varchar', size: 32, null: 'NO', default: ''},
                { name: 'product_group_id',   type: 'varchar', size: 32, null: 'NO', default: ''},
                { name: 'issue_date',   type: 'datetime', size: 32,  null: 'YES'},
                { name: 'c_ts',         type: 'datetime',null: 'NO', default: 'current_timestamp'},
                { name: 'u_ts',         type: 'timestamp'},
            ],
            unique : [[ 'policy_no' ]],
            index: [['issue_date']]
        },
        is_policy_payment: {
            fields: [
                { name: 'payment_details_id',    type: 'varchar', size: 32, null: 'NO'  },
                { name: 'payment_id',    type: 'varchar', size: 32, null: 'NO'  },
                { name: 'policy_id',    type: 'varchar', size: 32, null: 'NO', default: ''},
                { name: 'product_name', type: 'varchar', size: 128, null: 'NO', default: ''},
                { name: 'pay_date',     type: 'datetime', size: 32,  null: 'YES'},
                { name: 'downloaded',   type: 'varchar',  size: 32,  null: 'NO', default: ''},
                { name: 'c_ts',         type: 'datetime',null: 'NO', default: 'current_timestamp'},
                { name: 'u_ts',         type: 'timestamp'},
            ],
            unique : [[ 'payment_details_id' ]],
            index: [['pay_date'], ['c_ts']]
        },

        is_policy_insillion: {
            fields: [
                { name: 'policy_id',    type: 'varchar', size: 32, null: 'NO', default: ''},
                { name: 'last_update',  type: 'datetime(6)',  null: 'YES'},
                { name: 'c_ts',         type: 'datetime',null: 'NO', default: 'current_timestamp'},
                { name: 'u_ts',         type: 'timestamp'},
            ],
            unique : [[ 'policy_id' ]],
        },
        is_balance_sync: {
            fields: [
                { name: 'payment_details_id',  type: 'varchar', size: 32, null: 'NO'},
                { name: 'policy_id',    type: 'varchar', size: 32, null: 'NO', default: ''},
                { name: 'c_ts',         type: 'datetime',null: 'NO', default: 'current_timestamp'},
                { name: 'u_ts',         type: 'timestamp'},
            ],
            unique : [[ 'payment_details_id']],
            index: [['policy_id']]
        },

        is_policy_attr: {
            fields: [
                { name: 'policy_id',    type: 'varchar', size: 32, primary: true, null: 'NO'  },
                { name: 'data',         type: 'varchar', size: 8000, null: 'YES', default: '{}'  },
                { name: 'author',       type: 'varchar', size: 64, null: 'YES', default: ''},
                { name: 'c_ts',         type: 'datetime',null: 'NO', default: 'current_timestamp'},
                { name: 'u_ts',         type: 'timestamp'},
            ],
            unique : [],
            index: []
        },
        is_last_ts: {
            fields: [
                { name: 'def_name',     type: 'varchar', size: 32, primary: true, null: 'NO'  },
                { name: 'l_ts',         type: 'varchar', size: 64, null: 'NO'  },
                { name: 'u_ts',         type: 'timestamp'},
            ]
        },
        is_purgatory: {
            fields: [
                { name: 'def_name',     type: 'varchar', size: 32, null: 'NO'  },
                { name: 'policy_id',    type: 'varchar', size: 64, null: 'NO'  },
                { name: 'cause',        type: 'varchar', size: 32, null: 'NO'  },
                { name: 'reason',       type: 'varchar', size: 4096, null: 'YES'},
                { name: 'status',       type: 'integer', null: 'NO', 'default': '0'},
                { name: 'c_ts',         type: 'datetime',null: 'NO', default: 'current_timestamp'},
                { name: 'u_ts',         type: 'timestamp'},
            ],
            unique : [[ 'def_name', 'policy_id' ]],
            index: [['u_ts']]
        },
        is_log_messages: {
            fields: [
                { name: 'type',         type: 'varchar', size: 32, null: 'NO'  },
                { name: 'def_name',     type: 'varchar', size: 32, null: 'NO'  },
                { name: 'policy_id',    type: 'varchar', size: 64, null: 'NO'  },
                { name: 'message',      type: 'varchar', size: 8096, null: 'YES'  },
                { name: 'mod_name',     type: 'varchar', size: 64, null: 'NO', default: ''},
                { name: 'usr_bucket',   type: 'varchar', size: 128, null: 'NO', default: ''},
                { name: 'u_ts',         type: 'timestamp'},
            ],
            index : [[ 'type', 'u_ts'], ['policy_id']],
        },
        is_policy_json: {
            fields: [
                { name: 'policy_id',    type: 'varchar', size: 64, null: 'NO'  },
                { name: 'def_name',     type: 'varchar', size: 32, null: 'NO'  },
                { name: 'data',         type: 'varchar', size: 2048, null: 'NO'  },
                { name: 'author',       type: 'varchar', size: 255, null: 'NO',  desc: 'Last Update By'},
                { name: 'ip',           type: 'varchar', size: 32,  null: 'YES', desc: 'IP'},
                { name: 'c_ts',         type: 'datetime',null: 'NO', default: 'current_timestamp', desc: 'Created On'},
                { name: 'u_ts',         type: 'timestamp'},
            ],
            unique : [['policy_id' ]],
            trigger: [
                `DROP TRIGGER IF EXISTS tr_bu_policy_json`,
                `CREATE TRIGGER tr_bu_policy_json BEFORE UPDATE on is_policy_json
                FOR EACH ROW BEGIN
                    INSERT INTO is_policy_json_history select * from is_policy_json where policy_id=NEW.policy_id;
                END`
            ]
        },
        is_policy_json_history: {
            fields: [
                { name: 'policy_id',    type: 'varchar', size: 64, null: 'NO'  },
                { name: 'def_name',     type: 'varchar', size: 32, null: 'NO'  },
                { name: 'data',         type: 'varchar', size: 2048, null: 'NO'  },
                { name: 'author',       type: 'varchar', size: 255, null: 'NO',  desc: 'Last Update By'},
                { name: 'ip',           type: 'varchar', size: 32,  null: 'YES', desc: 'IP'},
                { name: 'c_ts',         type: 'datetime',null: 'NO', default: 'current_timestamp', desc: 'Created On'},
                { name: 'u_ts',         type: 'timestamp'},
            ],
            unique : [],
            index : [['policy_id']],
        },
        is_policy_transformed: {
            fields: [
                { name: 'policy_id',    type: 'varchar', size: 64, null: 'NO'  },
                { name: 'def_name',     type: 'varchar', size: 32, null: 'NO'  },
                { name: 'data',         type: 'varchar', size: 2048, null: 'NO'  },
                { name: 'author',       type: 'varchar', size: 255, null: 'NO',  desc: 'Last Update By'},
                { name: 'ip',           type: 'varchar', size: 32,  null: 'YES', desc: 'IP'},
                { name: 'c_ts',         type: 'datetime',null: 'NO', default: 'current_timestamp', desc: 'Created On'},
                { name: 'u_ts',         type: 'timestamp'},
            ],
            unique : [['policy_id' ]],
            trigger: [
                `DROP TRIGGER IF EXISTS tr_bu_policy_transformed`,
                `CREATE TRIGGER tr_bu_policy_transformed BEFORE UPDATE on is_policy_transformed
                FOR EACH ROW BEGIN
                    INSERT INTO is_policy_transformed_history select * from is_policy_transformed where policy_id=NEW.policy_id;
                END`
            ]
        },
        is_policy_transformed_history: {
            fields: [
                { name: 'policy_id',    type: 'varchar', size: 64, null: 'NO'  },
                { name: 'def_name',     type: 'varchar', size: 32, null: 'NO'  },
                { name: 'data',         type: 'varchar', size: 2048, null: 'NO'  },
                { name: 'author',       type: 'varchar', size: 255, null: 'NO',  desc: 'Last Update By'},
                { name: 'ip',           type: 'varchar', size: 32,  null: 'YES', desc: 'IP'},
                { name: 'c_ts',         type: 'datetime',null: 'NO', default: 'current_timestamp', desc: 'Created On'},
                { name: 'u_ts',         type: 'timestamp'},
            ],
            unique : [],
            index : [['policy_id']],
        },
        is_policy_lock: {
            fields: [
                { name: 'policy_id',    type: 'varchar', size: 64, null: 'NO'  },
                { name: 'modname',      type: 'varchar', size: 32, null: 'NO'  },
                { name: 'uuid',         type: 'varchar', size: 32, null: 'NO'  },
                { name: 'locked_at',    type: 'datetime',null: 'NO', default: 'current_timestamp', desc: 'Created On'},
                { name: 'u_ts',         type: 'timestamp'},
            ],
            unique : [['policy_id', 'modname']],
            trigger: [
                `DROP EVENT IF EXISTS ev_cleanup_locks`,
                `CREATE EVENT ev_cleanup_locks ON SCHEDULE EVERY 180 SECOND
                DO
                    delete from is_policy_lock where TIMESTAMPDIFF(MINUTE, locked_at, NOW())>3;
                `
            ]
        },


        is_group_payment: {
            fields: [
                { name: 'policy_id',    type: 'varchar', size: 64, null: 'NO'  },
                { name: 'payment_ref',  type: 'varchar', size: 64, null: 'NO'  },
                { name: 'receipt_no',   type: 'varchar', size: 64, null: 'NO'  },
                { name: 'u_ts',         type: 'timestamp'},
            ],
            unique : [['policy_id', 'payment_ref']],
        }
    }
};
module.exports = conf;

var env = {
    IS_PORT: 'port',
    IS_DB_HOST: 'db.host', 
    IS_DB_PORT: 'db.port', 
    IS_DB_USER: 'db.user',
    IS_DB_PASS: 'db.password',
    IS_DB_NAME: 'db.database',
    IS_DB_CONNECTION_LIMIT: 'db.connectionLimit',

    IS_TMP: 'tmp',
    IS_SERVER_ID: 'server_id',

    // IS_SQS_URL: 'sqs.url', 
    IS_SQS_REGION: 'sqs.region',
    IS_SQS_KEY: 'sqs.accessKeyId',
    IS_SQS_SECRET: 'sqs.secretAccessKey',
    IS_SQS_IAMROLE: 'sqs.iamRole',

    IS_TWIG_URL: 'twig.url',
    IS_STATSD_HOST: "statsd.host",
    IS_STATSD_PORT: "statsd.port",
    IS_STATSD_PROTOCOL: "statsd.protocol"
}

function _set_prop_from_env(key, val){
    var v = conf;
    var comp = key.split('.');
    while (comp.length>1 && v) v = v[comp.shift()];

    if (val[0] == '"' && val[val.length-1]=='"') val = val.substring(1, val.length-1);
    if (val === 'false') val = false;
    if (val === 'true') val = true;
    if (v) v[comp[0]] = val;
    return;
}

function _init_and_merge_env() {
    for (let key in env) {
        if (process.env.hasOwnProperty(key)) _set_prop_from_env(env[key], process.env[key]);
    }
}

_init_and_merge_env();

const fs = require('fs');
const path = require('path');

function process_custom_conf(conconf) {
    for (let obj in conconf) {
        for (let table in conconf[obj].schema || {}) {
            conf.schema[table] = conconf[obj].schema[table];
        }
        if (conconf[obj].sqs && conconf[obj].sqs.queueUrl) {
            conf.sqs.urls.push({name: obj, url: conconf[obj].sqs.queueUrl});
        }
    }
}

function merge_consumer_schema() {
    let dirs = fs.readdirSync(path.join(__dirname, 'consumers'));
    if (fs.existsSync('./consumers/config.js')) {
        let conconf = require('./consumers/config.js');
        process_custom_conf(conconf);
    }

    for (let dir of dirs) {
        if (!fs.lstatSync(path.join(__dirname, 'consumers', dir)).isDirectory()) continue;

        if (!fs.existsSync('./consumers/' + dir + '/config.js')) continue;

        let conconf = require('./consumers/' + dir + '/config.js');
        process_custom_conf(conconf);
    }    
}
merge_consumer_schema();
