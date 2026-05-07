const express = require('express');
const simul = require('./gc');
const bp = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bp.raw({type: 'text/xml'}));
app.post('/cxf/*', async (req, res) => {
    var parts = decodeURIComponent(req.path).split('/');
    let xml = Buffer.from(req.body).toString('utf8');
    let sim = new simul();
    let ret = await sim.process(xml, req.headers);
    if (ret === null) res.status(404).send('Not found ' + parts.join('/'));
    else res.end(ret);
});
const server = app.listen(8099, () => {
    console.log('listening on 8099');
}).on('error', (err) => {
    console.log('failed to listen on 8099', err);
    process.exit(-1);
});
