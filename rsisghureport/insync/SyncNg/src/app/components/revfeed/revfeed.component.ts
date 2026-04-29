import { Component, OnInit, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { InSyncService } from 'src/app/in-sync.service';
import { ActivatedRoute, Router, ParamMap } from "@angular/router";
import { MatTableDataSource} from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import * as moment from 'moment';

@Component({
    selector: 'app-revfeed',
    templateUrl: './revfeed.component.html',
    styleUrls: ['./revfeed.component.scss']
})
export class RevfeedComponent implements OnInit {
    @ViewChild(MatPaginator) paginator!: MatPaginator;
    @ViewChild(MatSort) sort!: MatSort;

    start: string = "";
    profile: any = null;
    subscription: Subscription | null = null;
    loading: boolean = false;

    data: any[] = [];
    dataSource: MatTableDataSource<any[]> = new MatTableDataSource<any[]>([]);
    coldefs: any = {
        policy_id: {name: 'Policy ID'},
        policy_no: {name: 'Policy NO'},
        sync_state: {name: 'State'},
        product_name: {name: 'Product'},
        issue_date_local: {name: 'Issue date'},
        completed_at: {name: 'Completed at'},
        last_update: {name: 'Revfeed'},
    }
    dcolumns: string[] = ['select', ...Object.keys(this.coldefs)];
    colnames: string[] = Object.keys(this.coldefs);
    selected: boolean[] = [];
    allSelected: boolean = false;
    noneSelected: boolean = true;
    selCount: number = 0;

    msg: string = '';
    constructor(private insyncService: InSyncService,
        private router: Router) {
            this.subscription = this.insyncService.profileSubject.subscribe((profile) => {
                this.profile = profile;
                this._reload();
            });
        }

    ngOnInit(): void {
    }

    ngOnDestroy(): void {
        this.subscription?.unsubscribe();
    }
    ngAfterViewInit() {
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
    }

    periodChanged(start: string) {
        this.start = start;
        this._reload();
    }
    async rowClicked(row: any) {
        this.router.navigate(['/manage'], {state: {asd:1}, queryParams: {policy_id: row.policy_id}});
    }

    async _reload() {
        this.loading = true;
        let url = '/api/v1/revfeed?period=' + this.insyncService._period_to_utc(this.start)+'&completed=1';
        let ret = await this.insyncService.xreq(url);

        this.data = ret||[];
        // for (let row of this.data) {
        for (let r=0; r<this.data.length; r++) {
            let row = this.data[r];
            row.index = r;
            if (row.u_ts) row.u_ts_local = moment.utc(row.u_ts).local().format('YYYY-MM-DD HH:mm:ss');
            if (row.issue_date) row.issue_date_local = moment.utc(row.issue_date).local().format('YYYY-MM-DD HH:mm:ss');
        }
        this.selected = this.data.map((x: any) => false);
        this.dataSource = new MatTableDataSource(this.data);
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
        this.loading = false;
    }

    toggleSelected(row: number) {
        if (this.selected.length > row) this.selected[row] = !this.selected[row];
        let unselected = this.selected.filter(x => !x);
        this.allSelected =  (unselected.length == 0);
        console.log('selected:', row, this.selected);
        this.noneSelected = unselected.length == this.selected.length;
        this.selCount = this.selected.filter(x => x).length;
    }

    selectAll() {
        this.allSelected = !this.allSelected;
        for (let i=0; i<this.selected.length; i++) this.selected[i] = this.allSelected;
        this.noneSelected = !this.allSelected;
        this.selCount = this.selected.filter(x => x).length;
    }

    async revfeed() {
        let pids = this.selected.map((x, i) => x ? this.data[i]['policy_id'] : undefined).filter(Boolean);
        this.msg = 'Adding ' + pids.length + ' policies';
        for (let pid of pids) {
            await this.insyncService.xreq('/api/v1/revfeed', 'post', {policy_id: pid, name: 'policy'});
            this.msg += ' ' + pid + ',';
        }
    }
}
