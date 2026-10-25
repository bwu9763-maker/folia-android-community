import { ensureLocalSongCoverAsset, getAudioFromLocalSong } from '../../../../services/localMusicService';
import { navidromeApi } from '../../../../services/navidromeService';
import { loadOnlineSongAudioSource, type LoadOnlineAudioSourceOptions } from '../../../../services/onlinePlayback';
import { getPlaybackRepresentationForRevision } from '../../../../services/playbackRecovery/representationRegistry';
import { buildLocalSourceRevision, buildNavidromeSourceRevision } from '../../../../services/playbackRecovery/sourceRevision';
import type { PrefetchedSongData } from '../../../../services/prefetchService';
import type { LocalSong, SongResult } from '../../../../types';
import type { NavidromeConfig, NavidromeSong } from '../../../../types/navidrome';
import type { AudioQualityPreference } from '../../../../types/onlineMusic';
import { getPlaybackSongKey } from '../../../../utils/appPlaybackGuards';

// src/components/app/playback/source/songAudioSource.ts
//
// How each kind of song gets the address its audio plays from, and what comes with that address.
// One function per kind. Every route that starts, restores or recovers playback calls it: playSong,
// onPlayLocalSong, onPlayNavidromeSong, restorePlaybackSourceForSong and the online recovery.
//
// What a route does around the address stays in the route: the queue, the player state, the status
// message, the lyrics, the theme, its checks whether it was overtaken, and what becomes of the blob
// URL that was there before.

/**
 * A local file: its audio behind a fresh blob URL, and its library record with the cover asset
 * made if it had none. null when the file cannot be read.
 * The caller owns `blobUrl`: it plays it, or hands it to `retireBlobUrl`.
 */
export const loadLocalSongAudio = async (localSong: LocalSong) => {
    const blobUrl = await getAudioFromLocalSong(localSong);
    if (!blobUrl) return null;
    const preparedSong = await ensureLocalSongCoverAsset(localSong);
    return {
        blobUrl,
        localSong: preparedSong,
        /**
         * The copy that took the place of this file's audio earlier in this session (a transcode of
         * a format the browser cannot play), if it was made from the file as it is now.
         */
        recoveredCopy: (songKey: string) => (
            getPlaybackRepresentationForRevision(songKey, buildLocalSourceRevision(preparedSong))
        ),
    };
};

/**
 * A Navidrome song: its stream address, built here (nothing is fetched for it), and the server's
 * own record of the song, asked for at once and waited for by `takeServerGain`.
 */
export const loadNavidromeSongAudio = (config: NavidromeConfig, navidromeSong: NavidromeSong) => {
    const songId = navidromeSong.navidromeData.id;
    const streamUrl = navidromeApi.getStreamUrl(config, songId);
    const serverSong = navidromeApi.getSong(config, songId);
    return {
        streamUrl,
        /** Waits for the server's record and writes its replay gain onto the song. */
        takeServerGain: async () => {
            const answered = await serverSong;
            if (answered?.replayGain) {
                navidromeSong.navidromeData.replayGain = answered.replayGain;
            }
        },
        /** The source revision of `song` when it plays from this address. */
        revisionOf: (song: SongResult) => buildNavidromeSourceRevision(song, streamUrl),
        /** The copy that took the place of this stream earlier in this session, if it was made from it. */
        recoveredCopy: (song: SongResult) => (
            getPlaybackRepresentationForRevision(getPlaybackSongKey(song), buildNavidromeSourceRevision(song, streamUrl))
        ),
    };
};

/**
 * An online song: what `loadOnlineSongAudioSource` answers, and with an address the moment it was
 * fetched. `fetchedAt` is the time of the prefetch when the prefetched address is the one answered,
 * now for an address that was just asked for, and null for a copy from the media cache, which
 * does not run out. `options`: what the route asks of the load (passing over the media cache, asking
 * again where the platform could not be reached), as `loadOnlineSongAudioSource` takes them.
 */
export const loadOnlineSongAudio = async (
    song: SongResult,
    audioQuality: AudioQualityPreference,
    prefetched: PrefetchedSongData | null = null,
    options: LoadOnlineAudioSourceOptions = {},
) => {
    const result = await loadOnlineSongAudioSource(song, audioQuality, prefetched, options);
    if (result.kind !== 'ok') return result;
    const fetchedAt = result.blobUrl
        ? null
        : prefetched?.audioUrl === result.audioSrc ? prefetched.audioUrlFetchedAt : Date.now();
    return { ...result, fetchedAt };
};
