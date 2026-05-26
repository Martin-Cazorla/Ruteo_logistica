// js/controllers/transporteController.js
import { db } from '../services/firebaseConfig.js';
import Sanitizer from '../utils/sanitizers.js';
import { 
    collection, 
    onSnapshot, 
    doc, 
    setDoc, 
    deleteDoc,
    getDoc 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export class TransporteController {
    constructor() {
        // Elementos principales del formulario operativo
        this.formTransporte = document.getElementById('form-alta-transporte');
        this.idEdicionInput = document.getElementById('t-id-edicion');
        this.internoInput = document.getElementById('t-numero-unidad');
        this.modeloInput = document.getElementById('t-modelo-unidad');
        this.choferInput = document.getElementById('t-nombre-chofer');
        this.tamanioSelect = document.getElementById('t-tamanio-unidad');
        this.observacionesInput = document.getElementById('t-comentarios-unidad');
        this.btnSubmit = document.getElementById('btn-submit-transporte');
        this.btnCancelar = document.getElementById('btn-cancelar-edicion');

        // Contenedores del visor y búsquedas
        this.flotaContainer = document.getElementById('listado-flota-maestra');
        this.searchFlotaInput = document.getElementById('search-flota');
        
        // Nodos del modal relacional de reclamos históricos
        this.modalReclamos = document.getElementById('modal-historial-reclamos');
        this.modalInternoTitulo = document.getElementById('modal-interno-titulo');
        this.modalListadoNovedades = document.getElementById('modal-listado-novedades');
        this.btnCloseModal = document.getElementById('btn-cerrar-modal-reclamos');
        
        // Memoria volátil de control
        this.flotaLocalCache = []; 
    }

    init() {
        if (this.flotaContainer) {
            this.escucharFlotaMaestraTiempoReal();
        }
        this.setupFormListener();
        this.setupSearchListener();
        this.setupModalCloseListener();
        this.setupCancelButtonListener();
    }

    escucharFlotaMaestraTiempoReal() {
        onSnapshot(collection(db, "flota_maestra"), (snapshot) => {
            this.flotaLocalCache = [];
            
            snapshot.forEach((docSnap) => {
                const u = docSnap.data();
                this.flotaLocalCache.push({
                    interno: docSnap.id,
                    modelo: u.modelo || 'S/D',
                    chofer: u.chofer || 'Sin Chofer',
                    tamanio: u.tamanio || 'No definido',
                    observaciones: u.observaciones || '',
                    historial_novedades: u.historial_novedades || []
                });
            });

            this.renderFleetList(this.flotaLocalCache);
        });
    }

    setupSearchListener() {
        if (!this.searchFlotaInput) return;
        
        this.searchFlotaInput.addEventListener('input', () => {
            const term = this.searchFlotaInput.value.toLowerCase().trim();
            
            const filtered = this.flotaLocalCache.filter(f => 
                f.interno.includes(term) || 
                f.chofer.toLowerCase().includes(term) ||
                f.modelo.toLowerCase().includes(term)
            );
            
            this.renderFleetList(filtered);
        });
    }

    renderFleetList(fleet) {
        if (!this.flotaContainer) return;

        if (fleet.length === 0) {
            this.flotaContainer.innerHTML = `
                <div style="color:#94a3b8; text-align:center; padding:2rem; font-size:0.9rem;">
                    No se encontraron unidades en el fichero central.
                </div>
            `;
            return;
        }

        this.flotaContainer.innerHTML = fleet.map(f => {
            const intSeguro = Sanitizer.escapeHTML(f.interno);
            const modSeguro = Sanitizer.escapeHTML(f.modelo);
            const choSeguro = Sanitizer.escapeHTML(f.chofer);
            const tamSeguro = Sanitizer.escapeHTML(f.tamanio);
            const obsSegura = Sanitizer.escapeHTML(f.observaciones);
            const qReclamos = f.historial_novedades.length;

            return `
                <div class="card-panel transporte-master-row" data-id="${intSeguro}">
                    <div class="info-block">
                        <strong style="font-size:1.1rem; color:#f8fafc;">Interno: #${intSeguro}</strong>
                        <span class="badge ${qReclamos > 0 ? 'badge--danger' : 'badge--success'}" style="width: max-content; font-size:0.72rem; padding: 0.15rem 0.4rem;">
                            ${qReclamos} Reclamos
                        </span>
                        <span style="font-size:0.9rem; color:#94a3b8; margin-top: 0.25rem;">📋 <strong>Modelo:</strong> ${modSeguro}</span>
                        <span style="font-size:0.9rem; color:#94a3b8;">👨‍✈️ <strong>Chofer:</strong> ${choSeguro}</span>
                        <span style="font-size:0.85rem; color:#64748b;">📦 <strong>Capacidad:</strong> ${tamSeguro}</span>
                        ${obsSegura ? `<span style="font-size:0.8rem; color:#eab308; display:block; margin-top:0.25rem;">📝 <em>Fijo: ${obsSegura}</em></span>` : ''}
                    </div>
                    <div class="actions-block">
                        <button class="btn-primary btn-edit-maestro" style="background-color:#334155; color:#38bdf8;" 
                                data-id="${intSeguro}" 
                                data-modelo="${modSeguro}" 
                                data-chofer="${choSeguro}" 
                                data-tamanio="${tamSeguro}" 
                                data-observaciones="${obsSegura}">Editar Ficha</button>
                        <button class="btn-primary btn-ver-reclamos" style="background-color:#eab308; color:#0f172a;" data-id="${intSeguro}">Ver Reclamos</button>
                        <button class="btn-primary btn-delete-maestro" style="background-color:rgba(239, 68, 68, 0.15); color:#ef4444;" data-id="${intSeguro}">Remover</button>
                    </div>
                </div>
            `;
        }).join('');

        this.vincularEventosTarjetas();
    }

    vincularEventosTarjetas() {
        // EVENTO ELIMINAR
        this.flotaContainer.querySelectorAll('.btn-delete-maestro').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                if (confirm(`¿Desea eliminar la unidad #${id} permanentemente del Fichero Maestro? Se perderán sus datos base.`)) {
                    try {
                        await deleteDoc(doc(db, "flota_maestra", id));
                        this.limpiarFormularioEdicion();
                    } catch (error) {
                        console.error("Error al borrar unidad maestro:", error);
                    }
                }
            });
        });

        // EVENTO ABRIR HISTORIAL COMPACTO DE NOVEDADES
        this.flotaContainer.querySelectorAll('.btn-ver-reclamos').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idInterno = e.target.getAttribute('data-id');
                this.abrirModalReclamos(idInterno);
            });
        });

        // MODIFICACIÓN SENIOR: CAPTURA DE ESTADO PARA EDICIÓN INLINE
        this.flotaContainer.querySelectorAll('.btn-edit-maestro').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const b = e.target;
                const id = b.getAttribute('data-id');

                // Seteamos la compuerta de edición
                this.idEdicionInput.value = id;
                this.internoInput.value = id;
                this.internoInput.disabled = true; // Bloqueado por ser clave primaria en base relacional

                this.modeloInput.value = b.getAttribute('data-modelo');
                this.choferInput.value = b.getAttribute('data-chofer');
                this.tamanioSelect.value = b.getAttribute('data-tamanio');
                this.observacionesInput.value = b.getAttribute('data-observaciones');

                this.btnSubmit.textContent = "Actualizar Ficha Unidad";
                this.btnCancelar.style.display = "inline-block";

                this.modeloInput.focus();
            });
        });
    }

    async abrirModalReclamos(interno) {
        if (!this.modalReclamos) return;

        if (this.modalInternoTitulo) this.modalInternoTitulo.textContent = interno;
        this.modalListadoNovedades.innerHTML = `<div style="color:#94a3b8; text-align:center; padding:1rem;">Buscando historial técnico...</div>`;
        
        this.modalReclamos.classList.add('open');
        this.modalReclamos.setAttribute('aria-hidden', 'false');

        try {
            const docRef = doc(db, "flota_maestra", interno);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const uData = docSnap.data();
                const notesHistorial = uData.historial_novedades || [];

                if (notesHistorial.length === 0) {
                    this.modalListadoNovedades.innerHTML = `
                        <div style="color:#22c55e; text-align:center; padding:1.5rem; font-size:0.9rem;">
                            ✅ Esta unidad no registra alertas mecánicas o reclamos en su historial.
                        </div>
                    `;
                    return;
                }

                this.modalListadoNovedades.innerHTML = notesHistorial.map(nota => `
                    <div style="background-color: rgba(239, 68, 68, 0.1); border-left: 3px solid #ef4444; padding: 0.75rem; margin-bottom: 0.5rem; border-radius: 4px; font-size: 0.85rem; color: #f8fafc; line-height:1.4;">
                        ${Sanitizer.escapeHTML(nota)}
                    </div>
                `).reverse().join('');
            }
        } catch (error) {
            console.error("Error al recuperar el historial: ", error);
            this.modalListadoNovedades.innerHTML = `<div style="color:#ef4444; padding:1rem;">Error de red al leer el historial.</div>`;
        }
    }

    setupFormListener() {
        if (!this.formTransporte) return;

        this.formTransporte.addEventListener('submit', async (e) => {
            e.preventDefault();
            const interno = this.internoInput.value.trim();
            const esEdicion = this.idEdicionInput.value !== "";
            
            // Estructura de guardado maestro
            const data = {
                modelo: this.modeloInput.value.trim(),
                chofer: this.choferInput.value.trim(),
                tamanio: this.tamanioSelect.value,
                observaciones: this.observacionesInput.value.trim()
            };

            // MODIFICACIÓN SENIOR CRÍTICA: Resguardo de arrays relacionales preexistentes
            if (!esEdicion) {
                data.historial_novedades = []; // Solo se inicializa vacío en altas nuevas
            }

            try {
                // Al usar merge:true evitamos destruir el historial de novedades si se sobreescribe el documento en edición
                await setDoc(doc(db, "flota_maestra", interno), data, { merge: true });
                
                alert(`¡Unidad #${interno} guardada con éxito en el Fichero Central!`);
                this.limpiarFormularioEdicion();
            } catch (error) {
                console.error("Fallo de inyección maestro: ", error);
                alert("Error de red al intentar persistir los datos de flota.");
            }
        });
    }

    setupModalCloseListener() {
        if (this.btnCloseModal) {
            this.btnCloseModal.addEventListener('click', () => {
                this.modalReclamos.classList.remove('open');
                this.modalReclamos.setAttribute('aria-hidden', 'true');
            });
        }

        if (this.modalReclamos) {
            this.modalReclamos.addEventListener('click', (e) => {
                if (e.target === this.modalReclamos) {
                    this.modalReclamos.classList.remove('open');
                    this.modalReclamos.setAttribute('aria-hidden', 'true');
                }
            });
        }
    }

    setupCancelButtonListener() {
        if (this.btnCancelar) {
            this.btnCancelar.addEventListener('click', () => this.limpiarFormularioEdicion());
        }
    }

    limpiarFormularioEdicion() {
        this.formTransporte.reset();
        this.idEdicionInput.value = "";
        this.internoInput.disabled = false;
        this.btnSubmit.textContent = "Guardar en Fichero Global";
        this.btnCancelar.style.display = "none";
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const transporteCtrl = new TransporteController();
    transporteCtrl.init();
});