package com.takeoutfix.auth;

import java.awt.Frame;

/**
 * Compatibility delegate subclass pointing to com.takeoutfix.auth.ui.SignInDialog.
 */
public class SignInDialog extends com.takeoutfix.auth.ui.SignInDialog {

    public SignInDialog(Frame owner, UserSyncBridgeService userService) {
        super(owner, userService, false);
    }

    public SignInDialog(Frame owner, UserSyncBridgeService userService, boolean isStartupGate) {
        super(owner, userService, isStartupGate);
    }
}
