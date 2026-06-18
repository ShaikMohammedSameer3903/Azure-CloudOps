import { create } from 'zustand';

export interface OperationLog {
  message: string;
  timestamp: string;
}

export interface AzureOperation {
  id: string;
  name: string;
  stage: string;
  percent: number;
  timeRemaining: string;
  status: 'Pending' | 'Running' | 'Succeeded' | 'Failed';
  userEmail: string;
  createdAt: string;
  logs: OperationLog[];
  errorMessage?: string;
}

interface OperationState {
  operations: AzureOperation[];
  activeOperationId: string | null;
  setOperations: (ops: AzureOperation[]) => void;
  setActiveOperationId: (id: string | null) => void;
  addOperation: (op: AzureOperation) => void;
  updateOperation: (id: string, updates: Partial<AzureOperation>) => void;
  addOperationLog: (id: string, log: OperationLog) => void;
}

export const useOperationStore = create<OperationState>((set) => ({
  operations: [],
  activeOperationId: null,
  setOperations: (operations) => set({ operations }),
  setActiveOperationId: (activeOperationId) => set({ activeOperationId }),
  addOperation: (op) => set((state) => {
    // Avoid duplicates
    if (state.operations.some((o) => o.id === op.id)) return state;
    return { operations: [op, ...state.operations] };
  }),
  updateOperation: (id, updates) => set((state) => ({
    operations: state.operations.map((o) =>
      o.id === id ? { ...o, ...updates } : o
    ),
  })),
  addOperationLog: (id, log) => set((state) => ({
    operations: state.operations.map((o) =>
      o.id === id ? { ...o, logs: [...(o.logs || []), log] } : o
    ),
  })),
}));
