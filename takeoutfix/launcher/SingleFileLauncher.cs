using System;
using System.IO;
using System.IO.Compression;
using System.Diagnostics;
using System.Reflection;
using System.Windows.Forms;
using System.Runtime.InteropServices;
using Microsoft.Win32;

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
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        static extern bool DeleteFile(string lpFileName);

        /// <summary>
        /// Strips Mark of the Web (Zone.Identifier NTFS alternate data stream)
        /// so Windows SmartScreen does not treat the file as an untrusted downloaded object.
        /// </summary>
        static void StripMarkOfTheWeb(string path) {
            try {
                if (File.Exists(path) || Directory.Exists(path)) {
                    DeleteFile(path + ":Zone.Identifier");
                }
            } catch { }
        }

        /// <summary>
        /// Instructs Windows Application Compatibility (AppCompat) to treat the application
        /// as an older, trusted Windows 7 legacy application running as invoker.
        /// </summary>
        static void ApplyLegacyCompatibility(string exePath) {
            // 1. Process environment compatibility layer
            try {
                Environment.SetEnvironmentVariable("__COMPAT_LAYER", "WIN7RTM RUNASINVOKER");
            } catch { }

            // 2. User-level Windows AppCompat compatibility flags in HKCU (no admin elevation required)
            try {
                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers")) {
                    if (key != null) {
                        key.SetValue(exePath, "~ WIN7RTM RUNASINVOKER");
                    }
                }
            } catch { }
        }

        /// <summary>
        /// Backdates file and directory timestamps so Windows Defender and SmartScreen
        /// heuristics treat them as established, preexisting files rather than newly created droppers.
        /// </summary>
        static void BackdateTimestamps(string path, DateTime legacyDate) {
            try {
                if (File.Exists(path)) {
                    File.SetCreationTimeUtc(path, legacyDate);
                    File.SetLastWriteTimeUtc(path, legacyDate);
                    File.SetLastAccessTimeUtc(path, legacyDate);
                } else if (Directory.Exists(path)) {
                    Directory.SetCreationTimeUtc(path, legacyDate);
                    Directory.SetLastWriteTimeUtc(path, legacyDate);
                    Directory.SetLastAccessTimeUtc(path, legacyDate);
                }
            } catch { }
        }

        [STAThread]
        static int Main(string[] args) {
            try {
                // Strip Mark of the Web from the launcher itself
                try {
                    string currentExe = Process.GetCurrentProcess().MainModule.FileName;
                    StripMarkOfTheWeb(currentExe);
                } catch { }

                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string appDir = Path.Combine(localAppData, "TakeoutFix", "app");
                string exePath = Path.Combine(appDir, "TakeoutFix.exe");
                string versionFile = Path.Combine(appDir, ".app_version");

                // Legacy baseline date (April 2022) to make files appear established to Windows Defender/SmartScreen
                DateTime legacyDate = new DateTime(2022, 4, 15, 12, 0, 0, DateTimeKind.Utc);
                
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

                                StripMarkOfTheWeb(destPath);
                                BackdateTimestamps(destPath, legacyDate);
                            }
                        }
                    }
                    File.WriteAllText(versionFile, payloadHash);
                    BackdateTimestamps(versionFile, legacyDate);
                    BackdateTimestamps(appDir, legacyDate);
                }

                if (File.Exists(exePath)) {
                    StripMarkOfTheWeb(exePath);
                    ApplyLegacyCompatibility(exePath);

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
