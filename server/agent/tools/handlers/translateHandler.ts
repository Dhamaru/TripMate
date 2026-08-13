// Translate Handler — delegates to AiUtilitiesService.translate(), the
// same GPT-4o-mini -> NVIDIA -> MyMemory chain the Translator page's own
// UI uses. This previously called MyMemory directly and exclusively —
// MyMemory alone is documented elsewhere in this codebase as producing
// "confidently wrong results even for common phrases" (see
// AiUtilitiesService.ts), so Atlas chat was giving worse translations than
// the dedicated Translator page for the exact same input.

import type { ToolResult } from '../../types';
import { AiUtilitiesService } from '../../../AiUtilitiesService';

export async function translateHandler(args: {
    text: string;
    sourceLang?: string;
    targetLang: string;
}): Promise<ToolResult> {
    const start = Date.now();
    try {
        const text = (args.text || '').trim();
        const targetLang = (args.targetLang || '').trim();

        if (!text) {
            return { success: false, error: 'Text to translate is required', durationMs: Date.now() - start };
        }
        if (!targetLang) {
            return { success: false, error: 'Target language is required', durationMs: Date.now() - start };
        }

        const sourceLang = args.sourceLang && args.sourceLang !== 'auto' ? args.sourceLang : 'auto';
        const aiUtils = new AiUtilitiesService();
        const result = await aiUtils.translate(text, sourceLang, targetLang);

        return {
            success: true,
            data: {
                originalText: text,
                translatedText: result.translatedText,
                sourceLang,
                targetLang,
                pronunciation: result.pronunciation,
                source: result.source,
            },
            durationMs: Date.now() - start,
        };
    } catch (err: any) {
        return { success: false, error: err.message || 'Translation failed', durationMs: Date.now() - start };
    }
}
