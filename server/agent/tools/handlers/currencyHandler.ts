// Currency Handler — Frankfurter API (free, no API key)

import type { ToolResult } from '../../types';
import { cacheService, CACHE_TTL } from '../../../cache';

export async function currencyHandler(args: {
    amount: number;
    from: string;
    to: string;
}): Promise<ToolResult> {
    const start = Date.now();
    try {
        const from = args.from.toUpperCase();
        const to = args.to.toUpperCase();
        const amount = Number(args.amount);

        if (!Number.isFinite(amount) || amount <= 0) {
            return { success: false, error: 'Amount must be a positive number', durationMs: Date.now() - start };
        }

        // Cache key on the pair, not the amount — rate is same for all amounts
        const cacheKey = `currency:${from}:${to}`;
        const cachedRate = cacheService.get<number>(cacheKey);
        if (cachedRate !== undefined) {
            return {
                success: true,
                data: {
                    amount,
                    from,
                    to,
                    convertedAmount: Math.round(amount * cachedRate * 100) / 100,
                    rate: Math.round(cachedRate * 10000) / 10000,
                    timestamp: new Date().toISOString().slice(0, 10),
                    cached: true,
                },
                durationMs: 0,
            };
        }

        const url = `https://api.frankfurter.app/latest?amount=${amount}&from=${from}&to=${to}`;
        const res = await fetch(url);

        if (!res.ok) {
            const body = await res.text();
            return { success: false, error: `Frankfurter API error: ${res.status} — ${body}`, durationMs: Date.now() - start };
        }

        const data = await res.json();
        const convertedAmount = data.rates?.[to];

        if (convertedAmount === undefined) {
            return { success: false, error: `Currency '${to}' not supported by Frankfurter API`, durationMs: Date.now() - start };
        }

        const rate = convertedAmount / amount;
        cacheService.set(cacheKey, rate, CACHE_TTL.CURRENCY);

        return {
            success: true,
            data: {
                amount,
                from,
                to,
                convertedAmount: Math.round(convertedAmount * 100) / 100,
                rate: Math.round(rate * 10000) / 10000,
                timestamp: data.date || new Date().toISOString().slice(0, 10),
            },
            durationMs: Date.now() - start,
        };
    } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : 'Currency conversion failed', durationMs: Date.now() - start };
    }
}
