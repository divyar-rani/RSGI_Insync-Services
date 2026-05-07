module.exports = {
    "client": {
        script: "./client/index.js",
        config: "/mnt/ebs1/fghealth/twigs/prod/rsgi-consumer.js",
        workers: 1,
	    config_name: "client"
    },
    "fgenPolicy": {
        script: "./fgenPolicy/index.js",
        config: "/mnt/ebs1/fghealth/twigs/prod/rsgi-consumer.js",
        workers: 1,
	    config_name: "fgenPolicy"
    },
    "fgenRen": {
        script: "./fgenRen/index.js",
        config: "/mnt/ebs1/fghealth/twigs/prod/rsgi-consumer.js",
        workers: 1,
	    config_name: "fgenRen"
    },
    "insillion": {
        script: "./insillion/index.js",
        config: "/mnt/ebs1/fghealth/twigs/prod/rsgi-consumer.js",
        workers: 1,
	    config_name: "insillion"
    }          

}
