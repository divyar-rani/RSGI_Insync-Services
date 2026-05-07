const moment = require('moment');


function is_obj(o) {
    return null !== o && typeof o === 'object' && Object.getPrototypeOf(o).isPrototypeOf(Object);
}
function is_int(n){
    return !isNaN(parseInt(n)) && isFinite(n);
}



function xmlEscape(s) {
    s = s.replace(/&(?!(amp;|quot;|lt;|gt;|apos;))/g, '&amp;');
    return s.replace(/[<>'"]/g, function (c) {
        switch (c) {
            case '<': return '&#60;';
            case '>': return '&#62;';
            case '\'':return '&#39;';
            // case '"': return '&#34;';
            // case '<': return '&lt;';
            // case '>': return '&gt;';
            // case '&': return '&amp;';
            // case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
}

class preprocessor {
    constructor() {

    }

    process_boolean(bval, config) {
        if (config.boolean_to_string) return bval ? (config.true_string || 'true') : (config.false_string || 'false');
        return bval;
    }

    process(policy, config) {
        if (!config) return policy;
        policy = this.process_obj(policy, config);
        if (config.dates)
            this._fix_dates(policy, config.dates, config.in_date_format);
        return policy;
    }

    process_obj(o, config, key) {
        if (key && config.escapeExclude && config.escapeExclude.indexOf(key) >= 0) return o;

        if (o === null || o === undefined) {
            return '';
        }

        if (o instanceof Array) {
            for (let i=0; i<o.length; i++) {
                o[i] = this.process_obj(o[i], config);
            }
            return o;
        }

        if (!config.skip_boolean) {
            if (typeof o === 'string') {
                let lo = o.toLowerCase();
                if (lo === 'null') return '';
                if (lo === 'true') return config.true_string || o; //return this.process_boolean(true, config);
                if (lo === 'false') return config.false_string || o; //this.process_boolean(false, config);
                
                // case sensitive
                if (!config.skip_yes_no) {
                    if (o === "Yes") return config.true_string || 'true';
                    if (o === "No") return config.false_string || 'false';
                }
    
                if (config.xmlescape) return xmlEscape(o);
                return o;
            }
    
            if (typeof o === 'boolean') {
                return this.process_boolean(o, config);
            }
        }


        if (typeof o === 'number') {
            return o;
        }

        if (is_obj(o)) {
            for (let key in o) {
                if (o[key] === null && config.remove_nulls) delete o[key];
                else o[key] = this.process_obj(o[key], config, key);
            }
        }

        return o;
    }

    _from_excel_date(dt, fmt, tz) {
        if (dt === null || dt === undefined || dt === '' || dt === 0) return dt;
        if (is_int(dt)) {
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

    _fix_date(parts, obj, infmt, outfmt) {
        let o = obj;
        for (let i=0; i<parts.length-1; i++) {
            let k = parts[i];
            if (o[k] instanceof Array) {
                for (let j=0; j<o[k].length; j++) {
                    this._fix_date(parts.slice(i+1), o[k][j], infmt, outfmt);
                }
                return;
            }
            if (!is_obj(o[k])) {
                console.log(k, 'is not valid sub object');
                return;   // not a valid jpath or sub object not found
            }
            o = o[k];
        }
        
        let k = parts[parts.length-1];
        let mdt = this._from_excel_date(o[k], infmt);
        if (mdt) {
            if (mdt.isValid()) {
                mdt = mdt.format(outfmt||'DD/MM/YYYY');
                console.log('fixed: ', parts.join('.'), o[k], '=>', mdt);
            }
        }
        o[k] = mdt;
    }

    _fix_dates(policy, jpaths, fmt) {
        let done = {};
        for (let jpath of jpaths) {
            if (typeof jpath === 'string') {
                if (done[jpath]) continue;  // do not repeat on same path
                this._fix_date(jpath.split(','), policy, fmt);
                done[jpath] = 1;
            } else {
                if (!jpath.products || jpath.products.indexOf(policy.product_id) >= 0) {
                    if (done[jpath.path]) continue;  // do not repeat on same path
                    this._fix_date(jpath.path.split('.'), policy, jpath.infmt, jpath.outfmt);
                    done[jpath.path] = 1;
                }
            }
        }
    }
}

module.exports = preprocessor;