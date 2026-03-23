import { create } from 'zustand';

export interface KeyboardState {
  ctrlKeyState: boolean;
  shiftKeyState: boolean;
  spaceKeyState: boolean;

  // Getters
  ctrlOrShiftKeyActive: () => boolean;

  // Actions
  setCtrlKeyState: (active: boolean) => void;
  setShiftKeyState: (active: boolean) => void;
  setSpaceKeyState: (active: boolean) => void;
}

export const useKeyboardStore = create<KeyboardState>((set, get) => ({
  // 初始状态
  ctrlKeyState: false, // Ctrl 键按下状态
  shiftKeyState: false, // Shift 键按下状态
  spaceKeyState: false, // 空格键按下状态

  // 获取器
  ctrlOrShiftKeyActive: () => {
    const state = get();
    return state.ctrlKeyState || state.shiftKeyState;
  },

  // 操作
  setCtrlKeyState: (active) => set({ ctrlKeyState: active }),
  setShiftKeyState: (active) => set({ shiftKeyState: active }),
  setSpaceKeyState: (active) => set({ spaceKeyState: active }),
}));
