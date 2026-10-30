import type { LibraryProviderSwitchCleanupPort } from '../../../src/library/core/account/account.contract';
import { createLibraryAccountSwitchCleanupPort } from '../../../src/library/app/createLibraryAccountPort';
import { recordAccountCall } from './fakeAuthProviders';

// dev/probes/accountBehavior/probeSwitchCleanup.ts
// 账户探针的切换清理端口：就是应用的那一个（createLibraryAccountSwitchCleanupPort，清播放、搜索运行态与集合导航），
// 外面包一层记账（switch-cleanup，带目标平台）。探针没有 audio 元素与 automix，App 的句柄给空引用。

const realCleanup = createLibraryAccountSwitchCleanupPort(() => ({
    audioRef: { current: null },
    automixRef: { current: null },
    shouldAutoPlay: { current: false },
    setLyrics: () => {},
    setIsLyricsLoading: () => {},
}));

export const probeSwitchCleanup: LibraryProviderSwitchCleanupPort = {
    // The probe player always holds songs, so every switch is asked first (the account tests assert the ask).
    holdsSongs: () => true,
    resetForProviderSwitch: (nextProviderId, previousProviderId) => {
        recordAccountCall({ op: 'switch-cleanup', providerId: nextProviderId });
        return realCleanup.resetForProviderSwitch(nextProviderId, previousProviderId);
    },
};
