// pages/js/controllers/shippingController.js
import store from '../../js/state/store.js'; // CORREGIDO: Apunta a la raíz del proyecto
import { MapModule } from '../modules/mapModule.js'; // Se queda igual (mismo árbol interno de pages/js)
import { db } from '../../js/services/firebaseConfig.js'; // CORREGIDO: Apunta a la raíz del proyecto
import Sanitizer from '../../js/utils/sanitizers.js'; // CORREGIDO: Apunta a la raíz del proyecto

// El resto de tu código del archivo se queda exactamente igual...

export class ShippingController {
    constructor() {
        this.mapModule = null;
        this.filterSelect = null;
        this.sidebarContainer = null;
    }

    /**
     * Punto de entrada único del módulo de asignación geográfica
     */
    init() {
        // Mapeamos los elementos del DOM de forma segura
        this.filterSelect = document.getElementById('filter-franja');
        this.sidebarContainer = document.getElementById('pedidos-list-append');

        // 1. Instanciamos el mapa una sola vez de forma persistente
        if (!this.mapModule) {
            try {
                this.mapModule = new MapModule('map', (selectedIds) => {
                    this.handleMassAssignment(selectedIds);
                });
            } catch (mapError) {
                console.error("Fallo crítico al renderizar el lienzo de Leaflet:", mapError);
            }
        }

        // 2. Suscribirse de forma reactiva al almacén de estado (Single Source of Truth)
        store.subscribe((state) => this.render(state));

        // 3. Activar los escuchadores de eventos de la interfaz (Filtros select)
        this.setupEventListeners();

        // 4. Conectar la base de datos en tiempo real para alimentar el Store
        this.conectarPedidosFirestore();
    }

    /**
     * Escucha los pedidos del día en la base de datos y actualiza el estado global
     */
    conectarPedidosFirestore() {
        const fechaHoy = new Date().toISOString().split('T')[0];
        const q = query(collection(db, "pedidos"), where("fecha", "==", fechaHoy));

        onSnapshot(q, (snapshot) => {
            const pedidosData = [];
            
            snapshot.forEach((docSnap) => {
                pedidosData.push({
                    id: docSnap.id,
                    ...docSnap.data()
                });
            });

            const currentStore = store.getState();
            
            // Inyectamos los pedidos manteniendo los filtros seleccionados intactos
            store.setState({
                ...currentStore,
                pedidos: pedidosData
            });
        }, (error) => {
            console.error("Fallo crítico en el canal de datos de transporte: ", error);
            alert("No se pudieron sincronizar los pedidos en tiempo real.");
        });
    }

    /**
     * Vincula las acciones del operador con los cambios de estado correspondientes
     */
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

    /**
     * Procesa y distribuye los datos filtrados hacia el mapa y la barra lateral
     * @param {Object} state Estado actual del store global
     */
    render(state) {
        const pedidos = state?.pedidos || [];
        const filtros = state?.filtros || { franjaHoraria: 'all' };

        // Filtro dinámico del lado del cliente de alto rendimiento
        const pedidosFiltrados = pedidos.filter(pedido => {
            const matchFranja = filtros.franjaHoraria === 'all' || pedido.franjaHoraria === filtros.franjaHoraria;
            return matchFranja;
        });

        if (this.mapModule) {
            this.mapModule.updateMarkers(pedidosFiltrados);
        }
        
        this.renderListSidebar(pedidosFiltrados);
    }

    /**
     * Construye dinámicamente la lista de órdenes pendientes aplicando mitigación de XSS
     * @param {Array} pedidos Lista de pedidos filtrados
     */
    renderListSidebar(pedidos) {
        if (!this.sidebarContainer) return;
        
        if (pedidos.length === 0) {
            this.sidebarContainer.innerHTML = `
                <div style="color: #94a3b8; text-align: center; padding: 2rem; font-size: 0.9rem;">
                    No hay pedidos asignados a esta ventana horaria.
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
        console.log(`Asignando lote de ${selectedIds.length} pedidos a una unidad logística.`);
    }
}

// Inicialización de la instancia al cargar la vista
document.addEventListener('DOMContentLoaded', () => {
    const shippingCtrl = new ShippingController();
    shippingCtrl.init();
});