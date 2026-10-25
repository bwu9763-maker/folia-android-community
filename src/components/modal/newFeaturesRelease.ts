import { Bot, Flame, Keyboard, Radio, Shuffle, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// src/components/modal/newFeaturesRelease.ts

type NewFeatureCard = {
    id: string;
    icon: LucideIcon;
};

type NewFeaturesRelease = {
    i18nKey: string;
    /** 重大更新：介绍上方显示「<代号> Update · 重大更新」标签；代号不翻译，文案在 help.majorUpdateLabel。 */
    majorUpdate?: { codename: string };
    features: NewFeatureCard[];
};

// Defines the current release's cards; their localized text lives under i18nKey in every locale.
export const NEW_FEATURES_RELEASE: NewFeaturesRelease = {
    i18nKey: 'releaseNotes.v0_7_22',
    majorUpdate: { codename: 'Sparkle' },
    features: [
        { id: 'qishui', icon: Radio },
        { id: 'hanabi', icon: Flame },
        { id: 'randomStyles', icon: Shuffle },
        { id: 'globalShortcuts', icon: Keyboard },
        { id: 'aiProviders', icon: Bot },
        { id: 'moreDetails', icon: Sparkles },
    ],
};
