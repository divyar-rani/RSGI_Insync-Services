import { Component, OnInit, Input } from '@angular/core';
import { ActivatedRoute, Router, ParamMap } from "@angular/router";
import { http } from 'src/app/httpng';
import { InSyncService } from 'src/app/in-sync.service';
import { Subscription } from 'rxjs';
import * as moment from 'moment';

@Component({
    selector: 'summary',
    templateUrl: './summary.component.html',
    styleUrls: ['./summary.component.scss']
})
export class SummaryComponent implements OnInit {

    @Input() product: string = '';
    profile: any = null;
    subscription: Subscription | null = null;
    start: string = "";
    queue: any[] = []; //{name: '', ApproximateNumberOfMessages: 0, ApproximateNumberOfMessagesNotVisible: 0};
    summary: any[] = [
        {name: 'downloaded', total: 0, sync_state: 'downloaded'},
        {name: 'queued', total: 0, sync_state: 'queued'},
        {name: 'purgatory', total: 0, sync_state: 'purgatory'},
        {name: 'completed', total: 0, sync_state: 'completed'},
    ];
    refreshtimer: any = null;
    constructor(private insyncService: InSyncService, private router: Router) { }

    ngOnInit(): void {
        this.subscription = this.insyncService.profileSubject.subscribe((profile) => this.profile = profile);
        this.autoRefresh();
    }
    ngOnDestroy(): void {
        this.subscription?.unsubscribe();
        clearTimeout(this.refreshtimer);
    }

    autoRefresh() {
        // this.changePeriod(this.selected);
        this._load_summary();
        this._update_queue_stats();
        this.refreshtimer = setTimeout(() => this.autoRefresh(), 60*1000);
    }
    periodChanged(start: string) {
        this.start = start;
        this._load_summary();
        this._update_queue_stats();
    }

    showDetails(sum: any) {
        if (sum.name == 'purgatory') {
            this.router.navigate(['/purgatory'], { state: {asd:1}});
        } else {
            this.router.navigate(['/policies'], {state: {asd:1}, queryParams: {sync_state: sum.name, period: this.start}});
        }
    }

    async _update_queue_stats() {
        let ret = await http.xreq('/api/v1/queue');
        if (!ret || ret.status !== 0) return;
        this.queue = ret.data;
    }
    
    async _load_summary() {
        let url = '/api/v1/summary?period=' + this.insyncService._period_to_utc(this.start);
        if (this.product) url += '&product=' + encodeURIComponent(this.product);
        let ret = await http.xreq(url);
        if (!ret || ret.status !== 0) return;
        let types = ret.data.map((x: any) => x.sync_state);
        for (let item of this.summary) item.total = 0;
        
        for (let type of types) {
            // console.log(type, this.summary.filter(x => x.sync_state == type));
            if (this.summary.filter(x => x.sync_state == type).length == 0)
                this.summary.push({sync_state: type, total: 0, name: type});
        }
        for (let item of this.summary) {
            for (let sum of ret.data) {
                if (item.name === sum.sync_state) {item.total = sum.total; break;}
            }
        }
    }

}
