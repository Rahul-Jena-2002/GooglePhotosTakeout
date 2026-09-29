# PhotoVault — Local Photo Backup Verifier

> **A simple, offline, privacy-first photo backup verifier for photographers.**  
> **Philosophy:** Install → Select Folders → Click Verify → Done.

---

## Overview

PhotoVault helps photographers verify that a backup folder contains the exact same files as an original photo folder or memory-card copy. It compares directory trees and uses streaming SHA-256 digests to identify missing, extra, or modified files.

- **100% Read-Only:** PhotoVault will never rename, move, repair, sync, or delete your photos.
- **100% Offline:** Zero accounts, cloud dependencies, network calls, or telemetry.
- **Simple & Accessible:** High-contrast monochromatic UI built with FlatLaf, designed for photographers.

---

## Building from Source

Requirements:
- JDK 25 or 26
- Maven 3.9+

```bash
mvn clean package
java -jar target/photovault.jar
```

---

## License

MIT or Apache-2.0.
