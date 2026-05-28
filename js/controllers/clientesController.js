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
        this.coordenadasSeleccionadas = { lat: -34.489584, lng: -58.878319 }; // Default Centroide Logístico
    }

    init() {
        this.initMapaAuxiliar();
        this.setupFormSubmitListener();
        this.setupSearchFilterListener();
        this.setupCancelButtonListener();
        this.setupDireccionBlurListener(); // Escucha cuando el operador termina de escribir la dirección
        this.escucharFicheroClientes();
    }

    initMapaAuxiliar() {
        const mapDiv = document.getElementById('mapa-auxiliar-cliente');
        if (!mapDiv || typeof L === 'undefined') return;

        // Inicializa el mapa enfocado en la zona operativa base
        this.mapaAuxiliar = L.map('mapa-auxiliar-cliente').setView([this.coordenadasSeleccionadas.lat, this.coordenadasSeleccionadas.lng], 13);
        
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            attribution: 'Martinez Routing'
        }).addTo(this.mapaAuxiliar);

        // Crea un marcador dragable (arrastrable) para que el usuario corrija fallas de catastro
        this.marcadorMovible = L.marker([this.coordenadasSeleccionadas.lat, this.coordenadasSeleccionadas.lng], {
            draggable: true
        }).addTo(this.mapaAuxiliar);

        // Evento crítico: Captura la posición exacta donde el operador suelta el pin con el mouse
        this.marcadorMovible.on('dragend', (e) => {
            const posicionActual = e.target.getLatLng();
            this.coordenadasSeleccionadas.lat = posicionActual.lat;
            this.coordenadasSeleccionadas.lng = posicionActual.lng;
            console.log("📍 Coordenadas corregidas manualmente por el operador:", this.coordenadasSeleccionadas);
        });
    }

    setupDireccionBlurListener() {
        if (!this.direccionInput) return;
        
        // Cuando el usuario sale del campo dirección, intentamos pre-ubicar el pin automáticamente
        this.direccionInput.addEventListener('blur', async () => {
            const direccionTexto = this.direccionInput.value.trim();
            if (direccionTexto.length < 5) return;

            this.btnSubmit.disabled = true;
            this.btnSubmit.textContent = "Buscando aproximación en mapa...";

            const resultadoGeo = await this._consultarApiGeocodingAsync(direccionTexto);
            
            this.coordenadasSeleccionadas.lat = resultadoGeo.lat;
            this.coordenadasSeleccionadas.lng = resultadoGeo.lng;

            // Movemos el mapa y el pin al lugar sugerido para que el usuario lo verifique
            if (this.mapaAuxiliar && this.marcadorMovible) {
                const nuevaPos = new L.LatLng(geoResult.lat, geoResult.lng);
                this.marcadorMovible.setLatLng(nuevaPos);
                this.mapaAuxiliar.setView(nuevaPos, 15);
            }

            this.btnSubmit.disabled = false;
            this.btnSubmit.textContent = this.hiddenIdInput.value ? "Actualizar Datos Cliente" : "Guardar Cliente en Base";
        });
    }

    async _consultarApiGeocodingAsync(direccionTexto) {
        let queryLimpia = direccionTexto.trim();
        if (!queryLimpia.toLowerCase().includes("buenos aires")) {
            queryLimpia += ", Buenos Aires, Argentina";
        }

        try {
            // Ponemos un retraso artificial preventivo para respetar el límite de 1 req/seg de Nominatim
            await new Promise(res => setTimeout(res, 300));
            
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
            console.warn("API externa no disponible.");
        }

        // Retorna las últimas coordenadas válidas registradas si la API falla
        return { lat: this.coordenadasSeleccionadas.lat, lng: this.coordenadasSeleccionadas.lng };
    }

    setupFormSubmitListener() {
        this.formCliente.addEventListener('submit', async (e) => {
            e.preventDefault();
            this.btnSubmit.disabled = true;

            const dniDocumento = this.dniInput.value.trim();

            // 🌟 ESCUDO AUTOMÁTICO: Salvamos exactamente el punto donde quedó el Pin arrastrado.
            // Si el operador movió el pin a la esquina real de Las Truchas, se guardan esos decimales perfectos.
            const payloadCliente = {
                dni: dniDocumento,
                nombre: this.nombreInput.value.trim().toUpperCase(),
                telefono: this.telefonoInput.value.trim(),
                direccion: this.direccionInput.value.trim(),
                coordenadas: {
                    lat: this.coordenadasSeleccionadas.lat,
                    lng: this.coordenadasSeleccionadas.lng
                },
                latitud: this.coordenadasSeleccionadas.lat, 
                longitud: this.coordenadasSeleccionadas.lng,
                critico: this.checkCritico.checked,
                premium: this.checkPremium.checked,
                isPremium: this.checkPremium.checked, 
                isCritico: this.checkCritico.checked
            };

            try {
                await DatabaseService.guardarCliente(payloadCliente);
                alert(`¡Cliente #${dniDocumento} guardado con éxito logístico de coordenadas fijadas!`);
                this.limpiarFormulario();
            } catch (err) {
                console.error("Fallo al persistir: ", err);
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
            });
        });
    }

    renderClientes(lista) {
        this.listadoContainer.innerHTML = lista.map(c => {
            const idSeguro = Sanitizer.escapeHTML(c.id);
            const dniSeguro = Sanitizer.escapeHTML(c.dni || c.id);
            const nomSeguro = Sanitizer.escapeHTML(c.nombre || 'S/N');
            const telSeguro = Sanitizer.escapeHTML(c.telefono || 'S/T');
            const dirSeguro = Sanitizer.escapeHTML(c.direccion || 'No especificada');
            
            const latFichero = c.coordenadas?.lat || c.latitud || 0;
            const lngFichero = c.coordenadas?.lng || c.longitud || 0;

            return `
                <div class="card-panel cliente-item-row" data-id="${idSeguro}">
                    <div class="cliente-data-info">
                        <span class="cliente-name-title">${nomSeguro}</span>
                        <span class="cliente-sub-text">DNI: <strong>${dniSeguro}</strong></span>
                        <span class="cliente-sub-text">Dir: <em>${dirSeguro}</em></span>
                    </div>
                    <div class="cliente-actions-trigger">
                        <button class="btn-edit-inline" 
                                data-id="${idSeguro}" data-dni="${dniSeguro}" data-nombre="${nomSeguro}" 
                                data-telefono="${telSeguro}" data-direccion="${dirSeguro}"
                                data-lat="${latFichero}" data-lng="${lngFichero}"
                                data-premium="${!!c.isPremium}" data-critico="${!!c.isCritico}">Editar</button>
                    </div>
                </div>
            `;
        }).join('');

        this.vincularEventosInteractivosFichero();
    }

    vincularEventosInteractivosFichero() {
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

                // Al editar, recuperamos la coordenada guardada y reposicionamos el pin de asistencia
                const latGuardada = parseFloat(b.getAttribute('data-lat'));
                const lngGuardada = parseFloat(b.getAttribute('data-lng'));
                
                this.coordenadasSeleccionadas.lat = latGuardada;
                this.coordenadasSeleccionadas.lng = lngGuardada;

                if (this.mapaAuxiliar && this.marcadorMovible) {
                    const pos = new L.LatLng(latGuardada, lngGuardada);
                    this.marcadorMovible.setLatLng(pos);
                    this.mapaAuxiliar.setView(pos, 15);
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
                (c.dni || '').toLowerCase().includes(term) || (c.nombre || '').toLowerCase().includes(term)
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
        this.checkPremium.checked = false;
        this.checkCritico.checked = false;
        this.btnSubmit.textContent = "Guardar Cliente en Base";
        if (this.btnCancel) this.btnCancel.style.display = "none";
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