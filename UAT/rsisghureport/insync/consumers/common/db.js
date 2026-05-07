const mysql2 = require('mysql2/promise');

class imysql {
    constructor() {
        this.connect();
    }
    
    connect(){
        this.name = process.env['IS_DB_NAME'];
        this.conf = {
            host: process.env['IS_DB_HOST'], 
            port: process.env['IS_DB_PORT'],
            database: process.env['IS_DB_NAME'],
            user: process.env['IS_DB_USER'],
            password: process.env['IS_DB_PASS'],
            charset: process.env['IS_DB_CHARSET'] || 'utf8_unicode_ci',
            supportBigNumbers: true,
            dateStrings: true
        }
        this.pool = mysql2.createPool(this.conf);
    }

    disconnect() {
        if (this.pool) this.pool.end();
    }

    async query(sql, params){
        this.error= '';

        if (!this.pool) {console.log('imysql.query: connection not established ', sql, params); return null;}
        if (!(params instanceof Array)) {console.log('idb.query: invalid params, expected array ', sql, params);}

        try {
            return await this.pool.query(sql, params);
        } catch(e) {
            console.log(sql + JSON.stringify(params), e);
            if (e.message && e.message.indexOf('Deadlock') >=0 ){
                console.log('idb: found dead lock: retrying ', sql, e.message);
                try {
                    return  await this.pool.query(sql, params);
                } catch(ee) {
                    console.log('idb: retry failed.', sql, ee.message);
                }
            }
            this.error = e.message;
            this.errorsql=sql;
            return [null, null];
        }
    }


    async exec(sql, params) {
        const [rows/*, flds*/] = await this.query(sql, params||[]);
        return rows;
    }

    async row(sql, params) {
        var [rows/*, flds*/] = await this.query(sql, params||[]);
        if( !rows || rows.length<=0 )return null;
        return rows[0];
    }

    async conn() {
        return await this.pool.getConnection();
    }
}



module.exports = new imysql();