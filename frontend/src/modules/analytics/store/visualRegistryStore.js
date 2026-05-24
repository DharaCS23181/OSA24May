import { create } from 'zustand';
import { PREINSTALLED_VISUALS } from '../services/visualSandbox';

// Registry of installed custom visuals
// Structure:
// {
//    id: "com.custom.radar", 
//    name: "Radar Chart",
//    icon: "url", 
//    renderFn: function(data, config) { ... },
//    configSchema: { ... }
//    isFromFile: boolean
// }

const useVisualRegistryStore = create((set) => ({
  installedVisuals: [...PREINSTALLED_VISUALS],


  installVisual: (visual) => set((state) => {
    // Avoid duplicates
    if (state.installedVisuals.some(v => v.id === visual.id)) {
      return state;
    }
    return { installedVisuals: [...state.installedVisuals, visual] };
  }),

  removeVisual: (id) => set((state) => ({
    installedVisuals: state.installedVisuals.filter(v => v.id !== id)
  })),

  clearAll: () => set({ installedVisuals: [] })
}));

export default useVisualRegistryStore;
