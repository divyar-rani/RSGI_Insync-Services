const { SQSClient, ReceiveMessageCommand, SendMessageCommand, DeleteMessageCommand, ChangeMessageVisibilityCommand } = require('@aws-sdk/client-sqs');
const { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');

// Default region fallback if not provided in env vars

const qparams = {
  region: process.env.IS_SQS_REGION || '', // Set a default region
  iamRole: process.env.IS_SQS_IAMROLE || '',
  accessKeyId: process.env.IS_SQS_KEY || '',
  secretAccessKey: process.env.IS_SQS_SECRET || '',
  sessionToken: undefined
};

// Log configuration at startup to help debug
console.log('SQS Configuration:');
console.log('- Region:', qparams.region);
console.log('- IAM Role:', qparams.iamRole ? `${qparams.iamRole.substring(0, 10)}...` : 'Not configured');
console.log('- Using IAM Role:', !!qparams.iamRole);
console.log('- Using Access Keys:', !!qparams.accessKeyId);

class mq {
  constructor(queuUrl, targUrl) {
    this.queuUrl = queuUrl;
    this.targUrl = targUrl;
    this.timer = null;
    this.done = false;
    this.sqs = null;
    
    // Validate required configuration
    if (!qparams.region) {
      console.error("ERROR: AWS region must be set via IS_SQS_REGION environment variable");
    }
    
    if (!qparams.iamRole && (!qparams.accessKeyId || !qparams.secretAccessKey)) {
      console.error("ERROR: Either IAM role or access keys must be configured");
    }
    
    this._setup_mq();
  }

  _setup_mq() {
    // Ensure we have a region
    if (!qparams.region) {
      console.error("Missing region configuration. Cannot initialize SQS client.");
      return;
    }
    
    if (qparams.iamRole) {
      console.log("Using IAM role for authentication");
      this._do_sts_token();
    } else if (qparams.accessKeyId && qparams.secretAccessKey) {
      console.log("Using access keys for authentication");
      this._sqs_with_keys();
    } else {
      console.error("No valid authentication method configured");
    }
  }
  
  _sqs_with_keys() {
    try {
      this.sqs = new SQSClient({
        region: qparams.region,
        credentials: {
          accessKeyId: qparams.accessKeyId,
          secretAccessKey: qparams.secretAccessKey
        }
      });
      console.log("SQS Client initialized with access keys");
    } catch (error) {
      console.error("Failed to initialize SQS client with access keys:", error);
    }
  }
  
  async _sqs() {
    try {
      // Get credentials from the credentials property we set in token()
      if (!qparams.credentials) {
        console.error("No credentials available for SQS client");
        return;
      }
      
      this.sqs = new SQSClient({
        region: qparams.region,
        credentials: qparams.credentials
      });
      console.log("SQS Client initialized with assumed role");
    } catch (error) {
      console.error("Failed to initialize SQS client:", error);
    }
  }

  async _assume_role(roleArn, region) {
    if (!region) {
      throw new Error("Region is required for STS client");
    }
    
    if (!roleArn) {
      throw new Error("Role ARN is required for assuming role");
    }
    
    console.log(`Creating STS client in region ${region}`);
    const sts = new STSClient({ region });
    
    console.log(`Assuming role: ${roleArn}`);
    const command = new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: 'InsillionSTS',
      DurationSeconds: 3600,
    });
    
    const ret = await sts.send(command);
    console.log("Successfully assumed role");
    
    // Convert AWS response format to lowercase property names expected by SDK
    return {
      accessKeyId: ret.Credentials.AccessKeyId,
      secretAccessKey: ret.Credentials.SecretAccessKey,
      sessionToken: ret.Credentials.SessionToken,
      expiration: ret.Credentials.Expiration
    };
  }	
  
  async token(obj) {
    if (!obj || !obj.iamRole) {
      console.error("Missing required role configuration");
      return;
    }
    
    if (!obj.region) {
      console.error("Missing required region configuration");
      // Default to me-south-1 if missing
      obj.region = DEFAULT_REGION;
      console.log(`Defaulting to region: ${obj.region}`);
    }
    
    try {
      console.log(`Assuming role ${obj.iamRole} in region ${obj.region}`);
      const creds = await this._assume_role(obj.iamRole, obj.region);
      
      // Verify the credentials work by making a test call
      const sts = new STSClient({ 
        credentials: creds,
        region: obj.region
      });
      
      const identity = await sts.send(new GetCallerIdentityCommand({}));
      console.log(`Successfully verified credentials for: ${identity.Arn}`);
      
      // Store credentials directly in obj for _sqs to use
      obj.credentials = creds;
      console.log('Successfully got new STS token');
      return true;
    } catch (e) {
      console.error('STS token error:', e);
      throw e;  // Re-throw for proper handling in _do_sts_token
    }
  }
  
  async _do_sts_token() {
    try {
      await this.token(qparams);
      await this._sqs();
    } catch(e) {
      console.error('Refresh token error:', e);
    } finally {
      if (!this.done) {
        console.log("Scheduling token refresh in 30 minutes");
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
    if (this.timer) {
      console.log("SQS client already started");
      return; // already started
    }
    
    console.log("Starting SQS client");
    await this._do_sts_token();
  }

  stop() {
    console.log("Stopping SQS client");
    this.done = true;
    if (this.timer) clearTimeout(this.timer);
  }

  async fetch(count = 1) {
    try {
      if (!this.sqs) {
        console.error("SQS client not initialized");
        return false;
      }
      
      if (!this.queuUrl) {
        console.error("Queue URL not provided");
        return false;
      }
      
      const command = new ReceiveMessageCommand({
        QueueUrl: this.queuUrl,
        MaxNumberOfMessages: count,
        MessageAttributeNames: ['All'],
        WaitTimeSeconds: 20
      });
      return await this.sqs.send(command);
    } catch (e) {
      console.error("Error fetching messages:", e);
      return false;
    }
  }

  async reschedule(handle, time) {
    try {
      if (!this.sqs) {
        console.error("SQS client not initialized");
        return false;
      }
      
      const command = new ChangeMessageVisibilityCommand({
        QueueUrl: this.queuUrl,
        ReceiptHandle: handle,
        VisibilityTimeout: time
      });
      return await this.sqs.send(command);
    } catch (e) {
      console.error("Error rescheduling message:", e);
      return false;
    }
  }

  async delet(handle) {
    try {
      if (!this.sqs) {
        console.error("SQS client not initialized");
        return false;
      }
      
      const command = new DeleteMessageCommand({
        QueueUrl: this.queuUrl,
        ReceiptHandle: handle
      });
      return await this.sqs.send(command);
    } catch (e) {
      console.error("Error deleting message:", e);
      return false;
    }
  }

  async _post_queue(policyId, queueUrl) {
    if (!this.sqs) {
      console.error("SQS client not initialized");
      return false;
    }
    
    if (!queueUrl) {
      console.error("Queue URL not provided");
      return false;
    }
    
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
      if (!this.sqs) {
        console.error("SQS client not initialized");
        return false;
      }
      
      if (!data || !data.policy_id) {
        console.error("Invalid data: policy_id is required");
        return false;
      }
      
      qurl = qurl || this.targUrl;
      
      if (!qurl) {
        console.error("No target queue URL provided");
        return false;
      }
      
      if (Array.isArray(qurl)) {
        for (const url of qurl) {
          await this._post_queue(data.policy_id, url);
        }
      } else {
        await this._post_queue(data.policy_id, qurl);
      }
      return true;
    } catch (e) {
      console.error("Error posting message:", e);
      return false;
    }
  }
}

module.exports = mq;
