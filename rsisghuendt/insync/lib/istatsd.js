const sd = require('hot-shots');

class istatsd {
    constructor() {
        if (!process.env.IS_STATSD_HOST) return;
        let options = {
            host: process.env.IS_STATSD_HOST,
            port: process.env.IS_STATSD_PORT || 8125,
            globalTags: {},
            prefix: (process.env.IS_SERVER_ID||'insync') + '.',
            protocol: process.env.IS_STATSD_PROTOCOL || 'udp',
            errorHandler: (e) => {/*console.log('statsd:', e)*/}
        }
        this.statsd = new sd(options);
        // console.log('statsd: connected', options.host);
    }

    gauge(values) {
        if (this.statsd)
            for (let key in values) this.statsd.gauge(key, values[key]);
    }

    event(name, duration) {
        if (!this.statsd) return;
        if (duration === undefined || duration === null) this.statsd.set(name);
        else this.statsd.timing(name, +duration);
    }

    increment(name, value) {
        if (!this.statsd || value === 0) return;
        if (value == undefined) value = 1;
        this.statsd.increment(name, +value);
    }
}

module.exports = new istatsd();