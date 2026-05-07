const conf = require('../config');
const {WebSocket, WebSocketServer}    = require('ws');
const moment = require('moment');

class notify {
    
    constructor() {
        this.history = [];
        this.max_history = 4*1024;
    }
    
    start(server) {
        if (this.wss) return;

        this.wss = new WebSocketServer({server});
        this.wss.on('connection', (ws)=> {
            ws.on('message', (data)=> {
                try {
                    data = JSON.parse(Buffer.from(data).toString('utf8'));
                    this.send(data.type, data.message, data.time);
                } catch (e) {
                    console.log(e)
                }
            });
            ws.send(JSON.stringify(this.history));
        });
    }

    stop() {
        if (!this.wss) return;
        for(const client of this.wss.clients) client.close();
    }

    send(type, message, time) {
        if (!this.wss) return;
        let msg = JSON.stringify({type, message, time: time || moment().utc()});
        
        // this.history.push(msg);
        if (this.history.length > this.max_history) this.history.shift();

        this.wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(msg);
            }
        });
    }
}

module.exports = new notify();