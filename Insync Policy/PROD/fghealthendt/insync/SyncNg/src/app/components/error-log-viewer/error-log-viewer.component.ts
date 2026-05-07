import { Component, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { InSyncService } from 'src/app/in-sync.service';
import { ActivatedRoute, Router, ParamMap } from "@angular/router";
import * as moment from 'moment';

@Component({
     selector: 'app-error-log-viewer',
     templateUrl: './error-log-viewer.component.html',
     styleUrls: ['./error-log-viewer.component.scss']
})
export class ErrorLogViewerComponent implements OnInit {
     profile: any = null;
     subscription: Subscription | null = null;
     rsubscription: Subscription | null = null;
     psubscription: Subscription | null = null;
     start: string = '';
     period: string = '';
     allmessages: any[] = [];
     messages: any[] = [];
     raw: any[] = [];
     product: string = '';
     filterCompleted: boolean = false;
     loading: boolean = false;
     constructor(private insyncService: InSyncService,
          private router: Router,
          private activatedRoute: ActivatedRoute) {
              this.subscription = this.insyncService.profileSubject.subscribe((profile) => this.profile = profile);
              this.rsubscription = this.activatedRoute.queryParams.subscribe(params => {
                  if (params['period']) {
                      this.period = params['period'];
                      // this._reload();
                  }
              });
              this.psubscription = this.insyncService.productSubject.subscribe((prodId) => {this.product = prodId; this._reload()});
      }
  
     ngOnInit(): void {
     }
     ngOnDestroy(): void {
          this.subscription?.unsubscribe();
          this.rsubscription?.unsubscribe();
          this.psubscription?.unsubscribe();
     }

     _process_errors(ret: any[]) {
          let messages: any = {};
          this.raw = [];
          for (let msg of (ret||[])) {
               let message = msg.message;
               if (message.startsWith('gc_') && message.indexOf('not found') > 0) continue;
               if (message.indexOf('application_no not found')>=0 || message.indexOf('workflowid not found')>=0) continue;
               if (message.indexOf('gc_sub_receipt_no is invalid') >= 0) continue;
               if (message.indexOf('expected string/number') >= 0) continue;

               if (this.filterCompleted && (msg.sync_state == 'completed')) continue;

               message = message.replace(/\(\d+(,\d+)*\)/g, '(xxx)');
               message = message.replace(/proposal no : (\d+)/gi, 'proposal no : xxx');
               message = message.replace(/proposal no : \d+/gi, 'proposal no : xxx');
               
               message = message.replace(/receipt no\(s\)\. \d+/gi, 'Receipt No(s). xxx');
               message = message.replace(/Audit Log Transaction ID \- (\d+)/gi, 'Audit Log Transaction ID - xxx');
               message = message.replace(/Proposal No. : \d+ is already/gi, 'Proposal No. : xxx is already');
               message = message.replace(/Proposal No. : \d+(\/\d+)*/gi, 'Proposal No. : xxx');
               message = message.replace(/moving P\d+ /gi, 'moving Pxxx ');
               message = message.replace(/Customer Id \-\d+ is/gi,'Customer Id -xxx is');
               message = message.replace(/Receipt\( \d+ \) Balance/gi, 'Receipt( xxx ) Balance');
               message = message.replace(/\[\d+\]/gi, '[xxx]');
               message = message.replace(/Receipting by\d+ user under\d* Producer/gi, 'Receipting byxxx user underyyy Producer');
               message = message.replace(/PAN number for \d+/gi, 'PAN number for xxx');
               message = message.replace(/Customer * \(\d+\)/gi, 'Customer AAA (xxx)');
               message = message.replace(/Duplicate entry 'P\d+' for/, "Duplicate entry 'PXXX' for");
               message = message.replace(/office code \d+/, "office code xxxx");
               message = message.replace(/PAN number for the Customer * \(/, 'PAN number for the Customer xxx (');


               if (!messages[message]) messages[message] = {};
               if (!messages[message][msg.mod_name]) messages[message][msg.mod_name] = {count: 0, ids: {}, nos: {}};
               messages[message][msg.mod_name].count ++;
               messages[message][msg.mod_name].ids[msg.policy_id] = 1;
               if (msg.policy_no) messages[message][msg.mod_name].nos[msg.policy_no] = 1;
               // messages[message].policyid[msg.policy_id] = 1;
               // messages[message].mods[msg.mod_name] = 1;
               let ld = moment.utc(msg.u_ts).local().format('YYYY-MM-DD HH:mm:ss');
               this.raw.push([ld, msg.mod_name, msg.policy_id, msg.policy_no, msg.message]);
          }

          this.messages = [];
          for (let msg in messages) {
               for (let mod of Object.keys(messages[msg])) {
                    let rec = messages[msg][mod];
                    let ids = Object.keys(rec.ids);
                    let nos = Object.keys(rec.nos);
                    this.messages.push({msg, 
                         policyids: ids.join(',').substring(0, 40),
                         allids: ids.join(','),
                         policynos: nos.join(',').substring(0,40),
                         allnos: nos.join(','),
                         mod, count: ids.length
                    });
               }
          }

     }

     async _reload() {
          if (!this.profile) return;
          this.loading = true;
          let url = '/api/v1/logs?period=' + encodeURIComponent(this.start) + '&type=error';
          if (this.product) url += '&product=' + encodeURIComponent(this.product);
          // for (let key in this.filters) url += '&' + key + '=' + encodeURIComponent(this.filters[key]);
          let ret = await this.insyncService.xreq(url);
          this.allmessages = ret || [];
          this._process_errors(ret||[]);
          
          this.loading = false;
     }
     periodChanged(start: string) {
          this.start = start;
          this._reload();
     }
     exportCSV() {
          let arr: any[] = [['Message', 'Module', 'Count', 'Ids', 'Nos']];
          arr.push(...this.messages.map(x => [((x.msg||'')+'').replace(/\"/g, '""').replace(/\r?\n|\r/g, ''), x.mod, x.count, x.allids, x.allnos]));
          let csv = arr.map(x => '"'+x.join('","')+'"').join('\n');
          this.insyncService._save_file(csv, 'errors.csv');
     }
     exportRaw() {
          let data = this.raw.sort((a: any, b: any) => (a[2]+a[1]) > (b[2]+b[1]) ? +1 : -1);
          let arr: any[] = [['Time', 'Module', 'PolicyID', 'Policy No', 'Message']];
          arr.push(...data.map(x => x.map((y: any) => ((y||'')+'').replace(/\"/g, '""').replace(/\r?\n|\r/g, ''))));
          let csv = arr.map(x => '"'+x.join('","')+'"').join('\n');
          this.insyncService._save_file(csv, 'errors-raw.csv');
     }
     toggleCompleted() {
          this.filterCompleted = !this.filterCompleted;
          this._process_errors(this.allmessages);
     }
}
