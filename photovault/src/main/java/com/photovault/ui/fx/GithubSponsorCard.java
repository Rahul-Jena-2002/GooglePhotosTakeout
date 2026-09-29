package com.photovault.ui.fx;

import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;

import java.util.function.Consumer;

/**
 * Dedicated GitHub Sponsors card to support open source maintenance and camera testing.
 */
public class GithubSponsorCard extends VBox {

    public static final String GITHUB_SPONSORS_URL = "https://github.com/sponsors/Rahul-Jena-2002";

    public GithubSponsorCard(Consumer<String> urlOpener) {
        super(10);
        getStyleClass().add("glass-card");

        // Top Row: Heart icon + Title + Badge
        HBox top = new HBox(8);
        top.setAlignment(Pos.CENTER_LEFT);

        var heartIcon = UiIcons.createSvgIcon(UiIcons.HEART, 14, "#ec4899");
        Label title = new Label("Support Open Source");
        title.getStyleClass().add("text-primary");
        title.setStyle("-fx-font-size: 13px;");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Label badge = new Label("GITHUB SPONSORS");
        badge.getStyleClass().add("badge-github-sponsor");

        top.getChildren().addAll(heartIcon, title, spacer, badge);

        // Description
        Label desc = new Label("PhotoVault and TakeoutFix are 100% free, private, and local. Sponsoring funds continuous testing across Google Takeout archives, Apple iCloud exports, and RAW formats.");
        desc.getStyleClass().add("text-secondary");
        desc.setStyle("-fx-font-size: 11px; -fx-wrap-text: true;");

        // Actions Row
        HBox actions = new HBox(8);
        actions.setAlignment(Pos.CENTER_LEFT);

        Button sponsorBtn = new Button("Sponsor on GitHub");
        sponsorBtn.getStyleClass().add("btn-sponsor-pink");
        sponsorBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.HEART, 12, "#ec4899"));
        sponsorBtn.setGraphicTextGap(6);
        sponsorBtn.setOnAction(e -> {
            if (urlOpener != null) urlOpener.accept(GITHUB_SPONSORS_URL);
        });

        actions.getChildren().add(sponsorBtn);

        getChildren().addAll(top, desc, actions);
    }
}
