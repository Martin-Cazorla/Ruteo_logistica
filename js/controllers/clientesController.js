// js/controllers/clientesController.js
import { db } from '../services/firebaseConfig.js';
import Sanitizer from '../utils/sanitizers.js';
import { 
    collection, 
    onSnapshot, 
    query, 
    addDoc, 
    doc, 
    deleteDoc, 
    updateDoc 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export class ClientesController {
    constructor() {
        this.formCliente = document.getElementById('form-cliente-operativo');
        this.hiddenIdInput = document.getElementById('cliente-id-hidden');
        this.dniInput = document.getElementById('c-dni');
        this.nombreInput = document.getElementById('c-nombre');
        this.telefonoInput = document.getElementById('c-telefono');
        this.direccionInput = document.getElementById('c-direccion');
        
        // INPUTS BOOLEANOS DE HISTORIAL TÁCTICO
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

            // Resguardo estricto ante valores nulos o indefinidos de la base de datos
            const esPremium = !!c.isPremium;
            const esCritico = !!c.isCritico;

            // DETERMINACIÓN EN CALIENTE DE CLASES CSS DE SEGMENTACIÓN VISUAL
            let claseVarianteTarjeta = "";
            if (esCritico) claseVarianteTarjeta += " cliente-item-row--critico";
            if (esPremium) claseVarianteTarjeta += " cliente-item-row--premium";

            // Inyección condicional de badges de texto compactos
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

                // Mapeo inverso de los checkboxes booleanos al entrar en edición
                this.checkPremium.checked = b.getAttribute('data-premium') === 'true';
                this.checkCritico.checked = b.getAttribute('data-critico') === 'true';

                this.btnSubmit.textContent = "Actualizar Datos Cliente";
                this.btnCancel.style.display = "inline-block";
                
                this.nombreInput.focus();
            });
        });
    }

    setupFormSubmitListener() {
        this.formCliente.addEventListener('submit', async (e) => {
            e.preventDefault();

            const clienteId = this.hiddenIdInput.value;
            const payloadData = {
                dni: this.dniInput.value.trim(),
                nombre: this.nombreInput.value.trim(),
                telefono: this.telefonoInput.value.trim(),
                direccion: this.direccionInput.value.trim(),
                isPremium: this.checkPremium.checked,
                isCritico: this.checkCritico.checked
            };

            try {
                if (clienteId) {
                    await updateDoc(doc(db, "clientes", clienteId), payloadData);
                    alert("¡Registro de cliente actualizado con segmentación operativa!");
                } else {
                    await addDoc(collection(db, "clientes"), payloadData);
                    alert("¡Nuevo cliente registrado con éxito con perfil logístico!");
                }

                this.limpiarFormulario();
            } catch (err) {
                console.error("Fallo crítico en operaciones del Fichero Maestro: ", err);
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

            const listaFiltrada = this.cacheClientesList.filter(c => {
                const matchDni = (c.dni || '').toLowerCase().includes(termino);
                const matchNombre = (c.nombre || '').toLowerCase().includes(termino);
                const matchDir = (c.direccion || '').toLowerCase().includes(termino);
                return matchDni || matchNombre || matchDir;
            });

            this.renderClientes(listaFiltrada);
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