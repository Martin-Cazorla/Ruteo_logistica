// js/services/databaseService.js
import { db } from './firebaseConfig.js';
import { 
    collection, 
    doc, 
    setDoc, 
    writeBatch 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const DatabaseService = {
    /**
     * Guarda o actualiza un cliente en la base de datos de forma manual.
     * @param {Object} cliente Datos estructurados del cliente
     */
    async guardarCliente(cliente) {
        if (!cliente.dni) throw new Error("El DNI del cliente es obligatorio.");
        
        // Usamos el DNI como ID de documento para evitar duplicados
        const clienteRef = doc(db, "clientes", String(cliente.dni).trim());
        
        await setDoc(clienteRef, {
            dni: String(cliente.dni).trim(),
            nombre: cliente.nombre.toUpperCase(),
            direccion: cliente.direccion,
            coordenadas: {
                lat: parseFloat(cliente.coordenadas.lat),
                lng: parseFloat(cliente.coordenadas.lng)
            },
            critico: cliente.critico || false,
            motivoCritico: cliente.motivoCritico || "",
            historialReclamos: cliente.historialReclamos || []
        }, { merge: true }); // Merge evita pisar el historial de reclamos si ya existía
    },

    /**
     * Carga masiva de pedidos utilizando WriteBatch para mitigar costos y asegurar atomicidad.
     * Soporta el alto volumen de 200+ transacciones diarias en un solo viaje de red por lote.
     * @param {Array} listaPedidos Array de objetos de pedidos formateados
     */
    async guardarPedidosMasivos(listaPedidos) {
        const batch = writeBatch(db);
        
        listaPedidos.forEach(pedido => {
            // Generamos una referencia con ID automático para cada pedido
            const pedidoRef = doc(collection(db, "pedidos"));
            
            batch.set(pedidoRef, {
                idPedido: pedido.idPedido,
                numeroPedido: pedido.numeroPedido,
                clienteDni: pedido.clienteDni,
                clienteNombre: pedido.clienteNombre,
                direccion: pedido.direccion,
                fecha: pedido.fecha,
                franjaHoraria: pedido.franjaHoraria, // Calculada dinámicamente
                importe: parseFloat(pedido.importe),
                estadoRuta: "unassigned", // Todo pedido de Jumbo inicia huérfano de ruta
                coordenadas: pedido.coordenadas // Objeto {lat, lng} devuelto por el geocodificador
            });
        });

        // Se ejecutan todas las inserciones de forma simultánea en la nube
        await batch.commit();
    }
};