class Animaciones {
    static asediosActivos = {};

    static iniciarAsedio(escena, atacanteId, defensorId, origen, destino) {
        if (!origen || !destino) return;

        // Limpiar asedio previo si existe
        if (this.asediosActivos[atacanteId]) {
            this.asediosActivos[atacanteId].remove();
        }

        // Crear un evento continuo (cada 100ms)
        const asedioTimer = escena.time.addEvent({
            delay: 100,
            callback: () => {
                // Proyectil
                const proyectil = escena.add.circle(origen.x, origen.y, 4, 0x00f2fe);
                escena.tweens.add({
                    targets: proyectil,
                    x: destino.x + Phaser.Math.Between(-10, 10),
                    y: destino.y + Phaser.Math.Between(-10, 10),
                    duration: 400,
                    ease: 'Linear',
                    onComplete: () => {
                        proyectil.destroy();
                        Animaciones.crearMiniImpacto(escena, proyectil.x, proyectil.y);
                    }
                });
            },
            loop: true
        });

        this.asediosActivos[atacanteId] = asedioTimer;
    }

    static detenerAsedio(atacanteId) {
        if (this.asediosActivos[atacanteId]) {
            this.asediosActivos[atacanteId].remove();
            delete this.asediosActivos[atacanteId];
        }
    }

    static crearMiniImpacto(escena, x, y) {
        const particula = escena.add.circle(x, y, 3, 0xff0050);
        escena.tweens.add({
            targets: particula,
            scale: 2,
            alpha: 0,
            duration: 300,
            onComplete: () => particula.destroy()
        });
    }

    static crearExplosion(escena, x, y) {
        for (let i = 0; i < 30; i++) {
            const particula = escena.add.circle(x, y, Phaser.Math.Between(3, 8), 0xffffff);
            
            const angulo = Phaser.Math.Between(0, 360);
            const distancia = Phaser.Math.Between(30, 120);
            const radianes = Phaser.Math.DegToRad(angulo);
            
            escena.tweens.add({
                targets: particula,
                x: x + Math.cos(radianes) * distancia,
                y: y + Math.sin(radianes) * distancia,
                alpha: 0,
                duration: Phaser.Math.Between(500, 1000),
                ease: 'Cubic.easeOut',
                onComplete: () => {
                    particula.destroy();
                }
            });
        }
    }

    static apocalipsis(escena, width, height) {
        let contador = 0;
        // Sacudir la cámara por 5 segundos (5000ms)
        escena.cameras.main.shake(5000, 0.02);
        
        // Crear explosiones masivas y aleatorias por todo el mapa
        escena.time.addEvent({
            delay: 150, 
            callback: () => {
                const rx = Phaser.Math.Between(50, width - 50);
                const ry = Phaser.Math.Between(50, height - 50);
                this.crearExplosion(escena, rx, ry);
                contador++;
                
                // Destello rojo intenso cada 5 explosiones
                if (contador % 5 === 0) {
                    escena.cameras.main.flash(200, 255, 0, 0); 
                }
            },
            repeat: 33 // Total: 5 segundos de explosiones
        });
    }
}

window.Animaciones = Animaciones;
