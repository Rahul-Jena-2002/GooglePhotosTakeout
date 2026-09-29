package com.takeoutfix.ui.fx;

import javafx.stage.Stage;

import java.lang.foreign.*;
import java.lang.invoke.MethodHandle;
import java.nio.charset.StandardCharsets;

/**
 * Windows native title bar theming using Desktop Window Manager (DWM).
 * Applies DWMWA_USE_IMMERSIVE_DARK_MODE dynamically so the native OS title bar matches
 * the app's theme (Dark for Dark mode, Light for Light mode).
 * Safely fails closed on non-Windows platforms.
 */
public final class WindowsTitleBarTheme {

    private static final int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
    private static final int DWMWA_USE_IMMERSIVE_DARK_MODE_LEGACY = 19;
    private static final int DWMWA_CAPTION_COLOR = 35;
    private static final int DWMWA_TEXT_COLOR = 36;

    private static boolean isWindows = false;
    private static MethodHandle findWindowW;
    private static MethodHandle getForegroundWindow;
    private static MethodHandle getActiveWindow;
    private static MethodHandle dwmSetWindowAttribute;

    static {
        try {
            String os = System.getProperty("os.name", "").toLowerCase();
            if (os.contains("win")) {
                isWindows = true;
                Linker linker = Linker.nativeLinker();
                SymbolLookup user32 = SymbolLookup.libraryLookup("user32.dll", Arena.global());
                SymbolLookup dwmapi = SymbolLookup.libraryLookup("dwmapi.dll", Arena.global());

                var findWindowSym = user32.find("FindWindowW");
                var getActiveSym = user32.find("GetActiveWindow");
                var getForegroundSym = user32.find("GetForegroundWindow");
                var dwmSetSym = dwmapi.find("DwmSetWindowAttribute");

                if (findWindowSym.isPresent() && dwmSetSym.isPresent()) {
                    findWindowW = linker.downcallHandle(
                            findWindowSym.get(),
                            FunctionDescriptor.of(ValueLayout.ADDRESS, ValueLayout.ADDRESS, ValueLayout.ADDRESS)
                    );
                    dwmSetWindowAttribute = linker.downcallHandle(
                            dwmSetSym.get(),
                            FunctionDescriptor.of(ValueLayout.JAVA_INT, ValueLayout.ADDRESS, ValueLayout.JAVA_INT, ValueLayout.ADDRESS, ValueLayout.JAVA_INT)
                    );
                }
                if (getForegroundSym.isPresent()) {
                    getForegroundWindow = linker.downcallHandle(
                            getForegroundSym.get(),
                            FunctionDescriptor.of(ValueLayout.ADDRESS)
                    );
                }
                if (getActiveSym.isPresent()) {
                    getActiveWindow = linker.downcallHandle(
                            getActiveSym.get(),
                            FunctionDescriptor.of(ValueLayout.ADDRESS)
                    );
                }
            }
        } catch (Throwable ignored) {
            // Silently fall back if native FFM or DLLs are unavailable
        }
    }

    private WindowsTitleBarTheme() {}

    /**
     * Applies dark or light theme to the native Windows window frame/title bar.
     */
    public static void applyTheme(Stage stage, boolean dark) {
        if (!isWindows || dwmSetWindowAttribute == null) {
            return;
        }

        try (Arena arena = Arena.ofConfined()) {
            MemorySegment hwnd = MemorySegment.NULL;

            // 1. Direct Glass HWND handle extraction (Most accurate)
            long raw = getGlassHwnd(stage);
            if (raw != 0) {
                hwnd = MemorySegment.ofAddress(raw);
            }

            // 2. FindWindowW with null-terminated UTF-16 wchar_t
            if ((hwnd.equals(MemorySegment.NULL) || hwnd.address() == 0) &&
                    stage != null && stage.getTitle() != null && !stage.getTitle().isEmpty() && findWindowW != null) {
                MemorySegment titleSeg = arena.allocateFrom(stage.getTitle() + "\0", StandardCharsets.UTF_16LE);
                hwnd = (MemorySegment) findWindowW.invokeExact(MemorySegment.NULL, titleSeg);
            }

            // 3. Foreground / Active window fallback
            if ((hwnd.equals(MemorySegment.NULL) || hwnd.address() == 0) && getForegroundWindow != null) {
                hwnd = (MemorySegment) getForegroundWindow.invokeExact();
            }
            if ((hwnd.equals(MemorySegment.NULL) || hwnd.address() == 0) && getActiveWindow != null) {
                hwnd = (MemorySegment) getActiveWindow.invokeExact();
            }

            if (!hwnd.equals(MemorySegment.NULL) && hwnd.address() != 0) {
                MemorySegment pvAttribute = arena.allocate(ValueLayout.JAVA_INT, dark ? 1 : 0);
                int result = (int) dwmSetWindowAttribute.invokeExact(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, pvAttribute, 4);
                if (result != 0) {
                    // Windows 10 legacy attribute
                    dwmSetWindowAttribute.invokeExact(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE_LEGACY, pvAttribute, 4);
                }

                // Windows 11 caption color (0x00BBGGRR format in Win32 COLORREF)
                // Dark: #111113 -> 0x00131111 | Light: #FFFFFF -> 0x00FFFFFF
                int captionColor = dark ? 0x00131111 : 0x00FFFFFF;
                int textColor = dark ? 0x00FAFAFA : 0x0009090B;
                MemorySegment capSeg = arena.allocate(ValueLayout.JAVA_INT, captionColor);
                dwmSetWindowAttribute.invokeExact(hwnd, DWMWA_CAPTION_COLOR, capSeg, 4);
                MemorySegment txtSeg = arena.allocate(ValueLayout.JAVA_INT, textColor);
                dwmSetWindowAttribute.invokeExact(hwnd, DWMWA_TEXT_COLOR, txtSeg, 4);
            }
        } catch (Throwable ignored) {}
    }

    private static long getGlassHwnd(Stage stage) {
        if (stage == null) return 0;
        try {
            java.lang.reflect.Method getPeer = stage.getClass().getMethod("getPeer");
            Object tkStage = getPeer.invoke(stage);
            if (tkStage != null) {
                java.lang.reflect.Method getPlatformWindow = tkStage.getClass().getMethod("getPlatformWindow");
                Object glassWindow = getPlatformWindow.invoke(tkStage);
                if (glassWindow != null) {
                    java.lang.reflect.Method getRawHandle = glassWindow.getClass().getMethod("getRawHandle");
                    return (Long) getRawHandle.invoke(glassWindow);
                }
            }
        } catch (Throwable ignored) {}
        return 0;
    }
}
