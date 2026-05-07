import { Component, OnInit, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { InSyncService } from 'src/app/in-sync.service';
import { ActivatedRoute, Router, ParamMap } from "@angular/router";
import { MatTableDataSource} from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatDialog } from '@angular/material/dialog';
import { RequeMultipleDialogComponent } from './reque-multiple-dialog/reque-multiple-dialog.component';
import * as moment from 'moment';


@Component({
    selector: 'app-state-list',
    templateUrl: './state-list.component.html',
    styleUrls: ['./state-list.component.scss']
})
export class StateListComponent implements OnInit {
    @ViewChild(MatPaginator) paginator!: MatPaginator;
    @ViewChild(MatSort) sort!: MatSort;

    profile: any = null;
    subscription: Subscription | null = null;
    rsubscription: Subscription | null = null;

    data: any[] = [];
    dataSource: MatTableDataSource<any[]> = new MatTableDataSource<any[]>([]);
    selected: boolean[] = [];
    allSelected: boolean = false;
    noneSelected: boolean = true;
    start: string = "";
    use_issue_date: string = "";
    loading: boolean = false;
    attributes: boolean = false;

    coldefs: any = {
        policy_id: {name: 'Policy ID'},
        policy_no: {name: 'Policy NO'},
        proposal_no: {name: 'proposal_no'},
        sync_state: {name: 'State'},
        product_name: {name: 'Product'},
        cust1: {name: 'Field 1'},
        cust2: {name: 'Field 2'},
        cust3: {name: 'Field 3'},
        cust4: {name: 'Field 4'},
        cust5: {name: 'Field 5'},
        issue_date_local: {name: 'Issue date'},
        // message_id: {name: 'Message ID'},
        usr_bucket: {name: 'Assigned to'},
        completed_at_local: {name: 'Completed at'},
        c_ts_local: {name: 'Timestamp'},
        attr: {name: "Attributes"}
    }
    dcolumns: string[] = ['select', ...Object.keys(this.coldefs)];
    colnames: string[] = Object.keys(this.coldefs);

    period: string = '';
    filters: any = {};

    constructor(private insyncService: InSyncService,
        private router: Router,
        public dialog: MatDialog,
        private activatedRoute: ActivatedRoute) {
            this.subscription = this.insyncService.profileSubject.subscribe((profile) => {this.profile = profile;});
            this.rsubscription = this.activatedRoute.queryParams.subscribe(params => {
                let reload = false;
                if (params['use_issue_date']) {
                    this.use_issue_date = params['use_issue_date'];
                }
                if (params['period']) {
                    this.period = params['period'];
                    this.start = this.period;
                    reload = true;
                }
                if (params['sync_state']) {
                    this.filters['sync_state'] = params['sync_state'];
                    reload = true;
                }
                if (params['product_name']) {
                    this.filters['product_name'] = params['product_name'];
                    reload = true;
                }
                if (params['usr_bucket']) {
                    this.filters['usr_bucket'] = params['usr_bucket'];
                    reload = true;
                }
                if (reload) this._reload();
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
        let url = '/api/v1/policies?period=' + this.insyncService._period_to_utc(this.start);
        for (let key in this.filters) url += '&' + key + '=' + encodeURIComponent(this.filters[key]);
        if (this.use_issue_date) url += "&use_issue_date=1";
        if (this.attributes) url += "&with_attr=1";
        let ret = await this.insyncService.xreq(url);

        this.data = ret||[];
        // for (let row of this.data) {
        for (let r=0; r<this.data.length; r++) {
            let row = this.data[r];
            row.index = r;
            if (row.c_ts) row.c_ts_local = moment.utc(row.c_ts).local().format('YYYY-MM-DD HH:mm:ss');
            if (row.issue_date) row.issue_date_local = moment.utc(row.issue_date).local().format('YYYY-MM-DD HH:mm:ss');
            if (row.completed_at) row.completed_at_local = row.completed_at ? moment.utc(row.completed_at).local().format('YYYY-MM-DD HH:mm:ss') : '';
        }

        this.selected = this.data.map((x: any) => false);
        this.dataSource = new MatTableDataSource(this.data);
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
        this.loading = false;
    }
    async menuClicked(action: any, row: any) {
    }
    async rowClicked(row: any) {
        this.router.navigate(['/manage'], {state: {asd:1}, queryParams: {policy_id: row.policy_id}});
    }

    periodChanged(start: string) {
        this.start = start;
        this._reload();
    }

    toggleAttributes() {
        this.attributes = !this.attributes;
        this._reload();
    }

    applyFilter(event: Event) {
        const filterValue = (event.target as HTMLInputElement).value;
        this.dataSource.filter = filterValue.trim().toLowerCase();
        if (this.dataSource.paginator) this.dataSource.paginator.firstPage();
    }

    toggleSelected(row: number) {
        if (this.selected.length > row) this.selected[row] = !this.selected[row];
        let unselected = this.selected.filter(x => !x);
        this.allSelected =  (unselected.length == 0);
        this.noneSelected = unselected.length == this.selected.length;
    }

    selectAll() {
        this.allSelected = !this.allSelected;
        for (let i=0; i<this.selected.length; i++) this.selected[i] = this.allSelected;
        this.noneSelected = !this.allSelected;
    }

    requeue() {
        let pids = this.selected.map((x, i) => x ? this.data[i]['policy_id'] : undefined).filter(Boolean);
        let ref = this.dialog.open(RequeMultipleDialogComponent, {data: {pids}});
    }

    _tat(row: any) {
        if (row.sync_state.startsWith('skip')) return '';
        if (row.sync_state == 'completed')
            return (moment(row.completed_at).diff(moment(row.issue_date)) / 1000).toFixed(0);
        return (moment().diff(moment(row.issue_date)) / 1000).toFixed(0);
    }

    exportCSV() {
        let data: any[] = this.dataSource.filteredData;
        let keys = Object.keys(this.coldefs);
        let arr: any[] = [keys.map(x => this.coldefs[x].name).concat('TAT (seconds)')];
        arr.push(...data.map(x => keys.map(c => (x[c]||'').replace(/\"/g, '""').replace(/\r?\n|\r/g, '')).concat(this._tat(x))));
        let csv = arr.map(x => '"'+x.join('","')+'"').join('\n');
        this.insyncService._save_file(csv, 'policy-status.csv');
    }
}
