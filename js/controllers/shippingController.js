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
        this.mapDateFilter = document.getElementById('map-date-filter');

        // CORREGIDO: ID alineado con el archivo shipping.html ("modal-asignacion-flota")
        this.dialogAsignacion = document.getElementById('modal-asignacion-flota');
        this.loteCantidadDisplay = document.getElementById('modal-lote-cantidad');
        this.selectTransporteLote = document.getElementById('select-transporte-lote');
        this.btnConfirmarLote = document.getElementById('btn-confirmar-despacho-lote');
        this.btnCancelarLote = document.getElementById('btn-cancelar-lote');
        this.btnCloseX = document.getElementById('btn-close-assignment-dialog');

        this.loteIdsSeleccionados = [];
        this.unsubscribePedidos = null; 
    }

    init() {
        this.filterSelect = document.getElementById('filter-franja');
        this.sidebarContainer = document.getElementById('pedidos-list-append');

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
                console.error("Fallo crítico Leaflet:", mapError);
            }
        }

        store.subscribe((state) => this.render(state));
        this.setupEventListeners();
        this.setupDialogListeners();
        this.sincronizarMapaPorFecha(); 
    }

    sincronizarMapaPorFecha() {
        if (!this.mapDateFilter) return;
        const fechaSeleccionada = this.mapDateFilter.value;
        if (this.unsubscribePedidos) this.unsubscribePedidos();
        this.conectarPedidosFirestore(fechaSeleccionada);
    }

    conectarPedidosFirestore(fechaTarget) {
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
                const DniLimpio = data.dni_cliente ? String(data.dni_cliente).trim() : '';

                const esClienteCriticoBase = mapClientesCriticos.get(DniLimpio) || false;
                const esClientePremiumBase = mapClientesPremium.get(DniLimpio) || false;
                const determinarCriticidad = data.esCritico || esClienteCriticoBase;

                // NORMALIZACIÓN GEOESPACIAL DE LECTURA FIRESTORE
                let latExtraida = null;
                let lngExtraida = null;

                if (data.coordenada) {
                    latExtraida = data.coordenada.lat;
                    lngExtraida = data.coordenada.lng;
                } else if (data.coordenadas) {
                    latExtraida = data.coordenadas.lat;
                    lngExtraida = data.coordenadas.lng;
                } else if (typeof data.latitud !== 'undefined' && typeof data.longitud !== 'undefined') {
                    latExtraida = data.latitud;
                    lngExtraida = data.longitud;
                }

                // UNIFICACIÓN OPERATIVA DE PROPIEDADES (Doble lectura de seguridad para guiones bajos y camelCase)
                pedidosData.push({
                    id: docSnap.id,
                    fecha: data.fecha_creacion,
                    franjaHoraria: data.franjaHoraria || '10:00-14:00',
                    importe: data.importe || 0,
                    esCritico: determinarCriticidad,
                    isPremium: esClientePremiumBase, 
                    motivoCritico: data.motivoCritico || (esClienteCriticoBase ? 'Cliente clasificado como CRÍTICO en Fichero Base' : ''),
                    numeroPedido: data.numero_pedido || data.numeroPedido || 'S/N', // 👈 Mapeado unificado para UI y MapModule
                    internoAsignado: data.interno_asignado || null,
                    direccion: data.direccion_entrega || data.direccion || '',
                    coordenadas: {
                        lat: parseFloat(latExtraida),
                        lng: parseFloat(lngExtraida)
                    }
                });
            });

            const currentStore = store.getState();
            store.setState({
                ...currentStore,
                pedidos: pedidosData
            });
        }, (error) => {
            console.error("Fallo de sincronización en tiempo real: ", error);
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
        
        if (this.btnCloseX) this.btnCloseX.addEventListener('click', cerrarModal);
        if (this.btnCancelarLote) this.btnCancelarLote.addEventListener('click', cerrarModal);

        if (this.btnConfirmarLote) {
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
                } catch (err) { console.error("Error al despachar lote:", err); }
            });
        }
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
            if (this.mapModule.map) {
                this.mapModule.map.invalidateSize();
            }
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
            if (this.dialogAsignacion) this.dialogAsignacion.showModal();
        } catch (err) { console.error(err); }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const shippingCtrl = new ShippingController();
    shippingCtrl.init();
});