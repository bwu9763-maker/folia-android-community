// src/stores/useLatticePerformanceModeStore.ts
// 独立的性能优先开关：刻意不与 useLatticeSettingsStore 共文件 —— Lattice 砖块与设置 store
// 之间出现过 rolldown 循环分包丢 import 的 bug（Lattice 块引用裸全局 → ReferenceError 黑屏）。
// 这个 store 零依赖，任何 chunk 引用都不会成环。默认开。
import { create } from 'zustand';

const KEY = 'lattice_performance_mode';

const readInitial = (): boolean => {
    try {
        const v = localStorage.getItem(KEY);
        return v === null ? true : v === '1';
    } catch {
        return true;
    }
};

export const useLatticePerformanceModeStore = create<{
    enabled: boolean;
    setEnabled: (enabled: boolean) => void;
}>(set => ({
    enabled: readInitial(),
    setEnabled: (enabled) => {
        set({ enabled });
        try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch { /* private mode */ }
    },
}));
