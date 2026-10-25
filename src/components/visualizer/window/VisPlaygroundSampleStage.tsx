import React, { useCallback, useMemo, useRef } from 'react';
import { MotionConfig } from 'framer-motion';
import { stageStyle, useBoxSize } from '../preview/LivePicture';
import { useWindowSize } from '../preview/LyricPreviewContext';
import { frameStage, placeOnStage, stageAboveBox, stageBelowBox, type Size, type StagePlace } from '../preview/previewScale';
import { HARMONY_TOP_PX, HarmonyTopContext } from '../VisualizerHarmonyOverlay';
import { PreviewBottomBarOffsetContext } from '../../floating-player/PlayerBottomBarLayoutContext';
import { StyleFrameContext } from '../styleTransition/VisualizerStyleTransition';
import {
    PLAYER_BOTTOM_BAR_BASE_OFFSET_PX,
    PLAYER_SUBTITLE_BOTTOM_PX,
    resolveUnscaledSubtitleBarOffset,
} from '../../../utils/playerBottomBarLayout';
import type { VisualizerMode } from '../../../types';

// src/components/visualizer/window/VisPlaygroundSampleStage.tsx
// The stage of the big sample in the lyric style window, and of Theme Park's sample. Several
// styles lay themselves out from the size of the app's window (window.innerWidth, vw, vh), not of
// the box they are in, so the sample draws them as the small pictures do (LivePicture): on a stage
// as large as the window, scaled down until it fits the sample's box, and grown along the box's
// spare side so no band is left empty, as if the window were taller or wider. A style there looks
// like the playing page made smaller, then zoomed in a little so its lyrics are big enough to
// read. Only what is drawn is scaled: the sample's own buttons lie over it, outside this stage.

/**
 * How much larger than it fits the sample draws each style; the overflow is cut evenly. Monet keeps
 * its lyrics in a narrow middle band (about 0.19 to 0.83 of the box across), so it takes more and
 * still keeps a margin at the sides.
 */
const SAMPLE_ZOOM: Partial<Record<VisualizerMode, number>> = { monet: 1.3 };
const DEFAULT_SAMPLE_ZOOM = 1.15;

type VisPlaygroundSampleStageProps = {
    children: React.ReactNode;
    /**
     * Where the sample lays a bar of its own over the stage's bottom, unscaled (Theme Park's song
     * card): how far above the box's bottom the shared subtitle sits, in the box's pixels, instead of
     * shrinking with the stage and falling behind that bar. Without one it keeps the distance the
     * stage gives it before the zoom, so the zoom's crop never takes it out of the box.
     */
    subtitleBottomPx?: number;
};

/**
 * How far inside the stage's edges the unscaled frame cuts it (previewScale.frameStage). One CSS
 * pixel is at least the half device pixel the frame's edge may be rounded outwards by.
 */
const FRAME_EDGE = 1;

/**
 * framer-motion reads the pointer in the page's pixels: on a stage drawn at `scale` a drag (Monet's
 * portrait) must move by the stage's pixels to stay under the pointer.
 */
const useStagePoint = (scale: number) => (
    useCallback((point: { x: number; y: number }) => ({ x: point.x / scale, y: point.y / scale }), [scale])
);

/** A style drawn at a zoom of its own: its stage, placed on the sample's stage, drawn at `pageScale` in the page. */
const OwnStage: React.FC<{ stage: Size; place: StagePlace; pageScale: number; children: React.ReactNode }> = ({
    stage,
    place,
    pageScale,
    children,
}) => {
    const toStagePoint = useStagePoint(pageScale);
    return (
        <div className="absolute origin-top-left" style={stageStyle(stage, place) ?? undefined}>
            <MotionConfig transformPagePoint={toStagePoint}>{children}</MotionConfig>
        </div>
    );
};

const VisPlaygroundSampleStage: React.FC<VisPlaygroundSampleStageProps> = ({ children, subtitleBottomPx }) => {
    const windowSize = useWindowSize();
    const boxRef = useRef<HTMLDivElement>(null);
    const box = useBoxSize(boxRef);
    // The stage, its background and the shared subtitle are framed at the usual zoom whatever the style,
    // so a switch never changes them; a style of another zoom is framed inside its own layer (frameStyle).
    const framed = useMemo(() => box && frameStage(windowSize, box, FRAME_EDGE, true, DEFAULT_SAMPLE_ZOOM), [windowSize, box]);
    const scale = framed?.place.scale ?? 1;
    const toStagePoint = useStagePoint(scale);
    const subtitleBarOffset = framed && box
        ? resolveUnscaledSubtitleBarOffset(scale, stageBelowBox(framed, box), subtitleBottomPx ?? PLAYER_SUBTITLE_BOTTOM_PX * (scale / DEFAULT_SAMPLE_ZOOM))
        : PLAYER_BOTTOM_BAR_BASE_OFFSET_PX;
    // The harmony line at the top keeps its distance below the box's top as the subtitle keeps it above
    // the bottom, so the zoom's crop never cuts it.
    const harmonyTop = framed
        ? (HARMONY_TOP_PX * (scale / DEFAULT_SAMPLE_ZOOM) + stageAboveBox(framed)) / scale
        : HARMONY_TOP_PX;

    // A style of another zoom (Monet) is drawn on a stage of its own, framed at its zoom as the sample's
    // stage would be and laid on that stage where it would sit in the box, so it lays out as it would at
    // that zoom. It is inside the style's layer, so a switch blurs each style out and in at its own size
    // and nothing else scales. None of these styles reads the subtitle offset, which stays the stage's.
    const frameStyle = useCallback((style: VisualizerMode, content: React.ReactNode) => {
        const zoom = SAMPLE_ZOOM[style] ?? DEFAULT_SAMPLE_ZOOM;
        const own = zoom !== DEFAULT_SAMPLE_ZOOM && box && framed && frameStage(windowSize, box, FRAME_EDGE, true, zoom);
        if (!own || !framed) return content;
        return (
            <OwnStage stage={own.stage} place={placeOnStage(framed.place, own.place)} pageScale={own.place.scale}>
                {content}
            </OwnStage>
        );
    }, [windowSize, box, framed]);

    return (
        <div ref={boxRef} className="absolute inset-0">
            {framed && (
                // The stage is cut by this unscaled frame, not by its own edges under the scale: see frameStage.
                <div className="absolute overflow-hidden" style={framed.frame}>
                    <div className="absolute origin-top-left" style={stageStyle(framed.stage, framed.place) ?? undefined}>
                        <PreviewBottomBarOffsetContext.Provider value={subtitleBarOffset}>
                            <HarmonyTopContext.Provider value={harmonyTop}>
                                <StyleFrameContext.Provider value={frameStyle}>
                                    <MotionConfig transformPagePoint={toStagePoint}>{children}</MotionConfig>
                                </StyleFrameContext.Provider>
                            </HarmonyTopContext.Provider>
                        </PreviewBottomBarOffsetContext.Provider>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VisPlaygroundSampleStage;
