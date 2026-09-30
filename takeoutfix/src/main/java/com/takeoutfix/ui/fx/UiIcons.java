package com.takeoutfix.ui.fx;

import javafx.scene.Group;
import javafx.scene.Node;
import javafx.scene.layout.Region;
import javafx.scene.layout.StackPane;
import javafx.scene.paint.Color;
import javafx.scene.shape.SVGPath;

/**
 * Reusable vector SVG icons for TakeoutFix & MetaSync JavaFX UI.
 * Crisp, high-DPI vector rendering using JavaFX Region shape masks (zero layout distortion).
 */
public final class UiIcons {

    private UiIcons() {}

    // Vector Path Definitions (Crisp SVG Icons for JavaFX Region shapes)
    public static final String RESTORE = "M4 4h16v4H4zm1 5h14v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zm5 3v4h4v-4h3l-5-5-5 5z";
    public static final String SYNC = "M12 4V1L8 5l4 4V6a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8zm-8 8a8 8 0 0 0 8 8v3l4-4-4-4v3a6 6 0 1 1 6-6h2a8 8 0 0 0-8-8z";
    public static final String FOLDER = "M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z";
    public static final String ZIP = "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-4 4h2v2h-2V6zm2 2h2v2h-2V8zm-2 2h2v2h-2v-2zm2 2h2v2h-2v-2zm-3 4h4v3h-4v-3z";
    public static final String CALENDAR = "M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z";
    public static final String OUTPUT_FOLDER = "M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2zm5 7l-4 4-1.41-1.41L11.17 12H7v-2h4.17l-1.58-1.59L11 7l4 4z";
    public static final String HISTORY = "M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z";
    public static final String SETTINGS = "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z";
    public static final String SUN = "M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 0 0 0-1.41.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03 3.9 1.41 0l1.06-1.06z";
    public static final String MOON = "M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z";
    public static final String LOCK = "M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z";
    public static final String CHECK = "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z";
    public static final String CHECK_CIRCLE = "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z";
    public static final String ALERT = "M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z";
    public static final String PLAY = "M8 5v14l11-7z";
    public static final String PAUSE = "M6 5h4v14H6zm8 0h4v14h-4z";
    public static final String STOP = "M6 6h12v12H6z";
    public static final String X = "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";
    public static final String TERMINAL = "M4 17l6-6-6-6m8 14h8";
    public static final String EYE = "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z";
    public static final String DIFF = "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm-1 7V3.5L18.5 9zM9 13h6v2H9zm0 4h6v2H9z";
    public static final String USER = "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z";
    public static final String GLOBE = "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z";
    public static final String COPY = "M16 1H4a2 2 0 0 0-2 2v14h2V3h12zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11z";
    public static final String TRASH = "M19 4h-3.5l-1-1h-5l-1 1H5v2h14V4zM6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zm3-9h2v7H9zm4 0h2v7h-2z";
    public static final String GRIP_VERTICAL = "M9 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm6-16a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z";
    public static final String CHEVRON_UP = "M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z";
    public static final String CHEVRON_DOWN = "M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z";
    public static final String EXTERNAL_LINK = "M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z";
    public static final String ZAP = "M7 2v11h3v9l7-12h-4l4-8z";
    public static final String GOOGLE = "M21.35 11.1h-9.17v2.98h5.27c-.23 1.25-.93 2.31-1.98 3.01v2.5h3.2c1.87-1.72 2.95-4.26 2.95-7.29 0-.7-.06-1.4-.27-2.2z M12.18 22c2.7 0 4.96-.9 6.62-2.42l-3.2-2.5c-.9.6-2.04.96-3.42.96-2.62 0-4.84-1.77-5.63-4.15H3.25v2.58C4.9 19.74 8.28 22 12.18 22z M6.55 13.89c-.2-.6-.31-1.24-.31-1.89s.11-1.29.31-1.89V7.53H3.25C2.58 8.87 2.2 10.39 2.2 12s.38 3.13 1.05 4.47l3.3-2.58z M12.18 5.96c1.47 0 2.79.5 3.82 1.49l2.87-2.87C17.13 2.97 14.88 2 12.18 2 8.28 2 4.9 4.26 3.25 7.53l3.3 2.58c.79-2.38 3.01-4.15 5.63-4.15z";
    public static final String DEAL = "M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z";
    public static final String RELOAD = "M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z";
    public static final String SHIELD_CHECK = "M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5zm-2 14.5l-4-4 1.41-1.41L10 13.67l6.59-6.59L18 8.5z";
    public static final String EYE_OFF = "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24 M1 1l22 22";
    public static final String CAMERA = "M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zm8 11a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-2a3 3 0 1 1 0-6 3 3 0 0 1 0 6z";
    public static final String LAYERS = "M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z";
    public static final String SLIDERS = "M3 6h4a2 2 0 0 0 4 0h10a1 1 0 1 0 0-2H11a2 2 0 0 0-4 0H3a1 1 0 1 0 0 2zm18 5h-4a2 2 0 0 0-4 0H3a1 1 0 1 0 0 2h10a2 2 0 0 0 4 0h4a1 1 0 1 0 0-2zm-8 6H3a1 1 0 1 0 0 2h8a2 2 0 0 0 4 0h6a1 1 0 1 0 0-2h-6a2 2 0 0 0-4 0z";
    public static final String DOWNLOAD = "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z";
    public static final String HEART = "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";
    public static final String SEARCH = "M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z";
    public static final String UPLOAD = "M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z";

    /**
     * Creates a vector SVG node strictly scaled to the target dimension using JavaFX Region shape.
     * When color is null, empty, or "currentColor", styling is driven dynamically by CSS (.app-icon).
     */
    public static Node createSvgIcon(String pathData, double size, String color) {
        Region icon = new Region();
        icon.getStyleClass().add("app-icon");
        icon.setMinWidth(size);
        icon.setMinHeight(size);
        icon.setPrefWidth(size);
        icon.setPrefHeight(size);
        icon.setMaxWidth(size);
        icon.setMaxHeight(size);

        StringBuilder style = new StringBuilder();
        style.append("-fx-shape: \"").append(pathData).append("\"; ");
        style.append("-fx-scale-shape: true; -fx-position-shape: true; ");

        if (color != null && !color.isBlank() && !"currentColor".equalsIgnoreCase(color) && !"inherit".equalsIgnoreCase(color)) {
            style.append("-fx-background-color: ").append(color).append("; ");
        }

        icon.setStyle(style.toString());
        return icon;
    }

    /**
     * Creates the authentic 4-color Google "G" vector logo.
     */
    public static Node createGoogleIcon(double size) {
        SVGPath blue = new SVGPath();
        blue.setContent("M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z");
        blue.setFill(Color.web("#4285F4"));

        SVGPath green = new SVGPath();
        green.setContent("M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z");
        green.setFill(Color.web("#34A853"));

        SVGPath yellow = new SVGPath();
        yellow.setContent("M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z");
        yellow.setFill(Color.web("#FBBC05"));

        SVGPath red = new SVGPath();
        red.setContent("M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z");
        red.setFill(Color.web("#EA4335"));

        Group group = new Group(blue, green, yellow, red);
        double scale = size / 24.0;
        group.setScaleX(scale);
        group.setScaleY(scale);

        StackPane container = new StackPane(group);
        container.setPrefSize(size, size);
        container.setMinSize(size, size);
        container.setMaxSize(size, size);
        return container;
    }
}
