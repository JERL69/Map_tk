require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const setupSocket = require('./socket');

const app = express();
const server = http.createServer(app);

// Habilitar CORS para permitir que Vercel se conecte al backend
app.use(cors({ 
    origin: process.env.FRONTEND_URL || "*", 
    credentials: true 
}));

// Servir estáticos ya NO es necesario porque Vercel lo alojará
app.use(express.static(path.join(__dirname, '../frontend')));

// Configurar Socket.IO
setupSocket(server);

// Estado en tiempo real de las conexiones con TikTok. Permite diagnosticar si el
// backend está escuchando el live correcto sin depender de los logs del hosting.
app.get('/estado', (req, res) => {
    res.json({
        hora: new Date().toISOString(),
        streams: setupSocket.obtenerEstadoStreams()
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Servidor de Conquista de América corriendo en puerto ${PORT}`);
});
