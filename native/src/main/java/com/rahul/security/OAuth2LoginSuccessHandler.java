package com.rahul.security;

import com.rahul.model.User;
import com.rahul.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * Handles successful Google OAuth2 authentication by provisioning the user in the database
 * and rendering a clean desktop-connected confirmation page.
 */
@Component
public class OAuth2LoginSuccessHandler implements AuthenticationSuccessHandler {

    private final UserService userService;

    @Autowired
    public OAuth2LoginSuccessHandler(UserService userService) {
        this.userService = userService;
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request,
                                        HttpServletResponse response,
                                        Authentication authentication) throws IOException {

        OAuth2User oauthUser = (OAuth2User) authentication.getPrincipal();
        String googleId = oauthUser.getAttribute("sub");
        String email = oauthUser.getAttribute("email");
        String name = oauthUser.getAttribute("name");
        String picture = oauthUser.getAttribute("picture");

        User user = userService.loginOrCreateUser(googleId, email, name, picture);

        response.setContentType("text/html;charset=UTF-8");
        response.getWriter().write("""
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>TakeoutFix — Google Authentication Successful</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                        background: #0f172a;
                        color: #f8fafc;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        min-height: 100vh;
                        margin: 0;
                        padding: 20px;
                        box-sizing: border-box;
                    }
                    .card {
                        background: #1e293b;
                        border: 1px solid #334155;
                        border-radius: 16px;
                        padding: 36px 40px;
                        text-align: center;
                        max-width: 440px;
                        width: 100%;
                        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.4);
                    }
                    .icon {
                        font-size: 40px;
                        color: #10b981;
                        margin-bottom: 12px;
                    }
                    h2 {
                        font-size: 22px;
                        margin: 0 0 10px 0;
                        color: #f8fafc;
                    }
                    p {
                        color: #94a3b8;
                        font-size: 14px;
                        line-height: 1.5;
                        margin: 0 0 16px 0;
                    }
                    .user-box {
                        background: #0f172a;
                        border: 1px solid #334155;
                        border-radius: 8px;
                        padding: 12px 16px;
                        margin: 16px 0;
                        text-align: left;
                    }
                    .user-name {
                        font-weight: 600;
                        color: #f8fafc;
                        font-size: 14px;
                    }
                    .user-email {
                        color: #64748b;
                        font-size: 12px;
                    }
                    .badge {
                        display: inline-block;
                        background: #064e3b;
                        color: #34d399;
                        font-size: 11px;
                        font-weight: bold;
                        padding: 4px 12px;
                        border-radius: 9999px;
                        letter-spacing: 0.5px;
                        margin-top: 6px;
                    }
                    .instructions {
                        font-size: 13px;
                        color: #cbd5e1;
                        margin-top: 20px;
                    }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="icon">✓</div>
                    <h2>Signed In Successfully</h2>
                    <p>Google authentication is complete. Your TakeoutFix desktop app is now connected.</p>
                    <div class="user-box">
                        <div class="user-name">%s</div>
                        <div class="user-email">%s</div>
                        <div class="badge">%s PLAN ACTIVE</div>
                    </div>
                    <div class="instructions">
                        You can now close this browser window and return to the <b>TakeoutFix</b> application.
                    </div>
                </div>
            </body>
            </html>
        """.formatted(
                user.getName() != null ? user.getName() : "Google User",
                user.getEmail() != null ? user.getEmail() : "",
                user.getPlan().toUpperCase()
        ));
    }
}
