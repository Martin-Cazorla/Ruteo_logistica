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
        this.globalDateFilter = document.getElementById('global-date-filter');
        // Nuevo contenedor de bloques de image_40dfca.png
        this.unidadesSeccionesContainer = document.getElementById('unidades-secciones-container');
        
        this.countTotal = document.getElementById('count-total');
        this.countDisp = document.getElementById('count-disp');
        this.countExtra = document.getElementById('count-extra');

        this.excelInput = document.getElementById('excel-file');
        this.fileNameDisplay = document.getElementById('file-name-display');
        this.btnProcesar = document.getElementById('btn-procesar-carga');
        this.listadoPedidosContainer = document.getElementById('listado-pedidos');
        this.searchPedidoInput = document.getElementById('search-pedido');

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
        
        // Franjas de control estables especificadas por la operación
        this.franjasHorariasValidas = ["09:00 hs", "10:00 hs", "11:00 hs", "Electro", "Ausente"];
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
        if (!this.unidadesSeccionesContainer) return;

        const q = query(collection(db, "unidades"), where("fecha", "==", fecha));
        
        this.unsubscribeUnidades = onSnapshot(q, (snapshot) => {
            let total = 0, enVuelta = 0, enExtra = 0;
            
            // Agrupamos las unidades por su franja horaria de ingreso en caliente
            const mapaGrupos = {
                "09:00 hs": [],
                "10:00 hs": [],
                "11:00 hs": [],
                "Electro": [],
                "Ausente": []
            };

            snapshot.forEach((docSnap) => {
                const u = docSnap.data();
                const id = docSnap.id;
                total++;

                // Mapeo adaptativo de vueltas activas
                const v10 = !!u.v10;
                const v13 = !!u.v13;
                const v16 = !!u.v16;
                const v19 = !!u.v19;

                // Sumamos la cantidad de vueltas seleccionadas en los botones táctiles
                const qVueltasTotales = [v10, v13, v16, v19].filter(Boolean).length;

                if (qVueltasTotales >= 4) enExtra++;
                else enVuelta++;

                const objUnidad = { id, ...u, qVueltasTotales, v10, v13, v16, v19 };
                const grupoPertenece = u.ingreso || "Ausente";
                
                if (mapaGrupos[grupoPertenece]) {
                    mapaGrupos[grupoPertenece].push(objUnidad);
                } else {
                    mapaGrupos["Ausente"].push(objUnidad);
                }
            });

            // Dibujamos las cabeceras horizontales de image_40dfca.png
            let htmlMaestro = "";
            this.franjasHorariasValidas.forEach(franja => {
                const listaUnidades = mapaGrupos[franja];
                if (listaUnidades.length === 0) return; // Omitimos bloques vacíos para ahorrar scroll

                htmlMaestro += `
                    <div class="bloque-horario-jornada" style="margin-bottom: 1.5rem;">
                        <h3 class="section-title" style="background-color: #1e293b; padding: 0.5rem 1rem; border-radius: 4px; color: #38bdf8; font-size: 1rem; text-transform: uppercase; margin-bottom: 1rem;">
                            ⚠️ INGRESO ${franja}
                        </h3>
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem;">
                            ${listaUnidades.map(u => {
                                const intSeguro = Sanitizer.escapeHTML(u.interno);
                                const choSeguro = Sanitizer.escapeHTML(u.chofer);
                                const modSeguro = Sanitizer.escapeHTML(u.modelo);
                                const tamSeguro = Sanitizer.escapeHTML(u.tamanio);
                                const notaSegura = Sanitizer.escapeHTML(u.notas || '');

                                // Alerta visual de criticidad (Borde rojo si tiene novedades acumuladas en el Fichero de Flota)
                                const tieneAlertasMecanicas = u.tieneAlertas || false;
                                const estiloBordeCritico = tieneAlertasMecanicas ? 'border: 2px solid #ef4444; box-shadow: 0 0 12px rgba(239, 68, 68, 0.3);' : '';

                                return `
                                    <article class="card-panel" style="padding: 1rem; position: relative; display: flex; flex-direction: column; justify-content: space-between; ${estiloBordeCritico}">
                                        
                                        <!-- Encabezado de Tarjeta Táctil -->
                                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                                            <div>
                                                <strong style="font-size: 1.3rem; color: #f8fafc;">#${intSeguro}</strong>
                                                <span class="badge ${u.entregaCampo ? 'badge--danger' : 'badge--info'}" class="btn-toggle-campo" data-id="${u.id}" style="cursor:pointer; font-size:0.7rem; margin-left:0.25rem;">
                                                    ${u.entregaCampo ? 'CAMPO SÍ' : 'CAMPO NO'}
                                                </span>
                                            </div>
                                            <button class="btn-close-modal btn-remover-unidad-jornada" data-id="${u.id}" aria-label="Remover" style="background:none; border:none; color:#ef4444; font-size:1.2rem; cursor:pointer; padding:0;">&times;</button>
                                        </div>

                                        <div style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 0.75rem; line-height: 1.3;">
                                            <strong>${choSeguro}</strong> <span style="font-size:0.75rem;">(${tamSeguro})</span><br>
                                            <span style="font-size:0.75rem; color:#64748b;">${modSeguro}</span>
                                        </div>

                                        <!-- Selector Táctil Manual de Vueltas de image_40dfca.png -->
                                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.25rem; margin-bottom: 0.75rem;">
                                            <button class="btn-primary btn-toggle-vuelta ${u.v10 ? '' : 'btn-vuelta-apagada'}" data-id="${u.id}" data-v="v10" style="font-size:0.75rem; padding:0.3rem; background-color: ${u.v10 ? '#22c55e' : '#334155'};">Vuelta 10</button>
                                            <button class="btn-primary btn-toggle-vuelta ${u.v13 ? '' : 'btn-vuelta-apagada'}" data-id="${u.id}" data-v="v13" style="font-size:0.75rem; padding:0.3rem; background-color: ${u.v13 ? '#22c55e' : '#334155'};">Vuelta 13</button>
                                            <button class="btn-primary btn-toggle-vuelta ${u.v16 ? '' : 'btn-vuelta-apagada'}" data-id="${u.id}" data-v="v16" style="font-size:0.75rem; padding:0.3rem; background-color: ${u.v16 ? '#22c55e' : '#334155'};">Vuelta 16</button>
                                            <button class="btn-primary btn-toggle-vuelta ${u.v19 ? '' : 'btn-vuelta-apagada'}" data-id="${u.id}" data-v="v19" style="font-size:0.75rem; padding:0.3rem; background-color: ${u.v19 ? '#22c55e' : '#334155'};">Vuelta 19</button>
                                        </div>

                                        <!-- Contador Relacional de Vueltas Acumuladas -->
                                        <div style="text-align: center; font-weight: bold; font-size: 1.1rem; color: #f8fafc; margin-bottom: 0.5rem;">
                                            ${u.qVueltasTotales}/4
                                            ${u.qVueltasTotales >= 4 ? '<span style="color:#ef4444; display:block; font-size:0.65rem; font-weight:700; letter-spacing:0.5px;">EXTRA ACTIVADO</span>' : ''}
                                        </div>

                                        <!-- Campo Dinámico de Comentario Corto -->
                                        <div style="font-size: 0.75rem; color: #eab308; border-top: 1px solid #334155; padding-top: 0.4rem; cursor:pointer;" class="btn-editar-nota-tarjeta" data-id="${u.id}">
                                            📝 <em>${notaSegura || 'Haga clic para agregar nota...'}</em>
                                        </div>

                                    </article>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            });

            this.unidadesSeccionesContainer.innerHTML = htmlHTML = htmlMaestro || `
                <div style="color:#94a3b8; padding:3rem; text-align:center; border: 1px dashed #334155; border-radius:6px;">
                    No hay camiones despachados para la fecha seleccionada. Presione el botón superior para dar de alta.
                </div>
            `;
            
            if (this.countTotal) this.countTotal.textContent = total;
            if (this.countDisp) this.countDisp.textContent = enVuelta;
            if (this.countExtra) this.countExtra.textContent = enExtra;

            this.vincularEventosInteractivosTarjetas();
        });
    }

    vincularEventosInteractivosTarjetas() {
        // 1. Borrado instantáneo si se ingresó por error
        this.unidadesSeccionesContainer.querySelectorAll('.btn-remover-unidad-jornada').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                if (confirm("¿Remover esta unidad de la jornada de hoy?")) {
                    await deleteDoc(doc(db, "unidades", id));
                }
            });
        });

        // 2. Conmutador Táctil de Vueltas de Salida (10, 13, 16 o 19) con persistencia instantánea
        this.unidadesSeccionesContainer.querySelectorAll('.btn-toggle-vuelta').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                const campoVuelta = e.target.getAttribute('data-v');
                const estaPrendida = !e.target.classList.contains('btn-vuelta-apagada');

                const docRef = doc(db, "unidades", id);
                await updateDoc(docRef, {
                    [campoVuelta]: !estaPrendida 
                });
            });
        });

        // 3. Conmutador Táctil de Bandera de Campo (Permite toggle rápido con un clic)
        this.unidadesSeccionesContainer.querySelectorAll('.badge').forEach(badge => {
            badge.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                if (!id) return;
                const esActivoActualmente = e.target.textContent.includes('CAMPO SÍ');
                
                await updateDoc(doc(db, "unidades", id), {
                    entregaCampo: !esActivoActualmente
                });
            });
        });

        // 4. Edición de notas rápida en caliente
        this.unidadesSeccionesContainer.querySelectorAll('.btn-editar-nota-tarjeta').forEach(div => {
            div.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const nuevaNota = prompt("Ingrese nota u observación de la jornada para este camión:");
                if (nuevaNota !== null) {
                    await updateDoc(doc(db, "unidades", id), {
                        notas: nuevaNota.trim()
                    });
                }
            });
        });
    }

    setupFormSubmissions() {
        if (this.formAltaUnidad) {
            this.formAltaUnidad.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const buscadorTermino = document.getElementById('u-nombre').value.trim().toLowerCase();
                const franjaSeleccionada = document.getElementById('u-ingreso').value;
                const fechaActualBarra = this.globalDateFilter.value;

                try {
                    // Consultamos el registro del Fichero Maestro de Transporte
                    const maestroSnap = await getDocs(query(collection(db, "flota_maestra")));
                    let datosMaestros = null;
                    let idInternoEncontrado = null;

                    maestroSnap.forEach(docSnap => {
                        const m = docSnap.data();
                        const idDoc = docSnap.id.toLowerCase();
                        const choferDoc = (m.chofer || '').toLowerCase();

                        // CORREGIDO EXPRÉS: Coincide si el operador ingresa el número de interno exacto o parte del nombre del chofer
                        if (idDoc === buscadorTermino || choferDoc.includes(buscadorTermino)) {
                            datosMaestros = m;
                            idInternoEncontrado = docSnap.id;
                        }
                    });

                    if (!datosMaestros) {
                        alert(`❌ No se encontró ninguna unidad estable con el término "${buscadorTermino}" en el Fichero Maestro.`);
                        return;
                    }

                    // Verificamos si tiene alertas mecánicas en su historial previo para activar el borde de advertencia
                    const arrayHistoricoReclamos = datosMaestros.historial_novedades || [];
                    const registraAlertasMecanicas = arrayHistoricoReclamos.length > 0;

                    const dataOperativa = {
                        interno: idInternoEncontrado,
                        chofer: datosMaestros.chofer,
                        modelo: datosMaestros.modelo,
                        tamanio: datosMaestros.tamanio,
                        ingreso: franjaSeleccionada, 
                        entregaCampo: false, // Por defecto se inicializa en NO
                        notas: '',
                        fecha: fechaActualBarra,
                        v10: false, // Inicializamos las vueltas apagadas fijas para control por clics
                        v13: false,
                        v16: false,
                        v19: false,
                        tieneAlertas: registraAlertasMecanicas 
                    };

                    await addDoc(collection(db, "unidades"), dataOperativa);
                    
                    this.formAltaUnidad.reset();
                    this.toggleModal(this.modalUnidad, false);

                } catch (err) {
                    console.error("Fallo crítico en el despacho exprés: ", err);
                }
            });
        }
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
        `).join('') || '<div style="color:#94a3b8; padding:1rem; text-align:center;">No hay órdenes cargadas hoy.</div>';
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
                    alert("¡Inyección masiva completada con éxito!");
                    this.pedidosCargadosExcel = [];
                    this.excelInput.value = "";
                } catch (err) {
                    this.btnProcesar.disabled = false;
                }
            });
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const dashboardCtrl = new DashboardController();
    dashboardCtrl.init();
});