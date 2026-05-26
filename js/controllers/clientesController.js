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
        // Elementos del formulario reactivo
        this.formCliente = document.getElementById('form-cliente-operativo');
        this.hiddenIdInput = document.getElementById('cliente-id-hidden');
        this.dniInput = document.getElementById('c-dni');
        this.nombreInput = document.getElementById('c-nombre');
        this.telefonoInput = document.getElementById('c-telefono');
        this.direccionInput = document.getElementById('c-direccion');
        this.btnSubmit = document.getElementById('btn-guardar-cliente');
        this.btnCancel = document.getElementById('btn-cancelar-edicion');

        // Elementos del visor del fichero
        this.searchBox = document.getElementById('search-cliente');
        this.listadoContainer = document.getElementById('listado-master-clientes');

        // Estados volátiles de control interno
        this.unsubscribeClientes = null;
        this.cacheClientesList = []; // Copia local para filtros rápidos sin re-consultar la red
    }

    init() {
        this.setupFormSubmitListener();
        this.setupSearchFilterListener();
        this.setupCancelButtonListener();
        this.escucharFicheroClientes();
    }

    escucharFicheroClientes() {
        if (!this.listadoContainer) return;

        // Escucha activa en tiempo real sobre la colección raíz de clientes
        const q = query(collection(db, "clientes"));

        this.unsubscribeClientes = onSnapshot(q, (snapshot) => {
            this.cacheClientesList = [];
            
            snapshot.forEach(docSnap => {
                this.cacheClientesList.push({
                    id: docSnap.id,
                    ...docSnap.data()
                });
            });

            // Renderizado inicial con la lista limpia devuelta por Firestore
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

        // Mapeo seguro utilizando sanitización estricta anti-XSS
        this.listadoContainer.innerHTML = lista.map(c => {
            const idSeguro = Sanitizer.escapeHTML(c.id);
            const dniSeguro = Sanitizer.escapeHTML(c.dni);
            const nomSeguro = Sanitizer.escapeHTML(c.nombre);
            const telSeguro = Sanitizer.escapeHTML(c.telefono);
            const dirSeguro = Sanitizer.escapeHTML(c.direccion);

            return `
                <div class="card-panel cliente-item-row" data-id="${idSeguro}">
                    <div class="cliente-data-info">
                        <span class="cliente-name-title">${nomSeguro}</span>
                        <span class="cliente-sub-text">DNI: <strong>${dniSeguro}</strong> | Tel: ${telSeguro}</span>
                        <span class="cliente-sub-text">Dir: <em>${dirSeguro}</em></span>
                    </div>
                    <div class="cliente-actions-trigger">
                        <button class="btn-edit-inline" data-id="${idSeguro}" data-dni="${dniSeguro}" data-nombre="${nomSeguro}" data-telefono="${telSeguro}" data-direccion="${dirSeguro}">Editar</button>
                        <button class="btn-delete-inline" data-id="${idSeguro}">Remover</button>
                    </div>
                </div>
            `;
        }).join('');

        this.vincularEventosInteractivosFichero();
    }

    vincularEventosInteractivosFichero() {
        // Manejador reactivo para eliminación física de registros
        this.listadoContainer.querySelectorAll('.btn-delete-inline').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                if (confirm("⚠️ ¿Dar de baja definitiva a este cliente de la base de datos maestro?")) {
                    await deleteDoc(doc(db, "clientes", id));
                    this.limpiarFormulario(); // Si justo lo estaba editando, limpia el estado
                }
            });
        });

        // Manejador reactivo para subida de datos al formulario (Modo Edición)
        this.listadoContainer.querySelectorAll('.btn-edit-inline').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const b = e.target;
                
                // Cargamos el estado volátil en el DOM
                this.hiddenIdInput.value = b.getAttribute('data-id');
                this.dniInput.value = b.getAttribute('data-dni');
                this.nombreInput.value = b.getAttribute('data-nombre');
                this.telefonoInput.value = b.getAttribute('data-telefono');
                this.direccionInput.value = b.getAttribute('data-direccion');

                // Cambio estético del botón de control para reflejar edición
                this.btnSubmit.textContent = "Actualizar Datos Cliente";
                this.btnCancel.style.display = "inline-block";
                
                // Foco de accesibilidad directo al input de inicio
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
                direccion: this.direccionInput.value.trim()
            };

            try {
                if (clienteId) {
                    // MODO EDICIÓN: Actualización dirigida sobre el ID existente
                    await updateDoc(doc(db, "clientes", clienteId), payloadData);
                    alert("¡Registro de cliente actualizado correctamente!");
                } else {
                    // MODO ALTA: Inyección de nuevo documento en la colección raíz
                    await addDoc(collection(db, "clientes"), payloadData);
                    alert("¡Nuevo cliente registrado con éxito en el Fichero Maestro!");
                }

                this.limpiarFormulario();
            } catch (err) {
                console.error("Fallo crítico en operaciones del Fichero Maestro: ", err);
            }
        });
    }

    setupSearchFilterListener() {
        if (!this.searchBox) return;

        // Filtro local inmediato para una experiencia de usuario ultra veloz sin latencia de red
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
        this.btnSubmit.textContent = "Guardar Cliente en Base";
        this.btnCancel.style.display = "none";
    }
}

// Inicialización automática al cargar la vista
document.addEventListener('DOMContentLoaded', () => {
    const clientesCtrl = new ClientesController();
    clientesCtrl.init();
});