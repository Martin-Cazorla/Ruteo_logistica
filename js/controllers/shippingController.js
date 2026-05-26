// js/controllers/shippingController.js
import store from '../state/store.js'; 
import { MapModule } from '../modules/mapModule.js'; 
import { db } from '../services/firebaseConfig.js'; 
import Sanitizer from '../utils/sanitizers.js'; 
import { 
    collection, 
    onSnapshot, 
    query, 
    where, 
    getDocs, 
    doc, 
    writeBatch 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export class ShippingController {
    constructor() {
        this.mapModule = null;
        this.filterSelect = null;
        this.sidebarContainer = null;
        
        // NUEVO ACCESO AL FILTRO DE CALENDARIO DEL MAPA
        this.mapDateFilter = document.getElementById('map-date-filter');

        this.dialogAsignacion = document.getElementById('modal-asignacion-flota');
        this.loteCantidadDisplay = document.getElementById('modal-lote-cantidad');
        this.selectTransporteLote = document.getElementById('select-transporte-lote');
        this.btnConfirmarLote = document.getElementById('btn-confirmar-despacho-lote');
        this.btnCancelarLote = document.getElementById('btn-cancelar-lote');
        this.btnCloseX = document.getElementById('btn-close-assignment-dialog');

        this.loteIdsSeleccionados = [];
        this.unsubscribePedidos = null; // Guardado de canal activo
    }

    init() {
        this.filterSelect = document.getElementById('filter-franja');
        this.sidebarContainer = document.getElementById('pedidos-list-append');

        // Seteo inicial por defecto del calendario a la jornada actual
        if (this.mapDateFilter) {
            this.mapDateFilter.value = new Date().toISOString().split('T')[0];
            this.mapDateFilter.addEventListener('change', () => this.sincronizarMapaPorFecha());
        }

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
        this.setupDialogListeners();
        this.sincronizarMapaPorFecha(); // Disparo inicial con el canal unificado
    }

    sincronizarMapaPorFecha() {
        if (!this.mapDateFilter) return;
        const fechaSeleccionada = this.mapDateFilter.value;
        
        // Limpiamos subscripción anterior para evitar solapamientos visuales de días diferentes
        if (this.unsubscribePedidos) this.unsubscribePedidos();
        this.conectarPedidosFirestore(fechaSeleccionada);
    }

    conectarPedidosFirestore(fechaTarget) {
        // Consultamos dinámicamente según la fecha seleccionada en la cabecera del mapa
        const q = query(collection(db, "pedidos"), where("fecha_creacion", "==", fechaTarget));

        this.unsubscribePedidos = onSnapshot(q, async (snapshot) => {
            const pedidosData = [];

            const clientesSnap = await getDocs(collection(db, "clientes"));
            const mapClientesCriticos = new Map();
            const mapClientesPremium = new Map();

            clientesSnap.forEach(cDoc => {
                const cData = cDoc.data();
                if (cData.dni) {
                    mapClientesCriticos.set(String(cData.dni).trim(), !!cData.isCritico);
                    mapClientesPremium.set(String(cData.dni).trim(), !!cData.isPremium);
                }
            });

            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const dniClienteLimpio = data.dni_cliente ? String(data.dni_cliente).trim() : '';

                const esClienteCriticoBase = mapClientesCriticos.get(dniClienteLimpio) || false;
                const esClientePremiumBase = mapClientesPremium.get(dniClienteLimpio) || false;
                const determinarCriticidad = data.esCritico || esClienteCriticoBase;

                pedidosData.push({
                    id: docSnap.id,
                    fecha: data.fecha_creacion,
                    franjaHoraria: data.franjaHoraria || '10:00-14:00',
                    importe: data.importe || 0,
                    esCritico: determinarCriticidad,
                    isPremium: esClientePremiumBase, 
                    motivoCritico: data.motivoCritico || (esClienteCriticoBase ? 'Cliente clasificado como CRÍTICO en Fichero Base' : ''),
                    numeroPedido: data.numero_pedido || 'S/N',
                    internoAsignado: data.interno_asignado || null,
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
            console.error("Fallo crítico en el canal de datos: ", error);
        });
    }

    setupEventListeners() {
        if (!this.filterSelect) return;

        this.filterSelect.addEventListener('change', (e) => {
            const currentStore = store.getState();
            const filtrosActuales = currentStore.filtros || { franjaHoraria: 'all' };

            store.setState({
                ...currentStore,
                filtros: { ...filtrosActuales, franjaHoraria: e.target.value }
            });
        });
    }

    setupDialogListeners() {
        if (!this.dialogAsignacion) return;
        const cerrarModal = () => this.dialogAsignacion.close();
        this.btnCloseX.addEventListener('click', cerrarModal);
        this.btnCancelarLote.addEventListener('click', cerrarModal);

        this.btnConfirmarLote.addEventListener('click', async () => {
            if (this.loteIdsSeleccionados.length === 0) return;
            const internoElegido = this.selectTransporteLote.value;
            if (!internoElegido) {
                alert("❌ Seleccione una unidad válida.");
                return;
            }

            try {
                const batch = writeBatch(db);
                this.loteIdsSeleccionados.forEach(pedidoId => {
                    batch.update(doc(db, "pedidos", pedidoId), { interno_asignado: internoElegido });
                });
                await batch.commit();
                alert(`¡Lote asignado con éxito al Interno #${internoElegido}!`);
                this.dialogAsignacion.close();
            } catch (err) {
                console.error(err);
            }
        });
    }

    render(state) {
        const pedidos = state?.pedidos || [];
        const filtros = state?.filtros || { franjaHoraria: 'all' };

        const pedidosFiltrados = pedidos.filter(pedido => {
            const cumpleFranja = filtros.franjaHoraria === 'all' || pedido.franjaHoraria === filtros.franjaHoraria;
            const estaDisponible = !pedido.internoAsignado; 
            return cumpleFranja && estaDisponible;
        });

        if (this.mapModule) {
            this.mapModule.updateMarkers(pedidosFiltrados);
            this.mapModule.map.invalidateSize();
        }
        this.renderListSidebar(pedidosFiltrados);
    }

    renderListSidebar(pedidos) {
        if (!this.sidebarContainer) return;
        if (pedidos.length === 0) {
            this.sidebarContainer.innerHTML = `<div style="color: #94a3b8; text-align: center; padding: 2rem; font-size: 0.9rem;">No hay pedidos disponibles para asignar.</div>`;
            return;
        }

        this.sidebarContainer.innerHTML = pedidos.map(p => {
            const numeroSeguro = Sanitizer.escapeHTML(p.numeroPedido);
            const importeSeguro = parseFloat(p.importe).toLocaleString('es-AR', { minimumFractionDigits: 2 });
            const franjaClass = this._getClassPorFranja(p.franjaHoraria);

            let claseAlertaFila = ""; let iconoTag = "";
            if (p.esCritico) { claseAlertaFila = " order-item--critical-alert"; iconoTag = "🔥 "; }
            else if (p.isPremium) { claseAlertaFila = " order-item--premium-alert"; iconoTag = "⭐ "; }

            return `
                <div class="card-pedido ${franjaClass}${claseAlertaFila}" data-id="${Sanitizer.escapeHTML(p.id)}">
                    <div class="card-pedido__info">
                        <span class="card-pedido__number">${iconoTag}Orden: <strong>#${numeroSeguro}</strong></span>
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

    async handleMassAssignment(selectedIds) {
        if (!selectedIds || selectedIds.length === 0) return;
        this.loteIdsSeleccionados = selectedIds;
        this.loteCantidadDisplay.textContent = selectedIds.length;

        try {
            const flotaSnap = await getDocs(collection(db, "flota_maestra"));
            let optionsHtml = '<option value="">-- Seleccione Unidad de Destino --</option>';
            flotaSnap.forEach(docSnap => {
                const f = docSnap.data();
                optionsHtml += `<option value="${Sanitizer.escapeHTML(docSnap.id)}">Interno #${Sanitizer.escapeHTML(docSnap.id)} - ${Sanitizer.escapeHTML(f.chofer)}</option>`;
            });
            this.selectTransporteLote.innerHTML = optionsHtml;
            this.dialogAsignacion.showModal();
        } catch (err) { console.error(err); }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const shippingCtrl = new ShippingController();
    shippingCtrl.init();
});