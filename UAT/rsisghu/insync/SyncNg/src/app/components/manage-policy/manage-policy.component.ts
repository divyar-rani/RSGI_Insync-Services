import { Component, OnInit, Inject } from '@angular/core';
import { Location } from '@angular/common';
import { Subscription } from 'rxjs';
import { InSyncService } from 'src/app/in-sync.service';
import { ActivatedRoute, Router, ParamMap } from "@angular/router";
import { MatDialog } from '@angular/material/dialog';
import { JsonViwerDialogComponent } from './json-viwer.component';
import * as moment from 'moment';

const is_obj = (o: any) => null !== o && typeof o === 'object' && Object.getPrototypeOf(o).isPrototypeOf(Object);
const is_int = (n: any) => !isNaN(parseInt(n)) && isFinite(n);

@Component({
    selector: 'app-manage-policy',
    templateUrl: './manage-policy.component.html',
    styleUrls: ['./manage-policy.component.scss']
})
export class ManagePolicyComponent implements OnInit {

    profile: any = null;
    policy: any = {state: {}, policy: {}, logs: [], purgatory: {}, transformed: []};
    policyId: string = '';
    policyNo: string = '';
    proposalNo: string = '';
    subscription: Subscription | null = null;
    rsubscription: Subscription | null = null;
    fields: any = {fields: []};
    editAttr: boolean = false;
    attrName: string = '';
    attrValue: string = '';
    loading: boolean = false;
    debug: any[] = [];
    balance: any[] = [];
    editField: string = '';
    zone: string = '';
    logMore: boolean = false;
    msg: string = '';

    constructor(private insyncService: InSyncService,
        private activatedRoute: ActivatedRoute,
        public dialog: MatDialog,
        private _location: Location) {
        this.rsubscription = this.activatedRoute.queryParams.subscribe(params => {
            if (params['policy_id']) {
                this.policyId = params['policy_id'];
                this.loadPolicy();
            }
        });    
        this.zone = insyncService.zone;
    }

    ngOnInit(): void {
        this.subscription = this.insyncService.profileSubject.subscribe((profile) => {
            this.profile = profile;
            if (this.profile) this.loadPolicy();
        });
    }
    ngOnDestroy(): void {
        this.subscription?.unsubscribe();
        this.rsubscription?.unsubscribe();
    }

    _jpath_to_value(obj: any, jpath: string) {
        let parts = jpath.split('.');
        for (let i=0; i<parts.length-1; i++) {
            let part = parts[i];
            if (obj[part] && typeof obj[part]==='object') obj = obj[part];
        }

        if (obj) return obj[parts[parts.length-1]];
        return '--undefined--';
    }

    _jpath_expand_arrays_field(obj: any, fld: any): any[] {
        let parts = fld.jpath.split('.');
        let tobj = obj;
        console.log('fld:', parts)
        for (let i=0; i<parts.length-1; i++) {
            if (tobj[parts[i]] instanceof Array) {
                console.log('expand: array: ', parts[i]);
                if (is_int(parts[i+1])) {
                    tobj = tobj[parts[i]];
                } else {
                    let nparts = [...parts];
                    nparts.splice(i+1, 0, 0);
                    let fields = [];
                    for (let j=0; j<tobj[parts[i]].length; j++) {
                        nparts[i+1] = j;
                        let nfld = {...fld, jpath: nparts.join('.')};
                        fields.push(...this._jpath_expand_arrays_field(obj, nfld));
                    }
                    return fields;
                }
            } else if (is_obj(tobj[parts[i]])) {
                tobj = tobj[parts[i]];
            } else {
                console.log('invalid jpath', fld.name);
                break;
            }
        }
        return [fld];
    }

    _jpath_expand_arrays(obj: any, fields: any[]) {
        let nflds = [];
        for (let fld of fields) {
            nflds.push(...this._jpath_expand_arrays_field(obj, fld));
        }
        return nflds;
    }

    async loadPolicy() {
        if (!this.policyId && !this.policyNo && !this.proposalNo) return;
        this.loading = true;
        let params: any = {policy_id: this.policyId, policy_no: this.policyNo, proposal_no: this.proposalNo};
        let uri = Object.keys(params).map(x => x+'='+encodeURIComponent(params[x])).join('&');
        let policy = await this.insyncService.xreq('/api/v1/policy?' + uri);
        if (!policy) {
            this.loading = false;
            return;
        }

        if (policy.state?.c_ts) {
            policy.state.c_ts_local = moment.utc(policy.state?.c_ts).local().format('YYYY-MM-DD HH:mm:ss');
            policy.state.completed_at_local = policy.state?.completed_at ? moment.utc(policy.state?.completed_at).local().format('YYYY-MM-DD HH:mm:ss') : '';
        }


        if (policy) this.policy = policy;
        let fields = await this.insyncService.xreq('/api/v1/fields?name=policy&policy_id=' + encodeURIComponent(this.policyId));

        if (fields && fields.fields) {
            fields.fields = this._jpath_expand_arrays(policy.policy, fields.fields);
            for (let fld of fields.fields) {
                console.log('load:', fld)
                fld.value = this._jpath_to_value(policy.policy, fld.jpath);
                fld.new_value = '';
            }
            this.fields = fields;
        }
        for (let log of policy.logs||[]) {
            log.u_ts_local = moment.utc(log.u_ts).local().format('YYYY-MM-DD HH:mm:ss.S');
        }
        for (let log of policy.history||[]) {
            log.u_ts_local = moment.utc(log.u_ts).local().format('YYYY-MM-DD HH:mm:ss.S');
        }

        if (policy.rr) {
            this.debug = [];
            for (let mod in policy.rr) {
                this.debug.push({mod, files: Object.keys(policy.rr[mod])});
            }
        }

        let balance: any = {};
        for (let key in policy.attrs||{}) {
            if (key.startsWith('gc_sub_receipt_no-')) balance[key.substring(18)] = {payment_details_id: key.substring(18)};
        }

        for (let bal of policy.balance||[]) {
            if (!balance[bal.payment_details_id]) {console.log('additional payment_details_id found'); balance[bal.payment_details_id] = {};}
            balance[bal.payment_details_id]['u_ts'] = moment.utc(bal.u_ts).local().format('YYYY-MM-DD HH:mm:ss.S');
        }
        this.balance = Object.values(balance);
        this.loading = false;
    }
    async requeue() {
        this.msg = '';
        if (this.policyId) {
            await this.insyncService.xreq('/api/v1/requeue', 'post', {policy_id: this.policyId, name: 'policy'});
            this.msg = 'Policy added to queue';
            this.loadPolicy();
        }
    }
    async OoB() {
        this.msg = '';
        if (this.policyId) {
            await this.insyncService.xreq('/api/v1/oob', 'post', {policy_id: this.policyId, name: 'policy'});
            this.msg = 'Policy added to consumer queue';
            this.loadPolicy();
        }
    }

    async revfeed() {
        this.msg = '';
        if (this.policyId) {
            await this.insyncService.xreq('/api/v1/revfeed', 'post', {policy_id: this.policyId, name: 'policy'});
            this.msg = 'Policy added to reverse feed queue';
        }
    }
    async goBack() {
        this._location.back();
    }
    async viewJson(row: any) {
        let ref = this.dialog.open(JsonViwerDialogComponent, {data: {jdata: row.data}});
    }
    async viewData(row: any) {
        this.dialog.open(JsonViwerDialogComponent, {data: {jdata: row.data}});
    }
    async viewDebugLog(mod: string, file: string) {
        let url = '/api/v1/debug_log?policy_id=' + encodeURIComponent(this.policyId);
        url += '&file=' + encodeURIComponent(file);
        url += '&mod=' + encodeURIComponent(mod);
        let ret = await this.insyncService.xreq(url, 'get');
        if (ret) this.dialog.open(JsonViwerDialogComponent, {data: {jdata: ret.data}});
    }
    async dnldDebugLog(mod: string, file: string) {
        let url = '/api/v1/debug_log?policy_id=' + encodeURIComponent(this.policyId);
        url += '&file=' + encodeURIComponent(file);
        url += '&mod=' + encodeURIComponent(mod);
        let ret = await this.insyncService.xreq(url, 'get');
        if (!ret) return;
        // let blb = new Blob([new Uint8Array(ret.data)]);
        this.insyncService._save_file(ret.data, ret.file);

        // var blb = new Blob([ret.data], { type: 'text/plain'});
        // var link = document.createElement('a');
        // link.download = ret.file;
        // link.href = window.URL.createObjectURL(blb);
        // link.click(); 
    }
    async updateFieldValue(fld: any) {
        let data = {policy_id: this.policyId, name: 'policy', fname: fld.name, value: fld.new_value, jpath: fld.jpath};
        await this.insyncService.xreq('/api/v1/policy/edit', 'post', data);
        this.loadPolicy();
    }
    async saveAttribute() {
        if (!this.attrName || !this.attrValue) return;
        let data = {policy_id: this.policyId, name: 'policy', attr_name: this.attrName, attr_value: this.attrValue};
        await this.insyncService.xreq('/api/v1/attr', 'post', data);
        this.loadPolicy();
    }
    async resetAttribute() {
        if (!this.attrName) return;
        let url = '/api/v1/attr?policy_id=' + encodeURIComponent(this.policyId) + '&name=policy&attr_name=' + encodeURIComponent(this.attrName);
        await this.insyncService.xreq(url, 'delete');
        this.loadPolicy();
    }
}
