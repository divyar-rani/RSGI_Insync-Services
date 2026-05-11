const conf = {
    twig: {
        url: "",
        lambda: {
            region: 'ap-south-1',
            funcName: 'godb-twig-transform-function'
        }
    },
    delay: 3 * 1000,
    tmp: '/mnt/ebs1/tmp/is_rshealthendt',
    // simulator: 'http://127.0.0.1:8099/cxf/',
    ignore: [''],
    whitelist: ['ghealth', 'gpa'],
    httpOptions: { rejectUnauthorized: false, timeout: 3 * 60 * 1000 },
    constants: {
    },
	queues: {
		entry: { url: 'https://sqs.ap-south-1.amazonaws.com/920043513072/prod-eiib-rsgi-entry', region: 'ap-south-1'  },
		policydata: { url: 'https://sqs.ap-south-1.amazonaws.com/920043513072/prod-eiib-rsgi-policy' },
        // policydata: { url: 'https://sqs.ap-south-1.amazonaws.com/920043513072//prod-eiib-rsgi-client' },
		insillion: { url: 'https://sqs.ap-south-1.amazonaws.com/920043513072/prod-eiib-rsgi-insillion' },
	},

    basePath: "/mnt/ebs1/rshealthendt/twigs",
    errorClass: "/mnt/ebs1/rshealthendt/twigs/error-class.js",
    retryOn: {},
    max_retries: 10,
    policydata: {
        name: "policydata",
        sqs: {name: 'entry'},
        services: [],
    }

}
if (process.env.IS_TMP) conf.tmp = process.env.IS_TMP;
module.exports = conf;
