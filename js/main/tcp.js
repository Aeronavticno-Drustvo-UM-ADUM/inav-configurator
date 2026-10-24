// Runs in main thread

import net from 'net'

const tcp = {
    _socket: null,
    _id: 1,
    connect: function(host, port, window, setNoDelay = true) {
        // A previous socket left open keeps the single-client server (e.g. SITL) busy
        this.close();

        return new Promise(resolve => {     
            try {
                const socket = net.connect({host: host, port: port}, () => {    
                    socket.setNoDelay(setNoDelay); 
                });
                this._socket = socket;

                // Events from a replaced socket must not reach the current connection
                socket.on('error', error => {
                    if (socket === this._socket && !window.isDestroyed()) {
                        window.webContents.send('tcpError', error); 
                    }
                });

                socket.on('end', () => {
                    if (socket === this._socket && !window.isDestroyed()) {
                        window.webContents.send('tcpEnd');
                    }
                });

                socket.on('data', buffer => {
                    if (socket === this._socket && !window.isDestroyed()) {
                        window.webContents.send('tcpData', buffer);
                    }
                });
                resolve({error: false, id: this._id++});  
                
            } catch (err) {
                resolve ({error: true, errorMsg: err});
            }
        });
    },
    close: function() {
        const socket = this._socket;
        this._socket = null;
        // destroy(), not end(): end() half-closes and the socket lingers until the peer closes too
        if (socket && !socket.destroyed) {
            socket.destroy();
        }
    },
    send: function(data) {
        return new Promise(resolve => {  
            if (this._socket && !this._socket.destroyed) {
                this._socket.write(Buffer.from(data), () => {
                    resolve({error: false, bytesWritten: data.byteLength});
                });
            } else {
                resolve({error: true, msg: "Socket closed or invalid"});
            }
        });
    }
};

export default tcp;
