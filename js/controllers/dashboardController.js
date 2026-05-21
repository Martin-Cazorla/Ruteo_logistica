// js/controllers/dashboardController.js
import { db } from '../services/firebaseConfig.js';
import { ExcelParser } from '../modules/excelParser.js';
import { DatabaseService } from '../services/databaseService.js';
import { 
    collection, 
    onSnapshot, 
    doc, 
    deleteDoc 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export class DashboardController {
    constructor() {
        // Referencias a los elementos del DOM de Unidades
        this.unidadesContainer = document.getElementById('unidades-grid');
        this.countTotal = document.getElementById('count-total');
        this.countDisp = document.getElementById('count-disp');
        this.countExtra = document.getElementById('count-extra');

        // Referencias a los elementos del DOM del Importador de Jumbo
        this.excelInput = document.getElementById('excel-file');
        this.fileNameDisplay = document.getElementById('file-name-display');
        this.btnProcesar = document.getElementById('btn-procesar-carga');

        // Estado local temporal para la carga del Excel
        this.pedidosCargados = [];
    }

    /**
     * Punto de entrada único para inicializar la vista del Dashboard
     */
    init() {
        // 1. Inicializar escucha en tiempo real de la flota (Firestore)
        if (this.unidadesContainer) {
            this.escucharUnidadesTiempoReal();
        }

        // 2. Inicializar escuchadores de eventos para el Excel de Jumbo
        if (this.excelInput && this.btnProcesar) {
            this.setupExcelEventListeners();
        }
    }

    /**
     * Sincroniza las tarjetas de unidades y contadores analíticos en tiempo real
     */
    escucharUnidadesTiempoReal() {
        onSnapshot(collection(db, "unidades"), (snapshot) => {
            let total = 0;
            let disponibles = 0;
            let extras = 0;
            let htmlHTML = "";

            snapshot.forEach((docSnap) => {
                const unidad = docSnap.data();
                const id = docSnap.id;
                total++;

                // Lógica de negocio para horas extras (Tope 3 vueltas)
                if (unidad.vueltasRealizadas >= 4) {
                    extras++;
                } else if (unidad.estado === "disponible") {
                    disponibles++;
                }

                htmlHTML += this.crearTemplateTarjeta(id, unidad);
            });

            this.unidadesContainer.innerHTML = htmlHTML;
            this.actualizarContadoresUI(total, disponibles, extras);
            this.vincularEventosEliminar();
        });
    }

    crearTemplateTarjeta(id, unidad) {
        const esExtra = unidad.vueltasRealizadas >= 4;
        const tieneCampo = unidad.alertaCampo ? 'card-unidad__field-alert--active' : '';

        return `
            <article class="card-unidad" data-id="${id}" aria-label="Unidad ${id}">
                <div class="card-unidad__header">
                    <div class="card-unidad__id">Unidad: <strong>${id}</strong></div>
                    <div class="card-unidad__badge card-unidad__badge--10hs">Ingreso: ${unidad.ingreso}</div>
                </div>
                <div class="card-unidad__body">
                    <p class="card-unidad__driver"><strong>Chofer:</strong> ${unidad.chofer}</p>
                    <p class="card-unidad__size"><strong>Tamaño:</strong> ${unidad.tamanio}</p>
                    <div class="card-unidad__field-alert ${tieneCampo}" role="alert">
                        ⚠️ Unidad en Campo (Alerta Activa)
                    </div>
                    <div class="card-unidad__counter-section">
                        <span class="counter-label">Vueltas Realizadas:</span>
                        <div class="counter-display">
                            <span class="counter-number">${unidad.vueltasRealizadas}</span>
                            ${esExtra ? '<span class="badge-extra-alert">¡EXTRA ACTIVADO!</span>' : ''}
                        </div>
                    </div>
                </div>
                <footer class="card-unidad__footer">
                    <button class="btn-delete-unidad" data-id="${id}">Eliminar Unidad</button>
                </footer>
            </article>
        `;
    }

    actualizarContadoresUI(total, disp, ext) {
        if (this.countTotal) this.countTotal.textContent = total;
        if (this.countDisp) this.countDisp.textContent = disp;
        if (this.countExtra) this.countExtra.textContent = ext;
    }

    vincularEventosEliminar() {
        const botones = this.unidadesContainer.querySelectorAll('.btn-delete-unidad');
        botones.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const idUnidad = e.target.getAttribute('data-id');
                if (confirm(`¿Está seguro de que desea remover la unidad ${idUnidad}?`)) {
                    try {
                        await deleteDoc(doc(db, "unidades", idUnidad));
                    } catch (error) {
                        alert("Error de permisos en Firebase.");
                    }
                }
            });
        });
    }

    /**
     * Centraliza los listeners de interacción del archivo Excel de Jumbo
     */
    setupExcelEventListeners() {
        // Escuchar cuando el usuario selecciona un archivo
        this.excelInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            this.fileNameDisplay.textContent = file.name;
            try {
                // Parseo asíncrono usando nuestro módulo
                this.pedidosCargados = await ExcelParser.importarPedidoJumbo(file);
                this.btnProcesar.disabled = false;
                alert(`Planilla de Jumbo procesada con éxito. ${this.pedidosCargados.length} pedidos estructurados en memoria.`);
            } catch (err) {
                alert(err.message);
                this.fileNameDisplay.textContent = "Error en el formato del archivo.";
                this.btnProcesar.disabled = true;
                this.pedidosCargados = [];
            }
        });

        // Escuchar el clic del botón para subir a Firestore
        this.btnProcesar.addEventListener('click', async () => {
            if (this.pedidosCargados.length === 0) return;
            
            try {
                this.btnProcesar.disabled = true;
                // Inyección masiva atomizada por lotes (WriteBatch)
                await DatabaseService.guardarPedidosMasivos(this.pedidosCargados);
                
                alert("¡Proceso Finalizado! Los lotes de pedidos se han impactado en Firestore sin conflictos de red.");
                
                // Resetear interfaz e inventario local
                this.pedidosCargados = [];
                this.excelInput.value = "";
                this.fileNameDisplay.textContent = "Ningún archivo seleccionado";
            } catch (error) {
                alert("Fallo crítico de escritura en Firebase: " + error.message);
                this.btnProcesar.disabled = false;
            }
        });
    }
}

// Auto-ejecución automática al mapearse el script en el DOM del HTML
document.addEventListener('DOMContentLoaded', () => {
    const dashboardCtrl = new DashboardController();
    dashboardCtrl.init();
});