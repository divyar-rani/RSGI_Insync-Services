import { Injectable } from '@angular/core';
import { http } from './httpng';
import { md5 } from './md5';
import { BehaviorSubject, Subject, retry, RetryConfig } from 'rxjs';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import * as moment from 'moment';

@Injectable({
    providedIn: 'root'
})
export class InSyncService {
    profile: any = null;
    paused: boolean = false;
    profileSubject = new BehaviorSubject<any|null>(null);
    wsConnection: WebSocketSubject<any> | null = null;
    activities = new BehaviorSubject<any>(null);
    refreshSubject = new Subject<boolean>();
    zone = new Date().toLocaleTimeString('en-us',{timeZoneName:'short'}).split(' ')[2];

    // product: string = '';
    products: {product_id: string, product_name: string}[] = [{product_id: '', product_name: "All products"}];
    productSubject = new BehaviorSubject<string>('');

    constructor() {}

    async xreq(url: string, method?: string, data?: any) {
        try {
            let ret = await http.xreq(url, method, data);
            if (ret.status == 0) return ret.data;
            console.log('url: failed', ret.status, ret.txt);
        } catch (e: any) {
            console.log('url: failed', url, e);
            if ((e.message+'').indexOf('404')>=0) return;
            console.log('url: restting profile', url, e.message, e.message.indexOf('404'));
            this.profile = null;
            this.profileSubject.next(this.profile);
        }
        return null;
    }

    async authenticate(user: string, pass: string) {
        this.profile = await this.xreq('/api/v1/auth', 'post', {email: user, mpwd: md5(pass)});
        this.profileSubject.next(this.profile);
        if (this.profile) this.wsConnect();
        if (this.products.length <= 1) await this.load_products();
        return this.profile;
    }

    async loadprofile() {
        this.profile = await this.xreq('/api/v1/auth');
        this.profileSubject.next(this.profile);
        if (this.profile) this.wsConnect();
        if (this.products.length <= 1) await this.load_products();
        return this.profile;
    }

    async load_products() {
        if (!this.profile) return;
        let ret = await this.xreq('/api/v1/config?name=policy');
        this.products = ret.products;
        this.products.unshift({product_id: '', product_name: "All products"});
    }


    async runStatus() {
        let ret = await this.xreq('/api/v1/auth/pause');
        this.paused = ret ? true : false;
        return this.paused;
    }

    async pause() {
        let ret = await this.xreq('/api/v1/auth/pause', 'POST', {});
        this.paused = ret ? true : false;
        return this.paused;
    }

    async resume() {
        let ret = await this.xreq('/api/v1/auth/resume', 'POST', {});
        this.paused = ret ? true : false;
        return this.paused;
    }

    async logout() {
        http.clearToken();
    }

	wsURL() {
        // return "https://sellis.cloware.in/ws"
		const url = document.createElement('a');
		url.setAttribute('href', window.location.href);
		return (url.protocol == 'https:'?'wss://':'ws://')+ url.hostname + (+url.port > 0 ? (':' + url.port) : '')+'/ws';
        // return 'ws://127.0.0.1:8097/ws';
	}

    handle_ws_message(msg: any) {
        if (!msg) return;
        if (!(msg instanceof Array)) msg = [msg];
        for (let m of msg) {
            // console.log('msg:', m.message);
            if (m.message?.indexOf('completed bacth (') >= 0) {
                this.refreshSubject.next(true);
                break;
            }
        }
        this.activities.next(msg);
    }

	wsConnect() {
        if (this.wsConnection) return; // already connected
        console.log('ws:', this.wsURL());
        this.wsConnection = webSocket(this.wsURL());
        const retryConfig: RetryConfig = {delay: 3000};
        this.wsConnection.pipe(retry(retryConfig)).subscribe({
            next: (message: string) => this.handle_ws_message(message),
            error: (error: Error) => {
                const { message } = error
                console.log('ws-error:', message, error);
            },
            complete: () => {console.log('ws: completed, unsubscribing'); this.wsConnection?.unsubscribe(); this.wsConnection = null;}
        });
	}

    _period_to_utc(str: string) {
        let parts = str.split(',');
        if (parts.length == 1) return encodeURIComponent(parts[0]);
        console.log('period:', str, '=>', moment(parts[0]).utc().format('YYYY-MM-DD HH:mm:00'), moment(parts[1]).utc().format('YYYY-MM-DD HH:mm:00'));
        return encodeURIComponent(moment(parts[0]).utc().format('YYYY-MM-DD HH:mm:ss')+','+
            moment(parts[1]).utc().format('YYYY-MM-DD HH:mm:ss'));
    }

    _save_file(content: any, name: string, type?: string) {
        type = type || 'text/plain';
        var blb = new Blob([content], {type});
        var link = document.createElement('a');
        link.download = name || 'insync';
        link.href = window.URL.createObjectURL(blb);
        link.click(); 
    }

}
