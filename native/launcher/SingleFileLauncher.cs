using System;
using System.IO;
using System.IO.Compression;
using System.Diagnostics;
using System.Reflection;

[assembly: AssemblyTitle("TakeoutFix")]
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
                string currentVersion = asm.GetName().Version != null ? asm.GetName().Version.ToString() : "2.1.7";

                bool needsExtract = !File.Exists(exePath) || !File.Exists(versionFile) || File.ReadAllText(versionFile).Trim() != currentVersion;

                if (needsExtract) {
                    if (Directory.Exists(appDir)) {
                        try { Directory.Delete(appDir, true); } catch {}
                    }
                    Directory.CreateDirectory(appDir);

                    using (Stream resStream = asm.GetManifestResourceStream("payload.zip")) {
                        if (resStream == null) {
                            System.Windows.Forms.MessageBox.Show("Internal application payload missing.", "TakeoutFix", System.Windows.Forms.MessageBoxButtons.OK, System.Windows.Forms.MessageBoxIcon.Error);
                            return 1;
                        }
                        using (ZipArchive archive = new ZipArchive(resStream, ZipArchiveMode.Read)) {
                            archive.ExtractToDirectory(appDir);
                        }
                    }
                    File.WriteAllText(versionFile, currentVersion);
                }

                if (File.Exists(exePath)) {
                    var psi = new ProcessStartInfo {
                        FileName = exePath,
                        Arguments = string.Join(" ", args),
                        WorkingDirectory = appDir,
                        UseShellExecute = false
                    };
                    Process.Start(psi);
                    return 0;
                } else {
                    System.Windows.Forms.MessageBox.Show("Failed to launch TakeoutFix application.", "TakeoutFix", System.Windows.Forms.MessageBoxButtons.OK, System.Windows.Forms.MessageBoxIcon.Error);
                    return 1;
                }
            } catch (Exception ex) {
                System.Windows.Forms.MessageBox.Show(ex.Message, "TakeoutFix Launch Error", System.Windows.Forms.MessageBoxButtons.OK, System.Windows.Forms.MessageBoxIcon.Error);
                return 1;
            }
        }
    }
}
