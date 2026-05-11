import { HttpClient } from '@angular/common/http';

export class HttpWrapper {
    private http: HttpClient | null = null;
    public token: string = '';
    constructor() {
    }

    readToken(): string {
        const name = 'insynctoken=';
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            const c = ca[i].trim();
            if (c.indexOf(name) !== -1) return c.substring(name.length, c.length).trim();
        }
        return '';
    }

    storeToken(token: string, b2c?: string) {
        this.token = token;
        document.cookie = 'insynctoken=' + this.token + '; path=/; SameSite=Lax';
        if (b2c !== undefined) localStorage.setItem('b2c', b2c);
    }

    clearToken() {
        this.storeToken('');
    }

    setHttpClient(http: HttpClient){
        this.http = http;
    }

    async xreq(url: string, method?: string, data?: any, params?: any, headers?: any): Promise<any> {
        method = (method || 'get').toLowerCase();
        
        if (!this.token) {
            this.token = this.readToken();
            console.log('read-token:', this.token)
        }
        // if we still don;t have the token, its ok as some APIs may not need the token
        // at all
        //
        try {
            const options: {[key: string]: any} = {
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma' : 'no-cache',
                    'Authorization': 'Bearer ' + (this.token || '')
                },
                observe: 'response'
            }
            if (headers) {
                for (const key in headers )options['headers'][key] = headers[key];
            }

            // if (data instanceof FormData) options.headers['Content-Type'] = 'multipart/form-data';
            if (params) options['params'] = params;

            let ret: any = null;
            // console.log('url', method, url, data)
            if( method === 'post'){
                ret = await this.http?.post<any>(url, data, options).toPromise();
                console.log('url', url, ret)
            }
            else if( method === 'delete'){
                ret = await this.http?.delete<any>(url, options).toPromise();
            }
            else if( method === 'get'){
                ret = await this.http?.get<any>(url, options).toPromise();
            }
            else{
                console.log('unsupported verb ', method);
            }
            if( ret ){
                if (ret.body?.data?.token) {
                    this.storeToken(ret.body.data.token);
                }
                return ret.body;
            }
            console.log('ret:', ret)
            throw new Error('Some error.');
        } catch(e: any) {
            throw new Error(e.message || e);
        } finally {
        }

    }


};

export const http: HttpWrapper = new HttpWrapper();
