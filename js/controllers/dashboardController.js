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
        // 1. Filtro Maestro por Jornada Diaria
        this.globalDateFilter = document.getElementById('global-date-filter');

        // 2. Elementos del DOM de la pestaña Unidades
        this.unidadesContainer = document.getElementById('unidades-grid');
        this.countTotal = document.getElementById('count-total');
        this.countDisp = document.getElementById('count-disp');
        this.countExtra = document.getElementById('count-extra');

        // 3. Elementos del DOM de la pestaña Pedidos (Excel e Inyección)
        this.excelInput = document.getElementById('excel-file');
        this.fileNameDisplay = document.getElementById('file-name-display');
        this.btnProcesar = document.getElementById('btn-procesar-carga');
        this.listadoPedidosContainer = document.getElementById('listado-pedidos');
        this.searchPedidoInput = document.getElementById('search-pedido');

        // 4. Elementos del DOM de la pestaña Clientes
        this.formCliente = document.getElementById('form-cliente');
        this.listadoClientesContainer = document.getElementById('listado-clientes');
        this.searchClienteInput = document.getElementById('search-cliente');

        // 5. Elementos del DOM de la pestaña Reclamos
        this.formReclamo = document.getElementById('form-reclamo');
        this.recDniInput = document.getElementById('rec-dni');
        this.recDireccionSelect = document.getElementById('rec-direccion');
        this.recClienteStatus = document.getElementById('rec-cliente-status');
        this.listadoReclamosContainer = document.getElementById('listado-reclamos');

        // 6. Formularios de Modales y Triggers de Apertura
        this.modalPedido = document.getElementById('modal-pedido');
        this.modalUnidad = document.getElementById('modal-unidad');
        this.formManualPedido = document.getElementById('form-manual-pedido');
        this.formAltaUnidad = document.getElementById('form-alta-unidad');
        this.pDniInput = document.getElementById('p-dni');
        this.pDireccionSelect = document.getElementById('p-direccion-select');
        this.pDireccionSelectGroup = document.getElementById('domicilios-select-group');

        // 7. Estado Local Temporal de la Instancia
        this.pedidosCargadosExcel = [];
        this.unsubscribeUnidades = null;
        this.unsubscribePedidos = null;
        this.unsubscribeReclamos = null;
    }

    /**
     * Inicializador core de controladores y escuchadores del Dashboard
     */
    init() {
        // Fijar por defecto la jornada operativa al día de hoy (Formato YYYY-MM-DD)
        if (this.globalDateFilter) {
            this.globalDateFilter.value = new Date().toISOString().split('T')[0];
            // Escuchar cambios en el filtro maestro para repoblar todos los paneles en tiempo real
            this.globalDateFilter.addEventListener('change', () => this.sincronizarTodaLaJornada());
        }

        this.setupTabsBehavior();
        this.setupModalToggles();
        this.setupExcelEventListeners();
        this.setupFormSubmissions();
        this.setupDniCrossSearching();

        // Carga inicial sincronizada de datos de Firestore
        this.sincronizarTodaLaJornada();
        this.escucharClientesTiempoReal();
    }

    /**
     * Sincroniza y destruye/crea los escuchadores en tiempo real según la fecha seleccionada
     */
    sincronizarTodaLaJornada() {
        const fechaSeleccionada = this.globalDateFilter.value;

        // Desvincular snapshots activos previos para liberar memoria
        if (this.unsubscribeUnidades) this.unsubscribeUnidades();
        if (this.unsubscribePedidos) this.unsubscribePedidos();
        if (this.unsubscribeReclamos) this.unsubscribeReclamos();

        // Levantar nuevos canales reactivos filtrados estrictamente por el día elegido
        this.escucharUnidadesJornada(fechaSeleccionada);
        this.escucharPedidosJornada(fechaSeleccionada);
        this.escucharReclamosJornada(fechaSeleccionada);
    }

    /**
     * Orquesta el comportamiento visual de cambio de pestañas (Tabs)
     */
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

    /**
     * Configura los disparadores de apertura y cierre de ventanas modales
     */
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

    /**
     * Sincroniza y renderiza la grilla de unidades del día en base a las clases SASS de components/cards
     */
    escucharUnidadesJornada(fecha) {
        if (!this.unidadesContainer) return;

        const q = query(collection(db, "unidades_diarias"), where("fecha", "==", fecha));
        
        this.unsubscribeUnidades = onSnapshot(q, (snapshot) => {
            let total = 0, enVuelta = 0, enExtra = 0;
            let htmlHTML = "";

            snapshot.forEach((docSnap) => {
                const u = docSnap.data();
                const id = docSnap.id;
                total++;

                if (parseInt(u.vueltas) >= 4) enExtra++;
                else enVuelta++;

                // CORREGIDO: Inyección HTML adaptada a las clases estructurales de tus componentes SASS unificados
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

            this.unidadesContainer.innerHTML = htmlHTML || `<div style="color:#94a3b8; padding:2rem; grid-column:1/-1; text-align:center;">No hay unidades registradas para esta fecha.</div>`;
            
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
                if (confirm("¿Desea remover esta unidad de la jornada actual?")) {
                    await deleteDoc(doc(db, "unidades_diarias", id));
                }
            });
        });
    }

    /**
     * Escucha y filtra los pedidos inyectados en la fecha de control activa
     */
    escucharPedidosPedidos(fecha) { /* ... implementado abajo ... */ }

    escucharPedidosJornada(fecha) {
        if (!this.listadoPedidosContainer) return;

        const q = query(collection(db, "pedidos"), where("fecha_creacion", "==", fecha));

        this.unsubscribePedidos = onSnapshot(q, (snapshot) => {
            const pedidos = [];
            snapshot.forEach(docSnap => pedidos.push({ id: docSnap.id, ...docSnap.data() }));
            this.renderPedidosList(pedidos);

            if (this.searchPedidoInput) {
                this.searchPedidoInput.addEventListener('input', () => {
                    const term = this.searchPedidoInput.value.toLowerCase();
                    const filtrados = pedidos.filter(p => 
                        p.numero_pedido?.toLowerCase().includes(term) || p.dni_cliente?.toLowerCase().includes(term)
                    );
                    this.renderPedidosList(filtrados);
                });
            }
        });
    }

    renderPedidosList(pedidos) {
        this.listadoPedidosContainer.innerHTML = pedidos.map(p => `
            <div class="card-panel" style="margin-bottom:0.75rem; padding:1rem; flex-direction:row; justify-content:space-between; align-items:center;">
                <div>
                    <strong>Orden: #${Sanitizer.escapeHTML(p.numero_pedido)}</strong><br>
                    <span style="font-size:0.85rem; color:#94a3b8;">DNI Cliente: ${Sanitizer.escapeHTML(p.dni_cliente || 'S/D')}</span><br>
                    <span style="font-size:0.85rem; color:#64748b;">Ventana: ${Sanitizer.escapeHTML(p.franjaHoraria)}</span>
                </div>
                <div style="text-align:right;">
                    <span class="badge badge--info">$${parseFloat(p.importe).toLocaleString('es-AR')}</span>
                </div>
            </div>
        `).join('') || '<div style="color:#94a3b8; padding:1rem; text-align:center;">No hay órdenes cargadas.</div>';
    }

    /**
     * Escucha y renderiza el fichero global de clientes del sistema
     */
    escucharClientesTiempoReal() {
        if (!this.listadoClientesContainer) return;

        onSnapshot(collection(db, "clientes"), (snapshot) => {
            const clientes = [];
            snapshot.forEach(docSnap => clientes.push({ id: docSnap.id, ...docSnap.data() }));
            this.renderClientesList(clientes);

            if (this.searchClienteInput) {
                this.searchClienteInput.addEventListener('input', () => {
                    const term = this.searchClienteInput.value.toLowerCase();
                    const filtrados = clientes.filter(c => 
                        c.nombre?.toLowerCase().includes(term) || c.dni?.toLowerCase().includes(term)
                    );
                    this.renderClientesList(filtrados);
                });
            }
        });
    }

    renderClientesList(clientes) {
        this.listadoClientesContainer.innerHTML = clientes.map(c => `
            <div class="card-panel" style="margin-bottom:0.75rem; padding:1rem;">
                <strong>${Sanitizer.escapeHTML(c.nombre)}</strong> (DNI: ${Sanitizer.escapeHTML(c.dni)})<br>
                <span style="font-size:0.85rem; color:#94a3b8;">📞 ${Sanitizer.escapeHTML(c.telefono)} | ✉️ ${Sanitizer.escapeHTML(c.mail)}</span><br>
                <span style="font-size:0.85rem; color:#64748b;">📍 ${Sanitizer.escapeHTML(c.direccion)}</span>
            </div>
        `).join('') || '<div style="color:#94a3b8; padding:1rem; text-align:center;">No hay clientes en la base de datos.</div>';
    }

    /**
     * Sincroniza las alertas críticas (Reclamos de campo) del día
     */
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

    /**
     * Orquesta el buscador inteligente cruzado por DNI de Clientes para autocompletar domicilios
     */
    setupDniCrossSearching() {
        // Validación interactiva para el formulario de Pedido Manual
        const btnValidarDni = document.getElementById('btn-verificar-dni');
        if (btnValidarDni && this.pDniInput) {
            btnValidarDni.addEventListener('click', async () => {
                const dni = this.pDniInput.value.trim();
                if (!dni) return alert("Ingrese un DNI corporativo válido.");

                const q = query(collection(db, "clientes"), where("dni", "==", dni));
                const snap = await getDocs(q);

                if (!snap.empty) {
                    let optionsHtml = "";
                    snap.forEach(docSnap => {
                        const c = docSnap.data();
                        // En caso de que el cliente posea múltiples domicilios guardados (unificados por coma o array)
                        optionsHtml += `<option value="${Sanitizer.escapeHTML(c.direccion)}">${Sanitizer.escapeHTML(c.direccion)}</option>`;
                    });
                    if (this.pDireccionSelect) {
                        this.pDireccionSelect.innerHTML = optionsHtml;
                        this.pDireccionSelectGroup.style.display = "block";
                    }
                } else {
                    alert("Cliente no encontrado. Complete la dirección única en el campo inferior.");
                    this.pDireccionSelectGroup.style.display = "none";
                }
            });
        }

        // Validación interactiva al vuelo para el formulario de Reclamos
        if (this.recDniInput) {
            this.recDniInput.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const dni = this.recDniInput.value.trim();
                    const q = query(collection(db, "clientes"), where("dni", "==", dni));
                    const snap = await getDocs(q);

                    if (!snap.empty) {
                        this.recClienteStatus.textContent = "✅ Cliente Vinculado";
                        this.recClienteStatus.style.color = "#22c55e";
                        this.recDireccionSelect.disabled = false;
                        
                        let selectHtml = "";
                        snap.forEach(docSnap => {
                            const d = docSnap.data().direccion;
                            selectHtml += `<option value="${Sanitizer.escapeHTML(d)}">${Sanitizer.escapeHTML(d)}</option>`;
                        });
                        this.recDireccionSelect.innerHTML = selectHtml;
                    } else {
                        this.recClienteStatus.textContent = "❌ No registrado";
                        this.recClienteStatus.style.color = "#ef4444";
                        this.recDireccionSelect.disabled = true;
                        this.recDireccionSelect.innerHTML = '<option value="">Ingrese primero un DNI válido</option>';
                    }
                }
            });
        }
    }

    /**
     * Orquesta el comportamiento de carga masiva de planillas de Jumbo
     */
    setupExcelEventListeners() {
        if (!this.excelInput) return;

        this.excelInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            this.fileNameDisplay.textContent = file.name;
            try {
                this.pedidosCargadosExcel = await ExcelParser.importarPedidoJumbo(file);
                this.btnProcesar.disabled = false;
                alert(`Planilla de Jumbo estructurada en memoria: ${this.pedidosCargadosExcel.length} pedidos listos para inyección.`);
            } catch (err) {
                alert("Error estructural: " + err.message);
                this.btnProcesar.disabled = true;
                this.pedidosCargadosExcel = [];
            }
        });

        if (this.btnProcesar) {
            this.btnProcesar.addEventListener('click', async () => {
                if (this.pedidosCargadosExcel.length === 0) return;
                this.btnProcesar.disabled = true;
                
                try {
                    // Forzamos a que los pedidos masivos se marquen con la fecha maestra de control activa
                    const fechaActualBarra = this.globalDateFilter.value;
                    const pedidosEstructurados = this.pedidosCargadosExcel.map(p => ({
                        ...p,
                        fecha_creacion: fechaActualBarra
                    }));

                    await DatabaseService.guardarPedidosMasivos(pedidosEstructurados);
                    alert("¡Inyección Masiva Finalizada! Órdenes sincronizadas en la Consola de Mapas.");
                    
                    this.pedidosCargadosExcel = [];
                    this.excelInput.value = "";
                    this.fileNameDisplay.textContent = "Ningún archivo seleccionado";
                } catch (err) {
                    alert("Fallo de escritura en Firestore: " + err.message);
                    this.btnProcesar.disabled = false;
                }
            });
        }
    }

    /**
     * Centraliza el procesamiento de formularios de altas operativas manuales
     */
    setupFormSubmissions() {
        // Alta manual de Unidades Diarias
        if (this.formAltaUnidad) {
            this.formAltaUnidad.addEventListener('submit', async (e) => {
                e.preventDefault();
                const data = {
                    nombre: document.getElementById('u-nombre').value,
                    ingreso: document.getElementById('u-ingreso').value,
                    salida: document.getElementById('u-salida').value,
                    vueltas: document.getElementById('u-vueltas').value,
                    entregaCampo: document.getElementById('u-campo').checked,
                    notas: document.getElementById('u-notas').value,
                    fecha: this.globalDateFilter.value // Guardado en el historial de la jornada activa
                };

                await addDoc(collection(db, "unidades_diarias"), data);
                this.formAltaUnidad.reset();
                this.toggleModal(this.modalUnidad, false);
            });
        }

        // Alta manual de Clientes en la Base General
        if (this.formCliente) {
            this.formCliente.addEventListener('submit', async (e) => {
                e.preventDefault();
                const data = {
                    dni: document.getElementById('c-dni').value.trim(),
                    nombre: document.getElementById('c-nombre').value.trim(),
                    telefono: document.getElementById('c-telefono').value.trim(),
                    mail: document.getElementById('c-mail').value.trim(),
                    direccion: document.getElementById('c-direccion').value.trim()
                };

                await addDoc(collection(db, "clientes"), data);
                this.formCliente.reset();
                alert("Cliente registrado de forma exitosa en el fichero central.");
            });
        }

        // Alta de Reclamos Operativos (Inyecta la Alerta de Fuego sobre un Pedido Existente)
        if (this.formReclamo) {
            this.formReclamo.addEventListener('submit', async (e) => {
                e.preventDefault();
                const dni = this.recDniInput.value.trim();
                const descripcion = document.getElementById('rec-descripcion').value.trim();
                const fecha = this.globalDateFilter.value;

                // Buscamos la orden activa de ese cliente en la jornada de hoy para inyectarle la alerta
                const q = query(collection(db, "pedidos"), where("fecha_creacion", "==", fecha), where("dni_cliente", "==", dni));
                const snap = await getDocs(q);

                if (!snap.empty) {
                    // Si existe el pedido para hoy, actualizamos su estado a crítico para encender el marcador de fuego
                    const pedidoDoc = snap.docs[0];
                    await DatabaseService.actualizarEstadoCriticoPedido(pedidoDoc.id, true, descripcion);
                    this.formReclamo.reset();
                    this.recClienteStatus.textContent = "";
                    alert("Alerta de Fuego activada de forma exitosa sobre el pedido en el Mapa.");
                } else {
                    alert("No se encontró ningún pedido asignado a este DNI para la jornada de hoy. El reclamo no se puede mapear.");
                }
            });
        }

        // Alta manual de Pedido Individual de Contingencia
        if (this.formManualPedido) {
            this.formManualPedido.addEventListener('submit', async (e) => {
                e.preventDefault();
                const dirNueva = document.getElementById('p-direccion-nueva').value.trim();
                const dirSelect = this.pDireccionSelect.value;
                const direccionFinal = dirNueva || dirSelect;

                if (!direccionFinal) return alert("Defina una dirección válida para la orden.");

                // Simulación de Geocodificación de contingencia en CABA si no hay SDK externo
                const coordenadasMock = {
                    lat: -34.6037 + (Math.random() - 0.5) * 0.1,
                    lng: -58.3816 + (Math.random() - 0.5) * 0.1
                };

                const data = {
                    numero_pedido: document.getElementById('p-numero').value.trim(),
                    importe: parseFloat(document.getElementById('p-importe').value),
                    franjaHoraria: document.getElementById('p-franja').value,
                    dni_cliente: this.pDniInput.value.trim(),
                    direccion: direccionFinal,
                    coordenada: coordenadasMock,
                    fecha_creacion: this.globalDateFilter.value,
                    esCritico: false,
                    motivoCritico: ""
                };

                await addDoc(collection(db, "pedidos"), data);
                this.formManualPedido.reset();
                this.pDireccionSelectGroup.style.display = "none";
                this.toggleModal(this.modalPedido, false);
                alert("Pedido individual inyectado con éxito en Firestore.");
            });
        }
    }
}

// Inicialización de la instancia asegurando la carga estructural del DOM completo
document.addEventListener('DOMContentLoaded', () => {
    const dashboardCtrl = new DashboardController();
    dashboardCtrl.init();
});