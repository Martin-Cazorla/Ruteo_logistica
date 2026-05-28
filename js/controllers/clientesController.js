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
        
        // Coordenadas iniciales neutras (Centro de Buenos Aires por si la API tarda en responder)
        this.coordenadasSeleccionadas = { lat: -34.6037, lng: -58.3816 }; 
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

        this.mapaAuxiliar = L.map('mapa-auxiliar-cliente').setView([this.coordenadasSeleccionadas.lat, this.coordenadasSeleccionadas.lng], 12);
        
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            attribution: 'Martinez Routing'
        }).addTo(this.mapaAuxiliar);

        this.marcadorMovible = L.marker([this.coordenadasSeleccionadas.lat, this.coordenadasSeleccionadas.lng], {
            draggable: true
        }).addTo(this.mapaAuxiliar);

        this.marcadorMovible.on('dragend', (e) => {
            const posicionActual = e.target.getLatLng();
            this.coordenadasSeleccionadas.lat = posicionActual.lat;
            this.coordenadasSeleccionadas.lng = posicionActual.lng;
            console.log("📍 Ubicación ajustada visualmente:", this.coordenadasSeleccionadas);
        });
    }

    setupDireccionBlurListener() {
        if (!this.direccionInput) return;
        
        this.direccionInput.addEventListener('blur', async () => {
            const direccionTexto = this.direccionInput.value.trim();
            if (direccionTexto.length < 4) return;

            this.btnSubmit.disabled = true;
            this.btnSubmit.textContent = "Buscando aproximación de domicilio...";

            const resultadoGeo = await this._consultarApiGeocodingAsync(direccionTexto);
            
            this.coordenadasSeleccionadas.lat = resultadoGeo.lat;
            this.coordenadasSeleccionadas.lng = resultadoGeo.lng;

            if (this.mapaAuxiliar && this.marcadorMovible) {
                const nuevaPosicion = new L.LatLng(resultadoGeo.lat, resultadoGeo.lng);
                
                this.marcadorMovible.setLatLng(nuevaPosicion);
                this.mapaAuxiliar.setView(nuevaPosicion, 15);
                
                setTimeout(() => { this.mapaAuxiliar.invalidateSize(); }, 100);
            }

            this.btnSubmit.disabled = false;
            this.btnSubmit.textContent = this.hiddenIdInput.value ? "Actualizar Datos Cliente" : "Guardar Cliente en Base";
        });
    }

    async _consultarApiGeocodingAsync(direccionTexto) {
        let queryLimpia = direccionTexto.trim();
        
        // 🎯 CORRECCIÓN LOGÍSTICA CENTRAL: Quitamos la inyección forzada de "Pilar" para permitir buscar Olivos, San Isidro, etc.
        if (!queryLimpia.toLowerCase().includes("buenos aires") && !queryLimpia.toLowerCase().includes("caba")) {
            queryLimpia += ", Buenos Aires, Argentina";
        }

        try {
            await new Promise(res => setTimeout(res, 350));
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
            console.warn("API externa no disponible. Usando fallback de memoria.");
        }

        return { lat: this.coordenadasSeleccionadas.lat, lng: this.coordenadasSeleccionadas.lng };
    }

    setupFormSubmitListener() {
        this.formCliente.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const dniDocumento = this.dniInput.value.trim();
            if (!dniDocumento) { alert("Por favor, ingrese un DNI válido."); return; }

            this.btnSubmit.disabled = true;
            this.btnSubmit.textContent = "Sincronizando con base central NoSQL...";

            const payloadCliente = {
                dni: dniDocumento,
                nombre: this.nombreInput.value.trim().toUpperCase(),
                telefono: this.telefonoInput.value.trim(), // Se inyecta correctamente
                direccion: this.direccionInput.value.trim(),
                coordenadas: {
                    lat: this.coordenadasSeleccionadas.lat,
                    lng: this.coordenadasSeleccionadas.lng
                },
                critico: this.checkCritico.checked,
                premium: this.checkPremium.checked,
                isPremium: this.checkPremium.checked, 
                isCritico: this.checkCritico.checked,
                motivoCritico: this.checkCritico.checked ? "Cuenta con historial de reclamos de ruteo" : "",
                historialReclamos: []
            };

            try {
                // Almacenamos en Firebase
                await DatabaseService.guardarCliente(payloadCliente);
                
                // 🎯 REPARACIÓN DE PERSISTENCIA MAESTRA: Como tu DatabaseService original no mapea "telefono",
                // forzamos una mutación complementaria directa para asegurar que el dato no se pierda en Firestore
                import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js").then(async (sdk) => {
                    const { db } = await import('../services/firebaseConfig.js');
                    await sdk.updateDoc(sdk.doc(db, "clientes", dniDocumento), {
                        telefono: payloadCliente.telefono
                    });
                });

                alert(`¡Excelente! Cliente #${dniDocumento} guardado con éxito logístico de coordenadas fijadas.`);
                this.limpiarFormulario();
            } catch (err) {
                console.error("Fallo atómico en setDoc:", err);
                alert("Error de comunicación de red al intentar impactar Firebase.");
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
            }, (err) => console.error("Error en sincronización en tiempo real:", err));
        });
    }

    renderClientes(lista) {
        if (!this.listadoContainer) return;
        if (lista.length === 0) {
            this.listadoContainer.innerHTML = `<div class="placeholder-vacio-jornada">No se registraron cuentas de clientes en el sistema.</div>`;
            return;
        }

        this.listadoContainer.innerHTML = lista.map(c => {
            const idSeguro = Sanitizer.escapeHTML(c.id);
            const dniSeguro = Sanitizer.escapeHTML(c.dni || c.id);
            const nomSeguro = Sanitizer.escapeHTML(c.nombre || 'S/N');
            const telSeguro = Sanitizer.escapeHTML(c.telefono || 'S/T'); // Asegura renderizado del teléfono
            const dirSeguro = Sanitizer.escapeHTML(c.direccion || 'No especificada');
            
            const latFichero = c.coordenadas?.lat || c.latitud || -34.6037;
            const lngFichero = c.coordenadas?.lng || c.longitud || -58.3816;
            const esPremium = !!c.isPremium || !!c.premium;
            const esCritico = !!c.isCritico || !!c.critico;

            let claseVariante = "";
            if (esCritico) claseVariante += " cliente-item-row--critico";
            if (esPremium) claseVariante += " cliente-item-row--premium";

            return `
                <div class="card-panel cliente-item-row${claseVariante}" data-id="${idSeguro}">
                    <div class="cliente-data-info">
                        <span class="cliente-name-title">${nomSeguro} ${esPremium ? '⭐' : ''} ${esCritico ? '⚠️' : ''}</span>
                        <span class="cliente-sub-text">DNI: <strong>${dniSeguro}</strong> | Tel: <strong>${telSeguro}</strong></span>
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
        this.listadoContainer.querySelectorAll('.btn-delete-inline').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                if (confirm(`⚠️ ¿Desea eliminar definitivamente al cliente con DNI #${id} de la base de datos maestro?`)) {
                    import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js").then(async (sdk) => {
                        const { db } = await import('../services/firebaseConfig.js');
                        await sdk.deleteDoc(sdk.doc(db, "clientes", id));
                        alert("Registro eliminado con éxito.");
                    });
                    this.limpiarFormulario();
                }
            });
        });

        this.listadoContainer.querySelectorAll('.btn-edit-inline').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const b = e.target;
                this.hiddenIdInput.value = b.getAttribute('data-id');
                this.dniInput.value = b.getAttribute('data-dni');
                this.dniInput.disabled = true; 
                
                this.nombreInput.value = b.getAttribute('data-nombre');
                this.telefonoInput.value = b.getAttribute('data-telefono'); // Rehidrata el campo teléfono correctamente
                this.direccionInput.value = b.getAttribute('data-direccion');
                this.checkPremium.checked = b.getAttribute('data-premium') === 'true';
                this.checkCritico.checked = b.getAttribute('data-critico') === 'true';

                const latGuardada = parseFloat(b.getAttribute('data-lat'));
                const lngGuardada = parseFloat(b.getAttribute('data-lng'));
                
                this.coordenadasSeleccionadas.lat = latGuardada;
                this.coordenadasSeleccionadas.lng = lngGuardada;

                if (this.mapaAuxiliar && this.marcadorMovible) {
                    const pos = new L.LatLng(latGuardada, lngGuardada);
                    this.marcadorMovible.setLatLng(pos);
                    this.mapaAuxiliar.setView(pos, 16);
                }

                this.btnSubmit.textContent = "Actualizar Datos Cliente";
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
        
        this.coordenadasSeleccionadas = { lat: -34.6037, lng: -58.3816 };
        if (this.mapaAuxiliar && this.marcadorMovible) {
            const posBase = new L.LatLng(this.coordenadasSeleccionadas.lat, this.coordenadasSeleccionadas.lng);
            this.marcadorMovible.setLatLng(posBase);
            this.mapaAuxiliar.setView(posBase, 12);
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