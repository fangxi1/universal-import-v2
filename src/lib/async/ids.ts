import { randomUUID } from "crypto";

export function newTaskId(): string {
  return `task_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export function newTraceId(): string {
  return `trace_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export function newEventId(): string {
  return `evt_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export function unitIdForBatch(batchIndex: number): string {
  return `unit_${String(batchIndex + 1).padStart(3, "0")}`;
}
