package com.rahul.service;

import org.springframework.stereotype.Service;
import java.io.File;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Responsible for recursively scanning the filesystem for supported media files.
 */
@Service
public class MediaScanner {
    private static final Pattern MEDIA_PATTERN = Pattern.compile("(?i).+\\.(jpg|jpeg|png|gif|bmp|webp|heic|heif|tiff|tif|dng|cr2|nef|arw|rw2|orf|pef|raf|mp4|mov|m4v|3gp|mkv|avi|wmv|flv|mpg|mpeg|m2ts|mts)$");

    /**
     * Recursively scans all subfolders from the root to find supported media files.
     * Skips hidden directories and files (like .git).
     *
     * @param root The root folder to start scanning from.
     * @return A list of discovered media files.
     */
    public List<File> listMediaFiles(File root) {
        List<File> list = new ArrayList<>();
        Deque<File> stack = new ArrayDeque<>();
        stack.push(root);

        while (!stack.isEmpty()) {
            File f = stack.pop();
            File[] kids = f.listFiles();
            if (kids == null) continue;
            for (File k : kids) {
                // Skip hidden files and directories (like .git, .DS_Store)
                if (k.isHidden() || k.getName().startsWith(".")) {
                    continue;
                }
                if (k.isDirectory()) {
                    stack.push(k);
                } else {
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
        return f != null && f.isFile() && !f.isHidden() && MEDIA_PATTERN.matcher(f.getName()).matches();
    }
}
