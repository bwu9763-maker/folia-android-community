// src/audioNative/reference/router.ts
// 参考项目 API 层路由：/api/kg/* → 酷狗扩展端点（audioNative/kugou.ts）。
//
// 背景：v0.7.21 的参考层（reference/*.js，酷狗 API 的浏览器移植）没有随仓库发布，
// 构建时缺失导致整个 audioNative 编译失败。这里按 referenceBridge 的契约重写路由：
// 「登录/播放走原函数」的部分直接委托给 kugou.ts 里久经验证的 signedCall 实现
// （会话、设备注册、签名、Set-Cookie 落库它全都管），reference 只负责做
// referenceBridge/index.ts 期望的两处归一化（歌单与用户资料）。

import { handleKugouEndpoint } from '../kugou';

export interface ReferenceApiRequest {
    path: string;
    method?: string;
    query: Record<string, string>;
    body?: Record<string, unknown>;
}

/** 透传：把端点连同 query 交给 kugou.ts，拿回它的原始响应体。 */
const callKugouEndpoint = async (endpoint: string, query: ReferenceApiRequest['query']): Promise<any> => {
    const search = new URLSearchParams(query).toString();
    const response = await handleKugouEndpoint(search ? `${endpoint}?${search}` : endpoint);
    return response.json();
};

/**
 * 歌单归一化：kugouTransport 期望扩展层吐 KuGouMusicApi 原始形状
 * （specialid/pic/count…），而 index.ts 的适配器会把这里的归一化形状
 * （id/cover/trackCount…）转回原始形状。两边字段一一对应，别改单边。
 */
const normalizePlaylists = (raw: any): { playlists: any[] } => {
    const list: any[] = Array.isArray(raw?.data?.list)
        ? raw.data.list
        : Array.isArray(raw?.data) ? raw.data : [];
    return {
        playlists: list.map((item: any) => ({
            id: item.specialid ?? item.special_id ?? item.global_specialid ?? item.id,
            globalCollectionId: item.global_collection_id ?? item.global_specialid ?? null,
            name: item.name ?? '',
            cover: item.pic ?? item.img ?? item.cover ?? '',
            trackCount: Number(item.count ?? item.song_count ?? 0),
            ownerId: String(item.userid ?? item.list_create_userid ?? ''),
            creator: item.nickname ?? '',
            isFavorite: Number(item.is_default ?? item.is_favorite ?? 0) === 1,
            listType: item.type ?? 0,
        })),
    };
};

/**
 * 用户资料归一化：index.ts 期望 { userId, nickname, avatar }，
 * 它会再转成 provider 的 user_info 形状。
 */
const normalizeUserProfile = (raw: any, fallback: { userId: string; nickname?: string; avatar?: string }): { userId: string; nickname: string; avatar: string } => {
    const info = raw?.data?.user_info ?? raw?.data ?? {};
    return {
        userId: String(info.userid ?? info.KugooID ?? fallback.userId),
        nickname: String(info.nickname ?? fallback.nickname ?? ''),
        avatar: String(info.pic ?? fallback.avatar ?? ''),
    };
};

export const handleApiRequest = async (options: ReferenceApiRequest): Promise<any> => {
    const { path, query } = options;

    switch (path) {
        case '/api/kg/login/qr/key':
            return callKugouEndpoint('/login/qr/key', query);
        case '/api/kg/login/qr/create':
            return callKugouEndpoint('/login/qr/create', query);
        case '/api/kg/login/qr/check':
            return callKugouEndpoint('/login/qr/check', query);
        case '/api/kg/login/status':
        case '/api/kg/user/detail': {
            const raw = await callKugouEndpoint('/user/detail', query);
            return normalizeUserProfile(raw, {
                userId: query.userid ?? query.userId ?? '',
            });
        }
        case '/api/kg/vip/detail':
            return callKugouEndpoint('/user/vip/detail', query);
        case '/api/kg/song/url':
            return callKugouEndpoint('/song/url', query);
        case '/api/kg/user/playlists': {
            const raw = await callKugouEndpoint('/user/playlist', query);
            return normalizePlaylists(raw);
        }
        default:
            throw new Error(`reference router: unsupported path ${path}`);
    }
};
