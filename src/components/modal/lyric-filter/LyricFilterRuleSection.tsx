import React from 'react';
import { useTranslation } from 'react-i18next';
import { LYRIC_FILTER_REGEX_EXAMPLE } from '../../../utils/lyrics/filtering';
import { Group, Reveal, Row, Toggle, type SettingsGroupDef } from '../settings/kit';
import LyricFilterPatternField from './LyricFilterPatternField';

// src/components/modal/lyric-filter/LyricFilterRuleSection.tsx

const RULE_GROUP: SettingsGroupDef = { id: 'lyricFilterRule', titleKey: 'lyricFilter.ruleSectionTitle' };

interface LyricFilterRuleSectionProps {
    isEnabled: boolean;
    pattern: string;
    error: string | null;
    onToggle: () => void;
    onPatternChange: (pattern: string) => void;
}

const LyricFilterRuleSection: React.FC<LyricFilterRuleSectionProps> = ({
    isEnabled,
    pattern,
    error,
    onToggle,
    onPatternChange,
}) => {
    const { t } = useTranslation();

    return (
        <Group def={RULE_GROUP}>
            {/* 开关必须留在这张卡里：它只管这条正则，放到面板顶部会被读成整个歌词过滤的总开关。 */}
            <Row label={t('lyricFilter.enableFilter')} note={t('lyricFilter.regexDescription')}>
                <Toggle checked={isEnabled} onChange={onToggle} />
            </Row>
            <Reveal when={isEnabled}>
                <Row
                    below={(
                        <LyricFilterPatternField
                            value={pattern}
                            onChange={onPatternChange}
                            placeholder={t('lyricFilter.inputPlaceholder')}
                            example={LYRIC_FILTER_REGEX_EXAMPLE}
                            error={error}
                            onClear={() => onPatternChange('')}
                        />
                    )}
                />
            </Reveal>
        </Group>
    );
};

export default LyricFilterRuleSection;
