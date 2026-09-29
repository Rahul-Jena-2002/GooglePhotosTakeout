# Dynamic Landing Page Stats & Unique Username Validation Implementation Plan

This plan details how to make the landing page statistics update dynamically in real time from Firestore, add a Registered Users metric, and enforce case-insensitive uniqueness constraints on usernames during both new user registration and profile updates.

## User Review Required

> [!IMPORTANT]
> **Firestore Security Rules Update**
> To allow normal (non-admin) users to verify if a username is already taken when registering or updating their profile, we need to allow read access to the `/users` collection for all authenticated users:
> ```javascript
> match /users/{userId} {
>   allow read: if request.auth != null;
>   allow write: if request.auth != null && request.auth.uid == userId;
>   allow read, write: if isAdmin();
> }
> ```
> This ensures that `query(collection(db, "users"), where("username", "==", ...))` can be executed successfully without throwing a `Permission Denied` exception.

> [!NOTE]
> **Self-Healing Users Count**
> Since the landing page should not download the entire `users` collection to display the total user count (due to performance and privacy), the total count is stored in `platform_stats/global` under `usersCount`.
> - When a new user registers in `AuthContext`, we increment `usersCount` by `1`.
> - To bootstrap the existing count and handle any discrepancies, when an Admin accesses `AdminStatistics.tsx`, the page will compare `users.length` (fully queried there) with `globalStats.usersCount` and automatically update it to match.

## Proposed Changes

### 1. Update Firestore Security Rules
#### [MODIFY] [firestore.rules](file:///home/rahul/Desktop/Rahul/Java/Projects/takeout%20extractor/GoogleTakeout%20-%20Copy%20%282%29/webapp/firestore.rules)
* Update the `match /users/{userId}` block to allow read access if `request.auth != null`.

---

### 2. Implement Unique Username Generation & Stats Increment
#### [MODIFY] [AuthContext.tsx](file:///home/rahul/Desktop/Rahul/Java/Projects/takeout%20extractor/GoogleTakeout%20-%20Copy%20%282%29/webapp/src/contexts/AuthContext.tsx)
* Import `increment` from `firebase/firestore`.
* Implement a helper function `generateUniqueUsername(email, displayName, uid)` that queries the `users` collection for candidate usernames and returns a unique one.
* Use this helper when bootstrapping a username for an existing user or creating a new user.
* When a new user document is created, update `platform_stats/global` to increment `usersCount` by `1`.

---

### 3. Add Admin Self-Healing Count Logic
#### [MODIFY] [AdminStatistics.tsx](file:///home/rahul/Desktop/Rahul/Java/Projects/takeout%20extractor/GoogleTakeout%20-%20Copy%20%282%29/webapp/src/pages/AdminStatistics.tsx)
* Add an effect that compares the actual queried `users.length` with `globalStats.usersCount` and updates `platform_stats/global` if there is a mismatch.

---

### 4. Display Dynamic Registered Users Metric on Landing Page
#### [MODIFY] [LandingPage.tsx](file:///home/rahul/Desktop/Rahul/Java/Projects/takeout%20extractor/GoogleTakeout%20-%20Copy%20%282%29/webapp/src/pages/LandingPage.tsx)
* Update `stats` state to include `usersCount`.
* Listen to `usersCount` inside the global stats `onSnapshot` listener.
* Add a 5th statistics card in the grid to display the dynamic registered users count.

---

## Verification Plan

### Automated Tests
- Run `npm run build` to verify that there are no TypeScript or compilation errors.

### Manual Verification
1. **Registered Users Display**:
   - Verify that the landing page displays a "Registered Users" stats card.
   - Verify that the card's value updates dynamically when user accounts are created or updated.
2. **Username Uniqueness Constraint**:
   - Register a new user and verify that a unique default username is successfully generated.
   - Edit profile to try changing the username to an already existing one; verify that the validation correctly flags it as taken and refuses to save.
