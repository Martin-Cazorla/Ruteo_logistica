// js/modules/mapModule.js
import { Sanitizer } from '../utils/sanitizers.js';

export class MapModule {
    /**
     * @param {string} mapElementId 
     * @param {Function} onSelectionCallback Ejecutado al seleccionar múltiples pedidos en mapa
     */
    constructor(mapElementId, onSelectionCallback) {
        // Enfoque predeterminado en centroide de operaciones
        this.map = L.map(mapElementId).setView([-34.49983, -58.86431], 12);
        this.markerCluster = L.markerClusterGroup();
        this.onSelection = onSelectionCallback;
        this.currentMarkers = new Map();

        this._setupLeafletAssets();
        this._initTileLayer();
    }

    _setupLeafletAssets() {
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
            iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        });
    }

    _initTileLayer() {
        const tiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            attribution: 'Tiles &copy; Esri &mdash; Central Central Logística'
        }).addTo(this.map);
        
        this.map.addLayer(this.markerCluster);

        tiles.once('tileload', () => {
            setTimeout(() => {
                if (this.map) this.map.invalidateSize();
            }, 150);
        });
    }

    /**
     * Dibuja los marcadores de forma pura basándose en el estado inyectado
     * @param {Array} pedidos Colección normalizada de órdenes del Store
     */
    updateMarkers(pedidos) {
        this.markerCluster.clearLayers();
        this.currentMarkers.clear();

        const bounds = [];

        pedidos.forEach(pedido => {
            if (!pedido || !pedido.coordenadas) return;

            const lat = parseFloat(pedido.coordenadas.lat);
            const lng = parseFloat(pedido.coordenadas.lng);

            if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
                console.warn(`⚠️ Orden #${pedido.numeroPedido || 'S/N'} descartada por coordenadas corruptas.`);
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

            const marker = L.marker([lat, lng], markerOptions);
            const safeMotivo = Sanitizer.escapeHTML(pedido.motivoCritico || 'Sin incidentes de tráfico');
            
            marker.bindPopup(`
                <div class="map-popup">
                    <h3>Pedido: #${Sanitizer.escapeHTML(pedido.numeroPedido || 'S/N')}</h3>
                    <p><b>Franja:</b> ${Sanitizer.escapeHTML(pedido.franjaHoraria || 'Estándar')}</p>
                    <p><b>Dirección:</b> ${Sanitizer.escapeHTML(pedido.direccion || 'Domicilio no mapeado')}</p>
                    <p><b>Riesgo:</b> ${safeMotivo}</p>
                </div>
            `);

            this.markerCluster.addLayer(marker);
            this.currentMarkers.set(pedido.id, marker);
            bounds.push([lat, lng]);
        });

        if (bounds.length > 0 && this.map) {
            this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
        }
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