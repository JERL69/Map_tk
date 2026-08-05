const config = require('./config');

class GiftQueue {
    constructor(io) {
        this.queue = [];
        this.io = io;
        this.isProcessing = false;
    }

    addEvent(eventData) {
        this.queue.push(eventData);
        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    processQueue() {
        if (this.queue.length === 0) {
            this.isProcessing = false;
            return;
        }

        this.isProcessing = true;
        const nextEvent = this.queue.shift();

        // Emitir el evento de ataque al frontend
        // Usamos "attack" como solicitó el usuario
        this.io.emit('attack', nextEvent);

        // Llamar recursivamente con timeout para throttling
        setTimeout(() => {
            this.processQueue();
        }, config.queue.intervaloProcesamientoMs);
    }
}

module.exports = GiftQueue;
