import { Component, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { InSyncService } from 'src/app/in-sync.service';
import { ActivatedRoute, Router, ParamMap } from "@angular/router";

@Component({
    selector: 'app-pipeline-viewer',
    templateUrl: './pipeline-viewer.component.html',
    styleUrls: ['./pipeline-viewer.component.scss']
})
export class PipelineViewerComponent implements OnInit {

    extractor: any = {};
    config: any = {};
    profile: any = null;
    subscription: Subscription | null = null;
    pipeline: any = [];
    links: any[] = [];
    nodes: any[] = [];
    groups: any[] = [];
    idcounter: number = 1;
    constructor(private insyncService: InSyncService, private router: Router) {
        this.subscription = this.insyncService.profileSubject.subscribe((profile) => {
            this.profile = profile;
            if (this.profile) this._reload();

        });
    }

    ngOnInit(): void {
    }

    async _reload() {
        this.extractor = await this.insyncService.xreq('/api/v1/config?name=policy');
        if (!this.extractor) this.extractor = {};
    }

    __add_to_parent(par: any, url: string, stage: any): boolean {
        let found = false;
        if (par.url == url) {
            par.children.push(stage);
            found = true;
        }

        for (let node of par.children) {
            if (node.url == url) {
                // check if we have added ourselves here already
                if (node.children.filter((x: any) => x.condkey == stage.condkey).length==0)
                    node.children.push(stage);
                found = true;
            } else {
                found = this.__add_to_parent(node, url, stage) || found;
            }            
        }
        return found;
    }

    __add_service_node(par: any, snode: any) {
        for (let i=0; i<par.children.length; i++) {
            let child: any = par.children[i];
            if (child.condkey != snode.condkey) continue;
            if (child.type != 'and') {
                par.children[i] = {name: 'All of', type: 'and', url: '', condkey: child.condkey, children: [child]};
            }
            par.children[i].children.push(snode);
            return;
        }
        par.children.push(snode);
    }

    _collapse_pipeline(node: any) {
        for (let i=0; i<node.children.length; i++) {
            let child = node.children[i];
            if (child.type == 'or' && child.children.length == 1) {
                node.children[i] = child.children[0];
            }
            this._collapse_pipeline(node.children[i]);
        }
    }

    _q_name(url: string) {
        let parts = url.split('/');
        return parts[parts.length-1];
    }

    __connect_to_nodes(id: number, queue: string, links: any[], nodes: any[]) {
        // find all nodes with this queue and connect to it
        for (let node of nodes) {
            if (node.q == queue) links.push({id: this.idcounter++, source: node.id, target: id});
        }
    }

    __connect_to_node(did: number, sid: number, links: any[]) {
        links.push({id: this.idcounter++, source: sid, target: did});
    }

    _make_nodes_edges() {
        let entry = this.extractor.sqs?.url || null;
        if (!entry) return;
        let nodes: any[] = [];
        let links: any[] = [];
        let groups: any[] = [];

        nodes.push({id: this.idcounter++, label: 'Extractor', q: 'entry', color: '#FFF'});
        for (let name in this.config) {
            let consumer = this.config[name];
            if (!consumer.sqs?.name) continue;
            let cid = this.idcounter++;
            nodes.push({id: cid, label: consumer.name, q: '', color: '#AAAAFF'});
            this.__connect_to_nodes(cid, consumer.sqs?.name, links, nodes);
            
            let clusters: any = {};
            for (let service of consumer.services) {
                let key = service.products.sort().join(',');
                if (!clusters[key]) clusters[key] = [];

                let sid = this.idcounter++;
                let name = service.name + ' (' + key + ')';
                clusters[key].push({id: sid, label: name, q: service.sqs?.name||'', color: service.if ? '#EEEEAA' : '#AAEEAA'});
            }

            // ordered and grouped
            // let keys = Object.keys(clusters);
            // for (let key of keys) {
            //     for (let i=0; i<clusters[key].length; i++) {
            //         nodes.push(clusters[key][i]);
            //         if (i == 0)
            //             this.__connect_to_node(clusters[key][i].id, cid, links);
            //         else
            //             this.__connect_to_node(clusters[key][i].id, clusters[key][i-1].id, links);
            //     }
            // }


            for (let service of consumer.services) {
                let sid = this.idcounter++;
                let name = service.name;
                if (service.products.indexOf('all') >= 0) name += ' (all)';
                else name += ' (' +service.products.join(',') + ')';
                nodes.push({id: sid, label: name, q: service.sqs?.name||'', color: service.if ? '#EEEEAA' : '#AAEEAA'});
                this.__connect_to_node(sid, cid, links);

                let key = service.products.sort().join(',');
                if (!clusters[key]) clusters[key] = [];
                clusters[key].push(sid);
            }

            // let keys = Object.keys(clusters);
            // for (let key of keys) {
            //     if (clusters[key].length > 1)
            //         groups.push({id: this.idcounter++, label: key, childNodes: clusters[key]});
            // }
        }

        this.nodes = nodes;
        this.links = links;
        this.groups = groups;
        console.log('grups', groups)
    }

    _make_pipeline() {
        let entry = this.extractor.sqs?.url || null;
        if (!entry) return;

        let pipe = {name: 'Extractor', type: 'entry', url: 'entry', children: [], show: false, products: [], q: this._q_name(entry)};
        let orphans: any = {name: 'Orphans', type: 'entry', url: '', children: [], show: false};

        for (let name in this.config) {
            let consumer = this.config[name];
            if (!consumer.sqs?.name) continue;
            
            let cnode = {name: 'One of', type: 'or', url: '', children: [], show: false, products: [], q: ''};
            if (!this.__add_to_parent(pipe, consumer.sqs?.name, cnode)) {
                if (!this.__add_to_parent(orphans, consumer.sqs?.name, cnode)) {
                    console.log(name, 'could not locate ', consumer.sqs?.name);
                    orphans.children.push(cnode);
                }
            }

            for (let service of consumer.services) {
                let condkey = (service.products||[]).filter((x: string) => x != 'all').map((x: string) => x.toLowerCase()).sort().join(',');
                let stage = {name: service.name, type: service.sqs?.name ? 'node' : 'end', 
                    url: service.sqs?.name||'', condkey, children: [], show: false,
                    products: service.products, q: this._q_name(service.sqs?.name||'')
                };
                this.__add_service_node(cnode, stage);
            }
        }
        this._collapse_pipeline(pipe);
        this._collapse_pipeline(orphans);
        return [pipe, orphans];
    }

    handleFileInput(event: any) {
        let reader = new FileReader();
        reader.onload = (e) => {
            if (typeof reader.result=='string') {
                let js = "let process = {env:{}};\nlet module={};\n" + reader.result + '\nreturn conf;';
                // js = "var a = 10; return a;";
                this.config = (new Function(js))();
                console.log('config', this.config);
                this.pipeline = this._make_pipeline();
                this._make_nodes_edges();
                console.log('pipeline', this.pipeline);
            }
        }
        reader.readAsText(event.target.files[0]);
    }
}
