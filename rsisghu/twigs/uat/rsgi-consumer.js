const conf = {
    twig: {
        url: "",
        lambda: {
            region: 'ap-south-1',
            funcName: 'godb-twig-transform-function'
        }
    },
    delay: 3 * 1000,
    tmp: '/mnt/ebs1/tmp/is_rsisghu',
    // simulator: 'http://127.0.0.1:8099/cxf/',
    ignore: [''],
    whitelist: ['ghealth', 'gpa'],
    httpOptions: { rejectUnauthorized: false, timeout: 3 * 60 * 1000 },
    constants: {
    },
    queues: {
        entry: { url: 'https://sqs.ap-south-1.amazonaws.com/920043513072/uat-rsgi-entry', region: 'ap-south-1' },
        client: { url: 'https://sqs.ap-south-1.amazonaws.com/920043513072/uat-rsgi-coverage' },
        fgenPolicy: { url: 'https://sqs.ap-south-1.amazonaws.com/920043513072/uat-rsgi-policy' },
        fgenRen: { url: 'https://sqs.ap-south-1.amazonaws.com/920043513072/uat-rsgi-claims' },
        insillion: { url: 'https://sqs.ap-south-1.amazonaws.com/920043513072/uat-rsgi-insillion' },
    },

    basePath: "/mnt/ebs1/rsisghu/twigs",
    errorClass: "/mnt/ebs1/rsisghu/twigs/error-class.js",
    retryOn: {
        "%<faultstring>Authentication failed</faultstring>%": 1,
        "%502 Bad Gateway%": 30,
        "%ECONNRESET%": 30,
        '%Could not send Message%': 1,
        "%504 Gateway Time-out%": 1,
        "%Technical Error Occured%": 1,
        "socket-timeout exception": 1,
    },
    max_retries: 10,
    client: {
        name: "client",
        sqs: { name: 'entry' },
        preprocess: { nulls_to_empty: true, skip_yes_no: true },
        services: [
            {
                name: 'client-create',
                products: ['gpa', 'ghealth'],
                twigs: ['/mnt/ebs1/rsisghu/twigs/clientCreation.twig'],                
                if: "(policy?.proposal?.data?.client_type?.trim() && policy?.proposal?.data?.customer_type?.trim() && policy?.proposal?.data?.cust_buss_type?.trim() && (policy?.proposal?.data?.client_type !== 'Existing' || policy?.proposal?.data?.customer_type === 'New') && policy?.proposal?.data?.cust_buss_type !== 'Entity')",
                disable_cache: true,
                target: {
                    method: 'POST',
                    headers: { 'Content-Type': "application/soap+xml; charset=UTF-8" },
                    url: 'https://fgapi.royalsundaram.net/FirstGenV7/services/doIndividualPartyCreate',
                    errorPath: {
                            xnode: 'status',
                            mandatory: true
                    },                    
                    ignoreErrors: true,
                    attributes: [
                        {
                            xnode: 'partyId',
                            name: 'client_id',
                            mandatory: true
                        }
                    ]
                }
            },
            {
                name: 'client-create',
                products: ['gpa', 'ghealth'],                
                twigs: ['/mnt/ebs1/rsisghu/twigs/clientCreation.twig'],
                if: "((policy?.proposal?.data?.client_type !== 'Existing' || policy?.proposal?.data?.customer_type === 'New') && (policy?.proposal?.data?.cust_buss_type === 'Entity'))",
                disable_cache: true,
                sqs: { name: 'client' },                
                target: {
                    method: 'POST',
                    headers: { 'Content-Type': "application/soap+xml; charset=UTF-8" },
                    url: 'https://fgapi.royalsundaram.net/FirstGenV7/services/doCorporatePartyCreate',
                    errorPath: {
                            xnode: 'status',
                            mandatory: true
                    },
                    ignoreErrors: true,
                    attributes: [
                        {
                            xnode: 'partyId',
                            name: 'client_id',
                            mandatory: true
                        }
                    ]
                }
            },

        ],
    },

   fgenPolicy: {
        name: "fgenPolicy",
        sqs: { name: 'client' },
        preprocess: { nulls_to_empty: true, skip_yes_no: true },
        services: [
            {
                name: 'gpa-fgenPolicy',
                products: ['gpa'],
                twigs: ['/mnt/ebs1/rsisghu/twigs/policy-gpa.twig'],
                if: "(policy.proposal.data.policy_transaction_type === 'New Business' || policy.proposal.data.policy_transaction_type === 'Market Renewal')",
                disable_cache: true,
                //sqs: { name: 'fgenPolicy' },
				sqs: {},
                target: {
                    method: 'POST',
                    headers: { 'Content-Type': "application/soap+xml; charset=UTF-8" },
                    url: 'https://fgapi.royalsundaram.net/FirstGenV7/services/doHealthNewBusiness?wsdl',
                    errorPath: [
                        {
                            xfunc: '__get_fg_err_status',
                            mandatory: true
                        }
                    ],
                    ignoreErrors: true,
                    attributes: [
                        {
                            xfunc: '__get_fg_status',
                            name: 'fgen_policy_no',
                            mandatory: true
                        }
                    ]
                }
            },
            {
                name: 'ghealth-fgenPolicy',
                products: ['ghealth'],
                twigs: ['/mnt/ebs1/rsisghu/twigs/policy-ghealth.twig'],
                if: "(policy.proposal.data.policy_transaction_type === 'New Business' || policy.proposal.data.policy_transaction_type === 'Market Renewal')",
                disable_cache: true,
                //sqs: { name: 'fgenPolicy' },
				sqs: {},
                target: {
                    method: 'POST',
                    headers: { 'Content-Type': "application/soap+xml; charset=UTF-8" },
                    url: 'https://fgapi.royalsundaram.net/FirstGenV7/services/doHealthNewBusiness?wsdl',
                    errorPath: [
                        {
                            xfunc: '__get_fg_err_status',
                            mandatory: true
                        }
                    ],
                    ignoreErrors: true,
                    attributes: [
                        {
                            xfunc: '__get_fg_status',
                            name: 'fgen_policy_no',
                            mandatory: true
                        }
                    ]
                }
            },

        ],
    },

     fgenRen: {
        name: "fgenRen",
        sqs: { name: 'fgenPolicy' },
        preprocess: { nulls_to_empty: true, skip_yes_no: true },
        services: [
            {
                name: 'gpa-fgenRen',
                products: ['gpa'],
                twigs: ['/mnt/ebs1/rsisghu/twigs/ren-gpa.twig'],
                if: "( policy.proposal.data.policy_transaction_type === 'Our Renewal')",
                disable_cache: true,
                sqs: {},
                target: {
                    method: 'POST',
                    headers: { 'Content-Type': "application/soap+xml; charset=UTF-8" },
                    url: 'https://fgapi.royalsundaram.net/FirstGenV7/services/doHealthRenewal?wsdl',
                    errorPath: [
                        {
                            xfunc: '__get_fg_ren_err_status',
                            mandatory: true
                        }
                    ],
                    ignoreErrors: true,
                    attributes: [
                        {
                            xfunc: '__get_fg_ren_status',
                            name: 'fgen_ren_policy_no',
                            mandatory: true
                        }
                    ]
                }
            },
            {
                name: 'ghealth-fgenRen',
                products: ['ghealth'],
                twigs: ['/mnt/ebs1/rsisghu/twigs/ren-ghealth.twig'],
                if: "( policy.proposal.data.policy_transaction_type === 'Our Renewal')",
                disable_cache: true,
                sqs: {},
                target: {
                    method: 'POST',
                    headers: { 'Content-Type': "application/soap+xml; charset=UTF-8" },
                    url: 'https://fgapi.royalsundaram.net/FirstGenV7/services/doHealthRenewal?wsdl',
                    errorPath: [
                        {
                            xfunc: '__get_fg_ren_err_status',
                            mandatory: true
                        }
                    ],
                    ignoreErrors: true,
                    attributes: [
                        {
                            xfunc: '__get_fg_ren_status',
                            name: 'fgen_ren_policy_no',
                            mandatory: true
                        }
                    ]
                }
            },

        ],
    },

  
	/* insillion: {
        name: "insillion",
        sqs: {name: 'fgenRen'},		
        services: [
            {
                name: 'revfeed',
                if: "(fgen_policy_no != '')",
                products: ['all'],
                twigs: [],
                sqs: {},
                disable_cache: true
            }
        ],
    }  */

}
if (process.env.IS_TMP) conf.tmp = process.env.IS_TMP;
module.exports = conf;
