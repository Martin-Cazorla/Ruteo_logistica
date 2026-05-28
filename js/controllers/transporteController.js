// js/controllers/transporteController.js
import { DatabaseService } from '../services/databaseService.js';
import { Sanitizer } from '../utils/sanitizers.js';

export class TransporteController {
    constructor() {
        this.formTransporte = document.getElementById('form-alta-transporte');
        this.idEdicionInput = document.getElementById('t-id-edicion');
        this.internoInput = document.getElementById('t-numero-unidad');
        this.modeloInput = document.getElementById('t-modelo-unidad');
        this.choferInput = document.getElementById('t-nombre-chofer');
        this.tamanioSelect = document.getElementById('t-tamanio-unidad');
        this.observacionesInput = document.getElementById('t-comentarios-unidad');
        this.btnSubmit = document.getElementById('btn-submit-transporte');
        this.btnCancelar = document.getElementById('btn-cancelar-edicion');

        this.flotaContainer = document.getElementById('listado-flota-maestra');
        this.searchFlotaInput = document.getElementById('search-flota');
        
        this.modalReclamos = document.getElementById('modal-historial-reclamos');
        this.modalInternoTitulo = document.getElementById('modal-interno-titulo');
        this.modalListadoNovedades = document.getElementById('modal-listado-novedades');
        this.btnCloseModal = document.getElementById('btn-cerrar-modal-reclamos');
        
        this.flotaLocalCache = []; 
        this.unsubscribeFlota = null;
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
        this.unsubscribeFlota = DatabaseService.subscribeFlotaMaestraCentral(
            (snapshot) => {
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
            },
            (error) => console.error("Fallo perimetral en escucha maestro de flota:", error)
        );
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
                <div class="placeholder-vacio-jornada">
                    No se encontraron unidades en el fichero central de flota.
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
                <div class="transporte-master-row" data-id="${intSeguro}">
                    <div class="transporte-master-row__info-block">
                        <strong class="transporte-master-row__interno">Interno: #${intSeguro}</strong>
                        <span class="badge ${qReclamos > 0 ? 'badge--danger' : 'badge--success'}" style="width: max-content;">
                            ${qReclamos} Reclamos Reportados
                        </span>
                        <span class="transporte-master-row__meta">📋 <strong>Modelo:</strong> ${modSeguro}</span>
                        <span class="transporte-master-row__meta">👨‍✈️ <strong>Chofer:</strong> ${choSeguro}</span>
                        <span class="transporte-master-row__capacity">Box: ${tamSeguro}</span>
                        ${obsSegura ? `<span class="transporte-master-row__notes-preview">📝 Fijo: ${obsSegura}</span>` : ''}
                    </div>
                    <div class="transporte-master-row__actions-block">
                        <button class="btn-primary btn-edit-maestro" style="background-color: #334155; color: #38bdf8;" 
                                data-id="${intSeguro}" 
                                data-modelo="${modSeguro}" 
                                data-chofer="${choSeguro}" 
                                data-tamanio="${tamSeguro}" 
                                data-observaciones="${obsSegura}">Editar Ficha</button>
                        <button class="btn-primary btn-ver-reclamos" style="background-color: #eab308; color: #0f172a;" data-id="${intSeguro}">Ver Reclamos</button>
                        <button class="btn-primary btn-delete-maestro" style="background-color: rgba(239, 68, 68, 0.15); color: #ef4444;" data-id="${intSeguro}">Remover</button>
                    </div>
                </div>
            `;
        }).join('');

        this.vincularEventosTarjetas();
    }

    vincularEventosTarjetas() {
        this.flotaContainer.querySelectorAll('.btn-delete-maestro').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                if (confirm(`¿Desea eliminar la unidad #${id} permanentemente del Fichero Maestro? Se perderán sus datos base.`)) {
                    await DatabaseService.eliminarUnidadMaestra(id);
                    this.limpiarFormularioEdicion();
                }
            });
        });

        this.flotaContainer.querySelectorAll('.btn-ver-reclamos').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idInterno = e.target.getAttribute('data-id');
                this.abrirModalReclamos(idInterno);
            });
        });

        this.flotaContainer.querySelectorAll('.btn-edit-maestro').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const b = e.target;
                const id = b.getAttribute('data-id');

                this.idEdicionInput.value = id;
                this.internoInput.value = id;
                this.internoInput.disabled = true; 

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
        this.modalListadoNovedades.innerHTML = `<div class="modal-listado-novedades__item" style="border:none; text-align:center;">Buscando historial técnico central...</div>`;
        
        this.modalReclamos.classList.add('open');
        this.modalReclamos.setAttribute('aria-hidden', 'false');

        try {
            const docSnap = await DatabaseService.obtainUnidadMaestraPorId(interno);

            if (docSnap && docSnap.exists()) {
                const uData = docSnap.data();
                const notesHistorial = uData.historial_novedades || [];

                if (notesHistorial.length === 0) {
                    this.modalListadoNovedades.innerHTML = `
                        <div class="modal-listado-novedades__item--empty">
                            ✅ Esta unidad no registra alertas mecánicas o reclamos en su historial.
                        </div>
                    `;
                    return;
                }

                this.modalListadoNovedades.innerHTML = notesHistorial.map(nota => `
                    <div class="modal-listado-novedades__item">
                        ${Sanitizer.escapeHTML(nota)}
                    </div>
                `).reverse().join('');
            }
        } catch (error) {
            console.error("Error al recuperar el historial técnico:", error);
            this.modalListadoNovedades.innerHTML = `<div class="modal-listado-novedades__item" style="color:#ef4444;">Error de red al leer el historial.</div>`;
        }
    }

    setupFormListener() {
        if (!this.formTransporte) return;

        this.formTransporte.addEventListener('submit', async (e) => {
            e.preventDefault();
            const interno = this.internoInput.value.trim();
            const esEdicion = this.idEdicionInput.value !== "";
            
            const data = {
                modelo: this.modeloInput.value.trim(),
                chofer: this.choferInput.value.trim(),
                tamanio: this.tamanioSelect.value,
                observaciones: this.observacionesInput.value.trim()
            };

            if (!esEdicion) {
                data.historial_novedades = []; 
            }

            try {
                await DatabaseService.actualizarUnidadMaestra(interno, data);
                alert(`¡Unidad #${interno} guardada con éxito en el Fichero Central de Flotas!`);
                this.limpiarFormularioEdicion();
            } catch (error) {
                console.error("Fallo de inyección maestro de camiones:", error);
                alert("Error perimetral de red al intentar persistir los datos de flota.");
            }
        });
    }

    setupModalCloseListener() {
        const cerrar = () => {
            if (this.modalReclamos) {
                this.modalReclamos.classList.remove('open');
                this.modalReclamos.setAttribute('aria-hidden', 'true');
            }
        };

        if (this.btnCloseModal) this.btnCloseModal.addEventListener('click', cerrar);
        if (this.modalReclamos) {
            this.modalReclamos.addEventListener('click', (e) => {
                if (e.target === this.modalReclamos) cerrar();
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

    unmount() {
        if (typeof this.unsubscribeFlota === 'function') this.unsubscribeFlota();
        console.log("⚓ Canal de observadores de flota purgado.");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const transporteCtrl = new TransporteController();
    transporteCtrl.init();

    window.addEventListener('beforeunload', () => {
        transporteCtrl.unmount();
    });
});