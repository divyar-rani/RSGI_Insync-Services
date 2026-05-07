# InSync
Insllion Backend Sync (InSync)
InsSync pushes the completed policies to the backend systems by passing the policy through a series of pipelined processes (sequenced but independant of each other). InSync involves three components
- Extractor - downloads completed policies from (one) insillion instance periodically or on trigger
- Consumers - Performs one operation on a policy (ex: convert to flat table, create consumer id from data etc)
- InSynNG - UI to track the progress

## Minimum requirement
- Node v14.x.y or above, preferred Node 16.x.y
- AWS SQS Queue with permissions
- Mysql 5.7 or above preferred 8.x

>Note: Mysql event scheduler must be enabled to remove stray locks

>Note: Create database with utf8 support
    `CREATE DATABASE IF NOT EXISTS dbname CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    `CREATE USER IF NOT EXISTS '$dbusername'@'localhost' IDENTIFIED BY '$dbpasswd';`
    `CREATE USER IF NOT EXISTS '$dbusername'@'127.0.0.1' IDENTIFIED BY '$dbpasswd';`
    `GRANT ALL PRIVILEGES ON dbname.* to '$dbusername'@'localhost';`
    `GRANT ALL PRIVILEGES ON dbname.* to '$dbusername'@'127.0.0.1';`

# Extractor and InSyncNG
### Installation
- Clone the insync folder to destination folder.
- Go to the installation folder and run "npm install"
- Copy the setup/insync.service file /usr/lib/systemd/system folder and adjust the Environment variables accorrdingly.
- Start the service as administrator `systemctl start insync`
- wget "http://127.0.0.1:8097/upgrade"
- Watch console outputs by running `journalctl -f -u insync`

### Configuration
Initial (default) configuration is picked-up from ./config.js folder and environment variables override the configurations in-memory (not stored). Do not modify the ./config.js file as this will get overwritten at the time of application upgrade.

`set IS_XXX_YYYY` or `ENVIRONMENT INS_XXX_YYYY=` to a particular property

**CUST_CONFIG** Location extractor custom configuration file (refer to custom.js)

**IS_SQS_URL**: The entry point (of the pipeline) queue is a mandatory parameter and must point to entire queue URL.
**IS_SQS_REGION** The AWS region of the queue
**IS_SQS_KEY/IS_SQS_SECRET** Key/secret combination to access queue (on-prem)
**IS_SQS_IAMROLE** IAM role that has access to the qeueue (on EC2 instances)

**IS_STATSD_HOST/IS_STATSD_PORT/IS_STATSD_PROTOCOL** The server that collects statistics (leave it to default)

**IS_TMP** The temperorary folder under which log files and error information are collected (periodic cleaning is required).

**IS_PORT** The port at which InSyncNG will listen (for administration), default: 8097

#### SQS Queue
Create a SQS queue in Amazon SQS console
 - Choose standard queue
 - Make the visibility timeout as 20 seconds
 - Increase message retention period to 8 days
 - Reduce the maximum message size to 4K
 - Update access policy accordingly (ex: 884682301008,arn:aws:iam::884682301008:user/sqsuser)

**If you have trouble accessing the queue stats (Access Denied), add the user to owner_statement in "Access Policy" section in AWS SQS Management page**

#### Extraction configuration
The Insillon server and policy related configurtions must be created for the extractor to start downloading policies. This will be loaded from file using environment variable **CUST_CONFIG**


> **Note**: This is not downloaded as part of cloning and must be created manually. This file will not be over-written by upgrades.

custom.js
```
module.exports = {
    policy: {
        name: 'policy',
        server: 'https://demo.insillion.com',
        user: 'admin',
        pass: "xyz",
        mpwd: "MD5 of password",
        token: '',
        ws: 'ws://127.0.0.1:8085',
        batch_interval: 60*1000,
        trace: true,

        sqs: {
            url: 'https://sqs.ap-south-1.amazonaws.com/687136252788/insync-sell'
        },

        preprocess: {
            nulls_to_empty: true,
            // remove_nulls: true,
            boolean_to_string: true,
            true_string: 'True',
            false_string: 'False',
            in_date_format: 'MM/DD/YYYY',
            dates: [
                {path: 'quote.data.self_dob', infmt: 'MM/DD/YYYY', outfmt: 'DD/MM/YYYY', products: ['M100000000005', 'M100000000006']},
            ]
        },

        edit: {
            "Leisure Travel Accident": {
                fields: [
                    {name: 'First name', jpath: 'proposal.data.first_name', type: 'string', cellid: ''}
                ]
            }
        }
    }
}
```

Each top level item, `policy` in the above definition, is considered as a batch to the executed. Each batch is started in sequence with a gap of 5 seconds between each. After completing a batch successfully a wait time of `batch_interval` is applied before checking for next set of policies. A maximum of 512 policies will be downloaded everytime and if the batch download has more than 512 entries, the wait time is reduced to 10 seconds.

**sqs.url** must point to the entry point queue URL (all other SQS parameters are loaded from environment variables).

**server,user,mpwd** Points to the source Insillion server

##### State
A state is stored against the policy_id, as part of passing through the pipeline, starting from `downloaded` state. If policy is in-complete (that is, has not policy number), then it will simply be marked as completed (with a log entry of skipped). 
> **NOTE**: The state is not used by the pipeline to decide actions.

-**downloaded** - On successful download of policy (requeuq not needed, as it will retried automatically)
-**purgatory** - Policy data download failed or failed to add to the local database (requeue needed).
-**completed** - Policy integration completed successfully.
-**queued** - Added to the first queue in the pipeline

##### Requeue
Any policy that is not in "completed" state can be requeued and it will start the pipeline from "downloaded" state.
>**Note:** the policy may already be in the pipeline and requeue will start another (parallel) sequence of pipelines. The consumers are designed to be tolerent to reprocessing same policy multiple times. However, running one policy multiple times at same time at same state may result in calling the back end APIs multiple times. To prevent this, a lock gets added at the policy+consumer level and prevents same consumer from processing same policy parallely. Lock has automatic unlock after 3 minutes of wait time, ensure that every consumer stage is completed well with in 3 minutes.


### Adding users to access InSynNG portal
UI has not (yet) been provided to create users, run the following command in mysql command line tool
`insert into is_auth(email, mpwd) values ('uw', md5('test'));`


# Consumers
The InSync pipeline starts with one Extractor that pushes a policy_id to the entry queue and sequences of consumers each with a source queue and destination queues (typically, one destination queue). Each consumer performs one task (or one stage) and moves the policy to target queue or marks as error. When a policy has hit an error state, it will no longer be processed unless a manual intervention requeues it. When a consumer has no target queue specified, the policy is marked as completed.

### Transformer
InSync uses twig as data transform utility and provides a base class that comes with all necessary plumbing to write a consumer with very minimal code. The twig transformer is a java based module and can executed locally or as EC2 lambda function.

### Folder structure
- insync
    - consumers
		- common
			- twigbase.js
			- utils.js
		- consumer-x
		    - index.js
		- consumer-y
		    - index.js
	- twigs
		- twig-file-1.twig
		- twig-file-2.twig
    - configs
        - UAT
            - instance1.config.js
            - instance1.consumers.js
        - Prod
            - instance1.config.js
            - instance1.consumers.js

>Note: The twig files can be stored anywhere. Bunch of consumers are provided as part of standard installation, which will get over-writter on every upgrade. Ensure that your consumers are not part of git repository if maintained independantly.

### Consumer configuration
One consumer, at the root level of consumers, holds all consumer's configuration information. In future, this may be split into individual configuration file.
```
const conf = {
    tmp: 'z:\\',
    ignore: ['Marine Master Policy'],
    whitelist: [],
	
    consumer1: {
        name: "consumer1",
        sqs: {
            srcUrl: 'https://sqs.ap-south-1.amazonaws.com/884682301008/insync-iunit',
            region: 'ap-south-1'
        },
        constants: {name: value},
        services: [
            {
                name: 'client-create',
                products: ['all'],
                subproduct: "quote.data.subproduct",
                twigs: ['c:\\ganesh\\git\\insync\\twigs\\CCRequest.twig'],
                sqs: {
                    dstUrl: 'https://sqs.ap-south-1.amazonaws.com/884682301008/insync-twig-iunit',
                    region: 'ap-south-1',
                },
                target: {
                    method: 'POST',
                    headers: {'Content-Type': "text/xml; charset=UTF-8"},
                    url: 'http://127.0.0.1:8099/cxf/CCService',
                    type: 'soap',
                    errorPath: ['soap:Envelope.soap:Body.addCustomerResponse.AddCustomerResult.ns2:ErrorText'],
                    ignoreErrors: true,
                    attributes: [
                        {
                            xpath: 'soap:Envelope.soap:Body.addCustomerResponse.AddCustomerResult.ns2:ID', 
                            name: 'gc_cust_id', 
                            mandatory: true
                        }
                    ]
                }
            }
        ],
    },


}
module.exports = conf;
```
`config.twig.url` set this to point to local twig transformer (if needed).
`config.twig.lambda` set lambda parameters if the twig transformer is deployed as lambda function.
`config.ignore` list of products that will not be processed by this consumer. It gets marked as completed immediately. Typically set at the first consumer level to ignore products that we are not going to handle as part of this installation.
`config.whitelist` list of products that will be processed by this consumer, all other products will be ignored and gets marked as completed immediately. Typically set at the first consumer level to allow products that we are going to handle as part of this installation. Leave empty array to allow all (non-ignored list).

#### Twig-XML based Consumer
Consumer configuration gets added as top level object in above config.js with a unique name (in this case **consumer1**). The `name` member must match the top level object name.

**consumer1.name** - Name of the consumer. Some log entries will use this as part of message
**consumer1.sqs.srcUrl** - The source queue URL
**consumer1.sqs.reqion** - The source queue AWS region

**consumer1.constatns** - points to set of name/value pair that would be passed in (as part of primary data object) to the twig transformers (they can be directly used in Twigs as {{name}}). Order of precedence for a variable is **"service level constant, if not found consumer level constant, if not found policy level variable"**

Every consumer has one or more service definition to which this policy is sent. The sample above has one service definition. Multiple service definition is used when need to perform different services based on products.

**consumer1.services[0].name** - Name of the service (stored as mod-name in log files). This name is also used to mark the state of the policy (ex: **consumer1-failed**)

**consumer1.services[0].products** - List of product names for which this service will be applied. The service is simply ignored if the policy belongs to different products.
>Note A special case name 'all' can be used

**consumer1.services[0].subproduct** - Name of JSON member that refers to sub product name. If found, sub-product name will get appended with product name separated by - (ex: Commvercial Vehicle - GCV). The combined name will be used in the product filter stage.

**consumer1.service[0].if** - A valid Javascript expression that qualifies if the given service should be used or skipped (ex: if: "quote.data.nstp_case == 'Yes'")

**consumer1.service[0].constants** - service level constants that will be passed on to the Twig transformers, only for products that qualify for this service.

**consumer1.services[0].twigs** - Array of twig files, used as source for transformation. Each transformed content is stored as part of array named "rendered" and can be used in subsequent twig files with array index ex: {{rendered[0]}}. The array order is preeserved and transformation is performed in natural array order.
>NOTE: (Only) The last twig file output is used as data for the target web services.

**consumer1.services[0].target.url** - The target web service that gets the out of twig transformation (if more than one twig file specified, only the last twig file's output is used). The web-servcice (successfull, 200 OK) return value is parsed as valid XML. The returned XML is converted into JSON with equivalent key names and used in further processing.

**consumer1.services[0].target.headers** - These entries will be passed as additional headers when the web-service is invoked.

**consumer1.services[0].target.type** - soap|json - defaults to soap

**consumer1.services[0].target.errorPath** -  Zero or more json paths of the error message. If an entry is found in web-service returned data, the web-service invocation is considered to be failure (and will get state as such). However **consumer1.service[0].target.ignoreErrors** can be set to true to alter this behaviour.

**consumer1.services[0].target.ignoreErrors** - All errors found using 
`consumer1.service[0].target.errorPath` are logged and ignored.

**consumer1.services[0].target.attributes** One or more object describing the output varialbles that we are interested in (from the output of web-service). 

**consumer1.services[0].target.attributes[0].xpath** The JSON path of the variable to be extracted from the output.

**consumer1.services[0].target.attributes[0].name** - The extracted value gets stored as attribute against the policy (to be used by subsequent consumers) with this name.

**consumer1.services[0].target.attributes[0].mandatory** - When set to true, the extracted value must exists otherwise the web-service invocation is considered as failure. Defaults to false.


### Typical consumer flow
A consumer waits on a queue (in polling mode) with a timeout of 20 seconds. Any policy added during this 2o seconds will immediately trigger processing and consumer immediately goes back to the wait mode without any delay. However, if no policy has been found in 20 seconds, a delay of 15 seconds is introduced before retrying again.

When a policy id is retrieved from the queue, its put through sequence of steps
1. Passed though each service in the services section in the config
	- A check is made against the product list in the service config
	- Consumer sepecific **_process_service** function is invoked with service and policy as parameters and true return value is awaited. If this function returns false, the entire process is abandoned
	- If no destination queue URL is specified, the policy gets marked as **completed**.
	- If a destination queue URL is specified, the policy id is pushed into that queue.
2. If none of the services were able to process this policy, it gets marked as skipped


### Typpical consumer code
```
const { workerData, parentPort } = require('worker_threads');
const twigbase = require('../common/twigbase');
const moment = require('moment');

class client extends twigbase {

	async __add_additional_data(policy) {
		policy.transaction_time = moment().format('DD/MM/YYYY hh:mm:ss A');
	}

    async _process_service(service, policy) {
        if (await this.__check_service_status(service, policy)) return true;
		
		await this.__add_additional_data(policy);

        let ndata = await this.__transform_all(service, policy);
        if (ndata === null) return false;

        if (!(await this.__call_service(service, policy, ndata[ndata.length-1], null, policy.policy_id))) {
            return false;
        }
        return true;
    }
}

(new client('clcreate')).run(workerData);
```

This consumer performs one service call per policy. 
- Checks (**__check_service_status**) and ensures that we have not completed this consumer by checking all mandatory attributes (if present, considered as stage completed).
- Any (optional) custom data gets added to the policy JSON (only in memory, noy stored in the database). The twig files are expected to consume policy JSON object as such. In some cases, twig may not support the data maniputation needed.
- Calls the **__transform_all** function from the base class to get the converted XML file using the value added policy json from pervious step.
- Calls the back end web service using base class function **__call_service** with the transformed data.

In some special cases, same service may have to be invoked multiple times (ex: every part payment must be registered individually). Use the following code structure to acheive the same.

**Partial code snippet for multiple web-services call per Consumer service.
**
```
class receipt extends twigbase {

    async _process_service(service, policy) {
        let attrs = await this.ish.get_attrs(policy.policy_id);
		
        // try and get every array of payment details with processed information
		// attrs holds data retreived from previous consumers
		//
        let pds = await (new payment()).__prepare_data(policy, attrs);
        if (pds === null) {
            await this.ish.__state(policyId, this.constructor.name'-failed');
            this.ish.__log('error', this.ish.name+':policy has no payment information', policy.policy_id, this.constructor.name);
            return true;
        }

        for (let pd of pds) {
            let subid = pd.payment_details_id;
            if (!await this.__check_service_status(service, policy, subid)) {
                let ndata = await this.__transform_all(service, policy, pd);
                if (ndata === null) return false;
    
                if (!await this.__call_service(service, policy, ndata[ndata.length-1], subid, subid)) {
                    return false;
                }
            }
        }
        return true;
    }
}
```
- This sample shows how to records failure state and log error information.
- A way to check if each payment web-service has been completed. Note the subid that gets added to every attribute extracted. For example in this case the receipt number for a particular payment detail gets stored as **gc_receipt_no-PD00000001020**.
- A way to call same web-service with multiple times, with subid (in this case payment_details_id) as key

>Note: There is a last paramter to **__call_service** function that is used by the simulator to test. You can ignore that.

#### Running a consumer as service
Adapt insconsumer.service under setup folder and create one service file per consumer.


### Custom Query
policy_issued:policy ids by issued date
start,end
select policy_id,policy_no,issue_date,product_id,product_group_id from in_policy where issue_date>=? and issue_date<=?

policy_paid: policy details by payment date
start,end
select payment_details_id,payment_id,pay_date,c_ts from in_payment_details where c_ts>=? and c_ts<=?
