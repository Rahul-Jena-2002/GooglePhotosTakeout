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
    private static final Pattern MEDIA_PATTERN = Pattern.compile("(?i).+\\.(jpg|jpeg|mp4|mov|heic)$");

    /**
     * Recursively scans all subfolders from the root to find supported media files.
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
                if (k.isDirectory()) {
                    stack.push(k);
                } else {
                    String name = k.getName();
                    // Include if it matches extension pattern or has no extension (edge case)
                    if (MEDIA_PATTERN.matcher(name).matches() || !name.contains(".")) {
                        list.add(k);
                    }
                }
            }
        }
        return list;
    }
}
