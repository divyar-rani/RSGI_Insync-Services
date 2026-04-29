const oracledb = require('oracledb');
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.initOracleClient({ libDir: process.env['IS_ORCL_LIB'] });
/*const options = {
      outFormat: oracledb.OUT_FORMAT_OBJECT,   // query result format
	  autoCommit: true,
	  bindDefs: [
        { type: oracledb.NUMBER },
        { type: oracledb.STRING, maxSize: 20 }
      ]
    };*/

class iorcl {
    constructor() {
        this.connect();
    }
    
    connect(){
        this.name = process.env['IS_ORCL_DB_NAME'];
        this.conf = {
			poolAlias: 'orclpool',
            user: process.env['IS_ORCL_DB_USER'],
            password: process.env['IS_ORCL_DB_PASS'],
            connectString: process.env['IS_ORCL_DB_HOST']+':'+process.env['IS_ORCL_DB_PORT']+'/'+process.env['IS_ORCL_DB_NAME']
            /*charset: process.env['IS_DB_CHARSET'] || 'utf8_unicode_ci',
            supportBigNumbers: true,
            dateStrings: true*/
        }
        this.pool = oracledb.createPool(this.conf);
    }

    disconnect() {
        if (this.pool) this.pool.end();
    }
	
    async query(sql, params){
        this.error= '';
		let ret = [];
        if (!this.pool) {console.log('iorcl.query: connection not established ', sql, params); return null;}
        if (!(params instanceof Array)) {console.log('idb.query: invalid params, expected array ', sql, params);}
		let connection = await oracledb.getConnection('orclpool');
		//console.log('pool....',this.pool);
		//console.log('connection....',connection);
		oracledb.autoCommit = true;
		
        try {
            //return await this.pool.execute(sql, params);
            ret = await connection.execute(sql, params);
        } catch(e) {
            console.log(sql + JSON.stringify(params), e);
            if (e.message && e.message.indexOf('Deadlock') >=0 ){
                console.log('idb: found dead lock: retrying ', sql, e.message);
                try {
                    //return  await this.pool.execute(sql, params);
                    ret =  await connection.execute(sql, params);
                } catch(ee) {
                    console.log('idb: retry failed.', sql, ee.message);
                }
            }
            this.error = e.message;
            this.errorsql=sql;
            //return [null, null];
        }
		//this.disconnect();
		if (connection) await connection.close();
		return ret;
    }


    async exec(sql, params) {
        //const [rows/*, flds*/] = await this.query(sql, params||[]);
        const rows = await this.query(sql, params||[]);
		//console.log('exec....',sql,params,rows);
        return rows;
    }

    async row(sql, params) {
        //var [rows/*, flds*/] = await this.query(sql, params||[]);
        var rows = await this.query(sql, params||[]);
        if( !rows.rows || rows.rows.length<=0 )return null;
        //return rows[0];
		//console.log('row....',sql,params,rows.rows);
        return rows.rows[0];
    }

    async conn() {
        return await this.pool.getConnection();
    }
}

module.exports = new iorcl();
