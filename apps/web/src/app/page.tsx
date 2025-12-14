import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="max-w-5xl w-full space-y-8 text-center">
        {/* Hero Section */}
        <div className="space-y-4">
          <h1 className="text-6xl font-bold tracking-tight">
            Stacks Payment Router
          </h1>
          <p className="text-2xl text-muted-foreground max-w-3xl mx-auto">
            Accept payments from any chain. Settle in USDh. Built for AI agents and applications.
          </p>
        </div>

        {/* CTA Buttons */}
        <div className="flex gap-4 justify-center items-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-8"
          >
            Launch App
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-12 px-8"
          >
            Documentation
          </Link>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16">
          <div className="space-y-2">
            <div className="text-4xl">🔗</div>
            <h3 className="text-xl font-semibold">Cross-Chain</h3>
            <p className="text-sm text-muted-foreground">
              Accept ETH, USDC, and more from Ethereum, Arbitrum, Base, and other chains
            </p>
          </div>
          <div className="space-y-2">
            <div className="text-4xl">⚡</div>
            <h3 className="text-xl font-semibold">Instant Settlement</h3>
            <p className="text-sm text-muted-foreground">
              Automatic payment detection and settlement in USDh stablecoin
            </p>
          </div>
          <div className="space-y-2">
            <div className="text-4xl">🤖</div>
            <h3 className="text-xl font-semibold">Built for Agents</h3>
            <p className="text-sm text-muted-foreground">
              Programmable API for AI agents, applications, and developers
            </p>
          </div>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-3 gap-8 mt-16 pt-16 border-t">
          <div className="space-y-2">
            <div className="text-3xl font-bold text-primary">0.5%</div>
            <div className="text-sm text-muted-foreground">Settlement Fee</div>
          </div>
          <div className="space-y-2">
            <div className="text-3xl font-bold text-primary">5+</div>
            <div className="text-sm text-muted-foreground">Supported Chains</div>
          </div>
          <div className="space-y-2">
            <div className="text-3xl font-bold text-primary">100%</div>
            <div className="text-sm text-muted-foreground">Decentralized</div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t text-sm text-muted-foreground">
          <p>Powered by Stacks blockchain • Built with ❤️ for the future of payments</p>
        </div>
      </div>
    </main>
  );
}
