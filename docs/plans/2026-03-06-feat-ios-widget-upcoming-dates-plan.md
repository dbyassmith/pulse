---
title: iOS Widget for Upcoming Confirmed Dates
type: feat
status: active
date: 2026-03-06
deepened: 2026-03-06
---

## Enhancement Summary

**Deepened on:** 2026-03-06
**Research agents used:** Security Sentinel, Architecture Strategist, Performance Oracle, Context7 (Supabase Swift SDK), Web Search (WidgetKit, BGTaskScheduler, App Group patterns)

### Key Improvements
1. **Critical bug fix**: BGTaskScheduler registration must be in `goldfishApp.init()`, not `.onAppear` -- system can wake app before any view appears
2. **Performance**: Add `LIMIT` to Supabase query to prevent unbounded growth
3. **Security**: Move Supabase credentials to `.xcconfig` file excluded from source control; use Keychain for auth tokens
4. **Widget accuracy**: Add midnight timeline entries so "days remaining" labels stay correct across day boundaries
5. **Auth completeness**: Add sign-out flow, auth error handling, and generic error messages

### New Considerations Discovered
- Widget refresh budget: max 40-70 refreshes/day in production; daily at 9am is well within budget
- `BGAppRefreshTask` requires an `expirationHandler` or iOS throttles future requests
- Supabase Swift SDK uses PKCE flow by default; `signIn(email:password:)` is the correct method
- `UserDefaults.synchronize()` should be called after writes to shared container for immediate availability
- Force-unwraps in widget code cause blank widgets on crash -- use safe fallbacks

---

# iOS Widget for Upcoming Confirmed Dates

## Overview

Add a medium-size iOS home screen widget that displays the next 4 upcoming confirmed dates from the Goldfish database. The main app fetches from Supabase, writes to shared UserDefaults via App Groups, and the widget reads from there. Background App Refresh keeps data current even when the app isn't open.

## Problem Statement / Motivation

The Goldfish system already tracks confirmed event dates via the CLI agent, but there's no passive way to see upcoming dates at a glance. An iOS widget provides ambient awareness of approaching events without opening an app.

## Proposed Solution

### Architecture

```
Supabase (confirmed_dates table)
        |
        v
   iOS App (ContentView)
   - Fetches via Supabase Swift SDK
   - Writes top 4 to shared UserDefaults
   - Calls WidgetCenter.shared.reloadTimelines(ofKind:)
        |
        v
   Shared UserDefaults (App Group: group.com.dbyassmith.goldfish)
   Key: "upcomingDates" -> JSON-encoded [UpcomingDate]
        |
        v
   GoldfishWidget (medium size)
   - Reads from shared UserDefaults
   - Displays 4 rows: title + days remaining
   - Refreshes daily around 9am + midnight for label accuracy
```

### Research Insights

**Best Practices (Architecture Strategist):**
- UserDefaults via App Groups is Apple's recommended mechanism for small, pre-computed widget data. CoreData/SQLite warranted only for large datasets with independent queries.
- Multi-target file membership (shared files in both targets) is pragmatic for 2-3 files. Extract a shared framework if shared code grows beyond 3-4 files.
- The unidirectional flow (Supabase -> App -> UserDefaults -> Widget) is correct -- widgets cannot make arbitrary network calls during timeline generation.

**Performance (Performance Oracle):**
- 4-item JSON payload (~200-400 bytes) is trivially small for UserDefaults reads. No concern even at 100 items.
- JSON encode/decode of 4 simple structs takes <0.1ms. No optimization needed.
- `reloadTimelines(ofKind:)` is preferred over `reloadAllTimelines()` -- more precise if additional widget types are added later.

### Shared Data Model

A `Codable` struct used by both targets, placed in a shared file added to both targets:

```swift
// ios/goldfish/Shared/UpcomingDate.swift
struct UpcomingDate: Codable, Identifiable {
    let id: String
    let title: String
    let date: String       // YYYY-MM-DD
    let confidence: String // high, medium, low

    /// Parse the YYYY-MM-DD string into a Date. Returns nil for malformed data.
    var parsedDate: Date? {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return formatter.date(from: date)
    }

    /// Days remaining from today. Returns nil if date can't be parsed.
    var daysRemaining: Int? {
        guard let parsed = parsedDate else { return nil }
        return Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: Date()), to: parsed).day
    }
}
```

### Research Insights (Data Model)

**Codable Resilience (Architecture Strategist):**
- If the model changes in a future release (e.g., adding a `location` field), cached JSON from the previous version will fail to decode. Make new fields optional or provide default values to handle missing keys gracefully.
- The `date` as `String` (not `Date`) avoids timezone serialization bugs -- sound decision. Keep parsing as a computed property in the shared model to stay DRY.

**Performance Note:**
- Use `Locale(identifier: "en_US_POSIX")` on `DateFormatter` to avoid locale-dependent parsing issues (e.g., 12-hour vs 24-hour clock settings affecting date parsing).

Stored as a JSON-encoded `[UpcomingDate]` array under key `"upcomingDates"` in `UserDefaults(suiteName: "group.com.dbyassmith.goldfish")`. Always sorted by date ascending, filtered to future dates only.

### Dependencies

Add the **Supabase Swift SDK** via Swift Package Manager:
- Package URL: `https://github.com/supabase/supabase-swift`
- Add to the `goldfish` app target only (widget doesn't need it)

### Research Insights (Credentials)

**Security (Security Sentinel -- HIGH severity):**
- Do NOT hardcode Supabase URL and anon key as string literals in Swift source. They are trivially extractable from the compiled binary via `strings`.
- Store in a `Secrets.xcconfig` file excluded from source control via `.gitignore`.
- Access via `Bundle.main.infoDictionary` or a generated `Secrets.swift` file.
- While the anon key is designed to be "public" (gated by RLS), embedding it enables API probing and brute-force attempts against the auth endpoint.

```swift
// Recommended: Secrets.xcconfig (excluded from git)
SUPABASE_URL = https:$()/$()/your-project.supabase.co
SUPABASE_ANON_KEY = your-anon-key

// Access in Swift via Info.plist variables:
let url = Bundle.main.infoDictionary?["SUPABASE_URL"] as? String
let key = Bundle.main.infoDictionary?["SUPABASE_ANON_KEY"] as? String
```

## Technical Considerations

### Supabase Query

The existing CLI uses table `confirmed_dates` with columns: `id`, `user_id`, `title`, `date`, `confidence`, `source`, `notes`, `group_id`, `group_index`, `created_at`.

The iOS app query:

```swift
// SupabaseService.swift -- Widget data (limited to 4)
let widgetDates: [UpcomingDate] = try await supabase
    .from("confirmed_dates")
    .select("id, title, date, confidence")
    .gte("date", value: todayString)
    .order("date", ascending: true)
    .limit(4)
    .execute()
    .value

// Full list for ContentView (all future dates)
let allDates: [UpcomingDate] = try await supabase
    .from("confirmed_dates")
    .select("id, title, date, confidence")
    .gte("date", value: todayString)
    .order("date", ascending: true)
    .execute()
    .value
```

### Research Insights (Query)

**Performance (Performance Oracle -- P0 Critical):**
- Without `LIMIT`, every app launch and background fetch transfers ALL future rows. If a user accumulates 500 dates, every fetch decodes 500 objects to discard 496.
- Use `.limit(4)` for the widget data path. Use the unlimited query only for the full list view.
- Background fetch should ALWAYS use `.limit(4)` since its sole purpose is feeding the widget.

**Supabase Swift SDK (Context7):**
```swift
// Correct initialization pattern from official docs:
import Supabase

let supabase = SupabaseClient(
    supabaseURL: URL(string: supabaseURL)!,
    supabaseKey: supabaseAnonKey
)

// Auth sign-in (PKCE flow is default in Swift SDK):
let session = try await supabase.auth.signIn(
    email: "user@example.com",
    password: "securePassword123"
)
```

### Authentication

The `confirmed_dates` table uses RLS with `user_id`. The app requires email/password login via Supabase Auth. The auth flow:

1. On launch, check for existing Supabase session
2. If no session, show `LoginView` (email + password fields, sign-in button)
3. On successful auth, navigate to `ContentView` (date list)
4. Persist session via Keychain (configure Supabase SDK)
5. Supabase queries will use the authenticated user's session for RLS
6. On auth error during fetch (401/403), redirect back to `LoginView`

### Research Insights (Auth)

**Security (Security Sentinel -- MEDIUM severity):**
- The Supabase Swift SDK stores auth tokens in UserDefaults by default, not Keychain. Configure the SDK to use Keychain storage for auth tokens.
- Add a sign-out mechanism: call `supabase.auth.signOut()`, clear shared UserDefaults `"upcomingDates"`, and reload widget timelines.
- Map Supabase auth errors to generic user-facing messages: "Invalid email or password" for credential failures, "Unable to connect. Please try again." for network errors. Never display raw error payloads.
- Implement client-side exponential backoff after failed login attempts (1s, 2s, 4s delays). After 5 consecutive failures, temporarily disable sign-in button with cooldown.

**Architecture (Architecture Strategist):**
- Background refresh must handle expired auth tokens gracefully. If token refresh fails, complete the task without corrupting cached data -- the user will re-authenticate next time they open the app.
- The plan should not clear the user's session on background auth failure; just skip the refresh.

### Widget Configuration

- **Size**: `.systemMedium` only (`.supportedFamilies([.systemMedium])`)
- **Kind**: `"GoldfishWidget"`
- **Display name**: "Upcoming Dates"
- **Description**: "Shows your next upcoming confirmed dates"

### Widget Timeline Strategy

```swift
// In Provider.getTimeline():
// 1. Read [UpcomingDate] from shared UserDefaults
// 2. Create entries for today AND midnight boundaries for label accuracy
// 3. Schedule next data refresh for tomorrow at 9am

let dates = loadUpcomingDates()
var entries: [UpcomingEntry] = []

// Entry for right now
entries.append(UpcomingEntry(date: Date(), upcomingDates: dates))

// Entry at midnight (so "days remaining" labels update correctly)
if let midnight = Calendar.current.nextDate(
    after: Date(),
    matching: DateComponents(hour: 0, minute: 0),
    matchingPolicy: .nextTime
) {
    entries.append(UpcomingEntry(date: midnight, upcomingDates: dates))
}

// Safe fallback instead of force-unwrap
let tomorrow9am = Calendar.current.nextDate(
    after: Date(),
    matching: DateComponents(hour: 9),
    matchingPolicy: .nextTime
) ?? Calendar.current.date(byAdding: .day, value: 1, to: Date())!

let timeline = Timeline(entries: entries, policy: .after(tomorrow9am))
```

### Research Insights (Widget Timeline)

**Performance (Performance Oracle):**
- Daily refresh at 9am is well within WidgetKit's budget (max 40-70 refreshes/day in production).
- Add a midnight entry so relative "days remaining" labels stay accurate without needing a network fetch at midnight -- entries are pre-computed.

**WidgetKit Best Practices (Web Research):**
- With `.after(Date)` policy, WidgetKit starts the next refresh session after the specified date, but the system decides the exact time.
- Avoid timeline exhaustion: never attempt refresh intervals under 5 minutes.
- iOS 26 introduces glass presentation for widgets; the `.containerBackground(.fill.tertiary, for: .widget)` pattern in the existing boilerplate is compatible.

**Architecture (Architecture Strategist -- Critical):**
- Force-unwraps in widget timeline code cause blank widgets on crash. Always use safe fallbacks.

### Widget Relevance

```swift
func relevances() async -> WidgetRelevances<Void> {
    guard let nextDate = loadUpcomingDates().first,
          let parsed = nextDate.parsedDate else {
        return WidgetRelevances([])
    }
    let daysUntil = Calendar.current.dateComponents([.day], from: Date(), to: parsed).day ?? 30
    let score = Float(max(0, 100 - daysUntil)) / 100.0
    return WidgetRelevances([WidgetRelevance(relevance: score)])
}
```

### Background App Refresh

**CRITICAL: Register in `goldfishApp.init()`, NOT `.onAppear`.**

The system can wake the app for a background task before any view appears. Registering in `.onAppear` creates a race condition where the task handler isn't registered when the system tries to invoke it.

```swift
// goldfishApp.swift
@main
struct goldfishApp: App {
    init() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: "com.dbyassmith.goldfish.refresh",
            using: nil
        ) { task in
            handleAppRefresh(task: task as! BGAppRefreshTask)
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView() // handles auth routing
                .onAppear { scheduleAppRefresh() }
        }
    }
}

func handleAppRefresh(task: BGAppRefreshTask) {
    // REQUIRED: Set expiration handler to avoid iOS throttling future requests
    task.expirationHandler = {
        task.setTaskCompleted(success: false)
    }

    Task {
        do {
            let dates = try await SupabaseService.shared.fetchWidgetDates() // uses .limit(4)
            SharedDefaults.writeUpcomingDates(dates)
            WidgetCenter.shared.reloadTimelines(ofKind: "GoldfishWidget")
            task.setTaskCompleted(success: true)
        } catch {
            // Don't clear cached data on failure; widget shows stale data
            task.setTaskCompleted(success: false)
        }
        scheduleAppRefresh() // Schedule next refresh
    }
}
```

Required Info.plist entry:
```xml
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
    <string>com.dbyassmith.goldfish.refresh</string>
</array>
```

And enable "Background fetch" in the app's Signing & Capabilities.

### Research Insights (Background Refresh)

**Architecture (Architecture Strategist -- Critical Fix):**
- `BGTaskScheduler.register` MUST be called before the app finishes launching. Moving to `init()` is mandatory.
- Every `BGAppRefreshTask` must set an `expirationHandler`. Without it, the system throttles future background task requests.

**BGTaskScheduler Best Practices (Web Research):**
- iOS provides no guarantee about when (or if) a background refresh will execute. Frequently used apps get more frequent scheduling.
- The widget's own 9am timeline refresh is the reliable fallback; background fetch is best-effort.
- Do not overuse background tasks -- Apple throttles based on actual app usage patterns.

**SwiftUI Integration (Web Research):**
- SwiftUI's `.backgroundTask(.appRefresh("identifier"))` modifier is an alternative to `BGTaskScheduler` for simpler cases, available iOS 16+.

## Acceptance Criteria

### Auth

- [x] On launch, check for existing Supabase session
- [x] If no session, show `LoginView` with email and password fields
- [x] Sign in via `supabase.auth.signIn(email:password:)`
- [x] On success, transition to `ContentView`
- [x] Show generic error message on auth failure ("Invalid email or password" / "Unable to connect")
- [x] Session persists across app launches via Keychain
- [x] Sign-out button in app that clears session, UserDefaults data, and reloads widget
- [ ] On auth error during data fetch (401/403), redirect to `LoginView`

### App

- [x] On launch, fetch all future confirmed dates from Supabase `confirmed_dates` table
- [x] Write the next 4 (sorted by date ascending, `.limit(4)` query) to shared UserDefaults as JSON
- [x] Call `WidgetCenter.shared.reloadTimelines(ofKind: "GoldfishWidget")` after writing
- [x] Display the full list of upcoming dates in a clean SwiftUI `List`
- [x] Each row shows title and formatted date
- [x] Handle empty state (no upcoming dates)
- [x] Handle network errors gracefully (show last cached data or empty state)

### Widget

- [x] Medium-size widget with "UPCOMING" header in small gray caps
- [x] 4 rows: event title on left, days remaining on right
- [x] Days formatted as "47 days", "1 day", or "Today"
- [x] Clean, minimal, stock iOS aesthetic (system font, standard spacing)
- [x] Placeholder/snapshot shows sample data
- [x] Timeline includes entries at current time AND midnight for label accuracy
- [x] Timeline refreshes daily around 9am
- [ ] Widget relevance reflects proximity of next event
- [x] No force-unwraps -- use safe fallbacks throughout

### Background Refresh

- [x] Background App Refresh enabled in capabilities
- [x] `BGTaskScheduler` registered in `goldfishApp.init()` (NOT `.onAppear`)
- [x] `expirationHandler` set on every background task
- [x] On background fetch: pull from Supabase (`.limit(4)`), update UserDefaults, reload widget timelines
- [x] Schedule next background refresh after completion
- [x] Fail gracefully on auth expiry without clearing cached data

### Infrastructure

- [x] Supabase Swift SDK added via SPM
- [x] Shared `UpcomingDate` model accessible to both targets (with `parsedDate` computed property)
- [ ] Supabase config (URL, anon key) stored in `Secrets.xcconfig` excluded from git
- [x] App Group `group.com.dbyassmith.goldfish` used consistently (already in entitlements)
- [x] `./build.sh` compiles without errors after all changes

## Files to Create/Modify

### New Files

| File | Target(s) | Purpose |
|------|-----------|---------|
| `ios/goldfish/Shared/UpcomingDate.swift` | goldfish, GoldfishWidget | Shared Codable data model with `parsedDate` |
| `ios/goldfish/Shared/SharedDefaults.swift` | goldfish, GoldfishWidget | UserDefaults read/write helpers |
| `ios/goldfish/goldfish/SupabaseService.swift` | goldfish | Supabase client + fetch logic |
| `ios/goldfish/goldfish/LoginView.swift` | goldfish | Email/password login screen |
| `ios/goldfish/Secrets.xcconfig` | goldfish | Supabase URL and anon key (gitignored) |

### Modified Files

| File | Changes |
|------|---------|
| `ios/goldfish/goldfish/ContentView.swift` | Replace boilerplate with date list UI + Supabase fetch + sign-out button |
| `ios/goldfish/goldfish/goldfishApp.swift` | BGTaskScheduler in `init()`, auth state routing (LoginView vs ContentView) |
| `ios/goldfish/GoldfishWidget/GoldfishWidget.swift` | Replace boilerplate with upcoming dates widget UI + timeline with midnight entries |
| `ios/goldfish/GoldfishWidget/GoldfishWidgetBundle.swift` | Keep GoldfishWidget, remove unused GoldfishWidgetControl/LiveActivity |
| `ios/goldfish/goldfish.xcodeproj/project.pbxproj` | SPM dependency, shared file memberships, background modes, xcconfig |
| `ios/goldfish/goldfish/Info.plist` (or target settings) | BGTaskSchedulerPermittedIdentifiers, Supabase config vars |
| `.gitignore` | Add `Secrets.xcconfig` |

## Edge Cases

| Scenario | Handling |
|----------|----------|
| No upcoming dates | Widget shows "No upcoming dates" message; app shows empty state |
| Fewer than 4 dates | Widget shows only available rows, remaining space blank |
| Date is today | Display "Today" instead of "0 days" |
| Date is tomorrow | Display "1 day" (singular) |
| Network failure on launch | Show cached data from UserDefaults if available |
| App never opened (widget added first) | Widget shows placeholder; UserDefaults empty = "No upcoming dates" |
| Background refresh fails | Silently fail; widget continues showing stale data until next refresh |
| Date passes while widget is displayed | Midnight timeline entry drops it; 9am refresh confirms |
| Auth token expired in background | Skip refresh, don't clear cached data, wait for user to open app |
| Malformed JSON in UserDefaults | Widget gracefully falls back to empty state (no force decoding) |
| Model changes in future version | Use optional fields / default values for Codable resilience |

## Success Metrics

- Widget displays correct upcoming dates matching Supabase data
- Widget refreshes daily without manual app interaction (via background fetch)
- "Days remaining" labels are accurate across day boundaries (midnight entries)
- `./build.sh` passes cleanly

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| User forgets credentials | Standard email/password flow; no recovery in MVP (add "forgot password" later) |
| Supabase Swift SDK version compatibility | Pin to latest stable release |
| Background fetch not guaranteed by iOS | Widget refreshes on its own timeline at 9am; app foreground fetch is primary |
| Widget timeline stale data | 9am + midnight refresh + app foreground fetch keeps data accurate |
| Auth token extracted from device backup | Use Keychain storage (not UserDefaults) for auth tokens |
| Supabase credentials in source control | `.xcconfig` file excluded via `.gitignore` |
| Widget crash from force-unwrap | No force-unwraps in widget code; all optional chaining with fallbacks |

## Security Considerations

Based on Security Sentinel review (2 HIGH, 3 MEDIUM, 2 LOW findings):

| Priority | Finding | Remediation |
|----------|---------|-------------|
| **Before implementation** | Hardcoded Supabase credentials (HIGH) | Use `Secrets.xcconfig` excluded from git |
| **During implementation** | Auth tokens in UserDefaults (MEDIUM) | Configure Supabase SDK for Keychain storage |
| **During implementation** | No sign-out mechanism (MEDIUM) | Add sign-out that clears session + cached data |
| **During implementation** | Verbose error messages (LOW) | Map to generic strings in UI |
| **During implementation** | No client-side rate limiting (MEDIUM) | Exponential backoff on login failures |
| **Post-MVP** | No certificate pinning (LOW) | Acceptable for personal app |

## Sources & References

- Existing Supabase integration: `cli/src/lib/supabase.ts`
- Supabase table schema: `cli/src/commands/date.ts:70` (table: `confirmed_dates`)
- App Group entitlements: `ios/goldfish/goldfish/goldfish.entitlements`, `ios/goldfish/GoldfishWidgetExtension.entitlements`
- Build script: `ios/goldfish/build.sh`
- Institutional learning: `docs/solutions/integration-issues/supabase-cli-date-management.md`
- [Supabase Swift SDK docs](https://supabase.com/docs/reference/swift/introduction)
- [Supabase iOS/SwiftUI quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/ios-swiftui)
- [BGTaskScheduler documentation](https://developer.apple.com/documentation/backgroundtasks/bgtaskscheduler)
- [Choosing Background Strategies](https://developer.apple.com/documentation/backgroundtasks/choosing-background-strategies-for-your-app)
- [Background tasks in SwiftUI](https://swiftwithmajid.com/2022/07/06/background-tasks-in-swiftui/)
- [Widget refresh strategies](https://swiftsenpai.com/development/refreshing-widget/)
- [WidgetKit in iOS 26](https://dev.to/arshtechpro/wwdc-2025-widgetkit-in-ios-26-a-complete-guide-to-modern-widget-development-1cjp)
- [App Group data sharing](https://medium.com/@B4k3R/setting-up-your-appgroup-to-share-data-between-app-extensions-in-ios-43c7c642c4c7)
