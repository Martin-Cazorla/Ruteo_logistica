// js/controllers/dashboardController.js
import { db } from '../services/firebaseConfig.js';
import { ExcelParser } from '../modules/excelParser.js';
import { DatabaseService } from '../services/databaseService.js';
import Sanitizer from '../utils/sanitizers.js';
import { 
    collection, 
    onSnapshot, 
    query, 
    where, 
    addDoc, 
    doc, 
    deleteDoc,
    getDocs
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export class DashboardController {
    constructor() {
        this.globalDateFilter = document.getElementById('global-date-filter');
        this.unidadesContainer = document.getElementById('unidades-grid');
        
        this.countTotal = document.getElementById('count-total');
        this.countDisp = document.getElementById('count-disp');
        this.countExtra = document.getElementById('count-extra');

        this.excelInput = document.getElementById('excel-file');
        this.fileNameDisplay = document.getElementById('file-name-display');
        this.btnProcesar = document.getElementById('btn-procesar-carga');
        this.listadoPedidosContainer = document.getElementById('listado-pedidos');
        this.searchPedidoInput = document.getElementById('search-pedido');

        this.formCliente = document.getElementById('form-cliente');
        this.listadoClientesContainer = document.getElementById('listado-clientes');
        this.searchClienteInput = document.getElementById('search-cliente');

        this.formReclamo = document.getElementById('form-reclamo');
        this.recDniInput = document.getElementById('rec-dni');
        this.recDireccionSelect = document.getElementById('rec-direccion');
        this.recClienteStatus = document.getElementById('rec-cliente-status');
        this.listadoReclamosContainer = document.getElementById('listado-reclamos');

        this.modalPedido = document.getElementById('modal-pedido');
        this.modalUnidad = document.getElementById('modal-unidad');
        this.formManualPedido = document.getElementById('form-manual-pedido');
        this.formAltaUnidad = document.getElementById('form-alta-unidad');
        this.pDniInput = document.getElementById('p-dni');
        this.pDireccionSelect = document.getElementById('p-direccion-select');
        this.pDireccionSelectGroup = document.getElementById('domicilios-select-group');

        this.pedidosCargadosExcel = [];
        this.unsubscribeUnidades = null;
        this.unsubscribePedidos = null;
        this.unsubscribeReclamos = null;
    }

    init() {
        if (this.globalDateFilter) {
            this.globalDateFilter.value = new Date().toISOString().split('T')[0];
            this.globalDateFilter.addEventListener('change', () => this.sincronizarTodaLaJornada());
        }

        this.setupTabsBehavior();
        this.setupModalToggles();
        this.setupExcelEventListeners();
        this.setupFormSubmissions();
        this.setupDniCrossSearching();

        this.sincronizarTodaLaJornada();
        this.escucharClientesTiempoReal();
    }

    sincronizarTodaLaJornada() {
        const fechaSeleccionada = this.globalDateFilter.value;

        if (this.unsubscribeUnidades) this.unsubscribeUnidades();
        if (this.unsubscribePedidos) this.unsubscribePedidos();
        if (this.unsubscribeReclamos) this.unsubscribeReclamos();

        this.escucharUnidadesJornada(fechaSeleccionada);
        this.escucharPedidosJornada(fechaSeleccionada);
        this.escucharReclamosJornada(fechaSeleccionada);
    }

    setupTabsBehavior() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabPanels = document.querySelectorAll('.tab-panel');

        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                tabButtons.forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-selected', 'false');
                });
                tabPanels.forEach(p => {
                    p.classList.remove('active');
                    p.setAttribute('hidden', 'true');
                });

                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');
                const panelId = btn.getAttribute('aria-controls');
                const activePanel = document.getElementById(panelId);
                if (activePanel) {
                    activePanel.classList.add('active');
                    activePanel.removeAttribute('hidden');
                }
            });
        });
    }

    setupModalToggles() {
        const btnOpenUnidad = document.getElementById('btn-add-unidad-modal');
        const btnOpenPedido = document.getElementById('btn-manual-pedido-modal');
        const closeButtons = document.querySelectorAll('.btn-close-modal');

        if (btnOpenUnidad) btnOpenUnidad.addEventListener('click', () => this.toggleModal(this.modalUnidad, true));
        if (btnOpenPedido) btnOpenPedido.addEventListener('click', () => this.toggleModal(this.modalPedido, true));

        closeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const openModal = e.target.closest('.modal-overlay');
                this.toggleModal(openModal, false);
            });
        });
    }

    toggleModal(modal, open) {
        if (!modal) return;
        if (open) {
            modal.classList.add('open');
            modal.setAttribute('aria-hidden', 'false');
        } else {
            modal.classList.remove('open');
            modal.setAttribute('aria-hidden', 'true');
        }
    }

    escucharUnidadesJornada(fecha) {
        if (!this.unidadesContainer) return;

        // Lee de la colección unificada de unidades operativas de transporte
        const q = query(collection(db, "unidades"), where("fecha", "==", fecha));
        
        this.unsubscribeUnidades = onSnapshot(q, (snapshot) => {
            let total = 0, enVuelta = 0, enExtra = 0;
            let htmlHTML = "";

            snapshot.forEach((docSnap) => {
                const u = docSnap.data();
                const id = docSnap.id;
                total++;

                if (parseInt(u.vueltas) >= 4) enExtra++;
                else enVuelta++;

                htmlHTML += `
                    <article class="card-panel" data-id="${id}">
                        <div class="panel-actions-header">
                            <h3 class="section-title">${Sanitizer.escapeHTML(u.nombre)}</h3>
                            <span class="badge badge--info">Ingreso: ${Sanitizer.escapeHTML(u.ingreso)} hs</span>
                        </div>
                        <p><strong>Vuelta de Salida:</strong> Vuelta ${Sanitizer.escapeHTML(u.salida)} hs</p>
                        <p><strong>Vueltas totales:</strong> ${Sanitizer.escapeHTML(u.vueltas)} 
                            ${parseInt(u.vueltas) >= 4 ? '<span class="badge badge--danger">EXTRA ACTIVADO</span>' : ''}
                        </p>
                        <p><strong>Entrega en Campo:</strong> ${u.entregaCampo ? '<span class="badge badge--success">SÍ</span>' : 'NO'}</p>
                        ${u.notas ? `<p style="color:#94a3b8; font-size:0.85rem;"><em>Nota: ${Sanitizer.escapeHTML(u.notas)}</em></p>` : ''}
                        <hr class="separator">
                        <button class="btn-primary btn-delete-unidad" style="background-color:#ef4444;" data-id="${id}">Eliminar Unidad</button>
                    </article>
                `;
            });

            this.unidadesContainer.innerHTML = htmlHTML || `<div style="color:#94a3b8; padding:2rem; grid-column:1/-1; text-align:center;">No hay unidades asignadas para hoy. Registre desde la sección Flota.</div>`;
            
            if (this.countTotal) this.countTotal.textContent = total;
            if (this.countDisp) this.countDisp.textContent = enVuelta;
            if (this.countExtra) this.countExtra.textContent = enExtra;

            this.vincularEventosEliminarUnidad();
        });
    }

    vincularEventosEliminarUnidad() {
        const botones = this.unidadesContainer.querySelectorAll('.btn-delete-unidad');
        botones.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                if (confirm("¿Desea remover esta unidad de la jornada operativa?")) {
                    try {
                        await deleteDoc(doc(db, "unidades", id));
                    } catch (err) {
                        console.error("Error al borrar de Firestore: ", err);
                    }
                }
            });
        });
    }

    escucharPedidosJornada(fecha) {
        if (!this.listadoPedidosContainer) return;

        const q = query(collection(db, "pedidos"), where("fecha_creacion", "==", fecha));

        this.unsubscribePedidos = onSnapshot(q, (snapshot) => {
            const pedidos = [];
            snapshot.forEach(docSnap => pedidos.push({ id: docSnap.id, ...docSnap.data() }));
            this.renderPedidosList(pedidos);
        });
    }

    renderPedidosList(pedidos) {
        this.listadoPedidosContainer.innerHTML = pedidos.map(p => `
            <div class="card-panel" style="margin-bottom:0.75rem; padding:1rem; flex-direction:row; justify-content:space-between; align-items:center;">
                <div>
                    <strong>Orden: #${Sanitizer.escapeHTML(p.numero_pedido)}</strong><br>
                    <span style="font-size:0.85rem; color:#94a3b8;">DNI: ${Sanitizer.escapeHTML(p.dni_cliente || 'S/D')}</span>
                </div>
                <span class="badge badge--info">$${parseFloat(p.importe).toLocaleString('es-AR')}</span>
            </div>
        `).join('') || '<div style="color:#94a3b8; padding:1rem; text-align:center;">No hay órdenes.</div>';
    }

    escucharClientesTiempoReal() {
        if (!this.listadoClientesContainer) return;

        onSnapshot(collection(db, "clientes"), (snapshot) => {
            const clientes = [];
            snapshot.forEach(docSnap => clientes.push({ id: docSnap.id, ...docSnap.data() }));
            this.listadoClientesContainer.innerHTML = clientes.map(c => `
                <div class="card-panel" style="margin-bottom:0.75rem; padding:1rem;">
                    <strong>${Sanitizer.escapeHTML(c.nombre)}</strong> (DNI: ${Sanitizer.escapeHTML(c.dni)})<br>
                    <span style="font-size:0.85rem; color:#94a3b8;">📍 ${Sanitizer.escapeHTML(c.direccion)}</span>
                </div>
            `).join('') || '<div style="color:#94a3b8; padding:1rem; text-align:center;">No hay clientes.</div>';
        });
    }

    escucharReclamosJornada(fecha) {
        if (!this.listadoReclamosContainer) return;

        const q = query(collection(db, "pedidos"), where("fecha_creacion", "==", fecha), where("esCritico", "==", true));

        this.unsubscribeReclamos = onSnapshot(q, (snapshot) => {
            this.listadoReclamosContainer.innerHTML = snapshot.docs.map(docSnap => {
                const p = docSnap.data();
                return `
                    <div class="card-panel" style="border-left:3px solid #ef4444; margin-bottom:0.75rem; padding:1rem;">
                        <strong>Orden Crítica: #${Sanitizer.escapeHTML(p.numero_pedido)}</strong><br>
                        <span style="font-size:0.85rem; color:#ef4444;">⚠️ Motivo: ${Sanitizer.escapeHTML(p.motivoCritico)}</span>
                    </div>
                `;
            }).join('') || '<div style="color:#94a3b8; padding:1rem; text-align:center;">No hay reclamos activos hoy.</div>';
        });
    }

    setupDniCrossSearching() {
        const btnValidarDni = document.getElementById('btn-verificar-dni');
        if (btnValidarDni && this.pDniInput) {
            btnValidarDni.addEventListener('click', async () => {
                const dni = this.pDniInput.value.trim();
                if (!dni) return;

                const q = query(collection(db, "clientes"), where("dni", "==", dni));
                const snap = await getDocs(q);

                if (!snap.empty) {
                    let optionsHtml = "";
                    snap.forEach(docSnap => {
                        const c = docSnap.data();
                        optionsHtml += `<option value="${Sanitizer.escapeHTML(c.direccion)}">${Sanitizer.escapeHTML(c.direccion)}</option>`;
                    });
                    if (this.pDireccionSelect) {
                        this.pDireccionSelect.innerHTML = optionsHtml;
                        this.pDireccionSelectGroup.style.display = "block";
                    }
                } else {
                    this.pDireccionSelectGroup.style.display = "none";
                }
            });
        }
    }

    setupExcelEventListeners() {
        if (!this.excelInput) return;

        this.excelInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            this.fileNameDisplay.textContent = file.name;
            try {
                this.pedidosCargadosExcel = await ExcelParser.importarPedidoJumbo(file);
                this.btnProcesar.disabled = false;
            } catch (err) {
                this.btnProcesar.disabled = true;
                this.pedidosCargadosExcel = [];
            }
        });

        if (this.btnProcesar) {
            this.btnProcesar.addEventListener('click', async () => {
                if (this.pedidosCargadosExcel.length === 0) return;
                this.btnProcesar.disabled = true;
                
                try {
                    const fechaActualBarra = this.globalDateFilter.value;
                    const pedidosEstructurados = this.pedidosCargadosExcel.map(p => ({
                        ...p,
                        fecha_creacion: fechaActualBarra
                    }));

                    await DatabaseService.guardarPedidosMasivos(pedidosEstructurados);
                    alert("¡Inyección exitosa!");
                    this.pedidosCargadosExcel = [];
                    this.excelInput.value = "";
                } catch (err) {
                    this.btnProcesar.disabled = false;
                }
            });
        }
    }

    setupFormSubmissions() {
        // Formulario de contingencia para dar de alta una unidad directamente de forma local
        // Alta operativa de unidades diarias cruzando datos con el Fichero de Transporte
        if (this.formAltaUnidad) {
            this.formAltaUnidad.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                // El operador ahora ingresa únicamente el número de interno (ID del maestro)
                const internoIngresado = document.getElementById('u-nombre').value.trim();
                const fechaActualBarra = this.globalDateFilter.value;

                try {
                    // Consultamos de forma asíncrona la base de datos de flota central
                    const maestroRef = doc(db, "flota_maestra", internoIngresado);
                    const maestroSnap = await getDocs(query(collection(db, "flota_maestra")));
                    
                    // Buscamos si existe el interno
                    let datosMaestros = null;
                    maestroSnap.forEach(docSnap => {
                        if (docSnap.id === internoIngresado) datosMaestros = docSnap.data();
                    });

                    if (!datosMaestros) {
                        alert(`❌ El Interno #${internoIngresado} no existe en el Fichero Maestro de Transporte. Registre la unidad primero en la sección Flota.`);
                        return;
                    }

                    // Si existe, estructuramos la planilla de la jornada mezclando los datos fijos con las variables diarias
                    const dataOperativa = {
                        interno: internoIngresado,
                        nombre: `Interno ${internoIngresado} - ${datosMaestros.chofer}`, // Combina el chofer fijo
                        tamanio: datosMaestros.tamanio,                                // Hereda el tamaño fijo
                        ingreso: document.getElementById('u-ingreso').value,           // Variable diaria
                        salida: document.getElementById('u-salida').value,             // Variable diaria
                        vueltas: document.getElementById('u-vueltas').value,           // Variable diaria
                        entregaCampo: document.getElementById('u-campo').checked,      // Variable diaria
                        notas: document.getElementById('u-notas').value.trim(),        // Variable diaria
                        fecha: fechaActualBarra                                        // Jornada activa
                    };

                    // Guardamos la instancia en la colección diaria "unidades"
                    await addDoc(collection(db, "unidades"), dataOperativa);
                    
                    this.formAltaUnidad.reset();
                    this.toggleModal(this.modalUnidad, false);
                    alert(`✅ Unidad #${internoIngresado} inyectada con éxito a la jornada del día.`);

                } catch (err) {
                    console.error("Error en el cruce de datos relacionales: ", err);
                }
            });
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const dashboardCtrl = new DashboardController();
    dashboardCtrl.init();
});