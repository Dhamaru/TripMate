import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const LANGUAGES = [
  { code: 'auto', name: 'Detect Language' },
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'kn', name: 'Kannada' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'mr', name: 'Marathi' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'bn', name: 'Bengali' },
  { code: 'ur', name: 'Urdu' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'es', name: 'Spanish' },
];

interface TranslationResult {
  translatedText: string;
  pronunciation?: string;
  meaning?: string;
}

export function LanguageTranslator({ className = '' }: { className?: string }) {
  const [text, setText] = useState('');
  const [fromLanguage, setFromLanguage] = useState('en');
  const [toLanguage, setToLanguage] = useState('hi');
  const { toast } = useToast();

  const { data: translation, isLoading, refetch } = useQuery<TranslationResult>({
    queryKey: ['/translate', fromLanguage, toLanguage, text],
    enabled: false,
    queryFn: async ({ queryKey }) => {
      const [, from, to, inputRaw] = queryKey as [string, string, string, string];
      const payload = { text: String(inputRaw), sourceLang: String(from), targetLang: String(to) };
      const res = await apiRequest('POST', '/api/v1/translate', payload);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message = res.status === 429
          ? "Too many requests — please wait a moment and try again."
          : (body?.error || body?.message || `Translation failed (${res.status}).`);
        throw new Error(message);
      }
      const data = await res.json();
      return {
        translatedText: String(data?.translatedText || ''),
        pronunciation: String(data?.pronunciation || ''),
        meaning: String(data?.meaning || '')
      };
    },
  });

  const handleTranslateClick = async () => {
    if (!text.trim()) return;
    const result = await refetch();
    if (result.error) {
      toast({
        title: "Translation failed",
        description: result.error instanceof Error ? result.error.message : "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }
  };

  const swapLanguages = () => {
    setFromLanguage(toLanguage);
    setToLanguage(fromLanguage);
  };

  return (
    <Card className={`bg-card border p-4 space-y-4 ${className}`} data-testid="language-translator">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-foreground">Language Translator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="block text-sm text-foreground mb-1">Text to Translate</label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleTranslateClick();
              }
            }}
            placeholder="Enter text..."
            className="bg-muted border text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm text-foreground mb-1">From</label>
            <Select value={fromLanguage} onValueChange={setFromLanguage}>
              <SelectTrigger className="bg-muted border text-foreground">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent className="bg-card border">
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code} className="text-foreground">
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="self-end bg-muted border text-foreground hover:bg-muted/80" type="button" onClick={swapLanguages} variant="outline">⇄</Button>
          <div className="flex-1">
            <label className="block text-sm text-foreground mb-1">To</label>
            <Select value={toLanguage} onValueChange={setToLanguage}>
              <SelectTrigger className="bg-muted border text-foreground">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent className="bg-card border">
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code} className="text-foreground">
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={handleTranslateClick} className="w-full bg-[#1D4E89] hover:bg-blue-800" disabled={isLoading || !text.trim()}>Translate</Button>
        {isLoading ? (
          <Skeleton className="w-full h-20" />
        ) : translation?.translatedText ? (
          <div className="p-3 border rounded bg-muted">
            <strong className="text-[#1D4E89] dark:text-blue-400">Result:</strong>
            <p className="text-emerald-600 dark:text-emerald-400 mt-1 text-lg">{translation.translatedText}</p>
            {translation.pronunciation && (
              <p className="text-muted-foreground mt-2 text-sm italic border-t pt-1">
                Pronunciation: {translation.pronunciation}
              </p>
            )}
            {translation.meaning && (
              <p className="text-muted-foreground mt-1 text-sm border-t pt-1">
                Meaning: {translation.meaning}
              </p>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
