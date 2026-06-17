// Entry point. Wires the two domains in the same order the old single-file
// IIFE did: builder listeners + bench rehydrate first, then the inventory
// listeners and one-time init (panel state, Drive-button visibility, view
// routing, silent sign-in restore).
import { initBuilder } from './builder.js';
import { initInventory } from './inventory.js';

initBuilder();
initInventory();
