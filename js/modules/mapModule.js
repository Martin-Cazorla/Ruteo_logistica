// js/modules/mapModule.js
// CORREGIDO: Ruta relativa exacta saliendo de modules (../) y entrando a utils/
import Sanitizer from '../utils/sanitizers.js';

export class MapModule {
    /**
     * @param {string} mapElementId 
     * @param {Function} onSelectionCallback Ejecutado al seleccionar múltiples pedidos en mapa
     */
    constructor(mapElementId, onSelectionCallback) {
        // Inicializamos el mapa centrado en Buenos Aires
        this.map = L.map(mapElementId).setView([-34.6037, -58.3816], 12);
        this.markerCluster = L.markerClusterGroup();
        this.onSelection = onSelectionCallback;
        this.currentMarkers = new Map();

        // OPTIMIZACIÓN LOGÍSTICA: Forzamos a Leaflet a descargar las imágenes de los pines de su CDN oficial
        // Esto evita errores de "recurso no encontrado (404)" cuando la app corre en servidores web o en GitHub Pages
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
            iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        });

        this._initTileLayer();
    }

    _initTileLayer() {
        // Servidor CDN de CARTO (Dark Matter), libre de bloqueos perimetrales
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(this.map);
        
        this.map.addLayer(this.markerCluster);

        // Forzamos el ajuste asíncrono del lienzo para calcular el viewport real
        setTimeout(() => {
            this.map.invalidateSize();
        }, 250);
    }

    /**
     * Renderiza o actualiza marcadores de forma masiva
     * @param {Array} pedidos 
     */
    updateMarkers(pedidos) {
        this.markerCluster.clearLayers();
        this.currentMarkers.clear();

        pedidos.forEach(pedido => {
            // BLINDAJE CRÍTICO: Verificamos de forma estricta que el pedido tenga coordenadas geográficas válidas
            // Si no tiene lat o lng, ignoramos el pedido para evitar el error TypeError que rompe el mapa
            if (!pedido.coordenadas || typeof pedido.coordenadas.lat === 'undefined' || typeof pedido.coordenadas.lng === 'undefined') {
                console.warn(`⚠️ OMITIENDO PEDIDO SIN COORDENADAS: Orden #${pedido.numeroPedido} (ID: ${pedido.id}) no posee latitud/longitud válida en la base de datos.`);
                return; // Saltamos a la siguiente iteración del forEach
            }

            const colorClass = this._getColorByFranja(pedido.franjaHoraria);
            let markerOptions = {};

            // Renderizado de alertas personalizadas para Clientes Críticos
            if (pedido.esCritico) {
                const fireIcon = L.divIcon({
                    className: `marker-critical-fire ${colorClass}`,
                    html: `<div style="width:12px; height:12px;"></div>`,
                    iconSize: [16, 16]
                });
                markerOptions = { icon: fireIcon };
            }

            // Ahora es seguro leer .lat y .lng porque ya verificamos que existen
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