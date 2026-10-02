using System;
using System.IO;
using System.IO.Compression;
using System.Diagnostics;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("TakeoutFix")]
[assembly: AssemblyDescription("Google Takeout Photo Metadata Restorer")]
[assembly: AssemblyProduct("TakeoutFix")]
[assembly: AssemblyCompany("TakeoutFix")]
[assembly: AssemblyCopyright("Copyright 2026 TakeoutFix")]

namespace TakeoutFix {
    static class SingleFileLauncher {
        [STAThread]
        static int Main(string[] args) {
            try {
                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string appDir = Path.Combine(localAppData, "TakeoutFix", "app");
                string exePath = Path.Combine(appDir, "TakeoutFix.exe");
                string versionFile = Path.Combine(appDir, ".app_version");
                
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

                bool needsExtract = !File.Exists(exePath) || !File.Exists(versionFile) || File.ReadAllText(versionFile).Trim() != payloadHash;

                if (needsExtract) {
                    if (Directory.Exists(appDir)) {
                        try { Directory.Delete(appDir, true); } catch (IOException) {} catch (UnauthorizedAccessException) {}
                    }
                    Directory.CreateDirectory(appDir);

                    using (Stream resStream = asm.GetManifestResourceStream("payload.zip")) {
                        if (resStream == null) {
                            MessageBox.Show("Internal application payload missing.", "TakeoutFix", MessageBoxButtons.OK, MessageBoxIcon.Error);
                            return 1;
                        }
                        using (ZipArchive archive = new ZipArchive(resStream, ZipArchiveMode.Read)) {
                            foreach (ZipArchiveEntry entry in archive.Entries) {
                                if (string.IsNullOrEmpty(entry.Name)) {
                                    string dirPath = Path.Combine(appDir, entry.FullName);
                                    if (!Directory.Exists(dirPath)) {
                                        Directory.CreateDirectory(dirPath);
                                    }
                                    continue;
                                }

                                string destPath = Path.Combine(appDir, entry.FullName);
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

                if (File.Exists(exePath)) {
                    var psi = new ProcessStartInfo {
                        FileName = exePath,
                        Arguments = string.Join(" ", args),
                        WorkingDirectory = appDir,
                        UseShellExecute = true
                    };
                    Process.Start(psi);
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
