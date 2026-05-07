const { SQSClient, ReceiveMessageCommand, SendMessageCommand, DeleteMessageCommand, ChangeMessageVisibilityCommand } = require('@aws-sdk/client-sqs');
const { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');

const qparams = {
  region: process.env.IS_SQS_REGION || '',
  iamRole: process.env.IS_SQS_IAMROLE || '',
  accessKeyId: process.env.IS_SQS_KEY || '',
  secretAccessKey: process.env.IS_SQS_SECRET || '',
  sessionToken: undefined
};

class mq {
  constructor(queuUrl, targUrl) {
    this.queuUrl = queuUrl;
    this.targUrl = targUrl;
    this.sqs = null;
    this._setup_mq();
  }

  _setup_mq() {
    if (qparams.iamRole) {
      this._do_sts_token();
    } else {
      this._sqs();
    }
  }

  _sqs() {
    this.sqs = new SQSClient({
      region: qparams.region,
      credentials: {
        accessKeyId: qparams.accessKeyId,
        secretAccessKey: qparams.secretAccessKey,
        sessionToken: qparams.sessionToken
      }
    });
  }

  async _assume_role(roleArn, region) {
    const sts = new STSClient({ region });
    const command = new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: 'InsillionSTS',
      DurationSeconds: 3600
    });
    const ret = await sts.send(command);
    return ret.Credentials;
  }

  async token(obj) {
    if (!obj || !obj.iamRole) return;
    try {
      const creds = await this._assume_role(obj.iamRole, obj.region);
      const sts = new STSClient({ credentials: creds });
      await sts.send(new GetCallerIdentityCommand({}));
      obj.accessKeyId = creds.AccessKeyId;
      obj.secretAccessKey = creds.SecretAccessKey;
      obj.sessionToken = creds.SessionToken;
      console.log('got sts session token');
    } catch (e) {
      console.error(e);
    }
  }

  async _do_sts_token() {
    await this.token(qparams);
    this._sqs();
    setTimeout(() => this._do_sts_token(), 10 * 60 * 1000);
  }

  async fetch(count = 1) {
    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: this.queuUrl,
        MaxNumberOfMessages: count,
        MessageAttributeNames: ['All'],
        WaitTimeSeconds: 20
      });
      return await this.sqs.send(command);
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  async reschedule(handle, time) {
    try {
      const command = new ChangeMessageVisibilityCommand({
        QueueUrl: this.queuUrl,
        ReceiptHandle: handle,
        VisibilityTimeout: time
      });
      return await this.sqs.send(command);
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  async delet(handle) {
    try {
      const command = new DeleteMessageCommand({
        QueueUrl: this.queuUrl,
        ReceiptHandle: handle
      });
      return await this.sqs.send(command);
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  async _post_queue(policyId, queueUrl) {
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: policyId,
      MessageAttributes: {
        policy_id: { DataType: 'String', StringValue: policyId }
      }
    });
    await this.sqs.send(command);
  }

  async post(data, qurl) {
    try {
      qurl = qurl || this.targUrl;
      if (Array.isArray(qurl)) {
        for (const url of qurl) {
          await this._post_queue(data.policy_id, url);
        }
      } else if (qurl) {
        await this._post_queue(data.policy_id, qurl);
      }
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }
}

module.exports = mq;
