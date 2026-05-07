import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, ParamMap } from "@angular/router";
import { InSyncService } from 'src/app/in-sync.service';
import { Subscription } from 'rxjs';
import {Clipboard} from '@angular/cdk/clipboard';
import * as moment from 'moment';

@Component({
    selector: 'app-summary-report',
    templateUrl: './summary-report.component.html',
    styleUrls: ['./summary-report.component.scss']
})
export class SummaryReportComponent implements OnInit {

    profile: any = null;
    subscription: Subscription | null = null;
    start: string = moment().startOf('day').format('YYYY-MM-DD HH:mm:ss')+','+moment().endOf('day').format('YYYY-MM-DD HH:mm:ss');
    summary: any[] = [];
    paid: any[] = [];
    loading: boolean = false;

    completed: any[] = [];
    pending: any[] = [];
    counts: any = {completed: 0, pending: 0};
    autoRefresh: boolean = false;
    refreshTimer: any = null;
    showAll: boolean = false;

    constructor(private insyncService: InSyncService, 
        private router: Router,
        private clipboard: Clipboard) { }

    ngOnInit(): void {
        this.subscription = this.insyncService.profileSubject.subscribe((profile) => {
            this.profile = profile;
            this._load_summary();
            this._load_tat();
            this._load_payment_summary();
        });
    }
    ngOnDestroy(): void {
        this.subscription?.unsubscribe();
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        this.refreshTimer = null;
    }

    order_columns(columns: string[]): string[] {
        let cidx = columns.indexOf('completed');
        if (cidx >= 0) {columns.splice(cidx, 1);}
        columns.push('completed');
        return columns;
    }

    pivot(rows: any[], column: string, row: string, val: string) {
        let names: any = {};
        rows.forEach(x => names[x[column]]=1);
        let columns = this.order_columns(Object.keys(names));
        let ret: any = {}; //{'': [row, ...columns]};
        
        let ignore = ['skipped', 'name-map', 'ignored'];
        if (!this.showAll) {
            for (let ig of ignore) {
                let idx = columns.indexOf(ig);
                if (idx >= 0) columns.splice(idx, 1);
            }
        }
        let total: any[] = ['Total', ...new Array(columns.length).fill(0)];
        for (let r of rows) {
            if (!this.showAll && ignore.includes(r[column].toLowerCase())) continue;
            let col = 1+columns.indexOf(r[column]);
            if (!ret[r[row]]) ret[r[row]] = [r[row], ...new Array(columns.length).fill(0)];
            ret[r[row]][col] = r[val];
            total[col] += r[val];
        }
        let vals = Object.values(ret).sort((x: any, y: any) => x[0] < y[0] ? -1 : +1);
        vals.unshift([row, ...columns]);
        vals.push(total);
        return vals;
        // ret['total'] = total;
        // return Object.values(ret);
    }

    async _load_summary() {
        if (!this.profile) return;
        
        this.loading = true;
        // let url = '/api/v1/summary?period=' + encodeURIComponent(this.start)+'&groupby=product_name';
        let url = '/api/v1/summary?period=' + this.insyncService._period_to_utc(this.start)+'&groupby=product_name';
        let rows = await this.insyncService.xreq(url) || [];
        this.summary = this.pivot(rows, 'sync_state', 'product_name', 'total');
        this.loading = false;
    }

    async toggleShow() {
        this.showAll = !this.showAll;
        await this._load_summary();
    }

    async periodChanged(start: string) {
        this.start = start;
        await this._load_summary();
        await this._load_tat();
        await this._load_payment_summary();
    }
    goto(r: number, c:number) {
        // console.log(this.summary[r][0], this.summary[0][c]);
        let params: any = {sync_state: this.summary[0][c], period: this.start, use_issue_date: 1};
        if (this.summary[r][0] != 'Total') params.product_name = this.summary[r][0];
        this.router.navigate(['/policies'], {state: {asd:1}, queryParams: params});
    }
    copyReportToClipboard() {
        var urlField: any = document.querySelector('table');
        let html = `<div><style type="text/css" scoped>.summary-table{width: 100%; border-collapse: collapse;}
        .summary-table td {padding: .6em 1em; text-align: right;}
        .summary-table > tr:last-child { background:#EEE; font-weight: bold;}
        .prod-cell {text-align: left !important;}
        </style>` + urlField.outerHTML+"</div>";
        html = html.replace(/<!--[\s\S]*?-->/g, "");
        const pending = this.clipboard.beginCopy(html);
        let remainingAttempts = 3;
        const attempt = () => {
          const result = pending.copy();
            if (!result && --remainingAttempts) setTimeout(attempt);
            else pending.destroy(); // Remember to destroy when you're done!
        };
        attempt();
    }

    _percentile(arr: number[], perc: number) {
        if (arr.length <= 1) return 0;
        perc = perc > 100 ? 100 : (perc < 0 ? 0 : perc);
        let N = (arr.length-1) * perc / 100;
        let RN = Math.floor(N);
        if (arr[RN+1] !== undefined) return arr[RN] + (arr[RN+1] - arr[RN]) * (N-RN);
        return arr[RN];
    }

    _percentile_counter(arr: number[], perc: number, rev: boolean = false) {
        let value = this._percentile(arr, perc);
        let count = 0;
        if (rev) {
            for (let i=0; i<arr.length; i++) {
                if (arr[i] >= value) count ++;
            }
        } else {
            for (let i=0; i<arr.length; i++) {
                if (arr[i] < value) count ++;
            }
        }
        
        return {count, value, fvalue: this._format(value)};
    }

    _format(diff: number) {
        let mdiff = moment.utc(diff);
        if (diff > 24*60*60*1000)
            return mdiff.format('D') + 'd ' + mdiff.format('HH')+'h '/* + mdiff.format('mm')+' minutes'*/;
        if (diff >= 2*60*60*1000)
            return mdiff.format('H')+'h ' + mdiff.format('mm')+'m';
        if (diff >= 2*60*1000)
            return (diff/60/1000).toFixed(0) +'m' /* + mdiff.format('ss') + ' seconds'*/;
        return (diff/1000).toFixed(0) + 's';
    }

    async _load_tat() {
        if (!this.profile) return;
        
        this.loading = true;
        let url = '/api/v1/policies?period=' + this.insyncService._period_to_utc(this.start) + '&groupby=product_name&use_issue_date=1';
        let rows = await this.insyncService.xreq(url) || [];
        let ctats:number[] = [];
        let otats:number[] = [];

        this.completed = [];
        this.pending = [];

        if (rows.length >= 5) {
            for (let row of rows) {
                if (row.sync_state == 'completed') {
                    ctats.push(moment(row.completed_at).diff(moment(row.issue_date)))
                } else if (row.sync_state != 'skipped') {
                    otats.push(moment().diff(moment(row.issue_date)));
                }
            }

            ctats.sort((a, b) => a-b);
            // this.completed = [90, 75, 50, 25, 10].map(x => {return {desc: x+'%', tat: this._format(this._percentile(ctats, x))}});
            this.completed = [90, 75, 50, 25, 10].map(x => {return {desc: x+'%', ...this._percentile_counter(ctats, x)}});

            otats.sort((a, b) => a-b);
            this.pending = [90, 75, 50, 25, 10].map(x => {return {desc: (100-x)+'%', ...this._percentile_counter(otats, x, true)}});
        }

        this.counts.completed = ctats.length;
        this.counts.pending = otats.length;

        this.loading = false;
    }

    async _load_payment_summary() {
        if (!this.profile) return;
        this.loading = true;
        let url = '/api/v1/payment_summary?period=' + this.insyncService._period_to_utc(this.start) + '&groupby=is_policy_payment.product_name';
        let rows = await this.insyncService.xreq(url);
        if (rows) this.paid = this.pivot(rows, 'sync_state', 'product_name', 'total');
        this.loading = false;
    }

    async toggleRefresh() {
        this.autoRefresh = !this.autoRefresh;

        if (this.autoRefresh) {
            if (!this.refreshTimer) this.refreshTimer = setInterval(() => {this._load_summary(); this._load_tat()}, 60*1000);
        } else {
            if (this.refreshTimer) clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
    }
}
