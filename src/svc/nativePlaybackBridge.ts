import { PlayerState } from '../types';
import { currentTime } from '../stores/motionSignals';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import {
  selectDisplayDuration,
  selectDisplayPlayerState,
  selectDisplaySong,
  usePlaybackStore,
} from '../stores/usePlaybackStore';

type NativePlaybackPlugin = {
  updatePlaybackState: (state: Record<string, unknown>) => Promise<unknown>;
  clearPlaybackState: () => Promise<unknown>;
  addListener: (
    eventName: string,
    listener: (event: { action?: string }) => void,
  ) => Promise<{ remove: () => Promise<void> }> | { remove: () => Promise<void> };
};

let installed = false;

type NativePlaybackPayload = {
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  songKey: string;
  playing: boolean;
  position: number;
  duration: number;
};

const readPayload = (): NativePlaybackPayload | null => {
  const state = usePlaybackStore.getState();
  const song = selectDisplaySong(state);
  if (!song) return null;
  return {
    title: song.name || 'Unknown Song',
    artist: song.artists?.map((artist) => artist.name).filter(Boolean).join(' / ') || '',
    album: song.album?.name || '',
    coverUrl: song.album?.coverUrl || (song as unknown as { coverUrl?: string }).coverUrl || '',
    songKey: getPlaybackSongKey(song),
    playing: selectDisplayPlayerState(state) === PlayerState.PLAYING,
    position: Math.max(0, Math.round(currentTime.get() * 1000)),
    duration: Math.max(0, Math.round(selectDisplayDuration(state) * 1000)),
  };
};

/**
 * 锁屏元数据里真正会变的东西。
 *
 * store 的订阅回调对任何一次写入都会跑，而每次推送都会让原生侧重走一遍前台服务启动
 * （构建通知 + `startForeground` + 写诊断）——现场报告里 4 秒内攒了 20 次 `service-start`，
 * 就是这个订阅在没有去重的情况下被播放中的状态写入反复触发。
 *
 * 位置不在 store 里（走 motionSignals），所以这里按内容去重：只有这些字段变化才立刻重发，
 * 播放进度交给每秒的心跳带上。
 */
export const buildNativePlaybackIdentity = (payload: NativePlaybackPayload): string => JSON.stringify([
  payload.title,
  payload.artist,
  payload.album,
  payload.coverUrl,
  payload.songKey,
  payload.playing,
]);

let lastPushedIdentity = '';

const pushState = (plugin: NativePlaybackPlugin, options: { force?: boolean } = {}) => {
  const payload = readPayload();
  if (!payload) {
    lastPushedIdentity = '';
    void plugin.clearPlaybackState().catch(() => undefined);
    return;
  }
  const identity = buildNativePlaybackIdentity(payload);
  if (!options.force && identity === lastPushedIdentity) return;
  lastPushedIdentity = identity;
  void plugin.updatePlaybackState({
    ...payload,
  }).catch(() => undefined);
};

export const installNativePlaybackBridge = async (
  plugin: NativePlaybackPlugin,
): Promise<void> => {
  if (installed) return;
  installed = true;

  try {
    await plugin.addListener('mediaAction', ({ action }) => {
      if (!action) return;
      window.dispatchEvent(new CustomEvent('folia-native-media-action', {
        detail: { action },
      }));
    });
  } catch (error) {
    console.warn('[FoliaNativePlayback] Failed to listen for media actions', error);
  }

  usePlaybackStore.subscribe(() => pushState(plugin));
  // 音频焦点护栏：其他 App（游戏等）抢走焦点时 Chromium 会暂停 <audio>。
  // 本 App 的策略是「歌曲永不让位」：只要用户没有手动暂停（store 仍是 PLAYING），
  // 每秒检查主 audio，被系统焦点暂停就自动续播。原生侧 FoliaPlaybackService
  // 持有 AUDIOFOCUS_GAIN 且监听器为 no-op，两侧一起保证不被其他音频打断。
  window.setInterval(() => {
    const state = usePlaybackStore.getState();
    if (selectDisplayPlayerState(state) === PlayerState.PLAYING) {
      pushState(plugin, { force: true });
      try {
        const mainAudio = document.querySelector<HTMLAudioElement>('audio[data-folia-main-audio]');
        if (mainAudio && mainAudio.paused && !mainAudio.ended && mainAudio.readyState >= 2) {
          void mainAudio.play().catch(() => { /* 自动恢复失败则下秒再试 */ });
        }
      } catch { /* ignore */ }
    }
  }, 1000);
  pushState(plugin);
};
