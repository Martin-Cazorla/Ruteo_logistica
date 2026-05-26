// js/controllers/clientesController.js
import { db } from '../services/firebaseConfig.js';
import Sanitizer from '../utils/sanitizers.js';
import { 
    collection, 
    onSnapshot, 
    query, 
    doc, 
    deleteDoc, 
    setDoc
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

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

        const q = query(collection(db, "clientes"));

        this.unsubscribeClientes = onSnapshot(q, (snapshot) => {
            this.cacheClientesList = [];
            
            snapshot.forEach(docSnap => {
                this.cacheClientesList.push({
                    id: docSnap.id,
                    ...docSnap.data()
                });
            });

            this.renderClientes(this.cacheClientesList);
        });
    }

    renderClientes(lista) {
        if (lista.length === 0) {
            this.listadoContainer.innerHTML = `
                <div class="placeholder-vacio-jornada">
                    No se encontraron registros de clientes en el Fichero Maestro.
                </div>`;
            return;
        }

        this.listadoContainer.innerHTML = lista.map(c => {
            const idSeguro = Sanitizer.escapeHTML(c.id);
            const dniSeguro = Sanitizer.escapeHTML(c.dni);
            const nomSeguro = Sanitizer.escapeHTML(c.nombre);
            const telSeguro = Sanitizer.escapeHTML(c.telefono);
            const dirSeguro = Sanitizer.escapeHTML(c.direccion);

            const esPremium = !!c.isPremium;
            const esCritico = !!c.isCritico;

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
                    await deleteDoc(doc(db, "clientes", id));
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

    // ==========================================================================
    // GEOCALIZADOR ASÍNCRONO INTEGRADO PARA EL FICHERO DE CLIENTES
    // ==========================================================================
    async _obtenerCoordenadasAsync(direccionTexto) {
        if (!direccionTexto) return { latitud: -34.4824, longitud: -58.5032 };
        
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
                        latitud: parseFloat(dataJson[0].lat),
                        longitud: parseFloat(dataJson[0].lon)
                    };
                }
            }
        } catch (err) {
            console.warn("Fallo de red o CORS en Nominatim para Clientes. Aplicando aproximación.");
        }

        // Si falla, dispersa sutilmente para que Villa Astolfi o Martínez no colisionen en el mismo píxel
        const desvio = (Math.random() - 0.5) * 0.01;
        const esPilar = queryLimpia.toLowerCase().includes("astolfi") || queryLimpia.toLowerCase().includes("pilar");
        return {
            latitud: (esPilar ? -34.4883 : -34.4824) + desvio,
            longitud: (esPilar ? -58.8514 : -58.5032) + desvio
        };
    }

    setupFormSubmitListener() {
        this.formCliente.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Deshabilitamos el botón temporalmente para evitar doble click y escrituras duplicadas
            this.btnSubmit.disabled = true;
            this.btnSubmit.textContent = "Procesando coordenadas logísticas...";

            const dniDocumento = this.dniInput.value.trim();
            const direccionTexto = this.direccionInput.value.trim();

            // Disparador asíncrono para inyectar latitud y longitud reales al guardar
            const geoResult = await this._obtenerCoordenadasAsync(direccionTexto);

            const payloadData = {
                dni: dniDocumento,
                nombre: this.nombreInput.value.trim().toUpperCase(),
                telefono: this.telefonoInput.value.trim(),
                direccion: direccionTexto,
                latitud: geoResult.latitud,   // 👈 Guardado plano exacto como lo muestra tu image_cf34e0.png
                longitud: geoResult.longitud, // 👈 Guardado plano exacto como lo muestra tu image_cf34e0.png
                isPremium: this.checkPremium.checked,
                isCritico: this.checkCritico.checked
            };

            try {
                // REQUISITO INDUSTRIAL: Usamos setDoc con el DNI como ID de documento de forma estricta.
                // Esto unifica el comportamiento y evita registros huérfanos duplicados con IDs aleatorios de Firebase.
                const clienteRef = doc(db, "clientes", dniDocumento);
                await setDoc(clienteRef, payloadData, { merge: true });

                alert("¡Fichero Maestro de Clientes actualizado con éxito geográfico!");
                this.limpiarFormulario();
            } catch (err) {
                console.error("Fallo crítico en operaciones del Fichero Maestro: ", err);
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
                const matchDni = (c.dni || '').toLowerCase().includes(termino);
                const matchNombre = (c.nombre || '').toLowerCase().includes(termino);
                const matchDir = (c.direccion || '').toLowerCase().includes(termino);
                return matchDni || matchNombre || matchDir;
            });

            this.renderClientes(listafiltrada);
        });
    }

    setupCancelButtonListener() {
        this.btnCancel.addEventListener('click', () => this.limpiarFormulario());
    }

    limpiarFormulario() {
        this.formCliente.reset();
        this.hiddenIdInput.value = "";
        this.checkPremium.checked = false;
        this.checkCritico.checked = false;
        this.btnSubmit.textContent = "Guardar Cliente en Base";
        this.btnCancel.style.display = "none";
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const clientesCtrl = new ClientesController();
    clientesCtrl.init();
});