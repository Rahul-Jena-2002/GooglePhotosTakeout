import { Link } from "react-router-dom";

export default function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 mt-20">
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
            TakeoutFix grants you a personal, non-exclusive, non-transferable license to use the software solely for recovering metadata from your own Google Takeout exports. The software operates locally on your device.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">3. User Responsibilities</h2>
          <p>
            You agree to use TakeoutFix only for lawful purposes. You are responsible for ensuring you have the legal right to process the Google Takeout data you provide to the application.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">4. Payment & Refunds</h2>
          <p>
            Paid plans (Recovery Pass, Pro, Super) unlock higher limits and premium features. All plans utilize the identical recovery engine. For our detailed refund policy, please refer to the refund section on our <Link to="/support?tab=faq" className="text-indigo-400 hover:text-indigo-300 font-bold">Help & Support FAQ Page</Link>.
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
