const conf = require('../config');
const aws = require('aws-sdk');

class mq {
    constructor() {
        // if (!conf.sqs.accessKeyId || !conf.sqs.secretAccessKey) return;
        console.log('queue:', conf.sqs.region);
        this._setup_mq();
    }

    _sqs() {
        this.sqs = new aws.SQS({ apiVersion: 'latest', 
            region: conf.sqs.region, 
            accessKeyId: conf.sqs.accessKeyId, 
            secretAccessKey: conf.sqs.secretAccessKey,
            sessionToken: conf.sqs.sessionToken||undefined,
        });
        return this.sqs;
    }

    _setup_mq() {
        if (!conf.sqs.iamRole) return this._sqs();
        this._do_sts_token();
    }

    async _do_sts_token() {
        await this.token(conf.sqs);
        this._sqs();
        setTimeout(() => this._do_sts_token(), 10*60*1000);
    }



    async callerId(creds) {
        let sts = new aws.STS({credentials: creds});
        return await sts.getCallerIdentity({}).promise();
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
            console.log('got new sqs token');
        } catch (e) {
            console.log('sqs:', e);
        }
    }

    async fetch(qurl, count) {
        if (!this.sqs) return false;
        try {
            let params = {MaxNumberOfMessages: count || 1, MessageAttributeNames: ['All'], QueueUrl: qurl, WaitTimeSeconds: 20};
            return await this.sqs.receiveMessage(params).promise();
        } catch (e) {
            console.log(e);
            return false;
        }
    }


    async post(def, data, qurl) {
        if (!this.sqs) return false;
        try {
            let params = {
                MessageAttributes: {policy_id: {DataType: "String", StringValue: data.policy_id}},
                MessageBody: data.policy_id,
                QueueUrl: qurl || def.sqs?.url || '',
            };
            // console.log('mq: ', data.policy_id);
            return await this.sqs.sendMessage(params).promise();
        } catch (e) {
            console.log('mq:post:', e);
            return false;
        }
    }

    async delet(handle, url) {
        if (!this.sqs) return false;
        try {
            let params = {QueueUrl: url, ReceiptHandle: handle};
            return await this.sqs.deleteMessage(params).promise();
        } catch (e) {
            console.log(e);
            return false;
        }
    }


    async pending(url) {
        if (!this.sqs || !url) return false;
        try {
            let params = {
                QueueUrl: url ||  conf.sqs.url,
                AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible']
            };
            return await this.sqs.getQueueAttributes(params).promise();
        } catch (e) {
            console.log('mq:pending:', e);
            return false;
        }
    }
}

module.exports = new mq();