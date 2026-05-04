export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-gray-50 py-10 mt-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🦘</span>
            <span className="font-bold text-gray-900">OzVisa</span>
          </div>
          <div className="text-sm text-gray-500 text-center">
            <p>Powered by Claude AI · Secure payments via Stripe</p>
            <p className="mt-1">
              Not affiliated with the Australian Government ·{" "}
              <a
                href="https://immi.homeaffairs.gov.au"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                immi.homeaffairs.gov.au
              </a>
            </p>
          </div>
          <div className="flex gap-4 text-sm text-gray-500">
            <a
              href="https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-600"
            >
              WHV 417
            </a>
            <a
              href="https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-and-holiday-462"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-600"
            >
              WHV 462
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
