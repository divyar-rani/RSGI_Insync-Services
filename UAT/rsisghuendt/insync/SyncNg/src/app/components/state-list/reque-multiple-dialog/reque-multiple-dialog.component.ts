import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { InSyncService } from 'src/app/in-sync.service';

@Component({
    selector: 'app-reque-multiple-dialog',
    templateUrl: './reque-multiple-dialog.component.html',
    styleUrls: ['./reque-multiple-dialog.component.scss']
})
export class RequeMultipleDialogComponent {

    pids: string[] = [];
    processing: boolean = false;
    processed: number = 0;
    cancel: boolean = false;

    constructor(@Inject(MAT_DIALOG_DATA) public data: any, 
        private insyncService: InSyncService,
        public dialogRef: MatDialogRef<RequeMultipleDialogComponent>) {
            this.pids = data.pids;
            this.dialogRef.disableClose = true;
        }

    ngOnInit(): void {
    }

    async startProcess() {
        if (this.processing) return;
        
        this.cancel = false;
        this.processing = true;
        for (let i=0; i<this.pids.length; i++) {
            if (this.cancel) break;
            if (this.pids[i]) {
                await this.insyncService.xreq('/api/v1/requeue', 'post', {policy_id: this.pids[i], name: 'policy'});
                this.processed++;
            }
        }
        // this.processing = false;
    }

    close() {
        this.cancel = true;
        this.dialogRef.close();
    }
}
