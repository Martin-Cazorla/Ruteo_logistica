// js/controllers/shippingController.js
import store from '../state/store.js'; 
import { MapModule } from '../modules/mapModule.js'; 
import { db } from '../services/firebaseConfig.js'; 
import Sanitizer from '../utils/sanitizers.js'; 
import { collection, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

export class ShippingController {
    constructor() {
        this.mapModule = null;
        this.filterSelect = null;
        this.sidebarContainer = null;
    }

    init() {
        this.filterSelect = document.getElementById('filter-franja');
        this.sidebarContainer = document.getElementById('pedidos-list-append');

        if (!this.mapModule) {
            try {
                this.mapModule = new MapModule('map', (selectedIds) => {
                    this.handleMassAssignment(selectedIds);
                });
            } catch (mapError) {
                console.error("Fallo crítico al renderizar el lienzo de Leaflet:", mapError);
            }
        }

        store.subscribe((state) => this.render(state));
        this.setupEventListeners();
        this.conectarPedidosFirestore();
    }

    conectarPedidosFirestore() {
        // CORREGIDO: Obtenemos la fecha actual en formato YYYY-MM-DD
        const fechaHoy = new Date().toISOString().split('T')[0];
        
        // ADAPTADO: Apuntamos al campo 'fecha_creacion' que es el nombre real en tu Firestore
        const q = query(collection(db, "pedidos"), where("fecha_creacion", "==", fechaHoy));

        onSnapshot(q, (snapshot) => {
            const pedidosData = [];
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                
                // MAPEO RECEPTOR: Adaptamos la estructura de Firebase a lo que espera nuestra interfaz
                pedidosData.push({
                    id: docSnap.id,
                    fecha: data.fecha_creacion,
                    franjaHoraria: data.franjaHoraria || '10:00-14:00',
                    importe: data.importe || 0,
                    esCritico: data.esCritico || false,
                    motivoCritico: data.motivoCritico || '',
                    // ADAPTADO: Mapeamos 'numero_pedido' (Firebase) a 'numeroPedido' (JS)
                    numeroPedido: data.numero_pedido || 'S/N',
                    // ADAPTADO: Mapeamos 'coordenada' (singular de Firebase) a 'coordenadas' (plural de JS)
                    coordenadas: data.coordenada ? {
                        lat: parseFloat(data.coordenada.lat),
                        lng: parseFloat(data.coordenada.lng)
                    } : null
                });
            });

            const currentStore = store.getState();
            store.setState({
                ...currentStore,
                pedidos: pedidosData
            });
        }, (error) => {
            console.error("Fallo crítico en el canal de datos de transporte: ", error);
        });
    }

    setupEventListeners() {
        if (!this.filterSelect) return;

        this.filterSelect.addEventListener('change', (e) => {
            const currentStore = store.getState();
            const filtrosActuales = currentStore.filtros || { fecha: new Date().toISOString().split('T')[0], franjaHoraria: 'all' };

            store.setState({
                ...currentStore,
                filtros: { ...filtrosActuales, franjaHoraria: e.target.value }
            });
        });
    }

    render(state) {
        const pedidos = state?.pedidos || [];
        const filtros = state?.filtros || { franjaHoraria: 'all' };

        const pedidosFiltrados = pedidos.filter(pedido => {
            return filtros.franjaHoraria === 'all' || pedido.franjaHoraria === filtros.franjaHoraria;
        });

        if (this.mapModule) {
            this.mapModule.updateMarkers(pedidosFiltrados);
            // Aseguramos que Leaflet recalcule el contenedor dinámicamente
            this.mapModule.map.invalidateSize();
        }
        this.renderListSidebar(pedidosFiltrados);
    }

    renderListSidebar(pedidos) {
        if (!this.sidebarContainer) return;
        
        if (pedidos.length === 0) {
            this.sidebarContainer.innerHTML = `
                <div style="color: #94a3b8; text-align: center; padding: 2rem; font-size: 0.9rem;">
                    No hay pedidos para la jornada de hoy.
                </div>
            `;
            return;
        }

        this.sidebarContainer.innerHTML = pedidos.map(p => {
            const numeroSeguro = Sanitizer.escapeHTML(p.numeroPedido);
            const importeSeguro = parseFloat(p.importe).toLocaleString('es-AR', { minimumFractionDigits: 2 });
            const franjaClass = this._getClassPorFranja(p.franjaHoraria);

            return `
                <div class="card-pedido ${franjaClass}" data-id="${Sanitizer.escapeHTML(p.id)}">
                    <div class="card-pedido__info">
                        <span class="card-pedido__number">Orden: <strong>#${numeroSeguro}</strong></span>
                        <span class="card-pedido__amount">$${importeSeguro}</span>
                    </div>
                    <div class="card-pedido__meta">
                        <span class="card-pedido__tag">${Sanitizer.escapeHTML(p.franjaHoraria)}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    _getClassPorFranja(franja) {
        switch (franja) {
            case '10:00-14:00': return 'card-pedido--urgente';
            case '13:00-16:00': return 'card-pedido--mediodia';
            case '16:00-19:00': return 'card-pedido--tarde';
            case '19:00-21:30': return 'card-pedido--nocturno';
            default: return '';
        }
    }

    handleMassAssignment(selectedIds) {
        console.log(`Asignando lote de ${selectedIds.length} pedidos.`);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const shippingCtrl = new ShippingController();
    shippingCtrl.init();
});