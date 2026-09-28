const steps = [
  {
    number: '01',
    title: 'Create a game',
    description: 'Start a new room with a single click.',
  },
  {
    number: '02',
    title: 'Invite a friend',
    description: 'Share your room link with a friend.',
  },
  {
    number: '03',
    title: 'Start playing',
    description: 'Make your moves and enjoy the game.',
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-16 sm:py-20 border-t border-border scroll-mt-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold tracking-tight text-center mb-12 sm:mb-16">
          How it works
        </h2>
        <div className="grid gap-8 sm:grid-cols-3">
          {steps.map((step) => (
            <div key={step.number} className="flex flex-col items-center text-center">
              <span className="text-4xl font-bold text-muted-foreground/30 mb-4 select-none">
                {step.number}
              </span>
              <h3 className="text-base font-semibold mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-48">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
