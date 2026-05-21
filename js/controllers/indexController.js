// js/controllers/indexController.js
import { db } from '../services/firebaseConfig.js';
import { Sanitizer } from '../utils/sanitizers.js';
import { collection, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

class IndexController {
    constructor() {
        // Mapeo seguro de los nodos del DOM para los indicadores numéricos
        this.kpiPedidos = document.getElementById('kpi-pedidos');
        this.kpiUnidades = document.getElementById('kpi-unidades');
        this.kpiExtras = document.getElementById('kpi-extras');
        
        // Contenedor del Top 10 Clientes Críticos
        this.containerCriticos = document.getElementById('append-kpi-criticos');
        
        // Captura de la fecha actual en formato NoSQL (YYYY-MM-DD)
        this.fechaHoy = new Date().toISOString().split('T')[0];
    }

    init() {
        // Inicializamos las escuchas en tiempo real de forma independiente
        this.escucharPedidosDelDia();
        this.escucharFlotaYHorasExtras();
        this.escucharClientesCriticos();
    }

    /**
     * Monitorea la cantidad de órdenes inyectadas en la jornada actual
     */
    escucharPedidosDelDia() {
        if (!this.kpiPedidos) return;

        const q = query(collection(db, "pedidos"), where("fecha", "==", this.fechaHoy));
        
        onSnapshot(q, (snapshot) => {
            this.kpiPedidos.textContent = snapshot.size;
        }, (error) => {
            console.error("Fallo al sincronizar KPIs de pedidos:", error);
        });
    }

    /**
     * Calcula dinámicamente las unidades totales y cuántas rompieron el tope de 3 vueltas
     */
    escucharFlotaYHorasExtras() {
        if (!this.kpiUnidades || !this.kpiExtras) return;

        onSnapshot(collection(db, "unidades"), (snapshot) => {
            let totalUnidades = snapshot.size;
            let totalExtras = 0;

            snapshot.forEach((doc) => {
                const unidad = doc.data();
                // Regla de negocio: la 4ta vuelta activa automáticamente la alerta de hora extra
                if (unidad.vueltasRealizadas >= 4) {
                    totalExtras++;
                }
            });

            this.kpiUnidades.textContent = totalUnidades;
            this.kpiExtras.textContent = totalExtras;
        }, (error) => {
            console.error("Fallo al sincronizar KPIs de flota:", error);
        });
    }

    /**
     * Renderiza de forma reactiva el top de clientes preferenciales con alertas activas
     */
    escucharClientesCriticos() {
        if (!this.containerCriticos) return;

        const q = query(collection(db, "clientes"), where("critico", "==", true));

        onSnapshot(q, (snapshot) => {
            if (snapshot.size === 0) {
                this.containerCriticos.innerHTML = `
                    <p style="color: #94a3b8; text-align: center; padding: 1rem;">
                        No se registran alertas de clientes preferenciales críticas hoy.
                    </p>
                `;
                return;
            }

            let html = "";
            snapshot.forEach((docSnap) => {
                const cliente = docSnap.data();
                
                // Higienización exhaustiva de campos de texto libre contra inyecciones XSS
                const nombreSeguro = Sanitizer.escapeHTML(cliente.nombre);
                const dniSeguro = Sanitizer.escapeHTML(cliente.dni);
                const direccionSegura = Sanitizer.escapeHTML(cliente.direccion);
                const motivoSeguro = Sanitizer.escapeHTML(cliente.motivoCritico || "Alerta Logística Activa");

                html += `
                    <div class="card-panel" style="background-color: #1e293b; border-left: 4px solid #f97316; flex-direction: row; justify-content: space-between; align-items: center; padding: 1rem; gap: 1rem;">
                        <div>
                            <h4 style="margin:0; color:#f8fafc;">${nombreSeguro} (DNI: ${dniSeguro})</h4>
                            <p style="margin: 0.25rem 0 0 0; color:#94a3b8; font-size:0.85rem;">📍 ${direccionSegura}</p>
                        </div>
                        <span class="badge badge--danger" style="background-color: rgba(249, 115, 22, 0.2); color: #f97316; border-color: #f97316; white-space: nowrap;">
                            ${motivoSeguro}
                        </span>
                    </div>
                `;
            });

            this.containerCriticos.innerHTML = html;
        }, (error) => {
            console.error("Fallo al sincronizar panel de clientes críticos:", error);
        });
    }
}

// Inicialización automática al montarse el módulo en el DOM de la página principal
document.addEventListener('DOMContentLoaded', () => {
    const indexCtrl = new IndexController();
    indexCtrl.init();
});