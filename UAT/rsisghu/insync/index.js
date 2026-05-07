const conf      = require('./config');
const express   = require('express');
const db        = require('./lib/db');
const is        = require('./lib/insync');
const notify    = require('./lib/notify');
const stats     = require('./lib/stats');
const auth      = require('./lib/auth');
const utils     = require('./lib/utils');
const moment    = require('moment');
const fs        = require('fs');

const app = express();
app.use(express.static('public'));
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({ extended: true }));

app.use('/upgrade', async (req, res) => {res.send(await db.upgrade());})
app.use('/update', async (req, res) => {fs.writeFileSync('/mnt/ebs1/tmp/pushed.txt', moment().format('YYYY-MM-DD HH:mm:ss.SSS')); res.send('done');});

const routes = {
    'get_summary'   : {cls: stats, method: 'GET',  prefix: '/api/v1/summary'},
    'get_payment_summary': {cls: stats, method: 'GET',  prefix: '/api/v1/payment_summary'},
    'get_purgatory' : {cls: stats, method: 'GET',  prefix: '/api/v1/purgatory'},
    'get_queue'     : {cls: stats, method: 'GET',  prefix: '/api/v1/queue'},
    'post_reset'    : {cls: auth, method: 'POST',  prefix: '/api/v1/auth/reset'},
    'post_add'      : {cls: auth, method: 'POST',  prefix: '/api/v1/auth/add'},
    'post_auth'     : {cls: auth, method: 'POST',  prefix: '/api/v1/auth'},
    'get_auth'      : {cls: auth, method: 'GET',   prefix: '/api/v1/auth'},
    'get_list'      : {cls: auth, method: 'GET',   prefix: '/api/v1/users'},
    'post_status'   : {cls: auth, method: 'POST',   prefix: '/api/v1/user/status'},
    'post_change_password'      : {cls: auth, method: 'POST',   prefix: '/api/v1/auth/change_password'},
    'get_calendar'  : {cls: stats, method: 'GET',  prefix: '/api/v1/policy/calendar'},
    'post_calendar' : {cls: stats, method: 'POST', prefix: '/api/v1/policy/calendar'},
    'post_edit'     : {cls: stats, method: 'POST', prefix: '/api/v1/policy/edit'},
    'get_policy'    : {cls: stats, method: 'GET',  prefix: '/api/v1/policy'},
    'get_policies'  : {cls: stats, method: 'GET',  prefix: '/api/v1/policies'},
    'get_fields'    : {cls: stats, method: 'GET',  prefix: '/api/v1/fields'},
    'get_debug_log' : {cls: stats, method: 'GET',  prefix: '/api/v1/debug_log'},
    'get_logs'      : {cls: stats, method: 'GET',  prefix: '/api/v1/logs'},
    'get_compare'   : {cls: stats, method: 'GET',  prefix: '/api/v1/compare'},
    'post_requeue'  : {cls: stats, method: 'POST', prefix: '/api/v1/requeue'},
    'post_oob'      : {cls: stats, method: 'POST', prefix: '/api/v1/oob'},
    'post_revfeed'  : {cls: stats, method: 'POST', prefix: '/api/v1/revfeed'},
    'get_revfeed'   : {cls: stats, method: 'GET', prefix: '/api/v1/revfeed'},
    'post_updatejson': {cls: stats, method: 'POST',  prefix: '/api/v1/updatejson'},
    'post_attr'     : {cls: stats, method: 'POST', prefix: '/api/v1/attr'},
    'delete_attr'   : {cls: stats, method: 'DELETE',  prefix: '/api/v1/attr'},
    'get_config'    : {cls: stats, method: 'GET',  prefix: '/api/v1/config'},
    'post_twigtest' : {cls: stats, method: 'POST', prefix: '/api/v1/twigtest'},
    'get_pause'     : {cls: auth, method: 'GET', prefix: '/api/v1/auth/pause'},
    'post_pause'    : {cls: auth, method: 'POST', prefix: '/api/v1/auth/pause'},
    'post_resume'   : {cls: auth, method: 'POST', prefix: '/api/v1/auth/resume'},
	'get_retry'   : {cls: stats, method: 'GET',   prefix: '/api/v1/policy/retry'},
	'post_query'   : {cls: stats, method: 'POST',   prefix: '/api/v1/policy/query_executor'},
}

async function api_handler(req, res, cls, meth) {
    try {
        auth.__validate_token(req);
        if (meth !== 'post_auth' && !req.user) {
            res.status(401);
            res.statusMessage = "Authentication needed";
            return res.send("Authentication needed");
        }
        return await (new cls(req, res, is.cust))[meth]();
    } catch(e) {
        console.log(e)
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify({status: -200, txt: e.message}));
    }
}

function setup_route(func, method, cls, prefix) {
    if (method == 'GET') app.get(prefix, async (req, res) => await api_handler(req, res, cls, func));
    else if (method == 'PUT') app.put(prefix, async (req, res) => await api_handler(req, res, cls, func));
    else if (method == 'POST') app.post(prefix, async (req, res) => await api_handler(req, res, cls, func));
    else if (method == 'DELETE') app.delete(prefix, async (req, res) => await api_handler(req, res, cls, func));
    else console.log('unknown method', method);
}

function setup_routes(routes) {
    for(var r in routes) {
        setup_route(r, routes[r].method, routes[r].cls, routes[r].prefix);
    }
}
console.log('setup_routes...')
setup_routes(routes);

var heap_timer = null;
function heap_stats() {
    utils.heap_stats();
    heap_timer = setTimeout(() => heap_stats(), 60*1000);
}

const server = app.listen(conf.port, () => {
    console.log('listening on '+conf.port);
}).on('error', (err) => {
    console.log('failed to listen on '+conf.port, err);
    process.exit(-1);
});

heap_stats();
notify.start(server);

process.on('SIGTERM', () => {
    if (server) server.close(() => {console.log('server terminated');});
    notify.stop();
    setTimeout(() => process.exit(0), 1000);
});

process.on('unhandledRejection', (reason, p) => {
    console.log('unhandled rejection: ', reason, p);
});

process.on('uncaughtExceptionMonitor', (err, origin) => {
    console.log('unhandled exception: ', err, origin);
});