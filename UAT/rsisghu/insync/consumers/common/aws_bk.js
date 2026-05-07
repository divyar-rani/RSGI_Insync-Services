const aws   = require('aws-sdk');

class isaws {
    constructor() {
        this.twig = {lambda: {funcName: 'godb-twig-transform-function'}, url: 'http://127.0.0.1:8096/gstwig/api/v1/transform'};
        this._setup_sts();
    }

    _setup_sts() {
        if (process.env['IS_LAMBDA_KEY']) this.twig.lambda.accessKeyId = process.env['IS_LAMBDA_KEY'];
        if (process.env['IS_LAMBDA_SECRET']) this.twig.lambda.secretAccessKey = process.env['IS_LAMBDA_SECRET'];
        if (process.env['IS_LAMBDA_REGION']) this.twig.lambda.region = process.env['IS_LAMBDA_REGION'];
        if (process.env['IS_LAMBDA_IAMROLE']) this.twig.lambda.iamRole = process.env['IS_LAMBDA_IAMROLE'];
        if (process.env['IS_LAMBDA_FUNCNAME']) this.twig.lambda.funcName = process.env['IS_LAMBDA_FUNCNAME'];
        this._do_sts_token();
    }

    async _do_sts_token() {
        await this.token(this.twig.lambda);
        setTimeout(() => this._do_sts_token(), 10*60*1000);
    }



    _lambda() {
        return new aws.Lambda({ apiVersion: 'latest', 
            region: this.twig.lambda.region, 
            accessKeyId: this.twig.lambda.accessKeyId, 
            secretAccessKey: this.twig.lambda.secretAccessKey,
            sessionToken: this.twig.lambda.sessionToken||undefined,
            httpOptions: {timeout: 10*60*1000, connectTimeout: 2000}
        });
    }

    async _assume_role(roleArn, region) {
        //let params = {apiVersion: '2011-06-15'};
        let params = {apiVersion: '2012-10-17'};
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

    async transform(data) {
        const lambda = this._lambda();
        var params = {
            FunctionName: this.twig.lambda.funcName,
            Payload: JSON.stringify(data)
        };
        data = await lambda.invoke(params).promise();
        if (data.StatusCode == 200 && !data.FunctionError) {
            return JSON.parse(data.Payload);
        }
        throw new Error(JSON.parse(data.Payload).errorMessage);
    }

}

module.exports = new isaws();
