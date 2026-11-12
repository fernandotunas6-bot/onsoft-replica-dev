/** Inventário financeiro de leitura exclusiva, nunca autoriza deploy. */
export type FinanceInventory = {
  cash_points: boolean;
  cash_sessions: boolean;
  cash_history: boolean;
  receipt_cash_trigger: boolean;
  expense_cash_trigger: boolean;
  receipt_reversal_trigger: boolean;
  expense_reversal_trigger: boolean;
  cash_points_rls: boolean;
  cash_sessions_rls: boolean;
  cash_points_anon_select: boolean;
  cash_points_auth_select: boolean;
  cash_sessions_anon_select: boolean;
  cash_sessions_auth_select: boolean;
  cash_rpc_complete: boolean;
  cash_rpc_anon_executable: boolean;
  idempotency_column: boolean;
  idempotency_index: boolean;
  payment_rpc_six_args: boolean;
  reversal_mentions_penalty: boolean;
};

export declare const FINANCE_INVENTORY_SQL: string;
export declare function financeReadOnlyRequest(): {
  query: string;
};
export declare function evaluateFinanceInventory(
  row: unknown,
): {
  blocked: boolean;
  blockers: string[];
  pending: string[];
  caveat: string;
};
export declare function readFinanceInventory(
  projectRef: string,
  token: string | undefined,
  send?: typeof fetch,
): Promise<FinanceInventory>;
