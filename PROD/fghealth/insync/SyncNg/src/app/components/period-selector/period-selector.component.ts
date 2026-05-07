import { Component, OnInit, Output, EventEmitter, Input, SimpleChange } from '@angular/core';
import * as moment from 'moment';

@Component({
    selector: 'period-selector',
    templateUrl: './period-selector.component.html',
    styleUrls: ['./period-selector.component.scss']
})
export class PeriodSelectorComponent implements OnInit {
    @Input() period: string = "";
    @Output() periodChanged = new EventEmitter();
    start: string = "";
    perioddisp: string[] = [];
    selected: string = '';
    calstart: Date = new Date();
    calend: Date = new Date();
    intervals: string[] = ['6h', '12h', '1d', '2d'];

    constructor() { }

    ngOnInit(): void {
    }

    ngOnChanges(changes: { [propKey: string]: SimpleChange }) {
        if (changes['period']) {
            if (!this.period) {
                this.period = moment().startOf('day').format('YYYY-MM-DD') + ',' + moment().endOf('day').format('YYYY-MM-DD');
                // this.period = '6h';
                // return this.changePeriod(this.period);
            }

            let parts = this.period.split(',');
            if (parts[0].endsWith('h') || parts[0].endsWith('d')) {
                this.__parse_period(parts[0]);
            } else {
                this.calstart = moment(parts[0], 'YYYY-MM-DD HH:mm:ss').toDate();
                if (parts.length > 1) this.calend = moment(parts[1], 'YYYY-MM-DD HH:mm:ss').toDate();
                this.__parse_period('start');
            }
        }
    }

    __parse_period(period: string) {
        if (period == 'start' || period == 'end') {
            this.start = moment(this.calstart).format('YYYY-MM-DD HH:00:00') + ',' + moment(this.calend).endOf('day').format('YYYY-MM-DD HH:mm:ss');
        } else if (period.endsWith('h')) {
            this.start = moment().add(-1*(+period.substring(0, period.length-1)), 'hour').format('YYYY-MM-DD HH:00:00') + ',' + moment().format('YYYY-MM-DD HH:mm:00');
        } else if (period.endsWith('d')) {
            this.start = moment().add(-1*(+period.substring(0, period.length-1)), 'day').format('YYYY-MM-DD HH:00:00') + ',' + moment().format('YYYY-MM-DD HH:mm:00');
        }
        this.selected = period;
        this.perioddisp = this.start.split(',');
    }

    changePeriod(period: string) {
        this.__parse_period(period);
        this.periodChanged.emit(this.start);
    }

}
