package com.takeoutfix;

/**
 * Thin launcher that does NOT extend {@link javafx.application.Application}.
 * <p>
 * The JVM refuses to start a class that directly extends Application when
 * JavaFX JARs are on the classpath (not the module-path). This indirection
 * bypasses that check so IntelliJ's Application run config works without
 * needing {@code --module-path} / {@code --add-modules} VM args.
 */
public class Launcher {
    public static void main(String[] args) {
        if (System.getProperty("prism.lcdtext") == null) {
            System.setProperty("prism.lcdtext", "false");
        }
        if (System.getProperty("prism.text") == null) {
            System.setProperty("prism.text", "t2k");
        }
        TakeoutFxApplication.main(args);
    }
}
