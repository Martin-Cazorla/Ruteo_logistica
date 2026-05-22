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
        this.formTransporte = document.getElementById('form-alta-transporte');
        this.flotaContainer = document.getElementById('listado-flota-maestra');
        this.searchFlotaInput = document.getElementById('search-flota');
        
        // Elementos asociados al modal de reclamos históricos
        this.modalReclamos = document.getElementById('modal-historial-reclamos');
        this.modalInternoTitulo = document.getElementById('modal-interno-titulo');
        this.modalListadoNovedades = document.getElementById('modal-listado-novedades');
        this.btnCloseModal = document.getElementById('btn-cerrar-modal-reclamos');
        
        this.flotaLocalCache = []; 
    }

    init() {
        if (this.flotaContainer) {
            this.escucharFlotaMaestraTiempoReal();
        }
        this.setupFormListener();
        this.setupSearchListener();
        this.setupModalCloseListener();
    }

    /**
     * Establece el canal de escucha en tiempo real con la colección persistente en Firestore
     */
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
                    historial_novedades: u.historial_novedades || [] // Recupera la lista de novedades relacionales
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
            
            // Calculamos cuántos reclamos acumulados tiene el camión
            const qReclamos = f.historial_novedades.length;

            return `
                <div class="card-panel" style="margin-bottom:0.75rem; padding:1.25rem; flex-direction:row; justify-content:space-between; align-items:center;">
                    <div>
                        <strong style="font-size:1.1rem; color:#f8fafc;">Interno: #${intSeguro}</strong>
                        <span class="badge ${qReclamos > 0 ? 'badge--danger' : 'badge--success'}" style="margin-left:0.5rem; font-size:0.75rem;">
                            ${qReclamos} Reclamos
                        </span>
                        <br>
                        <span style="font-size:0.9rem; color:#94a3b8;">📋 <strong>Modelo:</strong> ${modSeguro}</span><br>
                        <span style="font-size:0.9rem; color:#94a3b8;">👨‍ <strong>Chofer:</strong> ${choSeguro}</span><br>
                        <span style="font-size:0.85rem; color:#64748b;">📦 <strong>Capacidad:</strong> ${tamSeguro}</span>
                        ${obsSegura ? `<br><span style="font-size:0.8rem; color:#eab308; display:block; margin-top:0.25rem;">📝 <em>Fijo: ${obsSegura}</em></span>` : ''}
                    </div>
                    <div style="display:flex; flex-direction:column; gap:0.5rem;">
                        <button class="btn-primary btn-ver-reclamos" style="background-color:#eab308; padding:0.4rem 0.75rem; font-size:0.85rem;" data-id="${intSeguro}">Ver Reclamos</button>
                        <button class="btn-primary btn-delete-maestro" style="background-color:#ef4444; padding:0.4rem 0.75rem; font-size:0.85rem;" data-id="${intSeguro}">Remover</button>
                    </div>
                </div>
            `;
        }).join('');

        this.vincularEventosTarjetas();
    }

    vincularEventosTarjetas() {
        // Evento de eliminación maestro
        this.flotaContainer.querySelectorAll('.btn-delete-maestro').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                if (confirm(`¿Desea eliminar la unidad #${id} permanentemente del Fichero Maestro? Se perderán sus datos base.`)) {
                    try {
                        await deleteDoc(doc(db, "flota_maestra", id));
                    } catch (error) {
                        console.error("Error al borrar unidad maestro:", error);
                    }
                }
            });
        });

        // MODIFICADO SENIOR: Evento para abrir el popup relacional de novedades
        this.flotaContainer.querySelectorAll('.btn-ver-reclamos').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idInterno = e.target.getAttribute('data-id');
                this.abrirModalReclamos(idInterno);
            });
        });
    }

    /**
     * Consulta el historial del documento y despliega el modal flotante
     */
    async abrirModalReclamos(interno) {
        if (!this.modalReclamos) return;

        if (this.modalInternoTitulo) this.modalInternoTitulo.textContent = interno;
        this.modalListadoNovedades.innerHTML = `<div style="color:#94a3b8; text-align:center; padding:1rem;">Buscando historial técnico...</div>`;
        
        // Desplegar modal usando tu clase de SASS components/modals
        this.modalReclamos.classList.add('open');
        this.modalReclamos.setAttribute('aria-hidden', 'false');

        try {
            const docRef = doc(db, "flota_maestra", interno);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const uData = docSnap.data();
                const notasHistorial = uData.historial_novedades || [];

                if (notasHistorial.length === 0) {
                    this.modalListadoNovedades.innerHTML = `
                        <div style="color:#22c55e; text-align:center; padding:1.5rem; font-size:0.9rem;">
                            ✅ Esta unidad no registra alertas mecánicas en su historial corporativo.
                        </div>
                    `;
                    return;
                }

                // Renderizamos las alertas ordenadas de forma descendente (las más recientes arriba)
                this.modalListadoNovedades.innerHTML =  notasHistorial.map(nota => `
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

    setupModalCloseListener() {
        if (this.btnCloseModal) {
            this.btnCloseModal.addEventListener('click', () => {
                if (this.modalReclamos) {
                    this.modalReclamos.classList.remove('open');
                    this.modalReclamos.setAttribute('aria-hidden', 'true');
                }
            });
        }

        // Cierre alternativo al hacer clic sobre el overlay oscuro exterior
        if (this.modalReclamos) {
            this.modalReclamos.addEventListener('click', (e) => {
                if (e.target === this.modalReclamos) {
                    this.modalReclamos.classList.remove('open');
                    this.modalReclamos.setAttribute('aria-hidden', 'true');
                }
            });
        }
    }

    setupFormListener() {
        if (!this.formTransporte) return;

        this.formTransporte.addEventListener('submit', async (e) => {
            e.preventDefault();
            const interno = document.getElementById('t-numero-unidad').value.trim();
            
            const data = {
                modelo: document.getElementById('t-modelo-unidad').value.trim(),
                chofer: document.getElementById('t-nombre-chofer').value.trim(),
                tamanio: document.getElementById('t-tamanio-unidad').value,
                observaciones: document.getElementById('t-comentarios-unidad').value.trim(),
                historial_novedades: [] // Inicializamos el array de control vacío al dar de alta
            };

            try {
                await setDoc(doc(db, "flota_maestra", interno), data);
                this.formTransporte.reset();
                alert(`条 Unidad #${interno} guardada con éxito en el Fichero Central.`);
            } catch (error) {
                console.error("Fallo de inyección maestro: ", error);
                alert("Error de red al intentar persistir los datos de flota.");
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const transporteCtrl = new TransporteController();
    transporteCtrl.init();
});