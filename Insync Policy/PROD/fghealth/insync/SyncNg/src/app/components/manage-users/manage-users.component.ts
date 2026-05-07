import { Component, OnInit, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { InSyncService } from 'src/app/in-sync.service';
import { ActivatedRoute, Router, ParamMap } from "@angular/router";
import { MatTableDataSource} from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import * as moment from 'moment';

@Component({
    selector: 'app-manage-users',
    templateUrl: './manage-users.component.html',
    styleUrls: ['./manage-users.component.scss']
})
export class ManageUsersComponent implements OnInit {
    @ViewChild(MatPaginator) paginator!: MatPaginator;
    @ViewChild(MatSort) sort!: MatSort;

    profile: any = null;
    subscription: Subscription | null = null;
    dataSource: MatTableDataSource<any[]> = new MatTableDataSource<any[]>([]);
    coldefs: any = {
        email: {name: 'User name'},
        status: {name: 'Status'},
        c_ts_local: {name: 'Timestamp'},
        action: {name: 'Action'}
    }
    dcolumns: string[] = [...Object.keys(this.coldefs)];
    colnames: string[] = Object.keys(this.coldefs);

    name: string = '';
    password: string = '';
    msg: string = '';

    constructor(private insyncService: InSyncService,
        private router: Router) {
            this.subscription = this.insyncService.profileSubject.subscribe((profile) => {
                this.profile = profile;
                if (this.profile) this._reload();
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

    __set_data(rows: any[]) {
        if (!rows) return;
        for (let row of rows) {
            if (row.status == 0) row.action = "Disable User";
            else row.action = "Enable User";
            row.c_ts_local = moment.utc(row.c_ts).local().format('YYYY-MM-DD HH:mm:ss.S');
        }

        this.dataSource = new MatTableDataSource(rows);
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;

    }

    async _reload() {
        let ret = await this.insyncService.xreq('/api/v1/users');
        this.__set_data(ret);
    }
    async rowClicked(row: any, col: any) {
        if (col == 'action') {
            let ret = await this.insyncService.xreq('/api/v1/user/status', 'post', {email: row.email, status: row.status==0?1:0});
            this.__set_data(ret);
        }
        // this.router.navigate(['/manage'], {state: {asd:1}, queryParams: {policy_id: row.policy_id}});
    }

    async addUser() {
        this.msg = '';
        if (!this.name || !this.password) return;
        let ret = await this.insyncService.xreq('/api/v1/auth/add', 'post', {email: this.name, password: this.password});
        
        if (ret) {this.name = ''; this.password=''; this.msg = 'user added';}
        else {this.msg = 'failed to add user'; alert('failed to add user');}
        await this._reload();
    }
}
