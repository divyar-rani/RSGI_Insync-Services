
class base {
    constructor(req, res, cust) {
        this.req = req;
        this.res = res;
        this.cust = cust;
    }
    _param(param) {
        if ((this.req.method == 'POST' || this.req.method == 'PUT') && this.req.body && this.req.body.hasOwnProperty(param))
            return this.req.body[param];
        if (this.req.query && this.req.query.hasOwnProperty(param))
            return this.req.query[param];
        return false;
    }

    __param(param) {
        let p = this._param(param);
        if( p !== false )return p;
        throw new Error('missing parameter '+param);
    }

    response(status, txt, data) {
        this.res.setHeader('Content-Type', 'application/json');
        return this.res.send(JSON.stringify({status, txt, data}));
    }

}
module.exports = base;