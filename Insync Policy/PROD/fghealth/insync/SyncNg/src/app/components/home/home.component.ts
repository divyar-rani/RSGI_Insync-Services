import { Component, OnInit, Input, SimpleChange } from '@angular/core';
import { InSyncService } from 'src/app/in-sync.service';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {

    product: string = '';
    profile: any = null;
    subscription: Subscription | null = null;
    psubscription: Subscription | null = null;
    constructor(private inSyncService: InSyncService) { }

    ngOnInit(): void {
        this.subscription = this.inSyncService.profileSubject.subscribe((profile) => {
            this.profile = profile;
        });
        this.psubscription = this.inSyncService.productSubject.subscribe((prodId) => this.product = prodId);
    }

    ngOnDestroy(): void {
        this.subscription?.unsubscribe();
        this.psubscription?.unsubscribe();
    }
}
