export const EVENT_TYPES = {
  ImportTaskCreated: "ImportTaskCreated",
  ImportBatchCreated: "ImportBatchCreated",
  ImportBatchStarted: "ImportBatchStarted",
  ImportBatchSucceeded: "ImportBatchSucceeded",
  ImportBatchFailed: "ImportBatchFailed",
  ImportTaskCompleted: "ImportTaskCompleted",
  ImportTaskPartialSuccess: "ImportTaskPartialSuccess",
  ImportTaskDegraded: "ImportTaskDegraded",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export interface EventEnvelope<T = Record<string, unknown>> {
  event_id: string;
  event_type: EventType | string;
  schema_version: number;
  aggregate_id: string;
  trace_id: string;
  occurred_at: string;
  payload: T;
}

export interface ImportBatchPayload {
  task_id: string;
  unit_id: string;
  batch_index: number;
  start_row: number;
  end_row: number;
}

export function buildEnvelope<T extends Record<string, unknown>>(params: {
  eventId: string;
  eventType: EventType | string;
  aggregateId: string;
  traceId: string;
  payload: T;
  schemaVersion?: number;
}): EventEnvelope<T> {
  return {
    event_id: params.eventId,
    event_type: params.eventType,
    schema_version: params.schemaVersion ?? 1,
    aggregate_id: params.aggregateId,
    trace_id: params.traceId,
    occurred_at: new Date().toISOString(),
    payload: params.payload,
  };
}
