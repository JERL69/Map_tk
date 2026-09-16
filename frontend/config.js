// Archivo de configuración global (Frontend)
// En localhost se usa el mismo origen (el backend sirve también el frontend),
// así se puede probar todo en el PC sin depender del despliegue remoto.
const esLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

window.CONFIG = {
    BACKEND_URL: esLocal ? "" : "https://maptk-production.up.railway.app"
};
