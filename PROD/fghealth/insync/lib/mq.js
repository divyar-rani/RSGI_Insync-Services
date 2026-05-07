const { SQSClient, ReceiveMessageCommand, SendMessageCommand, DeleteMessageCommand, GetQueueAttributesCommand } = require('@aws-sdk/client-sqs');
const { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
const conf = require('../config');

class mq {
  constructor() {
    console.log('queue region:', conf.sqs.region);
    this.timer = null;
    this.done = false;
    this.sqs = null;
    this._setup_mq();
  }

  _setup_mq() {
    if (conf.sqs.iamRole) {
      this._do_sts_token();
    } else {
      this._sqs();
    }
  }

  async _do_sts_token() {
    try {
      await this.token(conf.sqs);
      this._sqs();
    } catch(e) {
      console.log('refresh-token error:', e);
    } finally {
      if (!this.done) {
        this.timer = setTimeout(async () => {
          if (!this.done) this._do_sts_token();
        }, 30 * 60 * 1000);
      } else {
        this.timer = null;
      }
    }
  }

  // made it reentrant safe
  async start() {
    if (this.timer) return; // already started
    await this._do_sts_token();
  }

  stop() {
    this.done = true;
    if (this.timer) clearTimeout(this.timer);
  }

  async _sqs() {
    try {
      const creds = await this._assume_role(conf.sqs.iamRole, conf.sqs.region);
      console.log("SQS Credentials ready, AccessKey prefix:", 
                creds.accessKeyId.substring(0, 5) + "...");
      
      this.sqs = new SQSClient({
        region: conf.sqs.region,
        credentials: creds
      });
      console.log("SQS Client initialized successfully");
    } catch (error) {
      console.error("Failed to initialize SQS client:", error);
    }
  }

  async _assume_role(roleArn, region) {
    if (!region) {
      throw new Error("Region is required for STS client");
    }
    
    const sts = new STSClient({ region });
    const command = new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: 'InsillionSTS',
      DurationSeconds: 3600,
    });
    
    const ret = await sts.send(command);
    
    // Convert AWS response format to lowercase property names expected by SDK
    return {
      accessKeyId: ret.Credentials.AccessKeyId,
      secretAccessKey: ret.Credentials.SecretAccessKey,
      sessionToken: ret.Credentials.SessionToken,
      expiration: ret.Credentials.Expiration
    };
  }

  async token(obj) {
    if (!obj || !obj.iamRole || !obj.region) {
      console.error("Missing required role or region configuration");
      return;
    }
    
    try {
      console.log(`Assuming role ${obj.iamRole} in region ${obj.region}`);
      const creds = await this._assume_role(obj.iamRole, obj.region);
      
      // Verify the credentials work by making a test call
      const sts = new STSClient({ 
        credentials: creds,
        region: obj.region
      });
      
      await sts.send(new GetCallerIdentityCommand({}));
      
      // Store credentials in obj (used by _sqs later)
      obj.credentials = creds;
      console.log('Successfully got new STS token');
      return true;
    } catch (e) {
      console.error('STS token error:', e);
      throw e;  // Re-throw for proper handling in _do_sts_token
    }
  }

  async fetch(qurl, count = 1) {
    try {
      if (!this.sqs) {
        console.error("SQS client not initialized");
        return false;
      }
      
      const command = new ReceiveMessageCommand({
        QueueUrl: qurl,
        MaxNumberOfMessages: count,
        MessageAttributeNames: ['All'],
        WaitTimeSeconds: 20,
      });
      return await this.sqs.send(command);
    } catch (e) {
      console.error("Error fetching messages:", e);
      return false;
    }
  }

  async post(def, data, qurl) {
    try {
      if (!this.sqs) {
        console.error("SQS client not initialized");
        return false;
      }
      
      const command = new SendMessageCommand({
        QueueUrl: qurl || def.sqs?.url || '',
        MessageBody: data.policy_id,
        MessageAttributes: {
          policy_id: { DataType: 'String', StringValue: data.policy_id },
        },
      });
      return await this.sqs.send(command);
    } catch (e) {
      console.error('mq:post:', e);
      return false;
    }
  }

  async delet(handle, url) {
    try {
      if (!this.sqs) {
        console.error("SQS client not initialized");
        return false;
      }
      
      const command = new DeleteMessageCommand({ 
        QueueUrl: url, 
        ReceiptHandle: handle 
      });
      return await this.sqs.send(command);
    } catch (e) {
      console.error('Error deleting message:', e);
      return false;
    }
  }

  async pending(url) {
    try {
      if (!this.sqs) {
        console.error("SQS client not initialized");
        return false;
      }
      
      const command = new GetQueueAttributesCommand({
        QueueUrl: url || conf.sqs.url,
        AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible'],
      });
      return await this.sqs.send(command);
    } catch (e) {
      console.error('mq:pending:', e);
      return false;
    }
  }
}

module.exports = new mq();
