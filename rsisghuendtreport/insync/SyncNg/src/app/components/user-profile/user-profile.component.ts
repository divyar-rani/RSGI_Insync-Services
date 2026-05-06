import { Component, OnInit } from '@angular/core';
import { InSyncService } from 'src/app/in-sync.service';

@Component({
    selector: 'app-user-profile',
    templateUrl: './user-profile.component.html',
    styleUrls: ['./user-profile.component.scss']
})
export class UserProfileComponent implements OnInit {

    opwd: string = '';
    npwd: string = '';
    msg: string = '';
    constructor(private insyncService: InSyncService) { }

    ngOnInit(): void {
    }

    async changePassword() {
        this.msg = '';
        let ret = await this.insyncService.xreq('/api/v1/auth/change_password', 'post', {opwd: this.opwd, npwd: this.npwd});
        this.msg = ret ? ret : 'failed';
    }
}
