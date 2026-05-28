// js/controllers/dashboardController.js
import { DatabaseService } from '../services/databaseService.js';
import { ExcelParser } from '../modules/excelParser.js';
import { Sanitizer } from '../utils/sanitizers.js';

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
        this.unmountCanales();

        this.escucharUnidadesJornada(fechaSeleccionada);
        this.escucharPedidosJornada(fechaSeleccionada);
        // Dejado preparado estructuralmente para la sincronización de reclamos
    }

    unmountCanales() {
        if (typeof this.unsubscribeUnidades === 'function') this.unsubscribeUnidades();
        if (typeof this.unsubscribePedidos === 'function') this.unsubscribePedidos();
        if (typeof this.unsubscribeReclamos === 'function') this.unsubscribeReclamos();
    }

    setupTabsBehavior() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabPanels = document.querySelectorAll('.tab-panel');

        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                tabButtons.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
                tabPanels.forEach(p => { p.classList.remove('active'); p.setAttribute('hidden', 'true'); });
                
                btn.classList.add('active'); 
                btn.setAttribute('aria-selected', 'true');
                const panelId = btn.getAttribute('aria-controls');
                const activePanel = document.getElementById(panelId);
                if (activePanel) { activePanel.classList.add('active'); activePanel.removeAttribute('hidden'); }
            });
        });
    }

    setupModalToggles() {
        const btnOpenPedido = document.getElementById('btn-manual-pedido-modal');
        const closePedidoModal = document.getElementById('btn-close-pedido-modal');

        if (btnOpenPedido) {
            btnOpenPedido.addEventListener('click', () => {
                this.pedidoIdEnEdicion = null;
                this.coordenadasClienteCache = null;
                this.formManualPedido.reset();
                if (this.pDireccionSelectGroup) {
                    this.pDireccionSelectGroup.style.display = "none";
                    this.pDireccionSelectGroup.setAttribute('aria-hidden', 'true');
                }
                const submitBtn = this.formManualPedido.querySelector('button[type="submit"]');
                if (submitBtn) submitBtn.textContent = "Inyectar Pedido Manual";
                this.toggleModal(this.modalPedido, true);
            });
        }

        if (closePedidoModal) {
            closePedidoModal.addEventListener('click', () => {
                this.toggleModal(this.modalPedido, false);
            });
        }
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

        this.unsubscribeUnidades = DatabaseService.subscribeFlotaCompleta(
            fecha,
            async (snapshot) => {
                let total = 0, enVuelta = 0, enExtra = 0;
                const mapaGrupos = { "09:00 hs": [], "10:00 hs": [], "11:00 hs": [], "Electro": [], "Ausente": [] };

                const internosConFuego = new Set();
                try {
                    const pedidosSnap = await DatabaseService.obtenerPedidosCriticosConFlota(fecha);
                    pedidosSnap.forEach(pDoc => {
                        const pData = pDoc.data();
                        if (pData.interno_asignado) internosConFuego.add(String(pData.interno_asignado).toLowerCase());
                    });
                } catch (errSnap) {
                    console.error("Fallo secuencial al mapear fuego cruzado:", errSnap);
                }

                snapshot.forEach((docSnap) => {
                    const u = docSnap.data(); 
                    const id = docSnap.id; 
                    total++;
                    
                    const v10 = !!u.v10; 
                    const v13 = !!u.v13; 
                    const v16 = !!u.v16; 
                    const v19 = !!u.v19;
                    const qVueltasTotales = [v10, v13, v16, v19].filter(Boolean).length;

                    if (u.extraForzado || qVueltasTotales >= 4) enExtra++; 
                    else enVuelta++;

                    const objUnidad = { id, ...u, qVueltasTotales, v10, v13, v16, v19 };
                    const grupoPertenece = u.ingreso || "Ausente";
                    if (mapaGrupos[grupoPertenece]) mapaGrupos[grupoPertenece].push(objUnidad); 
                    else mapaGrupos["Ausente"].push(objUnidad);
                });

                let htmlMaestro = "";
                this.franjasHorariasValidas.forEach(franja => {
                    const listaUnidades = mapaGrupos[franja]; 
                    if (!listaUnidades || listaUnidades.length === 0) return;
                    
                    htmlMaestro += `
                        <div class="bloque-horario-jornada">
                            <h3 class="bloque-horario-jornada__title">INGRESO ${franja}</h3>
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
                                    const esCriticaClase = u.entregaCampo ? 'card-unidad-tactica--critica' : '';

                                    return `
                                        <article class="card-unidad-tactica ${claseUnidadEnCampo} ${claseFinalizada} ${claseFuegoEfecto} ${esCriticaClase}" 
                                                 data-id="${u.id}" data-interno="${intSeguro}" data-notes="${notaSegura}" data-force-extra="${!!u.extraForzado}">
                                            ${u.qVueltasTotales === 3 ? '<div class="sello-jornada-cumplida">JORNADA CUMPLIDA</div>' : ''}
                                            <div class="card-unidad-tactica__header">
                                                <div class="card-unidad-tactica__title-wrapper">
                                                    <strong class="card-unidad-tactica__interno">${tieneFuegoCruzado ? '🔥 ' : ''}#${intSeguro}</strong>
                                                    <span class="badge ${claseCampoColor} btn-toggle-campo-express" data-id="${u.id}">${u.entregaCampo ? 'CAMPO SÍ' : 'CAMPO NO'}</span>
                                                </div>
                                                <button class="card-unidad-tactica__btn-remove" data-id="${u.id}" aria-label="Remover unidad">&times;</button>
                                            </div>
                                            <div class="card-unidad-tactica__info">
                                                <span class="card-unidad-tactica__driver">${choSeguro}</span>
                                                <span class="card-unidad-tactica__model">${modSeguro}</span>
                                            </div>
                                            <div class="card-unidad-tactica__vueltas-grid">
                                                <button class="card-unidad-tactica__btn-vuelta ${u.v10 ? 'card-unidad-tactica__btn-vuelta--on' : 'card-unidad-tactica__btn-vuelta--off'}" data-id="${u.id}" data-v="v10" ${u.finalizada ? 'disabled' : ''}>10:00</button>
                                                <button class="card-unidad-tactica__btn-vuelta ${u.v13 ? 'card-unidad-tactica__btn-vuelta--on' : 'card-unidad-tactica__btn-vuelta--off'}" data-id="${u.id}" data-v="v13" ${u.finalizada ? 'disabled' : ''}>13:00</button>
                                                <button class="card-unidad-tactica__btn-vuelta ${u.v16 ? 'card-unidad-tactica__btn-vuelta--on' : 'card-unidad-tactica__btn-vuelta--off'}" data-id="${u.id}" data-v="v16" ${u.finalizada ? 'disabled' : ''}>16:00</button>
                                                <button class="card-unidad-tactica__btn-vuelta ${u.v19 ? 'card-unidad-tactica__btn-vuelta--on' : 'card-unidad-tactica__btn-vuelta--off'}" data-id="${u.id}" data-v="v19" ${u.finalizada ? 'disabled' : ''}>19:00</button>
                                            </div>
                                            <div class="card-unidad-tactica__counter">
                                                <span>${u.extraForzado ? 'EXTRA' : u.qVueltasTotales + '/4'}</span>
                                                ${(u.qVueltasTotales >= 4 || u.extraForzado) ? '<span class="card-unidad-tactica__extra-label">EXTRA ACTIVADO</span>' : ''}
                                            </div>
                                            <div class="card-unidad-tactica__notes-trigger btn-trigger-modal-gestion">
                                                📝 <em>${notaSegura || 'Agregar nota de control...'}</em>
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
            },
            (error) => console.error("Fallo reactivo de canal de unidades: ", error)
        );
    }

    vincularEventosInteractivosTarjetas() {
        this.unidadesSeccionesContainer.querySelectorAll('.card-unidad-tactica__btn-remove').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation(); 
                const id = e.target.getAttribute('data-id');
                if (confirm("¿Remover esta unidad de la jornada operativa?")) {
                    await DatabaseService.removerUnidadJornada(id);
                }
            });
        });

        this.unidadesSeccionesContainer.querySelectorAll('.card-unidad-tactica__btn-vuelta').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation(); 
                const id = e.target.getAttribute('data-id'); 
                const campoVuelta = e.target.getAttribute('data-v');
                const estaPrendida = e.target.classList.contains('card-unidad-tactica__btn-vuelta--on');
                if (!estaPrendida && campoVuelta === 'v16') alert("⚠️ ¡JORNADA CUMPLIDA! Alcanzó las 3 vueltas de reparto.");
                await DatabaseService.actualizarCamposUnidad(id, { [campoVuelta]: !estaPrendida });
            });
        });

        this.unidadesSeccionesContainer.querySelectorAll('.btn-toggle-campo-express').forEach(badge => {
            badge.addEventListener('click', async (e) => {
                e.stopPropagation(); 
                const id = e.target.getAttribute('data-id');
                const esActivoActualmente = e.target.textContent.includes('CAMPO SÍ');
                if (!esActivoActualmente) alert("🚩 ALERTA PERIMETRAL: Unidad despachada al campo.");
                await DatabaseService.actualizarCamposUnidad(id, { entregaCampo: !esActivoActualmente });
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
            await DatabaseService.actualizarCamposUnidad(this.activeUnitIdForDialog, { 
                notes: this.dialogNotesArea.value.trim(), 
                extraForzado: this.dialogCheckForceExtra.checked 
            });
            this.dialogGestion.close();
        });
        this.btnFinalizeUnit.addEventListener('click', async () => {
            if (!this.activeUnitIdForDialog) return;
            if (confirm("¿Confirmar cierre final de jornada laboral? El camion quedará inactivo.")) { 
                await DatabaseService.actualizarCamposUnidad(this.activeUnitIdForDialog, { finalizada: true }); 
                this.dialogGestion.close(); 
            }
        });
    }

    async _geocodificarDireccionAsync(direccionTexto) {
        if (direccionTexto.toLowerCase().includes("sanguinetti")) {
            return { lat: -34.49983, lng: -58.86431 };
        }

        const esZonaPilar = direccionTexto.toLowerCase().includes("astolfi") || direccionTexto.toLowerCase().includes("pilar");
        const latBase = esZonaPilar ? -34.4998 : -34.4824;
        const lngBase = esZonaPilar ? -58.8643 : -58.5032; 

        if (this.coordenadasClienteCache && !isNaN(this.coordenadasClienteCache.lat)) {
            return this.coordenadasClienteCache;
        }

        let queryLimpia = direccionTexto.trim();
        queryLimpia = queryLimpia.replace(/[A-Z]?\d{4}[A-Z]{3}/gi, '');
        queryLimpia = queryLimpia.replace(/\b\d{4}\b/g, '');          
        queryLimpia = queryLimpia.replace(/\s+/g, ' ').trim();

        if (esZonaPilar && !queryLimpia.toLowerCase().includes("pilar")) {
            queryLimpia += ", Villa Astolfi, Pilar";
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
            console.warn("Pasarela de OpenStreetMap saturada. Derivando a centroide ponderado."); 
        }
        
        const variacionLat = (Math.random() - 0.5) * 0.001;
        const variacionLng = (Math.random() - 0.5) * 0.001;
        return { lat: latBase + variacionLat, lng: lngBase + variacionLng }; 
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
                alert("❌ Error estructural al parsear la planilla de Excel Jumbo."); 
            }
        });

        if (this.btnProcesar) {
            this.btnProcesar.addEventListener('click', async () => {
                if (this.pedidosCargadosExcel.length === 0) return;
                this.btnProcesar.disabled = true;

                try {
                    const fechaActualBarra = this.globalDateFilter.value;
                    const pedidosEstructurados = [];

                    for (const p of this.pedidosCargadosExcel) {
                        this.coordenadasClienteCache = null;
                        const coordReal = await this._geocodificarDireccionAsync(p.direccion_entrega || p.direccion);
                        pedidosEstructurados.push({ ...p, coordenada: coordReal, fecha_creacion: fechaActualBarra });
                    }

                    await DatabaseService.guardarPedidosMasivos(pedidosEstructurados);
                    alert(`¡Inyección masiva y geocodificación completada con éxito!`);
                    this.pedidosCargadosExcel = []; 
                    this.excelInput.value = ""; 
                    this.fileNameDisplay.textContent = "Ningún archivo seleccionado";
                } catch (err) { 
                    console.error("Fallo de inyección masiva en lote: ", err); 
                } finally { 
                    this.btnProcesar.disabled = false; 
                }
            });
        }
    }

    setupManualOrderFormListener() {
        if (!this.formManualPedido) return;

        this.formManualPedido.addEventListener('submit', async (e) => {
            e.preventDefault();
            const usarDireccionSelect = this.pDireccionSelectGroup && this.pDireccionSelectGroup.style.display === "block";
            const direccionFinal = usarDireccionSelect ? this.pDireccionSelect.value : this.pDireccionNueva.value.trim();

            if (!direccionFinal) { alert("⚠️ Campo mandatorio: Especifique un domicilio operativo."); return; }
            const dniConsultado = this.pDniInput.value.trim();

            if (!this.coordenadasClienteCache && dniConsultado) {
                try {
                    const snap = await DatabaseService.obtenerClientePorIdDocumento(dniConsultado);
                    if (!snap.empty) {
                        snap.forEach(docSnap => {
                            const cData = docSnap.data();
                            if (typeof cData.latitud !== 'undefined' && typeof cData.longitud !== 'undefined') {
                                this.coordenadasClienteCache = {
                                    lat: parseFloat(cData.latitud),
                                    lng: parseFloat(cData.longitud)
                                };
                            }
                        });
                    }
                } catch (errRef) {
                    console.warn("No se pudo interceptar geolocalización por ID único:", errRef);
                }
            }

            const coordRealSetteada = await this._geocodificarDireccionAsync(direccionFinal);

            const dataManualOrder = {
                clienteDni: dniConsultado,
                numeroPedido: document.getElementById('p-numero').value.trim(),
                importe: parseFloat(document.getElementById('p-importe').value || 0),
                franjaHoraria: document.getElementById('p-franja').value,
                direccion_entrega: direccionFinal,
                coordenada: coordRealSetteada, 
                fecha_creacion: this.globalDateFilter.value
            };

            try {
                if (this.pedidoIdEnEdicion) {
                    await DatabaseService.actualizarPedido(this.pedidoIdEnEdicion, dataManualOrder);
                    alert(`¡Orden modificada con éxito en la jornada!`);
                } else {
                    dataManualOrder.esCritico = false; 
                    dataManualOrder.interno_asignado = null;
                    await DatabaseService.crearPedidoManual(dataManualOrder);
                    alert(`¡Pedido manual inyectado con éxito!`);
                }

                this.pedidoIdEnEdicion = null;
                this.coordenadasClienteCache = null;
                this.formManualPedido.reset();
                if (this.pDireccionSelectGroup) this.pDireccionSelectGroup.style.display = "none";
                this.toggleModal(this.modalPedido, false); 
            } catch (err) { 
                console.error("Error al persistir orden manual: ", err); 
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
                    const maestroSnap = await DatabaseService.buscarUnidadEnFlotaMaestra();
                    let datosMaestros = null; 
                    let idInternoEncontrado = null;

                    maestroSnap.forEach(docSnap => {
                        const m = docSnap.data();
                        if (docSnap.id.toLowerCase() === buscadorTermino || (m.chofer || '').toLowerCase().includes(buscadorTermino)) {
                            datosMaestros = m; 
                            idInternoEncontrado = docSnap.id;
                        }
                    });

                    if (!datosMaestros) { alert(`❌ Unidad inexistente en la flota maestra central.`); return; }

                    await DatabaseService.despacharNuevaUnidad({
                        interno: idInternoEncontrado, 
                        chofer: datosMaestros.chofer, 
                        modelo: datosMaestros.modelo, 
                        tamanio: datosMaestros.tamanio,
                        ingreso: franjaSeleccionada, 
                        entregaCampo: false, 
                        notes: '', 
                        fecha: fechaActualBarra,
                        v10: false, 
                        v13: false, 
                        v16: false, 
                        v19: false, 
                        extraForzado: false, 
                        finalizada: false
                    });
                    this.inputExpressUnidad.value = ''; 
                } catch (err) { 
                    console.error("Fallo crítico en despacho express: ", err); 
                }
            }
        });
    }

    escucharPedidosJornada(fecha) {
        if (!this.listadoPedidosContainer) return;
        
        this.unsubscribePedidos = DatabaseService.subscribePedidosPorFecha(
            fecha,
            (snapshot) => {
                const pedidos = [];
                snapshot.forEach(docSnap => pedidos.push({ id: docSnap.id, ...docSnap.data() }));
                this.renderPedidosList(pedidos);
            },
            (error) => console.error("Error en escucha reactiva de pedidos: ", error)
        );
    }

    renderPedidosList(pedidos) {
        this.listadoPedidosContainer.innerHTML = pedidos.map(p => {
            const iconoFuego = p.esCritico ? ' 🔥' : '';
            const numPed = p.numeroPedido || p.numero_pedido || 'S/N';
            const dniCli = p.clienteDni || p.dni_cliente || 'S/D';
            const idSeguro = Sanitizer.escapeHTML(p.id);
            const dirSegura = Sanitizer.escapeHTML(p.direccion_entrega || p.direccion || '');
            const impSeguro = parseFloat(p.importe || 0);
            const fraSegura = Sanitizer.escapeHTML(p.franjaHoraria || '10:00-14:00');

            return `
                <div class="card-panel manual-order-item-row ${p.esCritico ? 'card-panel--danger-alert' : ''}">
                    <div>
                        <strong>Orden: #${Sanitizer.escapeHTML(numPed)}${iconoFuego}</strong><br>
                        <span class="manual-order-item-row__dni">DNI: ${Sanitizer.escapeHTML(dniCli)}</span>
                    </div>
                    <div class="search-input-inline">
                        <span class="badge badge--info">$${impSeguro.toLocaleString('es-AR')}</span>
                        <button class="btn-primary btn-edit-pedido-inline" style="width: auto; padding: 0.25rem 0.5rem;"
                                data-id="${idSeguro}" data-numero="${Sanitizer.escapeHTML(numPed)}" data-dni="${Sanitizer.escapeHTML(dniCli)}" data-importe="${impSeguro}" data-franja="${fraSegura}" data-direccion="${dirSegura}">
                            ✏️
                        </button>
                        <button class="btn-primary btn-delete-pedido-inline" style="width: auto; padding: 0.25rem 0.5rem; background-color: rgba(239,68,68,0.15); color: #ef4444;" data-id="${idSeguro}">
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
                if (confirm("⚠️ ¿Desea eliminar este pedido del panel de carga definitivamente?")) {
                    await DatabaseService.removerPedido(id);
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
                
                if (this.pDireccionSelectGroup) this.pDireccionSelectGroup.style.display = "none";
                this.pDireccionNueva.value = b.getAttribute('data-direccion');
                const submitBtn = this.formManualPedido.querySelector('button[type="submit"]');
                if (submitBtn) submitBtn.textContent = "Actualizar Detalles Pedido";
                this.toggleModal(this.modalPedido, true);
            });
        });
    }

    setupDniCrossSearching() {
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

                const snap = await DatabaseService.buscarClientePorDni(dni);

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
                        }
                    });
                    if (this.pDireccionSelect) {
                        this.pDireccionSelect.innerHTML = optionsHtml;
                        if (this.pDireccionSelectGroup) {
                            this.pDireccionSelectGroup.style.display = "block";
                            this.pDireccionSelectGroup.setAttribute('aria-hidden', 'false');
                        }
                    }
                } else {
                    if (this.pDireccionSelectGroup) {
                        this.pDireccionSelectGroup.style.display = "none";
                        this.pDireccionSelectGroup.setAttribute('aria-hidden', 'true');
                    }
                    this.coordenadasClienteCache = null;
                }
            });
        }
    }
}

// Inicialización controlada y limpieza de listeners colgados
document.addEventListener('DOMContentLoaded', () => {
    const dashboardCtrl = new DashboardController();
    dashboardCtrl.init();

    window.addEventListener('beforeunload', () => {
        dashboardCtrl.unmountCanales();
    });
});