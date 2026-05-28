// js/controllers/clientesController.js
import { DatabaseService } from '../services/databaseService.js';
import { Sanitizer } from '../utils/sanitizers.js';

export class ClientesController {
    constructor() {
        this.formCliente = document.getElementById('form-cliente-operativo');
        this.hiddenIdInput = document.getElementById('cliente-id-hidden');
        this.dniInput = document.getElementById('c-dni');
        this.nombreInput = document.getElementById('c-nombre');
        this.telefonoInput = document.getElementById('c-telefono');
        this.direccionInput = document.getElementById('c-direccion');
        
        this.checkPremium = document.getElementById('c-is-premium');
        this.checkCritico = document.getElementById('c-is-critico');

        this.btnSubmit = document.getElementById('btn-guardar-cliente');
        this.btnCancel = document.getElementById('btn-cancelar-edicion');
        this.listadoContainer = document.getElementById('listado-master-clientes');
        this.searchBox = document.getElementById('search-cliente');

        this.unsubscribeClientes = null;
        this.cacheClientesList = []; 

        // Infraestructura del Mapa de Asistencia Técnica Interno
        this.mapaAuxiliar = null;
        this.marcadorMovible = null;
        // Coordenadas iniciales por defecto (Villa Astolfi)
        this.coordenadasSeleccionadas = { lat: -34.489584310640886, lng: -58.87831959094141 }; 
    }

    init() {
        this.initMapaAuxiliar();
        this.setupFormSubmitListener();
        this.setupSearchFilterListener();
        this.setupCancelButtonListener();
        this.setupDireccionBlurListener(); 
        this.escucharFicheroClientes();
    }

    initMapaAuxiliar() {
        const mapDiv = document.getElementById('mapa-auxiliar-cliente');
        if (!mapDiv || typeof L === 'undefined') return;

        this.mapaAuxiliar = L.map('mapa-auxiliar-cliente').setView([this.coordenadasSeleccionadas.lat, this.coordenadasSeleccionadas.lng], 14);
        
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            attribution: 'Martinez Routing'
        }).addTo(this.mapaAuxiliar);

        this.marcadorMovible = L.marker([this.coordenadasSeleccionadas.lat, this.coordenadasSeleccionadas.lng], {
            draggable: true
        }).addTo(this.mapaAuxiliar);

        // Captura interactiva del punto exacto deseado por el operador
        this.marcadorMovible.on('dragend', (e) => {
            const posicionActual = e.target.getLatLng();
            this.coordenadasSeleccionadas.lat = posicionActual.lat;
            this.coordenadasSeleccionadas.lng = posicionActual.lng;
            console.log("📍 Coordenadas ajustadas manualmente:", this.coordenadasSeleccionadas);
        });
    }

    setupDireccionBlurListener() {
        if (!this.direccionInput) return;
        
        this.direccionInput.addEventListener('blur', async () => {
            const direccionTexto = this.direccionInput.value.trim();
            if (direccionTexto.length < 5) return;

            this.btnSubmit.disabled = true;
            this.btnSubmit.textContent = "Buscando aproximación en mapa...";

            const resultadoGeo = await this._consultarApiGeocodingAsync(direccionTexto);
            
            this.coordenadasSeleccionadas.lat = resultadoGeo.lat;
            this.coordenadasSeleccionadas.lng = resultadoGeo.lng;

            // CORREGIDO: Mapeo correcto de variables evitando crasheos fatales en tiempo de ejecución
            if (this.mapaAuxiliar && this.marcadorMovible) {
                const nuevaPos = new L.LatLng(resultadoGeo.lat, resultadoGeo.lng);
                this.marcadorMovible.setLatLng(nuevaPos);
                this.mapaAuxiliar.setView(nuevaPos, 16);
            }

            this.btnSubmit.disabled = false;
            this.btnSubmit.textContent = this.hiddenIdInput.value ? "Actualizar Datos Cliente" : "Guardar Cliente en Base";
        });
    }

    async _consultarApiGeocodingAsync(direccionTexto) {
        let queryLimpia = direccionTexto.trim();
        
        // Atajo dinámico inteligente para autocompletar la traza de Villa Astolfi / Pilar si el operador la omite
        if (!queryLimpia.toLowerCase().includes("pilar") && !queryLimpia.toLowerCase().includes("astolfi")) {
            queryLimpia += ", Villa Astolfi, Pilar";
        }
        if (!queryLimpia.toLowerCase().includes("buenos aires")) {
            queryLimpia += ", Buenos Aires, Argentina";
        }

        try {
            await new Promise(res => setTimeout(res, 300)); // Delay preventivo anti Rate-Limiting
            const urlApi = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryLimpia)}&limit=1`;
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
            console.warn("Fallo de comunicación en geocodificador dinámico.");
        }

        return { lat: this.coordenadasSeleccionadas.lat, lng: this.coordenadasSeleccionadas.lng };
    }

    setupFormSubmitListener() {
        this.formCliente.addEventListener('submit', async (e) => {
            e.preventDefault();
            this.btnSubmit.disabled = true;
            this.btnSubmit.textContent = "Guardando en registro central...";

            const dniDocumento = this.dniInput.value.trim();

            // Mapeo unificado estricto de datos bajo el esquema consumido por DatabaseService
            const payloadCliente = {
                dni: dniDocumento,
                nombre: this.nombreInput.value.trim().toUpperCase(),
                telefono: this.telefonoInput.value.trim(),
                direccion: this.direccionInput.value.trim(),
                coordenadas: {
                    lat: this.coordenadasSeleccionadas.lat,
                    lng: this.coordenadasSeleccionadas.lng
                },
                critico: this.checkCritico.checked,
                isPremium: this.checkPremium.checked,
                isCritico: this.checkCritico.checked,
                motivoCritico: this.checkCritico.checked ? "Reportado desde Fichero Maestro" : "",
                historialReclamos: []
            };

            try {
                await DatabaseService.guardarCliente(payloadCliente);
                alert(`¡Cliente #${dniDocumento} registrado con éxito y coordenadas fijadas!`);
                this.limpiarFormulario();
            } catch (err) {
                console.error("Fallo crítico en persistencia NoSQL: ", err);
                alert("Error de red al intentar registrar la cuenta del cliente.");
            } finally {
                this.btnSubmit.disabled = false;
                this.btnSubmit.textContent = "Guardar Cliente en Base";
            }
        });
    }

    escucharFicheroClientes() {
        if (!this.listadoContainer) return;
        
        import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js").then(async (sdk) => {
            const { db } = await import('../services/firebaseConfig.js');
            const q = sdk.query(sdk.collection(db, "clientes"));
            
            this.unsubscribeClientes = sdk.onSnapshot(q, (snapshot) => {
                this.cacheClientesList = [];
                snapshot.forEach(docSnap => {
                    this.cacheClientesList.push({ id: docSnap.id, ...docSnap.data() });
                });
                this.renderClientes(this.cacheClientesList);
            }, (error) => console.error("Fuga interceptada en canal de clientes:", error));
        });
    }

    renderClientes(lista) {
        if (!this.listadoContainer) return;

        if (lista.length === 0) {
            this.listadoContainer.innerHTML = `
                <div class="placeholder-vacio-jornada">
                    No se encontraron registros de clientes en el Fichero Maestro.
                </div>`;
            return;
        }

        this.listadoContainer.innerHTML = lista.map(c => {
            const idSeguro = Sanitizer.escapeHTML(c.id);
            const dniSeguro = Sanitizer.escapeHTML(c.dni || c.id);
            const nomSeguro = Sanitizer.escapeHTML(c.nombre || 'S/N');
            const telSeguro = Sanitizer.escapeHTML(c.telefono || 'S/T');
            const dirSeguro = Sanitizer.escapeHTML(c.direccion || 'No especificada');
            
            const latFichero = c.coordenadas?.lat || c.latitud || 0;
            const lngFichero = c.coordenadas?.lng || c.longitud || 0;

            const esPremium = !!c.isPremium || !!c.premium;
            const esCritico = !!c.isCritico || !!c.critico;

            let claseVarianteTarjeta = "";
            if (esCritico) claseVarianteTarjeta += " cliente-item-row--critico";
            if (esPremium) claseVarianteTarjeta += " cliente-item-row--premium";

            return `
                <div class="card-panel cliente-item-row${claseVarianteTarjeta}" data-id="${idSeguro}">
                    <div class="cliente-data-info">
                        <span class="cliente-name-title">${nomSeguro} ${esPremium ? '⭐' : ''} ${esCritico ? '⚠️' : ''}</span>
                        <span class="cliente-sub-text">DNI: <strong>${dniSeguro}</strong> | Tel: ${telSeguro}</span>
                        <span class="cliente-sub-text">Dir: <em>${dirSeguro}</em></span>
                    </div>
                    <div class="cliente-actions-trigger">
                        <button class="btn-edit-inline" 
                                data-id="${idSeguro}" data-dni="${dniSeguro}" data-nombre="${nomSeguro}" 
                                data-telefono="${telSeguro}" data-direccion="${dirSeguro}"
                                data-lat="${latFichero}" data-lng="${lngFichero}"
                                data-premium="${esPremium}" data-critico="${esCritico}">Editar</button>
                        <button class="btn-delete-inline" data-id="${idSeguro}">Remover</button>
                    </div>
                </div>
            `;
        }).join('');

        this.vincularEventosInteractivosFichero();
    }

    vincularEventosInteractivosFichero() {
        // ACCIÓN INTEGRADA: Dar de baja definitiva de la base de datos central
        this.listadoContainer.querySelectorAll('.btn-delete-inline').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                if (confirm(`¿Desea eliminar de forma permanente al cliente con DNI #${id} del Fichero Maestro?`)) {
                    try {
                        import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js").then(async (sdk) => {
                            const { db } = await import('../services/firebaseConfig.js');
                            await sdk.deleteDoc(sdk.doc(db, "clientes", id));
                            alert("Cliente removido correctamente.");
                        });
                        this.limpiarFormulario();
                    } catch (err) {
                        console.error("Error al borrar cliente:", err);
                    }
                }
            });
        });

        // ACCIÓN INTEGRADA: Cargar datos en el formulario para edición inline
        this.listadoContainer.querySelectorAll('.btn-edit-inline').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const b = e.target;
                this.hiddenIdInput.value = b.getAttribute('data-id');
                this.dniInput.value = b.getAttribute('data-dni');
                this.nombreInput.value = b.getAttribute('data-nombre');
                this.telefonoInput.value = b.getAttribute('data-telefono');
                this.direccionInput.value = b.getAttribute('data-direccion');
                this.checkPremium.checked = b.getAttribute('data-premium') === 'true';
                this.checkCritico.checked = b.getAttribute('data-critico') === 'true';

                const latGuardada = parseFloat(b.getAttribute('data-lat')) || -34.489584;
                const lngGuardada = parseFloat(b.getAttribute('data-lng')) || -58.878319;
                
                this.coordenadasSeleccionadas.lat = latGuardada;
                this.coordenadasSeleccionadas.lng = lngGuardada;

                if (this.mapaAuxiliar && this.marcadorMovible) {
                    const pos = new L.LatLng(latGuardada, lngGuardada);
                    this.marcadorMovible.setLatLng(pos);
                    this.mapaAuxiliar.setView(pos, 16);
                }

                this.btnSubmit.textContent = "Actualizar Datos Cliente";
                this.dniInput.disabled = true; // El DNI no se edita por ser llave primaria NoSQL
                if (this.btnCancel) this.btnCancel.style.display = "inline-block";
                this.nombreInput.focus();
            });
        });
    }

    setupSearchFilterListener() {
        if (!this.searchBox) return;
        this.searchBox.addEventListener('input', (e) => {
            const term = e.target.value.trim().toLowerCase();
            if (!term) { this.renderClientes(this.cacheClientesList); return; }
            
            const fil = this.cacheClientesList.filter(c => 
                (c.dni || '').toLowerCase().includes(term) || 
                (c.nombre || '').toLowerCase().includes(term) ||
                (c.direccion || '').toLowerCase().includes(term)
            );
            this.renderClientes(fil);
        });
    }

    setupCancelButtonListener() {
        if (this.btnCancel) this.btnCancel.addEventListener('click', () => this.limpiarFormulario());
    }

    limpiarFormulario() {
        this.formCliente.reset();
        this.hiddenIdInput.value = "";
        this.dniInput.disabled = false;
        this.checkPremium.checked = false;
        this.checkCritico.checked = false;
        this.btnSubmit.textContent = "Guardar Cliente en Base";
        if (this.btnCancel) this.btnCancel.style.display = "none";
        
        // Reseteamos el mapa al centroide base operativo
        this.coordenadasSeleccionadas = { lat: -34.489584310640886, lng: -58.87831959094141 };
        if (this.mapaAuxiliar && this.marcadorMovible) {
            const posBase = new L.LatLng(this.coordenadasSeleccionadas.lat, this.coordenadasSeleccionadas.lng);
            this.marcadorMovible.setLatLng(posBase);
            this.mapaAuxiliar.setView(posBase, 14);
        }
    }

    unmount() {
        if (typeof this.unsubscribeClientes === 'function') this.unsubscribeClientes();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const clientesCtrl = new ClientesController();
    clientesCtrl.init();
    window.addEventListener('beforeunload', () => clientesCtrl.unmount());
});