import React from 'react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ThemedDialog from './ThemedDialog';

interface PlaylistSelectionDialogItem {
    id: string | number;
    name: string;
    description?: string;
}

interface PlaylistSelectionDialogProps {
    isOpen: boolean;
    title: string;
    description?: string;
    playlists: readonly PlaylistSelectionDialogItem[];
    isDaylight?: boolean;
    onClose: () => void;
    onSelect: (playlistId: string | number) => Promise<void> | void;
    onCreate?: () => void;
    createLabel?: string;
}

const PlaylistSelectionDialog: React.FC<PlaylistSelectionDialogProps> = ({
    isOpen,
    title,
    description,
    playlists,
    isDaylight = false,
    onClose,
    onSelect,
    onCreate,
    createLabel,
}) => {
    const { t } = useTranslation();
    const [submittingId, setSubmittingId] = React.useState<string | number | null>(null);

    React.useEffect(() => {
        if (!isOpen) {
            setSubmittingId(null);
        }
    }, [isOpen]);

    return (
        <ThemedDialog
            isOpen={isOpen}
            onClose={onClose}
            isDaylight={isDaylight}
            title={title}
            description={description}
            size="m"
            fill
        >
            {onCreate && (
                <button
                    type="button"
                    onClick={onCreate}
                    disabled={submittingId !== null}
                    className="st-t-fast mb-3 flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--st-fill)] text-[13px] transition-colors enabled:hover:bg-[var(--st-fill2)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <Plus size={16} />
                    {createLabel || t('localMusic.saveQueueAsPlaylist') || 'Create Playlist'}
                </button>
            )}
            {playlists.length > 0 ? (
                // The list scrolls; the line above it stays.
                <div className="st-card st-scroll min-h-0 overflow-y-auto rounded-xl bg-[var(--st-card)] shadow-[0_0_0_1px_var(--st-line)]">
                    {playlists.map((playlist) => (
                        <button
                            key={playlist.id}
                            type="button"
                            onClick={async () => {
                                try {
                                    setSubmittingId(playlist.id);
                                    await onSelect(playlist.id);
                                    onClose();
                                } finally {
                                    setSubmittingId(null);
                                }
                            }}
                            disabled={submittingId !== null}
                            className="st-row st-focus-inside st-t-fast relative flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition-colors enabled:hover:bg-[var(--st-fill)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm leading-5">{playlist.name}</div>
                                {playlist.description && (
                                    <div className="truncate text-xs leading-[18px] text-[color:var(--st-t2)]">{playlist.description}</div>
                                )}
                            </div>
                            <Plus size={16} className="shrink-0 text-[color:var(--st-t3)]" />
                        </button>
                    ))}
                </div>
            ) : (
                <div className="py-8 text-center text-[13px] text-[color:var(--st-t3)]">
                    {t('localMusic.noPlaylistsFound') || 'No playlists yet'}
                </div>
            )}
        </ThemedDialog>
    );
};

export default PlaylistSelectionDialog;
