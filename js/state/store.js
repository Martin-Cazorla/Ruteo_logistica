// js/state/store.js

class Store {
  #state = {
    user: null,
    isAuthenticated: false,
    loading: false,
    error: null,
    pedidos: [],
    filtros: {
      franjaHoraria: 'all'
    }
  };
  
  #listeners = new Set();

  constructor() {
    if (Store.instance) return Store.instance;
    Store.instance = this;
  }

  getState() {
    return { ...this.#state };
  }

  setState(newState) {
    this.#state = { ...this.#state, ...newState };
    this.#notify();
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #notify() {
    const currentState = this.getState();
    this.#listeners.forEach(listener => listener(currentState));
  }
}

export const store = new Store();