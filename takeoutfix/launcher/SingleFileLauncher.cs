using System;
using System.IO;
using System.IO.Compression;
using System.Diagnostics;
using System.Reflection;
using System.Net;
using System.Windows.Forms;
using System.Threading;
using System.Drawing;

// FIXED VERSION - never increment this; only the payload changes per release.
// Keeping this binary identical across releases = SmartScreen reputation accumulates permanently.
[assembly: AssemblyTitle("TakeoutFix")]
[assembly: AssemblyDescription("Google Takeout Photo Metadata Restorer")]
[assembly: AssemblyProduct("TakeoutFix")]
[assembly: AssemblyCompany("TakeoutFix")]
[assembly: AssemblyCopyright("Copyright 2026 TakeoutFix")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]
[assembly: AssemblyInformationalVersion("1.0.0")]

namespace TakeoutFix {
    static class SingleFileLauncher {
        const string PAYLOAD_URL = "https://takeoutfix-download.takeoutfix.workers.dev/download/windows/payload";

        [STAThread]
        static int Main(string[] args) {
            try {
                string appDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "TakeoutFix", "app");
                string exePath  = Path.Combine(appDir, "TakeoutFix.exe");
                string verFile  = Path.Combine(appDir, ".app_version");

                bool   needsDownload  = !File.Exists(exePath) || !File.Exists(verFile);
                string remoteVersion  = null;

                if (!needsDownload) {
                    // HEAD request to check for a newer payload (5s timeout so offline still works)
                    try {
                        var req = (HttpWebRequest)WebRequest.Create(PAYLOAD_URL);
                        req.Method    = "HEAD";
                        req.UserAgent = "TakeoutFix-Launcher/1.0";
                        req.Timeout   = 5000;
                        using (var resp = (HttpWebResponse)req.GetResponse())
                            remoteVersion = resp.Headers["X-App-Version"];

                        string local = File.ReadAllText(verFile).Trim();
                        if (!string.IsNullOrEmpty(remoteVersion) && local != remoteVersion)
                            needsDownload = true;
                    } catch { /* offline — run existing install */ }
                }

                if (needsDownload) {
                    if (!RunDownloadUI(appDir, verFile, remoteVersion))
                        return 1;
                }

                if (!File.Exists(exePath)) {
                    MessageBox.Show("TakeoutFix could not be installed.", "TakeoutFix",
                        MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return 1;
                }

                Process.Start(new ProcessStartInfo {
                    FileName         = exePath,
                    Arguments        = string.Join(" ", args),
                    WorkingDirectory = appDir,
                    UseShellExecute  = false
                });
                return 0;
            } catch (Exception ex) {
                MessageBox.Show(ex.Message, "TakeoutFix Launch Error",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }

        static bool RunDownloadUI(string appDir, string verFile, string knownVersion) {
            bool success = false;
            var t = new Thread(() => {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                using (var f = new DownloadForm(appDir, verFile, PAYLOAD_URL, knownVersion)) {
                    Application.Run(f);
                    success = f.Success;
                }
            });
            t.SetApartmentState(ApartmentState.STA);
            t.Start();
            t.Join();
            return success;
        }
    }

    sealed class DownloadForm : Form {
        public bool Success { get; private set; }

        readonly string _appDir, _verFile, _url, _knownVer;
        Label       _status;
        ProgressBar _bar;
        WebClient   _client;

        public DownloadForm(string appDir, string verFile, string url, string knownVer) {
            _appDir   = appDir;
            _verFile  = verFile;
            _url      = url;
            _knownVer = knownVer;

            Text            = "TakeoutFix";
            ClientSize      = new Size(440, 110);
            FormBorderStyle = FormBorderStyle.FixedSingle;
            StartPosition   = FormStartPosition.CenterScreen;
            MaximizeBox     = false;
            MinimizeBox     = false;
            BackColor       = Color.FromArgb(18, 18, 18);

            var icon = new Label {
                Text      = "TakeoutFix",
                ForeColor = Color.FromArgb(99, 179, 237),
                Font      = new Font("Segoe UI", 10f, FontStyle.Bold),
                Left = 16, Top = 12, AutoSize = true
            };
            _status = new Label {
                Text      = "Preparing download...",
                ForeColor = Color.FromArgb(200, 200, 200),
                Font      = new Font("Segoe UI", 9f),
                Left = 16, Top = 36, Width = 408, AutoSize = true
            };
            _bar = new ProgressBar { Left = 16, Top = 66, Width = 408, Height = 20 };

            Controls.Add(icon);
            Controls.Add(_status);
            Controls.Add(_bar);

            Shown       += (s, e) => BeginDownload();
            FormClosing += (s, e) => { if (_client != null) _client.CancelAsync(); };
        }

        void BeginDownload() {
            _client = new WebClient();
            _client.Headers["User-Agent"] = "TakeoutFix-Launcher/1.0";
            _client.DownloadProgressChanged += (s, e) => {
                _bar.Value = e.ProgressPercentage;
                long rcv   = e.BytesReceived / 1048576;
                long total = e.TotalBytesToReceive > 0 ? e.TotalBytesToReceive / 1048576 : 0;
                _status.Text = total > 0
                    ? string.Format("Downloading... {0} MB / {1} MB", rcv, total)
                    : string.Format("Downloading... {0} MB", rcv);
            };
            _client.DownloadDataCompleted += OnComplete;
            _client.DownloadDataAsync(new Uri(_url));
        }

        void OnComplete(object sender, DownloadDataCompletedEventArgs e) {
            if (e.Cancelled) { Close(); return; }
            if (e.Error != null) {
                MessageBox.Show("Download failed: " + e.Error.Message, "TakeoutFix",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close(); return;
            }

            _status.Text  = "Installing...";
            _bar.Style    = ProgressBarStyle.Marquee;
            try {
                if (Directory.Exists(_appDir)) Directory.Delete(_appDir, true);
                Directory.CreateDirectory(_appDir);
                using (var ms  = new MemoryStream(e.Result))
                using (var zip = new ZipArchive(ms, ZipArchiveMode.Read))
                    zip.ExtractToDirectory(_appDir);

                string ver = _knownVer
                    ?? (_client.ResponseHeaders != null ? _client.ResponseHeaders["X-App-Version"] : null)
                    ?? DateTime.UtcNow.ToString("yyyy.MM.dd");
                File.WriteAllText(_verFile, ver);
                Success = true;
            } catch (Exception ex) {
                MessageBox.Show("Installation failed: " + ex.Message, "TakeoutFix",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            Close();
        }
    }
}
