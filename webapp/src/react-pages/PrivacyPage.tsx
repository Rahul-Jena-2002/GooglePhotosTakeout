import { Shield, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 mt-20 min-h-[105vh]">
      <div className="text-center mb-16">
        <Shield className="w-16 h-16 text-indigo-400 mx-auto mb-6" />
        <h1 className="text-4xl md:text-5xl font-bold tracking-tighter mb-4">Privacy Policy</h1>
        <p className="text-xl text-white/60">Your files are yours. They never leave your device.</p>
      </div>

      <div className="space-y-12 text-white/80 leading-relaxed">
        
        <section className="bg-white/5 border border-white/10 rounded-2xl p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
          <h2 className="text-2xl font-bold text-white mb-4">The TakeoutFix Guarantee</h2>
          <p className="text-lg mb-4">
            <strong>TakeoutFix never uploads your files.</strong> We believe in local processing. Your photos, videos, and metadata remain strictly on your local device at all times.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">Data We DO NOT Collect</h2>
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
            <li><strong>Anonymous Analytics:</strong> General usage data to help us identify bugs and improve UX.</li>
            <li><strong>Recovery Statistics:</strong> High-level aggregated metrics (e.g., number of files processed, success rates) to power our platform statistics. We do not know *what* files were processed.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">Local Processing</h2>
          <p>
            The core TakeoutFix engine runs entirely within your web browser using Web Workers and the File System Access API. All matching, metadata parsing, and deep EXIF injection happens locally using your device's CPU and RAM. No server receives your Takeout data.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">Cookies & Third Parties</h2>
          <p>
            We use essential cookies for authentication and session management. We do not sell your data to third parties. We use Firebase for backend services (Auth, Firestore, Hosting, Analytics) and secure payment gateways for processing transactions.
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
