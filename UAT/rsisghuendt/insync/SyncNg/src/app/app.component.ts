import { Component } from '@angular/core';
import { Subscription } from 'rxjs';
import { InSyncService } from './in-sync.service';
import { environment } from './../environments/environment';
import { Router, NavigationEnd, ActivationEnd } from '@angular/router';


@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss']
})
export class AppComponent {
    title = 'SyncNg';
    profile: any = null;
    version: string = environment.version;
    user: string = '';
    pwd: string = '';
    subscription: Subscription | null = null;
    rsubscription: Subscription | null = null;
    paused: boolean = false;

    product: string = '';
    products: {product_id: string, product_name: string}[] = [{product_id: '', product_name: "All products"}];
    filterProduct: boolean = false;

    constructor(private insync: InSyncService, private router: Router) {
        this.subscription = this.insync.profileSubject.subscribe((profile) => {this.profile = profile; this.products = this.insync.products;});
        this.load_profile();
        this.checkStatus();
        setInterval(() => this.checkStatus(), 60*1000);
        this.rsubscription = this.router.events.subscribe((event:any) => {
            if (event instanceof ActivationEnd && event.snapshot?.data) {
                this.filterProduct = (event.snapshot?.data?.['filterProduct']) ? true : false;
            }
        });
    }

    async load_profile() {
        this.profile = await this.insync.loadprofile();
        this.products = this.insync.products;
    }

    async productChanged() {
        this.insync.productSubject.next(this.product)
    }

    async logout() {
        await this.insync.logout();
        this.profile = null;
    }

    async authenticate() {
        if (!this.user || !this.pwd) return;
        this.profile = await this.insync.authenticate(this.user, this.pwd);
        if (!this.profile) this.profile = null;
    }

    async resume() {
        await this.insync.resume();
        this.paused = await this.insync.runStatus();
    }

    async pause() {
        await this.insync.pause();
        this.paused = await this.insync.runStatus();
    }

    async checkStatus() {
        this.paused = await this.insync.runStatus();
    }
}
