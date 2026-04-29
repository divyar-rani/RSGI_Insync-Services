var conf = null; //require("./../config");
const fs = require('fs');
const path = require('path');
const ish = require('./ishelper');
const istatsd = require('./istatsd');
const {performance} = require('perf_hooks');
const twig = require('./twig');
const utils = require('./utils');
const idata = require('../../lib/is3');
const moment = require('moment');
const preproc = require('./preproc');
const errclass = require('./errorclass');
const isftp = require('./isftp');

class twigbase {
    constructor(name) {
        this.name = name;
    }

    async __init(conf, threadId) {
        let name = this.name;
        this.threadId = threadId;		
        if (!conf[name]) {console.log('name', name, 'not found in conf'); process.exit(0);}
        this.ish = new ish(name, conf);
        this.count = 0;
        this.tmpl = {};
        this.log = path.join(conf.tmp, 'isync');
        this.heap_timer = null;
        if (this.log) {
            fs.mkdirSync(path.join(this.log, this.constructor.name), { recursive: true });
            fs.mkdirSync(path.join(this.log, 'twig'), { recursive: true });
        }
        await idata.wait_for_ready();
    }

    async __load_twigfiles(service, policy) {
        // load from cache if already loaded (only if disable_cache is not true)
        //
        if (!this.tmpl[policy.product_id]) this.tmpl[policy.product_id] = {};

        if (!this.tmpl[policy.product_id][service.uuid] || service.disable_cache) {
            let twigs = [];
            for (let i=0; i<service.twigs.length; i++) {
                let tfile = service.twigs[i];
                if (!tfile.startsWith('/') && tfile.indexOf(':')<0)
                    tfile = path.join(__dirname, '..', '..', tfile);

                if (!fs.existsSync(tfile)) {
                    this.ish.__log('error', 'twig file does not exist '+tfile, policy.policy_id, this.constructor.name);
                    return null;
                }
                twigs[i] = fs.readFileSync(tfile, 'utf8');
            }
            
            this.tmpl[policy.product_id][service.uuid] = twigs;
        }

        if (!this.tmpl[policy.product_id][service.uuid] || this.tmpl[policy.product_id][service.uuid].length == 0) {
            // this.ish.__log('error', 'could not find the twig file for '+policy.product_id, policy.policy_id, this.constructor.name);
            // return null;
        }

        return true;
    }

    // use jdata (or policy if jdata is not provided) and pass through all teig files
    // results of twig files (xml or otherwise) is stored as part of rendered array object
    // in the twig file order. Additionaly all attributes (results of previous transformations)
    // are also stored as part of top level object (jdata or policy)
    // ex: 
    //    attributes can be used as such in twig files 
    //      ... {{gc_olicy_no}} ..
    //    previously rendered outputs can be used as rendered[n]
    //      ... {{rendered[0]}}
    //
    async __transform_all(service, policy, jdata) {
        let rendered = [];
        if (service.transformers instanceof Array) {
            for (let trn of service.transformers) {
                if (typeof this[trn] === 'function') {
                    let ret = await this[trn].call(this, service, policy, jdata, rendered);
                    if (ret === null) return null;
                    rendered.push(ret);
                }
            }
        }

        if (!await this.__load_twigfiles(service, policy)) return null;

        let attrs = await this.ish.get_attrs(policy.policy_id) || {};
        let constants = this.ish.conf.constants || {};

        for (let i=0; i<this.tmpl[policy.product_id][service.uuid].length; i++) {
            let data = {...(jdata||policy), ...attrs, ...constants, ...(service.constants||{})};
            let ret = await this.__transform(service, data, this.tmpl[policy.product_id][service.uuid][i], rendered);

            this.__fs_log(service, policy.policy_id+'-'+i+'.json', JSON.stringify(data), policy);
            this.__fs_log(service, policy.policy_id+'-'+i+'.xml', ret||'', policy);

            if (ret === null) return null;
            rendered.push(ret);
        }
        return rendered;
    }

    __fs_log(service, fname, data, policy) {
        if (!this.log) return;
        //let mdt = (policy?.issue_date ? moment(policy?.issue_date) : moment()).format('YYYY-MM-DD');
        let mdt = policy?.policy_id ? policy.policy_id.substring(policy.policy_id.length-2) : 'AA';
        let folder = path.join(this.log, service.name || this.constructor.name, mdt);
        if (!fs.existsSync(folder)) fs.mkdirSync(folder, {recursive: true});
        try {fs.writeFileSync(path.join(folder, fname), data);} catch (e) {console.log(e);}
    }

    async __transform(service, policy, twigtxt, rendered) {
        rendered = rendered || [];
        let start = performance.now();
        try {
            let ret = await new twig(this.ish).transform(policy, twigtxt, rendered);

            if (+ret.status == 0) {
                istatsd.event(['transform.twig.time'], (performance.now()-start));
                // await this.ish.store(policy.policy_id, ret.data);
                this.stats.trans += (performance.now()-start);
                return ret.data;
            }

            // failed, log the stack trace
            this.__fs_log(service, policy.policy_id+'.json', JSON.stringify(policy), policy);
            this.__fs_log(service, policy.policy_id+'.twig', twigtxt, policy);
            this.__fs_log(service, policy.policy_id+'.trace', ret.stack_trace, policy);

            let parts = ret.stack_trace.split("soapenv:Envelope");
            if (parts.length >= 2) {
                this.ish.__log('error', parts[0]+parts[parts.length-1], policy.policy_id, this.constructor.name);
            }
            
            this.ish.__log('error', ''+ret.stack_trace, policy.policy_id, this.constructor.name);
            this.ish.__log('error', service.name + ':' + ret.error, policy.policy_id, this.constructor.name);
            await this.ish.__state(policy.policy_id, 'transform-failed', undefined, 'l3');
            istatsd.event(['transform.twig.error']);
            return null;

        } catch (e) {
            this.ish.__log('exception', e, policy.policy_id, this.constructor.name);
            await this.ish.__state(policy.policy_id, 'transform-failed', undefined, 'l3');
            istatsd.event(['transform.twig.exception']);
            console.log(e);
            return null;
        }
    }

    async __check_ignored(policy) {
        let prodname = policy.quote?.data.product_name||'';
        if (this.ish.trace) console.log(this.ish.name+':', policy.policy_id, policy.policy_no, prodname);

        let reason = '';
        let conf = this.ish.conf;
        if (conf.oignore[policy.product_id] || conf.oignore[prodname] || conf.oignore[policy.is_product_code]) reason = 'ignored';
        else if (!conf.owhitelist[prodname] && !conf.owhitelist[policy.is_product_code]) reason = 'skipped';

        if (reason) {
            this.ish.__log('info', reason, policy.policy_id, this.constructor.name);
            this.ish.__state(policy.policy_id, reason);
            await this.ish.mark(policy.policy_id);
            return false;
        }
        return true;
    }

    async __put_on_hold(service, policy, reason) {
        this.ish.__log('info', reason, policy.policy_id, this.constructor.name);
        this.ish.__state(policy.policy_id, 'hold');
        return true;
    }

    // default implementation, to be overwritten by consumers
    async __is_on_hold(service, policy, attrs) {
        return false;
    }

    async process_next() {
        let start = performance.now();
        let pids = await this.ish.fetch(1);
		console.log("********************** Divya process_next",pids);
        this.stats = {'fetch': (performance.now()-start), api: 0, trans: 0, process: 0, download: 0, preproc: 0};        

        for (let pid of pids) {
            start = performance.now();
            let policy = await this.ish.policy(pid);        // no exception will be thrown
			console.log("********************** Divya twigbase",policy.proposal.data);
            this.stats.download = performance.now()-start;

            if (!policy) {
                await this.ish.mark(pid);       // stray policy id in queue, remove it
                continue;
            }

            if (!await this.__check_ignored(policy)) continue;

            // same stage of a policy must be processed by only one instance at time
            // it can be reprocessed later by another instance at later time, but not now
            //
            if (!await this.ish.__lock(policy.policy_id, this.constructor.name)) {
                // somebody else is processing (same module) this policy at this time
                // leave the policy id in the queue, it will retry this policy again after a while
                //
                this.ish.__log('warning', 'locked', policy.policy_id, this.constructor.name);
                continue;
            }		

            try {
                let time = performance.now();
                if (await this.__process_policy(policy) !== null) {
					console.log("********************** Divya __process_policy", await this.ish.mark(pid));
                    //await this.ish.mark(pid);
                } else {
                    await this.ish.reschedule(policy.policy_id, 10*60, 'rescheduled', this.constructor.name);
                }
                this.stats.process += (performance.now()-time);
            } catch (e) {
				console.log(policy.policy_id," TwigBase Error Log----------------------> ",e);
                if (typeof e === 'string' && e.startsWith('hold')) {
                    this.ish.__log('hold', e, policy.policy_id, this.constructor.name);
                    this.ish.__state(policy.policy_id, e);
                    await this.ish.mark(pid);
                } else if (typeof e === 'string' && e.startsWith('retry')) {
                    let rwait = 30 * 60;
                    
                    let parts = e.split(' ');
                    if (parts.length > 1 && utils.is_int(parts[1]) >= 1) rwait = Number.parseInt(parts[1]) * 60;
                    let msg = (parts.length > 2) ? parts.slice(2).join(' ') : '';
                    await this.ish.reschedule(policy.policy_id, rwait, 'rescheduled ' + msg + ' ' + rwait + 's', this.constructor.name);

                    this.ish.__state(policy.policy_id, this.constructor.name+'-failed', undefined, 'l3');
                } else if (typeof e === 'string' && e.startsWith('state ')) {
                    await this.ish.mark(pid);
                    this.ish.__state(policy.policy_id, e.substring(6).trim(), undefined, 'l3');
                } else {
                    await this.ish.mark(pid);
                    istatsd.event(['process.exception']);
                    this.ish.__log('exception', e, policy.policy_id, this.constructor.name);
                    this.ish.__state(policy.policy_id, 'generic', undefined, 'l3');
                }
            }
            await this.ish.__unlock(policy.policy_id, this.constructor.name);
			console.log(policy.policy_id," TwigBase Error Log ----------------------> unlocked");
            this.stats.total = performance.now() - start;
            if (pids.length > 0) {
                console.log('('+this.threadId+')'+this.constructor.name.padStart(10), 
                    'qf:'+this.stats.fetch.toFixed(0).padEnd(5), '['+this.stats.total.toFixed(0).padStart(5)+']',
                    's3:'+this.stats.download.toFixed(0).padEnd(5), 'pr:'+(this.stats.process-this.stats.api).toFixed(0).padEnd(5),
                    'ws:'+this.stats.api.toFixed(0).padEnd(5), 'tw:'+this.stats.trans.toFixed(0).padEnd(5),
                    'pp:'+this.stats.preproc.toFixed(0).padEnd(5),
                    policy.policy_id.padEnd(15)
                    );
            }
        }
        
        return pids.length;
    }

    __invalid_attr_value(service, val) {
        let invalid = ['na', 'n/a'];
        if (invalid.indexOf((val+'').toLowerCase()) >= 0) return true;
        return false;
    }

    async __conditional_attribute(service, jx, policyId, subid, attr) {
        if (!attr.if) return true;
        await utils.json_fix_string_objects(jx, service.target.strobjs);
        if (!attr.iffunc) {
            attr.iffunc = new Function("resp", "return " + attr.if + "");
        }
        if (!attr.iffunc(jx)) {
            await this.ish.__log('info', attr.name + ' conditional attr failed', policyId, service.name);
            return false;
        }
        return true;
    }

    async __save_attributes(service, jx, policyId, subid) {
        subid = subid ? '-'+subid : '';

        if (!service.target.attributes || service.target.attributes.length == 0) {
            await this.ish.set_attr(policyId, service.name+subid+'-no-error', '1');
            return true;
        }		 
        let found = true;
        for (let attr of service.target.attributes) {
            if (!await this.__conditional_attribute(service, jx, policyId, subid, attr))
                continue;

            let val = null;
            if (attr.xpath) {
                let xpaths = attr.xpath instanceof Array ? attr.xpath : [attr.xpath];
                for (let xpath of xpaths) {
                    val = await utils.jpath_value(jx, xpath, service.target.strobjs);
                    if (val) break;
                }
            } else if (attr.xnode) {
                let xnodes = attr.xnode instanceof Array ? attr.xnode : [attr.xnode];
                for (let xnode of xnodes) {
                    val = await utils.jnode_value(jx, xnode, service.target.strobjs);
                    if (val) break;
                }
            } else if (attr.xvalue) {
                val = attr.xvalue;
            } else if (attr.xfunc) {
                if (typeof this[attr.xfunc] === 'function') {
                    val = await this[attr.xfunc].call(this, service, jx, policyId, subid, attr);
                } else {
                    throw "" + attr.xfunc + " is not a function in " + this.constructor.name;
                }
            }

            if (val && utils.is_obj(val)) {
                await this.ish.__log('error', attr.name + ' expected string/number, found object ' + JSON.stringify(val), policyId, service.name);
                val = null;
            }
            
            if (val && typeof val === 'string') {
                let parts = val.split('$$');
                val = parts[0];
                if (parts.length > 1 && parts[1].indexOf("SUCCESSFULLY") < 0) {
                    // id found but not modified successfully
                }

                // do we use the duplicate source or current value
                // if (parts.length > 2 && parts[1] === 'DATA SAVED SUCCESSFULLY,THIS CUSTOMER MARKED AS DUPLICATE ') {
                //     if (parts[2]) val = parts[2];
                // }
            }
            

            if (val) {
                if (this.__invalid_attr_value(service, val)) {
                    await this.ish.__log('error', attr.name + ' is invalid ', policyId, service.name);
                    if (attr.mandatory) found = false;
                } else {
                    await this.ish.__log('info', attr.name + ' found ' + val, policyId, service.name);
                    await this.ish.set_attr(policyId, attr.name+subid, val);
                }

            } else if (attr.mandatory) {
                await this.ish.__log('error', attr.name + ' not found ', policyId, service.name);
                found = false;
            } // skip non-mandatory, non-existent attributes
        }

        return found;
    }

    async __save_error_attributes(service, errTxt, policyId) {
        let nattrs = this.errclass.attributes(service, policyId, errTxt);
        if (!nattrs) return;
        console.log('found new attributes: ', nattrs);
        let retry = 0;
        let attrs = await this.ish.get_attrs(policyId);
        for (let name in nattrs) {
            let val = nattrs[name];
            if (!val) continue;
            if (attrs[name] != val) {
                console.log('found new attribute value: ', name, val);
                await this.ish.__log('info', name + ' found ' + val + ' from error', policyId, service.name);
                await this.ish.set_attr(policyId, name, val);
                retry = 1;
            } else {
                console.log('attribute value is same as earlier: ', name, val);
            }
        }
        if (retry) throw('retry ' + retry);
    }

    async __check_errors(service, policyId, jx) {
        this.errbkt = '';
        let fault = await utils.jpath_value(jx, "soap:Envelope.soap:Body.soap:Fault.faultstring");
        if (fault) {
            this.errbkt = 'l2';
            await this.ish.__log('error', 'soap-fault: ' + fault, policyId, service.name);
            return false;
        }

        if (!service.target.errorPath) return true;
        
        if (!(service.target.errorPath instanceof Array))
            service.target.errorPath = [service.target.errorPath];

        for (let errPath of service.target.errorPath) {
            let ignore = typeof errPath === 'string' ? ['success'] : (errPath.ignore||['success']);

            let errTxt = null;
            if (typeof errPath == 'string') errPath = {xpath: errPath};
            if (errPath.xnode) errTxt = await utils.jnode_value(jx, errPath.xnode);
            else if (errPath.xfunc) {
                if (typeof this[errPath.xfunc] === 'function') {
                    errTxt = await this[errPath.xfunc].call(this, service, jx, policyId);
                } else {
                    throw "" + errPath.xfunc + " is not a function in " + this.constructor.name;
                }
            } else errTxt = await utils.jpath_value(jx, errPath.xpath);

            if (errTxt) {
                await this.__save_error_attributes(service, errTxt, policyId);

                await this.__check_error_retry(service, errTxt, policyId);

                let clfy = this.errclass.classify(service, policyId, errTxt, ignore);
                
                if (clfy && clfy.bucket) {
                    this.errbkt = clfy.bucket;
                    await this.ish.__log('error', service.name+':'+errTxt, policyId, service.name, null, this.errbkt);
                    if (this.errbkt.startsWith('retry')) throw this.errbkt;
                    if (clfy.state) throw ('state ' + clfy.state);
                    if (!service.target.ignoreErrors) return false;
                } else {
                    await this.ish.__log('error', service.name+':'+errTxt, policyId, service.name, null);
                }
            }
        }
        return true;
    }

    async __failed(service, policy, type, message) {
        if (message instanceof Error) {
            message = type.message + ':' + message;
            type = 'exception';
        }

        await this.ish.__log(type, message, policy.policy_id, service.name);
        await this.ish.__state(policy.policy_id, service.name+'-failed', undefined, 'retry');

        if (message.startsWith('retry: ')) throw (message);
        return false;
    }

    async __check_error_retry(service, err, policyId) {
        if (typeof err !== 'string') return;
        if (err.startsWith('retry')) throw (err);

        let retryOn = {...(service.target.retryOn||{}), ...(this.ish.conf.retryOn||{})};
        err = err.toLowerCase();
        for (let rtxt in retryOn) {
            let timeout  = +retryOn[rtxt];
            if (!timeout || timeout <= 0) continue;

            rtxt = rtxt.toLowerCase();
            if (rtxt.startsWith('%') && rtxt.endsWith('%')) {
                rtxt = rtxt.substring(1, rtxt.length-1);
                if (err.indexOf(rtxt) >= 0) throw ('retry ' + timeout);
            } else if (err == rtxt) {
                throw ('retry ' + timeout);
            }
        }
    }


    // service: web service definition (url, method etc)
    // subid (optional): retrieved attributes will have name+'-'+subid as name, if present
    // simul: key to be sent to the simulation server
    //
    async __invoke_url(service, xdata, policy, subid) {
        let policyId = policy.policy_id;
        let url = service.target.url;
        let options = {...(this.ish.conf[this.ish.name].httpOptions || {}), ...(service.target.httpOptions||{})};
        let headers = service.target.headers || {};
        if (this.ish.conf.simulator) {
            url = this.ish.conf.simulator;
            headers['ins_policy_id'] = policyId;
            headers['ins_policy_no'] = policy.policy_no;
            if (subid) headers['ins_sub_id'] = subid;
            headers['ins_module'] = this.constructor.name;
            headers['ins_prod_name'] = policy.quote?.data.product_name||'';
            headers['ins_service_name'] = service.name||'';
        }

        let ret = null;
        let jx = null;
        try {
            this.__fs_log(service, (subid||policyId)+'-req.txt', typeof xdata != 'string' ? JSON.stringify(xdata) : xdata, policy);
            let start = performance.now();			
            if (url) {
                //ret = await this.ish.sendFullProposalRequest( xdata);	
			if (service.target.type == 'json'){
				ret = await this.ish.apost(url, JSON.parse(xdata), headers, undefined, options);
				}		    
			else{      // To allow XML Request
		    ret = await this.ish.apost(url, xdata, headers, undefined, options);
		}
            
			} else {
                if (service.target.type == 'json') ret = {};
                else ret = "<xml></xml>";
            }
			
			console.log("----------- Ret ", ret);
            
            if (service.trace) console.log('invoke:', (policy.quote?.data.product_name||'')+'('+(policy.quote?.data.sub_product_name||'')+')', (performance.now()-start).toFixed(0), url);
            this.__fs_log(service, (subid||policyId)+'-res.txt', typeof ret != 'string' ? JSON.stringify(ret) : ret, policy);
            if (service.target.type == 'json') jx = typeof ret === 'string' ? JSON.parse(ret) : ret;
            else jx = await utils.parse_xml(ret);
            if (!jx) {
                await this.ish.__log('error', 'failed to parse response', policy.policy_id, service.name);
                return false;
            }

        } catch (e) {
            await this.ish.__log('exception', e.message||e, policy.policy_id, service.name);
            
            // check if this is a retriable error
            //
            await this.__check_error_retry(service, e.message||e, policy.policy_id);

            this.errbkt = 'l3';
            return false;
        }
		
        if (!await this.__check_errors(service, policyId, jx)) return false;
        return await this.__save_attributes(service, jx, policyId, subid);
    }

    // check if we have all mandatory attributes of this stage (service) has been
    // acquired.
    //
    async __check_service_status(service, policy, subid, xdata) {
        let attrs = await this.ish.get_attrs(policy.policy_id);

        if (!await this.__match_conditional(service, policy, xdata, attrs))
            return true;

        if (await this.__is_on_hold(service, policy, attrs)) throw('hold-' + service.name);

        
        let key = subid ? "-"+subid : '';

        if (!service.target.attributes || service.target.attributes.length == 0) {
            return (attrs[service.name+subid+'-no-error'] == '1');
        }

        let notfound = service.target.attributes.filter(x => x.mandatory && !attrs[x.name+key]);
        if (notfound.length == 0) this.ish.__log('info', this.ish.name+': already completed', policy.policy_id, this.constructor.name);
        return notfound.length == 0;
    }

    async __copy_to_sftp(service, policy, xdata, subid) {
        if (!xdata.filename || !xdata.content) throw ('missig file name or content');
        if (!service.target?.sftp) throw ('invalid configuration, sftp property missing');

        let sftp = new isftp();
        xdata.full_path = await sftp.upload(policy, xdata.filename, xdata.content, service.target.sftp);
        await this.__save_attributes(service, xdata, policy.policy_id, subid);
        istatsd.event(['process.' + this.constructor.name + '.completed'], (performance.now()-start));
        return true;
    }

    async __copy_to_folder(service, policy, xdata, subid) {
		let start = performance.now();
        if (!xdata.filename || !xdata.content) throw ('missig file name or content');
        if (!service.target?.folder) throw ('invalid configuration, folder property missing');
        let bpath = service.target?.folder.path;
        if (!bpath || !fs.existsSync(bpath)) throw ('invalid configuration, folder does not exists ' + bpath);

        if (service.target?.folder.use_date) {
            let mdt = (policy?.issue_date ? moment(policy?.issue_date) : moment()).format('YYYY-MM-DD');
            bpath = path.join(bpath, mdt);
        }

        if (service.target?.folder.use_suffix) {
            bpath = path.join(bpath, policy.policy_id.substring(policy.policy_id.length-2));
        }

        xdata.full_path = path.join(bpath, xdata.filename);
        fs.mkdirSync(bpath, {recursive: true});
        fs.writeFileSync(xdata.full_path, xdata.content, xdata.encoding);
        await this.__save_attributes(service, xdata, policy.policy_id, subid);
        istatsd.event(['process.' + this.constructor.name + '.completed'], (performance.now()-start));
        return true;
    }

    async __call_service(service, policy, xdata, subid) {
        let start = performance.now();
        xdata = xdata || {};
        if (service.target?.type == 'sftp') {
            return await this.__copy_to_sftp(service, policy, xdata, subid);
        }

        if (service.target?.type == 'folder') {
            return await this.__copy_to_folder(service, policy, xdata, subid);
        }

        if (await this.__invoke_url(service, xdata, policy, subid)) {
            this.stats.api += (performance.now()-start);
            istatsd.event(['process.' + this.constructor.name + '.completed'], (performance.now()-start));
            return true;
        }

        await this.ish.__state(policy.policy_id, service.name + '-failed', undefined, this.errbkt);
        this.stats.api += (performance.now()-start);
        istatsd.event(['process.' + this.constructor.name + '.failed'], (performance.now()-start));
        return false;
    }

    async __match_product(service, policy) {
        let pcode = policy.is_product_code;
        let pname = policy.quote?.data.product_name.toLowerCase();
        if (service.subprod) {
            let subname = await utils.jpath_value(policy, service.subprod);
            if (subname) {
                pname = pname + ' - ' + subname.toLowerCase();
                pcode = pcode + ' - ' + subname.toLowerCase();
            }
        }

        return service.oproducts['all'] || service.oproducts[pname] || 
            service.oproducts[pcode] ||
            service.oproducts[policy.product_id.toLowerCase()];
    }

    async __match_conditional(service, policy, xdata, attrs) {
        if (!xdata) xdata = {};
        if (service.iffunc(policy, xdata, attrs||{})) return true;
        await this.ish.__log('info', 'skipped-condition-'+service.name, policy.policy_id, service.name);
        return false;
    }

    // default implementation, usually overwritten by consumer classes
    //
    async _process_service(service, policy) {
        if (await this.__check_service_status(service, policy)) return true;

        if (typeof this.__add_additional_data === 'function')
            await this.__add_additional_data(policy);

        let ndata = await this.__transform_all(service, policy);
        if (ndata === null) return false;

        if (!(await this.__call_service(service, policy, ndata[ndata.length-1]))) {
            return false;
        }
        return true;
    }



    async __process_policy(policy) {
        let final = true;
        let attr = null;
        let skipped = true;

        let start = performance.now();
        policy = (new preproc()).process(policy, this.ish.conf[this.ish.name].preprocess);
        this.stats.preproc = performance.now()-start;

        let spolicy = JSON.stringify(policy);
        for (let service of this.ish.conf[this.ish.name].services) {
            if (!await this.__match_product(service, policy)) continue;

            if (!await this._process_service(service, JSON.parse(spolicy))) return true;

            attr = attr ? attr : await this.ish.get_attr(service.attributes?.[0]?.name);
            skipped = false;
			console.log(service.name,"--------------->",policy.policy_id);
            let qurl = service.sqs?.name ? this.ish.conf.queues[service.sqs?.name] : service.sqs?.dstUrl;
            if (qurl) {
                await this.ish.push_to_target_queue(service, policy, this.ish.name);
                final = false;
            }

            // other parallel processors/consumers
            if (service.sqs?.others) await this.ish.push_to_other_queues(service, policy);
        }

        if (skipped) {
            this.ish.__log('warning', this.ish.name+': skip (matching service not found)', policy.policy_id, this.constructor.name);
            this.ish.__state(policy.policy_id, 'skipped');
            return true;
        }
        
        if (final) {
            await this.ish.__log('info', 'completed', policy.policy_id, this.name);
            await this.ish.__state(policy.policy_id, 'completed', attr);
        }

        return;
    }

    async heap_stats() {
        let stats = utils.heap_stats();
        istatsd.gauge({
            [this.constructor.name + '.heap.total']: stats.total,
            [this.constructor.name + '.heap.used']: stats.used,
            [this.constructor.name + '.heap.limit']: stats.limit,
            [this.constructor.name + '.cpu']: stats.cpu,
        });
        this.heap_timer = setTimeout(() => this.heap_stats(), 60*1000);
    }


    async run(cconf) {
        if (!cconf || !cconf.config || !fs.existsSync(cconf.config)) {
            console.log(this.constructor.name,':', 'invalid config file, not found', cconf?.config);
            process.exit(-1);
        }
        let conf = require(cconf.config);
        this.errclass = new errclass(conf);
        await this.__init(conf, cconf.id);

        if (!conf[this.ish.name]) {
            console.log('name '+this.ish.name+' not defined in config, stopped');
        } else {

            conf.oignore = {};
            for (let pname of conf.ignore || []) conf.oignore[pname.toLowerCase()] = true;
            conf.owhitelist = {};
            for (let pname of conf.whitelist || []) conf.owhitelist[pname.toLowerCase()] = true;        

            for (let service of conf[this.ish.name].services) {
                service.uuid = utils.uuid(10);
                service.products = service.products ? service.products.map(x => x.toLowerCase()) : ['all'];
                service.oproducts = service.products.reduce((a, x) => {a[x]=true; return a;}, {});
                service.twigs = service.twigs || [];
                service.iffunc = () => true;
				console.log("Divya ******************** ",service.name);
                if (service.if) service.iffunc = new Function('policy', 'data', 'attrs', 'return ' + service.if);
            }

            this.heap_stats();
            while (true) {
                if (await this.process_next() == 0)
                    await utils.sleep(conf[this.ish.name].delay || 3*1000);
            }        
        }
    }
}

module.exports = twigbase;