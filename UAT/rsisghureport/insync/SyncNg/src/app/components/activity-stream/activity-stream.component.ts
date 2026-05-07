import { Component, OnInit } from '@angular/core';
import { InSyncService } from 'src/app/in-sync.service';
import { Subscription } from 'rxjs';
import * as moment from 'moment';
import {Clipboard} from '@angular/cdk/clipboard';

@Component({
    selector: 'activity-stream',
    templateUrl: './activity-stream.component.html',
    styleUrls: ['./activity-stream.component.scss']
})
export class ActivityStreamComponent implements OnInit {

    asubscription: Subscription | null = null;
    messages: any[] = [];

    constructor(private insync: InSyncService, private clipboard: Clipboard) {
        this.asubscription = this.insync.activities.subscribe((msg) => this._add_message(msg));
    }

    ngOnInit(): void {
    }
    
    ngOnDestroy(): void {
        this.asubscription?.unsubscribe();
    }

    _colourise(str: string) {
        if (str.match(/completed-P/)) return 'green';
        if (str.match(/(.)(_no found )(\d+)\-P(\d+)/)) return 'dark-green';
        if (str.match(/(.)(_no not found )(\d+)\-P(\d+)/)) return 'red';
        if (str.match(/(.)(derived )(\d+)\-P(\d+)/)) return 'orange';
        if (str.match(/rescheduled-P\d+/)) return 'purple';

        // str = str.replace(/completed-P/, '<span class="green">completed-P</span>');
        // str = str.replace(/(.)(_no found )(\d+)\-(\d+)/, '<span class="dark-green">$1$2$3-$4</span>');
        // str = str.replace(/(.)(_no not found )(\d+)\-(\d+)/, '<span class="red">$1$2$3-$4</span>');
        // str = str.replace(/(.)(derived )(\d+)\-(\d+)/, '<span class="orange">$1$2$3-$4</span>');
        return "none";
    }

    async _add_message(msg: any) {
        if (!msg) return;
        if (!(msg instanceof Array)) msg = [msg];
        for (let m of msg) {
            if (typeof m === 'string') m = JSON.parse(m);
            m.time = moment(m.time).format('YYYY-MM-DD HH:mm:ss');
            m.color = this._colourise(m.message||'');
            this.messages.unshift(m);
            if (this.messages.length > 4*1024) this.messages.pop();
        }
    }
    copyLogsToClipboard() {
        let msg = this.messages.map(x => x.time + ':' + x.type + ':' + x.message).join('\n');
        const pending = this.clipboard.beginCopy(msg);
        let remainingAttempts = 3;
        const attempt = () => {
          const result = pending.copy();
            if (!result && --remainingAttempts) setTimeout(attempt);
            else pending.destroy(); // Remember to destroy when you're done!
        };
        attempt();
      }
}
