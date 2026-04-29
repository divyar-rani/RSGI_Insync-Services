module.exports = {
	"fgenEndt": {
        script: "./fgenEndt/index.js",
        config: "/mnt/ebs1/rsisghuendt/twigs/uat/rsgi-endt-consumer.js",
        workers: 1,
        config_name: 'fgenEndt'
    },
	"insillion": {
        script: "./insillion/index.js",
        config: "/mnt/ebs1/rsisghuendt/twigs/uat/rsgi-endt-consumer.js",
        workers: 1,
        config_name: 'insillion'
    }
}
