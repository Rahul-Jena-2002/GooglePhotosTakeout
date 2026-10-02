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
// Keeping this binary identical across releases ensures SmartScreen reputation accumulates permanently.
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
        const string PRIMARY_PAYLOAD_URL = "https://takeoutfix-download.takeoutfix.workers.dev/download/windows/payload";
        const string FALLBACK_PAYLOAD_URL = "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix-payload.zip";

        [STAThread]
        static int Main(string[] args) {
            try {
                // Ensure modern TLS (TLS 1.2) for secure GitHub / Cloudflare requests
                ServicePointManager.SecurityProtocol |= (SecurityProtocolType)3072;

                string appDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "TakeoutFix", "app");
                string exePath = Path.Combine(appDir, "TakeoutFix.exe");
                string verFile = Path.Combine(appDir, ".app_version");

                bool needsDownload = !File.Exists(exePath) || !File.Exists(verFile);
                string remoteVersion = null;

                if (!needsDownload) {
                    // Check for newer version via fast HEAD request (4s timeout)
                    try {
                        var req = (HttpWebRequest)WebRequest.Create(PRIMARY_PAYLOAD_URL);
                        req.Method = "HEAD";
                        req.UserAgent = "TakeoutFix-Launcher/1.0";
                        req.Timeout = 4000;
                        using (var resp = (HttpWebResponse)req.GetResponse()) {
                            remoteVersion = resp.Headers["X-App-Version"];
                        }

                        string localVer = File.ReadAllText(verFile).Trim();
                        if (!string.IsNullOrEmpty(remoteVersion) && localVer != remoteVersion) {
                            needsDownload = true;
                        }
                    } catch {
                        // Offline or network timeout — proceed with existing local installation immediately
                    }
                }

                if (needsDownload) {
                    if (!RunDownloadUI(appDir, verFile, remoteVersion))
                        return 1;
                }

                if (!File.Exists(exePath)) {
                    MessageBox.Show("TakeoutFix executable could not be found at:\n" + exePath, "TakeoutFix",
                        MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return 1;
                }

                Process.Start(new ProcessStartInfo {
                    FileName = exePath,
                    Arguments = string.Join(" ", args),
                    WorkingDirectory = appDir,
                    UseShellExecute = true
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
                using (var f = new DownloadForm(appDir, verFile, PRIMARY_PAYLOAD_URL, FALLBACK_PAYLOAD_URL, knownVersion)) {
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

        readonly string _appDir, _verFile, _primaryUrl, _fallbackUrl, _knownVer;
        Label _status;
        ProgressBar _bar;
        WebClient _client;
        bool _usedFallback = false;

        public DownloadForm(string appDir, string verFile, string primaryUrl, string fallbackUrl, string knownVer) {
            _appDir = appDir;
            _verFile = verFile;
            _primaryUrl = primaryUrl;
            _fallbackUrl = fallbackUrl;
            _knownVer = knownVer;

            Text = "TakeoutFix";
            ClientSize = new Size(460, 115);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            StartPosition = FormStartPosition.CenterScreen;
            MaximizeBox = false;
            MinimizeBox = false;
            BackColor = Color.FromArgb(18, 18, 18);

            var titleLabel = new Label {
                Text = "TakeoutFix",
                ForeColor = Color.FromArgb(99, 179, 237),
                Font = new Font("Segoe UI", 10f, FontStyle.Bold),
                Left = 16, Top = 12, AutoSize = true
            };
            _status = new Label {
                Text = "Preparing application packages...",
                ForeColor = Color.FromArgb(200, 200, 200),
                Font = new Font("Segoe UI", 9f),
                Left = 16, Top = 38, Width = 428, AutoSize = true
            };
            _bar = new ProgressBar { Left = 16, Top = 68, Width = 428, Height = 20 };

            Controls.Add(titleLabel);
            Controls.Add(_status);
            Controls.Add(_bar);

            Shown += (s, e) => StartDownload(_primaryUrl);
            FormClosing += (s, e) => {
                if (_client != null) {
                    try { _client.CancelAsync(); } catch { }
                }
            };
        }

        void StartDownload(string url) {
            _client = new WebClient();
            _client.Headers["User-Agent"] = "TakeoutFix-Launcher/1.0";
            _client.DownloadProgressChanged += (s, e) => {
                _bar.Value = Math.Min(100, Math.Max(0, e.ProgressPercentage));
                long rcv = e.BytesReceived / 1048576;
                long total = e.TotalBytesToReceive > 0 ? e.TotalBytesToReceive / 1048576 : 0;
                _status.Text = total > 0
                    ? string.Format("Downloading components... {0} MB / {1} MB ({2}%)", rcv, total, e.ProgressPercentage)
                    : string.Format("Downloading components... {0} MB", rcv);
            };
            _client.DownloadDataCompleted += OnComplete;
            _client.DownloadDataAsync(new Uri(url));
        }

        void OnComplete(object sender, DownloadDataCompletedEventArgs e) {
            if (e.Cancelled) { Close(); return; }
            if (e.Error != null) {
                if (!_usedFallback) {
                    _usedFallback = true;
                    _status.Text = "Connecting to alternate download mirror...";
                    StartDownload(_fallbackUrl);
                    return;
                }
                MessageBox.Show("Download failed: " + e.Error.Message, "TakeoutFix",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
                return;
            }

            _status.Text = "Extracting components...";
            _bar.Style = ProgressBarStyle.Marquee;

            try {
                if (Directory.Exists(_appDir)) {
                    for (int attempt = 0; attempt < 5; attempt++) {
                        try {
                            Directory.Delete(_appDir, true);
                            break;
                        } catch {
                            Thread.Sleep(200);
                        }
                    }
                }
                Directory.CreateDirectory(_appDir);

                using (var ms = new MemoryStream(e.Result))
                using (var zip = new ZipArchive(ms, ZipArchiveMode.Read)) {
                    foreach (var entry in zip.Entries) {
                        string destPath = Path.Combine(_appDir, entry.FullName);
                        if (string.IsNullOrEmpty(entry.Name)) {
                            Directory.CreateDirectory(destPath);
                            continue;
                        }
                        string parent = Path.GetDirectoryName(destPath);
                        if (!string.IsNullOrEmpty(parent)) Directory.CreateDirectory(parent);
                        entry.ExtractToFile(destPath, true);
                    }
                }

                string ver = _knownVer
                    ?? (_client.ResponseHeaders != null ? _client.ResponseHeaders["X-App-Version"] : null)
                    ?? "2.2.6";
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
