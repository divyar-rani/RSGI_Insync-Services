import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CodeModel } from '@ngstack/code-editor';
import { http } from 'src/app/httpng';
import {Clipboard} from '@angular/cdk/clipboard';

@Component({
    selector: 'app-twig-test',
    templateUrl: './twig-test.component.html',
    styleUrls: ['./twig-test.component.scss']
})
export class TwigTestComponent implements OnInit {
    @ViewChild('xml') xml!: any;
    twigModel: CodeModel = {language: 'twig',uri: 'main.twig',value: '<cus:source>{{ipds_source}}</cus:source>'};
    jsonModel: CodeModel = {language: 'json',uri: 'main.json',value: '{"ipds_source": "Hello"}'};
    xmlModel: CodeModel = {language: 'xml', uri: 'main.xml', value: ''}

    options = {contextmenu: true, minimap: {enabled: false}, automaticLayout: true}
    xmlOptions = {contextmenu: true, minimap: {enabled: false}, automaticLayout: true};

    twig: string = '<cus:source>{{ipds_source}}</cus:source>';
    json: string = '{"ipds_source": "Hello"}';
    dbTimer: any = null;
    loading: boolean = false;
    script: boolean = false;
    constructor(private clipboard: Clipboard) { }

    ngOnInit(): void {
        this.loadScript();
    }

    twigChanged(ev: any) {
        this.twig = ev;
        this.debounceRender();
    }

    jsonChanged(ev: any) {
        this.json = ev;
        this.debounceRender();
    }

    debounceRender() {
        if (this.dbTimer) clearTimeout(this.dbTimer);
        this.dbTimer = setTimeout(() => this.render(), 1200);
    }

    async render() {
        this.loading = true;
        let ret = await http.xreq('/api/v1/twigtest', 'post', {json: this.json, twig: this.twig});
        if (ret) {
            if (ret.status == 0 && ret.data) {
                this.xmlModel.value = ret.data.data;
                this.xml.updateModel(this.xmlModel);
            } else {
                this.xmlModel.value = ret.txt;
                this.xml.updateModel(this.xmlModel);
            }
        }
        this.loading = false;
    }
    copyPolicyToClipboard(formated: boolean) {
        let msg = this.xmlModel.value;
        const pending = this.clipboard.beginCopy(msg);
        let remainingAttempts = 3;
        const attempt = () => {
          const result = pending.copy();
            if (!result && --remainingAttempts) setTimeout(attempt);
            else pending.destroy(); // Remember to destroy when you're done!
        };
        attempt();
    }

    public loadScript() {
        var isFound = false;
        var scripts = document.getElementsByTagName("script")
        for (var i = 0; i < scripts.length; ++i) {
            if (!scripts[i]) continue;
            let src = scripts[i].getAttribute('src');
            if (src && src.includes("loader")) isFound = true;
        }
        if (!isFound) {
            var dynamicScripts = [
                "/assets/monaco/vs/loader.js",
                "/assets/monaco/vs/editor/editor.main.js",
                "/assets/monaco/vs/editor/editor.main.nls.js",
                // "https://unpkg.com/monaco-editor/min/vs/loader.js", 
                // "https://unpkg.com/monaco-editor/min/vs/editor/editor.main.js",
                // "https://unpkg.com/monaco-editor/min/vs/editor/editor.main.nls.js"
            ];
    
            let loaded = 0;
            for (var i = 0; i < dynamicScripts.length; i++) {
                let node = document.createElement('script');
                node.src = dynamicScripts [i];
                node.type = 'text/javascript';
                node.async = false;
                node.charset = 'utf-8';
                console.log('adding ', node.src)
                document.getElementsByTagName('head')[0].appendChild(node);
                node.onload = (ev: any) => {
                    loaded ++
                    if (loaded == dynamicScripts.length) {
                        this.script = true;
                        console.log('loaded all monaco scripts')
                    }
                };
            }
        } else {
            this.script = true;
        }
    }

}
