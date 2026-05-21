// js/state/store.js

/**
 * Single Source of Truth para la sesión logística de Martinez Routing.
 */
class LogisticaStore {
    constructor() {
        this._state = {
            pedidos: [],
            unidades: [],
            rutas: [],
            filtros: {
                fecha: new Date().toISOString().split('T')[0],
                franjaHoraria: 'all'
            }
        };
        this._listeners = [];
    }

    getState() {
        return this._state;
    }

    setState(newState) {
        // Aseguramos que la estructura base no se barra al mutar el estado secundario
        this._state = { 
            pedidos: newState.pedidos || [],
            unidades: newState.unidades || [],
            rutas: newState.rutas || [],
            filtros: newState.filtros || { fecha: new Date().toISOString().split('T')[0], franjaHoraria: 'all' }
        };
        this._listeners.forEach(listener => listener(this._state));
    }

    subscribe(listener) {
        this._listeners.push(listener);
        return () => {
            this._listeners = this._listeners.filter(l => l !== listener);
        };
    }
}

// Inicializamos la instancia única del almacén operativo
const store = new LogisticaStore();

// Exportación por defecto nativa ES6
export default store;