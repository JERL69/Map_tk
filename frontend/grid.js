// Lógica del Grid Celular Orgánico (Estilo Territorial.io)

class GridManager {
    constructor(width, height, cellSize = 3) {
        this.width = width;
        this.height = height;
        this.cellSize = cellSize;
        
        this.cols = Math.ceil(width / cellSize);
        this.rows = Math.ceil(height / cellSize);
        this.numCells = this.cols * this.rows;
        
        // Arrays tipados para máximo rendimiento
        this.ownerGrid = new Uint8Array(this.numCells);
        this.powerGrid = new Uint8Array(this.numCells); // 0 a 100
        this.glowGrid = new Uint8Array(this.numCells);  // 0 a 255 (Efecto visual)
        
        // Mapeo Rápido de IDs
        this.paisStrToInt = {};
        this.paisIntToStr = []; // El index 0 es océano
        this.rgbCache = [];
        
        let i = 1;
        for (const idPais in window.paisesData) {
            this.paisStrToInt[idPais] = i;
            this.paisIntToStr[i] = idPais;
            i++;
        }
        
        // Stats para validación
        this.celdasOriginalesTotales = {};

        // Partículas ambientales para mantener el video en movimiento perpetuo (anti-stream estático)
        this.initParticulasAmbientales();
        
        // Setup Canvas Render Loop
        this.setupCanvas();
    }

    initParticulasAmbientales() {
        this.particulas = [];
        const numParticulas = 35;
        for (let i = 0; i < numParticulas; i++) {
            this.particulas.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                vy: -0.2 - Math.random() * 0.4,
                vx: (Math.random() - 0.5) * 0.3,
                radius: 1 + Math.random() * 2.2,
                alpha: 0.2 + Math.random() * 0.5,
                pulseSpeed: 0.02 + Math.random() * 0.03
            });
        }
    }

    setupCanvas() {
        this.canvas = document.getElementById('grid-canvas');
        if (!this.canvas) return; // Esperar a que el DOM esté listo
        
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.ctx = this.canvas.getContext('2d', { alpha: true });
        this.imgData = this.ctx.createImageData(this.width, this.height);
        this.buf = new Uint32Array(this.imgData.data.buffer);
    }

    // Redimensiona el grid y el canvas a un nuevo tamaño — llamado en resize
    redimensionar(newWidth, newHeight) {
        this.width  = newWidth;
        this.height = newHeight;
        this.cols   = Math.ceil(newWidth  / this.cellSize);
        this.rows   = Math.ceil(newHeight / this.cellSize);
        this.numCells = this.cols * this.rows;

        // Resetear arrays y contadores para la nueva rasterización
        this.ownerGrid = new Uint8Array(this.numCells);
        this.originalOwnerGrid = new Uint8Array(this.numCells); // Para recordar quién era el dueño original
        this.powerGrid = new Uint8Array(this.numCells);
        this.glowGrid  = new Uint8Array(this.numCells);
        this.celdasOriginalesTotales = {};
        this.initParticulasAmbientales();

        // Redimensionar el canvas principal
        if (!this.canvas) this.canvas = document.getElementById('grid-canvas');
        if (this.canvas) {
            this.canvas.width  = newWidth;
            this.canvas.height = newHeight;
            this.ctx = this.canvas.getContext('2d', { alpha: true });
            this.imgData = this.ctx.createImageData(newWidth, newHeight);
            this.buf = new Uint32Array(this.imgData.data.buffer);
        }
    }

    // Rasteriza el mapa vectorial (D3) a la matriz de celdas inicial
    // Se realiza de manera individual por país para evitar que el anti-aliasing del canvas
    // mezcle colores en los bordes y genere identificaciones erróneas (como artefactos rojos en Panamá)
    rasterizar(features, projection) {
        if (!this.canvas) this.setupCanvas();

        const canvas = document.createElement('canvas');
        canvas.width = this.width;
        canvas.height = this.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const path = d3.geoPath().projection(projection).context(ctx);

        const dbPaises = Object.values(window.paisesData);

        features.forEach(feature => {
            const p = dbPaises.find(p => p.id === feature.properties.id);
            if (p && this.paisStrToInt[p.id]) {
                const intId = this.paisStrToInt[p.id];

                // Limpiar lienzo temporal para este país
                ctx.clearRect(0, 0, this.width, this.height);

                ctx.save();

                ctx.beginPath();
                path(feature);
                ctx.fillStyle = "#ffffff";
                ctx.fill();
                ctx.restore();

                // Leer píxeles del país actual
                const imgData = ctx.getImageData(0, 0, this.width, this.height).data;

                // Mapear píxeles al Grid celular
                for (let y = 0; y < this.rows; y++) {
                    for (let x = 0; x < this.cols; x++) {
                        const px = x * this.cellSize;
                        const py = y * this.cellSize;
                        const index = (py * this.width + px) * 4;

                        if (imgData[index + 3] > 100) {
                            const cellIndex = y * this.cols + x;
                            this.ownerGrid[cellIndex] = intId;
                            this.originalOwnerGrid[cellIndex] = intId; // Guardar dueño original
                            this.powerGrid[cellIndex] = 100;
                            const strId = this.paisIntToStr[intId];
                            this.celdasOriginalesTotales[strId] = (this.celdasOriginalesTotales[strId] || 0) + 1;
                        }
                    }
                }
            }
        });

        console.log("Rasterización orgánica completada.");
        this.actualizarCacheColores();
        this.startRenderLoop();
        
        window.dispatchEvent(new Event('gridListo'));
    }

    actualizarCacheColores() {
        for (let i = 1; i < this.paisIntToStr.length; i++) {
            const idPais = this.paisIntToStr[i];
            const colorHex = estadoGlobal[idPais] ? estadoGlobal[idPais].color : window.paisesData[idPais].colorOriginal;
            
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(colorHex);
            this.rgbCache[i] = result ? [
                parseInt(result[1], 16),
                parseInt(result[2], 16),
                parseInt(result[3], 16)
            ] : [255, 255, 255];
        }
        
        // Color especial para "Tierra Muerta" (Bombardeada)
        this.rgbCache[255] = [90, 90, 90]; // Gris oscuro
    }

    startRenderLoop() {
        let frameCount = 0;
        const render = () => {
            frameCount++;
            // Limpiar fondo
            this.buf.fill(0);

            for (let cy = 0; cy < this.rows; cy++) {
                for (let cx = 0; cx < this.cols; cx++) {
                    const cellIndex = cy * this.cols + cx;
                    const owner = this.ownerGrid[cellIndex];
                    
                    if (owner === 0) continue; // Océano transparente

                    const color = this.rgbCache[owner];
                    const glow = this.glowGrid[cellIndex];
                    
                    let r = color[0];
                    let g = color[1];
                    let b = color[2];

                    if (glow > 0) {
                        r = Math.min(255, r + glow);
                        g = Math.min(255, g + glow);
                        b = Math.min(255, b + glow);
                        this.glowGrid[cellIndex] = Math.max(0, glow - 3); // Apagar suavemente el brillo
                    }

                    // Calcular sombra/oscuridad si el poder está bajo (mostrando daño)
                    const pwr = this.powerGrid[cellIndex];
                    if (pwr < 100 && glow === 0) {
                        const factor = 0.5 + (pwr / 200); // 50% a 100% brillo original
                        r = Math.floor(r * factor);
                        g = Math.floor(g * factor);
                        b = Math.floor(b * factor);
                    }

                    const argb = (255 << 24) | (b << 16) | (g << 8) | r;
                    const px = cx * this.cellSize;
                    const py = cy * this.cellSize;
                    
                    // Rellenar píxeles físicos del bloque
                    for (let dy = 0; dy < this.cellSize; dy++) {
                        for (let dx = 0; dx < this.cellSize; dx++) {
                            const pixelIndex = (py + dy) * this.width + (px + dx);
                            this.buf[pixelIndex] = argb;
                        }
                    }
                }
            }
            
            this.ctx.putImageData(this.imgData, 0, 0);

            // DIBUJAR PARTÍCULAS AMBIENTALES Y EFECTOS EN VIVO (Garantiza movimiento de píxeles constante)
            if (this.particulas && this.particulas.length > 0) {
                for (let i = 0; i < this.particulas.length; i++) {
                    const p = this.particulas[i];
                    p.y += p.vy;
                    p.x += p.vx;
                    p.alpha += Math.sin(frameCount * p.pulseSpeed) * 0.01;

                    if (p.y < 0) {
                        p.y = this.height;
                        p.x = Math.random() * this.width;
                    }
                    if (p.x < 0) p.x = this.width;
                    if (p.x > this.width) p.x = 0;

                    this.ctx.beginPath();
                    this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                    this.ctx.fillStyle = `rgba(0, 242, 254, ${Math.max(0.1, Math.min(0.7, p.alpha))})`;
                    this.ctx.shadowBlur = 6;
                    this.ctx.shadowColor = '#00f2fe';
                    this.ctx.fill();
                }
                this.ctx.shadowBlur = 0;
            }

            requestAnimationFrame(render);
        };
        
        requestAnimationFrame(render);
    }

    iniciarInfeccion(atacanteStr, defensorStr, porcentaje = 0.05) {
        const atacanteId = this.paisStrToInt[atacanteStr];
        const defensorId = this.paisStrToInt[defensorStr];
        
        if (!atacanteId || !defensorId) return;

        // Recuperar "Tierra Muerta" (255) adyacente rápidamente
        let recuperoTierra = false;
        for (let i = 0; i < this.numCells; i++) {
            if (this.ownerGrid[i] === 255) {
                const x = i % this.cols;
                if ((x > 0 && this.ownerGrid[i - 1] === atacanteId) ||
                    (x < this.cols - 1 && this.ownerGrid[i + 1] === atacanteId) ||
                    (i >= this.cols && this.ownerGrid[i - this.cols] === atacanteId) ||
                    (i < this.numCells - this.cols && this.ownerGrid[i + this.cols] === atacanteId)) {
                    this.ownerGrid[i] = atacanteId;
                    this.powerGrid[i] = 100;
                    recuperoTierra = true;
                }
            }
        }

        // Calcular la "Reserva de Daño" que trae este ataque
        const totalCeldasOriginales = this.celdasOriginalesTotales[defensorStr] || 500;
        const totalDamage = Math.max(20, Math.floor(totalCeldasOriginales * porcentaje * 100));
        let damageRemaining = totalDamage;

        // Encontrar Frontera Activa de forma ultra-rápida (Escaneo lineal)
        let celdasFrontera = [];
        for (let i = 0; i < this.numCells; i++) {
            if (this.ownerGrid[i] === defensorId) {
                const x = i % this.cols;
                if ((x > 0 && this.ownerGrid[i - 1] === atacanteId) ||
                    (x < this.cols - 1 && this.ownerGrid[i + 1] === atacanteId) ||
                    (i >= this.cols && this.ownerGrid[i - this.cols] === atacanteId) ||
                    (i < this.numCells - this.cols && this.ownerGrid[i + this.cols] === atacanteId)) {
                    celdasFrontera.push(i);
                }
            }
        }

        // Si no hay frontera física (países separados por agua o países faltantes), lanzar "paracaidistas" tácticos
        if (celdasFrontera.length === 0) {
            const posibles = [];
            const muestrasAtacante = [];
            
            // Recolectar posibles destinos y algunas celdas del atacante para medir distancias
            for (let i = 0; i < this.numCells; i++) {
                if (this.ownerGrid[i] === defensorId) posibles.push(i);
                else if (this.ownerGrid[i] === atacanteId && i % 17 === 0) {
                    // Tomamos 1 de cada 17 celdas del atacante para que el cálculo sea rápido
                    muestrasAtacante.push({ x: i % this.cols, y: Math.floor(i / this.cols) });
                }
            }

            // Si no hay frontera natural, lanzar un paracaidista (solo si están cerca visualmente)
            if (posibles.length > 0 && muestrasAtacante.length > 0) {
                let mejorLanding = posibles[0];
                let minDistSq = Infinity;

                // Para no afectar el rendimiento, si el defensor es enorme, evaluamos una muestra
                const step = Math.max(1, Math.floor(posibles.length / 500));
                for (let j = 0; j < posibles.length; j += step) {
                    const idx = posibles[j];
                    const px = idx % this.cols;
                    const py = Math.floor(idx / this.cols);

                    for (let k = 0; k < muestrasAtacante.length; k++) {
                        const ax = muestrasAtacante[k].x;
                        const ay = muestrasAtacante[k].y;
                        const distSq = (px - ax) ** 2 + (py - ay) ** 2;
                        if (distSq < minDistSq) {
                            minDistSq = distSq;
                            mejorLanding = idx;
                        }
                    }
                }

                // Evitar bugs de teletransportación a países lejanos (distancia > 50 celdas)
                if (minDistSq > 2500) {
                    console.warn(`[GridManager] Ataque bloqueado: ${atacanteStr} está demasiado lejos de ${defensorStr} para iniciar invasión.`);
                    return; // Abortar ataque si están demasiado lejos
                }

                const landing = mejorLanding;
                this.ownerGrid[landing] = atacanteId;
                this.powerGrid[landing] = 100;
                this.glowGrid[landing] = 255;
                
                // Iniciar la expansión desde los vecinos de esta nueva cabeza de playa
                const x = landing % this.cols;
                if (x > 0 && this.ownerGrid[landing - 1] === defensorId) celdasFrontera.push(landing - 1);
                if (x < this.cols - 1 && this.ownerGrid[landing + 1] === defensorId) celdasFrontera.push(landing + 1);
                if (landing >= this.cols && this.ownerGrid[landing - this.cols] === defensorId) celdasFrontera.push(landing - this.cols);
                if (landing < this.numCells - this.cols && this.ownerGrid[landing + this.cols] === defensorId) celdasFrontera.push(landing + this.cols);
            } else {
                return; // El país ya no existe físicamente
            }
        }

        // Bucle de asedio progresivo (60 frames aprox)
        const damagePerTick = Math.ceil(damageRemaining / 60);

        const interval = setInterval(() => {
            if (damageRemaining <= 0 || celdasFrontera.length === 0) {
                clearInterval(interval);
                
                // Verificar si el defensor fue aniquilado completamente en esta ronda de ataque
                let defenderAlive = false;
                for (let j = 0; j < this.numCells; j++) {
                    if (this.ownerGrid[j] === defensorId) {
                        defenderAlive = true;
                        break;
                    }
                }
                
                if (!defenderAlive) {
                    window.dispatchEvent(new CustomEvent('victoria_total', {
                        detail: { atacante: atacanteStr, defensor: defensorStr }
                    }));
                }
                
                return;
            }

            let tickDamage = Math.min(damagePerTick, damageRemaining);
            damageRemaining -= tickDamage;

            let damagePerCell = Math.max(1, Math.ceil(tickDamage / celdasFrontera.length));
            let nuevasFronteras = [];

            // Desordenar ligeramente para que el borde no se vea lineal
            celdasFrontera.sort(() => Math.random() - 0.5);

            for (let i = 0; i < celdasFrontera.length; i++) {
                if (tickDamage <= 0) {
                    // Mantener el resto de la frontera viva para el siguiente frame
                    nuevasFronteras.push(celdasFrontera[i]);
                    continue;
                }
                
                const cIdx = celdasFrontera[i];
                if (this.ownerGrid[cIdx] !== defensorId) continue; 

                let pwr = this.powerGrid[cIdx];
                if (pwr <= damagePerCell) {
                    // ¡Celda Conquistada!
                    tickDamage -= pwr;
                    this.ownerGrid[cIdx] = atacanteId;
                    this.powerGrid[cIdx] = 100; // Regenera vida plena para el atacante
                    this.glowGrid[cIdx] = 200;  // Destello de conquista

                    // Buscar nuevos vecinos defensores para la próxima frontera
                    const x = cIdx % this.cols;
                    if (x > 0 && this.ownerGrid[cIdx - 1] === defensorId) nuevasFronteras.push(cIdx - 1);
                    if (x < this.cols - 1 && this.ownerGrid[cIdx + 1] === defensorId) nuevasFronteras.push(cIdx + 1);
                    if (cIdx >= this.cols && this.ownerGrid[cIdx - this.cols] === defensorId) nuevasFronteras.push(cIdx - this.cols);
                    if (cIdx < this.numCells - this.cols && this.ownerGrid[cIdx + this.cols] === defensorId) nuevasFronteras.push(cIdx + this.cols);
                } else {
                    // Celda resiste
                    this.powerGrid[cIdx] -= damagePerCell;
                    this.glowGrid[cIdx] = 100; // Brillo medio de batalla
                    tickDamage -= damagePerCell;
                    nuevasFronteras.push(cIdx);
                }
            }

            celdasFrontera = [...new Set(nuevasFronteras)];
        }, 16);
    }

    syncEstado(estadoGlobal) {
        this.actualizarCacheColores();
        // Propagar dinámicamente según owner
        // No necesitamos resetear celdas! El lienzo es persistente y refleja el daño exacto actual.
        // Solo verificamos si hay algún dueño completamente eliminado
        const dueñosActivos = new Set();
        for (const id in estadoGlobal) {
            if (!estadoGlobal[id].eliminado) {
                dueñosActivos.add(this.paisStrToInt[estadoGlobal[id].id]);
            }
        }
        
        // Asimilar celdas caídas que no se procesaron
        for(let i=0; i<this.numCells; i++) {
            const intId = this.ownerGrid[i];
            if (intId !== 0 && !dueñosActivos.has(intId)) {
                const strId = this.paisIntToStr[intId];
                if (estadoGlobal[strId] && estadoGlobal[strId].owner) {
                    this.ownerGrid[i] = this.paisStrToInt[estadoGlobal[strId].owner];
                }
            }
        }
    }
    calcularTerritorios() {
        const conteo = {};
        for (let i = 0; i < this.numCells; i++) {
            const intId = this.ownerGrid[i];
            if (intId > 0) {
                conteo[intId] = (conteo[intId] || 0) + 1;
            }
        }
        return conteo;
    }

    obtenerBoundingBox(idPaisStr) {
        const intId = this.paisStrToInt[idPaisStr];
        if (!intId) return null;

        let minX = this.cols, maxX = 0;
        let minY = this.rows, maxY = 0;
        let found = false;

        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const i = y * this.cols + x;
                if (this.ownerGrid[i] === intId) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                    found = true;
                }
            }
        }

        if (!found) return null;

        return {
            x: minX * this.cellSize,
            y: minY * this.cellSize,
            width: (maxX - minX + 1) * this.cellSize,
            height: (maxY - minY + 1) * this.cellSize,
            centerX: ((minX + maxX) / 2) * this.cellSize,
            centerY: ((minY + maxY) / 2) * this.cellSize
        };
    }

    lanzarBombas(cantidad) {
        let contador = 0;
        let countriesHit = new Set();
        if (window.gameScene) window.gameScene.cameras.main.shake(1500, 0.015);

        const dropBomb = () => {
            if (contador >= cantidad) {
                // Check if any country was eliminated
                setTimeout(() => {
                    for (const intId of countriesHit) {
                        let alive = false;
                        for (let i = 0; i < this.numCells; i++) {
                            if (this.ownerGrid[i] === intId) {
                                alive = true;
                                break;
                            }
                        }
                        if (!alive) {
                            const strId = this.paisIntToStr[intId];
                            if (strId) {
                                window.dispatchEvent(new CustomEvent('victoria_total', {
                                    detail: { atacante: "Apocalipsis", defensor: strId }
                                }));
                            }
                        }
                    }
                }, 500);
                return;
            }
            
            contador++;

            let px = 0, py = 0, cellIndex = 0, owner = 0;
            let attempts = 0;
            do {
                px = Math.floor(Math.random() * this.cols);
                py = Math.floor(Math.random() * this.rows);
                cellIndex = py * this.cols + px;
                owner = this.ownerGrid[cellIndex];
                attempts++;
            } while (owner === 0 && attempts < 200);

            if (owner !== 0) {
                // Radio de explosión (~5% del ancho del mapa)
                const radius = Math.max(5, Math.floor((this.width * 0.05) / this.cellSize)); 
                const radiusSq = radius * radius;

                for (let dy = -radius; dy <= radius; dy++) {
                    for (let dx = -radius; dx <= radius; dx++) {
                        if (dx*dx + dy*dy <= radiusSq) {
                            const nx = px + dx;
                            const ny = py + dy;
                            if (nx >= 0 && nx < this.cols && ny >= 0 && ny < this.rows) {
                                const nIdx = ny * this.cols + nx;
                                const currentOwner = this.ownerGrid[nIdx];
                                
                                if (currentOwner !== 0 && currentOwner !== 255) {
                                    countriesHit.add(currentOwner);
                                    // Siempre se vuelve Tierra Muerta (Gris = 255) indiscriminadamente
                                    this.ownerGrid[nIdx] = 255;
                                    this.powerGrid[nIdx] = 20;
                                }
                            }
                        }
                    }
                }

                // Generar impacto visual de explosión masiva
                if (window.gameScene) {
                    Animaciones.crearExplosion(window.gameScene, px * this.cellSize, py * this.cellSize);
                    window.gameScene.cameras.main.flash(150, 255, 100, 100); 
                }
            }

            setTimeout(dropBomb, 350);
        };

        dropBomb();
    }
}

// Instanciar globalmente (Resolución de 1 px para evitar pixelado)
// Usar el wrapper 9:16 para que el grid encaje en TikTok LIVE Studio
;(function() {
    const _wrapper = document.getElementById('root-wrapper');
    const _w = _wrapper ? _wrapper.offsetWidth  : window.innerWidth;
    const _h = _wrapper ? _wrapper.offsetHeight : window.innerHeight;
    
    // Si se está en un entorno de alta resolución (como OBS o Retina), escalamos
    const dpr = window.devicePixelRatio || 1;
    window.gridManager = new GridManager(_w, _h, 1);
})();
