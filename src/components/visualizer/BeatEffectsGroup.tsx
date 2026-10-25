import React from 'react';
import { useVisualizerSettingsStore } from '../../stores/useVisualizerSettingsStore';
import { modelsPresent, subscribeModelAvailability } from '../../services/analysis/modelAvailability';
import { BEAT_EFFECT_STRENGTH_MAX, offeredBeatEffects, resolveBeatEffectSetting, smartBeatActive, smartBeatMayAnalyse, type BeatEffectDef } from '../../services/beatFx/beatEffects';
import { Button, Group, Row, type SettingsGroupDef } from '../modal/settings/kit';
import { SliderRow, ToggleRow, times } from './panelRows';

// src/components/visualizer/BeatEffectsGroup.tsx
// A mode's 智能动感模式 effects, in its own settings above its style options: one row per effect the
// registry entry offers (`beatEffects`, retired ones left out), its four-character name and what it
// does, its own switch, and its strength - 0..2x, 1x the look it was tuned to, in the middle of the
// slider. The one 智能动感模式 setting is on the 全局 tab, in SmartBeatSettingsCard.tsx; while it is off this
// says so, with a button that goes to that tab where the window gives one (`onOpenSmartBeat`), and
// the effects keep their settings for when it is on. An effect reading drum hits says when its model
// (htdemucs_gpu) is not installed - only under `on`, the one mode that runs it. Nothing for a mode with
// no effects.

const BEAT_EFFECTS_GROUP: SettingsGroupDef = { id: 'vis-beat-effects', titleKey: 'options.beatEffects' };
const STRENGTH_MARKS = [{ value: 1 }];

type BeatEffectsGroupProps = {
    t: (key: string) => string;
    effects: readonly BeatEffectDef[] | undefined;
    /** Mark slider drag start so onChange only updates draft. */
    onSliderPointerDown?: () => void;
    /** Commit draft values to persistent store on slider release. */
    onSliderCommit?: () => void;
    /** Goes to where the 智能动感模式 switch is: the notice that it is off then has a button for it. */
    onOpenSmartBeat?: () => void;
};

const BeatEffectsGroup: React.FC<BeatEffectsGroupProps> = ({ t, effects, onSliderPointerDown, onSliderCommit, onOpenSmartBeat }) => {
    const smartBeat = useVisualizerSettingsStore(state => state.smartBeat);
    const setSmartBeat = useVisualizerSettingsStore(state => state.handleSetSmartBeat);
    const drumsPresent = React.useSyncExternalStore(subscribeModelAvailability, modelsPresent, modelsPresent).htdemucs_gpu;
    const offered = offeredBeatEffects(effects);
    const active = smartBeatActive(smartBeat);
    if (!offered.length) return null;
    const drag = { onDragStart: onSliderPointerDown, onDragEnd: onSliderCommit };

    return (
        <Group def={BEAT_EFFECTS_GROUP}>
            {!active && (
                <Row notice={t('options.beatEffectsNeedSmartBeat')}>
                    {onOpenSmartBeat && <Button onClick={onOpenSmartBeat}>{t('options.beatEffectsOpenSmartBeat')}</Button>}
                </Row>
            )}
            {offered.map((effect) => {
                const setting = resolveBeatEffectSetting(smartBeat, effect.id);
                const missingModel = effect.source === 'drums' && !drumsPresent && smartBeatMayAnalyse(smartBeat);
                return (
                    <React.Fragment key={effect.id}>
                        <ToggleRow
                            label={t(effect.nameKey)}
                            note={t(effect.descKey)}
                            checked={setting.on}
                            onChange={on => setSmartBeat({ effects: { [effect.id]: { on } } })}
                        />
                        {active && setting.on && missingModel && <Row notice={t('options.beatEffectNeedsDrums')} />}
                        {active && setting.on && (
                            <SliderRow
                                label={t('options.beatEffectStrength')}
                                value={setting.strength}
                                min={0}
                                max={BEAT_EFFECT_STRENGTH_MAX}
                                step={0.05}
                                format={times}
                                marks={STRENGTH_MARKS}
                                onChange={strength => setSmartBeat({ effects: { [effect.id]: { strength } } })}
                                sub
                                {...drag}
                            />
                        )}
                    </React.Fragment>
                );
            })}
        </Group>
    );
};

export default BeatEffectsGroup;
