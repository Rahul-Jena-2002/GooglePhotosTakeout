# Task Checklist

- [x] Update Firestore security rules in `firestore.rules`
- [x] Import `increment` and write `generateUniqueUsername` helper in `AuthContext.tsx`
- [x] Update bootstrapping and new registration username logic in `AuthContext.tsx`
- [x] Add `usersCount` incrementing logic to `AuthContext.tsx` during registration
- [x] Implement self-healing `usersCount` logic in `AdminStatistics.tsx`
- [x] Add `usersCount` telemetry state and card to `LandingPage.tsx`
- [x] Build and verify with `npm run build`
- [x] Deploy to Firebase Hosting and Firestore rules
- [x] Modify Firestore security rules for transaction creation to allow admins to write logs for other users
- [x] Implement periodic telemetry quota updates and register beforeunload warning dialog in ToolWorkspace.tsx to prevent loopholes
- [x] Implement offline-first telemetry healing using localStorage and register navigator.storage.persist request to prevent storage eviction
- [x] Update concurrent device session limits (Pro: 2, Super: 3, Family: 5) and match display strings across contexts and pages
- [x] Configure ToolWorkspace.tsx and AuthContext.tsx to log cancelled, failed, and crash-interrupted runs to the user's recoveryHistory collection
