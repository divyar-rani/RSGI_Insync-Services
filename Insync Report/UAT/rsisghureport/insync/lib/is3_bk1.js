const aws = require('aws-sdk');
const minio = require('minio');
const { Readable } = require('stream');
const {URL} = require("url");
const {performance} = require('perf_hooks');
 
class istore {
    _bktname() {
        let server = process.env.IS_SERVER_ID || 'insync';
        var dom = server.split('.')[0].substring(0, 55).replace(/[^0-9^a-z^A-Z]/g, '-').toLowerCase();
        return 'is-'+dom;
    }
}
 
class imi extends istore {
    constructor() {
        super();
        if (!process.env.IS_MINIO_ENDPOINT) return;
        this.region = process.env.IS_MINIO_REGION || 'ap-south-1';
        let cparams = {endPoint: process.env.IS_MINIO_ENDPOINT, port: +process.env.IS_MINIO_PORT,
            useSSL: false, accessKey: process.env.IS_MINIO_ACCESS_KEY, secretKey: process.env.IS_MINIO_SECRET,
            region: this.region};
        this.mio = new minio.Client(cparams);
        this.createBucket();
    }
 
    async upload(data, key, meta) {
        return new Promise((resolve, reject) => {
            this.mio.putObject(this._bktname(), key, Readable.from(data||''), null, meta,
                (err, info) => err ? reject(err) : resolve('s3:'+info.etag+'?versionId='+(info.VersionId||'')));
        })
    }
 
    async createBucket() {
        if(!this.mio) return null;
        return new Promise((resolve, reject) => {
            this.mio.makeBucket(this._bktname(), this.region, (err, data) => {
                if (err) {
                    if ((typeof err == 'string' && err.indexOf("you already own it") > 0) ||
                        (typeof err == 'string' && err.indexOf('BucketAlreadyExists') >= 0) ||
                        (err.message && err.message.indexOf("BucketAlreadyExists") > 0) ||
                        (err.message && err.message.indexOf("you already own it") > 0) ) return resolve('');
                    return reject(err);
                }
                resolve(data);
            });
        });
    }
 
 
    async download(key, versionId) {
        return new Promise((resolve, reject) => {
            let params = versionId ? {versionId} : {};
            this.mio.getObject(this._bktname(), key, params, (err, stream) => {
                let bufs = [];
                if (err) return reject(err);
                stream.on('data', (chunk) => bufs.push(chunk));
                stream.on('end', () => resolve(Buffer.concat(bufs)));
                stream.on('error', (err) => reject(err));
            });
        });
    }
}
 
class is3 extends istore {
    constructor() {
        super();
        this.sparams = {
            apiVersion: '2012-10-17',
            region: process.env['IS_S3_REGION'] || 'me-south-1',
            accessKeyId: process.env.IS_S3_ACCESS_KEY||'',
            secretAccessKey: process.env.IS_S3_ACCESS_SECRET,
            sessionToken: undefined,
            iamRole: process.env.IS_S3_IAMROLE
        };
        this.bucket_created = false;
        this._setup_s3();
    }
 
    _setup_s3() {
        if (!this.sparams.iamRole) return this.connect();
        this._do_sts_token();
    }
 
async _do_sts_token() {
    console.log('Starting STS token refresh cycle');
    try {
        await this.token(this.sparams);
        await this.connect();
        console.log('Successfully refreshed token and connected, scheduling next refresh in 10 minutes');
    } catch (e) {
        console.log('Failed in STS token refresh cycle:', e);
    }
    setTimeout(() => this._do_sts_token(), 10*60*1000);
}
 
async connect() {
    console.log('Connecting to S3 with credentials. Have access key?', !!this.sparams.accessKeyId);
    console.log('Session token present?', !!this.sparams.sessionToken);
    if (!this.sparams.accessKeyId) {
        console.log('No access key, skipping S3 connection');
        return;
    }
    this.s3 = new aws.S3(this.sparams);
    console.log('S3 client created, attempting to create bucket');
    await this.createBucket();
}
 
    async _assume_role(roleArn, region) {
        let params = {apiVersion: '2012-10-17'};
        if (region) params.region = region;
        var sts = new aws.STS(params);
        let role = {RoleArn: roleArn, RoleSessionName: 'InsillionSTS', DurationSeconds: 3600};
        let ret = await sts.assumeRole(role).promise();
        return {accessKeyId: ret.Credentials.AccessKeyId, secretAccessKey: ret.Credentials.SecretAccessKey, sessionToken: ret.Credentials.SessionToken};
    }
 
async token(obj) {
    if (!obj || !obj.iamRole) return;
    console.log('Starting to assume role:', obj.iamRole, 'in region:', obj.region);
    try {
        let creds = await this._assume_role(obj.iamRole, obj.region);
        console.log('Successfully assumed role, got temporary credentials');
        console.log('Validating credentials with STS GetCallerIdentity...');
        let identity = await (new aws.STS({credentials: creds})).getCallerIdentity({}).promise();
        console.log('Successfully validated credentials. CallerIdentity:', identity.Arn);
        
        obj.accessKeyId = creds.accessKeyId;
        obj.secretAccessKey = creds.secretAccessKey;
        obj.sessionToken = creds.sessionToken;
        console.log('Credentials updated. Access key starts with:', creds.accessKeyId.substring(0, 5) + '...');
    } catch (e) {
        console.log('Failed to assume role or validate credentials:', e.code, e.message);
        console.log('Full error:', e);
    }
}
 
    async upload(data, key, meta) {
        if(!this.s3) return null;
        let params = { Bucket: this._bktname(), Key: key, StorageClass: 'INTELLIGENT_TIERING', Body: data }
        if (meta) params.Metadata = meta;
        let ret = await this.s3.upload(params).promise();
        return 's3:' + ret.Location + '?versionId=' + ret.VersionId;
    }
 
    async download(key, versionId) {
        if (!this.s3) return null;
        let params = {Bucket: this._bktname(), Key: key};
        if (versionId) params.VersionId = versionId;
        return Buffer.from((await this.s3.getObject(params).promise()).Body).toString('utf8');
    }
 
async __check_if_bucket_exists(name) {
    console.log('Checking if bucket exists:', name);
    try {
        let ret = await this.s3.getBucketVersioning({Bucket: name}).promise();
        console.log('Bucket exists, versioning status:', ret.Status);
        if (ret.Status != 'Enabled') {
            console.log('Enabling versioning on bucket:', name);
            await this.__enable_bucker_versioning(name);
        }
        this.bucket_created = true;
        return true;
    } catch (e) {
        console.log('Error checking bucket:', e.code, e.message);
        return false;
    }
}
 
    async createBucket() {
        if(!this.s3 || this.bucket_created) return null;
        let params = {
            Bucket: this._bktname(),
            ACL: 'private',
            CreateBucketConfiguration: {LocationConstraint: this.sparams.region}
        }
        if (await this.__check_if_bucket_exists(params.Bucket)) return;
 
        try {
            console.log('bucket create ...');
            console.log('Params>',params);
            await this.s3.createBucket(params).promise();
            await this.__enable_bucker_versioning(params.Bucket);
            this.bucket_created = true;
        } catch (e) {
            if (typeof e.code === 'string' &&
               (e.code.indexOf('BucketAlreadyOwnedByYou')>=0 || e.code.indexOf('BucketAlreadyExists')>=0)) {
                await this.__enable_bucker_versioning(params.Bucket);
                this.bucket_created = true;
                return '';
            }
            console.log('s3:', e);
        }
    }
 
    async __enable_bucker_versioning(bktName) {
        var params = {
            Bucket: bktName,
            VersioningConfiguration: {Status: "Enabled"}
        };
        this.s3.putBucketVersioning(params, (err, data) => {if (err) console.log('__enable_bucker_versioning:', err, err.stack);});
    }
 
}
 
let as3 = new is3();
let mio = new imi();
class idata {
    ready() {
        if (process.env.IS_S3_ACCESS_KEY || process.env.IS_S3_IAMROLE) {
            return as3.bucket_created;
        }
        return true;
    }
 
    async wait_for_ready() {
        let count = 20;
        while (!this.ready() && count > 0) {
            await new Promise((resolve, reject) => setTimeout(resolve, 300));
            count --;
        }
        console.log('store: ready');
    }
 
 
    async store(policyId, data, key) {
        key = key || 'json/'+policyId;
        try {
            if (process.env.IS_MINIO_ENDPOINT) {
                return await mio.upload(data, key);
            } else if (process.env.IS_S3_ACCESS_KEY || process.env.IS_S3_IAMROLE) {
                return await as3.upload(data, key);
            } else {
                return data;
            }
        } catch (e) {
            console.log(e);
            return null;
        }
    }
 
    async get(data) {
        if (!data.startsWith('s3:')) return data;
 
        let uripath = new URL(data.substring(3));
        let versionId = data.split('versionId=')[1];
        if (process.env.IS_MINIO_ENDPOINT) {
            return await mio.download(uripath.pathname, versionId);
        } else if (process.env.IS_S3_ACCESS_KEY || process.env.IS_S3_IAMROLE) {
            return await as3.download(uripath.pathname.substring(1), versionId);
        } else {
            throw new Error('neither minio nor s3 is configured');
        }
    }
 
    async fix(row) {
        if (!row.data) return row.data;
 
        let data = Buffer.from(row.data).toString('utf8');
        if (!data.startsWith('s3:')) return row.data;
 
        let start = performance.now();
        let versionId = data.split('versionId=')[1];
        if (process.env.IS_MINIO_ENDPOINT) {
            row.data = await mio.download('json/'+row.policy_id, versionId);
        } else if (process.env.IS_S3_ACCESS_KEY || process.env.IS_S3_IAMROLE) {
            row.data = await as3.download('json/'+row.policy_id, versionId);
        } else {
            throw new Error('neither minio nor s3 is configured');
        }
 
        return row.data;
    }
}
 
module.exports = new idata();
