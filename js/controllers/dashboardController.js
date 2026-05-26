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
    getDocs,
    updateDoc
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export class DashboardController {
    constructor() {
        // Contenedores principales e inputs de la cabecera
        this.globalDateFilter = document.getElementById('global-date-filter');
        this.unidadesSeccionesContainer = document.getElementById('unidades-secciones-container');
        
        this.inputExpressUnidad = document.getElementById('input-express-unidad');
        this.selectExpressIngreso = document.getElementById('select-express-ingreso');

        // Contadores superiores de control (KPI de jornada)
        this.countTotal = document.getElementById('count-total');
        this.countDisp = document.getElementById('count-disp');
        this.countExtra = document.getElementById('count-extra');

        // Modulos de carga masiva por planillas Jumbo
        this.excelInput = document.getElementById('excel-file');
        this.fileNameDisplay = document.getElementById('file-name-display');
        this.btnProcesar = document.getElementById('btn-procesar-carga');
        this.listadoPedidosContainer = document.getElementById('listado-pedidos');

        // Gestión reactiva de reclamos críticos
        this.formReclamo = document.getElementById('form-reclamo');
        this.recDniInput = document.getElementById('rec-dni');
        this.recDireccionSelect = document.getElementById('rec-direccion');
        this.recClienteStatus = document.getElementById('rec-cliente-status');
        this.listadoReclamosContainer = document.getElementById('listado-reclamos');

        // Modal base tradicional de creación manual
        this.modalPedido = document.getElementById('modal-pedido');
        this.formManualPedido = document.getElementById('form-manual-pedido');
        this.pDniInput = document.getElementById('p-dni');
        this.pDireccionSelect = document.getElementById('p-direccion-select');
        this.pDireccionSelectGroup = document.getElementById('domicilios-select-group');

        // ==========================================================================
        // VINCULACIÓN MAESTRA DEL COMPONENTE DIALOG (MÓDULO DE AUDITORÍA AVANZADA)
        // ==========================================================================
        this.dialogGestion = document.getElementById('modal-gestion-unidad');
        this.dialogInternoDisplay = document.getElementById('modal-interno-display');
        this.dialogNotesArea = document.getElementById('modal-notes-area');
        this.dialogCheckForceExtra = document.getElementById('modal-checkbox-force-extra');
        this.btnSaveDialog = document.getElementById('btn-save-gestion-dialog');
        this.btnFinalizeUnit = document.getElementById('btn-finalizar-jornada-unidad');
        this.btnCloseDialog = document.getElementById('btn-close-gestion-dialog');

        // Estado interno volátil del controlador
        this.activeUnitIdForDialog = null; 
        this.pedidosCargadosExcel = [];
        this.unsubscribeUnidades = null;
        this.unsubscribePedidos = null;
        this.unsubscribeReclamos = null;
        
        this.franjasHorariasValidas = ["09:00 hs", "10:00 hs", "11:00 hs", "Electro", "Ausente"];
    }

    init() {
        // Seteo inicial de fecha operativa de control
        if (this.globalDateFilter) {
            this.globalDateFilter.value = new Date().toISOString().split('T')[0];
            this.globalDateFilter.addEventListener('change', () => this.sincronizarTodaLaJornada());
        }

        // Inicialización modular de manejadores de eventos
        this.setupTabsBehavior();
        this.setupModalToggles();
        this.setupExcelEventListeners();
        this.setupExpressDispatchListener();
        this.setupDniCrossSearching();
        this.setupDialogActions(); // Activación de escuchadores nativos del Dialog

        this.sincronizarTodaLaJornada();
    }

    sincronizarTodaLaJornada() {
        const fechaSeleccionada = this.globalDateFilter.value;

        // Limpieza de suscripciones activas para evitar fugas de memoria y sobreconsumo en Firebase
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
        const btnOpenPedido = document.getElementById('btn-manual-pedido-modal');
        const closeButtons = document.querySelectorAll('.btn-close-modal');

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
        if (!this.unidadesSeccionesContainer) return;

        const q = query(collection(db, "unidades"), where("fecha", "==", fecha));
        
        this.unsubscribeUnidades = onSnapshot(q, async (snapshot) => {
            let total = 0, enVuelta = 0, enExtra = 0;
            
            const mapaGrupos = {
                "09:00 hs": [], "10:00 hs": [], "11:00 hs": [], "Electro": [], "Ausente": []
            };

            // CROSS SEARCHING LOGÍSTICO: Consulta en caliente de alertas fuego cruzadas con shipping.html
            const pedidosSnap = await getDocs(query(collection(db, "pedidos"), where("fecha_creacion", "==", fecha), where("esCritico", "==", true)));
            const internosConFuego = new Set();
            pedidosSnap.forEach(pDoc => {
                const pData = pDoc.data();
                if (pData.interno_asignado) {
                    internosConFuego.add(String(pData.interno_asignado).toLowerCase());
                }
            });

            snapshot.forEach((docSnap) => {
                const u = docSnap.data();
                const id = docSnap.id;
                total++;

                const v10 = !!u.v10;
                const v13 = !!u.v13;
                const v16 = !!u.v16;
                const v19 = !!u.v19;

                const qVueltasTotales = [v10, v13, v16, v19].filter(Boolean).length;

                // Auditoría superior de horas extra por vueltas físicas o switch forzado de compensación
                if (u.extraForzado || qVueltasTotales >= 4) enExtra++;
                else enVuelta++;

                const objUnidad = { id, ...u, qVueltasTotales, v10, v13, v16, v19 };
                const grupoPertenece = u.ingreso || "Ausente";
                
                if (mapaGrupos[grupoPertenece]) {
                    mapaGrupos[grupoPertenece].push(objUnidad);
                } else {
                    mapaGrupos["Ausente"].push(objUnidad);
                }
            });

            let htmlMaestro = "";
            this.franjasHorariasValidas.forEach(franja => {
                const listaUnidades = mapaGrupos[franja];
                if (listaUnidades.length === 0) return;

                htmlMaestro += `
                    <div class="bloque-horario-jornada">
                        <h3 class="horario-header-title">INGRESO ${franja}</h3>
                        <div class="horario-cards-grid">
                            ${listaUnidades.map(u => {
                                const intSeguro = Sanitizer.escapeHTML(u.interno);
                                const choSeguro = Sanitizer.escapeHTML(u.chofer);
                                const modSeguro = Sanitizer.escapeHTML(u.modelo);
                                const notaSegura = Sanitizer.escapeHTML(u.notes || '');

                                // Inyección reactiva de modificadores de clase css de alta densidad
                                const claseCampoColor = u.entregaCampo ? 'badge--danger' : 'badge--info';
                                const claseUnidadEnCampo = u.entregaCampo ? 'card-unidad-tactica--en-campo' : '';
                                const claseFinalizada = u.finalizada ? 'card-unidad-tactica--finalizada' : '';
                                
                                // Activación del Efecto Alerta Fuego cruzado 🔥
                                const tieneFuegoCruzado = internosConFuego.has(String(u.interno).toLowerCase());
                                const claseFuegoEfecto = tieneFuegoCruzado ? 'card-unidad-tactica--fuego-activo' : '';

                                return `
                                    <article class="card-panel card-unidad-tactica ${claseUnidadEnCampo} ${claseFinalizada} ${claseFuegoEfecto}" data-id="${u.id}" data-interno="${intSeguro}" data-notes="${notaSegura}" data-force-extra="${!!u.extraForzado}">
                                        
                                        ${u.qVueltasTotales === 3 ? '<div class="sello-jornada-cumplida">JORNADA CUMPLIDA</div>' : ''}
                                        
                                        <div class="card-unidad-header">
                                            <div class="card-header-left">
                                                <strong class="card-interno-display">
                                                    ${tieneFuegoCruzado ? '🔥 ' : ''}#${intSeguro}
                                                </strong>
                                                <span class="badge ${claseCampoColor} btn-toggle-campo-express" data-id="${u.id}">
                                                    ${u.entregaCampo ? 'CAMPO SÍ' : 'CAMPO NO'}
                                                </span>
                                            </div>
                                            <button class="btn-remover-unidad-jornada" data-id="${u.id}" aria-label="Remover">&times;</button>
                                        </div>

                                        <div class="card-unidad-info">
                                            <span class="driver-title">${choSeguro}</span><br>
                                            <span class="model-title">${modSeguro}</span>
                                        </div>

                                        <div class="grid-vueltas-buttons">
                                            <button class="btn-primary btn-toggle-vuelta ${u.v10 ? 'btn-vuelta-activa' : 'btn-vuelta-apagada'}" data-id="${u.id}" data-v="v10" ${u.finalizada ? 'disabled' : ''}>10:00</button>
                                            <button class="btn-primary btn-toggle-vuelta ${u.v13 ? 'btn-vuelta-activa' : 'btn-vuelta-apagada'}" data-id="${u.id}" data-v="v13" ${u.finalizada ? 'disabled' : ''}>13:00</button>
                                            <button class="btn-primary btn-toggle-vuelta ${u.v16 ? 'btn-vuelta-activa' : 'btn-vuelta-apagada'}" data-id="${u.id}" data-v="v16" ${u.finalizada ? 'disabled' : ''}>16:00</button>
                                            <button class="btn-primary btn-toggle-vuelta ${u.v19 ? 'btn-vuelta-activa' : 'btn-vuelta-apagada'}" data-id="${u.id}" data-v="v19" ${u.finalizada ? 'disabled' : ''}>19:00</button>
                                        </div>

                                        <div class="vueltas-counter-display">
                                            <span>${u.extraForzado ? 'EXTRA' : u.qVueltasTotales + '/4'}</span>
                                            ${(u.qVueltasTotales >= 4 || u.extraForzado) ? '<span class="label-extra-sub">EXTRA ACTIVADO</span>' : ''}
                                        </div>

                                        <div class="card-unidad-footer-notes btn-trigger-modal-gestion">
                                            📝 <em>${notaSegura || 'Haga clic para agregar nota...'}</em>
                                        </div>
                                    </article>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            });

            this.unidadesSeccionesContainer.innerHTML = htmlMaestro || `
                <div class="placeholder-vacio-jornada">
                    No hay camiones despachados para la fecha seleccionada. Ingrese el número en la barra superior.
                </div>
            `;
            
            if (this.countTotal) this.countTotal.textContent = total;
            if (this.countDisp) this.countDisp.textContent = enVuelta;
            if (this.countExtra) this.countExtra.textContent = enExtra;

            this.vincularEventosInteractivosTarjetas();
        });
    }

    vincularEventosInteractivosTarjetas() {
        this.unidadesSeccionesContainer.querySelectorAll('.btn-remover-unidad-jornada').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation(); // Previene la apertura colateral del modal de auditoría
                const id = e.target.getAttribute('data-id');
                if (confirm("¿Remover esta unidad de la jornada de hoy?")) {
                    await deleteDoc(doc(db, "unidades", id));
                }
            });
        });

        this.unidadesSeccionesContainer.querySelectorAll('.btn-toggle-vuelta').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation(); 
                const id = e.target.getAttribute('data-id');
                const campoVuelta = e.target.getAttribute('data-v');
                const estaPrendida = e.target.classList.contains('btn-vuelta-activa');

                // Disparador de aviso nativo al alcanzar el techo estipulado de 3 vueltas
                if (!estaPrendida && campoVuelta === 'v16') {
                    alert("⚠️ ¡JORNADA CUMPLIDA! Esta unidad alcanzó el límite estándar de 3 vueltas.");
                }

                await updateDoc(doc(db, "unidades", id), {
                    [campoVuelta]: !estaPrendida 
                });
            });
        });

        this.unidadesSeccionesContainer.querySelectorAll('.btn-toggle-campo-express').forEach(badge => {
            badge.addEventListener('click', async (e) => {
                e.stopPropagation(); 
                const id = e.target.getAttribute('data-id');
                const esActivoActualmente = e.target.textContent.includes('CAMPO SÍ');
                
                if (!esActivoActualmente) {
                    alert("🚩 ALERTA: La unidad fue despachada al campo. Solo puede asistir una vez al día.");
                }
                
                await updateDoc(doc(db, "unidades", id), {
                    entregaCampo: !esActivoActualmente
                });
            });
        });

        // Activación del modal nativo Dialog inyectando los datos del nodo DOM seleccionado
        this.unidadesSeccionesContainer.querySelectorAll('.btn-trigger-modal-gestion').forEach(div => {
            div.addEventListener('click', (e) => {
                const card = e.target.closest('.card-unidad-tactica');
                this.activeUnitIdForDialog = card.getAttribute('data-id');
                
                this.dialogInternoDisplay.textContent = card.getAttribute('data-interno');
                this.dialogNotesArea.value = card.getAttribute('data-notes');
                this.dialogCheckForceExtra.checked = card.getAttribute('data-force-extra') === 'true';

                this.dialogGestion.showModal(); 
            });
        });
    }

    // ==========================================================================
    // LÓGICA DE CONTROL AVANZADA DEL ELEMENTO DIALOG (MÉTODOS COMPLEMENTADOS)
    // ==========================================================================
    setupDialogActions() {
        if (!this.dialogGestion) return;

        // Cierre manual sin realizar persistencia en base de datos
        this.btnCloseDialog.addEventListener('click', () => this.dialogGestion.close());

        // Guardado estructurado de novedades y switch manual de extras forzados
        this.btnSaveDialog.addEventListener('click', async () => {
            if (!this.activeUnitIdForDialog) return;

            const docRef = doc(db, "unidades", this.activeUnitIdForDialog);
            await updateDoc(docRef, {
                notes: this.dialogNotesArea.value.trim(),
                extraForzado: this.dialogCheckForceExtra.checked
            });

            this.dialogGestion.close();
        });

        // Finalización definitiva de jornada con bloqueo estructural de operaciones
        this.btnFinalizeUnit.addEventListener('click', async () => {
            if (!this.activeUnitIdForDialog) return;

            if (confirm("¿Confirmar cierre final de jornada laboral para este camión? Se bloqueará la edición de vueltas.")) {
                const docRef = doc(db, "unidades", this.activeUnitIdForDialog);
                await updateDoc(docRef, {
                    finalizada: true
                });
                this.dialogGestion.close();
            }
        });
    }

    setupExpressDispatchListener() {
        if (!this.inputExpressUnidad) return;

        this.inputExpressUnidad.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                
                const buscadorTermino = this.inputExpressUnidad.value.trim().toLowerCase();
                const franjaSeleccionada = this.selectExpressIngreso.value;
                const fechaActualBarra = this.globalDateFilter.value;

                if (!buscadorTermino) return;

                try {
                    const maestroSnap = await getDocs(query(collection(db, "flota_maestra")));
                    let datosMaestros = null;
                    let idInternoEncontrado = null;

                    maestroSnap.forEach(docSnap => {
                        const m = docSnap.data();
                        const idDoc = docSnap.id.toLowerCase();
                        const choferDoc = (m.chofer || '').toLowerCase();

                        if (idDoc === buscadorTermino || choferDoc.includes(buscadorTermino)) {
                            datosMaestros = m;
                            idInternoEncontrado = docSnap.id;
                        }
                    });

                    if (!datosMaestros) {
                        alert(`❌ No se encontró ninguna unidad estable con el término "${buscadorTermino}" en el Fichero Maestro.`);
                        return;
                    }

                    const dataOperativa = {
                        interno: idInternoEncontrado,
                        chofer: datosMaestros.chofer,
                        modelo: datosMaestros.modelo,
                        tamanio: datosMaestros.tamanio,
                        ingreso: franjaSeleccionada, 
                        entregaCampo: false, 
                        notes: '',
                        fecha: fechaActualBarra,
                        v10: false, v13: false, v16: false, v19: false,
                        extraForzado: false,
                        finalizada: false
                    };

                    await addDoc(collection(db, "unidades"), dataOperativa);
                    this.inputExpressUnidad.value = ''; 

                } catch (err) {
                    console.error("Fallo crítico en el despacho exprés por Enter: ", err);
                }
            }
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
        this.listadoPedidosContainer.innerHTML = pedidos.map(p => {
            const iconoFuego = p.esCritico ? ' 🔥' : '';
            return `
                <div class="card-panel manual-order-item-row ${p.esCritico ? 'order-item--critical' : ''}">
                    <div>
                        <strong>Orden: #${Sanitizer.escapeHTML(p.numero_pedido)}${iconoFuego}</strong><br>
                        <span class="sub-text-dni">DNI: ${Sanitizer.escapeHTML(p.dni_cliente || 'S/D')}</span>
                    </div>
                    <span class="badge badge--info">$${parseFloat(p.importe).toLocaleString('es-AR')}</span>
                </div>
            `;
        }).join('') || '<div class="placeholder-vacio-jornada">No hay órdenes cargadas hoy.</div>';
    }

    escucharReclamosJornada(fecha) {
        if (!this.listadoReclamosContainer) return;

        const q = query(collection(db, "pedidos"), where("fecha_creacion", "==", fecha), where("esCritico", "==", true));

        this.unsubscribeReclamos = onSnapshot(q, (snapshot) => {
            this.listadoReclamosContainer.innerHTML = snapshot.docs.map(docSnap => {
                const p = docSnap.data();
                return `
                    <div class="card-panel card-panel--danger-alert">
                        <strong>Orden Crítica: #${Sanitizer.escapeHTML(p.numero_pedido)}</strong><br>
                        <span class="alert-reason-text">⚠️ Motivo: ${Sanitizer.escapeHTML(p.motivoCritico)}</span>
                    </div>
                `;
            }).join('') || '<div class="placeholder-vacio-jornada">No hay reclamos activos hoy.</div>';
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
    }
}

// Inicialización instantánea al cargar el DOM de la aplicación
document.addEventListener('DOMContentLoaded', () => {
    const dashboardCtrl = new DashboardController();
    dashboardCtrl.init();
});