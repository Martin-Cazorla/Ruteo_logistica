// js/controllers/transporteController.js
import { db } from '../services/firebaseConfig.js';
import Sanitizer from '../utils/sanitizers.js';
import { 
    collection, 
    onSnapshot, 
    doc, 
    setDoc, 
    deleteDoc 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export class TransporteController {
    constructor() {
        this.formTransporte = document.getElementById('form-alta-transporte');
        this.flotaContainer = document.getElementById('listado-flota-maestra');
        this.searchFlotaInput = document.getElementById('search-flota');
    }

    init() {
        if (this.flotaContainer) {
            this.escucharFlotaMaestraTiempoReal();
        }
        this.setupFormListener();
    }

    /**
     * Escucha la flota total registrada en el sistema de forma asíncrona
     */
    escucharFlotaMaestraTiempoReal() {
        onSnapshot(collection(db, "flota_maestra"), (snapshot) => {
            const fleet = [];
            let htmlHTML = "";

            snapshot.forEach((docSnap) => {
                const u = docSnap.data();
                fleet.push({ interno: docSnap.id, ...u });

                htmlHTML += `
                    <div class="card-panel" style="margin-bottom:0.75rem; padding:1.25rem; flex-direction:row; justify-content:space-between; align-items:center;">
                        <div>
                            <strong style="font-size:1.1rem; color:#f8fafc;">Interno: #${Sanitizer.escapeHTML(docSnap.id)}</strong><br>
                            <span style="font-size:0.9rem; color:#94a3b8;">👨‍ <strong>Chofer:</strong> ${Sanitizer.escapeHTML(u.chofer)}</span><br>
                            <span style="font-size:0.85rem; color:#64748b;">📦 <strong>Capacidad:</strong> ${Sanitizer.escapeHTML(u.tamanio)}</span>
                            ${u.observaciones ? `<br><span style="font-size:0.8rem; color:#ef4444; display:block; margin-top:0.25rem;">🔧 <em>Reclamo/Obs: ${Sanitizer.escapeHTML(u.observaciones)}</em></span>` : ''}
                        </div>
                        <button class="btn-primary btn-delete-maestro" style="background-color:#ef4444; padding:0.4rem 0.75rem;" data-id="${docSnap.id}">Remover</button>
                    </div>
                `;
            });

            this.flotaContainer.innerHTML = htmlHTML || '<div style="color:#94a3b8; text-align:center; padding:2rem;">No hay unidades registradas en el fichero central.</div>';
            this.vincularEventosEliminarMaestro();

            // Soporte para filtrado dinámico del lado del cliente
            if (this.searchFlotaInput) {
                this.searchFlotaInput.addEventListener('input', () => {
                    const term = this.searchFlotaInput.value.toLowerCase();
                    const filtered = fleet.filter(f => f.interno.includes(term) || f.chofer.toLowerCase().includes(term));
                    this.renderFilteredFleet(filtered);
                });
            }
        });
    }

    renderFilteredFleet(fleet) {
        this.flotaContainer.innerHTML = fleet.map(f => `
            <div class="card-panel" style="margin-bottom:0.75rem; padding:1.25rem; flex-direction:row; justify-content:space-between; align-items:center;">
                <div>
                    <strong style="font-size:1.1rem; color:#f8fafc;">Interno: #${Sanitizer.escapeHTML(f.interno)}</strong><br>
                    <span style="font-size:0.9rem; color:#94a3b8;">👨‍ <strong>Chofer:</strong> ${Sanitizer.escapeHTML(f.chofer)}</span><br>
                    <span style="font-size:0.85rem; color:#64748b;">📦 <strong>Capacidad:</strong> ${Sanitizer.escapeHTML(f.tamanio)}</span>
                </div>
                <button class="btn-primary btn-delete-maestro" style="background-color:#ef4444; padding:0.4rem 0.75rem;" data-id="${f.interno}">Remover</button>
            </div>
        `).join('') || '<div style="color:#94a3b8; text-align:center; padding:2rem;">No se encontraron coincidencias.</div>';
        this.vincularEventosEliminarMaestro();
    }

    vincularEventosEliminarMaestro() {
        const botones = this.flotaContainer.querySelectorAll('.btn-delete-maestro');
        botones.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                if (confirm(`¿Desea eliminar la unidad #${id} permanentemente del Fichero Maestro? Se perderán sus datos base.`)) {
                    await deleteDoc(doc(db, "flota_maestra", id));
                }
            });
        });
    }

    setupFormListener() {
        if (!this.formTransporte) return;

        this.formTransporte.addEventListener('submit', async (e) => {
            e.preventDefault();
            const interno = document.getElementById('t-numero-unidad').value.trim();
            
            const data = {
                chofer: document.getElementById('t-nombre-chofer').value.trim(),
                tamanio: document.getElementById('t-tamanio-unidad').value,
                observaciones: document.getElementById('t-comentarios-unidad').value.trim()
            };

            try {
                // Seteamos el documento usando el número de interno como ID único
                await setDoc(doc(db, "flota_maestra", interno), data);
                this.formTransporte.reset();
                alert(`🚚 Unidad #${interno} guardada con éxito en el Fichero Central.`);
            } catch (error) {
                console.error("Fallo de inyección maestro: ", error);
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const transporteCtrl = new TransporteController();
    transporteCtrl.init();
});