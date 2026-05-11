import { Component, OnInit, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import {Clipboard} from '@angular/cdk/clipboard';

@Component({
    selector: 'json-viwer-dialog',
    templateUrl: 'json-viwer.component.html'
})
export class JsonViwerDialogComponent {
    isjson: boolean = false;
    isxml: boolean = false;
    constructor(@Inject(MAT_DIALOG_DATA) public data: any, 
        public dialogRef: MatDialogRef<JsonViwerDialogComponent>,
        private clipboard: Clipboard) {
            if (typeof data.jdata === 'string') this.isxml = true;
            else if (typeof data.jdata === 'object') this.isjson = true;
        }


    copyPolicyToClipboard(formated: boolean) {
        let msg = this.data.jdata;
        if (this.isjson) msg = formated ? JSON.stringify(this.data.jdata, null, 4) : JSON.stringify(this.data.jdata);
        
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
