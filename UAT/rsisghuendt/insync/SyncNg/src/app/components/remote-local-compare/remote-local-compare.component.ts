import { Component, OnInit, ViewChild } from '@angular/core';
import { InSyncService } from 'src/app/in-sync.service';
import { ActivatedRoute, Router, ParamMap } from "@angular/router";
import { MatTableDataSource} from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import * as moment from 'moment';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-remote-local-compare',
    templateUrl: './remote-local-compare.component.html',
    styleUrls: ['./remote-local-compare.component.scss']
})
export class RemoteLocalCompareComponent implements OnInit {
    @ViewChild(MatPaginator) paginator!: MatPaginator;
    @ViewChild(MatSort) sort!: MatSort;
    rsubscription: Subscription | null = null;

    calstart: Date = new Date();
    dataSource: MatTableDataSource<any[]> = new MatTableDataSource<any[]>([]);
    notdownloaded: any = [];

    coldefs: any = {
        policy_id: {name: 'Policy ID'},
        policy_no: {name: 'Policy NO'},
        issue_date: {name: 'Issue date'},
        local_date: {name: 'Local date'},
        action: {name: 'Action'},
    }
    colnames: string[] = Object.keys(this.coldefs);

    details: any = {
        remoteCount: 0,
        localCount: 0
    };

    constructor(private insyncService: InSyncService, 
        private router: Router,
        private activatedRoute: ActivatedRoute) { 
            this.rsubscription = this.activatedRoute.queryParams.subscribe(params => {
                if (params['date']) {
                    this.calstart = moment(params['date']).toDate();
                    this.changePeriod();
                }
            });
        }

    ngOnInit(): void {
        this.changePeriod();
    }

    ngAfterViewInit() {
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
    }

    __compare(local: any[], remote: any[]) {
        let lmap: any = {};
        for (let i=0; i<local.length; i++) {
            lmap[local[i].policy_id] = local[i];
        }
        this.notdownloaded = [];
        for (let i=0; i<remote.length; i++) {
            if (!lmap[remote[i].policy_id]) {
                let mdt = moment(remote[i].issue_date+'Z', 'YYYY-MM-DD HH:mm:ssZ');
                remote[i].local_date =  mdt.clone().local().format('DD-MM-YYYY HH:mm:ss'); // mdt.tz('Asia/Kolkata').format('DD-MM-YYYY HH:mm:ss');
                remote[i].current = true;
                if (mdt.local().isBefore(moment().add(-3, 'minute'))) remote[i].current = false;
                this.notdownloaded.push(remote[i]);
                console.log('not found', remote[i]);
            }
        }

        this.dataSource = new MatTableDataSource(this.notdownloaded);
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;

        let mdt1 = moment('2022-06-01 10:00:00Z', 'YYYY-MM-DD HH:mm:ssZ');
        console.log(mdt1.local().format('DD-MM-YYYY HH:mm:ss'));


        let rmap: any = {};
        for (let i=0; i<remote.length; i++) {
            rmap[remote[i].policy_id] = remote[i];
        }

        let notinremote = [];
        for (let i=0; i<local.length; i++) {
            if (!rmap[local[i].policy_id]) {
                let mdt = moment(local[i].issue_date+'Z', 'YYYY-MM-DD HH:mm:ssZ');
                local[i].local_date =  mdt.local().format('DD-MM-YYYY HH:mm:ss'); // mdt.tz('Asia/Kolkata').format('DD-MM-YYYY HH:mm:ss');
                notinremote.push(local[i]);
                console.log('not in remote', local[i]);
            }
        }

    }
    async menuClicked(action: any, row: any) {
    }
    async rowClicked(row: any) {
    }

    async changePeriod() {
        let date = moment(this.calstart).format('YYYY-MM-DD');
        let data = await this.insyncService.xreq('/api/v1/compare?name=policy&date=' + encodeURIComponent(date));
        if (!data) return;
        this.details.remoteCount = data.remote.length;
        this.details.localCount = data.local.length;
        this.__compare(data.local, data.remote);
    }
    applyFilter(event: Event) {
        const filterValue = (event.target as HTMLInputElement).value;
        this.dataSource.filter = filterValue.trim().toLowerCase();
        if (this.dataSource.paginator) this.dataSource.paginator.firstPage();
    }

    async updateJson(row: any) {
        await this.insyncService.xreq('/api/v1/updatejson', 'post', {policy_id: row.policy_id, name: 'policy'});
        await this.changePeriod();
    }
}
