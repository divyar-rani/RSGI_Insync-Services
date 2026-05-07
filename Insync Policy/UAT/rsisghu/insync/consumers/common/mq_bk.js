const aws = require('aws-sdk');

const qparams = {
    region: process.env.IS_SQS_REGION || '',
    iamRole: process.env.IS_SQS_IAMROLE || '',
    accessKeyId: process.env.IS_SQS_KEY || '',
    secretAccessKey: process.env.IS_SQS_SECRET || '',
    sessionToken: undefined
}


class mq {
    constructor(queuUrl, targUrl) {
        this.queuUrl = queuUrl;
        this.targUrl = targUrl;
        this._setup_mq();
    }

    _sqs() {
        this.sqs = new aws.SQS({ apiVersion: 'latest', 
            region: qparams.region, 
            accessKeyId: qparams.accessKeyId, 
            secretAccessKey: qparams.secretAccessKey,
            sessionToken: qparams.sessionToken || undefined,
        });
        return this.sqs;
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
            await this.callerId(creds);
            obj.accessKeyId = creds.accessKeyId;
            obj.secretAccessKey = creds.secretAccessKey;
            obj.sessionToken = creds.sessionToken;
            console.log('got sts session token');
        } catch (e) {
            console.log(e);
        }
    }

    async _do_sts_token() {
        await this.token(qparams);
        this._sqs();
        setTimeout(() => this._do_sts_token(), 10*60*1000);
    }


    _setup_mq() {
        if (!this.iamRole) return this._sqs();
        this._do_sts_token();
    }

    async fetch(count) {
        if (!this.sqs) return false;
        try {
            let params = {
                MaxNumberOfMessages: count || 1,
                MessageAttributeNames: ['All'],
                QueueUrl: this.queuUrl,
                WaitTimeSeconds: 20
            };
            return await this.sqs.receiveMessage(params).promise();
        } catch (e) {
            console.log(e);
            return false;
        }
    }

    async reschedule(handle, time) {
        if (!this.sqs) return false;
        try {
            let params = {QueueUrl: this.queuUrl, ReceiptHandle: handle, VisibilityTimeout: time};
            return await this.sqs.changeMessageVisibility(params).promise();
        } catch (e) {
            console.log(e);
            return false;
        }

    }

    async delet(handle) {
        if (!this.sqs) return false;
        try {
            let params = {QueueUrl: this.queuUrl, ReceiptHandle: handle};
            return await this.sqs.deleteMessage(params).promise();
        } catch (e) {
            console.log(e);
            return false;
        }
    }

    async _post_queue(policyId, queueUrl) {
        let params = {
            MessageAttributes: {policy_id: {DataType: "String", StringValue: policyId}},
            MessageBody: policyId,
            QueueUrl: queueUrl
        };
        await this.sqs.sendMessage(params).promise();
    }

    async post(data, qurl) {
        if (!this.sqs) return false;
        try {
            qurl = qurl || this.targUrl || null;
            if (qurl instanceof Array) {
                for (let url of qurl)
                    await this._post_queue(data.policy_id, url);
            } else if (qurl) {
                await this._post_queue(data.policy_id, qurl);
            }
            return true;
        } catch (e) {
            console.log(e);
            return e.message;
        }
    }
}

module.exports = mq; // new mq();