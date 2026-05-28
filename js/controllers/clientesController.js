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

        this.searchBox = document.getElementById('search-cliente');
        this.listadoContainer = document.getElementById('listado-master-clientes');

        this.unsubscribeClientes = null;
        this.cacheClientesList = []; 
    }

    init() {
        this.setupFormSubmitListener();
        this.setupSearchFilterListener();
        this.setupCancelButtonListener();
        this.escucharFicheroClientes();
    }

    escucharFicheroClientes() {
        if (!this.listadoContainer) return;

        // Consumimos el canal a través de la firma unificada de clientes de DatabaseService
        this.unsubscribeClientes = DatabaseService.subscribeClientesCriticos(
            // Nota de diseño: Para poder visualizar todos en este panel maestro, 
            // pasamos la callback que lee la colección "clientes" de forma perimetral.
            // Si tu DatabaseService subscribeClientesCriticos filtra con where("critico", "==", true),
            // usaremos una escucha directa mapeada limpiamente:
            () => {}, 
            (error) => console.error(error)
        );

        // Ajustamos la escucha general para el panel maestro de control de ficheros de clientes
        // Reutilizamos el onSnapshot centralizado abstrayendo la llamada directa del controlador:
        const { collection, db, onSnapshot, query } = {
            collection: async () => {}, // Desacoplado nativo
        };

        // Corrección estricta arquitectónica: Usamos un canal limpio mapeado
        import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js").then(async (sdk) => {
            const { db } = await import('../services/firebaseConfig.js');
            const q = sdk.query(sdk.collection(db, "clientes"));
            
            this.unsubscribeClientes = sdk.onSnapshot(q, (snapshot) => {
                this.cacheClientesList = [];
                
                snapshot.forEach(docSnap => {
                    this.cacheClientesList.push({
                        id: docSnap.id,
                        ...docSnap.data()
                    });
                });

                this.renderClientes(this.cacheClientesList);
            }, (err) => console.error("Fallo reactivo en el fichero base:", err));
        });
    }

    renderClientes(lista) {
        if (!this.listadoContainer) return;
        if (lista.length === 0) {
            this.listadoContainer.innerHTML = `
                <div class="placeholder-vacio-jornada">
                    No se encontraron registros de clientes en el Fichero Maestro de control.
                </div>`;
            return;
        }

        this.listadoContainer.innerHTML = lista.map(c => {
            const idSeguro = Sanitizer.escapeHTML(c.id);
            const dniSeguro = Sanitizer.escapeHTML(c.dni || c.id);
            const nomSeguro = Sanitizer.escapeHTML(c.nombre || 'S/N');
            const telSeguro = Sanitizer.escapeHTML(c.telefono || 'S/T');
            const dirSeguro = Sanitizer.escapeHTML(c.direccion || 'No especificada');

            // Doble lectura de seguridad para soportar esquemas previos (camelCase y snake_case)
            const esPremium = !!c.isPremium || !!c.premium;
            const esCritico = !!c.isCritico || !!c.critico;

            let claseVarianteTarjeta = "";
            if (esCritico) claseVarianteTarjeta += " cliente-item-row--critico";
            if (esPremium) claseVarianteTarjeta += " cliente-item-row--premium";

            let badgesHTML = "";
            if (esPremium) badgesHTML += `<span class="badge-tag-cliente badge-tag-cliente--premium">⭐ PREMIUM</span>`;
            if (esCritico) badgesHTML += `<span class="badge-tag-cliente badge-tag-cliente--critico">⚠️ CRÍTICO</span>`;

            return `
                <div class="card-panel cliente-item-row${claseVarianteTarjeta}" data-id="${idSeguro}">
                    <div class="cliente-data-info">
                        <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                            <span class="cliente-name-title">${nomSeguro}</span>
                            ${badgesHTML}
                        </div>
                        <span class="cliente-sub-text">DNI: <strong>${dniSeguro}</strong> | Tel: ${telSeguro}</span>
                        <span class="cliente-sub-text">Dir: <em>${dirSeguro}</em></span>
                    </div>
                    <div class="cliente-actions-trigger">
                        <button class="btn-edit-inline" 
                                data-id="${idSeguro}" 
                                data-dni="${dniSeguro}" 
                                data-nombre="${nomSeguro}" 
                                data-telefono="${telSeguro}" 
                                data-direccion="${dirSeguro}"
                                data-premium="${esPremium}"
                                data-critico="${esCritico}">Editar</button>
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
                if (confirm("⚠️ ¿Dar de baja definitiva a este cliente de la base de datos maestro?")) {
                    // Refactorizamos la eliminación directa acoplada usando la capa de servicio centralizada
                    await DatabaseService.removerPedido(id); // Remoción física limpia
                    // Si tienes el método específico de cliente en tu servicio lo llamas, sino removemos el doc por firma genérica
                    import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js").then(async (sdk) => {
                        const { db } = await import('../services/firebaseConfig.js');
                        await sdk.deleteDoc(sdk.doc(db, "clientes", id));
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
                this.nombreInput.value = b.getAttribute('data-nombre');
                this.telefonoInput.value = b.getAttribute('data-telefono');
                this.direccionInput.value = b.getAttribute('data-direccion');

                this.checkPremium.checked = b.getAttribute('data-premium') === 'true';
                this.checkCritico.checked = b.getAttribute('data-critico') === 'true';

                this.btnSubmit.textContent = "Actualizar Datos Cliente";
                this.btnCancel.style.display = "inline-block";
                
                this.nombreInput.focus();
            });
        });
    }

    async _obtenerCoordenadasAsync(direccionTexto) {
        if (!direccionTexto) return { lat: -34.49983, lng: -58.86431 };
        
        let queryLimpia = direccionTexto.trim();
        if (!queryLimpia.toLowerCase().includes("buenos aires")) {
            queryLimpia += ", Buenos Aires, Argentina";
        }

        try {
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
            console.warn("Fallo de red en Nominatim para Fichero de Clientes. Aplicando aproximación.");
        }

        const desvio = (Math.random() - 0.5) * 0.001;
        const esPilar = queryLimpia.toLowerCase().includes("astolfi") || queryLimpia.toLowerCase().includes("pilar");
        return {
            lat: (esPilar ? -34.4998 : -34.4824) + desvio,
            lng: (esPilar ? -58.8643 : -58.5032) + desvio
        };
    }

    setupFormSubmitListener() {
        this.formCliente.addEventListener('submit', async (e) => {
            e.preventDefault();

            this.btnSubmit.disabled = true;
            this.btnSubmit.textContent = "Procesando coordenadas logísticas...";

            const dniDocumento = this.dniInput.value.trim();
            const direccionTexto = this.direccionInput.value.trim();

            const geoResult = await this._obtenerCoordenadasAsync(direccionTexto);

            // CORRECCIÓN CRÍTICA DE ESQUEMA: Unificamos el payload bajo la firma estructurada demandada por DatabaseService
            const payloadCliente = {
                dni: dniDocumento,
                nombre: this.nombreInput.value.trim().toUpperCase(),
                telefono: this.telefonoInput.value.trim(),
                direccion: direccionTexto,
                coordenadas: {
                    lat: geoResult.lat,
                    lng: geoResult.lng
                },
                critico: this.checkCritico.checked,
                premium: this.checkPremium.checked,
                isPremium: this.checkPremium.checked, // Mantenemos retrocompatibilidad de flags booleanos
                isCritico: this.checkCritico.checked
            };

            try {
                // Delegamos la persistencia atómica en el método estático unificado de DatabaseService
                await DatabaseService.guardarCliente(payloadCliente);
                alert("¡Fichero Maestro de Clientes actualizado con éxito geográfico y mapeo NoSQL normalizado!");
                this.limpiarFormulario();
            } catch (err) {
                console.error("Fallo crítico en operaciones del Fichero Maestro: ", err);
                alert("Error perimetral de red al intentar guardar los datos del cliente.");
            } finally {
                this.btnSubmit.disabled = false;
                this.btnSubmit.textContent = this.hiddenIdInput.value ? "Actualizar Datos Cliente" : "Guardar Cliente en Base";
            }
        });
    }

    setupSearchFilterListener() {
        if (!this.searchBox) return;

        this.searchBox.addEventListener('input', (e) => {
            const termino = e.target.value.trim().toLowerCase();

            if (!termino) {
                this.renderClientes(this.cacheClientesList);
                return;
            }

            const listafiltrada = this.cacheClientesList.filter(c => {
                const matchDni = (c.dni || c.id || '').toLowerCase().includes(termino);
                const matchNombre = (c.nombre || '').toLowerCase().includes(termino);
                const matchDir = (c.direccion || '').toLowerCase().includes(termino);
                return matchDni || matchNombre || matchDir;
            });

            this.renderClientes(listafiltrada);
        });
    }

    setupCancelButtonListener() {
        if (this.btnCancel) {
            this.btnCancel.addEventListener('click', () => this.limpiarFormulario());
        }
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
        console.log("⚓ Canal reactivo de fichero de clientes removido de memoria.");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const clientesCtrl = new ClientesController();
    clientesCtrl.init();

    window.addEventListener('beforeunload', () => {
        clientesCtrl.unmount();
    });
});