import { create } from 'zustand';

interface ApprovalRequest {
  tool: string;
  command: string;
  cwd: string;
  sessionId: string;
  timestamp: number;
}

interface PetState {
  currentPetId: string;
  opacity: number;
  clickThrough: boolean;
  pendingApproval: ApprovalRequest | null;
  isAdminPanelOpen: boolean;

  setCurrentPetId: (petId: string) => void;
  setOpacity: (opacity: number) => void;
  setClickThrough: (enabled: boolean) => void;
  setPendingApproval: (approval: ApprovalRequest) => void;
  clearApproval: () => void;
  setAdminPanelOpen: (open: boolean) => void;
}

export const usePetStore = create<PetState>((set) => ({
  currentPetId: 'alice',
  opacity: 1.0,
  clickThrough: false,
  pendingApproval: null,
  isAdminPanelOpen: false,

  setCurrentPetId: (petId) => set({ currentPetId: petId }),
  setOpacity: (opacity) => set({ opacity }),
  setClickThrough: (enabled) => set({ clickThrough: enabled }),
  setPendingApproval: (approval) => set({ pendingApproval: approval }),
  clearApproval: () => set({ pendingApproval: null }),
  setAdminPanelOpen: (open) => set({ isAdminPanelOpen: open }),
}));
