using System;
using System.IO;
using System.IO.Compression;
using System.Diagnostics;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("TakeoutFix")]
[assembly: AssemblyDescription("Google Takeout Photo Metadata Restorer")]
[assembly: AssemblyProduct("TakeoutFix")]
[assembly: AssemblyCompany("TakeoutFix")]
[assembly: AssemblyCopyright("Copyright © 2018-2023 TakeoutFix")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]
[assembly: AssemblyInformationalVersion("1.0.0")]

namespace TakeoutFix {
    static class SingleFileLauncher {
        internal static string ResolveEntryPath(string appDir, string entryName) {
            string root = Path.GetFullPath(appDir).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            string destination = Path.GetFullPath(Path.Combine(appDir, entryName));
            if (!destination.StartsWith(root, StringComparison.OrdinalIgnoreCase)) {
                throw new IOException("The application package contains an invalid file path.");
            }
            return destination;
        }

        [STAThread]
        static int Main(string[] args) {
            try {
                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

                Assembly asm = Assembly.GetExecutingAssembly();
                string payloadHash = "";
                using (Stream resStream = asm.GetManifestResourceStream("payload.zip")) {
                    if (resStream == null) {
                        MessageBox.Show("Internal application payload missing.", "TakeoutFix", MessageBoxButtons.OK, MessageBoxIcon.Error);
                        return 1;
                    }
                    using (var sha = System.Security.Cryptography.SHA256.Create()) {
                        byte[] hashBytes = sha.ComputeHash(resStream);
                        payloadHash = BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();
                    }
                }

                // shortcut: old versions remain on disk, add cleanup when running processes can be identified safely.
                string appDir = Path.Combine(localAppData, "TakeoutFix", "versions", payloadHash);
                string exePath = Path.Combine(appDir, "TakeoutFix.exe");
                string versionFile = Path.Combine(appDir, ".app_version");

                using (var mutex = new Mutex(false, @"Local\TakeoutFix-Extract-" + payloadHash)) {
                    bool acquired;
                    try {
                        acquired = mutex.WaitOne(TimeSpan.FromSeconds(30));
                    } catch (AbandonedMutexException) {
                        acquired = true;
                    }
                    if (!acquired) throw new IOException("Another TakeoutFix launch is still preparing the app. Please try again.");
                    try {
                        bool needsExtract = !File.Exists(exePath) || !File.Exists(versionFile) || File.ReadAllText(versionFile).Trim() != payloadHash;

                        if (needsExtract) {
                            if (Directory.Exists(appDir)) {
                                Directory.Delete(appDir, true);
                            }
                            Directory.CreateDirectory(appDir);

                            using (Stream resStream = asm.GetManifestResourceStream("payload.zip")) {
                                if (resStream == null) {
                                    MessageBox.Show("Internal application payload missing.", "TakeoutFix", MessageBoxButtons.OK, MessageBoxIcon.Error);
                                    return 1;
                                }
                                using (ZipArchive archive = new ZipArchive(resStream, ZipArchiveMode.Read)) {
                                    foreach (ZipArchiveEntry entry in archive.Entries) {
                                        string destPath = ResolveEntryPath(appDir, entry.FullName);
                                        if (string.IsNullOrEmpty(entry.Name)) {
                                            if (!Directory.Exists(destPath)) {
                                                Directory.CreateDirectory(destPath);
                                            }
                                            continue;
                                        }

                                        string parentDir = Path.GetDirectoryName(destPath);
                                        if (!string.IsNullOrEmpty(parentDir) && !Directory.Exists(parentDir)) {
                                            Directory.CreateDirectory(parentDir);
                                        }

                                        bool written = false;
                                        for (int attempt = 0; attempt < 25; attempt++) {
                                            try {
                                                entry.ExtractToFile(destPath, true);
                                                written = true;
                                                break;
                                            } catch (IOException) {
                                                System.Threading.Thread.Sleep(200);
                                            } catch (UnauthorizedAccessException) {
                                                System.Threading.Thread.Sleep(200);
                                            }
                                        }

                                        if (!written) {
                                            entry.ExtractToFile(destPath, true);
                                        }

                                    }
                                }
                            }
                            File.WriteAllText(versionFile, payloadHash);
                        }
                    } finally {
                        mutex.ReleaseMutex();
                    }
                }

                if (File.Exists(exePath)) {
                    var psi = new ProcessStartInfo {
                        FileName = exePath,
                        Arguments = string.Join(" ", args),
                        WorkingDirectory = appDir,
                        UseShellExecute = true
                    };
                    Process p = Process.Start(psi);
                    if (p != null) {
                        try {
                            if (p.WaitForExit(2500) && p.ExitCode != 0) {
                                string logPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".takeoutfix", "startup-error.log");
                                string extra = File.Exists(logPath) ? "\n\nDetails:\n" + File.ReadAllText(logPath) : "";
                                MessageBox.Show("TakeoutFix closed unexpectedly during startup (Exit Code " + p.ExitCode + ")." + extra, "TakeoutFix Startup Failure", MessageBoxButtons.OK, MessageBoxIcon.Error);
                                return p.ExitCode;
                            }
                        } catch { }
                    }
                    return 0;
                } else {
                    MessageBox.Show("Failed to launch TakeoutFix application.", "TakeoutFix", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return 1;
                }
            } catch (Exception ex) {
                MessageBox.Show(ex.Message, "TakeoutFix Launch Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }
    }
}
