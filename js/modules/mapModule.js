// js/modules/mapModule.js
import Sanitizer from '../utils/sanitizers.js';

export class MapModule {
    /**
     * @param {string} mapElementId 
     * @param {Function} onSelectionCallback Ejecutado al seleccionar múltiples pedidos en mapa
     */
    constructor(mapElementId, onSelectionCallback) {
        // Inicialización del contenedor centrado en Buenos Aires
        this.map = L.map(mapElementId).setView([-34.6037, -58.3816], 12);
        this.markerCluster = L.markerClusterGroup();
        this.onSelection = onSelectionCallback;
        this.currentMarkers = new Map();

        // Configuración de los iconos globales por CDN estable
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
            iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        });

        this._initTileLayer();
    }

    _initTileLayer() {
        // Capa de mapas topográficos provista por Esri con soporte HTTP/2 nativo
        const tiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            attribution: 'Tiles &copy; Esri &mdash; Esri, GIS User Community'
        }).addTo(this.map);
        
        this.map.addLayer(this.markerCluster);

        // Ajuste reactivo del tamaño del viewport para evitar renderizados parciales grisáceos
        tiles.once('tileload', () => {
            setTimeout(() => {
                if (this.map) {
                    this.map.invalidateSize();
                    console.log("📐 Viewport de Esri ajustado correctamente.");
                }
            }, 150);
        });

        setTimeout(() => {
            if (this.map) this.map.invalidateSize();
        }, 500);
    }

    /**
     * Renderiza o actualiza marcadores mapeando de forma flexible las mutaciones de Firestore
     * @param {Array} pedidos 
     */
    updateMarkers(pedidos) {
        this.markerCluster.clearLayers();
        this.currentMarkers.clear();

        pedidos.forEach(pedido => {
            if (!pedido) return;

            // ==========================================================================
            // ALGORITMO DEFENSIVO DE EXTRACCIÓN GEOESPACIAL MULTI-FORMATO
            // ==========================================================================
            let lat = null;
            let lng = null;

            if (pedido.coordenadas) {
                lat = pedido.coordenadas.lat;
                lng = pedido.coordenadas.lng;
            } else if (pedido.coordenada) { // Estructura de colección /pedidos en Firestore
                lat = pedido.coordenada.lat;
                lng = pedido.coordenada.lng;
            } else if (typeof pedido.latitud !== 'undefined' && typeof pedido.longitud !== 'undefined') { // Estructura plana de clientes
                lat = pedido.latitud;
                lng = pedido.longitud;
            }

            // Sanitización tipográfica a números de punto flotante de precisión
            const parsedLat = parseFloat(lat);
            const parsedLng = parseFloat(lng);

            // Control de exclusión: Si las coordenadas no son numéricas o apuntan al cero absoluto, se descarta el pin
            if (isNaN(parsedLat) || isNaN(parsedLng) || parsedLat === 0 || parsedLng === 0) {
                console.warn(`⚠️ Pedido #${pedido.numeroPedido || 'S/N'} omitido en mapa por inconsistencia en campos geoespaciales.`);
                return;
            }

            const colorClass = this._getColorByFranja(pedido.franjaHoraria);
            let markerOptions = {};

            // Renderizado de iconos especiales dinámicos para contingencias críticas
            if (pedido.esCritico || pedido.critico) {
                const fireIcon = L.divIcon({
                    className: `marker-critical-fire ${colorClass}`,
                    html: `<div style="width:12px; height:12px;"></div>`,
                    iconSize: [16, 16]
                });
                markerOptions = { icon: fireIcon };
            }

            const marker = L.marker([parsedLat, parsedLng], markerOptions);
            const safeMotivo = Sanitizer.escapeHTML(pedido.motivoCritico || 'Sin reclamos pendientes');
            
            marker.bindPopup(`
                <div class="map-popup">
                    <h3>Pedido: #${Sanitizer.escapeHTML(pedido.numeroPedido || 'S/N')}</h3>
                    <p><b>Franja:</b> ${Sanitizer.escapeHTML(pedido.franjaHoraria || 'No asignada')}</p>
                    <p><b>Dirección:</b> ${Sanitizer.escapeHTML(pedido.direccion || 'No especificada')}</p>
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