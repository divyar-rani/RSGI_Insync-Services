import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { TwigTestComponent } from './../components/twig-test/twig-test.component';

const routes: Routes = [
  { path: '*', component: TwigTestComponent },
  { path: '', component: TwigTestComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TwigEditorRoutingModule { }

