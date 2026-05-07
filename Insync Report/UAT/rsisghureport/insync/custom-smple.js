module.exports = {
    policy: {
        name: 'policy',
        server: 'https://ins.server.com',
        user: 'admin',                              // insillion server user account with access to all policies
        mpwd: '098f6bcd4621d373cade4e832627b4f6',   // md5 lower case password (test)
        token: '',
        batch_interval: 60*1000,                    // time to wait between two list2 api calls
        trace: true,                                // print additional debug information

        preprocess: {
            nulls_to_empty: true,                   // make all null values as empty string ('')
            // remove_nulls: true,                  // remove keys with null values
            boolean_to_string: true,                // convert all boolean values to string equivalent
            true_string: 'True',                    // boolean true to be converted to ...
            false_string: 'False',

            in_date_format: 'MM/DD/YYYY',           // incoming date format
            dates: [
                /*
                {path: 'quote.data.self_dob', infmt: 'MM/DD/YYYY', outfmt: 'DD/MM/YYYY', products: ['M100000000005', 'M100000000006']},
                {path: 'quote.data.self_dob', infmt: 'YYYY-MM-DD', outfmt: 'DD/MM/YYYY', products: ['M100000000006', 'M100000000005']},
                {path: 'quote.data.insured_dob', infmt: 'YYYY-MM-DD', outfmt: 'DD/MM/YYYY', products: ['M200000000005']},
                {path: 'proposal.data.insured_dob', infmt: 'MM/DD/YYYY', outfmt: 'DD/MM/YYYY', products: ['M100000000007', 'M100000000008']},
                {path: 'proposal.data.proposer_dob', infmt: 'MM/DD/YYYY', outfmt: 'DD/MM/YYYY', products: ['M100000000009', 'M200000000015']},
                {path: 'proposal.data.proposer_dob', infmt: 'YYYY-MM-DD', outfmt: 'DD/MM/YYYY', products: ['M300000000001']},
                {path: 'proposal.data.insured_dob', infmt: 'YYYY-MM-DD', outfmt: 'DD/MM/YYYY', products: ['M100000000007', 'M100000000008']},
                */
            ]
        },

        /* allow theses fields to be edited through the UI */
        edit: {
            "Leisure Travel Accident": {    // product name
                fields: [
                    {name: 'First name', jpath: 'proposal.data.first_name', type: 'string', cellid: ''}
                ]
            },
            "Marine Master Policy": {
                fields: [
                    {name: 'User code', jpath: 'proposal.data.cust_fld_1', type: 'string', cellid: ''}
                ]
            }
        }
    }
}