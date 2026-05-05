import type {
  AddressBookEntry,
  InvokeHistoryEntry,
  ProjectAccount,
  SavedKeypair,
} from '../../types';

/**
 * The Program Inspector's escape hatch for mutating the active project.
 *
 * Each method persists the mutation through `projectService` and refreshes
 * the parent's `fullCurrentProject` state. We funnel everything through a
 * single object so child components don't need a prop for each operation
 * — and so future operations (saved transaction history, etc.) drop into
 * the same surface without churning every consumer.
 *
 * Methods return the persisted entity (or `null` on no-op) so the caller
 * can react immediately without waiting for the parent to re-render.
 */
export interface ProjectMutations {
  saveAddressBookEntry(label: string, address: string): Promise<AddressBookEntry | null>;
  removeAddressBookEntry(id: string): Promise<void>;
  saveKeypair(label: string, account: ProjectAccount): Promise<SavedKeypair | null>;
  removeKeypair(id: string): Promise<void>;
  /**
   * Append a submission attempt to the project's history. The
   * Invoke form fires this on every successful or failed submission;
   * the History tab reads `project.invokeHistory` directly.
   */
  appendInvokeHistory(entry: InvokeHistoryEntry): Promise<void>;
  removeInvokeHistoryEntry(id: string): Promise<void>;
  clearInvokeHistory(): Promise<void>;
}
