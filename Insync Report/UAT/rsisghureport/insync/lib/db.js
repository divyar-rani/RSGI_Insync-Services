const conf = require('../config');
const mysql2 = require('mysql2/promise');

class imysql {
    constructor() {
        this.connect();
    }
    
    connect(){
        this.name   = conf.db.database;
        this.schema = conf.schema;
        this.conf = conf.db;
        this.pool = mysql2.createPool(this.conf);
    }

    async query(sql, params){
        var start = performance.now();
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

    async value(sql, params) {
        var [rows, flds] = await this.query(sql, params||[]);
        if (!rows || rows.length<=0 || flds.length==0) return null;
        return rows[0][flds[0].name];
    }

    async upgrade() {
        let gu = new gupgrade(this);
        await gu.check();
        console.log('errors:', gu.errors);
        console.log('logs:', gu.logs);
        return gu.errors;
    }
}


class gupgrade {
    constructor(db) {
        this.db     = db;
        this.logs   = [];
        this.errors = [];
        this.sqls   = [];
        this.rdb    = null;
    }

    log(msg) {
        this.logs.push(msg);
    }


    async _process_table_list(tables) {
        if (tables.length == 0)return;
        for (let tname of tables) {
            await this._check_table(tname, this.db.schema[tname]);
            // await this._update_generated_columns(tname, this.db.schema[tname].virtual);
            await this._update_indices(tname, this.db.schema[tname]);
        }
    }

    async _process_queries(sqls){
        for (let sql of sqls) {
            try {
                // console.log(sql);
                await this.db.exec(sql, []);
            } catch (e) {
                console.log(e);
                this.log('upgrade exception '+sql+':'+ e.message);
            }
        }
    }

    //check all tables and fields, accumulate all the queries to be executed and 
    // run them one at a time
    //
    async check(){
        await this._process_table_list(Object.keys(this.db.schema));
        await this._process_queries(this.sqls);
    }

    async _check_table(tname, table){
        let sql = "select * from information_schema.columns where table_name=? and table_schema =?";
        let rows = await this.db.exec(sql, [tname, this.db.name]);
        if (!rows || rows.length <= 0) {
            this.log('    does not exist making create statement');
            this.createTable(tname, table);
        } else {
            this.updateTable(tname, table, rows);
        }
        if (table.hasOwnProperty('trigger')) {
            if( !(table.trigger instanceof Array) )table.trigger = [table.trigger];
            for (var tr of table.trigger) this.sqls.push(tr);
        }
    }

    async _process_index_list(tname, indices, unique){
        for (let index of indices) {
            await this._update_index(tname, index, unique);
        }
    }

    async _update_indices(tname, table){
        var indices = [];
        if( table.hasOwnProperty('index') )
            if( table.index.length>0 && table.index[0] instanceof Array )
                indices.push.apply(indices, table.index);
            else if(table.index.length>0)
                indices.push(table.index);

        await this._process_index_list(tname, indices, false);
        indices = [];
        if (table.hasOwnProperty('unique') && table.unique.length > 0) {
            if (table.unique[0] instanceof Array) indices.push.apply(indices, table.unique);
            else indices.push(table.unique);
        }
        await this._process_index_list(tname, indices, true);
    }

    async _update_index(tname, index, unique){
        var idxName = tname;
        for(var i in index )idxName += '_'+index[i];

        //-rr jul-27-2020 mysql length limit
        idxName = idxName.substring(0, 64);

        //iif:
        if (this.db.name != 'iunit') console.log('        index: ', idxName);
        var sql = "select index_name from information_schema.statistics WHERE TABLE_SCHEMA=? and table_name=? and index_name=?";
        let rows = await this.db.exec(sql, [this.db.name, tname, idxName]);
        if (!rows || rows.length == 0){
            var sql = "create "+(unique?"UNIQUE":"")+" index "+idxName+" on "+tname+" ("+index.join(',')+")";
            this.sqls.push(sql);
        }
    }

    fieldDDL(fld){
        var ddl = fld.name;
        var type= (fld.hasOwnProperty('type')?fld.type:'varchar').toLowerCase();
        var size= fld.hasOwnProperty('size')?fld.size:'255';
        if( fld.hasOwnProperty('auto') && fld.auto)
            ddl += ' '+type+' AUTO_INCREMENT PRIMARY KEY';
        else if( type == 'varchar' )
            ddl += ' '+type+'('+size+')';
        else if( type == 'timestamp' )
            ddl += " timestamp(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)";
        else if( type == 'jsonb' || type == 'json')
            ddl += ' json ';
        else if( type == 'blob' )
            ddl += ' longblob ';
        else
            ddl += ' '+type+' ';
        
        if( fld.hasOwnProperty('primary') && fld.primary )
            ddl += ' PRIMARY KEY ';
        if( fld.hasOwnProperty('null') && fld.null.toUpperCase() == 'NO' )
            ddl += ' NOT NULL ';
        if( fld.hasOwnProperty('default') )
            if( (''+fld.default).toUpperCase()=='CURRENT_TIMESTAMP' || 
                (''+fld.default).toUpperCase()=='CURRENT_TIMESTAMP(3)' ||
                (''+fld.default).toUpperCase()=='CURRENT_TIMESTAMP(6)' ||
                (''+fld.default).toUpperCase()=='NOW()' )
                ddl += " default "+fld.default+"";
            else
                ddl += " default '"+fld.default+"'";
        return ddl;
    }

    createTable(tname, table){
        var sql = "create table "+tname+"(";
        for (let f in table.fields) sql += this.fieldDDL(table.fields[f])+",";
        sql = sql.substring(0, sql.length-1) + ")";
        if (table.hasOwnProperty('engine')) sql += " ENGINE="+table['engine'];
        sql += ";";
        this.sqls.push( sql );
    }

    updateTable(tname, table, tdef){
        const fields = table['fields'];
        var   tableFields = {};
        for(let i in tdef)tableFields[tdef[i]['COLUMN_NAME']] = tdef[i];

        var sql = null;
        var prev = '';
        for (let i in fields) {
            const fld = fields[i];
            var type = (fld.hasOwnProperty('type')?fld.type:'varchar').toLowerCase();
            var size = fld.hasOwnProperty('size')?fld.size:'255';
            
            if( tableFields.hasOwnProperty(fld.name) ){
                const tfld= tableFields[fld.name];
                var dtprec= tfld['DATETIME_PRECISION'];
                var needUpdate = false;

                if( (type == 'bigint' || type == 'int') && !tfld.COLUMN_TYPE.startsWith(type) ){
                    console.log('    '+fld.name+':type mismatch '+type);
                    needUpdate = true;
                }
                else if( type == 'varchar' && tfld.COLUMN_TYPE != 'varchar('+(size)+')' ){
                    console.log('    '+fld.name+':type mismatch '+type+' size: '+size);
                    needUpdate = true;
                }
                else if( (type == 'datetime') && tfld.COLUMN_TYPE !=type ){
                    console.log('    '+fld.name+':type mismatch '+type+'('+dtprec+') current '+tfld.COLUMN_TYPE);
                    needUpdate = true;
                }
                else if( (type == 'timestamp') && /*tfld.COLUMN_TYPE !=type &&*/ tfld.COLUMN_TYPE!= type+'('+dtprec+')' ){
                    console.log('    '+fld.name+':type mismatch '+type+'('+dtprec+') current '+tfld.COLUMN_TYPE);
                    needUpdate = true;
                }
                else if( type != 'timestamp' && (fld.hasOwnProperty('null')?fld.null:"YES") != tfld.IS_NULLABLE ){
                    console.log('    '+fld.name+':nullable mismatch '+tfld.IS_NULLABLE+' : '+fld.hasOwnProperty('null'));
                    needUpdate = true;
                }
                else if( type.startsWith('decimal') && tfld.COLUMN_TYPE !=type ){
                    console.log('    '+fld.name+':type mismatch '+type+' current '+tfld.COLUMN_TYPE);
                    needUpdate = true;
                }

                if( fld.hasOwnProperty('default') && (fld.default===0 || fld.default || fld.default=='' ) ){
                    var deflt = (''+fld.default).toLowerCase().trim();
                    
                    if( tfld.COLUMN_DEFAULT == null || deflt != tfld.COLUMN_DEFAULT.toLowerCase().trim() ){
                        if( tfld.COLUMN_DEFAULT && tfld.COLUMN_DEFAULT.toLowerCase().trim() == "'"+deflt+"'" ){
                            // they are equal
                        }
                        else if( tfld.COLUMN_DEFAULT && tfld.COLUMN_DEFAULT.toLowerCase().trim() == "current_timestamp()" && deflt == 'current_timestamp'){
                            // they are equal
                        }
                        else if( tfld.COLUMN_DEFAULT && tfld.COLUMN_DEFAULT.toLowerCase().trim() == "now()" && deflt == 'now()'){
                            // they are equal
                        }
                        else if( tfld.COLUMN_DEFAULT === '0.0000' && deflt == '0'){
                            // they are equal
                        }
                        else{
                            console.log('    '+fld.name+':default mismatch ['+tfld.COLUMN_DEFAULT+'] : ['+deflt+']');
                            needUpdate = true;    
                        }
                    }
                }
                
                if( needUpdate ){
                    this.log('    field '+fld.name+' needs upgrade, performing....');
                    sql = "alter table "+tname+' modify column '+this.fieldDDL(fld);
                    this.sqls.push( sql );
                }
            }
            else{
                // create (add) new field
                this.log('    field '+fld.name+' does not exists, adding ...');
                sql = "alter table "+tname+" add column "+this.fieldDDL(fld)+(prev?" after "+prev:"");
                this.sqls.push( sql );
            }
            prev = fld.name;
        }
    }

    logsText(){
        var txt = '';
        for(var i in this.logs)txt += this.logs[i]+'\n';
        return txt;
    }
    errorsText(){
        var txt = '';
        for(var i in this.errors)txt += this.errors[i]+'\n';
        return txt;
    }

}
module.exports = new imysql();