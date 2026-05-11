// Translate Handler — MyMemory API (free, no API key)

import type { ToolResult } from '../../types';

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

        const sourceLang = args.sourceLang && args.sourceLang !== 'auto' ? args.sourceLang : '';
        const langPair = sourceLang ? `${sourceLang}|${targetLang}` : `en|${targetLang}`;

        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`;
        const res = await fetch(url);

        if (!res.ok) {
            return { success: false, error: `MyMemory API error: ${res.status}`, durationMs: Date.now() - start };
        }

        const data = await res.json();
        const translatedText = data.responseData?.translatedText || '';
        const match = data.responseData?.match;
        const detectedLang = data.responseData?.detectedLanguage || sourceLang || 'auto';

        if (!translatedText) {
            return { success: false, error: 'Translation returned empty result', durationMs: Date.now() - start };
        }

        return {
            success: true,
            data: {
                originalText: text,
                translatedText,
                sourceLang: detectedLang,
                targetLang,
                confidence: typeof match === 'number' ? match : null,
            },
            durationMs: Date.now() - start,
        };
    } catch (err: any) {
        return { success: false, error: err.message || 'Translation failed', durationMs: Date.now() - start };
    }
}
