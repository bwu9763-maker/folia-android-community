export interface EmbeddedMetadataResult {
    title?: string;
    artist?: string;
    artists?: string[];
    album?: string;
    trackNumber?: number;
    discNumber?: number;
    cover?: Blob;
    coverAssetId?: string;
    bitrate?: number;
    lyrics?: string;
    translationLyrics?: string;
    replayGain?: number;
    replayGainTrackGain?: number;
    replayGainTrackPeak?: number;
    replayGainAlbumGain?: number;
    replayGainAlbumPeak?: number;
    duration?: number;
}

export interface HashedLocalCoverResult {
    cover: Blob;
    coverAssetId: string;
}

let metadataWorker: Worker | null = null;
let workerRequestId = 0;
const workerCallbacks = new Map<string, (result: unknown | null) => void>();

// —— worker 崩溃兜底（修「导入卡死」）——
// 旧实现只挂了 onmessage：worker 一旦 OOM/异常退出（大文件最容易触发），
// 所有在途的解析请求永远等不到回包，导入流程整体挂死。
// 现在 onerror / messageerror / 超时三路兜底，一律按「解析失败」优雅降级，
// 元数据回退文件名，绝不让导入卡死或把崩溃往主线程传。
const METADATA_WORKER_TIMEOUT_MS = 60_000;

const failAllPendingCallbacks = (reason: string): void => {
    if (workerCallbacks.size === 0) return;
    console.warn('[MetadataWorker] failing all pending requests:', reason);
    for (const callback of workerCallbacks.values()) callback(null);
    workerCallbacks.clear();
};

export const initMetadataWorker = (): Worker => {
    if (!metadataWorker) {
        metadataWorker = new Worker(
            new URL('../workers/metadataParser.worker.ts', import.meta.url),
            { type: 'module' }
        );
        metadataWorker.onmessage = (e) => {
            const { type, data, requestId, message } = e.data;
            const callback = workerCallbacks.get(requestId);
            if (callback) {
                workerCallbacks.delete(requestId);
                if (type === 'result') {
                    callback(data);
                } else {
                    console.warn('[MetadataWorker] parsing error:', message);
                    callback(null);
                }
            }
        };
        metadataWorker.onerror = () => {
            // worker 进程级错误（脚本加载失败、运行时崩溃）：挂掉的 worker 留着也
            // 不会再有回包，置空让下一次调用重建。
            failAllPendingCallbacks('worker-onerror');
            metadataWorker = null;
        };
        metadataWorker.onmessageerror = () => {
            failAllPendingCallbacks('worker-messageerror');
        };
    }

    return metadataWorker;
};

export const parseEmbeddedMetadataAsync = (
    file: File,
    includeCover = false
): Promise<EmbeddedMetadataResult | null> => {
    return new Promise((resolve) => {
        const worker = initMetadataWorker();
        const requestId = `meta_req_${++workerRequestId}`;
        const timer = setTimeout(() => {
            if (workerCallbacks.delete(requestId)) {
                console.warn('[MetadataWorker] parse timeout:', file.name, file.size);
                resolve(null);
            }
        }, METADATA_WORKER_TIMEOUT_MS);
        workerCallbacks.set(requestId, result => {
            clearTimeout(timer);
            resolve(result as EmbeddedMetadataResult | null);
        });
        worker.postMessage({ type: 'parse-metadata', file, includeCover, requestId });
    });
};

export const hashLocalCoverBlobAsync = (cover: Blob): Promise<HashedLocalCoverResult | null> => {
    return new Promise((resolve) => {
        const worker = initMetadataWorker();
        const requestId = `cover_hash_req_${++workerRequestId}`;
        workerCallbacks.set(requestId, result => resolve(result as HashedLocalCoverResult | null));
        worker.postMessage({ type: 'hash-cover', cover, requestId });
    });
};
