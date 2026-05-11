import { motion } from 'framer-motion';
import { Award, Sparkles, MapPin, Calendar, Heart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';

interface Props {
  recap: {
    title: string;
    summary: string;
    highlights: string[];
    memorableMoment?: string;
    travelTip?: string;
    awards?: Array<{ title: string; icon: string; description: string }>;
    visualVibe?: string;
  };
  destination: string;
}

export function RecapCard({ recap, destination }: Props) {
  const container = {
    hidden: { opacity: 0, scale: 0.95 },
    show: {
      opacity: 1,
      scale: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.3
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  // Determine a background gradient based on the visualVibe signal
  const getVibeGradient = (vibe?: string) => {
    const v = vibe?.toLowerCase() || '';
    if (v.includes('neon') || v.includes('city')) return 'from-indigo-600/20 via-purple-600/10 to-transparent';
    if (v.includes('mountain') || v.includes('mist')) return 'from-slate-700/20 via-slate-500/10 to-transparent';
    if (v.includes('sunny') || v.includes('beach') || v.includes('tropical')) return 'from-amber-500/20 via-orange-400/10 to-transparent';
    if (v.includes('green') || v.includes('jungle') || v.includes('forest')) return 'from-emerald-600/20 via-teal-500/10 to-transparent';
    return 'from-primary/20 via-primary/5 to-transparent';
  };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="recap-card-container relative overflow-hidden rounded-3xl border border-primary/20 bg-card p-1 shadow-2xl"
    >
      {/* Decorative Vibe Background */}
      <div className={`absolute inset-0 bg-gradient-to-br ${getVibeGradient(recap.visualVibe)} blur-3xl opacity-50 -z-10`} />

      <Card className="border-none bg-transparent/40 backdrop-blur-md">
        <CardHeader className="text-center pb-2">
          <motion.div variants={item} className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-primary/10 border border-primary/20">
              <Sparkles className="h-8 w-8 text-primary animate-pulse" />
            </div>
          </motion.div>
          <motion.div variants={item}>
            <CardTitle className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
              {recap.title}
            </CardTitle>
            <p className="text-muted-foreground font-medium flex items-center justify-center gap-1.5 mt-2">
              <MapPin className="h-4 w-4" /> {destination} • Journey Achievements
            </p>
          </motion.div>
        </CardHeader>

        <CardContent className="space-y-8">
          {/* Summary Section */}
          <motion.div variants={item} className="text-center px-4 italic text-lg leading-relaxed text-foreground/80">
            "{recap.summary}"
          </motion.div>

          {/* Awards Grid */}
          {recap.awards && recap.awards.length > 0 && (
            <motion.div variants={item} className="space-y-4">
              <h3 className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/60 flex items-center justify-center gap-2">
                <div className="h-[1px] w-8 bg-muted-foreground/20" /> 
                Badges Earned 
                <div className="h-[1px] w-8 bg-muted-foreground/20" />
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {recap.awards.map((award, idx) => (
                  <motion.div
                    key={idx}
                    whileHover={{ y: -5, scale: 1.02 }}
                    className="flex items-center gap-4 p-4 rounded-2xl bg-primary/5 border border-primary/10 transition-all hover:bg-primary/10 group"
                  >
                    <div className="text-3xl transform transition-transform group-hover:rotate-12 group-hover:scale-110 duration-200">
                      {award.icon}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-foreground">{award.title}</h4>
                      <p className="text-xs text-muted-foreground leading-tight">{award.description}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Stats/Highlights */}
          <div className="grid grid-cols-2 gap-4">
             <motion.div variants={item} className="p-4 rounded-2xl bg-muted/30 border border-border/50 text-center">
                <Heart className="h-4 w-4 mx-auto mb-2 text-rose-500" />
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-tighter">Memorable Moment</p>
                <p className="text-sm font-semibold mt-1 truncate">{recap.memorableMoment || "The whole trip!"}</p>
             </motion.div>
             <motion.div variants={item} className="p-4 rounded-2xl bg-muted/30 border border-border/50 text-center">
                <Calendar className="h-4 w-4 mx-auto mb-2 text-sky-500" />
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-tighter">Atlas Wisdom</p>
                <p className="text-sm font-semibold mt-1 truncate">{recap.travelTip || "Stay grounded."}</p>
             </motion.div>
          </div>

          {/* Social Proof Footer */}
          <motion.div variants={item} className="pt-4 text-center border-t border-border/20">
             <Button variant="outline" size="sm" className="rounded-full gap-2 hover:bg-primary hover:text-white transition-all">
                Share My Journey
             </Button>
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
