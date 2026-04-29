const { S3Client, PutObjectCommand, GetObjectCommand, CreateBucketCommand, GetBucketVersioningCommand, PutBucketVersioningCommand } = require('@aws-sdk/client-s3');
const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');
const minio = require('minio');
const { Readable } = require('stream');
const { URL } = require('url');
const { performance } = require('perf_hooks');

class istore {
  _bktname() {
    let server = process.env.IS_SERVER_ID || 'insync';
    let dom = server.split('.')[0].substring(0, 55).replace(/[^0-9a-zA-Z]/g, '-').toLowerCase();
    return 'is-' + dom;
  }
}

class is3 extends istore {
  constructor() {
    super();
    this.region = process.env.IS_S3_REGION || 'ap-south-1';
    this.iamRole = process.env.IS_S3_IAMROLE;
    this.bucket_created = false;
    this.s3 = null;
    this.setup();
  }

  async setup() {
    if (this.iamRole) {
      await this._do_sts_token();
    } else {
      this.connect();
    }
  }

  async _do_sts_token() {
    try {
      const creds = await this._assume_role();
      this.connect(creds);
      setTimeout(() => this._do_sts_token(), 10 * 60 * 1000);
    } catch (e) {
      console.error(e);
    }
  }

  async _assume_role() {
    const stsClient = new STSClient({ region: this.region });
    const command = new AssumeRoleCommand({
      RoleArn: this.iamRole,
      RoleSessionName: 'InsillionSTS',
      DurationSeconds: 3600,
    });
    const { Credentials } = await stsClient.send(command);
    return {
      accessKeyId: Credentials.AccessKeyId,
      secretAccessKey: Credentials.SecretAccessKey,
      sessionToken: Credentials.SessionToken,
    };
  }

  connect(creds) {
    this.s3 = new S3Client({
      region: this.region,
      credentials: creds,
    });
    this.createBucket();
  }

  async createBucket() {
    const bucketName = this._bktname();
    try {
      await this.s3.send(new CreateBucketCommand({ Bucket: bucketName }));
      await this.enableBucketVersioning(bucketName);
      this.bucket_created = true;
    } catch (e) {
      if (e.name === 'BucketAlreadyOwnedByYou' || e.name === 'BucketAlreadyExists') {
        await this.enableBucketVersioning(bucketName);
        this.bucket_created = true;
      } else {
        console.error(e);
      }
    }
  }

  async enableBucketVersioning(bucketName) {
    await this.s3.send(new PutBucketVersioningCommand({
      Bucket: bucketName,
      VersioningConfiguration: { Status: 'Enabled' },
    }));
  }

  async upload(data, key, meta) {
    const command = new PutObjectCommand({
      Bucket: this._bktname(),
      Key: key,
      Body: data,
      Metadata: meta,
    });
    const result = await this.s3.send(command);
    return `s3:${key}?versionId=${result.VersionId || ''}`;
  }

  async download(key) {
    const command = new GetObjectCommand({
      Bucket: this._bktname(),
      Key: key,
    });
    const { Body } = await this.s3.send(command);
    const streamToString = (stream) => {
      return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        stream.on('error', reject);
      });
    };
    console.log("streamToString >>>>>",streamToString(Body)); 
    return streamToString(Body);
  }
}

let as3 = new is3();

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

