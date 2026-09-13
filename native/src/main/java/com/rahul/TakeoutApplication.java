package com.rahul;

import com.rahul.gui.NativeDesktopGui;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableAsync
@EnableScheduling
public class TakeoutApplication {

    @Autowired
    private NativeDesktopGui nativeDesktopGui;

    public static void main(String[] args) {
        System.setProperty("java.awt.headless", "false");
        new SpringApplicationBuilder(TakeoutApplication.class)
                .headless(false)
                .run(args);
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        System.out.println("==================================================================");
        System.out.println("[GUI-LAUNCHER] ApplicationReadyEvent received. nativeDesktopGui=" + nativeDesktopGui);
        System.out.println("==================================================================");
        if (nativeDesktopGui != null) {
            nativeDesktopGui.initAndShowGui();
        } else {
            System.err.println("[GUI-LAUNCHER] ERROR: nativeDesktopGui is NULL!");
        }
    }
}

