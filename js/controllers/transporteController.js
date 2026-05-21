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
        this.flotaLocalCache = []; // Cache en memoria para búsquedas instantáneas
    }

    init() {
        if (this.flotaContainer) {
            this.escucharFlotaMaestraTiempoReal();
        }
        this.setupFormListener();
        this.setupSearchListener();
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
                    observaciones: u.observaciones || ''
                });
            });

            // Renderizamos la lista completa inicialmente
            this.renderFleetList(this.flotaLocalCache);
        });
    }

    /**
     * Inicializa el buscador reactivo del lado del cliente
     */
    setupSearchListener() {
        if (!this.searchFlotaInput) return;
        
        this.searchFlotaInput.addEventListener('input', () => {
            const term = this.searchFlotaInput.value.toLowerCase().trim();
            
            // Filtro inteligente multiplataforma (Interno, Chofer o Modelo de vehículo)
            const filtered = this.flotaLocalCache.filter(f => 
                f.interno.includes(term) || 
                f.chofer.toLowerCase().includes(term) ||
                f.modelo.toLowerCase().includes(term)
            );
            
            this.renderFleetList(filtered);
        });
    }

    /**
     * Procesa y dibuja las tarjetas operativas aplicando sanitización contra ataques XSS
     * @param {Array} fleet Lista de unidades a dibujar
     */
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

            return `
                <div class="card-panel" style="margin-bottom:0.75rem; padding:1.25rem; flex-direction:row; justify-content:space-between; align-items:center;">
                    <div>
                        <strong style="font-size:1.1rem; color:#f8fafc;">Interno: #${intSeguro}</strong><br>
                        <span style="font-size:0.9rem; color:#94a3b8;">📋 <strong>Modelo:</strong> ${modSeguro}</span><br>
                        <span style="font-size:0.9rem; color:#94a3b8;">👨‍ <strong>Chofer:</strong> ${choSeguro}</span><br>
                        <span style="font-size:0.85rem; color:#64748b;">📦 <strong>Capacidad:</strong> ${tamSeguro}</span>
                        ${obsSegura ? `<br><span style="font-size:0.8rem; color:#ef4444; display:block; margin-top:0.25rem;">🔧 <em>Obs/Reclamo: ${obsSegura}</em></span>` : ''}
                    </div>
                    <button class="btn-primary btn-delete-maestro" style="background-color:#ef4444; padding:0.4rem 0.75rem;" data-id="${intSeguro}">Remover</button>
                </div>
            `;
        }).join('');

        this.vincularEventosEliminarMaestro();
    }

    vincularEventosEliminarMaestro() {
        const botones = this.flotaContainer.querySelectorAll('.btn-delete-maestro');
        botones.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                if (confirm(`¿Desea eliminar la unidad #${id} permanentemente del Fichero Maestro? Se perderán sus datos base.`)) {
                    try {
                        await deleteDoc(doc(db, "flota_maestra", id));
                    } catch (error) {
                        console.error("Error al borrar unidad maestra:", error);
                    }
                }
            });
        });
    }

    /**
     * Controla la captura del formulario de persistencia maestra
     */
    setupFormListener() {
        if (!this.formTransporte) return;

        this.formTransporte.addEventListener('submit', async (e) => {
            e.preventDefault();
            const interno = document.getElementById('t-numero-unidad').value.trim();
            
            // Estructura de datos limpia alineada con tus requerimientos corporativos
            const data = {
                modelo: document.getElementById('t-modelo-unidad').value.trim(),
                chofer: document.getElementById('t-nombre-chofer').value.trim(),
                tamanio: document.getElementById('t-tamanio-unidad').value,
                observaciones: document.getElementById('t-comentarios-unidad').value.trim()
            };

            try {
                // Seteamos el documento usando el número de interno como ID único semántico
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