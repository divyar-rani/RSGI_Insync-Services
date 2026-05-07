import { Component, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { InSyncService } from 'src/app/in-sync.service';
import { ActivatedRoute, Router, ParamMap } from "@angular/router";

@Component({
    selector: 'app-bucket-log-viewer',
    templateUrl: './bucket-log-viewer.component.html',
    styleUrls: ['./bucket-log-viewer.component.scss']
})
export class BucketLogViewerComponent implements OnInit {

    profile: any = null;
    subscription: Subscription | null = null;
    rsubscription: Subscription | null = null;
    start: string = '';
    period: string = '24h';
    loading: boolean = false;
    summary: any[] = [];

    constructor(private insyncService: InSyncService,
        private router: Router,
        private activatedRoute: ActivatedRoute) {
            this.subscription = this.insyncService.profileSubject.subscribe((profile) => this.profile = profile);
            this.rsubscription = this.activatedRoute.queryParams.subscribe(params => {
                if (params['period']) this.period = params['period'];
                this._reload();
            });
    }

    ngOnInit(): void {
    }

    pivot(rows: any[], column: string, row: string, val: string) {
        let names: any = {};
        rows.forEach(x => names[x[column]]=1);
        let columns = Object.keys(names);
        let ret: any = {'': [row, ...columns]};
        let total: any[] = ['Total', ...new Array(columns.length).fill(0)];
        for (let r of rows) {
            let col = 1+columns.indexOf(r[column]);
            if (!ret[r[row]]) ret[r[row]] = [r[row], ...new Array(columns.length).fill(0)];
            ret[r[row]][col] = r[val];
            total[col] += r[val];
        }
        ret['total'] = total;
        return Object.values(ret);
    }

    async _reload() {
        if (!this.profile) return;
        this.loading = true;
        let url = '/api/v1/summary?field=usr_bucket&period=' + encodeURIComponent(this.start)+'&groupby=product_name';
        let rows = await this.insyncService.xreq(url);
        if (rows) this.summary = this.pivot(rows, 'usr_bucket', 'product_name', 'total');
        this.loading = false;
    }
    async periodChanged(start: string) {
        this.start = start;
        await this._reload();
    }

    goto(r: number, c:number) {
        // console.log(this.summary[r][0], this.summary[0][c]);
        let params: any = {usr_bucket: this.summary[0][c], period: this.start};
        if (this.summary[r][0] != 'Total') params.product_name = this.summary[r][0];
        this.router.navigate(['/policies'], {state: {asd:1}, queryParams: params});
    }

}
