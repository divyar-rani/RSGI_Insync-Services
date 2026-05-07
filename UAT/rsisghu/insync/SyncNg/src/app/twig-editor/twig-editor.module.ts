import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CodeEditorModule } from '@ngstack/code-editor';
import { TwigEditorRoutingModule } from './twig-editor-routing.module';
import { TwigTestComponent } from '../components/twig-test/twig-test.component';

@NgModule({
    declarations: [TwigTestComponent],
    imports: [
        CommonModule,
        TwigEditorRoutingModule,
        CodeEditorModule.forRoot({baseUrl: 'assets/monaco'})
    ],
    exports: [TwigTestComponent, CodeEditorModule]
})
export class TwigEditorModule {
    
}
