package com.takeoutfix.restore.infrastructure;

import org.springframework.stereotype.Component;

import java.io.File;
import java.nio.file.Files;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Responsible for recursively scanning the filesystem for supported media files.
 */
@Component
public class MediaScanner {
    private static final Pattern MEDIA_PATTERN = Pattern.compile("(?i).+\\.(jpg|jpeg|png|gif|bmp|webp|heic|heif|tiff|tif|dng|cr2|nef|arw|rw2|orf|pef|raf|mp4|mov|m4v|3gp|mkv|avi|wmv|flv|mpg|mpeg|m2ts|mts)$");

    /**
     * Recursively scans all subfolders from the root to find supported media files.
     * Skips hidden entries and rejects symbolic links rather than following them.
     *
     * @param root The root folder to start scanning from.
     * @return A list of discovered media files.
     */
    public List<File> listMediaFiles(File root) {
        if (root == null || Files.isSymbolicLink(root.toPath())) {
            throw new IllegalArgumentException("Select a source folder that is not a symbolic link.");
        }
        if (root.isFile() && root.getName().toLowerCase(Locale.ROOT).endsWith(".zip")) {
            throw new IllegalArgumentException("Extract the ZIP archive first, then select the extracted folder.");
        }
        List<File> list = new ArrayList<>();
        Deque<File> stack = new ArrayDeque<>();
        stack.push(root);

        while (!stack.isEmpty()) {
            File f = stack.pop();
            File[] kids = f.listFiles();
            if (kids == null) throw new IllegalStateException("Cannot read source folder: " + f);
            for (File k : kids) {
                if (Files.isSymbolicLink(k.toPath())) {
                    throw new IllegalStateException("Source contains a symbolic link that cannot be scanned safely: " + k);
                }
                // Skip hidden files and directories (like .git, .DS_Store)
                if (k.isHidden() || k.getName().startsWith(".")) {
                    continue;
                }
                if (k.isDirectory()) {
                    stack.push(k);
                } else if (k.isFile()) {
                    String name = k.getName();
                    if (MEDIA_PATTERN.matcher(name).matches()) {
                        list.add(k);
                    }
                }
            }
        }
        return list;
    }

    public boolean isMediaFile(File f) {
        return f != null && !Files.isSymbolicLink(f.toPath()) && f.isFile() && !f.isHidden() && MEDIA_PATTERN.matcher(f.getName()).matches();
    }
}
