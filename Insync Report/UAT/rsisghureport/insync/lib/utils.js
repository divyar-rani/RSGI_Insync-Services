const request = require('request');
const http  = require('http');
const https = require('https');
const notify = require('./notify');
const crypto = require('crypto');
const {performance} = require('perf_hooks');
const v8     = require('v8');
const istatsd= require('./istatsd');
const moment = require('moment');

const keepAliveAgent = new http.Agent({ keepAlive: true, maxSockets: 200 });
const keepAliveAgentS= new https.Agent({ keepAlive: true, maxSockets: 200 });
const is_obj = (o) => null !== o && typeof o === 'object' && Object.getPrototypeOf(o).isPrototypeOf(Object);
const is_number = (n) => !isNaN(parseFloat(n)) && !isNaN(n - 0);
const is_int = (n) => !isNaN(parseInt(n)) && isFinite(n);


class utils {

    constructor() {
        this.tokens = {};
        this.cpu_stats = {cpu_usage: 0, last_time: 0};
    }

    async sleep(toms) {
        return new Promise((resolve, reject) => setTimeout(resolve, toms));
    }

    async _apost(url, data, headers, ignoreCertErrs, options){
        headers = headers || {};
        return new Promise(function(resolve, reject){
            options = options || {};
            options.url = url;
            options.agent = keepAliveAgent;
            if (url.indexOf('https') === 0) options.agent = keepAliveAgentS;
            else options.agent = keepAliveAgent;

            if (headers && headers['Content-Type'] == 'application/json') {
                options.json=data;
            } else if (headers && headers['Content-Type'] == 'application/vnd.flux') {
                options.body = data;
            } else if (data.hasOwnProperty('file')) {
                options.formData=data;
            } else {
                options.form= data;
            }

            if(ignoreCertErrs)options.rejectUnauthorized = false;
            headers['Connection'] = 'keep-alive';
            options.headers = headers;
            request.post(options, function(err, resp, body){
                if( err )return reject(err);
                else if(resp && resp.statusCode != 200 && resp.statusCode != 204)return reject(resp.statusCode+' '+body);
                else return resolve(body);
            }).on('error', (err) => reject(err));
        });
    }

    async apost(url, data, headers, ignoreCertErrs, options, count){
        if (count > 0) console.log('   **** retry ', count, url);
        if (count > 5) throw('server not reachable '+url);
        try{
            return await this._apost(url, data, headers, ignoreCertErrs, options);
        }catch(e){
            let retry = ['hang up', 'econnreset'/*, 'socket-timeout'*/];
            let message = (typeof e == 'object' ? e.message : e) + '';
            for (let reason of retry) {
                if (message.indexOf(reason) >= 0) {
                    console.log('retry: ', message);
                    return await this.apost(url, data, headers, ignoreCertErrs, options, (count||0)+1);
                }
            }
            throw(e);
        }
    }



    async aget(url, headers, ignoreCertErrs, token){
        return new Promise((resolve, reject) => {
            let options = {url: url, method: 'GET'};
            if (ignoreCertErrs) options.rejectUnauthorized = false;
            options.headers = headers || {};
            if (token) options.headers.Authorization = 'Bearer ' + token;
            if (!options.headers['content-type']) options.headers['content-type'] = 'application/json';
            if (url.indexOf('https') === 0) options.agent = keepAliveAgentS;
            else options.agent = keepAliveAgent;
            options.headers['Connection'] = 'keep-alive';
            options.timeout = 180000;
            request.get(options, (err, resp, body) => {
                if( err )return reject(err);
                else if(resp && resp.statusCode!=200 && resp.statusCode!=204)return reject(resp.statusCode+' '+body);
                else return resolve(body);
            }).on('error', /*iin*/(err) => reject(err));
        });
    }

    async iauth(def) {
        this.tokens[def.name] = '';
        let mpwd = def.mpwd ? def.mpwd : crypto.createHash('md5').update(def.pass).digest('hex');
        let start = performance.now();
        let ret = JSON.parse(await this.apost(def.server+'/api/v1/auth', {email: def.user, mpwd}));
        console.log('auth: ', (performance.now()-start).toFixed(2));
        if (ret.status != 0) {
            console.log('auth: failed', ret.txt);
            notify.send('critical', 'authentication failed for ' + def.user + ' ' + ret.txt);
        } else {
            this.tokens[def.name] = ret.data.token;
        }
    }

    async iget(url, def) {
        if (!this.tokens[def.name]) await this.iauth(def);
        if (!this.tokens[def.name]) return null;
        try {
            let ret = JSON.parse(await this.aget(url, {}, true, this.tokens[def.name]));
            if (ret.status == -114 || ret.status == -101) {// auth expired/failed
                console.log('iget: auth: expired');
                await this.iauth(def);
                if (this.tokens[def.name]) ret = this.iget(url, def);
            }
            return ret;
        } catch (e) {
            console.log('iget:', e);
            return null;
        }
    }
    async ipost(url, data, def) {
        if (!this.tokens[def.name]) await this.iauth(def);
        if (!this.tokens[def.name]) return null;
        try {
            let headers = {Authorization: 'Bearer ' + this.tokens[def.name]};
            let ret = JSON.parse(await this.apost(url, data, headers, true));
            if (ret.status == -114 || ret.status == -101) {// auth expired/failed
                console.log('ipost: auth: expired');
                await this.iauth(def);
                if (this.tokens[def.name]) ret = this.ipost(url, data, def);
                else console.log('auth failed: token not found');
            }
            return ret;
        } catch (e) {
            console.log('iget:', e);
            return null;
        }
    }
    heap_stats() {
        let hs = v8.getHeapStatistics();
        let curtime = performance.now();
        let elapsed = (curtime - (this.cpu_stats.last_time||0));
        const usage = process.cpuUsage(); // all times are in microseconds
        if (this.cpu_stats.usage) {
            let ticks = ((usage.user+usage.system) - (this.cpu_stats.usage.user+this.cpu_stats.usage.system)) / 1000;
            this.cpu_stats.cpu_usage = Math.round((10000 * ticks / elapsed) +  Number.EPSILON)/100;
        }
        this.cpu_stats.usage = usage;
        this.cpu_stats.last_time = curtime;
        let fields = {total: hs.total_heap_size||0, physical: hs.total_physical_size||0, used: hs.used_heap_size||0,
            heap_limit: hs.heap_size_limit||0, alloced: hs.malloced_memory||0, peak_alloced: hs.peak_malloced_memory||0,
            native_context: hs.number_of_native_contexts||0, detached: hs.number_of_detached_contexts,
            cpu: this.cpu_stats.cpu_usage
        };
        istatsd.gauge({'insync.heap.total': fields.total, 'insync.heap.used': fields.used, 'insync.heap.limit': fields.limit, 'insync.cpu': fields.cpu});
    }

    _date_with_time_format(str, dtfmt) {
        return str.indexOf(':') > 0 ? dtfmt + ' HH:mm:ss' : dtfmt;
    }

    _guess_date_format(str) {
        if (is_number(str)) return 'DD-MM-YYYY';
        if (typeof str != 'string') return 'DD-MM-YYYY';
        str = str.replace(/\//g, '-');
        
        let parts = str.split('-');

        if (parts.length < 3) return 'DD-MM-YYYY';

        if (/^[a-zA-Z]+$/.test(parts[0])) {
            if (parts[0].length === 3) {
                return this._date_with_time_format(str, parts[1].length == 2 ? 'MMM-DD-YYYY' : 'MMM-YYYY-DD');
            } else {
                return this._date_with_time_format(str, parts[1].length == 2 ? 'MMMM-DD-YYYY' : 'MMMM-YYYY-DD');
            }
        }

        if (/^[a-zA-Z]+$/.test(parts[1])) {
            if (parts[1].length === 3) {
                return this._date_with_time_format(str, parts[0].length == 2 ? 'DD-MMM-YYYY' : 'YYYY-MMM-DD');
            } else {
                return this._date_with_time_format(str, parts[0].length == 2 ? 'DD-MMMM-YYYY' : 'YYYY-MMMM-DD');
            }
        }

        if (parts[0].length > 2) {
            return str.indexOf(':')>0 ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD';
        } else {
            return str.indexOf(':')>0 ? 'DD-MM-YYYY HH:mm:ss' : 'DD-MM-YYYY';
        }
    }

    _fix_date(str, outfmt) {
        let fmt = this._guess_date_format(str);
        let mdt = moment(str, fmt);
        if (!outfmt) outfmt = 'DD/MM/YYYY';
        return mdt.isValid() ? mdt.format(outfmt) : str;
    }

    async jpath_value(json, jpath, strobjs) {
        let parts = jpath.split('.');
        let o = json;		
        for (let i=0; i<parts.length-1; i++) {
            let k = parts[i];
            if (o[k] instanceof Array) {
                o = o[k][parts[i+1]];
                i++;
            } else if (is_obj(o[k])) {
                o = o[k];
            } else {
                if (typeof o[k] === 'string') {
                    if (strobjs && strobjs.xml.indexOf(k) >= 0) {
                        o = await this.parse_xml(o[k]);
                    } else if (strobjs && strobjs.json.indexOf(k) >= 0) {
                        o = JSON.parse(o[k]);
                    } else {
                        return null;    // invalid jpath    
                    }
                } else {
                    return null;    // invalid jpath
                }
            }
        }
        return o[parts[parts.length-1]];
    }

}

module.exports = new utils();
