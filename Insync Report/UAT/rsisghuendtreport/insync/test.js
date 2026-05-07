const preproc = require('./lib/preproc');
let policy = {
    product_id: 'M001',
    policy: {
        policy_id: 'P001',
        policy_start_date: '01/10/2022',
        mobile_no: null,
        email: 'Null'
    },
    quote: {},
    proposal: {},
    payment: {
        details: [
            {pay_date: '01/11/2022'}
        ]
    }
};
let config = {
    nulls_to_empty: true,
    dates: [
        {path: 'policy.policy_start_date', infmt: 'MM/DD/YYYY', outfmt: 'DD/MM/YYYY'},
        {path: 'payment.details.pay_date', infmt: 'MM/DD/YYYY', outfmt: 'DD/MM/YYYY', products: ['M001']}
    ]
};
let pp = new preproc();
pp.process(policy, config);
console.log(JSON.stringify(policy, null, 3));