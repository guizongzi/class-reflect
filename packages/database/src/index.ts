export type RepositoryResult<T> = Promise<T>;

export interface WorkflowRepository {
  claimNext(): RepositoryResult<{ id: string } | null>;
  markFailed(id: string, errorMessage: string): RepositoryResult<void>;
}
