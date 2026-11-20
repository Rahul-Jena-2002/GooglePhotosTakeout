import { Shield, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 mt-20 min-h-[105vh]">
      <div className="text-center mb-16">
        <Shield className="w-16 h-16 text-indigo-400 mx-auto mb-6" />
        <h1 className="text-4xl md:text-5xl font-bold tracking-tighter mb-4">Privacy Policy</h1>
        <p className="text-xl text-white/60">The browser restore tool processes selected media on your device.</p>
      </div>

      <div className="space-y-12 text-white/80 leading-relaxed">
        
        <section className="bg-white/5 border border-white/10 rounded-2xl p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
          <h2 className="text-2xl font-bold text-white mb-4">The TakeoutFix Guarantee</h2>
          <p className="text-lg mb-4">
            <strong>The browser restore tool processes selected media on your device.</strong> It does not upload those selected photo or video files to TakeoutFix. Other website features, such as sign-in, support, diagnostics, and advertising, use network services described below.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">Data the browser restore tool does not upload</h2>
          <p className="mb-4">The restore tool processes the following locally. Please avoid including sensitive file details in a support request unless you choose to share them.</p>
          <ul className="grid md:grid-cols-2 gap-4">
            {['Photos', 'Videos', 'EXIF metadata', 'GPS coordinates', 'File contents', 'Folder contents', 'Album contents', 'Personal media'].map(item => (
              <li key={item} className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 text-red-200 rounded-lg p-4">
                <ShieldAlert className="w-5 h-5 text-red-400" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">Data We DO Collect</h2>
          <p className="mb-4">To provide and improve our service, we collect minimal operational data:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Google Account Information:</strong> For authentication and account management.</li>
            <li><strong>Purchase Information:</strong> Handled securely by our payment processors; we only store plan entitlement data.</li>
            <li><strong>Support Tickets:</strong> Any information you voluntarily provide when contacting support.</li>
            <li><strong>Diagnostics and usage:</strong> Operational information can be sent to services used to identify errors and understand site usage. Information you provide in support requests may include personal details.</li>
            <li><strong>Recovery statistics:</strong> Counts such as files processed and bytes processed may be saved for usage and platform statistics.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">Local Processing</h2>
          <p>
            The browser restore tool uses Web Workers and available browser file APIs to match files and write metadata locally. Other features, including support and diagnostics, can send information to network services.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">Cookies & Advertising Disclosure</h2>
          <p className="mb-3">
            We use essential cookies for authentication and session management. We do not sell your personal data to third parties. We use Firebase for backend services (Auth, Firestore, Hosting, Analytics) and secure payment gateways for processing transactions.
          </p>
          <p className="mb-3">
            <strong>Third-Party Advertising:</strong> Third-party vendors, including Google, use cookies to serve ads based on a user's prior visits to this website or other websites. Google's use of advertising cookies enables it and its partners to serve ads to users based on their visits to our site and/or other sites on the Internet.
          </p>
          <p>
            Users may opt out of personalized advertising at any time by visiting <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 underline">Google Ads Settings</a> or by visiting <a href="https://www.aboutads.info/choices/" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 underline">www.aboutads.info</a>.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">Contact</h2>
          <p>
            If you have questions about this privacy policy, please contact us via our <Link to="/support" className="text-indigo-400 hover:text-indigo-300">Support Page</Link>, the support widget, or directly via email at <a href="mailto:takeoutfix.support@gmail.com" className="text-indigo-400 hover:text-indigo-300 font-semibold underline">takeoutfix.support@gmail.com</a>.
          </p>
        </section>

      </div>
    </div>
  )
}
