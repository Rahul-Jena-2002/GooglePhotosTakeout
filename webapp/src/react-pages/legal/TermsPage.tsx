import { Link } from "react-router-dom";

export default function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 mt-20 min-h-[105vh]">
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tighter mb-4">Terms of Service</h1>
        <p className="text-xl text-white/60">Last updated: June 11, 2026</p>
      </div>

      <div className="space-y-12 text-white/80 leading-relaxed">
        
        <section>
          <h2 className="text-2xl font-bold text-white mb-4">1. Acceptance of Terms</h2>
          <p>
            By accessing and using TakeoutFix, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our service.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">2. License Grant</h2>
          <p>
            The source code is made available under the GNU General Public License, version 2 or (at your option) any later version. See the repository's LICENSE file for the terms. The license permits copying and redistribution subject to its conditions; it does not grant rights to the TakeoutFix name, logo, or other project branding. Third-party components and assets may have separate licenses.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">3. User Responsibilities</h2>
          <p>
            You agree to use TakeoutFix only for lawful purposes. You are responsible for ensuring you have the legal right to process the Google Takeout data you provide to the application.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">4. Software Access</h2>
          <p>
            The browser tool processes selected media files on your device. Guest processing limits and any account features are shown in the tool and may change. The MIT license covers the published source code; it does not guarantee hosted service availability or unlimited hosted processing.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">5. Limitation of Liability</h2>
          <p>
            TakeoutFix modifies local files at your request. We strongly recommend maintaining backups of your original Google Takeout exports and destination folders. TakeoutFix is provided "as is" without warranty of any kind. In no event shall we be liable for data loss, corruption, or indirect damages arising from the use of this software.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">6. Termination</h2>
          <p>
            We reserve the right to suspend or terminate your access to the service if you violate these terms. You may terminate your account at any time by contacting support.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">7. Governing Law</h2>
          <p>
            These terms are governed by the laws of your jurisdiction. Any disputes shall be resolved in the competent courts of that jurisdiction.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">8. Contact</h2>
          <p>
            If you have questions about these Terms of Service, please contact us via our <Link to="/support" className="text-indigo-400 hover:text-indigo-300">Support Page</Link> or directly via email at <a href="mailto:takeoutfix.support@gmail.com" className="text-indigo-400 hover:text-indigo-300 font-semibold underline">takeoutfix.support@gmail.com</a>.
          </p>
        </section>

      </div>
    </div>
  )
}
