import { createStore } from 'solid-js/store';

export interface Task {
  id: string;
  content: string;
  
  // Status
  isCompleted: boolean;
  completedAt?: number; // Timestamp
  
  // Sorting & Hierarchy
  rank: string; 
  parentId: string | null; // For tracking origin, even if flattened visually
  depth: number; // 0 = Root, 1 = Subtask (used for indentation logic if needed)
  
  // Metadata
  createdAt: number;
  dueDate?: number; // Timestamp (optional)
}

export const [taskStore, setTaskStore] = createStore<{ tasks: Task[] }>({ tasks: [] });

export const addTask = (task: Partial<Task>) => {
  const nanoId = () => {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => ('0' + byte.toString(16)).slice(-2)).join('');
  };
  setTaskStore('tasks', (tasks) => [...tasks, {id: nanoId(), isCompleted: false, completedAt: undefined, rank: 'a', parentId: '', createdAt: Date.now(), ...task}]);
};

export const updateTask = (id: string, updates: Partial<Task>) => {
  setTaskStore(
    'tasks',
    (task) => task.id === id,
    (task) => ({ ...task, ...updates })
  );
};

export const deleteTask = (id: string) => {
  setTaskStore('tasks', (tasks) => tasks.filter((task) => task.id !== id));
};
