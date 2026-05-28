// js/controllers/shippingController.js
import { store } from '../state/store.js'; 
import { MapModule } from '../modules/mapModule.js'; 
import { DatabaseService } from '../services/databaseService.js'; 
import { Sanitizer } from '../utils/sanitizers.js'; 

class ShippingController {
    constructor() {
        this.mapModule = null;
        this.filterSelect = null;
        this.sidebarContainer = null;
        this.mapDateFilter = document.getElementById('map-date-filter');

        this.dialogAsignacion = document.getElementById('modal-asignacion-flota');
        this.loteCantidadDisplay = document.getElementById('modal-lote-cantidad');
        this.selectTransporteLote = document.getElementById('select-transporte-lote');
        this.btnConfirmarLote = document.getElementById('btn-confirmar-despacho-lote');
        this.btnCancelarLote = document.getElementById('btn-cancelar-lote');
        this.btnCloseX = document.getElementById('btn-close-assignment-dialog');

        this.loteIdsSeleccionados = [];
        this.unsubscribePedidos = null; 
        this.unsubscribeStore = null;
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
                console.error("Fallo crítico Leaflet en inicialización de capas: ", mapError);
            }
        }

        // Suscripción de ciclo limpio al Store unificado
        this.unsubscribeStore = store.subscribe((state) => this.render(state));
        
        this.setupEventListeners();
        this.setupDialogListeners();
        this.sincronizarMapaPorFecha(); 
    }

    sincronizarMapaPorFecha() {
        if (!this.mapDateFilter) return;
        const fechaSeleccionada = this.mapDateFilter.value;
        
        if (typeof this.unsubscribePedidos === 'function') this.unsubscribePedidos();
        this.conectarPedidosFirestore(fechaSeleccionada);
    }

    conectarPedidosFirestore(fechaTarget) {
        // Consumimos el canal reactivo unificado purgado de llamadas crudas al SDK
        this.unsubscribePedidos = DatabaseService.subscribePedidosPorFecha(
            fechaTarget,
            async (snapshot) => {
                const pedidosData = [];
                const mapClientesCriticos = new Map();
                const mapClientesPremium = new Map();

                try {
                    // Resolvemos los metadatos cruzados de clientes en una única llamada secuencial controlada
                    const clientesSnap = await DatabaseService.buscarClientePorDni("");
                    // Nota de campo: El listado maestro mapea llaves en el diccionario local de memoria
                    clientesSnap.forEach(cDoc => {
                        const cData = cDoc.data();
                        if (cData.dni) {
                            mapClientesCriticos.set(String(cData.dni).trim(), !!cData.critico || !!cData.isCritico);
                            mapClientesPremium.set(String(cData.dni).trim(), !!cData.premium || !!cData.isPremium);
                        }
                    });
                } catch (errClientes) {
                    console.warn("Fichero maestro de clientes inaccesible. Computando criticidades locales de orden.");
                }

                snapshot.forEach((docSnap) => {
                    const data = docSnap.data();
                    const dniLimpio = data.clienteDni ? String(data.clienteDni).trim() : '';

                    const esClienteCriticoBase = mapClientesCriticos.get(dniLimpio) || false;
                    const esClientePremiumBase = mapClientesPremium.get(dniLimpio) || false;
                    const determinarCriticidad = data.esCritico || esClienteCriticoBase;

                    const latFinal = parseFloat(data.coordenadas?.lat || data.coordenada?.lat || 0);
                    const lngFinal = parseFloat(data.coordenadas?.lng || data.coordenada?.lng || 0);

                    pedidosData.push({
                        id: docSnap.id,
                        fecha: data.fecha,
                        franjaHoraria: data.franjaHoraria || '10:00-14:00',
                        importe: parseFloat(data.importe || 0),
                        esCritico: determinarCriticidad,
                        isPremium: esClientePremiumBase, 
                        motivoCritico: data.motivoCritico || (esClienteCriticoBase ? 'Operador crítico calificado' : ''),
                        numeroPedido: data.numeroPedido || 'S/N', 
                        internoAsignado: data.interno_asignado || null,
                        direccion: data.direccion || '',
                        coordenadas: { lat: latFinal, lng: lngFinal }
                    });
                });

                const currentStore = store.getState();
                store.setState({
                    ...currentStore,
                    pedidos: pedidosData
                });
            },
            (error) => console.error("Fallo de red en canal logístico: ", error)
        );
    }

    setupEventListeners() {
        if (!this.filterSelect) return;
        this.filterSelect.addEventListener('change', (e) => {
            const currentStore = store.getState();
            store.setState({
                ...currentStore,
                filtros: { ...currentStore.filtros, franjaHoraria: e.target.value }
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
                    alert("❌ Modulo perimetral: Seleccione una unidad de destino válida.");
                    return;
                }

                try {
                    // Actualizamos secuencialmente a través del mutador optimizado en lote
                    const lotePromesas = this.loteIdsSeleccionados.map(pedidoId => 
                        DatabaseService.actualizarPedido(pedidoId, { interno_asignado: internoElegido })
                    );
                    await Promise.all(lotePromesas);
                    
                    alert(`¡Lote operativo asignado correctamente al Interno #${internoElegido}!`);
                    this.dialogAsignacion.close();
                } catch (err) { 
                    console.error("Error al despachar lote transaccional: ", err); 
                }
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
            this.sidebarContainer.innerHTML = `<div class="placeholder-vacio-jornada">No hay pedidos disponibles para asignar en esta zona.</div>`;
            return;
        }

        this.sidebarContainer.innerHTML = pedidos.map(p => {
            const numeroSeguro = Sanitizer.escapeHTML(p.numeroPedido);
            const importeSeguro = parseFloat(p.importe).toLocaleString('es-AR', { minimumFractionDigits: 2 });
            const franjaClass = this._getClassPorFranja(p.franjaHoraria);

            let claseAlertaFila = ""; 
            let iconoTag = "";
            if (p.esCritico) { claseAlertaFila = " card-pedido--critical-alert"; iconoTag = "🔥 "; }
            else if (p.isPremium) { claseAlertaFila = " card-pedido--premium-alert"; iconoTag = "⭐ "; }

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
            const flotaSnap = await DatabaseService.buscarUnidadEnFlotaMaestra();
            let optionsHtml = '<option value="">-- Seleccione Unidad de Destino Central --</option>';
            flotaSnap.forEach(docSnap => {
                const f = docSnap.data();
                optionsHtml += `<option value="${Sanitizer.escapeHTML(docSnap.id)}">Interno #${Sanitizer.escapeHTML(docSnap.id)} - ${Sanitizer.escapeHTML(f.chofer)}</option>`;
            });
            this.selectTransporteLote.innerHTML = optionsHtml;
            if (this.dialogAsignacion) this.dialogAsignacion.showModal();
        } catch (err) { 
            console.error("Fallo estructural al renderizar flota modal: ", err); 
        }
    }

    unmount() {
        if (typeof this.unsubscribePedidos === 'function') this.unsubscribePedidos();
        if (typeof this.unsubscribeStore === 'function') this.unsubscribeStore();
        console.log("⚓ Canales cartográficos purgados de memoria del cliente.");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const shippingCtrl = new ShippingController();
    shippingCtrl.init();

    window.addEventListener('beforeunload', () => shippingCtrl.unmount());
});