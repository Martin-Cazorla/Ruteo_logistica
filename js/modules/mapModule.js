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

        // Enrutamiento global de los pines por CDN para GitHub Pages / Live Server
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
            iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        });

        this._initTileLayer();
    }

    _initTileLayer() {
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(this.map);
        
        this.map.addLayer(this.markerCluster);

        setTimeout(() => {
            this.map.invalidateSize();
        }, 300);
    }

    /**
     * Renderiza o actualiza marcadores de forma masiva
     * @param {Array} pedidos 
     */
    updateMarkers(pedidos) {
        this.markerCluster.clearLayers();
        this.currentMarkers.clear();

        pedidos.forEach(pedido => {
            // CORREGIDO: Validación de cortocircuito ultra estricta y profunda de tres niveles
            if (!pedido || !pedido.coordenadas || typeof pedido.coordenadas.lat === 'undefined' || typeof pedido.coordenadas.lng === 'undefined' || pedido.coordenadas.lat === null) {
                console.warn(`⚠️ OMITIENDO PEDIDO CORRUPTO: Orden #${pedido?.numeroPedido || 'Desconocida'} no posee geolocalización en Firestore.`);
                return; // Salta de forma segura al siguiente pedido sin romper el flujo
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

            // Es 100% seguro ejecutar la instanciación porque pasó el filtro previo
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