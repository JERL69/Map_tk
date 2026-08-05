require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const setupSocket = require('./socket');

const app = express();
const server = http.createServer(app);

// Habilitar CORS para permitir que Vercel se conecte a Railway
app.use(cors({ 
    origin: process.env.FRONTEND_URL || "*", 
    credentials: true 
}));

// Servir estáticos ya NO es necesario porque Vercel lo alojará
app.use(express.static(path.join(__dirname, '../frontend')));

// Configurar Socket.IO
setupSocket(server);

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Servidor de Conquista de América corriendo en puerto ${PORT}`);
});
