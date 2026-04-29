import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { BucketLogViewerComponent } from './components/bucket-log-viewer/bucket-log-viewer.component';
import { ErrorLogViewerComponent } from './components/error-log-viewer/error-log-viewer.component';
import { HomeComponent } from './components/home/home.component';
import { LogViewerComponent } from './components/log-viewer/log-viewer.component';
import { ManagePolicyComponent } from './components/manage-policy/manage-policy.component';
import { ManageUsersComponent } from './components/manage-users/manage-users.component';
import { PipelineViewerComponent } from './components/pipeline-viewer/pipeline-viewer.component';
import { PurgatoryComponent } from './components/purgatory/purgatory.component';
import { RemoteLocalCompareComponent } from './components/remote-local-compare/remote-local-compare.component';
import { RevfeedComponent } from './components/revfeed/revfeed.component';
import { StateListComponent } from './components/state-list/state-list.component';
import { SummaryReportComponent } from './components/summary-report/summary-report.component';
import { UserProfileComponent } from './components/user-profile/user-profile.component';
// import { TwigTestComponent } from './components/twig-test/twig-test.component';

const routes: Routes = [
  { path: 'pipeline-viewer', component: PipelineViewerComponent },  
  { path: 'summary', component: SummaryReportComponent },
  { path: 'buckets', component: BucketLogViewerComponent },
  { path: 'compare', component: RemoteLocalCompareComponent },
  { path: 'logs', component: LogViewerComponent },
  { path: 'error-logs', component: ErrorLogViewerComponent, data: {filterProduct: true} },
  { path: 'twig-test', /*component: TwigTestComponent*/ loadChildren: () => import('./twig-editor/twig-editor.module').then(m => m.TwigEditorModule) },
  { path: 'policies', component: StateListComponent },
  { path: 'purgatory', component: PurgatoryComponent },
  { path: 'manage', component: ManagePolicyComponent },
  { path: 'revfeed', component: RevfeedComponent },
  { path: 'profile', component: UserProfileComponent },
  { path: 'org', component: ManageUsersComponent },
  { path: 'home', component: HomeComponent, data: {filterProduct: true} },
  { path: '', component: HomeComponent, data: {filterProduct: true} },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
