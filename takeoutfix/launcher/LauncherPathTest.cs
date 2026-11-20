using System;
using System.IO;

namespace TakeoutFix {
    static class LauncherPathTest {
        static int Main() {
            string root = Path.Combine(Path.GetTempPath(), "takeoutfix-launcher-test");
            string expected = Path.Combine(root, "runtime", "bin", "java.exe");
            if (!string.Equals(SingleFileLauncher.ResolveEntryPath(root, "runtime/bin/java.exe"), expected, StringComparison.OrdinalIgnoreCase)) {
                throw new Exception("A normal package path was not resolved correctly.");
            }
            foreach (string unsafePath in new[] { "../outside.txt", "..\\outside.txt", root + "-other\\file.txt", Path.GetPathRoot(root) + "outside.txt" }) {
                try {
                    SingleFileLauncher.ResolveEntryPath(root, unsafePath);
                    throw new Exception("Unsafe package path was accepted: " + unsafePath);
                } catch (IOException) {
                    // Expected rejection.
                }
            }
            Console.WriteLine("Launcher package path checks passed.");
            return 0;
        }
    }
}
