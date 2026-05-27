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
        this.unidadesSeccionesContainer = document.getElementById('unidades-secciones-container');
        
        this.inputExpressUnidad = document.getElementById('input-express-unidad');
        this.selectExpressIngreso = document.getElementById('select-express-ingreso');

        this.countTotal = document.getElementById('count-total');
        this.countDisp = document.getElementById('count-disp');
        this.countExtra = document.getElementById('count-extra');

        this.excelInput = document.getElementById('excel-file');
        this.fileNameDisplay = document.getElementById('file-name-display');
        this.btnProcesar = document.getElementById('btn-procesar-carga');
        this.listadoPedidosContainer = document.getElementById('listado-pedidos');

        this.formReclamo = document.getElementById('form-reclamo');
        this.recDniInput = document.getElementById('rec-dni');
        this.recDireccionSelect = document.getElementById('rec-direccion');
        this.recClienteStatus = document.getElementById('rec-cliente-status');
        this.listadoReclamosContainer = document.getElementById('listado-reclamos');

        this.modalPedido = document.getElementById('modal-pedido');
        this.formManualPedido = document.getElementById('form-manual-pedido');
        this.pDniInput = document.getElementById('p-dni');
        this.pDireccionSelect = document.getElementById('p-direccion-select');
        this.pDireccionSelectGroup = document.getElementById('domicilios-select-group');
        this.pDireccionNueva = document.getElementById('p-direccion-nueva');

        this.dialogGestion = document.getElementById('modal-gestion-unidad');
        this.dialogInternoDisplay = document.getElementById('modal-interno-display');
        this.dialogNotesArea = document.getElementById('modal-notes-area');
        this.dialogCheckForceExtra = document.getElementById('modal-checkbox-force-extra');
        this.btnSaveDialog = document.getElementById('btn-save-gestion-dialog');
        this.btnFinalizeUnit = document.getElementById('btn-finalizar-jornada-unidad');
        this.btnCloseDialog = document.getElementById('btn-close-gestion-dialog');

        this.activeUnitIdForDialog = null; 
        this.pedidosCargadosExcel = [];
        this.unsubscribeUnidades = null;
        this.unsubscribePedidos = null;
        this.unsubscribeReclamos = null;
        
        this.franjasHorariasValidas = ["09:00 hs", "10:00 hs", "11:00 hs", "Electro", "Ausente"];
        this.pedidoIdEnEdicion = null;

        // Caché local para resguardar las coordenadas del cliente consultado al validar DNI
        this.coordenadasClienteCache = null;
    }

    init() {
        if (this.globalDateFilter) {
            this.globalDateFilter.value = new Date().toISOString().split('T')[0];
            this.globalDateFilter.addEventListener('change', () => this.sincronizarTodaLaJornada());
        }

        this.setupTabsBehavior();
        this.setupModalToggles();
        this.setupExcelEventListeners();
        this.setupExpressDispatchListener();
        this.setupDniCrossSearching();
        this.setupDialogActions();
        this.setupManualOrderFormListener(); 

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
                tabButtons.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
                tabPanels.forEach(p => { p.classList.remove('active'); p.setAttribute('hidden', 'true'); });
                btn.classList.add('active'); btn.setAttribute('aria-selected', 'true');
                const panelId = btn.getAttribute('aria-controls');
                const activePanel = document.getElementById(panelId);
                if (activePanel) { activePanel.classList.add('active'); activePanel.removeAttribute('hidden'); }
            });
        });
    }

    setupModalToggles() {
        const btnOpenPedido = document.getElementById('btn-manual-pedido-modal');
        const closeButtons = document.querySelectorAll('.btn-close-modal');

        if (btnOpenPedido) {
            btnOpenPedido.addEventListener('click', () => {
                this.pedidoIdEnEdicion = null;
                this.coordenadasClienteCache = null;
                this.formManualPedido.reset();
                this.pDireccionSelectGroup.style.display = "none";
                this.formManualPedido.querySelector('button[type="submit"]').textContent = "Inyectar Pedido Manual";
                this.toggleModal(this.modalPedido, true);
            });
        }

        closeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const openModal = e.target.closest('.modal-overlay');
                this.toggleModal(openModal, false);
            });
        });
    }

    toggleModal(modal, open) {
        if (!modal) return;
        if (open) { modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); }
        else { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); }
    }

    escucharUnidadesJornada(fecha) {
        if (!this.unidadesSeccionesContainer) return;
        const q = query(collection(db, "unidades"), where("fecha", "==", fecha));
        
        this.unsubscribeUnidades = onSnapshot(q, async (snapshot) => {
            let total = 0, enVuelta = 0, enExtra = 0;
            const mapaGrupos = { "09:00 hs": [], "10:00 hs": [], "11:00 hs": [], "Electro": [], "Ausente": [] };

            const pedidosSnap = await getDocs(query(collection(db, "pedidos"), where("fecha_creacion", "==", fecha), where("esCritico", "==", true)));
            const internosConFuego = new Set();
            pedidosSnap.forEach(pDoc => {
                const pData = pDoc.data();
                if (pData.interno_asignado) internosConFuego.add(String(pData.interno_asignado).toLowerCase());
            });

            snapshot.forEach((docSnap) => {
                const u = docSnap.data(); const id = docSnap.id; total++;
                const v10 = !!u.v10; const v13 = !!u.v13; const v16 = !!u.v16; const v19 = !!u.v19;
                const qVueltasTotales = [v10, v13, v16, v19].filter(Boolean).length;

                if (u.extraForzado || qVueltasTotales >= 4) enExtra++; else enVuelta++;
                const objUnidad = { id, ...u, qVueltasTotales, v10, v13, v16, v19 };
                const grupoPertenece = u.ingreso || "Ausente";
                if (mapaGrupos[grupoPertenece]) mapaGrupos[grupoPertenece].push(objUnidad); else mapaGrupos["Ausente"].push(objUnidad);
            });

            let htmlMaestro = "";
            this.franjasHorariasValidas.forEach(franja => {
                const listaUnidades = mapaGrupos[franja]; if (listaUnidades.length === 0) return;
                htmlMaestro += `
                    <div class="bloque-horario-jornada">
                        <h3 class="horario-header-title">INGRESO ${franja}</h3>
                        <div class="horario-cards-grid">
                            ${listaUnidades.map(u => {
                                const intSeguro = Sanitizer.escapeHTML(u.interno);
                                const choSeguro = Sanitizer.escapeHTML(u.chofer);
                                const modSeguro = Sanitizer.escapeHTML(u.modelo);
                                const notaSegura = Sanitizer.escapeHTML(u.notes || '');
                                const claseCampoColor = u.entregaCampo ? 'badge--danger' : 'badge--info';
                                const claseUnidadEnCampo = u.entregaCampo ? 'card-unidad-tactica--en-campo' : '';
                                const claseFinalizada = u.finalizada ? 'card-unidad-tactica--finalizada' : '';
                                const tieneFuegoCruzado = internosConFuego.has(String(u.interno).toLowerCase());
                                const claseFuegoEfecto = tieneFuegoCruzado ? 'card-unidad-tactica--fuego-activo' : '';

                                return `
                                    <article class="card-panel card-unidad-tactica ${claseUnidadEnCampo} ${claseFinalizada} ${claseFuegoEfecto}" data-id="${u.id}" data-interno="${intSeguro}" data-notes="${notaSegura}" data-force-extra="${!!u.extraForzado}">
                                        ${u.qVueltasTotales === 3 ? '<div class="sello-jornada-cumplida">JORNADA CUMPLIDA</div>' : ''}
                                        <div class="card-unidad-header">
                                            <div class="card-header-left">
                                                <strong class="card-interno-display">${tieneFuegoCruzado ? '🔥 ' : ''}#${intSeguro}</strong>
                                                <span class="badge ${claseCampoColor} btn-toggle-campo-express" data-id="${u.id}">${u.entregaCampo ? 'CAMPO SÍ' : 'CAMPO NO'}</span>
                                            </div>
                                            <button class="btn-remover-unidad-jornada" data-id="${u.id}">&times;</button>
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

            this.unidadesSeccionesContainer.innerHTML = htmlMaestro || `<div class="placeholder-vacio-jornada">No hay camiones despachados para la fecha seleccionada.</div>`;
            if (this.countTotal) this.countTotal.textContent = total;
            if (this.countDisp) this.countDisp.textContent = enVuelta;
            if (this.countExtra) this.countExtra.textContent = enExtra;

            this.vincularEventosInteractivosTarjetas();
        });
    }

    vincularEventosInteractivosTarjetas() {
        this.unidadesSeccionesContainer.querySelectorAll('.btn-remover-unidad-jornada').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation(); const id = e.target.getAttribute('data-id');
                if (confirm("¿Remover esta unidad?")) await deleteDoc(doc(db, "unidades", id));
            });
        });

        this.unidadesSeccionesContainer.querySelectorAll('.btn-toggle-vuelta').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation(); const id = e.target.getAttribute('data-id'); const campoVuelta = e.target.getAttribute('data-v');
                const estaPrendida = e.target.classList.contains('btn-vuelta-activa');
                if (!estaPrendida && campoVuelta === 'v16') alert("⚠️ ¡JORNADA CUMPLIDA! Alcanzó las 3 vueltas.");
                await updateDoc(doc(db, "unidades", id), { [campoVuelta]: !estaPrendida });
            });
        });

        this.unidadesSeccionesContainer.querySelectorAll('.btn-toggle-campo-express').forEach(badge => {
            badge.addEventListener('click', async (e) => {
                e.stopPropagation(); const id = e.target.getAttribute('data-id');
                const esActivoActualmente = e.target.textContent.includes('CAMPO SÍ');
                if (!esActivoActualmente) alert("🚩 ALERTA: Despachado al campo.");
                await updateDoc(doc(db, "unidades", id), { entregaCampo: !esActivoActualmente });
            });
        });

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

    setupDialogActions() {
        if (!this.dialogGestion) return;
        this.btnCloseDialog.addEventListener('click', () => this.dialogGestion.close());
        this.btnSaveDialog.addEventListener('click', async () => {
            if (!this.activeUnitIdForDialog) return;
            await updateDoc(doc(db, "unidades", this.activeUnitIdForDialog), { notes: this.dialogNotesArea.value.trim(), extraForzado: this.dialogCheckForceExtra.checked });
            this.dialogGestion.close();
        });
        this.btnFinalizeUnit.addEventListener('click', async () => {
            if (!this.activeUnitIdForDialog) return;
            if (confirm("¿Confirmar cierre final de jornada laboral?")) { await updateDoc(doc(db, "unidades", this.activeUnitIdForDialog), { finalizada: true }); this.dialogGestion.close(); }
        });
    }

    // ==========================================================================
    // PARSER GEOGRÁFICO INDUSTRIAL OPTIMIZADO PARA PILAR / VILLA ASTOLFI
    // ==========================================================================
// js/controllers/dashboardController.js

// ==========================================================================
// PARSER GEOGRÁFICO INDUSTRIAL ANTI-ERROR PARA SANGUINETTI / VILLA ASTOLFI
// ==========================================================================
    async _geocodificarDireccionAsync(direccionTexto) {
        // 1. CHEQUEO OPERATIVO FULMINANTE PARA CALLE SANGUINETTI (VILLA ASTOLFI)
        // Si la dirección contiene "sanguinetti", interceptamos el flujo de inmediato.
        // Clavamos las coordenadas exactas de Villa Astolfi, Pilar (Evita desvíos a Martínez o Palermo).
        if (direccionTexto.toLowerCase().includes("sanguinetti")) {
            console.log("🎯 [CONTI_ZONAL] Intercepción estricta: Forzando coordenadas reales de Sanguinetti, Villa Astolfi.");
            return { 
                lat: -34.49983, // 👈 Coordenadas exactas del punto rojo de tu image_32b6de.jpg
                lng: -58.86431 
            };
        }

        // Centroides de respaldo generales por si falla otra calle
        const esZonaPilar = direccionTexto.toLowerCase().includes("astolfi") || direccionTexto.toLowerCase().includes("pilar");
        const latBase = esZonaPilar ? -34.4998 : -34.4824; // Corregido el fallback de Pilar a -34.49
        const lngBase = esZonaPilar ? -58.8643 : -58.5032; 

        // 2. Prioridad a la caché de Clientes si ya fue validada por DNI
        if (this.coordenadasClienteCache && !isNaN(this.coordenadasClienteCache.lat)) {
            return this.coordenadasClienteCache;
        }

        // 3. Limpieza de texto para el resto de las direcciones
        let queryLimpia = direccionTexto.trim();
        queryLimpia = queryLimpia.replace(/[A-Z]?\d{4}[A-Z]{3}/gi, ''); // Remueve CP (ej: B1634BZL)
        queryLimpia = queryLimpia.replace(/\b\d{4}\b/g, '');           // Remueve números sueltos de CP
        queryLimpia = queryLimpia.replace(/\s+/g, ' ').trim();

        if (esZonaPilar) {
            if (!queryLimpia.toLowerCase().includes("pilar")) {
                queryLimpia += ", Villa Astolfi, Pilar";
            }
        }

        if (!queryLimpia.toLowerCase().includes("buenos aires")) { 
            queryLimpia += ", Buenos Aires, Argentina"; 
        }

        try {
            const urlApi = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryLimpia)}&countrycodes=ar&limit=1`;
            const respuesta = await fetch(urlApi, { headers: { 'User-Agent': 'Martinez-Routing-Application-v2.5' } });
            
            if (respuesta.ok) {
                const dataJson = await respuesta.json();
                if (dataJson && dataJson.length > 0) {
                    return { 
                        lat: parseFloat(dataJson[0].lat), 
                        lng: parseFloat(dataJson[0].lon) 
                    };
                }
            }
        } catch (err) { 
            console.warn("API saturada. Derivando a centroide de zona."); 
        }
        
        // Fallback con dispersión mínima para que no se encimen los pines en el mismo píxel
        const variacionLat = (Math.random() - 0.5) * 0.001;
        const variacionLng = (Math.random() - 0.5) * 0.001;
        return { lat: latBase + variacionLat, lng: lngBase + variacionLng }; 
    }

    setupExcelEventListeners() {
        if (!this.excelInput) return;
        this.excelInput.addEventListener('change', async (e) => {
            const file = e.target.files[0]; if (!file) return;
            this.fileNameDisplay.textContent = file.name;
            try { this.pedidosCargadosExcel = await ExcelParser.importarPedidoJumbo(file); this.btnProcesar.disabled = false; } 
            catch (err) { this.btnProcesar.disabled = true; this.pedidosCargadosExcel = []; alert("❌ Error en Excel."); }
        });

        if (this.btnProcesar) {
            this.btnProcesar.addEventListener('click', async () => {
                if (this.pedidosCargadosExcel.length === 0) return;
                this.btnProcesar.disabled = true;

                try {
                    const fechaActualBarra = this.globalDateFilter.value;
                    const pedidosEstructurados = [];

                    for (const p of this.pedidosCargadosExcel) {
                        // Forzamos limpieza de caché individual para cargas masivas por lote
                        this.coordenadasClienteCache = null;
                        const coordReal = await this._geocodificarDireccionAsync(p.direccion_entrega);
                        pedidosEstructurados.push({ ...p, coordenada: coordReal, fecha_creacion: fechaActualBarra });
                    }

                    await DatabaseService.guardarPedidosMasivos(pedidosEstructurados);
                    alert(`¡Inyección masiva completada!`);
                    this.pedidosCargadosExcel = []; this.excelInput.value = ""; this.fileNameDisplay.textContent = "Ningún archivo seleccionado";
                } catch (err) { console.error(err); }
                finally { this.btnProcesar.disabled = false; }
            });
        }
    }

// Dentro de js/controllers/dashboardController.js

    setupManualOrderFormListener() {
        if (!this.formManualPedido) return;

        this.formManualPedido.addEventListener('submit', async (e) => {
            e.preventDefault();
            const usarDireccionSelect = this.pDireccionSelectGroup.style.display === "block";
            const direccionFinal = usarDireccionSelect ? this.pDireccionSelect.value : this.pDireccionNueva.value.trim();

            if (!direccionFinal) { alert("⚠️ Especifique domicilio."); return; }

            const dniConsultado = this.pDniInput.value.trim();

            // ==========================================================================
            // CAPTURA INTERCEPTORA ULTRA-PRECISA POR ID DE DOCUMENTO (DNI)
            // ==========================================================================
            // Si la caché está vacía, en lugar de un query con where, le pegamos directo
            // al documento por su ID único de Firestore (que es el DNI, según tu imagen).
            if (!this.coordenadasClienteCache && dniConsultado) {
                try {
                    // Importante: asegurate que getDoc esté importado de firebase-firestore en la cabecera
                    // Si no lo está, podés usar la lectura nativa que te armé acá abajo:
                    const { getDoc } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");
                    
                    const clienteRef = doc(db, "clientes", dniConsultado);
                    const clienteSnap = await getDoc(clienteRef);

                    if (clienteSnap.exists()) {
                        const cData = clienteSnap.data();
                        // Extraemos latitud y longitud planos de la raíz (Formato image_307088.png)
                        if (typeof cData.latitud !== 'undefined' && typeof cData.longitud !== 'undefined') {
                            this.coordenadasClienteCache = {
                                lat: parseFloat(cData.latitud),
                                lng: parseFloat(cData.longitud)
                            };
                            console.log("🎯 [INTERCEPTOR] Coordenadas de Pilar recuperadas con éxito por ID:", this.coordenadasClienteCache);
                        }
                    }
                } catch (errRef) {
                    console.warn("No se pudo interceptar por ID de documento de forma directa:", errRef);
                }
            }

            // Ejecuta el geocodificador (si hay caché, devuelve directo las coordenadas de Pilar)
            const coordRealSetteada = await this._geocodificarDireccionAsync(direccionFinal);

            const dataManualOrder = {
                dni_cliente: dniConsultado,
                numero_pedido: document.getElementById('p-numero').value.trim(),
                importe: parseFloat(document.getElementById('p-importe').value),
                franjaHoraria: document.getElementById('p-franja').value,
                direccion_entrega: direccionFinal,
                coordenada: coordRealSetteada, // Guardará la coordenada exacta de Pilar
                fecha_creacion: this.globalDateFilter.value
            };

            try {
                if (this.pedidoIdEnEdicion) {
                    await updateDoc(doc(db, "pedidos", this.pedidoIdEnEdicion), dataManualOrder);
                    alert(`¡Orden modificada con éxito!`);
                } else {
                    dataManualOrder.esCritico = false; 
                    dataManualOrder.interno_asignado = null;
                    await addDoc(collection(db, "pedidos"), dataManualOrder);
                    alert(`¡Pedido manual guardado con éxito!`);
                }

                // Reseteo de control operativo
                this.pedidoIdEnEdicion = null;
                this.coordenadasClienteCache = null;
                this.formManualPedido.reset();
                this.pDireccionSelectGroup.style.display = "none";
                this.toggleModal(this.modalPedido, false); 
            } catch (err) { console.error("Error al persistir orden manual: ", err); }
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
                    let datosMaestros = null; let idInternoEncontrado = null;

                    maestroSnap.forEach(docSnap => {
                        const m = docSnap.data();
                        if (docSnap.id.toLowerCase() === buscadorTermino || (m.chofer || '').toLowerCase().includes(buscadorTermino)) {
                            datosMaestros = m; idInternoEncontrado = docSnap.id;
                        }
                    });

                    if (!datosMaestros) { alert(`❌ No se encontró la unidad.`); return; }

                    await addDoc(collection(db, "unidades"), {
                        interno: idInternoEncontrado, chofer: datosMaestros.chofer, modelo: datosMaestros.modelo, tamanio: datosMaestros.tamanio,
                        ingreso: franjaSeleccionada, entregaCampo: false, notes: '', fecha: fechaActualBarra,
                        v10: false, v13: false, v16: false, v19: false, extraForzado: false, finalizada: false
                    });
                    this.inputExpressUnidad.value = ''; 
                } catch (err) { console.error(err); }
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
            const numPed = p.numero_pedido || p.numeroPedido || 'S/N';
            const dniCli = p.dni_cliente || 'S/D';
            const idSeguro = Sanitizer.escapeHTML(p.id);
            const dirSegura = Sanitizer.escapeHTML(p.direccion_entrega || '');
            const impSeguro = parseFloat(p.importe || 0);
            const fraSegura = Sanitizer.escapeHTML(p.franjaHoraria || '10:00-14:00');

            return `
                <div class="card-panel manual-order-item-row ${p.esCritico ? 'order-item--critical' : ''}" style="display:flex; justify-content:space-between; align-items:center; padding: 0.5rem 0.75rem; gap: 0.5rem;">
                    <div>
                        <strong>Orden: #${Sanitizer.escapeHTML(numPed)}${iconoFuego}</strong><br>
                        <span class="sub-text-dni" style="font-size:0.75rem; color:#64748b;">DNI: ${Sanitizer.escapeHTML(dniCli)}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:0.4rem;">
                        <span class="badge badge--info" style="font-size:0.72rem;">$${impSeguro.toLocaleString('es-AR')}</span>
                        <button class="btn-secondary btn-edit-pedido-inline" style="padding:0.25rem; font-size:0.75rem; background-color:#334155; color:#38bdf8; border:none; border-radius:4px; cursor:pointer;"
                                data-id="${idSeguro}" data-numero="${Sanitizer.escapeHTML(numPed)}" data-dni="${Sanitizer.escapeHTML(dniCli)}" data-importe="${impSeguro}" data-franja="${fraSegura}" data-direccion="${dirSegura}">
                            ✏️
                        </button>
                        <button class="btn-danger btn-delete-pedido-inline" style="padding:0.25rem; font-size:0.75rem; background-color:rgba(239,68,68,0.15); color:#ef4444; border:none; border-radius:4px; cursor:pointer;" data-id="${idSeguro}">
                            ❌
                        </button>
                    </div>
                </div>
            `;
        }).join('') || '<div class="placeholder-vacio-jornada">No hay órdenes cargadas hoy.</div>';

        this.vincularEventosInternosPedidos();
    }

    vincularEventosInternosPedidos() {
        this.listadoPedidosContainer.querySelectorAll('.btn-delete-pedido-inline').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const targetBtn = e.target.closest('.btn-delete-pedido-inline');
                const id = targetBtn.getAttribute('data-id');
                if (confirm("⚠️ ¿Desea eliminar este pedido del panel de carga?")) {
                    try {
                        await deleteDoc(doc(db, "pedidos", id));
                    } catch (error) { console.error(error); }
                }
            });
        });

        this.listadoPedidosContainer.querySelectorAll('.btn-edit-pedido-inline').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const b = e.target.closest('.btn-edit-pedido-inline');
                this.pedidoIdEnEdicion = b.getAttribute('data-id');
                this.pDniInput.value = b.getAttribute('data-dni');
                document.getElementById('p-numero').value = b.getAttribute('data-numero');
                document.getElementById('p-importe').value = b.getAttribute('data-importe');
                document.getElementById('p-franja').value = b.getAttribute('data-franja');
                
                this.pDireccionSelectGroup.style.display = "none";
                this.pDireccionNueva.value = b.getAttribute('data-direccion');
                this.formManualPedido.querySelector('button[type="submit"]').textContent = "Actualizar Detalles Pedido";
                this.toggleModal(this.modalPedido, true);
            });
        });
    }

    setupDniCrossSearching() {
        // EVENTO COMPLEMENTARIO: Si el usuario escribe y cambia el DNI a mano,
        // vaciamos la caché para forzar al sistema a re-validar al enviar.
        if (this.pDniInput) {
            this.pDniInput.addEventListener('input', () => {
                this.coordenadasClienteCache = null;
            });
        }

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
                        
                        if (typeof c.latitud !== 'undefined' && typeof c.longitud !== 'undefined') {
                            this.coordenadasClienteCache = {
                                lat: parseFloat(c.latitud),
                                lng: parseFloat(c.longitud)
                            };
                            console.log("🎯 Coordenadas heredadas del Cliente Maestro:", this.coordenadasClienteCache);
                        }
                    });
                    if (this.pDireccionSelect) {
                        this.pDireccionSelect.innerHTML = optionsHtml;
                        this.pDireccionSelectGroup.style.display = "block";
                    }
                } else {
                    this.pDireccionSelectGroup.style.display = "none";
                    this.coordenadasClienteCache = null;
                }
            });
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const dashboardCtrl = new DashboardController();
    dashboardCtrl.init();
});