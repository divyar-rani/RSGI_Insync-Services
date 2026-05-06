import { Component, OnInit, ViewChild } from '@angular/core';
import { InSyncService } from 'src/app/in-sync.service';
import { Subscription } from 'rxjs';
import { http } from 'src/app/httpng';
import { MatTableDataSource} from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';

@Component({
    selector: 'app-purgatory',
    templateUrl: './purgatory.component.html',
    styleUrls: ['./purgatory.component.scss']
})
export class PurgatoryComponent implements OnInit {
    @ViewChild(MatPaginator) paginator!: MatPaginator;
    @ViewChild(MatSort) sort!: MatSort;

    start: string = "";
    profile: any = null;
    subscription: Subscription | null = null;
    dataSource: MatTableDataSource<any[]> = new MatTableDataSource<any[]>([]);
    coldefs: any[] = [
        {name: 'Name', disp: 'def_name', type: '' },
        {name: 'PolicyID', disp: 'policy_id', type: '' },
        {name: 'Cause', disp: 'cause', type: '' },
        {name: 'Reason', disp: 'reason', type: '' },
        {name: 'Status', disp: 'status', type: '' },
        {name: 'CTS', disp: 'c_ts', type: '' }
    ];
    colnames: string[] = ['def_name', 'policy_id', 'cause', 'reason', 'status', 'c_ts'];

    constructor(private inSyncService: InSyncService) { }

    ngOnInit(): void {
        this.subscription = this.inSyncService.profileSubject.subscribe((profile) => {
            this.profile = profile;
            this._reload();
        });
    }

    ngOnDestroy(): void {
        this.subscription?.unsubscribe();
    }

    ngAfterViewInit() {
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
    }

    async _reload() {
        if (!this.profile) return;
        let ret = await http.xreq('/api/v1/purgatory?period=' + encodeURIComponent(this.start));
        if (!ret || ret.status !== 0) return;
        this.dataSource = ret.data;
    }

    async menuClicked(action: any, row: any) {
    }
    async rowClicked(row: any) {
    }
}
