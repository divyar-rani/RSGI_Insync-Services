const request = require('request');
const moment = require('moment');
const http  = require('http');
const https = require('https');
const crypto = require('crypto');
const {XMLParser} = require('fast-xml-parser');
const v8        = require('v8');
const cookie = require('cookie');

const keepAliveAgent = new http.Agent({ keepAlive: true, maxSockets: 200 });
const keepAliveAgentS= new https.Agent({ keepAlive: true, maxSockets: 200 });

const is_obj = (o) => null !== o && typeof o === 'object' && Object.getPrototypeOf(o).isPrototypeOf(Object);
const is_number = (n) => !isNaN(parseFloat(n)) && !isNaN(n - 0);
const is_int = (n) => !isNaN(parseInt(n)) && isFinite(n);

class utils {

    constructor() {
        this.cpu_stats = {cpu_usage: 0, last_time: 0};
        this.tokens = {};
    }

    is_obj(o) {return is_obj(o);}
    is_number(n) { return is_number(n); }
    is_int(n) { return is_int(n); }

    async sleep(toms) {
        return new Promise((resolve, reject) => setTimeout(resolve, toms));
    }

    uuid(length) {
        return crypto.randomBytes(length/2).toString('hex');
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


    _from_excel_date(dt, fmt, tz) {
        if (dt === null || dt === undefined || dt === '' || dt === 0) return dt;
        if (is_number(dt)) {
            var d1900 = new Date(1900, 0, 1);
            if( +dt > 2958446 )return moment( +dt );
            var d = dt|0;
            var h = (dt - d)*24;
            var m = (h - (h|0))*60;
            var s = (m - (m|0))*60;

            var dd;
            if( d>60 )dd = new Date(d1900.getTime() + (d - 2) * 86400000);
            else dd = new Date(d1900.getTime() + (d - 1) * 86400000);

            dd.setHours( h|0 );
            dd.setMinutes( m|0 );
            dd.setSeconds( Math.floor(s+0.5)|0 );
            return tz ? moment(dd).tz(tz) : moment(dd);
        }

        try{
            // if a custom format is specified try it first
            if (fmt && moment(dt, fmt, true).isValid())
                return tz ? moment(dt, fmt).tz(tz) : moment(dt, fmt);

            if (!fmt) {
                fmt = this._guess_date_format(dt);
                if (moment(dt, fmt, true).isValid()) {
                    return tz ? moment(dt, fmt).tz(tz) : moment(dt, fmt);
                }
            }

            // check if its in universal format
            if (moment(dt, 'YYYY-MM-DD').isValid())
                return tz ? moment( dt, 'YYYY-MM-DD' ).tz(tz) : moment(dt, 'YYYY-MM-DD');

            // just shake the tree and see what falls
            return tz ? moment(new Date(dt)).tz(tz) : moment(new Date(dt));
        }catch(e){
            console.log(e);
            return null;
        }
    }

    async parse_xml(xml) {
        if ( xml instanceof Buffer) xml = xml.toString('utf8');
        if (typeof xml != 'string') return xml; // already parsed
        const options = {
            ignoreAttributes: false,
            attributeNamePrefix : "@_",
            allowBooleanAttributes: true
        };
        const parser = new XMLParser(options);
        return parser.parse(xml);
    }

    async parse_json(sjx) {
        if (!sjx) return {};
        if ( sjx instanceof Buffer) sjx = sjx.toString('utf8');
        if (typeof sjx !== 'string') return sjx;
        let f = new Function("return " + sjx);
        return f();
    }

    async json_fix_string_objects(json, strobjs) {
        if (!strobjs || !json || !is_obj(json)) return;
        for (let key in json) {
            if (json[key] instanceof Array) {
                for (let i=0; i<json[key].length; i++) await this.json_fix_string_objects(json[key][i], strobjs);
            } else if (typeof json[key] == 'string' && strobjs.xml && strobjs.xml.indexOf(key) >= 0) {
                json[key] = await this.parse_xml(json[key]);
            } else if (typeof json[key] == 'string' && strobjs.json && strobjs.json.indexOf(key) >= 0) {
                json[key] = JSON.parse(json[key]);
            } else {
                await this.json_fix_string_objects(json[key], strobjs);
            }
        }
    }

    async jnode_value(json, jnode, strobjs) {
        if (!is_obj(json)) return undefined;
        for (let key in json) {
            if (key == jnode) return json[key];

            if (json[key] instanceof Array) {
                for (let i=0; i<json[key].length; i++) {
                    let ret = await this.jnode_value(json[key][i], jnode, strobjs);
                    if (ret !== undefined) return ret;
                }
            } else if (is_obj(json[key])) {
                let ret = await this.jnode_value(json[key], jnode, strobjs);
                if (ret !== undefined) return ret;
            } else if (typeof json[key] === 'string') {
                if (strobjs?.xml && strobjs.xml.indexOf(key) >= 0) {
                    let ret = await this.jnode_value(await this.parse_xml(json[key]), jnode, strobjs);
                    if (ret !== undefined) return ret;
                }  else if (strobjs?.json && strobjs.json.indexOf(key) >= 0) {
                    let ret = await this.jnode_value(JSON.parse(json[key]), jnode, strobjs);
                    if (ret !== undefined) return ret;
                }
            } else {
                // regular member (string/number etc)
            }
        }
        return undefined;   // cound not locate node in this json
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
        return fields;
        // istatsd.gauge({'heap.total': fields.total, 'heap.used': fields.used, 'heap.limit': fields.heap_limit, 'cpu': fields.cpu});
    }

    deescape_json(str) {
        if (typeof str !== 'string') return;
        str = str.replace(/\&quot\;/g, '"');
        str = str.replace(/\&\#34/g, '"');
        return str;
    }


    async _apost(url, data, headers, ignoreCertErrs, options) {
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

    // post with retry
    async apost(url, data, headers, ignoreCertErrs, options, count) {
        if (count > 5) throw('server not reachable '+url);
        try {
            return await this._apost(url, data, headers, ignoreCertErrs, options);
        } catch(e) {
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

    async ipost(url, data, def) {
        if (!this.tokens[def.name]) await this.iauth(def);
        if (!this.tokens[def.name]) return null;
        try {
            if (url.startsWith('/')) url = process.env.IS_INSILLION_SERVER + url;
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
            console.log('ipost:', e);
            return null;
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


    async iget(url, def) {
        if (!this.tokens[def.name]) await this.iauth(def);
        if (!this.tokens[def.name]) return null;
        try {
            if (url.startsWith('/')) url = process.env.IS_INSILLION_SERVER + url;
            let headers = {Authorization: 'Bearer ' + this.tokens[def.name]};
            let ret = JSON.parse(await this.aget(url, headers, true));
            if (ret.status == -114 || ret.status == -101) {// auth expired/failed
                console.log('ipost: auth: expired');
                await this.iauth(def);
                if (this.tokens[def.name]) ret = this.iget(url, def);
                else console.log('auth failed: token not found');
            }
            return ret;
        } catch (e) {
            console.log('iget:', e);
            return null;
        }
    }
	
	
	async iauth(def) {
        this.tokens[def.name] = '';	
		let ret = JSON.parse(await this.apost('http://localhost:80/api/v1/auth', {email: 'admin', pwd:'Rsgi#uat'}));        
		if (ret.status != 0) {
            console.log('auth: failed', ret.txt);
            // notify.send('critical', 'authentication failed for ' + def.user + ' ' + ret.txt);
        } else {
            this.tokens[def.name] = ret.data.token;
        }
    }

}

module.exports = new utils();
