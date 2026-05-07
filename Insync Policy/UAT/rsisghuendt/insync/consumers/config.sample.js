const conf = {
    delay: 15*1000,
    tmp: 'z:\\',
    ignore: ['Marine Master Policy'],
    whitelist: [],
    consumer1: {
        name: "consumer1",
        sqs: {
            srcUrl: 'https://sqs.ap-south-1.amazonaws.com/884682301008/insync-iunit',   // the SQS URL used by the extractor
            region: 'ap-south-1'
        },
        services: [
            {
                name: 'consumer1',
                products: ['product name 1', 'product name 2', 'all'],
                twigs: ['twigs/twig-file1.twig', 'twigs/twig-file2.twig'],
                sqs: {
                    dstUrl: 'https://sqs.ap-south-1.amazonaws.com/884682301008/insync-consumer2',   // SQS URL of next stage
                    region: 'ap-south-1',
                },
                target: {
                    method: 'POST',
                    headers: {'Content-Type': "text/xml; charset=UTF-8"},
                    url: 'http://127.0.0.1:8099/cxf/CustomerService',
                    type: 'soap',
                    errorPath: ['soap:Envelope.soap:Body.addCustomerResponse.AddCustomerResult.ns2:ErrorText'],
                    ignoreErrors: true,
                    attributes: [
                        {
                            xpath: 'soap:Envelope.soap:Body.addCustomerResponse.AddCustomerResult.ns2:ID', 
                            name: 'gc_cust_id', 
                            mandatory: true
                        }
                    ]
                }
            }
        ]
    }
}

module.exports = conf;