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

// Mock historical data generator
const generateHistoricalData = (rate: number) => {
  return Array.from({ length: 30 }, (_, i) => {
    const day = new Date();
    day.setDate(day.getDate() - (29 - i));
    // Random fluctuation ±5%
    const fluctuation = 1 + (Math.random() * 0.1 - 0.05);
    return {
      date: day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      rate: Number((rate * fluctuation).toFixed(4))
    };
  });
};

export function CurrencyConverter({ className = '' }: { className?: string }) {
  const [amount, setAmount] = useState('100');
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState('EUR');
  const [budget, setBudget] = useState('');
  const [activeTab, setActiveTab] = useState<'convert' | 'budget'>('convert');

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

  const historicalData = conversion ? generateHistoricalData(conversion.rate) : [];

  return (
    <Card className={`bg-ios-card border-ios-gray ${className}`} data-testid="currency-converter">
      <CardHeader>
        <CardTitle className="text-lg font-bold text-white flex justify-between items-center">
          <span>Currency Converter</span>
          <div className="flex bg-ios-darker rounded-lg p-1 space-x-1">
            <button
              onClick={() => setActiveTab('convert')}
              className={`px-3 py-1 rounded text-xs transition-colors ${activeTab === 'convert' ? 'bg-ios-blue text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Convert
            </button>
            <button
              onClick={() => setActiveTab('budget')}
              className={`px-3 py-1 rounded text-xs transition-colors ${activeTab === 'budget' ? 'bg-ios-blue text-white' : 'text-gray-400 hover:text-white'}`}
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
              <label className="block text-sm font-medium text-white mb-1">From</label>
              <Select value={fromCurrency} onValueChange={setFromCurrency}>
                <SelectTrigger className="bg-ios-darker border-ios-gray text-white" data-testid="select-from-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-ios-darker border-ios-gray text-white">
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code} className="hover:bg-ios-card focus:bg-ios-card focus:text-white">
                      {currency.code} - {currency.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-1">To</label>
              <Select value={toCurrency} onValueChange={setToCurrency}>
                <SelectTrigger className="bg-ios-darker border-ios-gray text-white" data-testid="select-to-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-ios-darker border-ios-gray text-white">
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code} className="hover:bg-ios-card focus:bg-ios-card focus:text-white">
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
              className="flex-1 bg-ios-darker border-ios-gray text-white hover:bg-ios-card"
              data-testid="button-swap-currencies"
            >
              <i className="fas fa-exchange-alt mr-2"></i>
              Swap
            </Button>
          </div>

          {activeTab === 'convert' ? (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-white mb-1">Amount</label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="bg-ios-darker border-ios-gray text-white"
                  data-testid="input-amount"
                />
              </div>
              <Button
                onClick={handleConvert}
                className="w-full bg-ios-blue hover:bg-blue-600"
                disabled={isLoading}
                data-testid="button-convert"
              >
                {isLoading ? 'Converting...' : 'Convert'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-white mb-1">Trip Budget ({fromCurrency})</label>
                <Input
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="Total budget"
                  className="bg-ios-darker border-ios-gray text-white"
                />
              </div>
              {conversion && budget && (
                <div className="p-3 bg-ios-darker rounded-lg border border-gray-800">
                  <div className="text-sm text-gray-400">Equivalent in {toCurrency}</div>
                  <div className="text-xl font-bold text-green-400">
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
            <div className="bg-ios-darker rounded-xl p-4" data-testid="conversion-result">
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl font-bold text-ios-blue">
                  {conversion.convertedAmount.toLocaleString()} {CURRENCIES.find(c => c.code === toCurrency)?.symbol}
                </span>
              </div>
              <p className="text-xs text-ios-gray">
                1 {fromCurrency} = {conversion.rate} {toCurrency}
              </p>
              <p className="text-[10px] text-ios-gray mt-1 opacity-70">{conversion.disclaimer}</p>
            </div>

            {/* Historical Chart */}
            <div className="h-[200px] w-full">
              <p className="text-xs text-gray-400 mb-2">30-Day Trend (Approx.)</p>
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
                    contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }}
                    itemStyle={{ color: '#60a5fa' }}
                    formatter={(value: number) => [value, 'Rate']}
                    labelStyle={{ color: '#9ca3af' }}
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
