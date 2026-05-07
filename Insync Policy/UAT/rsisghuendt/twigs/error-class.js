module.exports = {
    attributes: [
        {
            regex: /Intermediary Id :\d+ is inactive\. Alternate Intermediary Id (\d+)\(.*\) can be used to proceed/gi,
            index: 0,
            attr: 'gc_alt_intermediary_id'
        }
    ],
    patterns: [
        {
            regex: [
                /proposal no\. : \d+ is already tagged with payment/i,
                /ID is locked/i
            ],
            bucket: 'ops',
            event: 'tagging.gc',
        },
        {
            regex: /Balance not Sufficient for Allocation/i,
            bucket: 'ops',
            event: 'sub-receipt.nobalance',
        },
        {
            regex: /Special characters are not allowed,in Auth Code/i,
            bucket: 'ops',
            event: 'receipt.authcode',
        },
        {
            regex: /Receipt \(\d+\) already exist with similar Authcode/i,
            bucket: 'ops',
            event: 'receipt.authcode',
        },
        {
            regex: [
                /Already Renewed for this Yea/i, 
                /Reference No is not valid for this current operation/i,
                /ID is locked due to pendency of EOD/i,
                /Office Name Does Not Match With the Office Code/i,
                /Previous Insurer name value is not valid/i,
                /error in Pan number validation/i,
                /Drawee Bank does not exist/i,
                /Proposal Unpaid amount should not be/i,
                /does not have a valid value/i
            ],
            bucket: 'ops',
            event: 'proposal.gc',
        },
        {
            regex: /\'Date\' is not valid/i,
            bucket: 'l3',
            event: 'all.date',
        },
        {
            regex: /Unpaid amount should not be 0/i,
            bucket: 'l3',
            event: 'tagging.amount',
        },
        {
            regex: [
                /authentication failed/i,
                /authenticationFailed exception/i
            ],
            bucket: 'retry',
            event: 'general.auth',
        },
    ]
}
