module.exports = {
    policy: {
        name: 'endorsement',
        include_paid: false,
        token: '',
        batch_interval: 30*1000,
        trace: true,
        pause: false,
        cutoff: '2026-01-01 10:00:00',
        tmp: '/mnt/ebs1/tmp/is_rsisghuendt',
        sqs: {
            url: 'https://sqs.ap-south-1.amazonaws.com/920043513072/uat-rsgi-endt-entry',
            ins: 'https://sqs.ap-south-1.amazonaws.com/920043513072/uat-rsgi-endt-insillion',
        },

        product_names: {
            "Group Health Insurance" : "ghealth",
            "Group Personal Accident": "gpa"
        },
		
        		edit: {
            "ghealth": {
                fields: [{name:'PolicyId', jpath:'quote.data.policy_id', type:'string'}],
				fields: [{name:'clientID', jpath:'policy.data.customerno_id', type:'string'}]
            },
              "gpa": {
                fields: [{name:'PolicyId', jpath:'quote.data.policy_id', type:'string'}],
				fields: [{name:'clientID', jpath:'policy.data.customerno_id', type:'string'}]
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
        }
        
    }
}
