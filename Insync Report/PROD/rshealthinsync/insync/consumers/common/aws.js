const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');

class isaws {
  constructor() {
    this.twig = {
      lambda: {
        funcName: 'godb-twig-transform-function',
        region: process.env['IS_LAMBDA_REGION'] || 'me-south-1' // Default region from your logs
      },
      url: 'http://127.0.0.1:8096/gstwig/api/v1/transform'
    };
    this._setup_sts();
  }

  _setup_sts() {
    this.twig.lambda.accessKeyId = process.env['IS_LAMBDA_KEY'];
    this.twig.lambda.secretAccessKey = process.env['IS_LAMBDA_SECRET'];
    this.twig.lambda.region = process.env['IS_LAMBDA_REGION'] || this.twig.lambda.region;
    this.twig.lambda.iamRole = process.env['IS_LAMBDA_IAMROLE'];
    this.twig.lambda.funcName = process.env['IS_LAMBDA_FUNCNAME'] || this.twig.lambda.funcName;
    
    // Verify credentials are available before proceeding
    if (this.twig.lambda.region && this.twig.lambda.iamRole) {
      this._do_sts_token();
    } else {
      console.error("AWS credentials not found in environment variables");
    }
  }

  async _do_sts_token() {
    try {
      await this.token(this.twig.lambda);
      setTimeout(() => this._do_sts_token(), 10 * 60 * 1000);
    } catch (error) {
      console.error("Error refreshing STS token:", error);
      // Retry after shorter interval on failure
      setTimeout(() => this._do_sts_token(), 1 * 60 * 1000);
    }
  }

  _lambda() {
    if (!this.twig.lambda.region) {
      throw new Error('AWS region is not configured');
    }
    
    // Check if we have valid credentials before creating client
    if (!this.twig.lambda.accessKeyId || !this.twig.lambda.secretAccessKey) {
      throw new Error('AWS credentials are missing');
    }
    
    const credentials = {
      accessKeyId: this.twig.lambda.accessKeyId,
      secretAccessKey: this.twig.lambda.secretAccessKey
    };
    
    // Only add sessionToken if it exists
    if (this.twig.lambda.sessionToken) {
      credentials.sessionToken = this.twig.lambda.sessionToken;
    }
    
    return new LambdaClient({
      region: this.twig.lambda.region,
      credentials: credentials
    });
  }

  async _assume_role(roleArn, region) {
    if (!region) {
      throw new Error('Region must be specified for STS assume role');
    }
    
    // Make sure we have base credentials to assume the role
    /*if (!this.twig.lambda.accessKeyId || !this.twig.lambda.secretAccessKey) {
      throw new Error('Base AWS credentials are required to assume a role');
    }*/
    const stsClient = new STSClient({region: region});
    const command = new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: 'InsillionSTS',
      DurationSeconds: 3600
    });
    
    const response = await stsClient.send(command);
    
    /*this.twig.lambda.accessKeyId = response.Credentials.AccessKeyId;
    this.twig.lambda.secretAccessKey= response.Credentials.secretAccessKey;
    const stsClient = new STSClient({ 
      region: region,
      credentials: {
        accessKeyId: this.twig.lambda.accessKeyId,
        secretAccessKey: this.twig.lambda.secretAccessKey
      }
    });*/
        
    if (!response.Credentials || !response.Credentials.AccessKeyId) {
      throw new Error('Failed to obtain credentials from assumed role');
    }
     
    return response.Credentials;
  }

  async token(obj) {
    if (!obj || !obj.iamRole) {
      console.log("No IAM role specified, skipping token assumption");
      return;
    }
    
    if (!obj.region) {
      obj.region = this.twig.lambda.region || 'me-south-1';
      console.log(`Using region ${obj.region} for token assumption`);
    }
    
    try {
      // Log the role we're trying to assume
      console.log(`Attempting to assume role: ${obj.iamRole} in region ${obj.region}`);
      
      const creds = await this._assume_role(obj.iamRole, obj.region);
      
      // Verify the credentials we received
      console.log(`Received temporary credentials, validating...`);
      
      const sts = new STSClient({ 
        region: obj.region,
        credentials: {
          accessKeyId: creds.AccessKeyId,
          secretAccessKey: creds.SecretAccessKey,
          sessionToken: creds.SessionToken
        }
      });
      
      const identity = await sts.send(new GetCallerIdentityCommand({}));
      console.log(`Successfully validated credentials for: ${identity.Arn}`);
      
      // Store the credentials
      obj.accessKeyId = creds.AccessKeyId;
      obj.secretAccessKey = creds.SecretAccessKey;
      obj.sessionToken = creds.SessionToken;
      obj.credentialsExpiration = creds.Expiration;
      
      console.log(`Token refreshed, valid until: ${creds.Expiration}`);
    } catch (e) {
      console.error('Token assumption error:', e);
      throw e; // Re-throw to allow proper handling in the caller
    }
  }

  async transform(data) {
    try {
      // If we don't have valid credentials yet, try to get them
      if (!this.twig.lambda.accessKeyId || !this.twig.lambda.secretAccessKey) {
        console.log("No valid credentials available, attempting to refresh");
        await this.token(this.twig.lambda);
      }
      
      const lambda = this._lambda();
      const command = new InvokeCommand({
        FunctionName: this.twig.lambda.funcName,
        Payload: JSON.stringify(data)
      });
      
      console.log(`Invoking Lambda function: ${this.twig.lambda.funcName}`);
      const response = await lambda.send(command);
      
      // Handle different response formats safely
      let payload;
      try {
        payload = JSON.parse(new TextDecoder().decode(response.Payload));
      } catch (error) {
        console.error("Error parsing Lambda response:", error);
        throw new Error("Invalid response from Lambda function");
      }
      
      if (response.StatusCode === 200 && !response.FunctionError) {
        return payload;
      }
      
      throw new Error(payload?.errorMessage || 'Lambda function error');
    } catch (error) {
      console.error('Transform error:', error);
      throw error;
    }
  }
}

module.exports = new isaws();
