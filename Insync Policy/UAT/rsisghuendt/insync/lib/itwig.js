const aws = require('aws-sdk');
const {performance} = require('perf_hooks');
class itwig  {
    constructor() {
        this.sparams = {apiVersion: 'latest', funcName: 'godb-twig-transform-function'};
        this._setup_lambda();
    }

    _setup_lambda() {
        if (process.env['IS_LAMBDA_KEY']) this.sparams.accessKeyId = process.env['IS_LAMBDA_KEY'];
        if (process.env['IS_LAMBDA_SECRET']) this.sparams.secretAccessKey = process.env['IS_LAMBDA_SECRET'];
        if (process.env['IS_LAMBDA_REGION']) this.sparams.region = process.env['IS_LAMBDA_REGION'];
        if (process.env['IS_LAMBDA_IAMROLE']) this.sparams.iamRole = process.env['IS_LAMBDA_IAMROLE'];
        if (process.env['IS_LAMBDA_FUNCNAME']) this.sparams.funcName = process.env['IS_LAMBDA_FUNCNAME'];
        this._do_sts_token();
    }

    async _do_sts_token() {
        await this.token(this.sparams);
        setTimeout(() => this._do_sts_token(), 10*60*1000);
    }


    async token(obj) {
        if (!obj || !obj.iamRole) return;
        try{
            let creds = await this._assume_role(obj.iamRole, obj.region);
            await (new aws.STS({credentials: creds})).getCallerIdentity({}).promise();
            obj.accessKeyId = creds.accessKeyId;
            obj.secretAccessKey = creds.secretAccessKey;
            obj.sessionToken = creds.sessionToken;
        } catch (e) {
            console.log(e);
        }
    }


    async _assume_role(roleArn, region) {
        let params = {apiVersion: '2011-06-15'};
        if (region) params.region = region;
        var sts = new aws.STS(params);
        let role = {RoleArn: roleArn, RoleSessionName: 'InsillionSTS', DurationSeconds: 3600};
        let ret = await sts.assumeRole(role).promise();
        return {accessKeyId: ret.Credentials.AccessKeyId, secretAccessKey: ret.Credentials.SecretAccessKey, sessionToken: ret.Credentials.SessionToken};
    }

    async token(obj) {
        if (!obj || !obj.iamRole) return;
        try{
            let creds = await this._assume_role(obj.iamRole, obj.region);
            await (new aws.STS({credentials: creds})).getCallerIdentity({}).promise();
            obj.accessKeyId = creds.accessKeyId;
            obj.secretAccessKey = creds.secretAccessKey;
            obj.sessionToken = creds.sessionToken;
        } catch (e) {
            console.log(e);
        }
    }

    _lambda() {
        return new aws.Lambda({ apiVersion: 'latest', 
            region: this.sparams.region, 
            accessKeyId: this.sparams.accessKeyId, 
            secretAccessKey: this.sparams.secretAccessKey,
            sessionToken: this.sparams.sessionToken||undefined,
            httpOptions: {timeout: 10*60*1000, connectTimeout: 2000}
        });
    }


    async transform(data) {
        const lambda = this._lambda();
        var params = {
            FunctionName: this.sparams.funcName,
            Payload: JSON.stringify(data)
        };
        data = await lambda.invoke(params).promise();
        if (data.StatusCode == 200 && !data.FunctionError) return JSON.parse(data.Payload);
        throw new Error(JSON.parse(data.Payload).errorMessage);
    }
}


module.exports = new itwig();