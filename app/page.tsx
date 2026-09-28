import {
  SiteHeader,
  HeroSection,
  HowItWorksSection,
  FeaturesSection,
  CtaSection,
  SiteFooter,
} from '@/components/site';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        <HeroSection />
        <HowItWorksSection />
        <FeaturesSection />
        <CtaSection />
      </main>
      <SiteFooter />
    </div>
  );
}
