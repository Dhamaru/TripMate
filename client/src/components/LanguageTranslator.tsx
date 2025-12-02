import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";

const LANGUAGES = [
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
}

export function LanguageTranslator({ className = '' }: { className?: string }) {
  const [text, setText] = useState('');
  const [fromLanguage, setFromLanguage] = useState('en');
  const [toLanguage, setToLanguage] = useState('hi');

  const { data: translation, isLoading, refetch } = useQuery<TranslationResult>({
    queryKey: ['/translate', fromLanguage, toLanguage, text],
    enabled: false,
    queryFn: async ({ queryKey }) => {
      const [, from, to, inputRaw] = queryKey as [string, string, string, string];
      const input = String(inputRaw);
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(input)}`;
      try {
        const response = await fetch(url);
        const data: any = await response.json();
        const translated = Array.isArray(data?.[0]) ? data[0].map((it: any) => it?.[0]).join("") : "";
        if (translated) return { translatedText: translated };
      } catch {}
      const payload = { text: input, sourceLang: String(from), targetLang: String(to) };
      const res = await apiRequest('POST', '/api/v1/translate', payload);
      const fallbackData = await res.json();
      return { translatedText: String(fallbackData?.translatedText || '') };
    },
  });

  const handleTranslate = () => {
    if (text.trim()) refetch();
  };

  const swapLanguages = () => {
    setFromLanguage(toLanguage);
    setToLanguage(fromLanguage);
  };

  return (
    <Card className={`bg-ios-card border-ios-gray p-4 space-y-4 ${className}`} data-testid="language-translator">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-white">Language Translator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="block text-sm text-white mb-1">Text to Translate</label>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Enter text..." className="bg-ios-darker border-ios-gray text-white" />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm text-white mb-1">From</label>
            <Select value={fromLanguage} onValueChange={setFromLanguage}>
              <SelectTrigger className="bg-ios-darker border-ios-gray text-white">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent className="bg-ios-darker border-ios-gray">
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code} className="text-white hover:bg-ios-card">
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="self-end bg-ios-darker border-ios-gray text-white hover:bg-ios-card" type="button" onClick={swapLanguages} variant="outline">⇄</Button>
          <div className="flex-1">
            <label className="block text-sm text-white mb-1">To</label>
            <Select value={toLanguage} onValueChange={setToLanguage}>
              <SelectTrigger className="bg-ios-darker border-ios-gray text-white">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent className="bg-ios-darker border-ios-gray">
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code} className="text-white hover:bg-ios-card">
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={handleTranslate} className="w-full bg-ios-blue hover:bg-blue-600" disabled={isLoading || !text.trim()}>Translate</Button>
        {isLoading ? (
          <Skeleton className="w-full h-20" />
        ) : translation?.translatedText ? (
          <div className="p-3 border border-ios-gray rounded bg-ios-darker">
            <strong className="text-ios-blue">Result:</strong>
            <p className="text-green-400 mt-1">{translation.translatedText}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
