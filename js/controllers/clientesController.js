// js/controllers/clientesController.js

import { DatabaseService } from '../services/databaseService.js';
import { Sanitizer } from '../utils/sanitizers.js';

// ─── Constantes de dominio ────────────────────────────────────────────────────

/** Coordenadas del centro operativo de referencia (Plaza San Martín, Martínez). */
const COORDENADAS_DEFAULT = Object.freeze({ lat: -34.4897, lng: -58.5210 });

/** Zoom para vista general de zona. */
const ZOOM_ZONA  = 13;

/** Zoom para vista de dirección específica. */
const ZOOM_CALLE = 16;

/** Longitud mínima para intentar geocodificar. */
const MIN_LONGITUD_DIRECCION = 5;

// ─── Controlador ─────────────────────────────────────────────────────────────

export class ClientesController {

    // Estado interno del controlador
    #geocodificacionEnCurso = false;
    #unsubscribeClientes    = null;
    #cacheClientesList      = [];
    #coordenadasSeleccionadas;

    // Referencias DOM
    #formCliente;
    #hiddenIdInput;
    #dniInput;
    #nombreInput;
    #telefonoInput;
    #direccionInput;
    #checkPremium;
    #checkCritico;
    #btnSubmit;
    #btnCancel;
    #listadoContainer;
    #searchBox;

    // Leaflet
    #mapaAuxiliar    = null;
    #marcadorMovible = null;

    constructor() {
        this.#coordenadasSeleccionadas = { ...COORDENADAS_DEFAULT };
        this.#resolverReferenciasDOM();
    }

    // ─── Inicialización ───────────────────────────────────────────────────────

    init() {
        if (!this.#formCliente) {
            console.error('[ClientesController] No se encontró el formulario en el DOM.');
            return;
        }
        this.#initMapaAuxiliar();
        this.#setupEventListeners();
        this.#escucharFicheroClientes();
    }

    unmount() {
        if (typeof this.#unsubscribeClientes === 'function') {
            this.#unsubscribeClientes();
        }
        if (this.#mapaAuxiliar) {
            this.#mapaAuxiliar.remove();
            this.#mapaAuxiliar = null;
        }
    }

    // ─── DOM ──────────────────────────────────────────────────────────────────

    #resolverReferenciasDOM() {
        this.#formCliente      = document.getElementById('form-cliente-operativo');
        this.#hiddenIdInput    = document.getElementById('cliente-id-hidden');
        this.#dniInput         = document.getElementById('c-dni');
        this.#nombreInput      = document.getElementById('c-nombre');
        this.#telefonoInput    = document.getElementById('c-telefono');
        this.#direccionInput   = document.getElementById('c-direccion');
        this.#checkPremium     = document.getElementById('c-is-premium');
        this.#checkCritico     = document.getElementById('c-is-critico');
        this.#btnSubmit        = document.getElementById('btn-guardar-cliente');
        this.#btnCancel        = document.getElementById('btn-cancelar-edicion');
        this.#listadoContainer = document.getElementById('listado-master-clientes');
        this.#searchBox        = document.getElementById('search-cliente');
    }

    // ─── Mapa Leaflet ─────────────────────────────────────────────────────────

    #initMapaAuxiliar() {
        const mapDiv = document.getElementById('mapa-auxiliar-cliente');
        if (!mapDiv || typeof L === 'undefined') {
            console.warn('[ClientesController] Leaflet no disponible o contenedor ausente.');
            return;
        }

        const { lat, lng } = COORDENADAS_DEFAULT;

        this.#mapaAuxiliar = L.map('mapa-auxiliar-cliente', {
            center: [lat, lng],
            zoom: ZOOM_ZONA,
            keyboard: true,
        });

        // ✅ Tiles de OpenStreetMap Francia — estables, sin CORS, sin límite agresivo
        // Es el servidor de tiles más permisivo para proyectos sin backend
        L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
            maxZoom: 20,
            subdomains: 'abc',
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(this.#mapaAuxiliar);

        this.#marcadorMovible = L.marker([lat, lng], { draggable: true })
            .addTo(this.#mapaAuxiliar);

        this.#marcadorMovible.on('dragend', (e) => {
            const { lat: newLat, lng: newLng } = e.target.getLatLng();
            this.#coordenadasSeleccionadas.lat = newLat;
            this.#coordenadasSeleccionadas.lng = newLng;
        });

        setTimeout(() => this.#mapaAuxiliar?.invalidateSize(), 150);
    }

    #actualizarMapa(lat, lng, zoom = ZOOM_CALLE) {
        if (!this.#mapaAuxiliar || !this.#marcadorMovible) return;
        const pos = L.latLng(lat, lng);
        this.#marcadorMovible.setLatLng(pos);
        this.#mapaAuxiliar.setView(pos, zoom);
        // Pequeño delay para asegurar que el contenedor tiene dimensiones resueltas
        setTimeout(() => this.#mapaAuxiliar?.invalidateSize(), 100);
    }

    // ─── Geocodificación ──────────────────────────────────────────────────────

    /**
     * El flujo correcto es:
     * 1. Usuario escribe dirección y sale del campo (blur).
     * 2. Se geocodifica en background y se actualiza el mapa como preview.
     * 3. El botón Guardar NO se bloquea por blur — el usuario puede ver
     *    el resultado y corregir el pin si es necesario.
     * 4. Al hacer submit, si hay una geocodificación en curso, SE ESPERA.
     *    Este es el fix central del race condition.
     */
    #setupDireccionBlurListener() {
        this.#direccionInput.addEventListener('blur', () => {
            const texto = this.#direccionInput.value.trim();
            if (texto.length < MIN_LONGITUD_DIRECCION) return;
            // No bloqueamos el botón, solo actualizamos el mapa como preview
            this.#geocodificarDireccion(texto);
        });
    }

    /**
     * Geocodifica una dirección y actualiza el mapa.
     * Setea #geocodificacionEnCurso para que el submit pueda esperarla.
     * 
     * @param {string} direccionTexto
     */
    async #geocodificarDireccion(direccionTexto) {
        this.#geocodificacionEnCurso = true;
        this.#setEstadoMapa('buscando');

        try {
            const resultado = await this.#consultarNominatim(direccionTexto);
            
            this.#coordenadasSeleccionadas.lat = resultado.lat;
            this.#coordenadasSeleccionadas.lng = resultado.lng;
            this.#actualizarMapa(resultado.lat, resultado.lng, ZOOM_CALLE);
            this.#setEstadoMapa(resultado.esFallback ? 'fallback' : 'ok');
        } finally {
            // Siempre liberar el flag, incluso si falla
            this.#geocodificacionEnCurso = false;
        }
    }

    /**
     * Consulta Nominatim con manejo de errores robusto.
     * Retorna coordenadas válidas siempre (nunca lanza).
     * 
     * @param {string} direccionTexto
     * @returns {Promise<{lat: number, lng: number, esFallback: boolean}>}
     */

    async #consultarNominatim(direccionTexto) {
        let query = Sanitizer.sanitizeText(direccionTexto);
        const queryLower = query.toLowerCase();

        if (!queryLower.includes('buenos aires') && !queryLower.includes('argentina')) {
            query += ', Buenos Aires, Argentina';
        }

        // ✅ Photon con location bias centrado en Martínez (zona operativa)
        // Usamos lat/lon + zoom en lugar de bbox — evita el HTTP 400 y da mejores resultados
        // en zonas del GBA donde el bbox era demasiado restrictivo
        // Formato correcto de bbox si alguna vez se necesita: minLon,minLat,maxLon,maxLat
        const params = new URLSearchParams({
            q:      query,
            limit:  '1',
            lang:   'es',
            lat:    String(COORDENADAS_DEFAULT.lat),  // -34.4897 (Martínez)
            lon:    String(COORDENADAS_DEFAULT.lng),  // -58.5210
            zoom:   '14',                             // radio de bias ~barrio
        });

        const url = `https://photon.komoot.io/api/?${params.toString()}`;

        try {
            const respuesta = await fetch(url, {
                signal: AbortSignal.timeout(8000),
            });

            if (!respuesta.ok) {
                throw new Error(`Photon respondió con HTTP ${respuesta.status}`);
            }

            const datos = await respuesta.json();

            // Photon devuelve GeoJSON: coordinates = [lng, lat]  ← orden invertido al estándar
            if (datos?.features?.length > 0) {
                const [lng, lat] = datos.features[0].geometry.coordinates;

                const validacion = Sanitizer.validateCoordenadas(lat, lng);
                if (validacion.valid) {
                    return { lat, lng, esFallback: false };
                }
            }

        } catch (err) {
            if (err.name === 'TimeoutError') {
                console.warn('[Geocodificación] Timeout — Photon no respondió en 8s.');
            } else {
                console.warn('[Geocodificación] Error de red:', err.message);
            }
        }

        return {
            lat: this.#coordenadasSeleccionadas.lat,
            lng: this.#coordenadasSeleccionadas.lng,
            esFallback: true,
        };
    }

    /**
     * Feedback visual del estado de la geocodificación.
     * Muestra un indicador junto al mapa sin bloquear el formulario.
     */
    #setEstadoMapa(estado) {
        const mapaWrapper = document.getElementById('mapa-auxiliar-cliente');
        if (!mapaWrapper) return;

        // Buscar o crear el indicador de estado
        let indicador = mapaWrapper.parentElement.querySelector('.geo-status-indicator');
        if (!indicador) {
            indicador = document.createElement('p');
            indicador.className = 'geo-status-indicator';
            indicador.setAttribute('role', 'status');
            indicador.setAttribute('aria-live', 'polite');
            mapaWrapper.parentElement.insertBefore(indicador, mapaWrapper);
        }

        const mensajes = {
            buscando:  '🔍 Buscando ubicación en el mapa...',
            ok:        '✅ Ubicación encontrada. Ajustá el pin si es necesario.',
            fallback:  '⚠️ No se encontró la dirección exacta. Ubicá el pin manualmente.',
            '':        '',
        };

        indicador.textContent = mensajes[estado] ?? '';
    }

    // ─── Event Listeners ──────────────────────────────────────────────────────

    #setupEventListeners() {
        this.#setupFormSubmitListener();
        this.#setupSearchFilterListener();
        this.#setupCancelButtonListener();
        this.#setupDireccionBlurListener();
        // Event delegation para la lista: UN solo listener en el contenedor
        this.#setupListadoDelegation();
    }

    #setupFormSubmitListener() {
        this.#formCliente.addEventListener('submit', async (e) => {
            e.preventDefault();

            // ── VALIDACIONES ────────────────────────────────────────────────

            const dniRaw = this.#dniInput.value.trim();
            const validDni = Sanitizer.validateDNI(dniRaw);
            if (!validDni.valid) {
                this.#mostrarError(this.#dniInput, validDni.error);
                return;
            }

            const telRaw = this.#telefonoInput.value.trim();
            const validTel = Sanitizer.validateTelefono(telRaw);
            if (!validTel.valid) {
                this.#mostrarError(this.#telefonoInput, validTel.error);
                return;
            }

            const dirRaw = this.#direccionInput.value.trim();
            const validDir = Sanitizer.validateDireccion(dirRaw);
            if (!validDir.valid) {
                this.#mostrarError(this.#direccionInput, validDir.error);
                return;
            }

            // ── FIX RACE CONDITION ──────────────────────────────────────────
            // Si hay una geocodificación en curso (lanzada por blur),
            // esperar hasta 6 segundos a que termine antes de guardar.
            if (this.#geocodificacionEnCurso) {
                this.#setBtnEstado('esperando');
                await this.#esperarGeocodificacion(6000);
            }

            // ── GUARDAR ─────────────────────────────────────────────────────
            this.#setBtnEstado('guardando');

            const payloadCliente = {
                dni:       dniRaw,
                nombre:    Sanitizer.sanitizeText(this.#nombreInput.value).toUpperCase(),
                telefono:  telRaw,
                direccion: Sanitizer.sanitizeText(dirRaw),
                coordenadas: {
                    lat: this.#coordenadasSeleccionadas.lat,
                    lng: this.#coordenadasSeleccionadas.lng,
                },
                // Campo normalizado: usar solo isPremium e isCritico
                isPremium: this.#checkPremium.checked,
                isCritico: this.#checkCritico.checked,
                motivoCritico: this.#checkCritico.checked
                    ? 'Cuenta parametrizada con criticidad logística'
                    : '',
            };

            try {
                await DatabaseService.guardarCliente(payloadCliente);
                this.#mostrarExito(`Cliente ${dniRaw} guardado correctamente.`);
                this.#limpiarFormulario();
            } catch (err) {
                console.error('[ClientesController] Error al guardar cliente:', err);
                this.#mostrarError(null, 'Error de red. No se pudo guardar el cliente. Intentá nuevamente.');
            } finally {
                this.#setBtnEstado('listo');
            }
        });
    }

    /**
     * Espera a que #geocodificacionEnCurso sea false, con timeout de seguridad.
     * Polling cada 100ms.
     * 
     * @param {number} maxMs — tiempo máximo de espera en ms
     */
    #esperarGeocodificacion(maxMs = 6000) {
        return new Promise((resolve) => {
            const inicio = Date.now();
            const check = () => {
                if (!this.#geocodificacionEnCurso || Date.now() - inicio > maxMs) {
                    resolve();
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    }

    // ─── Firestore (usando DatabaseService, no imports dinámicos) ─────────────

    #escucharFicheroClientes() {
        if (!this.#listadoContainer) return;

        // Usar DatabaseService en lugar de importar Firebase directamente aquí
        this.#listadoContainer.innerHTML = '<p class="placeholder-vacio-jornada">Cargando clientes...</p>';

        // DatabaseService debe exponer un método subscribeClientes
        this.#unsubscribeClientes = DatabaseService.subscribeClientes(
            (snapshot) => {
                this.#cacheClientesList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                this.#renderClientes(this.#cacheClientesList);
            },
            (err) => {
                console.error('[ClientesController] Error en snapshot de clientes:', err);
                this.#listadoContainer.innerHTML = '<p class="placeholder-vacio-jornada">Error al cargar clientes.</p>';
            }
        );
    }

    // ─── Render con event delegation ──────────────────────────────────────────

    #renderClientes(lista) {
        if (!this.#listadoContainer) return;

        if (lista.length === 0) {
            this.#listadoContainer.innerHTML = '<p class="placeholder-vacio-jornada">No hay clientes registrados en el sistema.</p>';
            return;
        }

        // Construir HTML con escapeAttr para atributos data-*
        this.#listadoContainer.innerHTML = lista.map(c => this.#buildClienteHTML(c)).join('');
    }

    #buildClienteHTML(c) {
        // Texto en el DOM: escapeHTML
        const nomSeguro = Sanitizer.escapeHTML(c.nombre || 'Sin nombre');
        const dniSeguro = Sanitizer.escapeHTML(c.dni || c.id);
        const telSeguro = Sanitizer.escapeHTML(c.telefono || 'S/T');
        const dirSeguro = Sanitizer.escapeHTML(c.direccion || 'No especificada');

        // Atributos data-*: escapeAttr (más estricto)
        const idAttr  = Sanitizer.escapeAttr(c.id);
        const dniAttr = Sanitizer.escapeAttr(c.dni || c.id);
        const nomAttr = Sanitizer.escapeAttr(c.nombre || 'Sin nombre');
        const telAttr = Sanitizer.escapeAttr(c.telefono || 'S/T');
        const dirAttr = Sanitizer.escapeAttr(c.direccion || 'No especificada');

        // Coordenadas: validar que sean números antes de poner en atributos
        const lat = parseFloat(c.coordenadas?.lat ?? c.latitud ?? COORDENADAS_DEFAULT.lat);
        const lng = parseFloat(c.coordenadas?.lng ?? c.longitud ?? COORDENADAS_DEFAULT.lng);
        const latSeguro = isNaN(lat) ? COORDENADAS_DEFAULT.lat : lat;
        const lngSeguro = isNaN(lng) ? COORDENADAS_DEFAULT.lng : lng;

        // Normalización de flags (acepta tanto isPremium como premium)
        const esPremium = !!c.isPremium || !!c.premium;
        const esCritico = !!c.isCritico || !!c.critico;

        const clases = [
            'card-panel cliente-item-row',
            esCritico ? 'cliente-item-row--critico' : '',
            esPremium  ? 'cliente-item-row--premium'  : '',
        ].filter(Boolean).join(' ');

        return `
            <div class="${clases}" data-id="${idAttr}">
                <div class="cliente-data-info">
                    <span class="cliente-name-title">
                        ${nomSeguro}
                        ${esPremium ? '<span aria-label="Premium">⭐</span>' : ''}
                        ${esCritico ? '<span aria-label="Crítico">⚠️</span>' : ''}
                    </span>
                    <span class="cliente-sub-text">
                        DNI: <strong>${dniSeguro}</strong> | Tel: <strong>${telSeguro}</strong>
                    </span>
                    <span class="cliente-sub-text">Dir: <em>${dirSeguro}</em></span>
                </div>
                <div class="cliente-actions-trigger">
                    <button class="btn-edit-inline"
                            type="button"
                            aria-label="Editar cliente ${nomSeguro}"
                            data-action="editar"
                            data-id="${idAttr}"
                            data-dni="${dniAttr}"
                            data-nombre="${nomAttr}"
                            data-telefono="${telAttr}"
                            data-direccion="${dirAttr}"
                            data-lat="${latSeguro}"
                            data-lng="${lngSeguro}"
                            data-premium="${esPremium}"
                            data-critico="${esCritico}">
                        Editar
                    </button>
                    <button class="btn-delete-inline"
                            type="button"
                            aria-label="Eliminar cliente ${nomSeguro}"
                            data-action="eliminar"
                            data-id="${idAttr}"
                            data-nombre="${nomAttr}">
                        Remover
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Event delegation: UN solo listener en el contenedor.
     * Reemplaza el patrón de N listeners por N botones.
     */
    #setupListadoDelegation() {
        this.#listadoContainer.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;

            const accion = btn.getAttribute('data-action');
            const id     = btn.getAttribute('data-id');

            if (accion === 'eliminar') {
                await this.#handleEliminar(id, btn.getAttribute('data-nombre'));
            } else if (accion === 'editar') {
                this.#handleEditar(btn);
            }
        });
    }

    async #handleEliminar(id, nombre) {
        const nombreMostrar = nombre || id;
        const confirmado = confirm(`⚠️ ¿Eliminar definitivamente a "${nombreMostrar}"?\nEsta acción no se puede deshacer.`);
        if (!confirmado) return;

        try {
            await DatabaseService.eliminarCliente(id);
            this.#mostrarExito('Cliente eliminado correctamente.');
        } catch (err) {
            console.error('[ClientesController] Error al eliminar cliente:', err);
            this.#mostrarError(null, 'No se pudo eliminar el cliente. Intentá nuevamente.');
        }
    }

    #handleEditar(btn) {
        const id       = btn.getAttribute('data-id');
        const dni      = btn.getAttribute('data-dni');
        const nombre   = btn.getAttribute('data-nombre');
        const telefono = btn.getAttribute('data-telefono');
        const direccion= btn.getAttribute('data-direccion');
        const lat      = parseFloat(btn.getAttribute('data-lat'));
        const lng      = parseFloat(btn.getAttribute('data-lng'));
        const premium  = btn.getAttribute('data-premium') === 'true';
        const critico  = btn.getAttribute('data-critico') === 'true';

        this.#hiddenIdInput.value      = id;
        this.#dniInput.value           = dni;
        this.#dniInput.disabled        = true;
        this.#nombreInput.value        = nombre;
        this.#telefonoInput.value      = telefono;
        this.#direccionInput.value     = direccion;
        this.#checkPremium.checked     = premium;
        this.#checkCritico.checked     = critico;

        this.#coordenadasSeleccionadas.lat = isNaN(lat) ? COORDENADAS_DEFAULT.lat : lat;
        this.#coordenadasSeleccionadas.lng = isNaN(lng) ? COORDENADAS_DEFAULT.lng : lng;

        this.#actualizarMapa(
            this.#coordenadasSeleccionadas.lat,
            this.#coordenadasSeleccionadas.lng,
        );

        this.#btnSubmit.textContent = 'Actualizar Datos Cliente';
        if (this.#btnCancel) this.#btnCancel.style.display = 'inline-block';
        this.#nombreInput.focus();
    }

    // ─── Búsqueda ─────────────────────────────────────────────────────────────

    #setupSearchFilterListener() {
        if (!this.#searchBox) return;

        // Debounce manual: no filtrar en cada tecla, sino 200ms después de la última
        let debounceTimer;
        this.#searchBox.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const term = e.target.value.trim().toLowerCase();
                const filtrados = !term
                    ? this.#cacheClientesList
                    : this.#cacheClientesList.filter(c =>
                        (c.dni       || '').toLowerCase().includes(term) ||
                        (c.nombre    || '').toLowerCase().includes(term) ||
                        (c.direccion || '').toLowerCase().includes(term)
                    );
                this.#renderClientes(filtrados);
            }, 200);
        });
    }

    // ─── Formulario ───────────────────────────────────────────────────────────

    #setupCancelButtonListener() {
        this.#btnCancel?.addEventListener('click', () => this.#limpiarFormulario());
    }

    #limpiarFormulario() {
        // Cancelar cualquier geocodificación pendiente (no hay forma de abortar
        // la promesa, pero al resetear el flag el submit ya no la esperará)
        this.#geocodificacionEnCurso = false;

        this.#formCliente.reset();
        this.#hiddenIdInput.value      = '';
        this.#dniInput.disabled        = false;
        this.#checkPremium.checked     = false;
        this.#checkCritico.checked     = false;
        this.#btnSubmit.textContent    = 'Guardar Cliente en Base';
        if (this.#btnCancel) this.#btnCancel.style.display = 'none';
        this.#setEstadoMapa('');

        this.#coordenadasSeleccionadas = { ...COORDENADAS_DEFAULT };
        this.#actualizarMapa(COORDENADAS_DEFAULT.lat, COORDENADAS_DEFAULT.lng, ZOOM_ZONA);
    }

    // ─── UI helpers ───────────────────────────────────────────────────────────

    #setBtnEstado(estado) {
        const textos = {
            guardando:  'Guardando...',
            esperando:  'Verificando ubicación...',
            listo:      this.#hiddenIdInput?.value ? 'Actualizar Datos Cliente' : 'Guardar Cliente en Base',
        };
        this.#btnSubmit.disabled    = estado !== 'listo';
        this.#btnSubmit.textContent = textos[estado] ?? 'Guardar Cliente en Base';
    }

    /**
     * Muestra un mensaje de error accesible junto al campo o en el formulario.
     * @param {HTMLElement|null} campo — null para error general del formulario
     * @param {string} mensaje
     */
    #mostrarError(campo, mensaje) {
        // Limpiar errores previos
        this.#formCliente.querySelectorAll('.campo-error-msg').forEach(el => el.remove());
        this.#formCliente.querySelectorAll('.campo--error').forEach(el => el.classList.remove('campo--error'));

        if (campo) {
            campo.classList.add('campo--error');
            const errorEl = document.createElement('span');
            errorEl.className = 'campo-error-msg';
            errorEl.setAttribute('role', 'alert');
            errorEl.textContent = mensaje;
            campo.insertAdjacentElement('afterend', errorEl);
            campo.focus();
        } else {
            // Error general: mostrar arriba del botón
            const errorEl = document.createElement('p');
            errorEl.className = 'campo-error-msg campo-error-msg--general';
            errorEl.setAttribute('role', 'alert');
            errorEl.textContent = mensaje;
            this.#btnSubmit.insertAdjacentElement('beforebegin', errorEl);
        }
    }

    #mostrarExito(mensaje) {
        // Reemplazar alert() por feedback no bloqueante
        const exito = document.createElement('p');
        exito.className = 'campo-exito-msg';
        exito.setAttribute('role', 'status');
        exito.textContent = mensaje;
        this.#btnSubmit.insertAdjacentElement('beforebegin', exito);
        setTimeout(() => exito.remove(), 4000);
    }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const ctrl = new ClientesController();
    ctrl.init();
    window.addEventListener('beforeunload', () => ctrl.unmount());
});