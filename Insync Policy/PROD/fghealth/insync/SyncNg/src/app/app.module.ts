import { NgModule, ErrorHandler, 
    APP_INITIALIZER, DEFAULT_CURRENCY_CODE, LOCALE_ID } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CdkStepperModule } from '@angular/cdk/stepper';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { CurrencyPipe, DecimalPipe, registerLocaleData } from '@angular/common';

import { NgxJsonViewerModule } from 'ngx-json-viewer';

import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule, MatFormFieldDefaultOptions, MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'; 
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs'; 
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSortModule } from '@angular/material/sort';
import { MatMenuModule } from '@angular/material/menu';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatDialog } from '@angular/material/dialog';
import { MatRadioModule } from '@angular/material/radio';
import { MatTreeModule } from '@angular/material/tree'; 
import { MatSliderModule } from '@angular/material/slider';
import { MatChipsModule } from '@angular/material/chips'; 
import { MatRippleModule } from '@angular/material/core'; 

import { HttpClientModule } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { http } from './../app/httpng';
import { SummaryComponent } from './components/summary/summary.component';
import { HomeComponent } from './components/home/home.component';
import { PurgatoryComponent } from './components/purgatory/purgatory.component';
import { ActivityStreamComponent } from './components/activity-stream/activity-stream.component';
import { ManagePolicyComponent } from './components/manage-policy/manage-policy.component';
import { JsonViwerDialogComponent } from './components/manage-policy/json-viwer.component';
import { PolicyCalendarComponent } from './components/policy-calendar/policy-calendar.component';
import { StateListComponent } from './components/state-list/state-list.component';
import { LogViewerComponent } from './components/log-viewer/log-viewer.component';
import { PeriodSelectorComponent } from './components/period-selector/period-selector.component';
import { RemoteLocalCompareComponent } from './components/remote-local-compare/remote-local-compare.component';
import { SummaryReportComponent } from './components/summary-report/summary-report.component';
import { PipelineViewerComponent } from './components/pipeline-viewer/pipeline-viewer.component';
import { ErrorLogViewerComponent } from './components/error-log-viewer/error-log-viewer.component';
import { RequeMultipleDialogComponent } from './components/state-list/reque-multiple-dialog/reque-multiple-dialog.component';
import { BucketLogViewerComponent } from './components/bucket-log-viewer/bucket-log-viewer.component';
import { CodeEditorModule } from '@ngstack/code-editor';
import { NgxGraphModule } from '@swimlane/ngx-graph';
// import { TwigTestComponent } from './components/twig-test/twig-test.component';
import { RevfeedComponent } from './components/revfeed/revfeed.component';
import { UserProfileComponent } from './components/user-profile/user-profile.component';
import { ManageUsersComponent } from './components/manage-users/manage-users.component';

@NgModule({
    declarations: [
        AppComponent,
        SummaryComponent,
        HomeComponent,
        PurgatoryComponent,
        ActivityStreamComponent,
        ManagePolicyComponent,
        JsonViwerDialogComponent,
        PolicyCalendarComponent,
        StateListComponent,
        LogViewerComponent,
        PeriodSelectorComponent,
        RemoteLocalCompareComponent,
        SummaryReportComponent,
        PipelineViewerComponent,
        ErrorLogViewerComponent,
        RequeMultipleDialogComponent,
        BucketLogViewerComponent,
        // TwigTestComponent,
        RevfeedComponent,
        UserProfileComponent,
        ManageUsersComponent
    ],
    imports: [
        BrowserModule,
        AppRoutingModule,
        BrowserAnimationsModule,
		FormsModule,
		ReactiveFormsModule,
        CdkStepperModule,
        DragDropModule,
		MatToolbarModule,
		MatIconModule,
		MatButtonModule,
        MatSidenavModule,
        MatListModule,
        MatSelectModule,
        MatInputModule,
        MatFormFieldModule,
        MatDialogModule,
        MatRadioModule,
        MatTreeModule,
        MatSliderModule,
        MatChipsModule,
        MatRippleModule,
        MatSnackBarModule,
        MatDatepickerModule,
        MatNativeDateModule,
        MatProgressSpinnerModule,
        MatTableModule,
        MatTabsModule,
        MatPaginatorModule,
        MatSortModule,
        MatMenuModule,
        MatCheckboxModule,
        MatSlideToggleModule,
        MatAutocompleteModule,
		HttpClientModule,
        NgxJsonViewerModule,
        NgxGraphModule,
        CodeEditorModule.forRoot({baseUrl: 'assets/monaco'})
    ],
    providers: [],
    bootstrap: [AppComponent]
})
export class AppModule {
    constructor(private httpClient: HttpClient) {
        http.setHttpClient(this.httpClient);
    }
}
