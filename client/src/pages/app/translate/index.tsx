import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { LanguageTranslator } from "@/components/LanguageTranslator";

export default function TranslatePage() {
  const { user } = useAuth() as { user: any };
  const [, navigate] = useLocation();

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Language Translator</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Offline translation for 10+ languages
        </p>
      </div>
      <LanguageTranslator className="w-full" />
    </div>
  );
}
