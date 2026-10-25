// src/audioNative/traceStub.ts — 诊断追踪桩：扩展协议层保留调用点但不持久化追踪
export function noteLibraryStep(_provider: string, _step: string, _detail: unknown = {}): void {}
export function noteQrLoginStep(_step: string, _detail: unknown = {}): void {}
export function resetQrLoginTrace(): void {}
