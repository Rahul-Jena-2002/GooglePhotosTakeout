package com.rahul.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.File;
import java.util.Map;

@RestController
@RequestMapping("/api/logs")
@CrossOrigin(originPatterns = {"http://localhost:*", "https://takeoutfix.com", "https://*.pages.dev"})
public class WebappLogController {

    private static final Logger webappLogger = LoggerFactory.getLogger("webapp.client");
    private static final Logger springbootLogger = LoggerFactory.getLogger(WebappLogController.class);

    /** Ingests log entries sent by the webapp/frontend client and writes them to logs/webapp-client.log. */
    @PostMapping("/webapp")
    public ResponseEntity<Map<String, String>> logWebappEvent(@RequestBody Map<String, Object> logPayload) {
        String level = String.valueOf(logPayload.getOrDefault("level", "INFO")).toUpperCase();
        String message = String.valueOf(logPayload.getOrDefault("message", ""));
        String context = String.valueOf(logPayload.getOrDefault("context", "UI"));

        String formattedMsg = String.format("[%s] %s", context, message);

        switch (level) {
            case "WARN":
            case "WARNING":
                webappLogger.warn(formattedMsg);
                break;
            case "ERROR":
                webappLogger.error(formattedMsg);
                break;
            case "DEBUG":
                webappLogger.debug(formattedMsg);
                break;
            default:
                webappLogger.info(formattedMsg);
                break;
        }

        return ResponseEntity.ok(Map.of("status", "logged", "target", "logs/webapp-client.log"));
    }

    /** Downloads or views the dedicated webapp client log file. */
    @GetMapping("/webapp/file")
    public ResponseEntity<Resource> getWebappLogFile() {
        File file = new File("logs/webapp-client.log");
        if (!file.exists()) {
            return ResponseEntity.notFound().build();
        }
        Resource resource = new FileSystemResource(file);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"webapp-client.log\"")
                .contentType(MediaType.TEXT_PLAIN)
                .body(resource);
    }

    /** Downloads or views the dedicated Spring Boot application log file. */
    @GetMapping("/springboot/file")
    public ResponseEntity<Resource> getSpringBootLogFile() {
        File file = new File("logs/springboot-app.log");
        if (!file.exists()) {
            return ResponseEntity.notFound().build();
        }
        Resource resource = new FileSystemResource(file);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"springboot-app.log\"")
                .contentType(MediaType.TEXT_PLAIN)
                .body(resource);
    }
}
