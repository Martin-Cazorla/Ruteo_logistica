// js/modules/mapModule.js
import Sanitizer from '../utils/sanitizers.js';

export class MapModule {
    /**
     * @param {string} mapElementId 
     * @param {Function} onSelectionCallback Ejecutado al seleccionar múltiples pedidos en mapa
     */
    constructor(mapElementId, onSelectionCallback) {
        // Inicialización del mapa enfocado por defecto en el nodo logístico de Martínez/Norte
        this.map = L.map(mapElementId).setView([-34.4824, -58.5032], 12);
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
        const tiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            attribution: 'Tiles &copy; Esri &mdash; Esri, GIS User Community'
        }).addTo(this.map);
        
        this.map.addLayer(this.markerCluster);

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

        const bounds = []; // Array para almacenar posiciones y encuadrar el mapa dinámicamente

        pedidos.forEach(pedido => {
            if (!pedido) return;

            let lat = null;
            let lng = null;

            if (pedido.coordenadas) {
                lat = pedido.coordenadas.lat;
                lng = pedido.coordenadas.lng;
            } else if (pedido.coordenada) {
                lat = pedido.coordenada.lat;
                lng = pedido.coordenada.lng;
            } else if (typeof pedido.latitud !== 'undefined' && typeof pedido.longitud !== 'undefined') {
                lat = pedido.latitud;
                lng = pedido.longitud;
            }

            const parsedLat = parseFloat(lat);
            const parsedLng = parseFloat(lng);

            if (isNaN(parsedLat) || isNaN(parsedLng) || parsedLat === 0 || parsedLng === 0) {
                console.warn(`⚠️ Pedido #${pedido.numeroPedido || 'S/N'} omitido por campos geoespaciales corruptos.`);
                return;
            }

            const colorClass = this._getColorByFranja(pedido.franjaHoraria);
            let markerOptions = {};

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
            bounds.push([parsedLat, parsedLng]); // Registramos la ubicación válida para el encuadre
        });

        // ENCUADRE AUTOMÁTICO INTELIGENTE: Si hay pines cargados, el mapa se enfoca y hace zoom solo 
        // rodeando los marcadores activos (evita que se quede clavado lejos en Martínez si estás en Pilar)
        if (bounds.length > 0 && this.map) {
            this.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
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