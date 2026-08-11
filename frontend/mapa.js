// Metadata de labels — tamaño proporcional al territorio de cada país
const PAIS_INFO = {
    mexico:      { size: 'lg',  nombre: 'México'      },
    el_salvador: { size: 'sm',  nombre: 'El Salvador' },
    costa_rica:  { size: 'sm',  nombre: 'Costa Rica'  },
    panama:      { size: 'sm',  nombre: 'Panamá'      },
    colombia:    { size: 'md',  nombre: 'Colombia'    },
    venezuela:   { size: 'md',  nombre: 'Venezuela'   },
    ecuador:     { size: 'sm',  nombre: 'Ecuador'     },
    peru:        { size: 'md',  nombre: 'Perú'        },
    brasil:      { size: 'lg',  nombre: 'Brasil'      },
    bolivia:     { size: 'md',  nombre: 'Bolivia'     },
    paraguay:    { size: 'sm',  nombre: 'Paraguay'    },
    chile:       { size: 'md',  nombre: 'Chile'       },
    argentina:   { size: 'md',  nombre: 'Argentina'   },
    uruguay:     { size: 'sm',  nombre: 'Uruguay'     }
};

class MapaGeografico {
    constructor(containerId) {
        this.container = d3.select(containerId);
        // Usar el wrapper 9:16 en lugar de la ventana completa
        const wrapper = document.getElementById('root-wrapper');
        this.width  = wrapper ? wrapper.offsetWidth  : window.innerWidth;
        this.height = wrapper ? wrapper.offsetHeight : window.innerHeight;

        // SVG transparente — capa interactiva y de labels
        this.svg = this.container.append("svg")
            .attr("width", "100%")
            .attr("height", "100%")
            .style("position", "absolute")
            .style("top", "0")
            .style("left", "0")
            .style("z-index", "2")
            .style("background-color", "transparent");

        this.g = this.svg.append("g");

        this.projection = d3.geoMercator();
        this.pathGenerator = d3.geoPath().projection(this.projection);

        this.paisesNodes = {};
        this.centroides  = {};

        this.initMap();
    }

    async initMap() {
        try {
            const response = await fetch('https://unpkg.com/world-atlas@2.0.2/countries-50m.json');
            const world    = await response.json();
            const features = topojson.feature(world, world.objects.countries).features;

            // Guardar referencias para poder re-dibujar en resize
            this._topoWorld = world;
            this._geoFeatures = features;

            this.dibujarPaises(features, world);
            this.configurarZoom();
            this._escucharResize();

            window.dispatchEvent(new Event('mapaListo'));
        } catch (err) {
            console.error("Error cargando el mapa:", err);
        }
    }

    dibujarPaises(geoJsonFeatures, topoWorld) {
        const dbPaises = Object.values(window.paisesData);

        // 1. Obtener todas las geometrías crudas del TopoJSON
        const geoms = topoWorld.objects.countries.geometries;
        const getGeom = (name) => geoms.find(g => g.properties && g.properties.name === name);

        // 2. Definir los mega-bloques para Centroamérica
        const geomsElSalvador = [getGeom("El Salvador"), getGeom("Guatemala"), getGeom("Honduras"), getGeom("Belize")].filter(Boolean);
        const geomsCostaRica  = [getGeom("Nicaragua")].filter(Boolean);
        const geomsPanama     = [getGeom("Panama"), getGeom("Costa Rica")].filter(Boolean);

        // 3. Crear las Features GeoJSON fusionadas
        const featureElSalvador = {
            type: "Feature",
            properties: { name: "Mega El Salvador", id: "el_salvador" },
            geometry: topojson.merge(topoWorld, geomsElSalvador)
        };

        const featureCostaRica = {
            type: "Feature",
            properties: { name: "Mega Costa Rica", id: "costa_rica" },
            geometry: topojson.merge(topoWorld, geomsCostaRica)
        };

        const featurePanama = {
            type: "Feature",
            properties: { name: "Mega Panama", id: "panama" },
            geometry: topojson.merge(topoWorld, geomsPanama)
        };

        // 4. Países normales
        const paisesNormalesIDs = ["mexico", "colombia", "venezuela", "ecuador", "peru", "brasil", "bolivia", "paraguay", "chile", "argentina", "uruguay"];
        
        const mapDataNormales = geoJsonFeatures.filter(f => {
            const p = dbPaises.find(p => p.topoName === f.properties.name);
            if (p && paisesNormalesIDs.includes(p.id)) {
                f.properties.id = p.id;
                
                // Eliminar las islas Galápagos de Ecuador (longitud < -85)
                if (p.id === "ecuador" && f.geometry && f.geometry.type === "MultiPolygon") {
                    f.geometry.coordinates = f.geometry.coordinates.filter(polygon => {
                        return polygon[0] && polygon[0][0] && polygon[0][0][0] > -85;
                    });
                }
                
                return true;
            }
            return false;
        });

        // 5. Unir todo en el nuevo mapData
        const mapData = [...mapDataNormales, featureElSalvador, featureCostaRica, featurePanama];
        const featureCollection = { type: "FeatureCollection", features: mapData };

        // Guardar mapData y featureCollection para el resize
        this._mapData           = mapData;
        this._featureCollection = featureCollection;

        // ==========================================
        // LÓGICA RESPONSIVE (OBS Vertical vs PC)
        // ==========================================
        this._aplicarProyeccion();

        // Costas exteriores (brillo táctico elegante) - Restaurado para mapa limpio
        this.g.append("path")
            .datum(topojson.mesh(topoWorld, topoWorld.objects.countries, (a, b) => a === b))
            .attr("d", this.pathGenerator)
            .attr("fill", "none")
            .attr("stroke", "rgba(0,242,254,0.25)")
            .attr("stroke-width", 1.2)
            .attr("class", "costas")
            .style("pointer-events", "none");

        // Fronteras SVG
        this.g.selectAll("path.frontera-pais")
            .data(mapData)
            .enter()
            .append("path")
            .attr("d", this.pathGenerator)
            .attr("fill", "none")
            .attr("stroke", "rgba(0,0,0,0.5)")
            .attr("stroke-width", 1.0)
            .attr("class", "frontera-pais")
            .style("pointer-events", "none");

        // Paths invisibles para clicks e interacción
        this.g.selectAll("path.pais")
            .data(mapData)
            .enter()
            .append("path")
            .attr("d", this.pathGenerator)
            .attr("class", "pais")
            .attr("fill", "rgba(0,0,0,0.01)")
            .attr("stroke", "none")
            .attr("id", d => {
                const p = dbPaises.find(p => p.id === d.properties.id);
                return p ? `pais-${p.id}` : "";
            })
            .on("mouseover", (event, d) => {
                const hoveredId = d.properties.id;
                
                // Encontrar el dueño supremo (si A es de B, y B es de C -> dueño es C)
                const getOwner = (id) => {
                    if (typeof estadoGlobal === 'undefined') return id;
                    let current = estadoGlobal[id];
                    while (current && current.owner && current.owner !== current.id && estadoGlobal[current.owner]) {
                        current = estadoGlobal[current.owner];
                    }
                    return current ? current.id : id;
                };

                const actualOwner = getOwner(hoveredId);

                // Iluminar todos los paths que pertenezcan a este imperio
                this.g.selectAll("path.pais").each(function(pathData) {
                    const pathOwner = getOwner(pathData.properties.id);
                    if (pathOwner === actualOwner) {
                        if (!d3.select(this).classed("pais-seleccionado")) {
                            d3.select(this).classed("pais-hover", true);
                        }
                    }
                });
            })
            .on("mouseout", () => {
                this.g.selectAll("path.pais").classed("pais-hover", false);
            })
            .on("click", (event, d) => {
                const p = dbPaises.find(p => p.id === d.properties.id);
                if (p) this.seleccionarPais(p.id);
            })
            .each((d, i, nodes) => {
                const p = dbPaises.find(p => p.id === d.properties.id);
                if (!p) return;

                this.paisesNodes[p.id] = d3.select(nodes[i]);

                // Centroide geográfico real (sin escala visual)
                const [cx, cy] = this.pathGenerator.centroid(d);
                this.centroides[p.id] = { x: cx, y: cy };

                // ── Label siempre dentro del país, sin conectores ──
                const info = PAIS_INFO[p.id] || { size: 'sm', nombre: p.nombre };

                // Ajustes finos de centroide para países con formas irregulares
                const factor = this.scaleVal / 250;
                let lx = cx, ly = cy;
                if (p.id === 'brasil')    { lx += 12 * factor; ly -= 8  * factor; }
                if (p.id === 'argentina') { lx -= 6  * factor; ly += 10 * factor; }
                if (p.id === 'chile')     { lx += 4  * factor; }
                if (p.id === 'peru')      { lx -= 4  * factor; }
                if (p.id === 'mexico')    { lx += 8  * factor; ly += 6  * factor; }

                this.g.append("text")
                    .attr("x", lx)
                    .attr("y", ly)
                    .attr("text-anchor", "middle")
                    .attr("dominant-baseline", "central")
                    .attr("class", `label-pais size-${info.size}`)
                    .attr("data-id", p.id)
                    .attr("data-size", info.size)
                    .attr("data-full", info.nombre)
                    .attr("pointer-events", "none")
                    .text(info.nombre.toUpperCase())
                    .attr("id", `texto-${p.id}`);
            });
    }

    // ─────────────────────────────────────────────────
    // Calcula y aplica la proyección según tamaño actual
    // ─────────────────────────────────────────────────
    _aplicarProyeccion() {
        const isVertical = this.width < this.height;
        const padLeft   = isVertical ? 8   : 12;
        const padRight  = isVertical ? 8   : 12;
        const padTop    = isVertical ? 45  : 30;
        const padBottom = isVertical ? 115 : 70;

        const extX = Math.max(10, this.width  - padRight);
        const extY = Math.max(padTop + 10, this.height - padBottom);

        try {
            this.projection.fitExtent(
                [[padLeft, padTop], [extX, extY]],
                this._featureCollection
            );
        } catch (e) {
            this.projection.fitExtent([[0, 0], [this.width, this.height]], this._featureCollection);
        }

        this.pathGenerator.projection(this.projection);
        this.scaleVal = this.projection.scale();

        // Re-rasterizar el canvas celular
        if (window.gridManager) {
            window.gridManager.redimensionar(this.width, this.height);
            window.gridManager.rasterizar(this._mapData, this.projection);
        }
    }

    // ─────────────────────────────────────────────────
    // Observador de resize — reconstruye el mapa
    // ─────────────────────────────────────────────────
    _escucharResize() {
        let _timer = null;
        const wrapper = document.getElementById('root-wrapper') || document.body;

        const onResize = () => {
            clearTimeout(_timer);
            _timer = setTimeout(() => {
                const newW = wrapper.offsetWidth;
                const newH = wrapper.offsetHeight;

                // Solo actuar si el tamaño cambió de verdad
                if (Math.abs(newW - this.width) < 2 && Math.abs(newH - this.height) < 2) return;

                this.width  = newW;
                this.height = newH;

                this._aplicarProyeccion();

                // Redibujar todos los paths SVG
                this.g.selectAll("path").attr("d", this.pathGenerator);

                // Recalcular centroides y posición de labels
                this.g.selectAll("path.pais").each((d, i, nodes) => {
                    const p = Object.values(window.paisesData).find(p => p.id === d.properties.id);
                    if (!p) return;
                    const [cx, cy] = this.pathGenerator.centroid(d);
                    this.centroides[p.id] = { x: cx, y: cy };

                    const factor = this.scaleVal / 250;
                    let lx = cx, ly = cy;
                    if (p.id === 'brasil')    { lx += 12 * factor; ly -= 8  * factor; }
                    if (p.id === 'argentina') { lx -= 6  * factor; ly += 10 * factor; }
                    if (p.id === 'chile')     { lx += 4  * factor; }
                    if (p.id === 'peru')      { lx -= 4  * factor; }
                    if (p.id === 'mexico')    { lx += 8  * factor; ly += 6  * factor; }

                    this.g.select(`#texto-${p.id}`)
                        .attr("x", lx)
                        .attr("y", ly);
                });

                // Resetear el zoom a la posición inicial
                this._aplicarZoomInicial();

            }, 120); // debounce 120ms
        };

        // ResizeObserver — más fiable que window.resize para elementos CSS
        if (typeof ResizeObserver !== 'undefined') {
            new ResizeObserver(onResize).observe(wrapper);
        } else {
            window.addEventListener('resize', onResize);
        }
    }


    configurarZoom() {
        const zoom = d3.zoom()
            .scaleExtent([0.5, 8])
            .on("zoom", (event) => {
                const k = event.transform.k;
                this.g.attr("transform", event.transform);

                const canvas = document.getElementById('grid-canvas');
                if (canvas) {
                    canvas.style.transformOrigin = "0 0";
                    canvas.style.transform = `translate(${event.transform.x}px,${event.transform.y}px) scale(${k})`;
                }

                this.actualizarLabels(k);
            });

        this.svg.call(zoom);
        this.zoomBehavior = zoom;
        this._aplicarZoomInicial();
    }

    _aplicarZoomInicial() {
        if (!this.zoomBehavior) return;
        const isVertical = this.width < this.height;

        // Zoom 1.0 en vertical: el fitExtent ya encuadra el mapa perfecto.
        // Un zoom mayor de 1.0 cortaría México arriba o Argentina abajo.
        const initialZoom = isVertical ? 1.0 : 1.30;

        // En vertical no desplazamos — fitExtent ya centra.
        // En horizontal sí movemos ligeramente a la izquierda.
        const cx = this.width  / 2;
        const cy = this.height / 2;
        let tx = cx - cx * initialZoom;
        let ty = cy - cy * initialZoom;

        if (!isVertical) {
            tx -= (this.width  * 0.08);
            ty += (this.height * 0.05);
        }

        this.svg
            .transition().duration(600)
            .call(this.zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(initialZoom));
        setTimeout(() => this.actualizarLabels(initialZoom), 700);
    }

    zoomAPais(idPais, duration = 1500, scale = 2.5) {
        let cx, cy, finalScale = scale;
        
        if (window.gridManager) {
            const bbox = window.gridManager.obtenerBoundingBox(idPais);
            if (bbox) {
                cx = bbox.centerX;
                cy = bbox.centerY;
                
                // Calculamos la escala para que todo el país entre en pantalla
                // Dejamos un margen del 20%
                const scaleX = (this.width * 0.8) / bbox.width;
                const scaleY = (this.height * 0.8) / bbox.height;
                
                // La escala calculada debe ser el menor de ambos para que quepa tanto de ancho como alto
                const calculatedScale = Math.min(scaleX, scaleY);
                
                // No permitir un zoom mayor que el parámetro scale para no acercarse de más
                // Ni menor a 1.0 para no alejar de más
                finalScale = Math.max(1.0, Math.min(calculatedScale, scale));
            } else {
                const c = this.centroides[idPais];
                if (!c) return;
                cx = c.x;
                cy = c.y;
            }
        } else {
            const c = this.centroides[idPais];
            if (!c) return;
            cx = c.x;
            cy = c.y;
        }

        const tx = this.width  / 2 - cx * finalScale;
        const ty = this.height / 2 - cy * finalScale;
        this.svg.transition().duration(duration).ease(d3.easeCubicInOut)
            .call(this.zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(finalScale));
    }

    zoomRestaurar(duration = 1800) {
        this.svg.transition().duration(duration).ease(d3.easeCubicInOut)
            .call(this.zoomBehavior.transform, d3.zoomIdentity);
    }

    actualizarLabels(k) {
        const labels = this.g.selectAll("text.label-pais").nodes();

        const bboxes = labels.map(node => ({
            node:         d3.select(node),
            id:           node.getAttribute("data-id"),
            sizeCategory: node.getAttribute("data-size"),
            rect:         node.getBoundingClientRect(),
            visible:      true
        }));

        // Anti-colisión: los países más grandes ganan visibilidad
        for (let i = 0; i < bboxes.length; i++) {
            if (!bboxes[i].visible) continue;
            const r1 = bboxes[i].rect;
            if (!r1.width || !r1.height) continue;

            for (let j = i + 1; j < bboxes.length; j++) {
                if (!bboxes[j].visible) continue;
                const r2 = bboxes[j].rect;
                if (!r2.width || !r2.height) continue;

                const colisiona = !(r2.left > r1.right || r2.right < r1.left ||
                                    r2.top  > r1.bottom || r2.bottom < r1.top);
                if (colisiona) {
                    const sz = { lg: 3, md: 2, sm: 1 };
                    if ((sz[bboxes[i].sizeCategory] || 1) >= (sz[bboxes[j].sizeCategory] || 1)) {
                        bboxes[j].visible = false;
                    } else {
                        bboxes[i].visible = false;
                        break;
                    }
                }
            }
        }

        bboxes.forEach(b => {
            // Tamaño base según categoría — escala invariante (se mantiene legible al zoom)
            const baseSize = b.sizeCategory === 'lg' ? 32 : b.sizeCategory === 'md' ? 18 : 12;
            const size = (baseSize * Math.pow(k, 0.48)) / k;

            // Países pequeños: abreviatura al zoom bajo, nombre completo al zoom alto
            const texto = (b.sizeCategory === 'sm' && k <= 1.8)
                ? b.node.attr("data-id").substring(0, 3).toUpperCase()
                : b.node.attr("data-full").toUpperCase();

            b.node
                .text(texto)
                .style("font-size", `${size}px`)
                .style("opacity",   b.visible ? 1 : 0)
                .style("display",   b.visible ? "block" : "none");
        });
    }

    actualizarTextoOcupante(idPais, nombreOcupante) {
        const n = this.g.select(`#texto-${idPais}`);
        if (!n.empty()) n.text(nombreOcupante);
    }

    obtenerCentro(idPais) {
        return this.centroides[idPais] || { x: 0, y: 0 };
    }

    seleccionarPais(idPais) {
        this.g.selectAll(".pais").classed("pais-seleccionado", false).classed("pais-vecino", false);
        if (this.paisesNodes[idPais]) {
            // Despachar el evento
            window.dispatchEvent(new CustomEvent('paisSeleccionado', { detail: idPais }));

            // Encontrar el dueño supremo usando estadoGlobal
            const getOwner = (id) => {
                if (typeof estadoGlobal === 'undefined') return id;
                let current = estadoGlobal[id];
                while (current && current.owner && current.owner !== current.id && estadoGlobal[current.owner]) {
                    current = estadoGlobal[current.owner];
                }
                return current ? current.id : id;
            };

            const actualOwner = getOwner(idPais);

            // Obtener todos los vecinos de todos los países de este imperio
            const vecinosImperio = new Set();
            if (typeof estadoGlobal !== 'undefined') {
                for (const key in estadoGlobal) {
                    if (getOwner(key) === actualOwner) {
                        estadoGlobal[key].vecinos.forEach(v => vecinosImperio.add(v));
                    }
                }
            } else {
                // Fallback si estadoGlobal no está listo
                const datos = window.paisesData[idPais];
                if (datos && datos.vecinos) datos.vecinos.forEach(v => vecinosImperio.add(v));
            }

            // Iluminar todo el imperio y sus vecinos
            this.g.selectAll("path.pais").each(function(pathData) {
                const pId = pathData.properties.id;
                const pathOwner = getOwner(pId);
                
                if (pathOwner === actualOwner) {
                    d3.select(this).classed("pais-seleccionado", true);
                } else if (vecinosImperio.has(getOwner(pId))) {
                    d3.select(this).classed("pais-vecino", true);
                }
            });
        }
    }

    setEstadoGuerra(idPais, rol, activo) {
        if (this.paisesNodes[idPais]) {
            if (rol === 'atacante') this.paisesNodes[idPais].classed("pais-atacante-activo", activo);
            if (rol === 'defensor') this.paisesNodes[idPais].classed("pais-defensor-activo", activo);
        }
    }

    actualizarColorPais(idPais, nuevoColor) {
        // El Canvas celular maneja los colores dinámicamente
    }
}

window.MapaGeografico = MapaGeografico;
