module.exports = {
    policy: {
        name: 'policy',
        include_paid: false,
        token: '',
        batch_interval: 60*1000,
        trace: true,
        pause: false,
	    cutoff: '2026-01-01 00:00:00',
        tmp: '/mnt/ebs1/tmp/is_fghealth',
        sqs: {
            url: 'https://sqs.ap-south-1.amazonaws.com/920043513072/prod-rsgi-entry',
            ins: 'https://sqs.ap-south-1.amazonaws.com/920043513072/prod-rsgi-insillion',
        },
		privs: {
			attr: 75,
			oob: 50,
			requeue: 50,
			updatejson: 25,
			revfeed: 50,
			calendar: 50,
			edit: 50,
		},
		products: {
            "gpa": {
                custom_fields: {
					cust1: "proposal.created_by",
					cust2: "proposal.data.policy_transaction_type",
                    cust3: "proposal.data.t_source",
                },
            },
			"ghealth": {
                custom_fields: {
                    cust1: "proposal.created_by",
					cust2: "proposal.data.policy_transaction_type",
                    cust3: "proposal.data.t_source",
                },
            }

        },
		
        product_names: {
            "Group Health Insurance" : "ghealth",
            "Group Personal Accident": "gpa"
        },
		edit: {
            "ghealth": {
                fields: [
				{name:'imd_channel', jpath:'proposal.data.imd_channel', type:'string'},
				{name:'imd_sub_channel', jpath:'proposal.data.imd_sub_channel', type:'string'},
                {name:'imd_oa_agent', jpath:'proposal.data.imd_oa_agent', type:'string'},
                {name:'imd_sales_rep', jpath:'proposal.data.imd_sales_rep', type:'string'},
                {name:'imd_approving_uw', jpath:'proposal.data.imd_approving_uw', type:'string'},
                {name:'imd_trading_uw', jpath:'proposal.data.imd_trading_uw', type:'string'},
                {name:'imd_code', jpath:'proposal.data.imd_code', type:'string'},
				{name:'cust_buss_type', jpath:'proposal.data.cust_buss_type', type:'string'},
				{name:'taxinvoice_id', jpath:'policy.data.taxinvoice_id', type:'string'},
				{name:'tpa_code', jpath:'proposal.data.tpa_code', type:'string'},
				{name:'payment_method', jpath:'payment.details.data.payment_method_mode', type:'string'},
				{name:'acc_code', jpath:'payment.details.data.exist_party_id', type:'string'},
				{name:'cd_no', jpath:'payment.details.data.cd_no', type:'string'}
				]				
            },
              "gpa": {
                fields: [
				{name:'imd_channel', jpath:'proposal.data.imd_channel', type:'string'},
				{name:'imd_sub_channel', jpath:'proposal.data.imd_sub_channel', type:'string'},
                {name:'imd_oa_agent', jpath:'proposal.data.imd_oa_agent', type:'string'},
                {name:'imd_sales_rep', jpath:'proposal.data.imd_sales_rep', type:'string'},
                {name:'imd_approving_uw', jpath:'proposal.data.imd_approving_uw', type:'string'},
                {name:'imd_trading_uw', jpath:'proposal.data.imd_trading_uw', type:'string'},
                {name:'imd_code', jpath:'proposal.data.imd_code', type:'string'},
				{name:'cust_buss_type', jpath:'proposal.data.cust_buss_type', type:'string'},
				{name:'total_discount', jpath:'proposal.data.total_discount', type:'string'},
				{name:'taxinvoice_id', jpath:'policy.data.taxinvoice_id', type:'string'},
				{name:'tpa_code', jpath:'proposal.data.tpa_code', type:'string'},
				{name:'payment_method', jpath:'payment.details.data.payment_method_mode', type:'string'},
				{name:'acc_code', jpath:'payment.details.data.exist_party_id', type:'string'},
				{name:'cd_no', jpath:'payment.details.data.cd_no', type:'string'}				
				]      
            }
        }
    }
}
