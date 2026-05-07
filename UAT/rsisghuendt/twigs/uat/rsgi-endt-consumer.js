const conf = {
	twig: {
		url: "",
		lambda: {
			region: 'ap-south-1',
			funcName: 'godb-twig-transform-function'
		}
	},
	delay: 3 * 1000,
	tmp: '/mnt/ebs1/tmp/is_rsisghuendt',
	whitelist: ['ghealth', 'gpa'],
	httpOptions: { rejectUnauthorized: false, timeout: 2 * 60 * 1000 },
	constants: {},
	queues: {
		entry: { url: 'https://sqs.ap-south-1.amazonaws.com/920043513072/uat-rsgi-endt-entry', region: 'ap-south-1' },
		//client: { url: 'https://sqs.ap-south-1.amazonaws.com/920043513072/uat-rsgi-endt-client' },
		fgenEndt: { url: 'https://sqs.ap-south-1.amazonaws.com/920043513072/uat-rsgi-endt-policy' },
		insillion: { url: 'https://sqs.ap-south-1.amazonaws.com/920043513072/uat-rsgi-endt-insillion' },
	},
	basePath: "/mnt/ebs1/rsisghuendt/twigs",
	errorClass: "/mnt/ebs1/rsisghuendt/twigs/error-class.js",
	retryOn: {
		"%<faultstring>Authentication failed</faultstring>%": 1,
		"%502 Bad Gateway%": 10,
		"%ECONNRESET%": 10,
		"%UnCategorised Error::Error in PolicyPosting%": 10
	},
	max_retries: 10,
	fgenEndt: {
		name: "fgenEndt",
		sqs: { name: 'entry' },
		preprocess: { nulls_to_empty: true, true_string: 'True', false_string: 'False', xmlescape: true, in_date_format: 'DD/MM/YYYY' },
		services: [
			{
				name: 'ghealth-fgenEndt',
				products: ['ghealth'],
				twigs: ['/mnt/ebs1/rsisghuendt/twigs/endt-ghealth.twig'],
				sqs: {},
				disable_cache: true,
				target: {
					method: 'POST',
					headers: { 'Content-Type': "application/soap+xml; charset=UTF-8" },
					url: 'https://fgapi.royalsundaram.net/FirstGenV7/services/doHealthEndorsement?wsdl',
					errorPath: [
						{
							xfunc: '__get_fg_endt_err_status', mandatory: true
						}
					],
					ignoreErrors: false,
					attributes: [
						{
							xfunc: '__get_fg_endt_status',
							name: 'fgen_endt_policy_no',
							mandatory: true
						}
					]
				}
			},

			{
				name: 'gpa-fgenEndt',
				products: ['gpa'],
				twigs: ['/mnt/ebs1/rsisghuendt/twigs/endt-gpa.twig'],
				sqs: {},
				disable_cache: true,
				target: {
					method: 'POST',
					headers: { 'Content-Type': "application/soap+xml; charset=UTF-8" },
					url: 'https://fgapi.royalsundaram.net/FirstGenV7/services/doHealthEndorsement?wsdl',
					errorPath: [
						{
							xfunc: '__get_fg_endt_err_status', mandatory: true
						}
					],
					ignoreErrors: false,
					attributes: [
						{
							xfunc: '__get_fg_endt_status',
							name: 'fgen_endt_policy_no',
							mandatory: true
						}
					]
				}
			}
		],
	},
	insillion: {
		name: "insillion",
		sqs: { name: 'fgenEndt' },
		services: [
			{
				name: 'revfeed',
				if: "(fgen_endt_policy_no == 'SUCCESS')",
				products: ['all'],
				twigs: [],
				sqs: {},
				disable_cache: true
			}
		]
	}


}
if (process.env.IS_TMP) conf.tmp = process.env.IS_TMP;

module.exports = conf;
