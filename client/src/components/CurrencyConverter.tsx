import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

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
  from: string;
  to: string;
  originalAmount: number;
  convertedAmount: number;
  rate: number;
}

export function CurrencyConverter({ className = '' }: { className?: string }) {
  const [amount, setAmount] = useState('100');
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState('EUR');

  const { data: conversion, isLoading, refetch } = useQuery<ConversionResult>({
    queryKey: ['/api/currency/convert', fromCurrency, toCurrency, amount],
    enabled: false, // Only fetch when manually triggered
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
    <Card className={`bg-ios-card border-ios-gray ${className}`} data-testid="currency-converter">
      <CardHeader>
        <CardTitle className="text-lg font-bold text-white">Currency Converter</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-white mb-1">From</label>
              <Select value={fromCurrency} onValueChange={setFromCurrency}>
                <SelectTrigger className="bg-ios-darker border-ios-gray text-white" data-testid="select-from-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-ios-darker border-ios-gray">
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code} className="text-white hover:bg-ios-card">
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
                <SelectContent className="bg-ios-darker border-ios-gray">
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code} className="text-white hover:bg-ios-card">
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
            <Button 
              onClick={handleConvert}
              className="flex-1 bg-ios-blue hover:bg-blue-600"
              disabled={isLoading}
              data-testid="button-convert"
            >
              {isLoading ? 'Converting...' : 'Convert'}
            </Button>
          </div>
        </div>

        {isLoading && (
          <div className="space-y-2" data-testid="conversion-loading">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        )}

        {conversion && (
          <div className="bg-ios-darker rounded-xl p-4" data-testid="conversion-result">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-ios-gray">
                {conversion.originalAmount} {conversion.from}
              </span>
              <span className="text-lg font-bold text-ios-blue">
                {conversion.convertedAmount} {conversion.to}
              </span>
            </div>
            <p className="text-xs text-ios-gray">
              Exchange rate: 1 {conversion.from} = {conversion.rate} {conversion.to}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
