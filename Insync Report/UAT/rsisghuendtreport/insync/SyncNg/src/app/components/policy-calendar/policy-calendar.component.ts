import { Component, Input, OnInit, SimpleChange } from '@angular/core';
import { Subscription } from 'rxjs';
import { ActivatedRoute, Router, ParamMap } from "@angular/router";
import { InSyncService } from 'src/app/in-sync.service';
import * as moment from 'moment';

@Component({
    selector: 'policy-calendar',
    templateUrl: './policy-calendar.component.html',
    styleUrls: ['./policy-calendar.component.scss']
})
export class PolicyCalendarComponent implements OnInit {

    @Input() remote: string = '';
    @Input() product: string = '';
    profile: any = null;
    subscription: Subscription | null = null;
    rsubscription: Subscription | null = null;
    year: number = moment().year();
    month: number = moment().month();
    days: any[] = [];
    weekdays: string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    months: string[] = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    total: number = 0;
    cachReload: boolean = false;
    pending: boolean = false;
    refreshtimer: any = null;
    constructor(private insyncService: InSyncService, private router: Router) { }

    ngOnInit(): void {
        this.subscription = this.insyncService.profileSubject.subscribe((profile) => {
            this.profile = profile;
            if (this.profile) this._reload();// this._reload_cache();
        });
        this.rsubscription = this.insyncService.refreshSubject.subscribe((refresh) => {
            console.log('refresh after download');
            // if (this.profile) this._reload();
        });
        this.autoRefresh();
    }
    ngOnDestroy(): void {
        this.subscription?.unsubscribe();
        clearTimeout(this.refreshtimer);
    }

    ngOnChanges(changes: { [propKey: string]: SimpleChange }) {
        if (changes['product']) this._reload();
    }


    autoRefresh() {
        if (this.profile) this._reload();
        this.refreshtimer = setTimeout(() => this.autoRefresh(), 60*1000);
    }


    async _reload_cache() {
        if (this.remote) {
            this.cachReload = true;
            console.log('reloading cache ...', this.year, this.month, this.cachReload);
            let url = '/api/v1/policy/calendar';
            await this.insyncService.xreq(url, 'post', {remote: this.remote, year: this.year, month: this.month});
            await this._reload();
            this.cachReload = false;
        }
    }

    async _reload_local(remote: string, completed: string='') {
        let url = '/api/v1/policy/calendar?year=' + this.year + 
            '&month=' + this.month + 
            '&remote=' + encodeURIComponent(remote) + 
            '&completed=' + encodeURIComponent(completed) +
            '&product=' + encodeURIComponent(this.product);
        let rows = await this.insyncService.xreq(url) || [];
        let start = moment(Date.UTC(+this.year, +this.month, 1));
        let wday = start.weekday();
        
        let days = [];
        for (let i=0; i<wday; i++) days.push({total: '', day: '', local: ''});

        
        let dmap: any = {};
        for (let row of rows) dmap[-1 + +row.mday] = row.total;

        let dcount = start.daysInMonth();
        for (let i=0; i<dcount; i++) days.push({total: dmap[i]||0, day: ''+(i+1), local: 0});

        wday = start.clone().endOf('month').weekday();
        for (let i=wday; i<6; i++) days.push({total: '', day: '', local: ''});

        return days;
    }

    async _reload(){
        this.days = await this._reload_local(this.remote);
        this.total = 0;
        this.days.forEach(x => this.total += x.total ? x.total : 0);
        if (this.remote) {
            let ldays = await this._reload_local('', '1');
            for (let i=0; i<ldays.length; i++) {
                if (this.days[i].day == ldays[i].day) this.days[i].local = ldays[i].total;
            }
        } else {
            for (let i=0; i<this.days.length; i++) this.days[i].local = this.days[i].total;
        }
    }

    async _update() {

    }


    changeyear(inc: number) {
        this.year += inc;
        this._reload();
    }
    changemonth(inc: number) {
        let start = moment(Date.UTC(+this.year, +this.month, 1)).add(inc, 'month');
        this.year = start.year();
        this.month = start.month();
        this._reload();
    }
    showPolicies(day: any) {
        console.log(+this.year, +this.month, +day.day);
        let start = moment(Date.UTC(+this.year, +this.month, +day.day)).startOf('day');
        let end = start.clone().endOf('day');
        let period = start.format('YYYY-MM-DD HH:mm:ss') + ',' + end.format('YYYY-MM-DD HH:mm:ss');
        this.router.navigate(['/policies'], {state: {asd:1}, queryParams: {period, use_issue_date: 1}});
    }
}
