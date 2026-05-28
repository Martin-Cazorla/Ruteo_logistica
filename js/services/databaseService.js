// js/services/databaseService.js
import { db } from './firebaseConfig.js';
import { 
    collection, 
    doc, 
    setDoc, 
    addDoc,
    deleteDoc,
    updateDoc,
    getDoc,
    getDocs,
    writeBatch,
    onSnapshot,
    query,
    where
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export class DatabaseService {
    /**
     * Guarda o actualiza un cliente en la base de datos utilizando merge estructurado.
     * @param {Object} cliente Datos centralizados del cliente a persistir
     */
    static async guardarCliente(cliente) {
        if (!cliente.dni) throw new Error("El DNI del cliente es mandatorio de forma perimetral.");
        
        const clienteRef = doc(db, "clientes", String(cliente.dni).trim());
        
        // CORREGIDO: Inclusión perimetral de 'telefono' bajo el estándar unificado NoSQL
        await setDoc(clienteRef, {
            dni: String(cliente.dni).trim(),
            nombre: cliente.nombre.toUpperCase(),
            telefono: cliente.telefono ? String(cliente.telefono).trim() : "S/T",
            direccion: cliente.direccion,
            coordenadas: {
                lat: parseFloat(cliente.coordenadas?.lat || cliente.latitud || 0),
                lng: parseFloat(cliente.coordenadas?.lng || cliente.longitud || 0)
            },
            critico: cliente.critico || false,
            isPremium: cliente.isPremium || false,
            isCritico: cliente.isCritico || false,
            motivoCritico: cliente.motivoCritico || "",
            historialReclamos: cliente.historialReclamos || []
        }, { merge: true });
    }

    /**
     * Carga masiva de pedidos utilizando fragmentación dinámica (Chunks de seguridad).
     * Soporta altos volúmenes de datos aislando transacciones de un máximo de 400 registros.
     * @param {Array} listaPedidos Colección de órdenes formateadas provenientes del extractor
     */
    static async guardarPedidosMasivos(listaPedidos) {
        if (!listaPedidos || listaPedidos.length === 0) return;
        
        const LIMITE_FIRESTORE_BATCH = 400;
        let indiceLote = 0;

        while (indiceLote < listaPedidos.length) {
            const batch = writeBatch(db);
            const fragmentoPedidos = listaPedidos.slice(indiceLote, indiceLote + LIMITE_FIRESTORE_BATCH);

            fragmentoPedidos.forEach(pedido => {
                const pedidoRef = doc(collection(db, "pedidos"));
                
                const latFinal = parseFloat(pedido.coordenada?.lat || pedido.coordenadas?.lat || pedido.latitud || 0);
                const lngFinal = parseFloat(pedido.coordenada?.lng || pedido.coordenadas?.lng || pedido.longitud || 0);

                batch.set(pedidoRef, {
                    idPedido: pedido.idPedido || pedidoRef.id,
                    numeroPedido: pedido.numeroPedido,
                    clienteDni: String(pedido.clienteDni || pedido.dni_cliente).trim(),
                    clienteNombre: pedido.clienteNombre,
                    direccion: pedido.direccion_entrega || pedido.direccion,
                    fecha: pedido.fecha_creacion || pedido.fecha,
                    franjaHoraria: pedido.franjaHoraria,
                    importe: parseFloat(pedido.importe || 0),
                    estadoRuta: "unassigned",
                    coordenadas: { lat: latFinal, lng: lngFinal },
                    esCritico: pedido.esCritico || false,
                    interno_asignado: pedido.interno_asignado || null
                });
            });

            await batch.commit();
            indiceLote += LIMITE_FIRESTORE_BATCH;
        }
    }

    static subscribePedidosPorFecha(fecha, callback, onError) {
        const q = query(collection(db, "pedidos"), where("fecha_creacion", "==", fecha));
        return onSnapshot(q, callback, onError);
    }

    static subscribeFlotaCompleta(fecha, callback, onError) {
        const q = query(collection(db, "unidades"), where("fecha", "==", fecha));
        return onSnapshot(q, callback, onError);
    }

    static subscribeClientesCriticos(callback, onError) {
        const q = query(collection(db, "clientes"), where("critico", "==", true));
        return onSnapshot(q, callback, onError);
    }

    static subscribeFlotaMaestraCentral(callback, onError) {
        return onSnapshot(collection(db, "flota_maestra"), callback, onError);
    }

    static async obtenerPedidosCriticosConFlota(fecha) {
        const q = query(
            collection(db, "pedidos"), 
            where("fecha_creacion", "==", fecha), 
            where("esCritico", "==", true)
        );
        return await getDocs(q);
    }

    static async removerUnidadJornada(id) {
        return await deleteDoc(doc(db, "unidades", id));
    }

    static async actualizarCamposUnidad(id, campos) {
        return await updateDoc(doc(db, "unidades", id), campos);
    }

    static async buscarUnidadEnFlotaMaestra() {
        return await getDocs(collection(db, "flota_maestra"));
    }

    static async despacharNuevaUnidad(datosUnidad) {
        return await addDoc(collection(db, "unidades"), datosUnidad);
    }

    static async removerPedido(id) {
        return await deleteDoc(doc(db, "pedidos", id));
    }

    static async actualizarPedido(id, datos) {
        return await updateDoc(doc(db, "pedidos", id), datos);
    }

    static async crearPedidoManual(datos) {
        return await addDoc(collection(db, "pedidos"), datos);
    }

    static async buscarClientePorDni(dni) {
        const q = query(collection(db, "clientes"), where("dni", "==", String(dni).trim()));
        return await getDocs(q);
    }

    static async obtenerClientePorIdDocumento(dni) {
        return await getDocs(query(collection(db, "clientes"), where("dni", "==", String(dni).trim())));
    }

    static async actualizarUnidadMaestra(interno, datos) {
        const docRef = doc(db, "flota_maestra", String(interno).trim());
        return await setDoc(docRef, datos, { merge: true });
    }

    static async eliminarUnidadMaestra(interno) {
        return await deleteDoc(doc(db, "flota_maestra", String(interno).trim()));
    }

    static async obtenerUnidadMaestraPorId(interno) {
        return await getDoc(doc(db, "flota_maestra", String(interno).trim()));
    }
}