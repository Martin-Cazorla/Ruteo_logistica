// js/controllers/indexController.js
import { DatabaseService } from '../services/databaseService.js';
import { Sanitizer } from '../utils/sanitizers.js';

class IndexController {
    constructor() {
        this.kpiPedidos = document.getElementById('kpi-pedidos');
        this.kpiUnidades = document.getElementById('kpi-unidades');
        this.kpiExtras = document.getElementById('kpi-extras');
        this.containerCriticos = document.getElementById('append-kpi-criticos');
        
        this.fechaHoy = new Date().toISOString().split('T')[0];
        
        // Almacén dinámico para los recolectores de basura de Firebase (Anti-Memory Leak)
        this.tokensDesuscripcion = [];
    }

    /**
     * Inicializa las conexiones de red y mapea el ciclo de vida del componente
     */
    mount() {
        this.escucharPedidosDelDia();
        this.escucharFlotaYHorasExtras();
        this.escucharClientesCriticos();
    }

    /**
     * Desconecta todas las pasarelas WebSocket abiertas al destruir o cambiar la vista
     */
    unmount() {
        this.tokensDesuscripcion.forEach(unsub => {
            if (typeof unsub === 'function') unsub();
        });
        this.tokensDesuscripcion = [];
        console.log("⚓ Canales de tiempo real purgados correctamente de la memoria.");
    }

    escucharPedidosDelDia() {
        if (!this.kpiPedidos) return;

        const unsub = DatabaseService.subscribePedidosPorFecha(
            this.fechaHoy,
            (snapshot) => {
                this.kpiPedidos.textContent = snapshot.size;
            },
            (error) => console.error("Fallo operativo en KPI pedidos:", error)
        );

        this.tokensDesuscripcion.push(unsub);
    }

    escucharFlotaYHorasExtras() {
        if (!this.kpiUnidades || !this.kpiExtras) return;

        const unsub = DatabaseService.subscribeFlotaCompleta(
            (snapshot) => {
                let totalUnidades = snapshot.size;
                let totalExtras = 0;

                snapshot.forEach((doc) => {
                    const unidad = doc.data();
                    if (unidad.vueltasRealizadas >= 4) {
                        totalExtras++;
                    }
                });

                this.kpiUnidades.textContent = totalUnidades;
                this.kpiExtras.textContent = totalExtras;
            },
            (error) => console.error("Fallo operativo en KPI flota:", error)
        );

        this.tokensDesuscripcion.push(unsub);
    }

    escucharClientesCriticos() {
        if (!this.containerCriticos) return;

        const unsub = DatabaseService.subscribeClientesCriticos(
            (snapshot) => {
                if (snapshot.size === 0) {
                    this.containerCriticos.innerHTML = `
                        <p class="critical-client-row__empty-state">
                            No se registran alertas de clientes preferenciales críticas hoy.
                        </p>
                    `;
                    return;
                }

                let html = "";
                snapshot.forEach((docSnap) => {
                    const cliente = docSnap.data();
                    
                    const nombreSeguro = Sanitizer.escapeHTML(cliente.nombre);
                    const dniSeguro = Sanitizer.escapeHTML(cliente.dni);
                    const direccionSegura = Sanitizer.escapeHTML(cliente.direccion);
                    const motivoSeguro = Sanitizer.escapeHTML(cliente.motivoCritico || "Alerta Logística Activa");

                    html += `
                        <div class="critical-client-row">
                            <div class="critical-client-row__info">
                                <h3 class="critical-client-row__title">${nombreSeguro} (DNI: ${dniSeguro})</h3>
                                <p class="critical-client-row__meta">📍 ${direccionSegura}</p>
                            </div>
                            <span class="critical-client-row__badge">
                                ${motivoSeguro}
                            </span>
                        </div>
                    `;
                });

                this.containerCriticos.innerHTML = html;
            },
            (error) => console.error("Fallo operativo en panel crítico:", error)
        );

        this.tokensDesuscripcion.push(unsub);
    }
}

// Inicialización controlada por el DOM de la aplicación principal
document.addEventListener('DOMContentLoaded', () => {
    const indexCtrl = new IndexController();
    indexCtrl.mount();

    // Vinculamos la purga al ciclo de descarga de la ventana para evitar hilos huerfanos
    window.addEventListener('beforeunload', () => indexCtrl.unmount());
});