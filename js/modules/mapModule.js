// js/modules/mapModule.js
import Sanitizer from '../utils/sanitizers.js';

export class MapModule {
    /**
     * @param {string} mapElementId 
     * @param {Function} onSelectionCallback Ejecutado al seleccionar múltiples pedidos en mapa
     */
    constructor(mapElementId, onSelectionCallback) {
        this.map = L.map(mapElementId).setView([-34.6037, -58.3816], 12);
        this.markerCluster = L.markerClusterGroup();
        this.onSelection = onSelectionCallback;
        this.currentMarkers = new Map();

        // Configuración de los iconos globales por CDN
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
            iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        });

        this._initTileLayer();
    }

    _initTileLayer() {
        // Servidor Voyager estable con código 200 verificado
        const tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
            subdomains: 'abcd'
        }).addTo(this.map);
        
        this.map.addLayer(this.markerCluster);

        // BLINDAJE OPERATIVO: Escuchamos el primer impacto de carga de red exitoso
        // En cuanto el servidor nos devuelva los azulejos, forzamos a Leaflet a recalcular su tamaño físico
        tiles.once('tileload', () => {
            setTimeout(() => {
                this.map.invalidateSize();
                console.log("🗺️ Lienzo gráfico de Leaflet repintado con éxito tras carga de red.");
            }, 200);
        });

        // Disparador de contingencia inicial
        setTimeout(() => {
            this.map.invalidateSize();
        }, 400);
    }

    /**
     * Renderiza o actualiza marcadores de forma masiva
     */
    updateMarkers(pedidos) {
        this.markerCluster.clearLayers();
        this.currentMarkers.clear();

        pedidos.forEach(pedido => {
            if (!pedido || !pedido.coordenadas || typeof pedido.coordenadas.lat === 'undefined' || typeof pedido.coordenadas.lng === 'undefined' || !pedido.coordenadas.lat) {
                return;
            }

            const colorClass = this._getColorByFranja(pedido.franjaHoraria);
            let markerOptions = {};

            if (pedido.esCritico) {
                const fireIcon = L.divIcon({
                    className: `marker-critical-fire ${colorClass}`,
                    html: `<div style="width:12px; height:12px;"></div>`,
                    iconSize: [16, 16]
                });
                markerOptions = { icon: fireIcon };
            }

            const marker = L.marker([pedido.coordenadas.lat, pedido.coordenadas.lng], markerOptions);
            const safeMotivo = Sanitizer.escapeHTML(pedido.motivoCritico || 'Sin reclamos pendientes');
            
            marker.bindPopup(`
                <div class="map-popup">
                    <h3>Pedido: ${Sanitizer.escapeHTML(pedido.numeroPedido)}</h3>
                    <p><b>Franja:</b> ${Sanitizer.escapeHTML(pedido.franjaHoraria)}</p>
                    <p><b>Alerta:</b> ${safeMotivo}</p>
                </div>
            `);

            this.markerCluster.addLayer(marker);
            this.currentMarkers.set(pedido.id, marker);
        });
    }

    _getColorByFranja(franja) {
        switch (franja) {
            case '10:00-14:00': return 'time-red';
            case '13:00-16:00': return 'time-green';
            case '16:00-19:00': return 'time-blue';
            case '19:00-21:30': return 'time-black';
            default: return 'time-default';
        }
    }
}