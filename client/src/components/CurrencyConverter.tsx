import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
];

interface ConversionResult {
  rate: number;
  convertedAmount: number;
  currencyName: string;
  disclaimer: string;
}


export function CurrencyConverter({ className = '' }: { className?: string }) {
  const [amount, setAmount] = useState('100');
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState('EUR');
  const [budget, setBudget] = useState('');
  const [activeTab, setActiveTab] = useState<'convert' | 'budget'>('convert');

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 29);
  const startDateStr = startDate.toISOString().split('T')[0];

  const { data: historicalData = [] } = useQuery<{ date: string; rate: number }[]>({
    queryKey: ['/frankfurter/history', fromCurrency, toCurrency],
    queryFn: async () => {
      try {
        const r = await fetch(
          `https://api.frankfurter.app/${startDateStr}..?from=${fromCurrency}&to=${toCurrency}`
        );
        if (!r.ok) return [];
        const json = await r.json();
        return Object.entries(json.rates as Record<string, Record<string, number>>).map(([date, rates]) => ({
          date: new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          rate: rates[toCurrency] ?? 0,
        }));
      } catch { return []; }
    },
    staleTime: 60 * 60 * 1000,
  });

  const { data: conversion, isLoading, refetch } = useQuery<ConversionResult>({
    queryKey: ['/api/v1/currency', fromCurrency, toCurrency, amount],
    queryFn: async ({ queryKey }) => {
      const [, from, to, amt] = queryKey as [string, string, string, string];
      const cacheKey = `currency_rate_${from}_${to}`;

      try {
        // Try to fetch fresh data
        const url = `/api/v1/currency?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&amount=${encodeURIComponent(amt)}`;
        const res = await apiRequest('GET', url);
        const data = await res.json();

        // Cache the successful rate
        localStorage.setItem(cacheKey, JSON.stringify({
          rate: data.rate,
          timestamp: Date.now()
        }));

        return data;
      } catch (err) {
        // Fallback to cache if available
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const { rate } = JSON.parse(cached);
          const amtNum = parseFloat(amt) || 0;
          return {
            rate,
            convertedAmount: Math.round(amtNum * rate * 100) / 100,
            currencyName: to,
            disclaimer: 'Offline mode: Using cached rate'
          };
        }

        // Hard fallback if no cache
        const baseRates: Record<string, number> = { USD: 1, EUR: 0.92, GBP: 0.79, JPY: 155, INR: 83, CAD: 1.36, AUD: 1.52, CHF: 0.9, CNY: 7.2 };
        const fromRate = baseRates[from] ?? 1;
        const toRate = baseRates[to] ?? 1;
        const rate = Math.round((toRate / fromRate) * 10000) / 10000;
        const amtNum = parseFloat(amt) || 0;
        return {
          rate,
          convertedAmount: Math.round(amtNum * rate * 100) / 100,
          currencyName: to,
          disclaimer: 'Offline mode: Using estimated rate'
        } as ConversionResult;
      }
    },
  });

  const handleConvert = () => {
    if (amount && fromCurrency && toCurrency) {
      refetch();
    }
  };

  const swapCurrencies = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
  };

  return (
    <Card className={`bg-card border ${className}`} data-testid="currency-converter">
      <CardHeader>
        <CardTitle className="text-lg font-bold text-foreground flex justify-between items-center">
          <span>Currency Converter</span>
          <div className="flex bg-muted rounded-lg p-1 space-x-1">
            <button
              onClick={() => setActiveTab('convert')}
              className={`px-3 py-1 rounded text-xs transition-colors ${activeTab === 'convert' ? 'bg-[#1E3A8A] text-white' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Convert
            </button>
            <button
              onClick={() => setActiveTab('budget')}
              className={`px-3 py-1 rounded text-xs transition-colors ${activeTab === 'budget' ? 'bg-[#1E3A8A] text-white' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Budget
            </button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Converter / Budget Tab */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">From</label>
              <Select value={fromCurrency} onValueChange={setFromCurrency}>
                <SelectTrigger className="bg-muted border text-foreground" data-testid="select-from-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border text-foreground">
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code} className="text-foreground">
                      {currency.code} - {currency.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">To</label>
              <Select value={toCurrency} onValueChange={setToCurrency}>
                <SelectTrigger className="bg-muted border text-foreground" data-testid="select-to-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border text-foreground">
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code} className="text-foreground">
                      {currency.code} - {currency.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex space-x-2">
            <Button
              onClick={swapCurrencies}
              variant="outline"
              className="flex-1 bg-muted border text-foreground hover:bg-muted/80"
              data-testid="button-swap-currencies"
            >
              <i className="fas fa-exchange-alt mr-2"></i>
              Swap
            </Button>
          </div>

          {activeTab === 'convert' ? (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Amount</label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="bg-muted border text-foreground"
                  data-testid="input-amount"
                />
              </div>
              <Button
                onClick={handleConvert}
                className="w-full bg-[#1E3A8A] hover:bg-blue-800"
                disabled={isLoading}
                data-testid="button-convert"
              >
                {isLoading ? 'Converting...' : 'Convert'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Trip Budget ({fromCurrency})</label>
                <Input
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="Total budget"
                  className="bg-muted border text-foreground"
                />
              </div>
              {conversion && budget && (
                <div className="p-3 bg-muted rounded-lg border">
                  <div className="text-sm text-muted-foreground">Equivalent in {toCurrency}</div>
                  <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                    {Math.round(parseFloat(budget) * conversion.rate).toLocaleString()} {CURRENCIES.find(c => c.code === toCurrency)?.symbol}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Result & Chart */}
        {isLoading && (
          <div className="space-y-2" data-testid="conversion-loading">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        )}

        {conversion && activeTab === 'convert' && (
          <div className="space-y-4">
            <div className="bg-muted rounded-xl p-4" data-testid="conversion-result">
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl font-bold text-[#1E3A8A] dark:text-blue-400">
                  {(conversion.convertedAmount ?? 0).toLocaleString()} {CURRENCIES.find(c => c.code === toCurrency)?.symbol}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                1 {fromCurrency} = {conversion.rate} {toCurrency}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1 opacity-70">{conversion.disclaimer}</p>
            </div>

            {/* Historical Chart */}
            <div className="h-[200px] w-full">
              <p className="text-xs text-muted-foreground mb-2">30-Day Trend</p>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historicalData}>
                  <defs>
                    <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" hide />
                  <YAxis hide domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                    itemStyle={{ color: '#1E3A8A' }}
                    formatter={(value: number) => [value, 'Rate']}
                    labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                  />
                  <Area type="monotone" dataKey="rate" stroke="#3b82f6" fillOpacity={1} fill="url(#colorRate)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
