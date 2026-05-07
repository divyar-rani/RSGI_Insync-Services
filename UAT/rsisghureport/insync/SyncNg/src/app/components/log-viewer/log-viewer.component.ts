import { Component, OnInit, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { InSyncService } from 'src/app/in-sync.service';
import { ActivatedRoute, Router, ParamMap } from "@angular/router";
import { MatTableDataSource} from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import * as moment from 'moment';


@Component({
    selector: 'app-log-viewer',
    templateUrl: './log-viewer.component.html',
    styleUrls: ['./log-viewer.component.scss']
})
export class LogViewerComponent implements OnInit {
    @ViewChild(MatPaginator) paginator!: MatPaginator;
    @ViewChild(MatSort) sort!: MatSort;
    profile: any = null;
    subscription: Subscription | null = null;
    rsubscription: Subscription | null = null;

    dataSource: MatTableDataSource<any[]> = new MatTableDataSource<any[]>([]);
    start: string = "";
    loading: boolean = false;

    coldefs: any = {
        policy_id: {name: 'Policy ID'},
        type: {name: 'Type'},
        usr_bucket: {name: 'Bucket'},
        mod_name: {name: 'Module'},
        message: {name: 'Message'},
        u_ts_local: {name: 'Timestamp'},
    }
    colnames: string[] = Object.keys(this.coldefs);

    // perioddisp: string[] = [];
    // selected: string = '';
    // calstart: Date = new Date();
    // calend: Date = new Date();
    // period: string[] = ['1h', '6h', '12h', '24h', '2d'];
    filters: any = {};

    period: string = '24h';
    type: string = 'all';
    types: string[] = ['all', 'info', 'error', 'warning', 'db-error', 'data-missing'];

    constructor(private insyncService: InSyncService,
        private router: Router,
        private activatedRoute: ActivatedRoute) {
        
        this.coldefs.u_ts_local.name = 'TS (' + insyncService.zone + ')';
        this.subscription = this.insyncService.profileSubject.subscribe((profile) => this.profile = profile);
        this.rsubscription = this.activatedRoute.queryParams.subscribe(params => {
            let reload = false;
            if (params['period']) {
                this.period = params['period'];
                reload = true;
            }
            if (params['sync_state']) {
                this.filters['sync_state'] = params['sync_state'];
                reload = true;
            }
            this._reload();
        });
    }

    ngOnInit(): void {
    }
    ngOnDestroy(): void {
        this.subscription?.unsubscribe();
        this.rsubscription?.unsubscribe();
    }
    ngAfterViewInit() {
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
    }

    async _reload() {
        this.loading = true;
        let url = '/api/v1/logs?period=' + encodeURIComponent(this.start);
        for (let key in this.filters) url += '&' + key + '=' + encodeURIComponent(this.filters[key]);
        let ret = await this.insyncService.xreq(url);
        for (let row of (ret||[])) {
            if (row.u_ts) row.u_ts_local = moment().utc(row.u_ts).format('YYYY-MM-DD HH:mm:ss.SS');
        }

        this.dataSource = new MatTableDataSource(ret||[]);
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
        this.loading = false;
    }

    async menuClicked(action: any, row: any) {
    }
    async rowClicked(row: any) {
        if (row.policy_id)
            this.router.navigate(['/manage'], {state: {asd:1}, queryParams: {policy_id: row.policy_id}});
    }

    typeChanged() {
        if (this.type == 'all') delete this.filters['type'];
        else this.filters['type'] = this.type;
        this._reload();
    }

    periodChanged(start: string) {
        this.start = start;
        this._reload();
    }

    // changePeriod(period: string) {
    //     if (period == 'start' || period == 'end') {
    //         this.start = moment(this.calstart).format('YYYY-MM-DD HH:00:00') + ',' + moment(this.calend).endOf('day').format('YYYY-MM-DD HH:mm:ss');
    //     } else if (period.endsWith('h')) {
    //         this.start = moment().add(-1*(+period.substring(0, period.length-1)), 'hour').format('YYYY-MM-DD HH:00:00') + ',' + moment().format('YYYY-MM-DD HH:mm:00');
    //     } else if (period.endsWith('d')) {
    //         this.start = moment().add(-1*(+period.substring(0, period.length-1)), 'day').format('YYYY-MM-DD 00:00:00') + ',' + moment().format('YYYY-MM-DD HH:mm:00');
    //     }
    //     this.selected = period;
    //     this.perioddisp = this.start.split(',');
    //     this._reload();
    // }

    applyFilter(event: Event) {
        const filterValue = (event.target as HTMLInputElement).value;
        this.dataSource.filter = filterValue.trim().toLowerCase();
        if (this.dataSource.paginator) {
          this.dataSource.paginator.firstPage();
        }
    }

}
