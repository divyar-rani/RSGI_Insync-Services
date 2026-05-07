const conf = require('../config');
const db = require("./db");
const crypto = require('crypto');
const base = require("./base");
const is = require('./insync');
const fs = require('fs');
const path = require('path');

const ALGORITHM_NAME = "aes-128-gcm";
const ALGORITHM_NONCE_SIZE = 12;
const ALGORITHM_TAG_SIZE = 16;
const ALGORITHM_KEY_SIZE = 16;

const aesKey = "asdipoqwen,m1234";
class auth extends base{

    async get_list() {
        if (this.req.priv_level != 100) return this.response(-101, 'privilege needed');
        return this.response(0, '', await db.exec("select email, priv_level, status, c_ts, u_ts from is_auth"));
    }

    async get_auth() {
        return this.response(0, '', {email: this.req.user, priv_level: this.req.priv_level, server: conf.server_id});
    }
    async post_auth() {
        let user = this.__param('email');
        let mpwd = this.__param('mpwd');
        let row = await db.row("select * from is_auth where email=? and mpwd=?", [user, mpwd]);
        
        if (!row || row.status != 0) {
            is.notify(null, 'info', 'user '+user+' authentication failed');
            return this.response(-101, '');
        }

        let validtill = (Date.now()/1000) + (24 * 60 * 60);
        var data = row.email+':'+row.priv_level+'::'+Math.round(validtill)+':';
        let nonce = crypto.randomBytes(ALGORITHM_NONCE_SIZE);
        let cipher = crypto.createCipheriv(ALGORITHM_NAME, aesKey, nonce);
        let ciphertext = Buffer.concat([ cipher.update(data), cipher.final() ]);
        let token = Buffer.concat([ nonce, ciphertext, cipher.getAuthTag() ]).toString('base64');
        is.notify({name:'insync'}, 'info', 'user '+row.email+' has logged in');
        return this.response(0, '', {email: row.email, priv_level: row.priv_level, token, server: conf.server_id});
    }

    static __validate_token(req) {
        let token = req.get('Authorization');
        
        if (!token || !token.startsWith('Bearer')) return;
        
        token = Buffer.from(token.substr(7).trim(), "base64");
        let nonce = token.slice(0, ALGORITHM_NONCE_SIZE);
        let ciphertext = token.slice(ALGORITHM_NONCE_SIZE, token.length - ALGORITHM_TAG_SIZE);
        let tag = token.slice(ciphertext.length + ALGORITHM_NONCE_SIZE);
        if (tag.length != ALGORITHM_TAG_SIZE) return null;
        let cipher = crypto.createDecipheriv(ALGORITHM_NAME, aesKey, nonce);
        cipher.setAuthTag(tag);
        let payload = Buffer.concat([cipher.update(ciphertext), cipher.final()]).toString("utf8");
        if (!payload) return;

        let parts = payload.split(':');
        if (parts.length < 5) return;

        // let user = await db.row("select * from is_auth where email=?", [parts[0]]);
        // if (!user || +user.status !== 0) return;
		
        let elapsed = (Date.now()/1000) - +parts[3];
        if (elapsed > 0) {
            console.log('auth token expired:', parts[0], elapsed);
            return;
        }
        

        req.user = parts[0];
        req.priv_level = +parts[1];        
    }

    async post_add() {
        if (+this.req.priv_level < 100) return this.response(-104, 'Not authorized (priv level 100 needed)', {});
        let user = this.__param('email');
        let pwd = this.__param('password');
        await db.exec("insert into is_auth(email, mpwd, priv_level) values (?,md5(?),?)", [user, pwd, 0]);
        return this.response(0, 'user added', {});
    }

    async post_reset() {
        if (+this.req.priv_level < 100) return this.response(-104, 'Not authorized (priv level 100 needed)', {});
        let user = this.__param('email');
        let pwd = ''+Math.floor(Math.random()*9999);
        await db.exec("update is_auth set mpwd=md5(?) where email=?", [pwd, user]);
        return this.response(0, '', {pwd});
    }

    async post_change_password() {
        let opwd = this.__param('opwd');
        let npwd = this.__param('npwd');
        let row = await db.row("select * from is_auth where email=? and mpwd=md5(?)", [this.req.user, opwd]);
        if (!row) return this.response(-101, 'invalid old password');
        await db.exec('update is_auth set mpwd=md5(?) where email=?', [npwd, this.req.user]);
        return this.response(0, '', 'password changed');
    }

    async post_status() {
        if (this.req.priv_level != 100) return this.response(-101, 'privilege needed');
        let email = this.__param('email');
        let status = this.__param('status');
        if (this.req.user == email) return this.response(-101, 'self disabling not allowed');
        await db.exec("update is_auth set status=? where email=?", [status, email]);
        return this.get_list();
    }

    async get_pause() {
        if (!is.cust?.policy?.tmp) return this.response(-104, 'tmp not configured', {});
        let fname = path.join(is.cust?.policy?.tmp, 'pause.lock');
        if (fs.existsSync(fname)) return this.response(0, '', 'paused');
        return this.response(0, '', '');
    }

    async post_pause() {
        if (+this.req.priv_level < 100) return this.response(-104, 'Not authorized (priv level 100 needed)', {});
        if (!is.cust?.policy?.tmp) return this.response(-104, 'tmp not configured', {});
        let fname = path.join(is.cust?.policy?.tmp, 'pause.lock');
        if (fs.existsSync(fname)) return this.response(0, '', 'paused');
        is.pause = true;
        try {fs.writeFileSync(fname, (new Date().toISOString()));} catch (e) {console.log(e);}
        return await this.get_pause();
    }
    async post_resume() {
        if (+this.req.priv_level < 100) return this.response(-104, 'Not authorized (priv level 100 needed)', {});
        if (!is.cust?.policy?.tmp) return this.response(-104, 'tmp not configured', {});
        let fname = path.join(is.cust?.policy?.tmp, 'pause.lock');
        try {fs.unlinkSync(fname);} catch(e) {console.log(e);}
        is.pause = false;
        return await this.get_pause();
    }
}
module.exports = auth;