module.exports = {
    policy: {
        name: 'endorsement',
        include_paid: false,
        token: '',
        batch_interval: 30 * 1000,
        trace: true,
        pause: false,
        cutoff: '2026-01-01 10:00:00',
        tmp: '/mnt/ebs1/tmp/is_rsisghuendt',
        sqs: {
            url: 'https://sqs.ap-south-1.amazonaws.com/920043513072/uat-rsgi-endt-entry',
            ins: 'https://sqs.ap-south-1.amazonaws.com/920043513072/uat-rsgi-endt-insillion',
        },

        product_names: {
            "Group Health Insurance": "ghealth",
            "Group Personal Accident": "gpa"
        },

        edit: {
            "gpa": {
                custom_fields: {
                    cust1: "proposal.created_by",             
                    cust2: "proposal.data.t_source",
                },
            },
            "ghealth": {
                custom_fields: {
                    cust1: "proposal.created_by",
                    cust2: "proposal.data.t_source",
                },
            }
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

		edit: {
            "ghealth": {
                fields: [
				{name:'imd_channel', jpath:'proposal.data.imd_channel', type:'string'},
				{name:'imd_sub_channel', jpath:'proposal.data.imd_sub_channel', type:'string'},
                {name:'imd_oa_agent', jpath:'proposal.data.imd_oa_agent', type:'string'},
				{name:'imd_oa_broker_code', jpath:'proposal.data.imd_oa_broker_code', type:'string'},
                {name:'imd_sales_rep', jpath:'proposal.data.imd_sales_rep', type:'string'},
                {name:'imd_approving_uw', jpath:'proposal.data.imd_approving_uw', type:'string'},
                {name:'imd_trading_uw', jpath:'proposal.data.imd_trading_uw', type:'string'},
                {name:'imd_code', jpath:'proposal.data.imd_code', type:'string'} 
				]				
            },
              "gpa": {
                fields: [
				{name:'imd_channel', jpath:'proposal.data.imd_channel', type:'string'},
				{name:'imd_sub_channel', jpath:'proposal.data.imd_sub_channel', type:'string'},
                {name:'imd_oa_agent', jpath:'proposal.data.imd_oa_agent', type:'string'},
				{name:'imd_oa_broker_code', jpath:'proposal.data.imd_oa_broker_code', type:'string'},
                {name:'imd_sales_rep', jpath:'proposal.data.imd_sales_rep', type:'string'},
                {name:'imd_approving_uw', jpath:'proposal.data.imd_approving_uw', type:'string'},
                {name:'imd_trading_uw', jpath:'proposal.data.imd_trading_uw', type:'string'},
                {name:'imd_code', jpath:'proposal.data.imd_code', type:'string'} 
				]      
            }
        }

    }
}
