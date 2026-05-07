module.exports = {
    patterns: [
        {
            regex: /proposal no\. : \d+ is already tagged with payment/i,
            bucket: 'ops',
            event: 'tagging.exists',
        },
        {
            regex: /ID is locked/i,
            bucket: 'ops',
            event: 'tagging.locked',
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
            regex: /Previous Insurer name value is not valid/i,
            bucket: 'l1',
            event: 'proposal.master',
        },
        {
            regex: /error in Pan number validation/i,
            bucket: 'ops',
            event: 'proposal.data',
        },
        {
            regex: /authentication failed/i,
            bucket: 'retry',
            event: 'general.auth',
        },
        {
            regex: /authenticationFailed exception/i,
            bucket: 'retry',
            event: 'general.auth',
        },
        {
            regex: /does not have a valid value/i,
            bucket: 'l2',
            event: 'proposa.data',
        },
        {
            regex: /Drawee Bank does not exist/i,
            bucket: 'l1',
            event: 'proposa.data',
        },
        {
            regex: /Proposal Unpaid amount should not be/i,
            bucket: 'l2',
            event: 'proposa.data',
        }
    ]
}