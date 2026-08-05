const { Server } = require('socket.io');
const gameEngine = require('./gameEngine');
const connectToTikTokUser = require('./tiktok');

function setupSocket(server) {
    const io = new Server(server, {
        cors: {
            origin: process.env.FRONTEND_URL || "*",
            methods: ["GET", "POST"],
            credentials: true
        }
    });

    // Mapa de conexiones activas para evitar duplicados en producción
    const activeStreams = new Map();

    io.on('connection', (socket) => {
        console.log('Un cliente se ha conectado:', socket.id);

        // Enviar el estado inicial a quien se conecte
        socket.emit('estado_inicial', gameEngine.getEstadoActual());

        // Evento lanzado por el Frontend cuando detecta ?user=ALGUIEN
        socket.on('iniciar_stream', (username) => {
            if (!username) return;

            username = username.toLowerCase().replace('@', '');
            console.log(`Solicitud para iniciar stream de: ${username}`);

            // Si el stream ya está activo globalmente, no crear otro
            if (!activeStreams.has(username)) {
                console.log(`Conectando nuevo stream para ${username}...`);
                const tiktokConnection = connectToTikTokUser(username, io);
                activeStreams.set(username, tiktokConnection);

                // Limpiar del mapa si se desconecta permanentemente (lo maneja tiktok.js, 
                // pero por ahora lo dejamos en el mapa como activo).
            } else {
                console.log(`El stream de ${username} ya está siendo trackeado.`);
            }
        });

        // Evento de prueba desde el cliente
        socket.on('test_ataque_parcial', (data) => {
            const { atacante, defensor } = data;

            const estadoActual = gameEngine.getEstadoActual();
            const realAtacanteId = gameEngine.getOwnerReal(atacante);
            const realDefensorId = gameEngine.getOwnerReal(defensor);
            const paisAtacante = estadoActual[realAtacanteId];

            if (!paisAtacante || paisAtacante.eliminado || realAtacanteId === realDefensorId) return;

            if (!paisAtacante.vecinos.includes(realDefensorId)) return;

            io.emit('aplicar_ataque_parcial', { atacante: realAtacanteId, defensor: realDefensorId, porcentaje: 0.05 });
        });

        socket.on('reportar_victoria_total', (data) => {
            const { atacante, defensor } = data;
            const resultado = gameEngine.procesarConquista(atacante, defensor);
            if (resultado.exito) {
                io.emit('conquista_realizada', {
                    atacante,
                    defensor,
                    nuevoEstado: gameEngine.getEstadoActual()
                });
            }
        });

        socket.on('reset_juego', () => {
            const nuevoEstado = gameEngine.reiniciarEstado();
            io.emit('estado_inicial', nuevoEstado);
            io.emit('juego_reiniciado');
        });

        socket.on('disconnect', () => {
            console.log('Cliente desconectado:', socket.id);
        });
    });

    return io;
}

module.exports = setupSocket;

